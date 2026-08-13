'use strict';

const { exec } = require('child_process');

/**
 * Service to manage Wi-Fi connections on Raspberry Pi 4 using NetworkManager (nmcli)
 * and provide a mock mode for development/testing on other platforms (like Windows).
 */
class WiFiService {
  constructor(options = {}) {
    this.wifiInterface = options.wifiInterface || process.env.WIFI_INTERFACE || 'wlan0';
    
    // Detect mode
    const envMode = process.env.WIFI_MODE;
    if (envMode === 'mock') {
      this.mode = 'mock';
    } else if (envMode === 'live') {
      this.mode = 'live';
    } else {
      // Auto-detect based on platform
      this.mode = process.platform === 'win32' ? 'mock' : 'live';
    }

    console.log(`[WIFI] Initialized in "${this.mode}" mode using interface: "${this.wifiInterface}"`);

    // Mock state setup
    if (this.mode === 'mock') {
      this.mockState = {
        enabled: true,
        connected: true,
        ssid: 'NT-WIFI_2.4G',
        bssid: '88:a2:9e:11:07:fe',
        signal: 92,
        security: 'WPA2'
      };

      this.mockNetworks = [
        { active: true, ssid: 'NT-WIFI_2.4G', bssid: '88:a2:9e:11:07:fe', signal: 92, security: 'WPA2' },
        { active: false, ssid: 'Redmi 14C', bssid: '11:22:33:44:55:66', signal: 78, security: 'WPA2' },
        { active: false, ssid: 'UFI-651838', bssid: '22:33:44:55:66:77', signal: 65, security: 'WPA2' },
        { active: false, ssid: 'AK_2G', bssid: '33:44:55:66:77:88', signal: 48, security: 'WPA1 WPA2' },
        { active: false, ssid: 'Lobby_Guest_WiFi', bssid: '44:55:66:77:88:99', signal: 85, security: '' } // Open wifi
      ];
    }
  }

  /**
   * Run CLI command safely
   */
  _runCommand(cmd, timeoutMs = 15000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        childProcess.kill();
        reject(new Error(`Command timed out after ${timeoutMs}ms: ${cmd}`));
      }, timeoutMs);

      const childProcess = exec(cmd, (error, stdout, stderr) => {
        clearTimeout(timer);
        if (error) {
          reject(new Error(stderr.trim() || stdout.trim() || error.message));
        } else {
          resolve(stdout.trim());
        }
      });
    });
  }

  /**
   * Get current Wi-Fi status
   */
  async getStatus() {
    if (this.mode === 'mock') {
      return { success: true, ...this.mockState };
    }

    try {
      // 1. Check if Wi-Fi radio is enabled
      const radioState = await this._runCommand('nmcli radio wifi');
      const enabled = radioState.toLowerCase() === 'enabled';

      if (!enabled) {
        return {
          success: true,
          enabled: false,
          connected: false,
          ssid: null,
          bssid: null,
          signal: null,
          security: null
        };
      }

      // 2. Scan active device connection from wifi list
      const listOutput = await this._runCommand(
        'nmcli --colors no --terse --fields active,ssid,bssid,signal,security device wifi list'
      );

      if (!listOutput) {
        return {
          success: true,
          enabled: true,
          connected: false,
          ssid: null,
          bssid: null,
          signal: null,
          security: null
        };
      }

      const lines = listOutput.split('\n');
      for (const line of lines) {
        if (!line.trim()) continue;
        
        // Split by colon which is NOT escaped (unescaped colons)
        const parts = line.split(/(?<!\\):/);
        if (parts.length >= 5) {
          const active = parts[0].trim() === 'yes';
          if (active) {
            const ssid = parts[1].replace(/\\:/g, ':').trim();
            const bssid = parts[2].replace(/\\:/g, ':').trim();
            const signal = parseInt(parts[3], 10) || 0;
            const security = parts[4].replace(/\\:/g, ':').trim();

            return {
              success: true,
              enabled: true,
              connected: true,
              ssid: ssid || '[Hidden Network]',
              bssid,
              signal,
              security
            };
          }
        }
      }

      // If enabled but active not found in wifi list, double check device status
      const devStatus = await this._runCommand(`nmcli -t -f device,state,connection device`);
      const linesDev = devStatus.split('\n');
      for (const line of linesDev) {
        const parts = line.split(':');
        if (parts[0] === this.wifiInterface && parts[1] === 'connected') {
          return {
            success: true,
            enabled: true,
            connected: true,
            ssid: parts[2] || 'Connected',
            bssid: null,
            signal: null,
            security: null
          };
        }
      }

      return {
        success: true,
        enabled: true,
        connected: false,
        ssid: null,
        bssid: null,
        signal: null,
        security: null
      };

    } catch (err) {
      console.error('[WIFI SERVICE] Error getting status:', err.message);
      return {
        success: false,
        error: err.message,
        enabled: false,
        connected: false,
        ssid: null,
        bssid: null,
        signal: null,
        security: null
      };
    }
  }

  /**
   * Scan for available networks
   */
  async scanNetworks() {
    if (this.mode === 'mock') {
      if (!this.mockState.enabled) {
        return { success: true, networks: [] };
      }
      return { success: true, networks: this.mockNetworks };
    }

    try {
      // Trigger a rescan asynchronously (sometimes slow or fails, so we swallow error)
      try {
        await this._runCommand('nmcli device wifi rescan', 3000);
      } catch (scanErr) {
        // Ignored. Rescan might fail if another scan is already running.
      }

      const listOutput = await this._runCommand(
        'nmcli --colors no --terse --fields active,ssid,bssid,signal,security device wifi list'
      );

      if (!listOutput) {
        return { success: true, networks: [] };
      }

      const lines = listOutput.split('\n');
      const networkMap = new Map(); // Use map to filter duplicate SSIDs, keeping the strongest signal

      for (const line of lines) {
        if (!line.trim()) continue;
        
        // Split by unescaped colons
        const parts = line.split(/(?<!\\):/);
        if (parts.length >= 5) {
          const active = parts[0].trim() === 'yes';
          const ssid = parts[1].replace(/\\:/g, ':').trim();
          const bssid = parts[2].replace(/\\:/g, ':').trim();
          const signal = parseInt(parts[3], 10) || 0;
          const security = parts[4].replace(/\\:/g, ':').trim();

          // Skip hidden networks
          if (!ssid) continue;

          const networkObj = { active, ssid, bssid, signal, security };

          if (networkMap.has(ssid)) {
            // Keep the one with stronger signal
            if (signal > networkMap.get(ssid).signal) {
              networkMap.set(ssid, networkObj);
            }
          } else {
            networkMap.set(ssid, networkObj);
          }
        }
      }

      // Convert to array and sort by signal descending
      const networks = Array.from(networkMap.values()).sort((a, b) => b.signal - a.signal);
      return { success: true, networks };

    } catch (err) {
      console.error('[WIFI SERVICE] Error scanning:', err.message);
      return { success: false, error: err.message, networks: [] };
    }
  }

  /**
   * Connect to a network
   */
  async connect(ssid, password) {
    if (!ssid) {
      throw new Error('SSID is required');
    }

    if (this.mode === 'mock') {
      if (!this.mockState.enabled) {
        throw new Error('Wi-Fi radio is turned off');
      }

      // Simulate connection delay
      await new Promise(resolve => setTimeout(resolve, 2000));

      if (password === 'fail_me') {
        throw new Error('Incorrect Wi-Fi password (Simulated)');
      }

      // Update mock states
      this.mockNetworks = this.mockNetworks.map(net => {
        const isTarget = net.ssid === ssid;
        return { ...net, active: isTarget };
      });

      this.mockState.connected = true;
      this.mockState.ssid = ssid;
      this.mockState.signal = 90;
      this.mockState.security = ssid === 'Lobby_Guest_WiFi' ? '' : 'WPA2';
      
      const targetNet = this.mockNetworks.find(n => n.ssid === ssid);
      if (targetNet) {
        this.mockState.bssid = targetNet.bssid;
        this.mockState.security = targetNet.security;
      }

      return { success: true, message: `Connected to ${ssid} (Mock)` };
    }

    try {
      // Escape SSID double quotes
      const escapedSSID = ssid.replace(/"/g, '\\"');
      let cmd = `nmcli device wifi connect "${escapedSSID}"`;
      
      if (password) {
        const escapedPassword = password.replace(/"/g, '\\"');
        cmd += ` password "${escapedPassword}"`;
      }

      console.log(`[WIFI] Executing connect to: ${ssid}`);
      await this._runCommand(cmd, 25000); // 25s timeout for connection handshake

      return { success: true, message: `Successfully connected to ${ssid}` };
    } catch (err) {
      console.error(`[WIFI SERVICE] Connect failed for ${ssid}:`, err.message);
      throw new Error(err.message);
    }
  }

  /**
   * Disconnect from current network
   */
  async disconnect() {
    if (this.mode === 'mock') {
      this.mockState.connected = false;
      this.mockState.ssid = null;
      this.mockState.bssid = null;
      this.mockState.signal = null;
      this.mockState.security = null;

      this.mockNetworks = this.mockNetworks.map(net => ({ ...net, active: false }));
      return { success: true, message: 'Disconnected (Mock)' };
    }

    try {
      console.log(`[WIFI] Disconnecting from interface: ${this.wifiInterface}`);
      await this._runCommand(`nmcli device disconnect ${this.wifiInterface}`);
      return { success: true, message: 'Successfully disconnected' };
    } catch (err) {
      console.error(`[WIFI SERVICE] Disconnect failed:`, err.message);
      throw new Error(err.message);
    }
  }

  /**
   * Toggle Wi-Fi state (enable/disable radio)
   */
  async toggleWifi(enabled) {
    if (this.mode === 'mock') {
      this.mockState.enabled = enabled;
      if (!enabled) {
        this.mockState.connected = false;
        this.mockState.ssid = null;
        this.mockState.bssid = null;
        this.mockState.signal = null;
        this.mockState.security = null;
        this.mockNetworks = this.mockNetworks.map(net => ({ ...net, active: false }));
      }
      return { success: true, enabled };
    }

    try {
      const stateArg = enabled ? 'on' : 'off';
      console.log(`[WIFI] Setting radio wifi: ${stateArg}`);
      await this._runCommand(`nmcli radio wifi ${stateArg}`);
      return { success: true, enabled };
    } catch (err) {
      console.error(`[WIFI SERVICE] Toggle Wi-Fi failed:`, err.message);
      throw new Error(err.message);
    }
  }
}

module.exports = { WiFiService };
