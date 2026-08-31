#!/usr/bin/env bash

set -euo pipefail

readonly script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"

printf '[installer] This entry point installs only the device runtime. Development/prover setup is never run here.\n'
exec "${script_dir}/device-installer.sh" "$@"
