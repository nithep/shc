#!/bin/bash
mv /tmp/wg0.conf /etc/wireguard/wg0.conf
tr -d '\r' < /etc/wireguard/wg0.conf > /tmp/wg0_clean.conf
mv /tmp/wg0_clean.conf /etc/wireguard/wg0.conf
chown root:root /etc/wireguard/wg0.conf
chmod 600 /etc/wireguard/wg0.conf
systemctl restart wg-quick@wg0
