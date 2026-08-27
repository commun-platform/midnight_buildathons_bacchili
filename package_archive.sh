#!/usr/bin/env bash

set -Eeuo pipefail
IFS=$'\n\t'

readonly SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
readonly DEFAULT_OUTPUT_DIR="${SCRIPT_DIR}/.device-release/archives"

ARTIFACT_DIR=""
OUTPUT_DIR="${DEFAULT_OUTPUT_DIR}"
FIRMWARE_VERSION=""
PACKAGE_TMP=""

log() {
  printf '[package-archive] %s\n' "$*"
}

die() {
  printf '[package-archive] ERROR: %s\n' "$*" >&2
  exit 1
}

usage() {
  cat <<'EOF'
Usage: ./package_archive.sh [options]

Builds a Raspberry Pi sensor-device firmware archive on a development host.
The archive contains installer.sh and only device runtime source, production
dependencies metadata, verified contract artifacts, and operational docs.

Prerequisites:
  npm run contract:compile

Options:
  --version VERSION       Firmware/archive version (default: root package version)
  --artifacts DIR         Use an existing artifact export instead of exporting compiled output
  --output-dir DIR        Archive output directory (default: .device-release/archives)
  -h, --help              Show this help

Outputs:
  midnight-sensor-device-fw-VERSION.tar.gz
  midnight-sensor-device-fw-VERSION.tar.gz.sha256

SOURCE_DATE_EPOCH may be set to normalize archive timestamps.
EOF
}

cleanup() {
  if [[ -n "${PACKAGE_TMP}" && -d "${PACKAGE_TMP}" ]]; then
    rm -rf -- "${PACKAGE_TMP}"
  fi
}
trap cleanup EXIT

parse_args() {
  while (( $# > 0 )); do
    case "$1" in
      --version)
        (( $# >= 2 )) || die "--version requires a value"
        FIRMWARE_VERSION="$2"
        shift 2
        ;;
      --artifacts)
        (( $# >= 2 )) || die "--artifacts requires a value"
        ARTIFACT_DIR="$2"
        shift 2
        ;;
      --output-dir)
        (( $# >= 2 )) || die "--output-dir requires a value"
        OUTPUT_DIR="$2"
        shift 2
        ;;
      -h|--help)
        usage
        exit 0
        ;;
      *)
        die "Unknown option: $1"
        ;;
    esac
  done
}

resolve_defaults() {
  if [[ -z "${FIRMWARE_VERSION}" ]]; then
    FIRMWARE_VERSION="$(node -e "const p=require(process.argv[1]); process.stdout.write(p.version)" "${SCRIPT_DIR}/package.json")"
  fi
  [[ "${FIRMWARE_VERSION}" =~ ^[0-9A-Za-z][0-9A-Za-z._-]*$ ]] \
    || die "Invalid firmware version: ${FIRMWARE_VERSION}"

  if [[ -n "${ARTIFACT_DIR}" ]]; then
    ARTIFACT_DIR="$(realpath -m -- "${ARTIFACT_DIR}")"
    [[ -f "${ARTIFACT_DIR}/manifest.json" ]] \
      || die "Artifact export is missing: ${ARTIFACT_DIR}/manifest.json"
  fi
  OUTPUT_DIR="$(realpath -m -- "${OUTPUT_DIR}")"
  [[ "${OUTPUT_DIR}" != "/" && "${OUTPUT_DIR}" != "${SCRIPT_DIR}" ]] \
    || die "Refusing unsafe output directory: ${OUTPUT_DIR}"
}

require_development_host() {
  node "${SCRIPT_DIR}/scripts/require-development-host.mjs"
  for command_name in node npm tar gzip sha256sum realpath mktemp bash date grep install; do
    command -v "${command_name}" >/dev/null 2>&1 || die "Required command not found: ${command_name}"
  done
}

verify_archive_members() {
  local archive="$1"
  local archive_root="$2"
  local list_file="${PACKAGE_TMP}/archive-members.txt"
  tar -tzf "${archive}" > "${list_file}"
  grep -qx "${archive_root}/installer.sh" "${list_file}" \
    || die "Archive does not contain ${archive_root}/installer.sh"
  while IFS= read -r member || [[ -n "${member}" ]]; do
    [[ "${member}" == "${archive_root}" || "${member}" == "${archive_root}/"* ]] \
      || die "Archive member escapes the firmware root: ${member}"
    [[ "${member}" != /* && "/${member}/" != *"/../"* ]] \
      || die "Unsafe archive member: ${member}"
  done < "${list_file}"
}

main() {
  parse_args "$@"
  require_development_host
  resolve_defaults
  node "${SCRIPT_DIR}/scripts/verify-repository-portability.mjs"

  mkdir -p -- "${OUTPUT_DIR}"
  local archive_root="midnight-sensor-device-fw-${FIRMWARE_VERSION}"
  local archive_name="${archive_root}.tar.gz"
  local archive_path="${OUTPUT_DIR}/${archive_name}"
  local checksum_path="${archive_path}.sha256"
  [[ ! -e "${archive_path}" && ! -e "${checksum_path}" ]] \
    || die "Refusing to overwrite an existing archive or checksum: ${archive_path}"

  PACKAGE_TMP="$(mktemp -d "${OUTPUT_DIR}/.package-archive.XXXXXX")"
  if [[ -z "${ARTIFACT_DIR}" ]]; then
    ARTIFACT_DIR="${PACKAGE_TMP}/sensor-registry-artifacts"
    log "Exporting the current development-built contract artifacts"
    node "${SCRIPT_DIR}/scripts/export-device-artifacts.mjs" "${ARTIFACT_DIR}"
  fi
  local release_dir="${PACKAGE_TMP}/${archive_root}"
  local archive_tar="${PACKAGE_TMP}/${archive_root}.tar"
  local staged_archive="${archive_tar}.gz"
  local verify_dir="${PACKAGE_TMP}/verify"
  local archive_epoch="${SOURCE_DATE_EPOCH:-$(date +%s)}"
  [[ "${archive_epoch}" =~ ^[0-9]+$ ]] || die "SOURCE_DATE_EPOCH must be a non-negative integer"

  log "Building operational-only device tree"
  DEVICE_FIRMWARE_VERSION="${FIRMWARE_VERSION}" \
    DEVICE_PACKAGE_NPM_CACHE="${PACKAGE_TMP}/npm-cache" \
    SOURCE_DATE_EPOCH="${archive_epoch}" \
    node "${SCRIPT_DIR}/scripts/build-device-release.mjs" \
      "${ARTIFACT_DIR}" "${release_dir}"
  node "${SCRIPT_DIR}/scripts/verify-device-release.mjs" "${release_dir}"
  node "${SCRIPT_DIR}/scripts/verify-device-artifacts.mjs" \
    "${release_dir}/runtime/device-artifacts/sensor-registry"
  [[ -x "${release_dir}/installer.sh" ]] || die "installer.sh is not executable in the release"
  bash -n "${release_dir}/installer.sh" "${release_dir}/device-installer.sh"

  log "Checking that the production lockfile is installable"
  npm ci --dry-run \
    --workspace @midnight-demo/edge-agent \
    --workspace @midnight-demo/device-wallet-agent \
    --include-workspace-root=false \
    --omit=dev \
    --ignore-scripts \
    --no-audit \
    --no-fund \
    --cache "${PACKAGE_TMP}/npm-cache" \
    --prefix "${release_dir}"

  log "Creating ${archive_name}"
  tar \
    --sort=name \
    --mtime="@${archive_epoch}" \
    --owner=0 \
    --group=0 \
    --numeric-owner \
    --format=posix \
    --pax-option=delete=atime,delete=ctime \
    -cf "${archive_tar}" \
    -C "${PACKAGE_TMP}" \
    "${archive_root}"
  gzip -n -9 "${archive_tar}"
  verify_archive_members "${staged_archive}" "${archive_root}"

  mkdir -p -- "${verify_dir}"
  tar -xzf "${staged_archive}" -C "${verify_dir}"
  node "${SCRIPT_DIR}/scripts/verify-device-release.mjs" "${verify_dir}/${archive_root}"
  node "${SCRIPT_DIR}/scripts/verify-device-artifacts.mjs" \
    "${verify_dir}/${archive_root}/runtime/device-artifacts/sensor-registry"
  "${verify_dir}/${archive_root}/installer.sh" --help >/dev/null

  install -m 0644 "${staged_archive}" "${archive_path}"
  (
    cd "${OUTPUT_DIR}"
    sha256sum "${archive_name}" > ".${archive_name}.sha256.tmp"
    mv -f -- ".${archive_name}.sha256.tmp" "${archive_name}.sha256"
    chmod 0644 "${archive_name}.sha256"
  )

  log "Archive: ${archive_path}"
  log "Checksum: ${checksum_path}"
  log "The package contains installer.sh and no development workspace or wallet material"
}

main "$@"
