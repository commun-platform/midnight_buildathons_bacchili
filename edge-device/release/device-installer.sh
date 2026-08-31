#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly NODE_MIN_VERSION="22.15.0"
readonly NODE_INSTALL_VERSION="22.15.0"

readonly DEFAULT_SERVICE_NAME="measurement-edge-agent"
readonly LEGACY_SERVICE_NAME="measurement-proof-agent"
SERVICE_NAME="${DEFAULT_SERVICE_NAME}"
SERVICE_USER=""
INGEST_URL=""
START_SERVICE=1
INSTALL_NODE=1
RUN_EDGE_TESTS=1
INSTALL_FORENSICS=1
DRY_RUN=0
ROLLBACK_ONLY=0
TMP_DIR=""
USER_HOME=""
USER_GROUP=""
RUNTIME_PATH=""
NODE_BIN=""
NPM_BIN=""
DEVICE_HOME=""
CONFIG_DIR=""
ENV_FILE=""
RELEASES_DIR=""
INSTALLED_RELEASE=""
CURRENT_LINK=""
PREVIOUS_LINK=""

log() {
  printf '[device-installer] %s\n' "$*"
}

warn() {
  printf '[device-installer] WARNING: %s\n' "$*" >&2
}

die() {
  printf '[device-installer] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./device-installer.sh [options]

Installs only the device runtime: the Edge temperature collector and the
operational device-wallet client. It never installs Compact, compiles
contracts, generates proving keys, runs a proof server, or deploys.

Options:
  --user USER              Run the systemd service as USER (default: repo owner)
  --service-name NAME      systemd unit name (default: measurement-edge-agent)
  --ingest-url URL         Set the Worker base URL for ingestion, authentication, and proving
  --no-start               Enable the unit without starting it
  --skip-node-install      Require an existing Node.js >= 22.15.0
  --skip-edge-tests        Skip the small device-only boundary/unit tests
  --skip-forensics         Do not install persistent journal/health snapshots
  --rollback               Swap current/previous releases and restart the service
  --dry-run                Print privileged/install actions without changing files
  -h, --help               Show this help

Before changing Device configuration, releases, keys, or services, the installer
checks every command required by installation, systemd activation, health checks,
and the enabled persistent-forensics runtime. Missing OS packages are installed
first on supported Debian-family systems; the complete check then runs again.

The installer moves that configuration, versioned releases, and wallet state below
~/.midnight/midnight-cloudflare-demo/. It preserves a complete existing P-256 Device
Identity or creates one when none exists. Register only enrollment.json from a
development host. Wallet recovery material and Device private keys never enter env files.
EOF
}

print_command() {
  printf '[device-installer] +'
  printf ' %q' "$@"
  printf '\n'
}

run() {
  print_command "$@"
  if (( ! DRY_RUN )); then
    "$@"
  fi
}

run_root() {
  if (( EUID == 0 )); then
    run "$@"
  else
    command -v sudo >/dev/null 2>&1 || die "sudo is required for system installation"
    run sudo "$@"
  fi
}

run_user() {
  local current_user
  current_user="$(id -un)"
  if [[ "${current_user}" == "${SERVICE_USER}" ]]; then
    run env HOME="${USER_HOME}" PATH="${RUNTIME_PATH}" "$@"
  elif (( EUID == 0 )); then
    command -v runuser >/dev/null 2>&1 || die "runuser is required to execute as ${SERVICE_USER}"
    run runuser -u "${SERVICE_USER}" -- env HOME="${USER_HOME}" PATH="${RUNTIME_PATH}" "$@"
  else
    command -v sudo >/dev/null 2>&1 || die "sudo is required to execute as ${SERVICE_USER}"
    run sudo -u "${SERVICE_USER}" env HOME="${USER_HOME}" PATH="${RUNTIME_PATH}" "$@"
  fi
}

cleanup() {
  if [[ -n "${TMP_DIR}" && -d "${TMP_DIR}" ]]; then
    rm -rf -- "${TMP_DIR}"
  fi
}
trap cleanup EXIT

version_at_least() {
  local actual="${1#v}"
  local required="${2#v}"
  [[ "$(printf '%s\n%s\n' "${required}" "${actual}" | sort -V | head -n 1)" == "${required}" ]]
}

require_commands() {
  local phase="$1"
  shift
  local command_name missing=()
  for command_name in "$@"; do
    if ! command -v "${command_name}" >/dev/null 2>&1; then
      missing+=("${command_name}")
    fi
  done
  if (( ${#missing[@]} > 0 )); then
    local missing_list
    missing_list="$(IFS=,; printf '%s' "${missing[*]}")"
    die "${phase} is missing required commands: ${missing_list}"
  fi
}

preflight_bootstrap() {
  require_commands "Installer bootstrap" \
    bash cut dirname getent id mktemp pwd stat
  if (( EUID != 0 )); then
    require_commands "Privilege escalation" sudo
  fi
}

require_sudo_commands() {
  (( EUID != 0 )) || return 0
  local command_name command_path denied=()
  for command_name in "$@"; do
    if [[ "${command_name}" == /* ]]; then
      command_path="${command_name}"
    else
      command_path="$(command -v "${command_name}" 2>/dev/null || true)"
    fi
    [[ -n "${command_path}" ]] || {
      denied+=("${command_name}")
      continue
    }
    if sudo -n -l "${command_path}" >/dev/null 2>&1; then
      continue
    fi
    if [[ -t 0 ]] && sudo -l "${command_path}" >/dev/null; then
      continue
    fi
    denied+=("${command_path}")
  done
  if (( ${#denied[@]} > 0 )); then
    local denied_list
    denied_list="$(IFS=,; printf '%s' "${denied[*]}")"
    die "sudo does not authorize required commands: ${denied_list}"
  fi
}

preflight_privileged_commands() {
  local required=(install journalctl systemctl)
  if (( INSTALL_FORENSICS )); then
    required+=("${CURRENT_LINK}/edge-device/diagnostics/pi-forensics/install.sh")
  fi
  require_sudo_commands "${required[@]}"
  if (( EUID != 0 )); then
    log "Privilege preflight passed (${#required[@]} commands)"
  fi
}

preflight_system_commands() {
  local required=(
    awk basename bash cat chmod chown cmp curl cut date df dirname env getent grep
    head id install ip journalctl ln mkdir mktemp mv ping ps readlink rm sed
    sha256sum sleep sort stat systemctl systemd-analyze tar tr uname xz
  )
  if (( EUID == 0 )) && [[ "$(id -un)" != "${SERVICE_USER}" ]]; then
    required+=(runuser)
  elif (( EUID != 0 )); then
    required+=(sudo)
  fi
  require_commands "Device installation preflight" "${required[@]}"
  log "System command preflight passed (${#required[@]} commands)"
}

preflight_node_commands() {
  [[ -x "${NODE_BIN}" ]] || die "Resolved Node.js executable is unavailable: ${NODE_BIN}"
  [[ -x "${NPM_BIN}" ]] || die "Resolved npm executable is unavailable: ${NPM_BIN}"
  local node_version npm_version
  node_version="$(${NODE_BIN} --version 2>/dev/null || true)"
  npm_version="$(${NPM_BIN} --version 2>/dev/null || true)"
  version_at_least "${node_version}" "${NODE_MIN_VERSION}" \
    || die "Node.js >= ${NODE_MIN_VERSION} is required; found ${node_version:-unknown}"
  [[ "${npm_version}" =~ ^[0-9]+([.][0-9]+){1,2}([+-].*)?$ ]] \
    || die "npm did not return a valid version: ${npm_version:-unknown}"
  log "Node runtime preflight passed (Node ${node_version}, npm ${npm_version})"
}

parse_args() {
  while (( $# > 0 )); do
    case "$1" in
      --user)
        (( $# >= 2 )) || die "--user requires a value"
        SERVICE_USER="$2"
        shift 2
        ;;
      --service-name)
        (( $# >= 2 )) || die "--service-name requires a value"
        SERVICE_NAME="$2"
        shift 2
        ;;
      --ingest-url)
        (( $# >= 2 )) || die "--ingest-url requires a value"
        INGEST_URL="$2"
        shift 2
        ;;
      --no-start)
        START_SERVICE=0
        shift
        ;;
      --skip-node-install)
        INSTALL_NODE=0
        shift
        ;;
      --skip-edge-tests)
        RUN_EDGE_TESTS=0
        shift
        ;;
      --skip-forensics)
        INSTALL_FORENSICS=0
        shift
        ;;
      --rollback)
        ROLLBACK_ONLY=1
        shift
        ;;
      --dry-run)
        DRY_RUN=1
        shift
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      --proof-server-url|--skip-compact-install|--skip-verify)
        die "$1 belonged to the old mixed installer. Use development-server commands for proving/deployment."
        ;;
      *)
        die "Unknown option: $1"
        ;;
    esac
  done
}

resolve_service_identity() {
  if [[ -z "${SERVICE_USER}" ]]; then
    local repo_owner
    repo_owner="$(stat -c '%U' "${SCRIPT_DIR}")"
    if [[ "${repo_owner}" != "root" && "${repo_owner}" != "UNKNOWN" ]]; then
      SERVICE_USER="${repo_owner}"
    elif [[ -n "${SUDO_USER:-}" && "${SUDO_USER}" != "root" ]]; then
      SERVICE_USER="${SUDO_USER}"
    else
      SERVICE_USER="$(id -un)"
    fi
  fi

  [[ "${SERVICE_USER}" != "root" ]] || die "Refusing to run the device runtime as root; pass --user USER"
  id "${SERVICE_USER}" >/dev/null 2>&1 || die "Unknown service user: ${SERVICE_USER}"
  if (( EUID != 0 )) && [[ "$(id -un)" != "${SERVICE_USER}" ]]; then
    die "Run as ${SERVICE_USER}, or invoke the installer with sudo"
  fi
  [[ "${SERVICE_NAME}" =~ ^[A-Za-z0-9][A-Za-z0-9_.@-]*$ ]] || die "Invalid systemd service name"
  USER_GROUP="$(id -gn "${SERVICE_USER}")"
  USER_HOME="$(getent passwd "${SERVICE_USER}" | cut -d: -f6)"
  [[ -n "${USER_HOME}" && -d "${USER_HOME}" ]] || die "Home directory not found for ${SERVICE_USER}"
}

install_system_packages() {
  local command_name
  local -A command_packages=(
    [awk]=gawk
    [basename]=coreutils
    [cat]=coreutils
    [chmod]=coreutils
    [chown]=coreutils
    [cmp]=diffutils
    [curl]=curl
    [cut]=coreutils
    [date]=coreutils
    [df]=coreutils
    [dirname]=coreutils
    [env]=coreutils
    [getent]=libc-bin
    [grep]=grep
    [head]=coreutils
    [id]=coreutils
    [install]=coreutils
    [ip]=iproute2
    [journalctl]=systemd
    [ln]=coreutils
    [mkdir]=coreutils
    [mktemp]=coreutils
    [mv]=coreutils
    [ping]=iputils-ping
    [ps]=procps
    [readlink]=coreutils
    [rm]=coreutils
    [sed]=sed
    [sha256sum]=coreutils
    [sleep]=coreutils
    [sort]=coreutils
    [stat]=coreutils
    [systemctl]=systemd
    [systemd-analyze]=systemd
    [tar]=tar
    [tr]=coreutils
    [uname]=coreutils
    [xz]=xz-utils
  )
  local -A selected_packages=()
  for command_name in "${!command_packages[@]}"; do
    if ! command -v "${command_name}" >/dev/null 2>&1; then
      selected_packages["${command_packages[${command_name}]}"]=1
    fi
  done
  if (( EUID == 0 )) && [[ "$(id -un)" != "${SERVICE_USER}" ]] \
    && ! command -v runuser >/dev/null 2>&1; then
    selected_packages[util-linux]=1
  fi
  if ! command -v curl >/dev/null 2>&1 \
    || [[ ! -s /etc/ssl/certs/ca-certificates.crt ]]; then
    selected_packages[ca-certificates]=1
  fi
  if (( ${#selected_packages[@]} == 0 )); then
    return
  fi
  local required=("${!selected_packages[@]}")
  command -v apt-get >/dev/null 2>&1 || die "Missing prerequisites and apt-get is unavailable"
  require_sudo_commands apt-get
  log "Installing only missing operating-system prerequisites: ${required[*]}"
  run_root apt-get update
  run_root apt-get install -y --no-install-recommends "${required[@]}"
}

node_architecture() {
  case "$(uname -m)" in
    aarch64|arm64) printf 'arm64\n' ;;
    x86_64|amd64) printf 'x64\n' ;;
    *) die "Unsupported architecture: $(uname -m). Use 64-bit ARM64 or x86_64 Debian-family Linux." ;;
  esac
}

discover_node() {
  local candidate version
  candidate="$(command -v node 2>/dev/null || true)"
  if [[ -n "${candidate}" ]]; then
    version="$(${candidate} --version 2>/dev/null || true)"
    if version_at_least "${version}" "${NODE_MIN_VERSION}"; then
      NODE_BIN="$(readlink -f "${candidate}")"
      NPM_BIN="$(command -v npm 2>/dev/null || true)"
      [[ -n "${NPM_BIN}" ]] || die "Node.js is present but npm is missing"
      return 0
    fi
  fi
  return 1
}

install_node() {
  if discover_node; then
    log "Using $(${NODE_BIN} --version) from ${NODE_BIN}"
    return
  fi
  (( INSTALL_NODE )) || die "Node.js >= ${NODE_MIN_VERSION} is required"

  require_sudo_commands mkdir tar ln

  local architecture archive base_url install_dir checksum_file
  architecture="$(node_architecture)"
  archive="node-v${NODE_INSTALL_VERSION}-linux-${architecture}.tar.xz"
  base_url="https://nodejs.org/download/release/v${NODE_INSTALL_VERSION}"
  install_dir="/opt/node-v${NODE_INSTALL_VERSION}-linux-${architecture}"
  checksum_file="${TMP_DIR}/node-checksum.txt"

  log "Installing verified Node.js v${NODE_INSTALL_VERSION} for ${architecture}"
  run curl --proto '=https' --tlsv1.2 -fsSLo "${TMP_DIR}/${archive}" "${base_url}/${archive}"
  run curl --proto '=https' --tlsv1.2 -fsSLo "${TMP_DIR}/SHASUMS256.txt" "${base_url}/SHASUMS256.txt"
  if (( ! DRY_RUN )); then
    grep " ${archive}\$" "${TMP_DIR}/SHASUMS256.txt" > "${checksum_file}" || die "Node checksum is missing"
    (cd "${TMP_DIR}" && sha256sum -c "$(basename "${checksum_file}")")
  fi
  run_root mkdir -p /opt
  run_root tar -xJf "${TMP_DIR}/${archive}" -C /opt
  for binary in node npm npx corepack; do
    run_root ln -sfn "${install_dir}/bin/${binary}" "/usr/local/bin/${binary}"
  done
  NODE_BIN="${install_dir}/bin/node"
  NPM_BIN="${install_dir}/bin/npm"
}

env_value() {
  local key="$1"
  local file="$2"
  local line
  [[ -f "${file}" ]] || return 0
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" == "${key}="* ]]; then
      printf '%s\n' "${line#*=}"
      return 0
    fi
  done < "${file}"
}

set_env_value() {
  local key="$1"
  local value="$2"
  local file="$3"
  local temporary line found=0
  [[ "${value}" != *$'\n'* && "${value}" != *$'\r'* ]] || die "Environment values must not contain newlines"
  temporary="$(mktemp "${file}.tmp.XXXXXX")"
  while IFS= read -r line || [[ -n "${line}" ]]; do
    if [[ "${line}" == "${key}="* ]]; then
      printf '%s=%s\n' "${key}" "${value}" >> "${temporary}"
      found=1
    else
      printf '%s\n' "${line}" >> "${temporary}"
    fi
  done < "${file}"
  if (( ! found )); then
    printf '\n%s=%s\n' "${key}" "${value}" >> "${temporary}"
  fi
  chmod 0600 "${temporary}"
  chown "${SERVICE_USER}:${USER_GROUP}" "${temporary}"
  mv -f -- "${temporary}" "${file}"
}

configure_environment() {
  local configured_url remove_staged_env=0

  if [[ -n "${INGEST_URL}" ]]; then
    [[ "${INGEST_URL}" == http://* || "${INGEST_URL}" == https://* ]] || die "Ingest URL must use HTTP(S)"
  fi
  if (( DRY_RUN )); then
    log "Would create or preserve ${ENV_FILE} with mode 0600"
    return
  fi
  if [[ -f "${ENV_FILE}" && -f "${SCRIPT_DIR}/.env.device" ]]; then
    if cmp -s "${ENV_FILE}" "${SCRIPT_DIR}/.env.device"; then
      remove_staged_env=1
    else
      die "${ENV_FILE} already exists and differs from staged .env.device; update the installed config explicitly"
    fi
  elif [[ ! -f "${ENV_FILE}" ]]; then
    if [[ -f "${SCRIPT_DIR}/.env.device" ]]; then
      log "Installing staged device settings at ${ENV_FILE}"
      run_user install -m 0600 "${SCRIPT_DIR}/.env.device" "${ENV_FILE}"
      remove_staged_env=1
    elif [[ -f "${SCRIPT_DIR}/.env" ]]; then
      log "Migrating only device-safe settings from the legacy mixed .env file"
      run_user "${NODE_BIN}" "${SCRIPT_DIR}/scripts/migrate-device-env.mjs" \
        "${SCRIPT_DIR}/.env" "${ENV_FILE}"
    elif [[ -f "${SCRIPT_DIR}/.env.edge" ]]; then
      log "Migrating the previous Edge settings to ${ENV_FILE}"
      run_user "${NODE_BIN}" "${SCRIPT_DIR}/scripts/migrate-device-env.mjs" \
        "${SCRIPT_DIR}/.env.edge" "${ENV_FILE}"
    else
      run_user install -m 0600 "${SCRIPT_DIR}/.env.device.example" "${ENV_FILE}"
    fi
  fi
  chmod 0600 "${ENV_FILE}"
  chown "${SERVICE_USER}:${USER_GROUP}" "${ENV_FILE}"

  if [[ -n "${INGEST_URL}" ]]; then
    set_env_value CLOUDFLARE_INGEST_URL "${INGEST_URL}" "${ENV_FILE}"
    set_env_value MIDNIGHT_PROOF_SERVER_URL "${INGEST_URL}" "${ENV_FILE}"
  fi
  configured_url="$(env_value CLOUDFLARE_INGEST_URL "${ENV_FILE}")"
  [[ -n "${configured_url}" && "${configured_url}" != *'<your-subdomain>'* ]] \
    || die "Configure CLOUDFLARE_INGEST_URL in ${ENV_FILE} or pass --ingest-url"
  [[ "${configured_url}" == http://* || "${configured_url}" == https://* ]] \
    || die "CLOUDFLARE_INGEST_URL must use HTTP(S)"
  if (( remove_staged_env )); then
    log "Removing staged .env.device after installing the protected configuration"
    run_user rm -f "${SCRIPT_DIR}/.env.device"
  fi
}

prepare_device_home() {
  if (( DRY_RUN )); then
    log "Would prepare ${DEVICE_HOME} for runtime, configuration, and wallet state"
    return
  fi
  local wallet_home="${USER_HOME}/.midnight/midnight-cloudflare-demo/device-wallet"
  local auth_home="${USER_HOME}/.midnight/midnight-cloudflare-demo/device-auth"
  log "Preparing the consolidated device home at ${DEVICE_HOME}"
  run_user mkdir -p "${CONFIG_DIR}" "${RELEASES_DIR}" "${wallet_home}" "${auth_home}"
  run_user chmod 0700 "${USER_HOME}/.midnight" \
    "${DEVICE_HOME}" \
    "${CONFIG_DIR}" \
    "${RELEASES_DIR}" \
    "${wallet_home}" \
    "${auth_home}"
}

ensure_device_identity() {
  local auth_home
  auth_home="$(env_value DEVICE_AUTH_HOME "${ENV_FILE}")"
  auth_home="${auth_home:-${DEVICE_HOME}/device-auth}"
  [[ "${auth_home}" == "${DEVICE_HOME}"/* ]] \
    || die "DEVICE_AUTH_HOME must remain below ${DEVICE_HOME}"
  local identity_file="${auth_home}/identity.json"
  local enrollment_file="${auth_home}/enrollment.json"
  local private_key_file="${auth_home}/device-private-key.pk8"
  local device_id project_id present=0

  device_id="$(env_value SENSOR_DEVICE_ID "${ENV_FILE}")"
  project_id="$(env_value SENSOR_PROJECT_ID "${ENV_FILE}")"
  [[ -n "${device_id}" ]] || die "SENSOR_DEVICE_ID is required in ${ENV_FILE}"
  [[ -n "${project_id}" ]] || die "SENSOR_PROJECT_ID is required in ${ENV_FILE}"

  for file in "${identity_file}" "${enrollment_file}" "${private_key_file}"; do
    [[ -e "${file}" ]] && present=$((present + 1))
  done
  if (( present > 0 && present < 3 )); then
    die "Device Identity under ${auth_home} is incomplete; do not rotate or repair it implicitly"
  fi
  if (( DRY_RUN )); then
    log "Would preserve a complete Device Identity or generate one under ${auth_home}"
    return
  fi
  if (( present == 3 )); then
    log "Preserving and validating the existing Device Identity"
    run_user chmod 0700 "${auth_home}"
    run_user chmod 0600 "${identity_file}" "${enrollment_file}" "${private_key_file}"
    run_user "${NPM_BIN}" --prefix "${CURRENT_LINK}" run device:auth:refresh-enrollment -- \
      --device-id "${device_id}" \
      --project-id "${project_id}" \
      --auth-home "${auth_home}"
    run_user "${NPM_BIN}" --prefix "${CURRENT_LINK}" run device:auth:show -- \
      --auth-home "${auth_home}"
    return
  fi

  log "Generating a new device-local P-256 Device Identity"
  run_user "${NPM_BIN}" --prefix "${CURRENT_LINK}" run device:auth:generate -- \
    --device-id "${device_id}" \
    --project-id "${project_id}" \
    --auth-home "${auth_home}" \
    --confirm-device-key-generation
  run_user chmod 0700 "${auth_home}"
  run_user chmod 0600 "${identity_file}" "${enrollment_file}" "${private_key_file}"
}

resolve_device_layout() {
  DEVICE_HOME="${USER_HOME}/.midnight/midnight-cloudflare-demo"
  CONFIG_DIR="${DEVICE_HOME}/config"
  ENV_FILE="${CONFIG_DIR}/device.env"
  RELEASES_DIR="${DEVICE_HOME}/releases"
  CURRENT_LINK="${DEVICE_HOME}/current"
  PREVIOUS_LINK="${DEVICE_HOME}/previous"
}

verify_device_artifacts() {
  local artifact_dir="${INSTALLED_RELEASE}/runtime/device-artifacts/sensor-registry"
  if [[ ! -f "${artifact_dir}/manifest.json" ]]; then
    warn "Device contract artifacts are not installed; collection will run, but device:submit remains unavailable"
    warn "Build the device release on the development server and transfer its runtime/device-artifacts directory"
    return
  fi
  log "Verifying development-built device contract artifacts"
  run_user "${NODE_BIN}" "${SCRIPT_DIR}/scripts/verify-device-artifacts.mjs" "${artifact_dir}"
}

verify_device_release() {
  [[ -f "${SCRIPT_DIR}/device-release-manifest.json" ]] \
    || die "Install from an operational device archive built with package_archive.sh"
  log "Verifying the operational-only device release"
  run_user "${NODE_BIN}" "${SCRIPT_DIR}/scripts/verify-device-release.mjs" "${SCRIPT_DIR}"
}

activate_release() {
  local release_path="$1"
  local old_release="" current_tmp previous_tmp
  [[ "${release_path}" == "${RELEASES_DIR}/"* ]] \
    || die "Release path escapes ${RELEASES_DIR}: ${release_path}"
  if (( ! DRY_RUN )) && [[ ! -f "${release_path}/device-release-manifest.json" ]]; then
    die "Installed release manifest is missing: ${release_path}"
  fi
  current_tmp="${CURRENT_LINK}.tmp-$$"
  previous_tmp="${PREVIOUS_LINK}.tmp-$$"

  if [[ -L "${CURRENT_LINK}" ]]; then
    old_release="$(readlink -f "${CURRENT_LINK}")"
    [[ "${old_release}" == "${RELEASES_DIR}/"* ]] \
      || die "Current release symlink escapes ${RELEASES_DIR}: ${old_release}"
  elif [[ -e "${CURRENT_LINK}" ]]; then
    die "Current runtime path is not a symlink: ${CURRENT_LINK}"
  fi
  if [[ -n "${old_release}" && "${old_release}" == "${release_path}" ]]; then
    log "Device release is already active: ${release_path}"
    return
  fi
  if (( DRY_RUN )); then
    log "Would activate ${release_path} through ${CURRENT_LINK}"
    [[ -z "${old_release}" ]] || log "Would preserve ${old_release} through ${PREVIOUS_LINK}"
    return
  fi

  run_user ln -s "${release_path}" "${current_tmp}"
  if [[ -n "${old_release}" ]]; then
    run_user ln -s "${old_release}" "${previous_tmp}"
    run_user mv -Tf "${previous_tmp}" "${PREVIOUS_LINK}"
  fi
  run_user mv -Tf "${current_tmp}" "${CURRENT_LINK}"
}

install_device_release() {
  local manifest="${SCRIPT_DIR}/device-release-manifest.json"
  local firmware_version manifest_hash release_id
  firmware_version="$("${NODE_BIN}" -e \
    'const fs=require("node:fs"); const value=JSON.parse(fs.readFileSync(process.argv[1], "utf8")); process.stdout.write(value.firmwareVersion);' \
    "${manifest}")"
  [[ "${firmware_version}" =~ ^[0-9A-Za-z][0-9A-Za-z._-]*$ ]] \
    || die "Invalid firmware version in device release manifest"
  manifest_hash="$(sha256sum "${manifest}" | cut -d' ' -f1)"
  release_id="${firmware_version}-${manifest_hash:0:12}"
  INSTALLED_RELEASE="${RELEASES_DIR}/${release_id}"

  log "Installing versioned runtime ${release_id}"
  if (( DRY_RUN )); then
    log "Would install ${SCRIPT_DIR} at ${INSTALLED_RELEASE}"
  else
    run_user "${NODE_BIN}" "${SCRIPT_DIR}/scripts/install-device-release.mjs" \
      "${SCRIPT_DIR}" "${INSTALLED_RELEASE}"
    run_user "${NODE_BIN}" "${INSTALLED_RELEASE}/scripts/verify-device-release.mjs" \
      "${INSTALLED_RELEASE}"
  fi
}

rollback_release() {
  local current_release previous_release current_tmp previous_tmp release_path
  [[ -L "${CURRENT_LINK}" ]] || die "No active device release exists at ${CURRENT_LINK}"
  [[ -L "${PREVIOUS_LINK}" ]] || die "No previous device release is available at ${PREVIOUS_LINK}"
  current_release="$(readlink -f "${CURRENT_LINK}")"
  previous_release="$(readlink -f "${PREVIOUS_LINK}")"
  [[ "${current_release}" != "${previous_release}" ]] \
    || die "Current and previous symlinks point to the same release"
  for release_path in "${current_release}" "${previous_release}"; do
    [[ "${release_path}" == "${RELEASES_DIR}/"* ]] \
      || die "Release symlink escapes ${RELEASES_DIR}: ${release_path}"
    [[ -f "${release_path}/device-release-manifest.json" ]] \
      || die "Installed release manifest is missing: ${release_path}"
  done
  if (( DRY_RUN )); then
    log "Would roll back from ${current_release} to ${previous_release}"
    return
  fi

  run_user "${NODE_BIN}" "${previous_release}/scripts/verify-device-release.mjs" "${previous_release}"
  current_tmp="${CURRENT_LINK}.tmp-$$"
  previous_tmp="${PREVIOUS_LINK}.tmp-$$"
  run_user ln -s "${previous_release}" "${current_tmp}"
  run_user ln -s "${current_release}" "${previous_tmp}"
  run_user mv -Tf "${previous_tmp}" "${PREVIOUS_LINK}"
  run_user mv -Tf "${current_tmp}" "${CURRENT_LINK}"
  run_root systemctl restart "${SERVICE_NAME}.service"
  verify_service
  log "Rolled back to ${previous_release}"
}

stop_existing_service() {
  if (( DRY_RUN )); then
    log "Would stop ${SERVICE_NAME}.service only if it is currently active"
    if [[ "${SERVICE_NAME}" == "${DEFAULT_SERVICE_NAME}" ]]; then
      log "Would disable the legacy ${LEGACY_SERVICE_NAME}.service if present"
    fi
    return
  fi
  if [[ "${SERVICE_NAME}" == "${DEFAULT_SERVICE_NAME}" ]] \
    && systemctl cat "${LEGACY_SERVICE_NAME}.service" >/dev/null 2>&1; then
    log "Disabling legacy ${LEGACY_SERVICE_NAME}.service"
    run_root systemctl disable --now "${LEGACY_SERVICE_NAME}.service"
  fi
  if run_root systemctl is-active --quiet "${SERVICE_NAME}.service"; then
    log "Stopping the existing device service before replacing dependencies"
    run_root systemctl stop "${SERVICE_NAME}.service"
  fi
}

install_device_project() {
  RUNTIME_PATH="$(dirname "${NODE_BIN}"):${USER_HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin"
  log "Installing only device collector and operational-wallet dependencies"
  run_user "${NPM_BIN}" --prefix "${INSTALLED_RELEASE}" ci \
    --workspace @midnight-demo/device-auth \
    --workspace @midnight-demo/edge-agent \
    --workspace @midnight-demo/device-wallet-agent \
    --include-workspace-root=false \
    --omit=dev \
    --no-audit \
    --no-fund \
    --cache "${USER_HOME}/.npm"
  if (( RUN_EDGE_TESTS )); then
    log "Running device-only boundary and unit tests"
    run_user "${NPM_BIN}" --prefix "${INSTALLED_RELEASE}" run test -w @midnight-demo/device-auth
    run_user "${NPM_BIN}" --prefix "${INSTALLED_RELEASE}" run test -w @midnight-demo/edge-agent
    run_user "${NPM_BIN}" --prefix "${INSTALLED_RELEASE}" run test -w @midnight-demo/device-wallet-agent
  fi
}

systemd_escape_value() {
  local value="$1"
  value="${value//\\/\\x5c}"
  value="${value// /\\x20}"
  value="${value//$'\t'/\\x09}"
  value="${value//\"/\\x22}"
  value="${value//%/%%}"
  printf '%s' "${value}"
}

install_systemd_service() {
  local unit_file="/etc/systemd/system/${SERVICE_NAME}.service"
  local staged_unit="${TMP_DIR}/${SERVICE_NAME}.service"
  local repo_path home_path path_value exec_path cli_path device_home_path
  repo_path="$(systemd_escape_value "${CURRENT_LINK}")"
  home_path="$(systemd_escape_value "${USER_HOME}")"
  path_value="$(systemd_escape_value "${RUNTIME_PATH}")"
  exec_path="$(systemd_escape_value "${NODE_BIN}")"
  cli_path="$(systemd_escape_value "${CURRENT_LINK}/edge-device/sensor-collector/src/cli.ts")"
  device_home_path="$(systemd_escape_value "${DEVICE_HOME}")"
  local env_path
  env_path="$(systemd_escape_value "${ENV_FILE}")"

  cat > "${staged_unit}" <<EOF
[Unit]
Description=Measurement authenticity Edge temperature collector
Documentation=file://${repo_path}/README.md
Wants=network-online.target
After=network-online.target
StartLimitIntervalSec=5min
StartLimitBurst=5

[Service]
Type=simple
User=${SERVICE_USER}
Group=${USER_GROUP}
WorkingDirectory=${repo_path}
Environment=HOME=${home_path}
Environment=PATH=${path_value}
Environment=MIDNIGHT_HOST_ROLE=device
EnvironmentFile=${env_path}
ExecStart=${exec_path} --import=tsx ${cli_path}
Restart=on-failure
RestartSec=10s
TimeoutStopSec=30s
StandardOutput=journal
StandardError=journal
SyslogIdentifier=measurement-edge-agent
MemoryHigh=192M
MemoryMax=256M
CPUQuota=50%
TasksMax=64
OOMPolicy=stop
UMask=0077
NoNewPrivileges=true
PrivateTmp=true
ProtectHome=read-only
ProtectSystem=full
ReadWritePaths=${device_home_path}
ProtectKernelTunables=true
ProtectKernelModules=true
ProtectControlGroups=true
RestrictSUIDSGID=true
LockPersonality=true
RestrictRealtime=true
CapabilityBoundingSet=

[Install]
WantedBy=multi-user.target
EOF

  if [[ -d "${CURRENT_LINK}/node_modules/tsx" ]] && command -v systemd-analyze >/dev/null 2>&1; then
    print_command systemd-analyze verify "${staged_unit}"
    systemd-analyze verify "${staged_unit}"
  elif (( ! DRY_RUN )); then
    die "tsx runtime loader is missing after device dependency installation"
  else
    log "Would verify the generated unit with systemd-analyze"
  fi
  log "Installing ${SERVICE_NAME}.service"
  run_root install -m 0644 "${staged_unit}" "${unit_file}"
  run_root systemctl daemon-reload
  run_root systemctl enable "${SERVICE_NAME}.service"
  if (( START_SERVICE )); then
    run_root systemctl restart "${SERVICE_NAME}.service"
  fi
}

install_persistent_forensics() {
  (( INSTALL_FORENSICS )) || return 0
  log "Enabling persistent journal and connectivity/resource snapshots"
  run_root "${CURRENT_LINK}/edge-device/diagnostics/pi-forensics/install.sh"
}

verify_service() {
  (( DRY_RUN || ! START_SERVICE )) && return
  local port health_url
  port="$(env_value AGENT_PORT "${ENV_FILE}")"
  port="${port:-8788}"
  health_url="http://127.0.0.1:${port}/health"
  for _ in {1..20}; do
    if curl -fsS --max-time 2 "${health_url}" >/dev/null 2>&1; then
      log "Device collector is healthy at ${health_url}"
      return
    fi
    sleep 1
  done
  run_root systemctl status "${SERVICE_NAME}.service" --no-pager || true
  run_root journalctl -u "${SERVICE_NAME}.service" -n 50 --no-pager || true
  die "Device collector did not become healthy"
}

main() {
  parse_args "$@"
  preflight_bootstrap
  resolve_service_identity
  resolve_device_layout
  if (( ! DRY_RUN )); then
    [[ -d /run/systemd/system ]] || die "systemd is not running as PID 1"
  fi

  if (( ROLLBACK_ONLY )); then
    discover_node || die "Node.js >= ${NODE_MIN_VERSION} is required to verify the previous release"
    RUNTIME_PATH="$(dirname "${NODE_BIN}"):${USER_HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin"
    preflight_system_commands
    require_sudo_commands systemctl
    preflight_node_commands
    rollback_release
    exit 0
  fi

  TMP_DIR="$(mktemp -d)"
  chmod 0755 "${TMP_DIR}"

  log "Role boundary: device collection/submission only; Compact/prover/deployment commands are disabled here"
  log "Release source: ${SCRIPT_DIR}"
  log "Device home: ${DEVICE_HOME}"
  log "Service user: ${SERVICE_USER}"
  install_system_packages
  preflight_system_commands
  preflight_privileged_commands
  install_node
  preflight_node_commands
  RUNTIME_PATH="$(dirname "${NODE_BIN}"):${USER_HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin"
  verify_device_release
  prepare_device_home
  configure_environment
  install_device_release
  verify_device_artifacts
  install_device_project
  stop_existing_service
  activate_release "${INSTALLED_RELEASE}"
  ensure_device_identity
  install_systemd_service
  install_persistent_forensics
  verify_service

  log "Device runtime installation complete"
  log "Runtime: ${CURRENT_LINK}"
  log "Config:  ${ENV_FILE}"
  log "Wallet:  ${DEVICE_HOME}/device-wallet"
  log "Identity: ${DEVICE_HOME}/device-auth"
  log "Enroll:   copy only ${DEVICE_HOME}/device-auth/enrollment.json to the development host"
  log "Configure after enrollment: cd ${CURRENT_LINK} && npm run device:configure"
  log "Rollback: ${CURRENT_LINK}/installer.sh --rollback"
  log "Status: sudo systemctl status ${SERVICE_NAME}"
  log "Logs:   sudo journalctl -u ${SERVICE_NAME} -f"
  log "Prior boot report: sudo pi-forensics-report -1"
}

main "$@"
