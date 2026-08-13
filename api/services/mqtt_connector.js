const EventEmitter = require('events');
const mqtt = require('mqtt');

/**
 * MQTT Connector - A facade replacing the physical PBX connector.
 * It provides the same interface (checkIn, checkOut, getRoomStatus) 
 * but sends commands via MQTT to the Edge Agent.
 */
class MqttConnector extends EventEmitter {
    constructor(config) {
        super();
        this.config = config || {};
        this.branchId = process.env.BRANCH_ID || 'branch_01';
        this.state = 'DISCONNECTED';
        this.client = null;
        this.roomStates = new Map(); // Cache for getRoomStatus
        
        // MQTT Broker Config (Fallback: Public HiveMQ for Dev/Test)
        this.brokerUrl = process.env.MQTT_BROKER_URL || 'mqtt://broker.hivemq.com:1883';
        this.username = process.env.MQTT_USERNAME || null;
        this.password = process.env.MQTT_PASSWORD || null;
    }

    async connect() {
        if (this.state === 'CONNECTED') return;
        this.state = 'CONNECTING';

        return new Promise((resolve, reject) => {
            const mqttOptions = {
                clientId: `cloud-backend-${this.branchId}-${Math.random().toString(16).substr(2, 8)}`,
            };
            if (this.username) mqttOptions.username = this.username;
            if (this.password) mqttOptions.password = this.password;
            this.client = mqtt.connect(this.brokerUrl, mqttOptions);

            this.client.on('connect', () => {
                this.state = 'CONNECTED';
                this.emit('reconnected'); // Let server know we are ready
                
                // Subscribe to Edge Agent Status & Results
                this.client.subscribe(`hotel/${this.branchId}/status`, { qos: 1 });
                this.client.subscribe(`hotel/${this.branchId}/room/+/result`, { qos: 1 });
                
                resolve();
            });

            this.client.on('message', (topic, message) => {
                const payload = JSON.parse(message.toString());
                
                // Edge Agent connection status
                if (topic === `hotel/${this.branchId}/status`) {
                    if (payload.status === 'offline') {
                        this.emit('connection_lost');
                    } else if (payload.status === 'online') {
                        this.emit('heartbeat');
                    }
                }
                
                // Handle results
                const resultMatch = topic.match(new RegExp(`^hotel/${this.branchId}/room/(.+)/result$`));
                if (resultMatch) {
                    const roomNo = resultMatch[1];
                    const command = payload.command;
                    const status = command === 'ON' ? 'ON' : 'OFF';
                    
                    // Update cache
                    this.roomStates.set(roomNo, status);
                    
                    if (command === 'ON') {
                        this.emit('checkin', { success: true, room: roomNo, status: 'ON' });
                    } else {
                        this.emit('checkout', { success: true, room: roomNo, status: 'OFF' });
                    }
                }
            });

            this.client.on('error', (err) => {
                this.emit('error', err);
                if (this.state === 'CONNECTING') reject(err);
            });
            
            this.client.on('offline', () => {
                this.state = 'DISCONNECTED';
                this.emit('connection_lost');
            });
        });
    }

    async checkIn(room, guestName, days = 1) {
        if (this.state !== 'CONNECTED') throw new Error('MQTT disconnected');
        
        const topic = `hotel/${this.branchId}/room/${room}/command`;
        this.client.publish(topic, JSON.stringify({
            command: 'ON',
            guestName: guestName || '',
            days: days,
            timestamp: Date.now()
        }), { qos: 1 });
        
        // Optimistically set state or wait for result? 
        // For now, return optimistic success like a decoupled system
        this.roomStates.set(String(room), 'ON');
        return { success: true, room: String(room), status: 'ON', name: guestName };
    }

    async checkOut(room) {
        if (this.state !== 'CONNECTED') throw new Error('MQTT disconnected');
        
        const topic = `hotel/${this.branchId}/room/${room}/command`;
        this.client.publish(topic, JSON.stringify({
            command: 'OFF',
            timestamp: Date.now()
        }), { qos: 1 });
        
        this.roomStates.set(String(room), 'OFF');
        return { success: true, room: String(room), status: 'OFF' };
    }

    async getRoomStatus(room) {
        // Since we are decoupled, we return the last known state from cache
        // If not in cache, assume OFF for safety, or trigger a status request
        const status = this.roomStates.get(String(room)) || 'OFF';
        return {
            room: String(room),
            status: status,
            statusCode: status === 'ON' ? 1 : 0,
            statusLabel: status
        };
    }
}

function createConnector(config) {
    return new MqttConnector(config);
}

module.exports = { createConnector, MqttConnector };
