# mDNS + Avahi Setup (WSL2/Intranet QA)

Use this guide to make `kowloon.local` resolvable on your local network for QA.

## Goal

- QA hostname: `kowloon.local`
- QA stack host: your WSL2/Linux machine running edge + QA containers
- Resolution method: mDNS via Avahi (with local DNS/hosts fallback if needed)

## 1) Install Avahi on the QA host

Run on the Linux host (or inside WSL distro shell if that host is where Docker runs):

```bash
sudo apt-get update
sudo apt-get install -y avahi-daemon avahi-utils libnss-mdns
```

Enable/start service:

```bash
sudo systemctl enable avahi-daemon
sudo systemctl restart avahi-daemon
sudo systemctl status avahi-daemon --no-pager
```

## 2) Set Avahi advertised hostname

Edit:

```bash
sudo nano /etc/avahi/avahi-daemon.conf
```

Ensure `[server]` has:

```ini
host-name=kowloon
```

Then restart:

```bash
sudo systemctl restart avahi-daemon
```

## 3) Verify on QA host

```bash
hostname -f || true
avahi-resolve-host-name kowloon.local
getent hosts kowloon.local
```

Expected: hostname resolves to the QA host LAN/WSL address.

## 4) Verify from a client machine

From another LAN machine (Windows/macOS/Linux):

- browser/curl to `https://kowloon.local/__health`
- or host check to `http://kowloon.local/__health` (should redirect to HTTPS in QA mode)

For command-line validation from Linux/macOS:

```bash
curl -k -H 'Host: kowloon.local' https://kowloon.local/__health
```

## 5) Start and validate QA stack

```bash
cd /home/joshu/kowloon-ops
make -f .wsl2/Makefile edge-up
make -f .wsl2/Makefile qa-up
make -f .wsl2/Makefile qa-smoke
```

## 6) TLS expectation for `.local`

- Public ACME/Let's Encrypt cert issuance is not expected for mDNS-only `.local` names.
- For intranet QA, expect default/self-signed TLS unless you add local trusted certs.
- `qa-smoke` already uses `curl -k` for HTTPS checks.

## 7) WSL2/Windows caveat

mDNS behavior can vary by Windows + WSL2 networking mode and client stack.
If cross-device resolution is inconsistent, use one of these fallbacks:

1. Local DNS (router/Pi-hole/dnsmasq): map `kowloon.local` to QA host IP.
2. Per-client hosts entries:
   - Windows: `C:\Windows\System32\drivers\etc\hosts`
   - Linux/macOS: `/etc/hosts`

Example hosts entry:

```text
<QA_HOST_IP> kowloon.local
```

## 8) Troubleshooting

1. Avahi not running:

```bash
sudo journalctl -u avahi-daemon -n 100 --no-pager
```

2. Name resolves on host but not on clients:
- verify client supports mDNS and is on same L2 network/VLAN.
- verify local firewall is not blocking multicast DNS traffic.
- use local DNS/hosts fallback.

3. QA route mismatch:
- ensure `.wsl2/env/.env.qa` has:
  - `DOMAIN=kowloon.local`
  - `S3_PUBLIC_URL=https://kowloon.local/files`
