#!/usr/bin/env bash

set -u

interface="${1:-wlan0}"
agent_service="${2:-measurement-edge-agent.service}"

compact() {
  tr '\n' ' ' | tr -s '[:space:]' ' ' | sed -e 's/^ //' -e 's/ $//'
}

command_output() {
  local fallback="$1"
  shift
  local output
  if output="$("$@" 2>/dev/null)"; then
    printf '%s' "${output}"
  else
    printf '%s' "${fallback}"
  fi
}

interface_state="$(command_output unavailable cat "/sys/class/net/${interface}/operstate")"
addresses="$(ip -brief address show dev "${interface}" 2>/dev/null | compact)"
addresses="${addresses:-unavailable}"
default_route="$(ip route show default dev "${interface}" 2>/dev/null | head -n 1 | compact)"
default_route="${default_route:-unavailable}"
gateway="$(ip route show default dev "${interface}" 2>/dev/null | awk 'NR == 1 { print $3 }')"

wifi="unavailable"
if command -v iw >/dev/null 2>&1; then
  wifi="$(
    iw dev "${interface}" link 2>/dev/null |
      awk '
        /^[[:space:]]*freq:/ ||
        /^[[:space:]]*signal:/ ||
        /^[[:space:]]*rx bitrate:/ ||
        /^[[:space:]]*tx bitrate:/ {
          gsub(/^[[:space:]]+/, "");
          printf "%s%s", separator, $0;
          separator = ",";
        }
      '
  )"
  wifi="${wifi:-disconnected}"
fi

gateway_ping="unavailable"
if [[ -n "${gateway}" ]] && command -v ping >/dev/null 2>&1; then
  if ping -n -c 1 -W 1 "${gateway}" >/dev/null 2>&1; then
    gateway_ping="ok"
  else
    gateway_ping="failed"
  fi
fi

throttled="$(command_output throttled=unavailable vcgencmd get_throttled)"
temperature="$(command_output temp=unavailable vcgencmd measure_temp)"
core_voltage="$(command_output volt=unavailable vcgencmd measure_volts core)"
ssh_state="$(command_output unavailable systemctl is-active ssh.service)"
agent_state="$(command_output unavailable systemctl is-active "${agent_service}")"
agent_pid="$(command_output unavailable systemctl show "${agent_service}" --property MainPID --value)"
agent_memory="$(command_output unavailable systemctl show "${agent_service}" --property MemoryCurrent --value)"
agent_tasks="$(command_output unavailable systemctl show "${agent_service}" --property TasksCurrent --value)"
root_usage="$(df -P / 2>/dev/null | awk 'NR == 2 { print $5 }')"
root_usage="${root_usage:-unavailable}"
memory_available_kib="$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo 2>/dev/null)"
memory_available_kib="${memory_available_kib:-unavailable}"
swap_free_kib="$(awk '/^SwapFree:/ { print $2 }' /proc/meminfo 2>/dev/null)"
swap_free_kib="${swap_free_kib:-unavailable}"
uptime_seconds="$(cut -d. -f1 /proc/uptime 2>/dev/null)"
uptime_seconds="${uptime_seconds:-unavailable}"
load_average="$(compact < /proc/loadavg 2>/dev/null)"
load_average="${load_average:-unavailable}"
cpu_pressure="$(sed -n '1p' /proc/pressure/cpu 2>/dev/null | compact)"
cpu_pressure="${cpu_pressure:-unavailable}"
memory_pressure="$(sed -n '1p' /proc/pressure/memory 2>/dev/null | compact)"
memory_pressure="${memory_pressure:-unavailable}"
io_pressure="$(sed -n '1p' /proc/pressure/io 2>/dev/null | compact)"
io_pressure="${io_pressure:-unavailable}"
top_cpu="$(ps -eo pid=,comm=,%cpu=,%mem=,rss= --sort=-%cpu 2>/dev/null | head -n 5 | compact)"
top_cpu="${top_cpu:-unavailable}"
containers="unavailable"
if command -v docker >/dev/null 2>&1; then
  containers="$(docker ps --format '{{.Names}}:{{.Status}}' 2>/dev/null | compact)"
  containers="${containers:-none}"
fi

printf '%s\n' \
  "interface=${interface} state=${interface_state} addresses=\"${addresses}\" route=\"${default_route}\" wifi=\"${wifi}\" gateway_ping=${gateway_ping} ssh=${ssh_state} agent=${agent_state} agent_pid=${agent_pid} agent_memory_bytes=${agent_memory} agent_tasks=${agent_tasks} ${throttled} ${temperature} ${core_voltage} root_usage=${root_usage} memory_available_kib=${memory_available_kib} swap_free_kib=${swap_free_kib} uptime_seconds=${uptime_seconds} load=\"${load_average}\" cpu_pressure=\"${cpu_pressure}\" memory_pressure=\"${memory_pressure}\" io_pressure=\"${io_pressure}\" top_cpu=\"${top_cpu}\" containers=\"${containers}\""
