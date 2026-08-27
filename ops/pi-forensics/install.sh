#!/usr/bin/env bash

set -euo pipefail

if (( EUID != 0 )); then
  printf 'Run this installer as root.\n' >&2
  exit 1
fi

source_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"

install -D -m 0644 \
  "${source_dir}/90-pi-forensics-persistent.conf" \
  /etc/systemd/journald.conf.d/90-pi-forensics-persistent.conf
install -D -m 0755 \
  "${source_dir}/pi-connectivity-snapshot.sh" \
  /usr/local/libexec/pi-connectivity-snapshot
install -D -m 0755 \
  "${source_dir}/pi-forensics-report.sh" \
  /usr/local/sbin/pi-forensics-report
install -D -m 0644 \
  "${source_dir}/pi-connectivity-snapshot.service" \
  /etc/systemd/system/pi-connectivity-snapshot.service
install -D -m 0644 \
  "${source_dir}/pi-connectivity-snapshot.timer" \
  /etc/systemd/system/pi-connectivity-snapshot.timer

systemd-analyze verify \
  /etc/systemd/system/pi-connectivity-snapshot.service \
  /etc/systemd/system/pi-connectivity-snapshot.timer
systemctl daemon-reload
systemctl restart systemd-journald.service
journalctl --flush
systemctl enable --now pi-connectivity-snapshot.timer
systemctl start pi-connectivity-snapshot.service

printf 'Persistent Pi forensic logging is enabled.\n'
