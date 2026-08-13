#!/usr/bin/env bash
# fix-pi-ssh.sh - restore SSH key auth on the Pi 4 (hotel-gateway) SSD rootfs
# mounted via WSL2. Run inside WSL as root.
set -uo pipefail

ROOTFS=/mnt/wsl/PHYSICALDRIVE1p2
SSH=$ROOTFS/home/ecs-agent/.ssh
AUTH=$SSH/authorized_keys

echo "== rootfs check =="
[ -d "$ROOTFS/etc" ] || { echo "ERROR: not a rootfs ($ROOTFS) - mount first"; exit 1; }
[ -f "$AUTH" ] || { echo "ERROR: $AUTH missing"; exit 1; }
echo "hostname: $(cat "$ROOTFS/etc/hostname")"
mount | grep -i PHYSICALDRIVE1p2 || echo "(no mount line found)"

echo "== backup =="
BK="$AUTH.bak.$(date +%Y%m%d%H%M%S)"
cp "$AUTH" "$BK" && echo "backup: $BK"

echo "== append keys =="
for k in /mnt/c/Users/Nithep/.ssh/id_rsa.pub /mnt/c/Users/Nithep/.ssh/ecs-agent_ed25519.pub; do
  [ -f "$k" ] || { echo "warn: key file missing: $k"; continue; }
  c=$(tr -d '\r\n' < "$k")
  if grep -qF "$c" "$AUTH"; then
    echo "skip (already present): $(basename "$k")"
  else
    printf '%s\n' "$c" >> "$AUTH" && echo "added: $(basename "$k")"
  fi
done

echo "== chown (verbose) =="
chown -v 1000:1000 "$ROOTFS/home/ecs-agent" || echo "CHOWN HOME FAILED rc=$?"
chown -Rv 1000:1000 "$SSH" || echo "CHOWN SSH FAILED rc=$?"
chmod 700 "$SSH" || echo "chmod .ssh failed rc=$?"
chmod 600 "$AUTH" || echo "chmod authorized_keys failed rc=$?"

echo "== verify =="
ls -la "$SSH"
stat -c '%A %u:%g %n' "$AUTH"
echo "keys: $(grep -c '^ssh-' "$AUTH")"
sync
echo "== DONE =="
