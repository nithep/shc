import asyncio
import logging
import json
import os
import paho.mqtt.client as mqtt

# Configuration
MQTT_BROKER = os.getenv("MQTT_BROKER", "broker.hivemq.com") # Default to public for testing
MQTT_PORT = int(os.getenv("MQTT_PORT", 1883))
MQTT_USER = os.getenv("MQTT_USER", "")
MQTT_PASS = os.getenv("MQTT_PASS", "")
BRANCH_ID = os.getenv("BRANCH_ID", "branch-a")

PBX_HOST = os.getenv("PBX_HOST", "127.0.0.1")
PBX_PORT = int(os.getenv("PBX_PORT", 2323))

logging.basicConfig(level=logging.INFO, format='%(asctime)s [%(levelname)s] [MQTTAgent] %(message)s')
logger = logging.getLogger('MQTT_Agent')

class EdgeAgent:
    def __init__(self):
        self.mqtt_client = mqtt.Client(client_id=f"pi-zero-{BRANCH_ID}")
        if MQTT_USER and MQTT_PASS:
            self.mqtt_client.username_pw_set(MQTT_USER, MQTT_PASS)
            
        self.mqtt_client.on_connect = self.on_connect
        self.mqtt_client.on_message = self.on_message
        
        self.pbx_reader = None
        self.pbx_writer = None

    def on_connect(self, client, userdata, flags, rc):
        if rc == 0:
            logger.info("Connected to MQTT Broker!")
            topic = f"hotel/{BRANCH_ID}/room/+/cmd"
            client.subscribe(topic, qos=1)
            logger.info(f"Subscribed to topic: {topic}")
        else:
            logger.error(f"Failed to connect, return code {rc}")

    def on_message(self, client, userdata, msg):
        payload = msg.payload.decode('utf-8')
        logger.info(f"Received MQTT message on {msg.topic}: {payload}")
        
        try:
            # Topic format: hotel/branch-a/room/0101/cmd
            parts = msg.topic.split('/')
            room = parts[3]
            
            data = json.loads(payload)
            command = data.get("command")
            
            # Send to PBX async loop safely
            if command in ["ON", "OFF"]:
                val = 1 if command == "ON" else 0
                pbx_cmd = f"..PWER{room}={val}\r\n"
                
                # We need to run this in the asyncio loop
                # This requires thread-safe scheduling if paho-mqtt runs in a separate thread
                asyncio.run_coroutine_threadsafe(self.send_to_pbx(pbx_cmd), self.loop)
                
        except Exception as e:
            logger.error(f"Error processing message: {e}")

    async def connect_pbx(self):
        logger.info(f"Connecting to PBX at {PBX_HOST}:{PBX_PORT}...")
        try:
            self.pbx_reader, self.pbx_writer = await asyncio.open_connection(PBX_HOST, PBX_PORT)
            logger.info("Connected to PBX Digital Twin.")
            
            # Authenticate
            await self.send_to_pbx("..tcmd=1\r\n")
            await self.send_to_pbx("..PASS=1234\r\n")
            
            # Start listening to PBX
            asyncio.create_task(self.listen_pbx())
            
        except Exception as e:
            logger.error(f"Failed to connect to PBX: {e}")
            
    async def send_to_pbx(self, cmd_str):
        if self.pbx_writer:
            logger.info(f"Sending to PBX: {cmd_str.strip()}")
            self.pbx_writer.write(cmd_str.encode('utf-8'))
            await self.pbx_writer.drain()
            
    async def listen_pbx(self):
        try:
            while True:
                data = await self.pbx_reader.readline()
                if not data:
                    logger.warning("PBX Connection closed")
                    break
                line = data.decode('utf-8', errors='ignore').strip()
                if line:
                    logger.info(f"PBX Reply: {line}")
                    # Publish status back to Cloud
                    if line.startswith("==PWER"):
                        # ==PWER0101=on
                        try:
                            room = line[6:10]
                            status = line.split("=")[1].upper()
                            topic = f"hotel/{BRANCH_ID}/room/{room}/status"
                            payload = json.dumps({"status": status})
                            self.mqtt_client.publish(topic, payload, qos=1)
                        except:
                            pass
        except Exception as e:
            logger.error(f"Error listening PBX: {e}")

    async def run(self):
        self.loop = asyncio.get_running_loop()
        
        # Connect to PBX
        await self.connect_pbx()
        
        # Start MQTT loop in background thread
        logger.info(f"Connecting to MQTT Broker {MQTT_BROKER}:{MQTT_PORT}...")
        self.mqtt_client.connect_async(MQTT_BROKER, MQTT_PORT, 60)
        self.mqtt_client.loop_start()
        
        # Keep alive
        try:
            while True:
                await asyncio.sleep(1)
        except asyncio.CancelledError:
            pass
        finally:
            self.mqtt_client.loop_stop()
            if self.pbx_writer:
                self.pbx_writer.close()
                await self.pbx_writer.wait_closed()

if __name__ == "__main__":
    agent = EdgeAgent()
    try:
        asyncio.run(agent.run())
    except KeyboardInterrupt:
        logger.info("Agent stopped.")
