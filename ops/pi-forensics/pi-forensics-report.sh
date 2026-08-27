#!/usr/bin/env bash

set -u

boot="${1:--1}"
agent_service="${2:-measurement-edge-agent.service}"

section() {
  printf '\n## %s\n' "$1"
}

section 'Available boots'
journalctl --list-boots --no-pager

section "Warnings for boot ${boot}"
journalctl -b "${boot}" -p warning..alert --no-pager -o short-iso

section "Kernel connectivity, storage, power, and crash events for boot ${boot}"
journalctl -b "${boot}" -k --no-pager -o short-iso |
  grep -Ei 'brcmf|wlan|disconnect|deauth|timeout|reset|watchdog|under.?voltage|thermal|oom|out of memory|panic|I/O error|ext4|sda|usb'

section "NetworkManager events for boot ${boot}"
journalctl -b "${boot}" -u NetworkManager.service --no-pager -o short-iso

section "SSH events for boot ${boot}"
journalctl -b "${boot}" -u ssh.service --no-pager -o short-iso

section "Edge agent events for boot ${boot}"
journalctl -b "${boot}" -u "${agent_service}" --no-pager -o short-iso

section "Pi health snapshots for boot ${boot}"
journalctl -b "${boot}" -t pi-connectivity --no-pager -o short-iso
