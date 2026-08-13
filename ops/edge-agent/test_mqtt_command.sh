#!/bin/bash
cd /home/ecs-agent/nithep/shc/edge-agent

echo "📡 HECS MQTT Command Test"
echo "=========================="
echo ""

if [ -f .env ]; then
    export $(grep -v '^#' .env | xargs)
fi

ROOM=${1:-0101}
COMMAND=${2:-ON}

echo "Room: $ROOM"
echo "Command: $COMMAND"
echo ""

if command -v mosquitto_pub &> /dev/null; then
    TOPIC="hotel/$BRANCH_ID/room/$ROOM/command"
    PAYLOAD="{\"command\":\"$COMMAND\",\"guestName\":\"Test Guest\",\"timestamp\":$(date +%s)}"
    
    echo "Publishing to: $TOPIC"
    echo "Payload: $PAYLOAD"
    echo ""
    
    mosquitto_pub -h $(echo $MQTT_BROKER_URL | sed 's|mqtt://||' | cut -d':' -f1) \
                  -p $(echo $MQTT_BROKER_URL | sed 's|mqtt://||' | cut -d':' -f2) \
                  -t "$TOPIC" \
                  -m "$PAYLOAD"
    
    echo ""
    echo "✅ Command sent! Check logs for result."
else
    echo "❌ mosquitto_pub not installed. Install with: sudo apt install mosquitto-clients"
fi
