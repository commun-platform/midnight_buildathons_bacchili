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
TMP_DIR=""
USER_HOME=""
USER_GROUP=""
RUNTIME_PATH=""
NODE_BIN=""
NPM_BIN=""

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
  --ingest-url URL         Set the Worker URL ending in /api/v1/readings
  --no-start               Enable the unit without starting it
  --skip-node-install      Require an existing Node.js >= 22.15.0
  --skip-edge-tests        Skip the small device-only boundary/unit tests
  --skip-forensics         Do not install persistent journal/health snapshots
  --dry-run                Print privileged/install actions without changing files
  -h, --help               Show this help

Set INGEST_API_TOKEN in .env.device before running, or export it for this command.
Device-wallet recovery material is stored below ~/.midnight, never in this file.
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
  local required=(curl ca-certificates xz-utils coreutils tar systemd iproute2 iputils-ping iw)
  local missing=0
  for command_name in curl sha256sum tar xz systemctl ip ping; do
    if ! command -v "${command_name}" >/dev/null 2>&1; then
      missing=1
    fi
  done
  if (( ! missing )); then
    return
  fi
  command -v apt-get >/dev/null 2>&1 || die "Missing prerequisites and apt-get is unavailable"
  log "Installing device operating-system prerequisites"
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
  local env_file="${SCRIPT_DIR}/.env.device"
  local configured_url configured_token

  if [[ -n "${INGEST_URL}" ]]; then
    [[ "${INGEST_URL}" == http://* || "${INGEST_URL}" == https://* ]] || die "Ingest URL must use HTTP(S)"
    [[ "${INGEST_URL}" == */api/v1/readings* ]] || die "Ingest URL must target /api/v1/readings"
  fi
  if (( DRY_RUN )); then
    log "Would create or preserve ${env_file} with mode 0600"
    return
  fi
  if [[ ! -f "${env_file}" ]]; then
    if [[ -f "${SCRIPT_DIR}/.env" ]]; then
      log "Migrating only device-safe settings from the legacy mixed .env file"
      run_user "${NODE_BIN}" "${SCRIPT_DIR}/scripts/migrate-device-env.mjs" \
        "${SCRIPT_DIR}/.env" "${env_file}"
    elif [[ -f "${SCRIPT_DIR}/.env.edge" ]]; then
      log "Migrating the previous Edge settings to .env.device"
      run_user "${NODE_BIN}" "${SCRIPT_DIR}/scripts/migrate-device-env.mjs" \
        "${SCRIPT_DIR}/.env.edge" "${env_file}"
    else
      cp "${SCRIPT_DIR}/.env.device.example" "${env_file}"
    fi
  fi
  chmod 0600 "${env_file}"
  chown "${SERVICE_USER}:${USER_GROUP}" "${env_file}"

  if [[ -n "${INGEST_URL}" ]]; then
    set_env_value CLOUDFLARE_INGEST_URL "${INGEST_URL}" "${env_file}"
  fi
  if [[ -n "${INGEST_API_TOKEN:-}" && "${INGEST_API_TOKEN}" != replace-with-* ]]; then
    set_env_value INGEST_API_TOKEN "${INGEST_API_TOKEN}" "${env_file}"
  fi

  configured_url="$(env_value CLOUDFLARE_INGEST_URL "${env_file}")"
  configured_token="$(env_value INGEST_API_TOKEN "${env_file}")"
  [[ -n "${configured_url}" && "${configured_url}" != *'<your-subdomain>'* ]] \
    || die "Configure CLOUDFLARE_INGEST_URL in .env.device or pass --ingest-url"
  [[ "${configured_url}" == */api/v1/readings* ]] \
    || die "CLOUDFLARE_INGEST_URL must target /api/v1/readings"
  [[ -n "${configured_token}" && "${configured_token}" != replace-with-* ]] \
    || die "Configure INGEST_API_TOKEN in .env.device or export it before installation"
}

mark_device_host() {
  if (( DRY_RUN )); then
    log "Would mark ${SCRIPT_DIR} as a device-only checkout"
    return
  fi
  printf 'device\n' > "${SCRIPT_DIR}/.host-role"
  chmod 0644 "${SCRIPT_DIR}/.host-role"
  chown "${SERVICE_USER}:${USER_GROUP}" "${SCRIPT_DIR}/.host-role"
}

prepare_device_wallet_home() {
  local wallet_home="${USER_HOME}/.midnight/midnight-cloudflare-demo/device-wallet"
  log "Preparing protected device-wallet storage at ${wallet_home}"
  run_user mkdir -p "${wallet_home}"
  run_user chmod 0700 "${USER_HOME}/.midnight" \
    "${USER_HOME}/.midnight/midnight-cloudflare-demo" \
    "${wallet_home}"
}

verify_device_artifacts() {
  local artifact_dir="${SCRIPT_DIR}/runtime/device-artifacts/sensor-registry"
  if [[ ! -f "${artifact_dir}/manifest.json" ]]; then
    warn "Device contract artifacts are not installed; collection will run, but device:submit remains unavailable"
    warn "Build the device release on the development server and transfer its runtime/device-artifacts directory"
    return
  fi
  log "Verifying development-built device contract artifacts"
  run_user "${NODE_BIN}" "${SCRIPT_DIR}/scripts/verify-device-artifacts.mjs" "${artifact_dir}"
}

verify_device_release() {
  if [[ ! -f "${SCRIPT_DIR}/device-release-manifest.json" ]]; then
    warn "Installing from a full source checkout; use npm run device:release on the development server for an operational-only package"
    return
  fi
  log "Verifying the operational-only device release"
  run_user "${NODE_BIN}" "${SCRIPT_DIR}/scripts/verify-device-release.mjs" "${SCRIPT_DIR}"
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
  run_user "${NPM_BIN}" ci \
    --workspace @midnight-demo/edge-agent \
    --workspace @midnight-demo/device-wallet-agent \
    --include-workspace-root=false \
    --omit=dev \
    --no-audit \
    --no-fund \
    --cache "${USER_HOME}/.npm"
  if (( RUN_EDGE_TESTS )); then
    log "Running device-only boundary and unit tests"
    run_user "${NPM_BIN}" run test -w @midnight-demo/edge-agent
    run_user "${NPM_BIN}" run test -w @midnight-demo/device-wallet-agent
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
  local repo_path home_path path_value exec_path cli_path
  repo_path="$(systemd_escape_value "${SCRIPT_DIR}")"
  home_path="$(systemd_escape_value "${USER_HOME}")"
  path_value="$(systemd_escape_value "${RUNTIME_PATH}")"
  exec_path="$(systemd_escape_value "${NODE_BIN}")"
  cli_path="$(systemd_escape_value "${SCRIPT_DIR}/apps/device/edge-agent/src/cli.ts")"

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
EnvironmentFile=${repo_path}/.env.device
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

  if [[ -d "${SCRIPT_DIR}/node_modules/tsx" ]] && command -v systemd-analyze >/dev/null 2>&1; then
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
  run_root "${SCRIPT_DIR}/ops/pi-forensics/install.sh"
}

verify_service() {
  (( DRY_RUN || ! START_SERVICE )) && return
  local port health_url
  port="$(env_value AGENT_PORT "${SCRIPT_DIR}/.env.device")"
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
  resolve_service_identity
  if (( ! DRY_RUN )); then
    [[ -d /run/systemd/system ]] || die "systemd is not running as PID 1"
  fi
  TMP_DIR="$(mktemp -d)"
  chmod 0755 "${TMP_DIR}"

  log "Role boundary: device collection/submission only; Compact/prover/deployment commands are disabled here"
  log "Repository: ${SCRIPT_DIR}"
  log "Service user: ${SERVICE_USER}"
  install_system_packages
  install_node
  RUNTIME_PATH="$(dirname "${NODE_BIN}"):${USER_HOME}/.local/bin:/usr/local/bin:/usr/bin:/bin"
  verify_device_release
  configure_environment
  mark_device_host
  prepare_device_wallet_home
  verify_device_artifacts
  stop_existing_service
  install_device_project
  install_systemd_service
  install_persistent_forensics
  verify_service

  log "Device runtime installation complete"
  log "Status: sudo systemctl status ${SERVICE_NAME}"
  log "Logs:   sudo journalctl -u ${SERVICE_NAME} -f"
  log "Prior boot report: sudo pi-forensics-report -1"
}

main "$@"
