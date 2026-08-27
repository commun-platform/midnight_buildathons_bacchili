# Raspberry Pi forensic logging

This configuration keeps systemd journal entries across reboots and records a
small connectivity, resource-pressure, process, container, and hardware snapshot
every minute. Process command lines are not recorded. It deliberately omits
Wi-Fi SSIDs, BSSIDs, credentials, wallet data, raw readings, and application secrets.

The journal is capped at 256 MB and 30 days. Install the files as root:

```bash
sudo ./install.sh
```

After a forced restart, inspect the preceding boot with:

```bash
sudo pi-forensics-report -1
```

For a narrower timeline around a known time:

```bash
sudo journalctl -b -1 --since '2026-08-27 18:00' --until '2026-08-27 19:30'
```
