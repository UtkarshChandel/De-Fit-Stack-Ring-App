/**
 * Ring Connection Manager
 * Robust connection management following official guide sequence:
 * 1. Scan for devices with fef5 service UUID
 * 2. Send deviceInfo1 command and wait for response
 * 3. Display device specs with connect button
 * 4. On connect, send deviceInfo2 with configuration
 * 5. Persist device ID for auto-reconnection
 * 6. Monitor vitals and fetch historical data
 */

import { BLEDevice } from '../../types/ble';
import {
  IDeviceInfo1,
  SmartRingX1
} from '../../types/ring';
import { ringBleModule } from '../bluetooth/BleModule';
import { RingCommandQueue } from '../commands/RingCommandQueue';
import { ringCommands } from '../commands/ringCommands';
import { DevicePersistenceService } from '../persistence/DevicePersistence';
import { RingSDK } from '../sdk/ringSDK';
import { useRingStore } from '../state/ringStore';

/**
 * Connection phases following official guide
 */
export enum ConnectionPhase {
  IDLE = 'idle',
  SCANNING = 'scanning',
  DEVICE_FOUND = 'device_found',
  REQUESTING_INFO = 'requesting_info', // deviceInfo1
  INFO_RECEIVED = 'info_received',     // Ready for user to connect
  CONNECTING = 'connecting',            // User clicked connect
  CONFIGURING = 'configuring',          // deviceInfo2 + config
  BOUND = 'bound',                      // Fully connected and configured
  MONITORING = 'monitoring',            // Collecting health data
  ERROR = 'error'
}

/**
 * Device discovery state
 */
interface DiscoveredDevice {
  bleDevice: BLEDevice;
  deviceInfo1?: IDeviceInfo1;
  lastPingTime?: number;
  pingAttempts: number;
  responseReceived: boolean;
}

/**
 * Connection configuration sent with deviceInfo2
 */
interface RingConfiguration {
  // Health monitoring intervals
  heartRateInterval: number;  // seconds
  stepCountInterval: number;  // seconds
  sleepMonitoringEnabled: boolean;
  temperatureInterval: number; // seconds
  spo2Interval: number;       // seconds

  // Data sync settings
  autoSyncEnabled: boolean;
  syncInterval: number;        // minutes
  historicalDataRetention: number; // days

  // Power management
  powerSaveMode: boolean;
  displayTimeout: number;      // seconds
}

export class RingConnectionManager {
  private static instance: RingConnectionManager;

  // Core services
  private commandQueue: RingCommandQueue;
  private ringSDK: RingSDK;
  private persistence: DevicePersistenceService;

  // Connection state
  private currentPhase: ConnectionPhase = ConnectionPhase.IDLE;
  private discoveredDevices: Map<string, DiscoveredDevice> = new Map();
  private targetDevice: DiscoveredDevice | null = null;
  private connectedDevice: SmartRingX1 | null = null;

  // Event listeners
  private listeners: Map<string, Function[]> = new Map();

  // Timing and retry configuration
  private readonly DEVICE_INFO1_TIMEOUT = 3000;
  private readonly DEVICE_INFO1_MAX_RETRIES = 3;
  private readonly DEVICE_INFO1_RETRY_INTERVAL = 2000;
  private readonly SCAN_DURATION = 10000;
  private readonly AUTO_RECONNECT_DELAY = 5000;

  // Ping management
  private pingTimers: Map<string, ReturnType<typeof setTimeout>> = new Map();
  private scanTimeout: ReturnType<typeof setTimeout> | null = null;

  private constructor() {
    this.commandQueue = new RingCommandQueue();
    this.ringSDK = RingSDK.getInstance();
    this.persistence = new DevicePersistenceService();

    this.setupEventHandlers();
  }

  public static getInstance(): RingConnectionManager {
    if (!RingConnectionManager.instance) {
      RingConnectionManager.instance = new RingConnectionManager();
    }
    return RingConnectionManager.instance;
  }

  /**
   * Setup BLE event handlers
   */
  private setupEventHandlers(): void {
    // Device discovery handler
    ringBleModule.setOnDiscovery((device: BLEDevice) => {
      this.handleDeviceDiscovered(device);
    });

    // Disconnection handler
    ringBleModule.setOnDisconnection((_deviceId) => {
      console.log('❌ BLE Disconnected');
      this.handleDisconnection();
    });

    // Data notification handler
    ringBleModule.setOnNotification((data) => {
      this.handleDataNotification(data);
    });
  }

  /**
   * Check for paired device and auto-connect
   */
  public async checkForPairedDevice(): Promise<boolean> {
    try {
      const stored = await DevicePersistenceService.getStoredDeviceInfo();

      if (stored && stored.deviceId) {
        console.log('📱 Found paired device:', stored.deviceId);

        // Start auto-reconnection
        this.currentPhase = ConnectionPhase.CONNECTING;

        // Try to connect directly
        const connected = await this.connectToDevice(stored.deviceId);

        if (connected) {
          console.log('✅ Auto-connected to paired device');
          return true;
        } else {
          console.log('⚠️ Failed to auto-connect, clearing pairing');
          await DevicePersistenceService.clearStoredDevice();
        }
      }

      return false;
    } catch (error) {
      console.error('Error checking for paired device:', error);
      return false;
    }
  }

  /**
   * Start scanning for Ring devices with fef5 service UUID
   */
  public async startScanning(): Promise<void> {
    if (this.currentPhase === ConnectionPhase.SCANNING) {
      console.log('Already scanning...');
      return;
    }

    this.currentPhase = ConnectionPhase.SCANNING;
    this.discoveredDevices.clear();
    this.clearAllPingTimers();

    console.log('🔍 Starting scan for devices with fef5 service UUID...');

    // Start BLE scan with service UUID filter
    await ringBleModule.startScan({
      serviceUUIDs: ['0000fef5-0000-1000-8000-00805f9b34fb'], // Ring service UUID
      allowDuplicates: false
    });

    // Auto-stop scan after timeout
    this.scanTimeout = setTimeout(() => {
      this.stopScanning();
    }, this.SCAN_DURATION);
  }

  /**
   * Stop scanning
   */
  public async stopScanning(): Promise<void> {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }

    this.clearAllPingTimers();
    await ringBleModule.stopScan();

    if (this.currentPhase === ConnectionPhase.SCANNING) {
      this.currentPhase = ConnectionPhase.IDLE;
    }

    console.log('🛑 Scanning stopped');
  }

  /**
   * Handle discovered device
   */
  private async handleDeviceDiscovered(device: BLEDevice): Promise<void> {
    // Check if device has the required service UUID
    const hasRingService = device.serviceUUIDs?.some(uuid =>
      uuid.toLowerCase().includes('fef5')
    );

    if (!hasRingService) {
      return; // Not a Ring device
    }

    console.log('📱 Ring device found:', device.id, device.name);

    // Store discovered device
    const discoveredDevice: DiscoveredDevice = {
      bleDevice: device,
      pingAttempts: 0,
      responseReceived: false
    };

    this.discoveredDevices.set(device.id, discoveredDevice);
    this.currentPhase = ConnectionPhase.DEVICE_FOUND;

    // Start pinging for deviceInfo1
    this.startDeviceInfo1Ping(device.id);
  }

  /**
   * Start pinging device with deviceInfo1 command
   */
  private async startDeviceInfo1Ping(deviceId: string): Promise<void> {
    const device = this.discoveredDevices.get(deviceId);
    if (!device) return;

    // Clear any existing ping timer
    this.clearPingTimer(deviceId);

    // Connect to device for communication
    const connected = await ringBleModule.connect(deviceId);
    if (!connected) {
      console.error('Failed to connect for deviceInfo1');
      return;
    }

    // Send deviceInfo1 command
    await this.sendDeviceInfo1(deviceId);

    // Set up retry timer
    const timer = setTimeout(() => {
      this.retryDeviceInfo1(deviceId);
    }, this.DEVICE_INFO1_RETRY_INTERVAL);

    this.pingTimers.set(deviceId, timer);
  }

  /**
   * Send deviceInfo1 command
   */
  private async sendDeviceInfo1(deviceId: string): Promise<void> {
    const device = this.discoveredDevices.get(deviceId);
    if (!device) return;

    device.pingAttempts++;
    device.lastPingTime = Date.now();

    console.log(`📤 Sending deviceInfo1 to ${deviceId} (attempt ${device.pingAttempts})`);

    this.currentPhase = ConnectionPhase.REQUESTING_INFO;

    // Queue the command with high priority
    await this.commandQueue.enqueue(
      async () => {
        await ringCommands.deviceInfo1();
      },
      'deviceInfo1',
      10
    );

    // Register response handler
    this.commandQueue.registerResponseHandler('deviceInfo1', () => {
      this.handleDeviceInfo1Response(deviceId);
    });
  }

  /**
   * Retry deviceInfo1 if no response
   */
  private async retryDeviceInfo1(deviceId: string): Promise<void> {
    const device = this.discoveredDevices.get(deviceId);
    if (!device) return;

    if (device.responseReceived) {
      console.log('✅ deviceInfo1 response already received');
      return;
    }

    if (device.pingAttempts >= this.DEVICE_INFO1_MAX_RETRIES) {
      console.log(`❌ Max retries reached for ${deviceId}`);
      this.clearPingTimer(deviceId);
      await ringBleModule.disconnect();
      return;
    }

    console.log(`🔄 Retrying deviceInfo1 for ${deviceId}`);
    await this.sendDeviceInfo1(deviceId);

    // Schedule next retry
    const timer = setTimeout(() => {
      this.retryDeviceInfo1(deviceId);
    }, this.DEVICE_INFO1_RETRY_INTERVAL);

    this.pingTimers.set(deviceId, timer);
  }

  /**
   * Handle deviceInfo1 response
   */
  private handleDeviceInfo1Response(deviceId: string): void {
    const device = this.discoveredDevices.get(deviceId);
    if (!device) return;

    device.responseReceived = true;
    this.clearPingTimer(deviceId);

    // Get the device info from store
    const store = useRingStore.getState();
    const deviceInfo1 = store.deviceInfo1;

    if (deviceInfo1) {
      device.deviceInfo1 = deviceInfo1;
      this.currentPhase = ConnectionPhase.INFO_RECEIVED;

      console.log('✅ Device info received:', {
        version: deviceInfo1.deviceVer,
        color: deviceInfo1.color,
        size: deviceInfo1.size,
      });

      // Update UI to show device specs with connect button
      this.updateDiscoveredDeviceUI(deviceId, deviceInfo1);

      // Disconnect after getting info (wait for user to click connect)
      ringBleModule.disconnect();
    }
  }

  /**
   * Update UI with device specifications
   */
  private updateDiscoveredDeviceUI(deviceId: string, info: IDeviceInfo1): void {
    const device = this.discoveredDevices.get(deviceId);
    if (!device) return;

    // Create SmartRingX1 object for UI
    const ringDevice: SmartRingX1 = {
      id: deviceId,
      name: device.bleDevice.name || 'Smart Ring',
      rssi: device.bleDevice.rssi || -100,
      color: info.color as 0 | 1 | 2 | 3,
      size: info.size,
      advertising: device.bleDevice.advertising,
    };

    // Update store for UI
    const store = useRingStore.getState();
    store.setDiscoveredDevices([...(store.discoveredDevices || []), ringDevice]);
  }

  /**
   * User clicked connect button - initiate full connection
   */
  public async connectToDevice(deviceId: string): Promise<boolean> {
    try {
      this.currentPhase = ConnectionPhase.CONNECTING;

      // Get device info
      const device = this.discoveredDevices.get(deviceId);
      if (!device) {
        throw new Error('Device not found');
      }

      this.targetDevice = device;

      console.log('🔗 Connecting to device:', deviceId);

      // Connect via BLE
      await ringBleModule.connect(deviceId);

      // Proceed with configuration immediately after connection
      await this.sendDeviceInfo2Configuration();
      return true;

    } catch (error) {
      console.error('Connection failed:', error);
      this.currentPhase = ConnectionPhase.ERROR;
      return false;
    }
  }

  /**
   * Send deviceInfo2 with configuration
   */
  private async sendDeviceInfo2Configuration(): Promise<void> {
    if (!this.targetDevice) return;

    this.currentPhase = ConnectionPhase.CONFIGURING;

    console.log('📤 Sending deviceInfo2 with configuration...');

    // Send deviceInfo2 command
    await this.commandQueue.enqueue(
      async () => {
        await ringCommands.deviceInfo2();
      },
      'deviceInfo2',
      10
    );

    // Wait for response
    await this.delay(2000);

    // Send configuration
    await this.configureHealthMonitoring();

    // Bind the device
    await this.bindDevice();
  }

  /**
   * Configure health monitoring intervals
   */
  private async configureHealthMonitoring(): Promise<void> {
    const config: RingConfiguration = {
      heartRateInterval: 60,        // Every minute
      stepCountInterval: 30,        // Every 30 seconds
      sleepMonitoringEnabled: true,
      temperatureInterval: 300,     // Every 5 minutes
      spo2Interval: 300,           // Every 5 minutes
      autoSyncEnabled: true,
      syncInterval: 15,             // Every 15 minutes
      historicalDataRetention: 30,  // 30 days
      powerSaveMode: false,
      displayTimeout: 10
    };

    console.log('⚙️ Configuring health monitoring:', config);

    // Send configuration commands
    // This would be implemented based on your Ring's specific protocol
    // For now, we'll use the time sync as an example
    await this.commandQueue.enqueue(
      async () => {
        await ringCommands.timeSyn();
      },
      'timeSyn',
      8
    );

    await this.delay(1000);

    // Enable notifications
    await ringBleModule.startNotification();
  }

  /**
   * Bind device and persist
   */
  private async bindDevice(): Promise<void> {
    if (!this.targetDevice) return;

    console.log('🔐 Binding device...');

    // Send bind command
    await this.commandQueue.enqueue(
      async () => {
        await ringCommands.deviceBind();
      },
      'deviceBind',
      9
    );

    await this.delay(2000);

    // Check bind status
    const store = useRingStore.getState();
    const deviceInfo2 = store.deviceInfo2;

    if (deviceInfo2?.bindStatus === 1) {
      console.log('✅ Device bound successfully');

      // Persist device for auto-reconnection
      const ringForStorage: SmartRingX1 = {
        id: this.targetDevice.bleDevice.id,
        name: this.targetDevice.bleDevice.name || 'Smart Ring',
        rssi: this.targetDevice.bleDevice.rssi || -100,
        color: (useRingStore.getState().deviceInfo1?.color ?? 0) as 0 | 1 | 2 | 3,
        size: useRingStore.getState().deviceInfo1?.size ?? 0,
        advertising: this.targetDevice.bleDevice.advertising,
      };
      const d1 = useRingStore.getState().deviceInfo1!;
      const d2 = useRingStore.getState().deviceInfo2!;
      await DevicePersistenceService.storeDeviceInfo(ringForStorage, d1, d2);
      await DevicePersistenceService.storePairingState('Bind', true, !!d1.switchOem);

      this.currentPhase = ConnectionPhase.BOUND;

      // Set connected device and update connection status in store
      this.connectedDevice = {
        id: this.targetDevice.bleDevice.id,
        name: this.targetDevice.bleDevice.name || 'Smart Ring',
        rssi: this.targetDevice.bleDevice.rssi || -100,
        color: (useRingStore.getState().deviceInfo1?.color ?? 0) as 0 | 1 | 2 | 3,
        size: useRingStore.getState().deviceInfo1?.size ?? 0,
        advertising: this.targetDevice.bleDevice.advertising,
      };
      useRingStore.getState().setConnectionStatus({
        isConnected: true,
        isConnecting: false,
        deviceId: this.connectedDevice.id,
        connectionError: null,
      });

      // Emit connection event
      this.emit('connectionStatusChanged', true);

      // Start monitoring
      this.startHealthMonitoring();
    } else {
      console.error('❌ Device bind failed');
      this.currentPhase = ConnectionPhase.ERROR;
    }
  }

  /**
   * Start health monitoring
   */
  private async startHealthMonitoring(): Promise<void> {
    this.currentPhase = ConnectionPhase.MONITORING;

    console.log('💓 Starting health monitoring...');

    // Request current health data
    await this.commandQueue.enqueue(
      async () => {
        await ringCommands.openHealth();
      },
      'openHealth',
      5
    );

    // Request battery status
    await this.commandQueue.enqueue(
      async () => {
        await ringCommands.batteryDataAndState();
      },
      'batteryDataAndState',
      4
    );

    // Fetch historical data
    await this.fetchHistoricalData();
  }

  /**
   * Fetch historical data
   */
  public async fetchHistoricalData(): Promise<void> {
    console.log('📊 Fetching historical data...');

    // First get the count of historical records
    await this.commandQueue.enqueue(
      async () => {
        await ringCommands.historicalNum();
      },
      'historicalNum',
      7
    );

    await this.delay(3000);

    // Then fetch the actual data
    const store = useRingStore.getState();
    const historicalCount = store.historicalDataCount;

    if (historicalCount && historicalCount > 0) {
      console.log(`📥 Fetching ${historicalCount} historical records...`);

      // Historical data is fetched all at once, not in batches
      await this.commandQueue.enqueue(
        async () => {
          await ringCommands.historicalData();
        },
        'historicalData',
        6
      );

      // Wait for data to be processed
      await this.delay(5000);
    }
  }

  /**
   * Handle disconnection
   */
  private async handleDisconnection(): Promise<void> {
    const wasMonitoring = this.currentPhase === ConnectionPhase.MONITORING;

    this.currentPhase = ConnectionPhase.IDLE;
    this.connectedDevice = null;
    this.targetDevice = null;

    // Clear command queue
    this.commandQueue.clear();

    // Update store
    const store = useRingStore.getState();
    store.setConnectionStatus({
      isConnected: false,
      isConnecting: false,
      deviceId: null,
      connectionError: null,
    });

    // If we were monitoring, try to auto-reconnect
    if (wasMonitoring) {
      console.log('🔄 Attempting auto-reconnection in 5 seconds...');
      setTimeout(() => {
        this.checkForPairedDevice();
      }, this.AUTO_RECONNECT_DELAY);
    }
  }

  /**
   * Handle data notifications from Ring
   */
  private handleDataNotification(data: any): void {
    console.log('📥 Data notification received:', data);

    // Signal command queue if waiting for response
    if (data.commandType) {
      this.commandQueue.signalResponse(data.commandType);
    }

    // Parse and emit health data events based on data type
    // The SDK should provide the parsed data in the store
    const store = useRingStore.getState();

    // Check for different types of health data and emit corresponding events
    if (data.heartRate !== undefined) {
      this.emit('heartRate', {
        heartRate: data.heartRate,
        timestamp: Date.now()
      });
    }

    if (data.oxygen !== undefined) {
      this.emit('oxygen', {
        oxygen: data.oxygen,
        timestamp: Date.now()
      });
    }

    if (data.temperature !== undefined) {
      this.emit('temperature', {
        temperature: data.temperature,
        timestamp: Date.now()
      });
    }

    if (data.steps !== undefined) {
      this.emit('steps', {
        steps: data.steps,
        timestamp: Date.now()
      });
    }

    // Handle battery updates
    if (data.batteryLevel !== undefined) {
      this.emit('battery', {
        level: data.batteryLevel,
        charging: data.isCharging || false,
        timestamp: Date.now()
      });
    }

    // Handle historical data
    if (data.historicalData) {
      this.emit('historicalData', data.historicalData);
    }
  }

  /**
   * Clear all ping timers
   */
  private clearAllPingTimers(): void {
    this.pingTimers.forEach(timer => clearTimeout(timer));
    this.pingTimers.clear();
  }

  /**
   * Clear specific ping timer
   */
  private clearPingTimer(deviceId: string): void {
    const timer = this.pingTimers.get(deviceId);
    if (timer) {
      clearTimeout(timer);
      this.pingTimers.delete(deviceId);
    }
  }

  /**
   * Helper delay function
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Get current connection phase
   */
  public getPhase(): ConnectionPhase {
    return this.currentPhase;
  }

  /**
   * Check if device is connected
   */
  public isConnected(): boolean {
    return this.currentPhase === ConnectionPhase.MONITORING ||
           this.currentPhase === ConnectionPhase.BOUND;
  }

  /**
   * Get discovered devices
   */
  public getDiscoveredDevices(): SmartRingX1[] {
    const devices: SmartRingX1[] = [];

    this.discoveredDevices.forEach((device, id) => {
      if (device.deviceInfo1) {
        devices.push({
          id,
          name: device.bleDevice.name || 'Smart Ring',
          rssi: device.bleDevice.rssi || -100,
          color: device.deviceInfo1.color as 0 | 1 | 2 | 3,
          size: device.deviceInfo1.size,
          advertising: device.bleDevice.advertising,
        });
      }
    });

    return devices;
  }

  /**
   * Get historical data count
   */
  public getHistoricalDataCount(): number {
    // This would be populated from the historicalNum response
    return useRingStore.getState().historicalData?.length || 0;
  }

  /**
   * Get historical data
   */
  public getHistoricalData(): any[] {
    return useRingStore.getState().historicalData || [];
  }

  /**
   * Get battery data from store
   */
  public getBatteryData(): { level: number; isCharging: boolean; isWireless?: boolean } | null {
    const store = useRingStore.getState();
    const batteryData = store.batteryData;

    if (batteryData) {
      return {
        level: batteryData.batteryPer,
        isCharging: batteryData.status === 'charging',
        isWireless: false // Not available in current data model
      };
    }

    return null;
  }

  /**
   * Disconnect from current device
   */
  public async disconnect(): Promise<void> {
    console.log('📴 Disconnecting from Ring...');

    this.currentPhase = ConnectionPhase.IDLE;
    await ringBleModule.disconnect();

    // Clear persistence if user manually disconnects
    await DevicePersistenceService.clearStoredDevice();

    // Emit disconnection event
    this.emit('connectionStatusChanged', false);
  }

  // Event emitter methods

  /**
   * Add event listener
   */
  public on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }

  /**
   * Remove event listener
   */
  public off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index >= 0) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  private emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          console.error(`Error in event handler for ${event}:`, error);
        }
      });
    }
  }
}

export const ringConnectionManager = RingConnectionManager.getInstance();