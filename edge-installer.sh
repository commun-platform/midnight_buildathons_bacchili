#!/usr/bin/env bash

set -euo pipefail

readonly script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

printf '[edge-installer] Renamed to device-installer.sh; continuing with the device-only installer.\n'
exec "${script_dir}/device-installer.sh" "$@"
