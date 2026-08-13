#!/bin/bash
# Hotel-ECS Quick Fix Script for Raspberry Pi
# Run this on Pi: ssh ecs-agent@192.168.1.94 'bash -s' < quick-fix-deployment.sh

echo "========================================"
echo "Hotel-ECS Quick Fix Deployment"
echo "========================================"
echo ""

APP_DIR="/home/ecs-agent/nithep/shc"
COMPOSE_FILE="docker-compose.prod.yml"

# Step 1: Stop and remove conflicting containers
echo "[1/5] Stopping and removing conflicting containers..."
docker rm -f hotel-app 2>/dev/null && echo "  [OK] Removed hotel-app container" || echo "  [INFO] hotel-app not found"
docker rm -f hotel-tunnel 2>/dev/null && echo "  [OK] Removed hotel-tunnel container" || echo "  [INFO] hotel-tunnel not found"
docker compose -f "$APP_DIR/$COMPOSE_FILE" down 2>/dev/null || echo "  [INFO] No running compose services"
echo ""

# Step 2: Check .env file
echo "[2/5] Checking .env file..."
if [ -f "$APP_DIR/.env" ]; then
    echo "  [OK] .env file exists"
    
    if grep -q '^CLOUDFLARE_TUNNEL_TOKEN=' "$APP_DIR/.env"; then
        echo "  [OK] CLOUDFLARE_TUNNEL_TOKEN found in .env"
        
        # Show first 20 chars of token for verification (don't expose full token)
        TOKEN_PREVIEW=$(grep '^CLOUDFLARE_TUNNEL_TOKEN=' "$APP_DIR/.env" | cut -c26-45)
        echo "  [INFO] Token preview: ${TOKEN_PREVIEW}..."
    else
        echo "  [ERROR] CLOUDFLARE_TUNNEL_TOKEN NOT found in .env!"
        echo "  Please add it manually or redeploy with updated script"
        exit 1
    fi
else
    echo "  [ERROR] .env file NOT found at $APP_DIR/.env"
    echo "  The deployment package may not have included it"
    exit 1
fi
echo ""

# Step 3: Verify docker-compose configuration
echo "[3/5] Verifying Docker Compose configuration..."
cd "$APP_DIR" || exit 1

if [ ! -f "$COMPOSE_FILE" ]; then
    echo "  [ERROR] $COMPOSE_FILE not found!"
    exit 1
fi

# Check if config is valid
docker compose -f "$COMPOSE_FILE" config > /dev/null 2>&1
if [ $? -eq 0 ]; then
    echo "  [OK] Docker Compose configuration is valid"
else
    echo "  [WARNING] Docker Compose configuration has issues"
    docker compose -f "$COMPOSE_FILE" config 2>&1 | head -20
fi
echo ""

# Step 4: Start containers
echo "[4/5] Starting containers..."
docker compose -f "$COMPOSE_FILE" up -d --build

if [ $? -eq 0 ]; then
    echo "  [OK] Containers started successfully"
else
    echo "  [ERROR] Failed to start containers"
    exit 1
fi
echo ""

# Wait for initialization
echo "Waiting 5 seconds for services to initialize..."
sleep 5

# Step 5: Verify deployment
echo "[5/5] Verifying deployment..."
echo ""
echo "Container Status:"
echo "----------------------------------------"
docker compose -f "$COMPOSE_FILE" ps
echo ""

# Check tunnel logs
echo "Cloudflare Tunnel Logs (last 15 lines):"
echo "----------------------------------------"
docker compose -f "$COMPOSE_FILE" logs --tail=15 hotel-tunnel 2>/dev/null || echo "Tunnel logs not available yet"
echo ""

# Check app logs
echo "App Service Logs (last 10 lines):"
echo "----------------------------------------"
docker compose -f "$COMPOSE_FILE" logs --tail=10 hotel-app 2>/dev/null || echo "App logs not available yet"
echo ""

# Test endpoints
echo "Testing Endpoints:"
echo "----------------------------------------"
sleep 3

# Test backend API
BACKEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/api/health 2>/dev/null)
if [ "$BACKEND_RESPONSE" = "200" ]; then
    echo "  [OK] Backend API responding (HTTP $BACKEND_RESPONSE)"
else
    echo "  [WARNING] Backend API returned HTTP $BACKEND_RESPONSE (may still be starting)"
fi

# Test frontend
FRONTEND_RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:5173 2>/dev/null)
if [ "$FRONTEND_RESPONSE" = "200" ]; then
    echo "  [OK] Frontend accessible (HTTP $FRONTEND_RESPONSE)"
else
    echo "  [WARNING] Frontend returned HTTP $FRONTEND_RESPONSE (may still be building)"
fi
echo ""

# Summary
echo "========================================"
echo "Quick Fix Complete!"
echo "========================================"
echo ""
echo "Access URLs:"
echo "  Frontend: http://$(hostname -I | awk '{print $1}'):5173"
echo "  Backend:  http://$(hostname -I | awk '{print $1}'):3000"
echo ""
echo "Useful commands:"
echo "  View logs:     docker compose -f $COMPOSE_FILE logs -f"
echo "  Restart:       docker compose -f $COMPOSE_FILE restart"
echo "  Check tunnel:  docker compose -f $COMPOSE_FILE logs -f hotel-tunnel"
echo ""
