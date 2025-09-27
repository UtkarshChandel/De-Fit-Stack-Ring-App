/**
 * Clean Ring Connection Service
 * Simplified connection flow following official guide without redundancy
 */

import { BLEDevice } from '../../types/ble';
import { IDeviceInfo1, IDeviceInfo2, SmartRingX1 } from '../../types/ring';
import { ringBleModule } from '../bluetooth/BleModule';
import { RingCommandQueue } from '../commands/RingCommandQueue';
import { ringCommands } from '../commands/ringCommands';
import { DevicePersistenceService } from '../persistence/DevicePersistence';
import { RingSDK } from '../sdk/ringSDK';
import { useRingStore } from '../state/ringStore';

/**
 * Connection state - simplified
 */
export enum ConnectionState {
  IDLE = 'idle',
  SCANNING = 'scanning',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  ERROR = 'error'
}

export class CleanRingConnection {
  private static instance: CleanRingConnection;
  
  private commandQueue: RingCommandQueue;
  private ringSDK: RingSDK;
  private state: ConnectionState = ConnectionState.IDLE;
  private connectedDeviceId: string | null = null;
  private isInitialized = false;
  
  // Simplified state management - only track what we're actually doing
  private currentOperation: 'scanning' | 'connecting' | 'idle' = 'idle';
  private scanTimeout: NodeJS.Timeout | null = null;

  // OEM verification tracking
  private oemVerificationInProgress = false;
  private oemVerificationCallback: ((cmd: string, data: any) => void) | null = null;
  private syncCompletionPromise: Promise<boolean> | null = null;
  private syncCompletionResolve: ((value: boolean) => void) | null = null;
  private keepAliveTimer?: any;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;
  private lastActivityTime: number = Date.now();
  
  private constructor() {
    this.commandQueue = new RingCommandQueue();
    this.ringSDK = RingSDK.getInstance();
    
    // Set up connection check callback for command queue
    this.commandQueue.setConnectionCheck(() => {
      // Commands can be sent when connected or during the connecting process
      return this.state === 'connected' || this.state === 'connecting';
    });
    
    this.initialize();
  }
  
  public static getInstance(): CleanRingConnection {
    if (!CleanRingConnection.instance) {
      console.log('📌 Creating new CleanRingConnection instance');
      CleanRingConnection.instance = new CleanRingConnection();
    } else {
      console.log('📌 Returning existing CleanRingConnection instance');
    }
    return CleanRingConnection.instance;
  }
  
  /**
   * Initialize SDK and BLE handlers once
   */
  private async initialize(): Promise<void> {
    if (this.isInitialized) {
      console.log('⚠️ Ring connection service already initialized');
      return;
    }
    
    console.log('🔧 Initializing Ring connection service...');
    
    // Setup BLE event handlers
    ringBleModule.setOnConnection(() => {
      console.log('✅ BLE Connected (callback)');
      // Don't change state here - let connectAndSetup manage the state transition
      // This callback is now mainly for logging
    });
    
    ringBleModule.setOnDisconnection(() => {
      console.log('❌ BLE Disconnected');
      const previousState = this.state;
      this.state = ConnectionState.IDLE;
      this.connectedDeviceId = null;
      this.currentOperation = 'idle'; // Reset operation state on disconnect
      this.handleDisconnection(previousState);
    });
    
    ringBleModule.setOnNotification((data: any) => {
      console.log('📦 CleanRingConnection notification handler triggered');
      // Feed to SDK for processing only once
      this.ringSDK.pushRawData(data);
    });
    
    // Setup SDK listeners once using the correct register methods
    this.ringSDK.registerDeviceInfo1Listener({
      onResult: async (info: IDeviceInfo1) => {
        console.log('📱 DeviceInfo1 received:', info);
        useRingStore.getState().setDeviceInfo1(info);

        // CRITICAL: Handle OEM verification decision HERE in the listener
        if (this.currentOperation === 'connecting') {
          if (info.switchOem) {
            console.log('🔐 Device requires OEM verification, starting OEM flow...');
            // Start OEM verification which will trigger oemSync when complete
            this.startOEMVerification();
          } else {
            console.log('✅ Non-OEM device, continuing with normal sync flow...');
            // For non-OEM devices, continue with deviceInfo2 → bind → sync
            setTimeout(() => this.continueNonOemSync(), 500);
          }
        }
      }
    });
    
    this.ringSDK.registerDeviceInfo2Listener({
      onResult: (info: IDeviceInfo2) => {
        console.log('📱 DeviceInfo2 received:', info);
        useRingStore.getState().setDeviceInfo2(info);
      }
    });
    
    this.ringSDK.registerBatteryDataAndStateListener({
      onResult: (battery: any) => {
        console.log('🔋 Battery received:', battery);
        useRingStore.getState().setBatteryData({
          batteryValue: battery.batteryValue || 0,
          batteryPer: battery.batteryPer || 0,
          status: battery.status === 1 ? 'charging' : 'uncharged'
        });
      }
    });

    // Register historical data listeners
    this.ringSDK.registerHistoricalNumListener({
      onResult: (data: any) => {
        console.log('📊 Historical number data received:', data);
        if (data && data.num !== undefined) {
          console.log(`📈 Ring has ${data.num} historical records`);
          // Store the count in the store
          useRingStore.getState().setHistoricalDataCount(data.num);
        }
      }
    });

    // Register OEM result listener - triggers OEM sync flow
    this.ringSDK.registerOEMResultListener({
      onResult: async (data: any) => {
        console.log('🔐 OEM verification result received:', data);
        this.oemVerificationInProgress = false;

        if (data) {
          console.log('✅ OEM verification successful, starting OEM sync flow...');
          // For OEM devices: Skip deviceInfo2, go straight to battery → bind → sync
          setTimeout(() => this.performOemSync(), 500);
        } else {
          console.log('❌ OEM verification failed');
          this.state = ConnectionState.ERROR;
          this.completeSyncFlow(false);
          await this.disconnect();
        }
      }
    });

    this.ringSDK.registerHistoricalDataListener({
      onResult: (data: any) => {
        console.log('📊 Historical data record received:', data);
        if (data) {
          // Process and store historical data
          const historicalRecord = {
            timeStamp: data.timeStamp || data.ts,
            heartRate: data.heartRate,
            motionDetectionCount: data.motionDetectionCount || 0,
            detectionMode: data.detectionMode === 1 ? "BloodOxygenMode" : "HeartRateMode",
            wearStatus: data.wearStatus === 1 ? "wear" : "noWear",
            chargeStatus: data.chargeStatus === 1 ? "charging" : "uncharged",
            uuid: data.uuid,
            hrv: data.hrv || 0,
            temperature: data.finger_temperature || data.temperature || 0,
            step: data.step || data.steps || 0,
            ox: data.ox || data.bloodOxygen || 0,
            rawHr: data.rawHr || []
          };

          // Add to store
          useRingStore.getState().addHistoricalData([historicalRecord]);
          console.log(`✅ Stored historical record ${data.uuid}`);
        }
      }
    });

    this.isInitialized = true;
    console.log('✅ Ring connection service initialized');
  }
  
  /**
   * Auto-connect to Ring device (SR09_xxxx pattern)
   */
  public async autoConnect(): Promise<boolean> {
    console.log('🔄 Looking for Smart Ring devices (SR09_xxxx)...');
    
    // Check if we have a stored device
    const storedDevice = await DevicePersistenceService.getStoredDeviceInfo();
    
    if (storedDevice && storedDevice.bleAddress) {
      console.log('📱 Found stored device, looking for:', storedDevice.bleAddress);
      
      // Try to find the specific stored device
      const devices = await this.scanForDevice(storedDevice.bleAddress, 10000);
      
      if (devices.length > 0) {
        const device = devices[0];
        console.log('✅ Found stored Ring device:', device.name, device.id);
        return await this.connectAndSetup(device.id);
      } else {
        console.log('⚠️ Stored device not found, scanning for any Ring device...');
      }
    }
    
    // Scan for any Ring device (SR09_xxxx pattern, filtered in discovery handler)
    const devices = await this.startScan(10000);
    
    if (devices.length === 0) {
      console.log('❌ No Smart Ring devices found');
      return false;
    }
    
    // Connect to first Ring device found
    const device = devices[0];
    console.log('✅ Found Smart Ring device:', device.name, device.id);
    return await this.connectAndSetup(device.id);
  }
  
  /**
   * Scan for Ring devices with fef5 service UUID
   * @param duration Scan duration in milliseconds
   * @param showAllRings If true, shows all Ring devices even if not the stored one
   */
  public async startScan(duration: number = 10000, showAllRings: boolean = true): Promise<SmartRingX1[]> {
    if (this.currentOperation !== 'idle') {
      console.log(`Cannot scan - currently ${this.currentOperation}`);
      return [];
    }
    
    this.currentOperation = 'scanning';
    this.state = ConnectionState.SCANNING;
    const devices: Map<string, SmartRingX1> = new Map();
    
    try {
      console.log('🔍 Scanning for Ring devices...');
      
      // Ensure BLE is initialized
      const isEnabled = await ringBleModule.isBluetoothEnabled();
      if (!isEnabled) {
        throw new Error('Bluetooth is not enabled');
      }
      
      // Set discovery handler BEFORE starting scan
      ringBleModule.setOnDiscovery((device: BLEDevice) => {
        const deviceName = (device.name || '').toUpperCase();
        
        // Check if this is a Ring device (SR09_xxxx pattern, not the charger SR09WC)
        const isRingDevice = deviceName.startsWith('SR09_');
        const isCharger = deviceName === 'SR09WC' || deviceName.includes('SR09WC');
        
        if (isCharger) {
          console.log('🔌 Found Ring Charger (ignoring):', device.name, device.id);
          return; // Skip charger devices
        }
        
        if (isRingDevice) {
          console.log('💍 Found Smart Ring device:', device.name, device.id, 'RSSI:', device.rssi);
          
          // Add Ring device to collection
          if (!devices.has(device.id)) {
            devices.set(device.id, {
              id: device.id,
              name: device.name || 'Smart Ring',
              rssi: device.rssi || -100,
              color: 0,  // Default color, will be updated after deviceInfo1
              size: 0,   // Default size, will be updated after deviceInfo1
              isConnected: false,
              lastSeen: new Date()
            } as SmartRingX1);
            console.log(`✅ Ring device added to collection. Total devices: ${devices.size}`);
          } else {
            // Update RSSI for existing device
            const existing = devices.get(device.id);
            if (existing) {
              existing.rssi = device.rssi || existing.rssi;
            }
          }
        } else if (device.name) {
          // Log other devices for debugging but don't add them
          console.log('📡 Other BLE device found (not a Ring):', device.name, device.id);
        }
      });
      
      // Start scan
      await ringBleModule.startScan({
        serviceUUIDs: ['0000fef5-0000-1000-8000-00805f9b34fb']
      });
      
      // Wait for scan to complete
      await this.delay(duration);
      
      // Stop scan
      await this.stopScan();
      
      // CRITICAL: Add delay after scan stop to let BLE settle
      console.log('⏳ Waiting for BLE to settle after scan stop...');
      await this.delay(500); // Give BLE time to fully stop scanning
      
      const deviceArray = Array.from(devices.values());
      console.log(`🔍 Scan complete. Found ${deviceArray.length} devices`);
      
      return deviceArray;
      
    } catch (error) {
      console.error('Scan failed:', error);
      this.state = ConnectionState.ERROR;
      return [];
    } finally {
      this.currentOperation = 'idle';
    }
  }
  
  /**
   * Scan for specific device by BLE address
   */
  private async scanForDevice(bleAddress: string, duration: number): Promise<SmartRingX1[]> {
    console.log(`🔎 Scanning for specific device: ${bleAddress}`);
    const devices = await this.startScan(duration, false); // Don't show all rings, just scan
    
    // Filter for matching device
    const matched = devices.filter(device => {
      const id = device.id.toLowerCase().replace(/:/g, '');
      const target = bleAddress.toLowerCase().replace(/:/g, '');
      const nameMatch = device.name && device.name.toLowerCase().includes('sr09_');
      const addressMatch = id === target || id.includes(target) || target.includes(id);
      
      const matches = nameMatch && addressMatch;
      
      if (matches) {
        console.log(`✅ Found matching Ring device: ${device.name} (${device.id})`);
      }
      
      return matches;
    });
    
    console.log(`📊 Matched ${matched.length} Ring device(s) out of ${devices.length} total`);
    return matched;
  }
  
  /**
   * Stop scanning
   */
  public async stopScan(): Promise<void> {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    
    await ringBleModule.stopScan();
    this.state = ConnectionState.IDLE;
    console.log('🛑 Scan stopped');
  }
  
  /**
   * Connect to device and run setup sequence
   */
  public async connectAndSetup(deviceId: string): Promise<boolean> {
    if (this.currentOperation !== 'idle') {
      console.log(`Cannot connect - currently ${this.currentOperation}`);
      return false;
    }
    
    try {
      // Extra delay to ensure scan is completely stopped
      console.log('⏳ Ensuring BLE is ready for connection...');
      await this.delay(300);
      
      this.currentOperation = 'connecting';
      this.state = ConnectionState.CONNECTING;
      this.connectedDeviceId = deviceId;
      
      console.log('🔗 Connecting to:', deviceId);
      
      // 1. Connect via BLE with retry logic
      let connected = false;
      let retryCount = 0;
      const maxRetries = 2;
      
      while (!connected && retryCount <= maxRetries) {
        try {
          if (retryCount > 0) {
            console.log(`🔄 Retry attempt ${retryCount} of ${maxRetries}...`);
            await this.delay(1000); // Wait before retry
          }
          
          connected = await ringBleModule.connect(deviceId);
          
          if (connected) {
            console.log('✅ Connection successful!');
            break;
          }
        } catch (connectError) {
          const error = connectError as Error;
          console.error(`Connection attempt ${retryCount + 1} failed:`, error?.message || 'Unknown error');
          if (error?.message && error.message.includes('cancelled')) {
            console.log('🔍 Detected cancellation error, will retry...');
          }
        }
        retryCount++;
      }
      
      if (!connected) {
        throw new Error(`BLE connection failed after ${maxRetries} retries`);
      }
      
      // Since we no longer trigger premature state changes in callbacks,
      // we don't need to check state here
      
      // 2. Start notifications
      await ringBleModule.startNotification();
      
      // Small delay to ensure notification setup is complete
      await this.delay(500);
      
      // Now we can consider ourselves connected for command sending
      // But keep state as CONNECTING until full setup is done
      
      // Check connection before sending commands
      if (!await this.isStillConnected()) {
        console.log('❌ Device disconnected before deviceInfo1');
        return false;
      }
      
      // 3. Get deviceInfo1 - this will trigger the entire sync flow
      console.log('📱 Fetching device information...');

      // Set up sync completion promise before sending deviceInfo1
      this.setupSyncCompletionPromise();

      await this.sendCommand('deviceInfo1');

      // The deviceInfo1 listener will handle the rest:
      // - Check for OEM requirement
      // - Start OEM verification OR continue with non-OEM flow
      // Wait for the entire sync flow to complete
      const syncSuccess = await this.waitForSyncCompletion();

      if (!syncSuccess) {
        console.log('❌ Sync flow failed');
        return false;
      }

      console.log('✅ Sync flow completed successfully');
      return true;
      
    } catch (error) {
      const err = error as Error;
      console.error('Connection failed:', err);
      this.state = ConnectionState.ERROR;

      // Update store to reflect disconnection
      const store = useRingStore.getState();
      store.setConnectionStatus({
        isConnected: false,
        isConnecting: false,
        deviceId: null,
        connectionError: err?.message || 'Connection failed'
      });
      
      await this.disconnect();
      return false;
      
    } finally {
      // Only reset to idle if we're still in connecting state (not if disconnected)
      if (this.currentOperation === 'connecting') {
        this.currentOperation = 'idle';
      }
    }
  }
  
  /**
   * Setup sync completion promise
   */
  private setupSyncCompletionPromise(): void {
    this.syncCompletionPromise = new Promise<boolean>((resolve) => {
      this.syncCompletionResolve = resolve;
    });
  }

  /**
   * Wait for sync flow to complete
   */
  private async waitForSyncCompletion(): Promise<boolean> {
    if (!this.syncCompletionPromise) {
      console.error('Sync completion promise not set up');
      return false;
    }

    // Add timeout to prevent hanging forever
    const timeout = new Promise<boolean>((resolve) => {
      setTimeout(() => {
        console.log('⚠️ Sync flow timeout after 30 seconds');
        resolve(false);
      }, 30000);
    });

    return Promise.race([this.syncCompletionPromise, timeout]);
  }

  /**
   * Complete the sync flow
   */
  private completeSyncFlow(success: boolean): void {
    if (this.syncCompletionResolve) {
      this.syncCompletionResolve(success);
      this.syncCompletionResolve = null;
      this.syncCompletionPromise = null;
    }
  }

  /**
   * Start OEM verification
   */
  private startOEMVerification(): void {
    this.oemVerificationInProgress = true;

    // Set up the OEM command callback
    this.oemVerificationCallback = async (cmd: string, cmdData: any) => {
      console.log(`🔐 OEM verification sending command: ${cmd}`, cmdData);

      // Send the OEM command through ringCommands
      try {
        await ringCommands.sendCommand(cmd, cmdData);
      } catch (error) {
        console.error('OEM command failed:', error);
      }
    };

    // Start OEM verification
    this.ringSDK.startOEMVerify(this.oemVerificationCallback);
  }

  /**
   * Continue non-OEM sync flow (deviceInfo2 → bind → sync)
   */
  private async continueNonOemSync(): Promise<void> {
    try {
      console.log('🔄 Starting non-OEM sync flow...');

      // 1. Get battery status
      console.log('🔋 Getting battery status...');
      await this.sendCommand('batteryDataAndState');
      await this.delay(1500);

      // 2. Get deviceInfo2
      console.log('📱 Getting deviceInfo2...');
      await this.sendCommand('deviceInfo2');
      await this.delay(2000);

      const info2 = useRingStore.getState().deviceInfo2;
      if (info2) {
        console.log('✅ Device Info 2 received:');
        console.log('  - Serial Number:', info2.sn);
        console.log('  - Bind Status:', info2.bindStatus);
      }

      // 3. Complete common sync steps
      await this.completeCommonSync();

    } catch (error) {
      console.error('Non-OEM sync failed:', error);
      this.completeSyncFlow(false);
    }
  }

  /**
   * Perform OEM sync flow (no deviceInfo2)
   */
  private async performOemSync(): Promise<void> {
    try {
      console.log('🔄 Starting OEM sync flow (no deviceInfo2)...');

      // 1. Get battery status
      console.log('🔋 Getting battery status...');
      await this.sendCommand('batteryDataAndState');
      await this.delay(1500);

      // 2. Skip deviceInfo2 for OEM devices
      console.log('ℹ️ Skipping deviceInfo2 for OEM device');

      // 3. Complete common sync steps
      await this.completeCommonSync();

    } catch (error) {
      console.error('OEM sync failed:', error);
      this.completeSyncFlow(false);
    }
  }

  /**
   * Complete common sync steps (bind → time → historical)
   */
  private async completeCommonSync(): Promise<void> {
    try {
      // 1. Bind device if needed
      const info2 = useRingStore.getState().deviceInfo2;
      const isBound = info2?.bindStatus === 'Bind' || info2?.bindStatus === 1;

      if (!isBound) {
        console.log('🔐 Binding device...');
        await this.sendCommand('deviceBind');
        await this.delay(1500);
      } else {
        console.log('✅ Device already bound');
      }

      // 2. Sync time
      console.log('⏰ Syncing time...');
      await this.sendCommand('timeSyn');
      await this.delay(1500);

      // 3. Get historical data with improved stability
      console.log('📊 Getting historical data...');
      await this.sendCommand('historicalNum');
      await this.delay(3000); // Increased delay for stability

      const historicalCount = useRingStore.getState().historicalDataCount || 0;
      if (historicalCount > 0) {
        console.log(`📥 Fetching ${historicalCount} historical records...`);

        // Add keep-alive during long data transfer
        const keepAliveInterval = setInterval(async () => {
          if (this.state === 'connected' || this.state === 'connecting') {
            console.log('💓 Keep-alive: checking battery status...');
            await this.sendCommand('batteryDataAndState');
          }
        }, 10000); // Keep-alive every 10 seconds

        try {
          await this.sendCommand('historicalData');
          // Allow more time for large data transfers
          const waitTime = Math.min(historicalCount * 10, 30000); // Max 30 seconds
          await this.delay(waitTime);

          // Clean historical data from device after successful sync
          console.log('🧹 Cleaning historical data from device...');
          await this.sendCommand('cleanHistoricalData');
          await this.delay(1000);
        } finally {
          clearInterval(keepAliveInterval);
        }
      }

      // 4. Save device info
      const info1 = useRingStore.getState().deviceInfo1;
      const deviceId = this.connectedDeviceId;

      if (deviceId && info1) {
        await this.saveDevice(deviceId, info1, info2 || {} as IDeviceInfo2);
      }

      // 5. Enable BLE notifications (like yoihealth)
      console.log('🔔 Enabling BLE notifications...');
      try {
        await ringBleModule.startNotification();
        console.log('✅ BLE notifications enabled');
      } catch (error) {
        console.warn('⚠️ Failed to enable notifications:', error);
        // Continue anyway - notifications might already be enabled
      }

      // 6. Update connection state
      this.state = ConnectionState.CONNECTED;
      this.currentOperation = 'idle';

      const store = useRingStore.getState();
      store.setConnectionStatus({
        isConnected: true,
        isConnecting: false,
        deviceId: deviceId,
        connectionError: null
      });

      console.log('✅ Device sync completed successfully');
      this.completeSyncFlow(true);

      // Start keep-alive mechanism
      this.startKeepAlive();
      console.log('💓 Keep-alive mechanism started');

    } catch (error) {
      console.error('Common sync failed:', error);
      this.completeSyncFlow(false);
    }
  }

  /**
   * Send a single command without duplicate checking
   */
  private async sendCommand(command: string): Promise<void> {
    // Check if we're still connected before sending (use string literals to avoid enum issues)
    if (this.state !== 'connected' && this.state !== 'connecting') {
      console.log(`⚠️ Cannot send command '${command}' - not connected (state: ${this.state})`);
      throw new Error('Device not connected');
    }
    
    console.log(`📤 Sending command: ${command}`);

    // Update activity timestamp
    this.updateActivityTime();

    await this.commandQueue.enqueue(
      async () => {
        // Double-check connection state inside the queue (use string literals to avoid enum issues)
        if (this.state !== 'connected' && this.state !== 'connecting') {
          console.log(`⚠️ Command '${command}' aborted - device disconnected`);
          throw new Error('Device disconnected during command execution');
        }
        
        switch (command) {
          case 'deviceInfo1':
            await ringCommands.deviceInfo1();
            break;
          case 'deviceInfo2':
            await ringCommands.deviceInfo2();
            break;
          case 'deviceBind':
            await ringCommands.deviceBind();
            break;
          case 'timeSyn':
            await ringCommands.timeSyn();
            break;
          case 'batteryDataAndState':
            await ringCommands.batteryDataAndState();
            break;
          case 'healthMonitoring':
            await ringCommands.healthMonitoring();
            break;
          case 'openHealth':
            await ringCommands.openHealth();
            break;
          case 'closeHealth':
            await ringCommands.closeHealth();
            break;
          case 'openSingleHealth':
            await ringCommands.openSingleHealth();
            break;
          case 'closeSingleHealth':
            await ringCommands.closeSingleHealth();
            break;
          case 'historicalNum':
            await ringCommands.historicalNum();
            break;
          case 'historicalData':
            await ringCommands.historicalData();
            break;
          case 'cleanHistoricalData':
            await ringCommands.cleanHistoricalData();
            break;
          default:
            console.error('Unknown command:', command);
        }
      },
      command,
      5
    );
  }
  
  /**
   * Save device for persistence
   */
  private async saveDevice(deviceId: string, info1: IDeviceInfo1, info2: IDeviceInfo2): Promise<void> {
    try {
      const ring: SmartRingX1 = {
        id: deviceId,
        name: `SR09_${deviceId.slice(-4)}`, // Use last 4 chars of device ID in name
        rssi: -70,
        color: info1?.color ?? 0,
        size: info1?.size ?? 0,
        isConnected: true,
        lastSeen: new Date()
      } as SmartRingX1;
      
      await DevicePersistenceService.storeDeviceInfo(ring, info1, info2);
      // Store pairing state based on actual bind status
      const bindStatusString = typeof info2.bindStatus === 'string' ? info2.bindStatus :
                               info2.bindStatus === 1 ? 'Bind' : 'Unbind';
      await DevicePersistenceService.storePairingState(bindStatusString as 'Bind' | 'Unbind', true, true);
      
      console.log('✅ SR09WC device saved for auto-reconnection');
    } catch (error) {
      console.error('Failed to save device:', error);
    }
  }
  
  /**
   * Disconnect from current device
   */
  public async disconnect(): Promise<void> {
    this.commandQueue.clear();
    await ringBleModule.disconnect();
    this.state = ConnectionState.IDLE;
    this.connectedDeviceId = null;
  }
  
  /**
   * Handle disconnection
   */
  private async handleDisconnection(previousState?: ConnectionState): Promise<void> {
    const store = useRingStore.getState();
    const wasConnecting = previousState === ConnectionState.CONNECTING;

    // Stop keep-alive
    this.stopKeepAlive();

    // Update state immediately
    store.setConnectionStatus({
      isConnected: false,
      isConnecting: false,
      deviceId: null,
      connectionError: 'Device disconnected'
    });

    // Clear data
    this.commandQueue.clear();

    // Don't auto-reconnect if we were in the middle of connecting
    if (wasConnecting) {
      console.log('⚠️ Disconnected during connection setup - not auto-reconnecting');
      this.reconnectAttempts = 0;
      return;
    }

    // Try auto-reconnect with backoff if it was unexpected and we were previously connected
    if (this.connectedDeviceId && previousState === 'connected' &&
        this.reconnectAttempts < this.maxReconnectAttempts) {
      this.reconnectAttempts++;
      const backoffTime = Math.min(5000 * Math.pow(2, this.reconnectAttempts - 1), 30000); // Exponential backoff, max 30s
      console.log(`🔄 Reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${backoffTime/1000}s...`);

      setTimeout(async () => {
        const connected = await this.autoConnect();
        if (connected) {
          this.reconnectAttempts = 0; // Reset on successful reconnection
        }
      }, backoffTime);
    } else if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('❌ Max reconnection attempts reached. Please reconnect manually.');
      this.reconnectAttempts = 0;
    }
  }
  
  /**
   * Start keep-alive mechanism
   */
  private startKeepAlive(): void {
    this.stopKeepAlive(); // Clear any existing timer

    this.keepAliveTimer = setInterval(async () => {
      if (this.state === ConnectionState.CONNECTED) {
        const timeSinceLastActivity = Date.now() - this.lastActivityTime;

        // Send keep-alive if no activity for 4.5 minutes (270 seconds)
        if (timeSinceLastActivity > 270000) {
          console.log('💓 Sending keep-alive signal...');
          try {
            await this.sendCommand('batteryDataAndState');
            this.lastActivityTime = Date.now();
          } catch (error) {
            console.warn('⚠️ Keep-alive failed:', error);
            // Connection might be lost
            await this.handleDisconnection(ConnectionState.CONNECTED);
          }
        }
      }
    }, 300000); // Check every 5 minutes (300 seconds)
  }

  /**
   * Stop keep-alive mechanism
   */
  private stopKeepAlive(): void {
    if (this.keepAliveTimer) {
      clearInterval(this.keepAliveTimer);
      this.keepAliveTimer = undefined;
    }
  }

  /**
   * Update activity timestamp
   */
  private updateActivityTime(): void {
    this.lastActivityTime = Date.now();
  }

  /**
   * Fetch historical data
   */
  public async fetchHistoricalData(): Promise<void> {
    if (this.state !== 'connected') {
      console.log('Not connected');
      return;
    }
    
    console.log('📊 Fetching historical data...');
    
    // Get count
    await this.sendCommand('historicalNum');
    await this.delay(2000);
    
    // Then fetch data
    await this.sendCommand('historicalData');
  }
  
  /**
   * Get health monitoring data
   */
  public async getHealthData(): Promise<void> {
    if (this.state !== 'connected') {
      console.log('Not connected');
      return;
    }
    
    await this.sendCommand('healthMonitoring');
    await this.sendCommand('batteryDataAndState');
  }
  
  /**
   * Start continuous health monitoring
   */
  public async startHealthMonitoring(): Promise<boolean> {
    if (this.state !== 'connected') {
      console.log('Not connected');
      return false;
    }
    
    try {
      console.log('🏥 Starting health monitoring...');
      
      // Send command to open health monitoring
      await this.sendCommand('openHealth');
      await this.delay(1000);
      
      // Also enable single health for real-time data
      await this.sendCommand('openSingleHealth');
      await this.delay(500);
      
      console.log('✅ Health monitoring started');
      return true;
    } catch (error) {
      console.error('Failed to start health monitoring:', error);
      return false;
    }
  }
  
  /**
   * Stop health monitoring
   */
  public async stopHealthMonitoring(): Promise<boolean> {
    if (this.state !== 'connected') {
      console.log('Not connected');
      return false;
    }
    
    try {
      console.log('🛑 Stopping health monitoring...');
      
      // Send command to close health monitoring
      await this.sendCommand('closeHealth');
      await this.delay(500);
      
      // Also close single health
      await this.sendCommand('closeSingleHealth');
      await this.delay(500);
      
      console.log('✅ Health monitoring stopped');
      return true;
    } catch (error) {
      console.error('Failed to stop health monitoring:', error);
      return false;
    }
  }
  
  /**
   * Helper delay
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  /**
   * Get connection state
   */
  public getState(): ConnectionState {
    return this.state;
  }
  
  /**
   * Check if connected
   */
  public isConnected(): boolean {
    return this.state === 'connected';
  }
  
  /**
   * Check if still connected to BLE device
   */
  private async isStillConnected(): Promise<boolean> {
    // Check our internal state first (use string literals to avoid enum issues)
    if (this.state !== 'connecting' && this.state !== 'connected') {
      return false;
    }
    
    // Check if BLE module reports connection
    try {
      const isConnected = await ringBleModule.isConnected();
      if (!isConnected) {
        console.log('⚠️ BLE module reports device disconnected');
        this.state = ConnectionState.IDLE;
        return false;
      }
      return true;
    } catch (error) {
      console.error('Error checking connection status:', error);
      return false;
    }
  }
}

export const cleanRingConnection = CleanRingConnection.getInstance();