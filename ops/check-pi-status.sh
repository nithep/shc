#!/bin/bash
# Hotel-ECS Quick Status Check Script for Raspberry Pi
# Run this on the Pi: ssh ecs-agent@192.168.1.94 'bash -s' < check-status.sh

echo "========================================"
echo "Hotel-ECS Status Check"
echo "========================================"
echo ""

# Check Docker Compose file location
APP_DIR="/home/ecs-agent/nithep/shc"
COMPOSE_FILE="docker-compose.prod.yml"

if [ ! -d "$APP_DIR" ]; then
    echo "❌ Application directory not found: $APP_DIR"
    exit 1
fi

cd "$APP_DIR" || exit 1

# Step 1: Container Status
echo "[1/5] Container Status:"
echo "----------------------------------------"
docker compose -f "$COMPOSE_FILE" ps
echo ""

# Step 2: Check if containers are running
echo "[2/5] Running Containers:"
echo "----------------------------------------"
RUNNING=$(docker compose -f "$COMPOSE_FILE" ps --format "{{.Name}}: {{.Status}}" | grep -i "up")
if [ -n "$RUNNING" ]; then
    echo "$RUNNING"
    echo "✅ All expected containers are running"
else
    echo "⚠️  No running containers found"
    echo "   Try: docker compose -f $COMPOSE_FILE up -d"
fi
echo ""

# Step 3: Cloudflare Tunnel Logs (last 30 lines)
echo "[3/5] Cloudflare Tunnel Status (last 30 lines):"
echo "----------------------------------------"
TUNNEL_LOGS=$(docker compose -f "$COMPOSE_FILE" logs --tail=30 hotel-tunnel 2>&1)
echo "$TUNNEL_LOGS"
echo ""

# Check for connection success
if echo "$TUNNEL_LOGS" | grep -qi "connected\|connection established"; then
    echo "✅ Cloudflare Tunnel appears connected"
elif echo "$TUNNEL_LOGS" | grep -qi "error\|failed"; then
    echo "⚠️  Tunnel logs show errors - check CLOUDFLARE_TUNNEL_TOKEN"
else
    echo "ℹ️  Tunnel status unclear from logs"
fi
echo ""

# Step 4: Disk Usage
echo "[4/5] Disk Usage:"
echo "----------------------------------------"
df -h /home/ecs-agent/nithep/shc
echo ""

# Step 5: Memory Usage
echo "[5/5] Memory Usage:"
echo "----------------------------------------"
free -h
echo ""

# Network ports
echo "Network Ports in Use:"
echo "----------------------------------------"
ss -tlnp | grep -E ":(3000|5173)" || echo "Ports 3000/5173 not listening"
echo ""

echo "========================================"
echo "Quick Actions:"
echo "========================================"
echo "View full logs:     docker compose -f $COMPOSE_FILE logs -f"
echo "Restart app:        docker compose -f $COMPOSE_FILE restart"
echo "Check env vars:     docker compose -f $COMPOSE_FILE config | grep TUNNEL"
echo "Access URLs:"
echo "  Frontend: http://$(hostname -I | awk '{print $1}'):5173"
echo "  Backend:  http://$(hostname -I | awk '{print $1}'):3000"
echo ""
