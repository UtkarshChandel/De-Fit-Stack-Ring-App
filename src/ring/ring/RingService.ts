/**
 * Ring Service - Main Service Class
 * High-level wrapper that orchestrates all Ring functionality
 * Provides a clean API for the UI layer to interact with Ring devices
 */

import {
  ConnectionStatus,
  HealthReading,
  IBattery,
  IDeviceInfo1,
  IDeviceInfo2,
  IHistorical,
  SleepData,
  SmartRingX1
} from '../types/ring';
import { ringBleModule } from './bluetooth/BleModule';
import { RingCommandQueue } from './commands/RingCommandQueue';
import { ringCommands } from './commands/ringCommands';
import { BatteryProcessor } from './data/processors/batteryProcessor';
import { healthMetricsProcessor } from './data/processors/healthMetrics';
import { sleepAnalysisProcessor } from './data/processors/sleepAnalysis';
import { DevicePersistenceService, PairingState, StoredDeviceInfo } from './persistence/DevicePersistence';
import { RingSDK } from './sdk/ringSDK';
import { useRingStore } from './state/ringStore';

/**
 * Main Ring Service Class
 * Centralized service for all Ring device operations
 */
export class RingService {
  private static instance: RingService;
  private ringSDK: RingSDK;
  private commandQueue: RingCommandQueue;
  private isInitialized = false;
  private startOem = false; // OEM verification control flag (manufacturer pattern)
  private isManualDisconnection = false; // Flag to prevent auto-reconnect on manual disconnect
  private reconnectionPromise: Promise<boolean> | null = null; // Track ongoing reconnection

  // Connection Persistence State (YoiHealth pattern)
  private isQuickReconnection = false;
  private storedDeviceInfo: StoredDeviceInfo | null = null;
  private storedPairingState: PairingState | null = null;

  // Historical Data Processing State (YoiHealth pattern)
  private historicalBuffer: IHistorical[] = [];
  private processedUUIDs: Set<number> = new Set();
  private maxUUID = 0;

  private constructor() {
    this.ringSDK = RingSDK.getInstance();
    this.commandQueue = new RingCommandQueue();
  }

  /**
   * Validate device state consistency and attempt recovery if needed
   * @returns Promise<boolean> - true if state is valid or recovered
   */
  private async validateDeviceState(): Promise<boolean> {
    try {
      const store = useRingStore.getState();
      const deviceInfo1 = store.deviceInfo1;
      const deviceInfo2 = store.deviceInfo2;

      if (!deviceInfo1 || !deviceInfo2) {
        console.log('⚠️ Missing device info, requesting fresh data...');
        // Queue commands to get device info
        await this.commandQueue.enqueue(
          () => ringCommands.deviceInfo1(),
          'deviceInfo1',
          10
        );
        await this.delay(3000); // Wait for response
        return false;
      }

      // Check for inconsistent state
      const oemStatus = deviceInfo1.switchOem === 1;
      const bindStatus = deviceInfo2.bindStatus === 1;

      console.log(`📊 Device state: OEM=${oemStatus}, Bound=${bindStatus}`);

      if (oemStatus && !bindStatus) {
        console.warn('⚠️ Inconsistent state: OEM device not bound, attempting recovery...');
        // Attempt to bind the device
        await this.commandQueue.enqueue(
          () => ringCommands.deviceBind(),
          'deviceBind',
          9
        );
        await this.delay(2000);

        // Re-query device info 2 to verify binding
        await this.commandQueue.enqueue(
          () => ringCommands.deviceInfo2(),
          'deviceInfo2',
          8
        );
        await this.delay(3000);

        // Check if binding succeeded
        const updatedStore = useRingStore.getState();
        if (updatedStore.deviceInfo2?.bindStatus === 1) {
          console.log('✅ Device binding recovered successfully');
          return true;
        } else {
          console.error('❌ Failed to recover device binding');
          return false;
        }
      }

      return true; // State is consistent

    } catch (error) {
      console.error('❌ Device state validation failed:', error);
      return false;
    }
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): RingService {
    if (!RingService.instance) {
      RingService.instance = new RingService();
    }
    return RingService.instance;
  }

  /**
   * Initialize the Ring service
   */
  public async initialize(): Promise<void> {
    try {
      if (this.isInitialized) {
        console.log('Ring service already initialized');
        return;
      }

      console.log('Initializing Ring service...');

      // Check if SDK is available
      if (!this.ringSDK.isAvailable()) {
        throw new Error('Ring SDK is not available');
      }

      // Setup BLE notification handlers (following reference implementation)
      this.setupNotificationHandlers();

      // CRITICAL: Register SDK listeners like manufacturer reference
      await this.registerSDKListeners();

      this.isInitialized = true;
      console.log('Ring service initialized successfully');

    } catch (error) {
      console.error('Failed to initialize Ring service:', error);
      throw error;
    }
  }

  /**
   * Attempt reconnection after unexpected disconnect
   * @param deviceId - Device ID to reconnect to
   * @param lastDevice - Last connected device info
   * @returns Promise<boolean> - Success status
   */
  private async attemptReconnectionAfterDisconnect(
    deviceId: string,
    lastDevice: SmartRingX1
  ): Promise<boolean> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second base delay
    const store = useRingStore.getState();

    // Set reconnecting status
    store.setIsReconnecting(true, 0);

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Reconnection attempt ${attempt}/${maxRetries} for device: ${deviceId}`);

        // Update store with retry status
        store.setIsReconnecting(true, attempt);
        store.setConnectionStatus({
          isConnected: false,
          isConnecting: true,
          deviceId: deviceId,
          connectionError: null,
          retryAttempt: attempt,
          maxRetries: maxRetries,
          retryMessage: `Reconnecting (Attempt ${attempt}/${maxRetries})...`
        });

        // Short delay between attempts (exponential backoff)
        if (attempt > 1) {
          const delayMs = baseDelay * Math.pow(2, attempt - 1);
          console.log(`⏳ Waiting ${delayMs}ms before attempt ${attempt}...`);
          await this.delay(delayMs);
        }

        // Try direct connection first (device might still be in range)
        try {
          await ringBleModule.connect(deviceId, {
            timeout: 10000,
            requestMTU: 185,
            connectionPriority: "high"
          });

          // Initialize device after reconnection
          await this.initializeConnectedDevice();

          // Update store with successful reconnection
          store.setConnectionStatus({
            isConnected: true,
            isConnecting: false,
            deviceId: deviceId,
            connectionError: null
          });

          // Restore device in store
          store.setConnectedRing(lastDevice);

          console.log('✅ Reconnection successful on attempt', attempt);
          store.setIsReconnecting(false, 0);
          return true;

        } catch (connectError) {
          console.error(`❌ Reconnection attempt ${attempt} failed:`, connectError);

          if (attempt === maxRetries) {
            // Try scanning for the device as last resort
            console.log('🔍 Final attempt: Scanning for device...');

            store.setConnectionStatus({
              isConnected: false,
              isConnecting: true,
              deviceId: deviceId,
              connectionError: null,
              retryMessage: 'Scanning for your Ring...'
            });

            // Quick scan for the specific device
            const scanTimeout = 5000;
            const foundDevices = await this.scanForRings(scanTimeout);

            const targetDevice = foundDevices.find(d => d.id === deviceId);
            if (targetDevice) {
              console.log('✅ Device found in scan, attempting connection...');

              const success = await this.connectToRing(deviceId);
              if (success) {
                console.log('✅ Reconnection via scan successful!');
                return true;
              }
            }

            console.log('❌ Device not found in scan');
          }
        }
      } catch (error) {
        console.error(`❌ Reconnection attempt ${attempt} error:`, error);
      }
    }

    console.log('❌ All reconnection attempts failed');
    store.setIsReconnecting(false, 0);
    return false;
  }

  /**
   * Attempt to auto-reconnect to previously paired device
   * Called on app startup to restore connection
   * @returns Promise<boolean> - Success status
   */
  public async attemptAutoReconnection(): Promise<boolean> {
    try {
      console.log('🔄 Attempting auto-reconnection to previously paired device...');

      // Check if we have a stored device
      const storedDevice = await DevicePersistenceService.getStoredDeviceInfo();
      if (!storedDevice) {
        console.log('📦 No previously paired device found');
        return false;
      }

      console.log('📦 Found previously paired device:', {
        deviceId: storedDevice.deviceId,
        serialNumber: storedDevice.serialNumber,
        lastConnected: new Date(storedDevice.lastConnectedAt).toISOString()
      });

      // Check pairing state
      const pairingState = await DevicePersistenceService.getPairingState();
      if (!pairingState?.isDeviceBound) {
        console.log('⚠️ Device not bound, skipping auto-reconnection');
        return false;
      }

      // Update store to show we're attempting reconnection
      const store = useRingStore.getState();
      store.setConnectionStatus({
        isConnected: false,
        isConnecting: true,
        deviceId: storedDevice.deviceId,
        connectionError: null,
        retryMessage: 'Reconnecting to your Ring...'
      });

      // Start scanning for the specific device
      console.log('🔍 Scanning for Ring device:', storedDevice.deviceId);

      // Set a timeout for the scan
      const scanTimeout = 15000; // 15 seconds

      // Start scanning
      await ringBleModule.startScan({ timeout: scanTimeout });

      // Wait for device discovery or timeout
      return await new Promise<boolean>((resolve) => {
        let deviceFound = false;

        // Setup discovery callback
        ringBleModule.setOnDiscovery((device) => {
          if (device.id === storedDevice.deviceId && !deviceFound) {
            deviceFound = true;
            console.log('✅ Found previously paired Ring device!');

            // Stop scanning
            ringBleModule.stopScan().then(() => {
              // Attempt connection
              this.connectToRing(storedDevice.deviceId)
                .then((success) => {
                  if (success) {
                    console.log('✅ Auto-reconnection successful!');
                    // Update connection metadata
                    DevicePersistenceService.updateConnectionMetadata();
                  } else {
                    console.log('❌ Auto-reconnection failed');
                  }
                  resolve(success);
                })
                .catch((error) => {
                  console.error('❌ Auto-reconnection error:', error);
                  resolve(false);
                });
            });
          }
        });

        // Timeout handler
        setTimeout(() => {
          if (!deviceFound) {
            console.log('⏱️ Auto-reconnection timed out - device not found');
            ringBleModule.stopScan();

            store.setConnectionStatus({
              isConnected: false,
              isConnecting: false,
              deviceId: null,
              connectionError: 'Previously paired device not found'
            });

            resolve(false);
          }
        }, scanTimeout);
      });

    } catch (error) {
      console.error('❌ Auto-reconnection failed:', error);

      const store = useRingStore.getState();
      store.setConnectionStatus({
        isConnected: false,
        isConnecting: false,
        deviceId: null,
        connectionError: 'Auto-reconnection failed'
      });

      return false;
    }
  }

  // Device Discovery and Connection

  /**
   * Start scanning for Ring devices
   * @param timeout - Scan timeout in milliseconds (default: 10000)
   * @returns Promise<SmartRingX1[]> - Array of discovered devices
   */
  public async scanForRings(timeout: number = 20000): Promise<SmartRingX1[]> {
    const maxRetries = 3;

    try {
      console.log(`🔍 Starting Ring device scan (${timeout}ms timeout, ${maxRetries} max attempts)...`);

      for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`📡 Scan attempt ${attempt}/${maxRetries}...`);

        const discoveredDevices: SmartRingX1[] = [];

        // Setup discovery callback
        ringBleModule.setOnDiscovery((device) => {
          const ringData = this.extractRingDataFromBLE(device);
          if (ringData) {
            console.log(`📱 Discovered Ring: ${ringData.name} (${ringData.id})`);
            discoveredDevices.push(ringData);
          }
        });

        // Start scan with broader criteria for reconnection attempts
        await ringBleModule.startScan({
          timeout,
          allowDuplicates: false,
        });

        // Wait for scan to complete
        await this.delay(timeout + 1000);

        if (discoveredDevices.length > 0) {
          console.log(`✅ Found ${discoveredDevices.length} Ring device(s) on attempt ${attempt}`);
          return discoveredDevices;
        }

        if (attempt < maxRetries) {
          console.log(`⏳ No devices found, waiting 2s before retry...`);
          await this.delay(2000); // Wait between retries
        }
      }

      console.log('❌ No Ring devices found after all attempts');
      return [];

    } catch (error) {
      console.error('Failed to scan for Ring devices:', error);
      throw error;
    }
  }

  /**
   * Scan for Ring devices without service filters (broader scan)
   * @param timeout - Scan timeout in milliseconds
   * @returns Promise<SmartRingX1[]> - Array of discovered devices
   */
  private async scanWithoutFilters(timeout: number = 15000): Promise<SmartRingX1[]> {
    try {
      console.log(`🔍 Starting broad scan without filters (${timeout}ms)...`);

      const discoveredDevices: SmartRingX1[] = [];

      // Setup discovery callback to look for any device that might be a Ring
      ringBleModule.setOnDiscovery((device) => {
        // Check if device name contains Ring-related keywords
        const deviceName = device.advertising?.localName || device.name || '';
        const isLikelyRing = deviceName.includes('SR') ||
          deviceName.includes('Ring') ||
          deviceName.includes('SmartRing') ||
          deviceName.includes('_'); // Many rings use underscore format

        if (isLikelyRing) {
          const ringData = this.extractRingDataFromBLE(device);
          if (ringData) {
            console.log(`📱 Found potential Ring device: ${ringData.name} (${ringData.id})`);
            discoveredDevices.push(ringData);
          }
        }
      });

      // Start scan without service UUID filters
      await ringBleModule.startScan({
        timeout,
        allowDuplicates: false,
        // No service UUIDs specified - scan for all devices
      });

      // Wait for scan to complete
      await this.delay(timeout + 1000);

      console.log(`📊 Broad scan found ${discoveredDevices.length} potential Ring device(s)`);
      return discoveredDevices;

    } catch (error) {
      console.error('Failed broad scan:', error);
      return [];
    }
  }

  /**
   * Connect to a Ring device
   * @param deviceId - BLE device ID
   * @returns Promise<boolean> - Success status
   */
  public async connectToRing(deviceId: string): Promise<boolean> {
    const maxRetries = 3;
    const baseDelay = 1000; // 1 second base delay

    // Import store here to avoid circular dependencies
    const { useRingStore } = await import('./state/ringStore');

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`🔄 Ring connection attempt ${attempt}/${maxRetries} for device: ${deviceId}`);

        // Update store with retry status
        const store = useRingStore.getState();
        store.setConnectionStatus({
          isConnected: false,
          isConnecting: true,
          deviceId: deviceId,
          connectionError: null,
          retryAttempt: attempt,
          maxRetries: maxRetries,
          retryMessage: attempt === 1 ? 'Connecting to Ring...' : `Retrying connection (${attempt}/${maxRetries})...`
        });

        if (attempt > 1) {
          const delayMs = this.getRetryDelay(attempt, baseDelay);
          console.log(`⏳ Previous attempt failed, retrying in ${delayMs}ms...`);

          // Update retry message with countdown
          store.setConnectionStatus({
            ...store.connectionStatus,
            retryMessage: `Connection failed. Retrying in ${Math.ceil(delayMs / 1000)}s... (${attempt}/${maxRetries})`
          });

          await this.delay(delayMs);

          // Update message just before retry
          store.setConnectionStatus({
            ...store.connectionStatus,
            retryMessage: `Retrying connection (${attempt}/${maxRetries})...`
          });
        }

        // SDK listeners already registered during initialization - ready for Ring responses
        console.log('✅ Using SDK listeners registered during initialization - ready to process Ring responses');

        await ringBleModule.connect(deviceId, {
          timeout: 15000,
          requestMTU: 185,
          connectionPriority: "high"
        });



        // Initialize device after connection (following manufacturer pattern)
        await this.initializeConnectedDevice();

        // Validate device state after initialization
        console.log('🔍 Validating device state consistency...');
        const stateValid = await this.validateDeviceState();

        if (!stateValid) {
          console.warn('⚠️ Device state validation failed, but continuing...');
        }

        // Update store to reflect successful connection
        store.setConnectionStatus({
          isConnected: true,
          isConnecting: false,
          deviceId: deviceId,
          connectionError: null,
          retryAttempt: undefined,
          maxRetries: undefined,
          retryMessage: undefined
        });

        console.log(`✅ Ring connection successful on attempt ${attempt}/${maxRetries}`);
        return true;

      } catch (error) {
        console.error(`❌ Ring connection attempt ${attempt}/${maxRetries} failed:`, error);

        if (attempt === maxRetries) {
          console.error(`💥 All ${maxRetries} connection attempts failed. Ring device may be out of range or busy.`);

          // Update store with final failure
          const store = useRingStore.getState();
          store.setConnectionStatus({
            isConnected: false,
            isConnecting: false,
            deviceId: null,
            connectionError: `Connection failed after ${maxRetries} attempts. Ring may be out of range or busy.`,
            retryAttempt: undefined,
            maxRetries: undefined,
            retryMessage: undefined
          });

          throw new Error(`Failed to connect to Ring device after ${maxRetries} attempts: ${error}`);
        } else {
          console.log(`🔄 Will retry connection (${maxRetries - attempt} attempts remaining)`);
        }
      }
    }

    return false; // Should never reach here due to throw above
  }

  /**
   * Disconnect from current Ring device
   * @returns Promise<void>
   */
  public async disconnect(): Promise<void> {
    try {
      // Set flag to prevent auto-reconnection
      this.isManualDisconnection = true;

      // Clear command queue
      this.commandQueue.clear();

      await ringBleModule.disconnect();
      console.log('Disconnected from Ring device');

      // Reset flag after a delay to allow future auto-reconnections
      setTimeout(() => {
        this.isManualDisconnection = false;
      }, 2000);
    } catch (error) {
      console.error('Failed to disconnect from Ring device:', error);
      this.isManualDisconnection = false;
      throw error;
    }
  }

  /**
   * Check if Ring device is connected
   * @returns boolean - Connection status
   */
  public isConnected(): boolean {
    return ringBleModule.isConnected();
  }

  /**
   * Ensure Ring device is connected, attempt reconnection if needed
   * @returns Promise<boolean> - true if connected or reconnected successfully
   */
  private async ensureConnected(): Promise<boolean> {
    // First check if already connected
    if (this.isConnected()) {
      return true;
    }

    // Check if a reconnection is already in progress
    if (this.reconnectionPromise) {
      console.log('⏳ Waiting for ongoing reconnection attempt...');
      try {
        const result = await this.reconnectionPromise;
        return result;
      } catch (error) {
        console.error('❌ Ongoing reconnection failed:', error);
        return false;
      }
    }

    console.log('⚠️ Ring device not connected, attempting automatic reconnection...');

    // Get the last connected device from store
    const store = useRingStore.getState();
    const lastDeviceId = store.connectionStatus.deviceId;
    const connectedRing = store.connectedRing;

    if (!lastDeviceId && !connectedRing?.id) {
      console.error('❌ No device information available for reconnection');
      return false;
    }

    const deviceId = lastDeviceId || connectedRing?.id;

    // Create reconnection promise to prevent duplicate attempts
    this.reconnectionPromise = (async () => {
      try {
        console.log(`🔄 Attempting to reconnect to device: ${deviceId}`);
        const success = await this.connectToRing(deviceId!);

        if (success) {
          console.log('✅ Automatic reconnection successful!');
          this.reconnectionPromise = null; // Clear the promise
          return true;
        } else {
          console.error('❌ Automatic reconnection failed');
          this.reconnectionPromise = null; // Clear the promise
          return false;
        }
      } catch (error) {
        console.error('❌ Error during automatic reconnection:', error);
        this.reconnectionPromise = null; // Clear the promise
        return false;
      }
    })();

    return this.reconnectionPromise;
  }

  // Connection Persistence Methods (YoiHealth Pattern)

  /**
   * Auto-connect to previously paired device on app launch
   * @returns Promise<boolean> - true if reconnection succeeded
   */
  public async autoConnectStoredDevice(): Promise<boolean> {
    try {
      console.log('🔄 Checking for stored device to auto-connect...');

      // First check if we have any stored device info at all
      const storedDevice = await DevicePersistenceService.getStoredDeviceInfo();

      if (!storedDevice) {
        console.log('📦 No stored device found for auto-connect');
        return false;
      }

      // Even if device isn't fully bound, attempt reconnection
      // This handles cases where app was closed during pairing
      const pairingCheck = await DevicePersistenceService.shouldPerformFullPairing();

      if (pairingCheck.requiresFullPairing) {
        console.log('⚠️ Device may not be fully paired:', pairingCheck.reason);
        console.log('🔄 Attempting reconnection anyway...');
      }
      console.log('🎯 Found stored device for auto-connect:', {
        serialNumber: storedDevice.serialNumber,
        bleAddress: storedDevice.bleAddress,
        lastConnected: new Date(storedDevice.lastConnectedAt).toLocaleString(),
      });

      // Ensure BLE is ready
      console.log('📡 Preparing BLE for auto-reconnection...');

      // Give BLE a moment to be ready after app launch
      await this.delay(1000);

      // Attempt reconnection up to 3 times with increasing scan strategies
      const maxAttempts = 3;
      let targetDevice: SmartRingX1 | undefined;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        console.log(`📡 Auto-reconnection attempt ${attempt}/${maxAttempts}...`);

        // Update UI with attempt status
        const store = useRingStore.getState();
        store.setConnectionStatus({
          isConnected: false,
          isConnecting: true,
          deviceId: storedDevice.deviceId,
          connectionError: null,
          retryMessage: `Searching for your Ring (Attempt ${attempt}/${maxAttempts})...`
        });

        // Progressive scan strategy - start narrow, then broaden
        let foundDevices: SmartRingX1[] = [];

        if (attempt === 1) {
          // First attempt: Quick scan with service filters
          console.log('📡 Attempt 1: Quick scan with service filters...');
          try {
            foundDevices = await this.scanForRings(5000);
          } catch (scanError) {
            console.error('❌ Quick scan failed:', scanError);
          }
        } else if (attempt === 2) {
          // Second attempt: Longer scan with filters
          console.log('📡 Attempt 2: Extended scan with filters...');
          try {
            foundDevices = await this.scanForRings(10000);
          } catch (scanError) {
            console.error('❌ Extended scan failed:', scanError);
          }
        } else {
          // Final attempt: Broad scan without filters
          console.log('📡 Attempt 3: Broad scan without filters...');
          try {
            foundDevices = await this.scanWithoutFilters(15000);
          } catch (scanError) {
            console.error('❌ Broad scan failed:', scanError);
          }
        }

        if (foundDevices.length === 0 && attempt < maxAttempts) {
          console.log('⏳ No devices found, waiting before next attempt...');
          await this.delay(3000); // Wait longer between attempts
          continue;
        }

        // Find our stored device in scan results (multiple matching strategies)
        targetDevice = foundDevices.find(device => {
          // Strategy 1: Exact device ID match (most reliable)
          if (device.id === storedDevice.deviceId) {
            console.log('🎯 Device found by ID match');
            return true;
          }

          // Strategy 2: BLE address match in advertising localName
          if (device.advertising?.localName && storedDevice.bleAddress) {
            const deviceMac = device.advertising.localName.toLowerCase();
            const storedMac = storedDevice.bleAddress.toLowerCase();
            if (deviceMac.includes(storedMac) || storedMac.includes(deviceMac)) {
              console.log('🎯 Device found by BLE address match');
              return true;
            }
          }

          // Strategy 3: Serial number match in name
          if (device.name && storedDevice.serialNumber) {
            const serialSuffix = storedDevice.serialNumber.slice(-4);
            if (device.name.includes(serialSuffix)) {
              console.log('🎯 Device found by serial number match');
              return true;
            }
          }

          // Strategy 4: Ring device name pattern match
          if (device.name && device.name.toLowerCase().includes('ring')) {
            console.log('🎯 Ring device found by name pattern');
            return true;
          }

          return false;
        });

        if (targetDevice) {
          console.log('✅ Found stored Ring device in scan results:', {
            id: targetDevice.id,
            name: targetDevice.name,
            rssi: targetDevice.rssi
          });
          break; // Exit the retry loop as we found the device
        }

        console.log(`❌ Stored Ring device not found in scan attempt ${attempt}`);

        if (attempt === maxAttempts) {
          console.log('❌ All scan attempts exhausted - device may be out of range');
          store.setConnectionStatus({
            isConnected: false,
            isConnecting: false,
            deviceId: null,
            connectionError: 'Could not find your previously paired Ring after 3 attempts'
          });
          return false;
        }

        // Wait before next attempt
        console.log(`⏳ Waiting 2 seconds before attempt ${attempt + 1}...`);
        await this.delay(2000);
      } // End of retry loop

      if (!targetDevice) {
        console.log('❌ Device not found after all attempts');
        return false;
      }

      // Store persistence state for connection flow
      this.storedDeviceInfo = storedDevice;
      this.storedPairingState = pairingCheck.pairingState;
      this.isQuickReconnection = true;

      // Update stored device ID if it changed
      if (targetDevice.id !== storedDevice.deviceId) {
        console.log('🔄 Device ID changed - updating stored info');
        storedDevice.deviceId = targetDevice.id;
        // Note: Will be re-saved when connection completes
      }

      console.log('🚀 Attempting auto-reconnection to scanned device...');
      await this.connectToRing(targetDevice.id);

      return true;

    } catch (error) {
      console.error('❌ Auto-connect failed:', error);
      this.isQuickReconnection = false;
      this.storedDeviceInfo = null;
      this.storedPairingState = null;
      return false;
    }
  }

  /**
   * Store device pairing information after successful connection
   */
  public async storeDevicePairing(
    deviceId: string,
    deviceInfo1: IDeviceInfo1,
    deviceInfo2: IDeviceInfo2
  ): Promise<void> {
    try {
      // Create SmartRingX1 object for storage
      const ringDevice: SmartRingX1 = {
        id: deviceId,
        name: `SmartRing ${deviceInfo2.sn?.slice(-4) || 'X1'}`,
        color: deviceInfo1.color as 0 | 1 | 2 | 3,
        size: deviceInfo1.size,
        rssi: 0,
        advertising: {
          localName: deviceInfo1.bleAddress || ''
        }
      };

      // Store device information
      await DevicePersistenceService.storeDeviceInfo(ringDevice, deviceInfo1, deviceInfo2);

      // Store pairing state
      const bindStatus = deviceInfo2.bindStatus === 1 ? 'Bind' : 'Unbind';
      const oemComplete = this.startOem && bindStatus === 'Bind';

      await DevicePersistenceService.storePairingState(
        bindStatus,
        oemComplete,
        deviceInfo1.switchOem === 1
      );

      console.log('✅ Device pairing information stored for persistence');
    } catch (error) {
      console.error('❌ Failed to store device pairing information:', error);
    }
  }

  /**
   * Get comprehensive device persistence status for debugging
   */
  public async getDevicePersistenceStatus(): Promise<any> {
    try {
      return await DevicePersistenceService.getDeviceStatus();
    } catch (error) {
      console.error('❌ Failed to get device persistence status:', error);
      return null;
    }
  }

  /**
   * Clear all stored device data (unpair/reset)
   */
  public async unpairDevice(): Promise<void> {
    try {
      // Disconnect if connected
      if (this.isConnected()) {
        await this.disconnect();
      }

      // Clear all persistence data
      await DevicePersistenceService.clearAllDeviceData();

      // Reset service state
      this.isQuickReconnection = false;
      this.storedDeviceInfo = null;
      this.storedPairingState = null;

      // Clear store data
      const store = useRingStore.getState();
      store.resetStore();

      console.log('✅ Device unpaired and all data cleared');
    } catch (error) {
      console.error('❌ Failed to unpair device:', error);
      throw error;
    }
  }

  /**
   * Auto-store pairing information when both device infos become available
   */
  private async autoStorePairingInfo(): Promise<void> {
    try {
      const store = useRingStore.getState();
      const deviceInfo1 = store.deviceInfo1;
      const deviceInfo2 = store.deviceInfo2;
      const connectedRing = store.connectedRing;

      if (deviceInfo1 && deviceInfo2 && connectedRing) {
        console.log('📦 Auto-storing device pairing information...');
        await this.storeDevicePairing(connectedRing.id, deviceInfo1, deviceInfo2);
        console.log('✅ Device pairing automatically stored for future reconnection');
      } else {
        console.log('⏳ Waiting for all device info before storing pairing data');
        console.log(`   DeviceInfo1: ${!!deviceInfo1}`);
        console.log(`   DeviceInfo2: ${!!deviceInfo2}`);
        console.log(`   ConnectedRing: ${!!connectedRing}`);
      }
    } catch (error) {
      console.error('❌ Auto-store pairing failed:', error);
    }
  }

  // Device Information and Status

  /**
   * Get battery level and status
   * Following reference implementation pattern
   * @returns Promise<IBattery> - Battery information
   */
  public async getBatteryInfo(): Promise<IBattery | null> {
    try {
      // Ensure connection with automatic reconnection
      const connected = await this.ensureConnected();
      if (!connected) {
        throw new Error('Ring device not connected and reconnection failed');
      }

      console.log('🔋 Requesting battery info from Ring device...');

      // Send battery command (like reference: sendData(batteryDataAndState, bleModule))
      await ringCommands.batteryDataAndState();

      // Wait a bit for the response notification
      await this.delay(1000);

      // Battery data should now be updated in store via notification handler
      const store = useRingStore.getState();

      if (store.batteryData) {
        console.log('✅ Battery info retrieved:', store.batteryData);
        return store.batteryData;
      } else {
        console.warn('⚠️ No battery data received yet');
        return null;
      }

    } catch (error) {
      console.error('❌ Failed to get battery info:', error);
      return null;
    }
  }

  /**
   * Get device information
   * @returns Promise<{info1: IDeviceInfo1 | null, info2: IDeviceInfo2 | null}>
   */
  public async getDeviceInfo(): Promise<{
    info1: IDeviceInfo1 | null;
    info2: IDeviceInfo2 | null;
  }> {
    try {
      // Ensure connection with automatic reconnection
      const connected = await this.ensureConnected();
      if (!connected) {
        throw new Error('Ring device not connected and reconnection failed');
      }

      await ringCommands.deviceInfo1();
      await this.delay(1000);

      await ringCommands.deviceInfo2();
      await this.delay(1000);

      const store = useRingStore.getState();
      return {
        info1: store.deviceInfo1,
        info2: store.deviceInfo2,
      };

    } catch (error) {
      console.error('Failed to get device info:', error);
      return { info1: null, info2: null };
    }
  }

  /**
   * Get current step count
   * @returns Promise<number> - Step count
   */
  public async getStepCount(): Promise<number> {
    try {
      // Ensure connection with automatic reconnection
      const connected = await this.ensureConnected();
      if (!connected) {
        throw new Error('Ring device not connected and reconnection failed');
      }

      await ringCommands.getSteps();

      // Steps will be updated via BLE notifications
      // For now, return 0 as placeholder
      return 0;

    } catch (error) {
      console.error('Failed to get step count:', error);
      return 0;
    }
  }

  /**
   * Get finger temperature
   * @returns Promise<number> - Temperature in Celsius
   */
  public async getTemperature(): Promise<number> {
    try {
      // Ensure connection with automatic reconnection
      const connected = await this.ensureConnected();
      if (!connected) {
        throw new Error('Ring device not connected and reconnection failed');
      }

      await ringCommands.temperature();

      // Temperature will be updated via BLE notifications
      return 0;

    } catch (error) {
      console.error('Failed to get temperature:', error);
      return 0;
    }
  }

  // Health Data and Monitoring

  /**
   * Start health monitoring (heart rate + blood oxygen)
   * @returns Promise<void>
   */
  public async startHealthMonitoring(): Promise<void> {
    try {
      // Ensure connection with automatic reconnection
      const connected = await this.ensureConnected();
      if (!connected) {
        throw new Error('Ring device not connected and reconnection failed');
      }

      await ringCommands.startHealthMonitoring();
      console.log('Health monitoring started');

    } catch (error) {
      console.error('Failed to start health monitoring:', error);
      throw error;
    }
  }

  /**
   * Start single health monitoring (heart rate only)
   * @returns Promise<void>
   */
  public async startHeartRateMonitoring(): Promise<void> {
    try {
      // Ensure connection with automatic reconnection
      const connected = await this.ensureConnected();
      if (!connected) {
        throw new Error('Ring device not connected and reconnection failed');
      }

      await ringCommands.openSingleHealth();
      console.log('Heart rate monitoring started');

    } catch (error) {
      console.error('Failed to start heart rate monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop all health monitoring
   * @returns Promise<void>
   */
  public async stopHealthMonitoring(): Promise<void> {
    try {
      // Ensure connection with automatic reconnection
      const connected = await this.ensureConnected();
      if (!connected) {
        throw new Error('Ring device not connected and reconnection failed');
      }

      await ringCommands.stopHealthMonitoring();
      console.log('Health monitoring stopped');

    } catch (error) {
      console.error('Failed to stop health monitoring:', error);
      throw error;
    }
  }

  /**
   * Comprehensive historical data sync with YoiHealth processing
   * @returns Promise<IHistorical[]> - Processed historical health data
   */
  public async syncHistoricalData(): Promise<IHistorical[]> {
    try {
      // Ensure connection with automatic reconnection
      const connected = await this.ensureConnected();
      if (!connected) {
        throw new Error('Ring device not connected and reconnection failed');
      }

      console.log('🔄 Starting comprehensive historical data sync...');

      // Reset processing state
      this.historicalBuffer = [];
      this.processedUUIDs.clear();
      this.maxUUID = 0;

      console.log('🧹 Processing state reset - ready for new sync');

      // Step 0: Ensure device is bound and time is synced (critical for historical data)
      console.log('🔐 Step 0: Ensuring device binding and time sync...');
      await ringCommands.deviceBind();
      await this.delay(1000);
      await ringCommands.timeSyn();
      await this.delay(1000);

      // Step 1: Get number of historical records
      console.log('📊 Step 1: Requesting historical data count...');
      await ringCommands.historicalNum();
      await this.delay(2000);

      // Check if we have a count from the listener
      const store = useRingStore.getState();
      const dataCount = store.historicalDataCount || 0;
      console.log(`📊 Ring reports ${dataCount} historical records available`);

      if (dataCount === 0) {
        console.log('⚠️ No historical data available on ring device');
        return [];
      }

      // Step 2: Request historical data - this will trigger historicalDataListener
      console.log('📥 Step 2: Requesting historical data records...');
      console.log(`📊 Current buffer state before request: ${this.historicalBuffer.length} records`);

      await ringCommands.historicalData();

      // Step 3: Wait for all data to be processed via listeners with better completion detection
      console.log('⏳ Step 3: Waiting for data processing with UUID-based completion detection...');

      const maxWaitTime = 30000; // 30 seconds max wait (for large datasets)
      const checkInterval = 500; // Check every 500ms
      let waitTime = 0;
      let lastBufferSize = this.historicalBuffer.length;
      let stableCount = 0;

      while (waitTime < maxWaitTime) {
        await this.delay(checkInterval);
        waitTime += checkInterval;

        const currentBufferSize = this.historicalBuffer.length;

        if (currentBufferSize > lastBufferSize) {
          console.log(`📈 Progress: ${currentBufferSize} records received (was ${lastBufferSize})`);
          lastBufferSize = currentBufferSize;
          stableCount = 0; // Reset stability counter when new data arrives
        } else {
          stableCount++;
        }

        // If we're not receiving any data after 3 seconds, warn the user
        if (waitTime === 3000 && this.historicalBuffer.length === 0) {
          console.log('⚠️ No historical data received after 3s - Ring may have no stored data or sync issue');
        }

        // Check if sync is complete based on UUID (most reliable method)
        if (this.maxUUID > 0 && this.processedUUIDs.has(this.maxUUID)) {
          console.log(`✅ Sync complete: Reached max UUID ${this.maxUUID}`);
          break;
        }

        // Alternative completion: data stable for 3 seconds with some data
        if (currentBufferSize > 0 && stableCount >= 6) { // 6 * 500ms = 3 seconds
          console.log(`✅ Data appears stable at ${currentBufferSize} records after ${waitTime}ms`);
          break;
        }

        // Alternative completion: received expected count
        if (dataCount > 0 && currentBufferSize >= dataCount) {
          console.log(`✅ Received expected ${dataCount} records`);
          break;
        }
      }

      console.log(`📊 Final buffer state: ${this.historicalBuffer.length} records after ${waitTime}ms`);

      // Step 4: Finalize sync with sleep and health calculations
      console.log('🧮 Step 4: Finalizing sync with calculations...');
      const processedData = await this.finalizeHistoricalSync();

      // Step 5: Update store with final processed data
      store.addHistoricalData(processedData);

      // Step 6: Clear historical data from ring after successful sync
      if (processedData.length > 0) {
        console.log('🧹 Step 6: Clearing historical data from ring...');
        await ringCommands.cleanHistoricalData();
        await this.delay(1000);
        console.log('✅ Ring memory cleared');
      }

      console.log(`✅ Comprehensive sync completed:`);
      console.log(`   📊 Total records: ${processedData.length}`);
      console.log(`   🆔 Unique UUIDs processed: ${this.processedUUIDs.size}`);
      console.log(`   🔢 Highest UUID: ${this.maxUUID}`);
      console.log(`   🧠 Valid records in buffer: ${this.historicalBuffer.length}`);

      if (processedData.length === 0) {
        console.log('⚠️ No valid historical data processed - Ring may have no stored data or all data was invalid');
      } else {
        console.log(`📈 Sample processed data:`, processedData.slice(0, 2));
      }

      return processedData;

    } catch (error) {
      console.error('❌ Failed to sync historical data:', error);
      // Return whatever data we managed to collect
      return [...this.historicalBuffer];
    }
  }

  /**
   * Get processed sleep data
   * @returns Promise<SleepData[]> - Analyzed sleep data
   */
  public async getSleepAnalysis(): Promise<SleepData[]> {
    try {
      const store = useRingStore.getState();
      const historicalData = store.historicalData;

      if (historicalData.length === 0) {
        console.log('No historical data available for sleep analysis');
        return [];
      }

      const sleepData = healthMetricsProcessor.calculateSleepMetrics(historicalData);

      // Update store with processed sleep data
      store.setSleepData(sleepData);

      return sleepData;

    } catch (error) {
      console.error('Failed to get sleep analysis:', error);
      return [];
    }
  }

  /**
   * Generate comprehensive health report
   * @returns Promise<object> - Health insights and metrics
   */
  public async generateHealthReport(): Promise<{
    dailyActivity: any;
    sleepReport: any;
    healthAnomalies: any[];
    lastUpdate: string;
  }> {
    try {
      const store = useRingStore.getState();
      const historicalData = store.historicalData;

      if (historicalData.length === 0) {
        return {
          dailyActivity: {},
          sleepReport: {},
          healthAnomalies: [],
          lastUpdate: new Date().toISOString(),
        };
      }

      // Calculate daily activity metrics
      const dailyActivity = healthMetricsProcessor.calculateDailyActivity(historicalData);

      // Generate sleep report
      const sleepReport = sleepAnalysisProcessor.generateSleepReport(historicalData);

      // Detect health anomalies
      const healthAnomalies = healthMetricsProcessor.detectHealthAnomalies(historicalData);

      return {
        dailyActivity,
        sleepReport,
        healthAnomalies,
        lastUpdate: new Date().toISOString(),
      };

    } catch (error) {
      console.error('Failed to generate health report:', error);
      throw error;
    }
  }

  // Device Control Operations

  /**
   * Restart Ring device
   * @returns Promise<void>
   */
  public async restartDevice(): Promise<void> {
    try {
      // Ensure connection with automatic reconnection
      const connected = await this.ensureConnected();
      if (!connected) {
        throw new Error('Ring device not connected and reconnection failed');
      }

      await ringCommands.restart();
      console.log('Device restart command sent');

    } catch (error) {
      console.error('Failed to restart device:', error);
      throw error;
    }
  }

  /**
   * Power off Ring device
   * @returns Promise<void>
   */
  public async shutdownDevice(): Promise<void> {
    try {
      // Ensure connection with automatic reconnection
      const connected = await this.ensureConnected();
      if (!connected) {
        throw new Error('Ring device not connected and reconnection failed');
      }

      await ringCommands.shutDown();
      console.log('Device shutdown command sent');

    } catch (error) {
      console.error('Failed to shutdown device:', error);
      throw error;
    }
  }

  /**
   * Perform factory reset (requires confirmation)
   * @param confirm - Explicit confirmation required
   * @returns Promise<void>
   */
  public async factoryReset(confirm: boolean = false): Promise<void> {
    try {
      if (!confirm) {
        throw new Error('Factory reset requires explicit confirmation');
      }

      // Ensure connection with automatic reconnection
      const connected = await this.ensureConnected();
      if (!connected) {
        throw new Error('Ring device not connected and reconnection failed');
      }

      await ringCommands.performFactoryReset(true);
      console.log('Factory reset initiated');

    } catch (error) {
      console.error('Failed to perform factory reset:', error);
      throw error;
    }
  }

  // Utility Methods

  /**
   * Synchronize device time with app time
   * @returns Promise<void>
   */
  public async syncTime(): Promise<void> {
    try {
      // Ensure connection with automatic reconnection
      const connected = await this.ensureConnected();
      if (!connected) {
        throw new Error('Ring device not connected and reconnection failed');
      }

      await ringCommands.timeSyn();
      console.log('Time synchronized with device');

    } catch (error) {
      console.error('Failed to sync time:', error);
      throw error;
    }
  }

  /**
   * Bind device to user account
   * @returns Promise<void>
   */
  public async bindDevice(): Promise<void> {
    try {
      // Ensure connection with automatic reconnection
      const connected = await this.ensureConnected();
      if (!connected) {
        throw new Error('Ring device not connected and reconnection failed');
      }

      await ringCommands.deviceBind();
      console.log('Device bound to user account');

    } catch (error) {
      console.error('Failed to bind device:', error);
      throw error;
    }
  }

  /**
   * Get current connection status
   * @returns ConnectionStatus
   */
  public getConnectionStatus(): ConnectionStatus {
    const store = useRingStore.getState();
    return store.connectionStatus;
  }

  /**
   * Check if Bluetooth is enabled
   * @returns Promise<boolean>
   */
  public async isBluetoothEnabled(): Promise<boolean> {
    try {
      return await ringBleModule.isBluetoothEnabled();
    } catch (error) {
      console.error('Failed to check Bluetooth status:', error);
      return false;
    }
  }

  // Private Helper Methods

  /**
   * Calculate exponential backoff delay for retry attempts
   */
  private getRetryDelay(attempt: number, baseDelay: number): number {
    // Exponential backoff: 1s, 2s, 4s, 8s, etc.
    return baseDelay * Math.pow(2, attempt - 2);
  }

  /**
   * Delay helper for retry logic
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // ===== HISTORICAL DATA VALIDATION METHODS (YOIHEALTH PATTERN) =====

  /**
   * Check for bad heart rate data (YoiHealth pattern)
   * @param rawHr - Raw heart rate data array
   * @returns true if data is bad/invalid
   */
  private checkBadData(rawHr: number[]): boolean {
    if (rawHr?.length === 3 && rawHr[0] === 200 && rawHr[1] === 200 && rawHr[2] === 200) {
      return true;
    }
    return false;
  }

  /**
   * Validate historical data quality (YoiHealth pattern)
   * @param data - Historical data record
   * @param isBadData - Whether heart rate data is bad
   * @returns true if data is valid for processing
   */
  private isValidHistoricalData(data: any, isBadData: boolean): boolean {
    return (
      data.heartRate >= 50 &&
      data.heartRate <= 175 &&
      data.wearStatus === 1 &&
      data.chargeStatus === 0 &&
      !isBadData
    );
  }

  /**
   * Validate heart rate data specifically (YoiHealth pattern)
   * @param data - Heart rate data record
   * @param isBadData - Whether heart rate data is bad
   * @returns true if HR data is valid
   */
  private isValidHrData(data: any, isBadData: boolean): boolean {
    return (
      data.heartRate >= 60 &&
      data.heartRate <= 175 &&
      data.wearStatus === 1 &&
      data.chargeStatus === 0 &&
      !isBadData
    );
  }

  /**
   * Calculate sleep data from historical data buffer
   */
  private async calculateSleepData(): Promise<void> {
    try {
      console.log('🧮 Calculating sleep data from buffer...');

      if (this.historicalBuffer.length === 0) {
        console.log('⚠️ No historical data in buffer for sleep calculation');
        return;
      }

      // Process buffer into sleep data using Ring SDK
      const sleepData = this.ringSDK.calcSleepTime(this.historicalBuffer);

      if (sleepData && sleepData.length > 0) {
        const store = useRingStore.getState();
        store.setSleepData(sleepData);
        console.log(`✅ Calculated ${sleepData.length} sleep data points`);
      } else {
        console.log('⚠️ No sleep data calculated from buffer');
      }
    } catch (error) {
      console.error('❌ Error calculating sleep data:', error);
    }
  }

  /**
   * Calculate comprehensive health metrics
   */
  private async calculateHealthMetrics(): Promise<void> {
    try {
      console.log('📊 Calculating health metrics...');

      if (this.historicalBuffer.length === 0) {
        console.log('⚠️ No historical data in buffer for health metrics');
        return;
      }

      const store = useRingStore.getState();
      const sleepData = store.sleepData || [];

      // Calculate resting heart rate
      const heartRateData = this.historicalBuffer
        .filter(data => data.heartRate && data.heartRate > 0)
        .map(data => data.heartRate);

      if (heartRateData.length > 0) {
        const restingHeartRate = this.ringSDK.calcRestingHeartRate(heartRateData);
        console.log(`💓 Resting Heart Rate: ${restingHeartRate} BPM`);
      }

      // Calculate respiratory rate from sleep data
      if (sleepData.length > 0) {
        const respiratoryRate = this.ringSDK.calcRespiratoryRate(sleepData);
        console.log(`🫁 Respiratory Rate: ${respiratoryRate} breaths/min`);
      }

      // Calculate oxygen saturation
      if (sleepData.length > 0) {
        const oxygenSaturation = this.ringSDK.getOxygenSaturation(sleepData);
        console.log(`🩸 Oxygen Saturation: ${oxygenSaturation}%`);
      }

      // Calculate HRV immersion
      const hrvImmersion = this.ringSDK.calcHeartRateImmersion(this.historicalBuffer);
      console.log(`💖 HRV Immersion: ${hrvImmersion}`);

      console.log('✅ Health metrics calculation completed');

    } catch (error) {
      console.error('❌ Error calculating health metrics:', error);
    }
  }

  /**
   * Finalize historical data sync processing
   */
  private async finalizeHistoricalSync(): Promise<IHistorical[]> {
    try {
      console.log('🏁 Finalizing historical sync...');

      // Calculate sleep data from buffer
      await this.calculateSleepData();

      // Calculate health metrics
      await this.calculateHealthMetrics();

      // Return processed historical data
      const processedData = [...this.historicalBuffer];

      // Update store timestamp
      const store = useRingStore.getState();
      store.updateLastSyncTime();

      console.log(`🎯 Historical sync finalized: ${processedData.length} records, highest UUID: ${this.maxUUID}`);

      return processedData;

    } catch (error) {
      console.error('❌ Error finalizing historical sync:', error);
      return [...this.historicalBuffer];
    }
  }

  /**
   * Continue Ring initialization after successful OEM verification
   */
  private async continueAfterOEMVerification(): Promise<void> {
    try {
      console.log('🔄 Continuing after successful OEM verification with command queue...');

      // Continue with standard Ring initialization sequence using command queue

      // Step 1: Device binding
      console.log('🔗 Step 1: Queuing device binding...');
      await this.commandQueue.enqueue(
        () => ringCommands.deviceBind(),
        'deviceBind',
        8
      );

      // Step 2: Time sync
      console.log('⏰ Step 2: Queuing time sync...');
      await this.commandQueue.enqueue(
        () => ringCommands.timeSyn(),
        'timeSyn',
        7
      );

      // Step 3: Configure Ring for data collection
      console.log('⚙️ Step 3: Queuing data collection configuration...');
      await this.commandQueue.enqueue(
        () => this.configureDataCollection(),
        'configureDataCollection',
        6
      );

      // Step 4: Battery status (already queued by deviceInfo2 listener)
      // Skipping as it's handled elsewhere

      console.log('📊 Step 5: Historical data will be fetched after initialization...');

      console.log('✅ OEM Ring initialization completed successfully!');

    } catch (error) {
      console.error('❌ Failed to continue after OEM verification:', error);
    }
  }

  /**
   * Initialize connected device following manufacturer reference pattern
   */
  private async initializeConnectedDevice(): Promise<void> {
    try {
      console.log('🔄 Initializing connected Ring device with proper command queuing...');

      // Clear any pending commands from previous connection
      this.commandQueue.clear();

      // Start BLE module
      console.log('🚀 Starting BLE module...');
      ringBleModule.start();

      // Set OEM verification flag
      this.startOem = true;
      console.log('🔐 OEM verification flag set to true');

      // SDK listeners already registered - ready for responses!

      // Send ONLY deviceInfo1 initially - let SDK listener decide next steps
      console.log('📤 Queuing deviceInfo1 command...');
      await this.commandQueue.enqueue(
        () => ringCommands.deviceInfo1(),
        'deviceInfo1',
        10 // High priority
      );

      console.log('⏳ Waiting for deviceInfo1 response to determine next steps...');

      // SDK listener will handle the response and decide whether to:
      // 1. Send deviceInfo2 if switchOem === 1 (OEM device)
      // 2. Call nonOemSync if switchOem !== 1 (non-OEM device)

      // Start OEM verification process
      this.ringSDK.startOEMVerify((cmd: string, cmdData: any) => {
        console.log('📤 OEM verification callback:', cmd, cmdData);
      });

    } catch (error) {
      console.error('❌ Failed to initialize connected device:', error);
      throw error;
    }
  }

  /**
   * Bind and sync device with proper command queuing
   */
  private async bindAndSync(): Promise<void> {
    try {
      console.log('🔗 Executing bindAndSync with command queue...');

      // Queue bind command
      await this.commandQueue.enqueue(
        () => ringCommands.deviceBind(),
        'deviceBind',
        8
      );

      // Queue time sync command
      await this.commandQueue.enqueue(
        () => ringCommands.timeSyn(),
        'timeSyn',
        7
      );

      console.log('✅ Bind and sync commands queued');
    } catch (error) {
      console.error('❌ Failed to bind and sync device:', error);
      throw error;
    }
  }

  /**
   * Extract Ring data from BLE device
   */
  private extractRingDataFromBLE(device: any): SmartRingX1 | null {
    try {
      // Implementation would extract Ring-specific data from BLE advertising
      // This is a simplified version
      return {
        id: device.id,
        name: device.name || 'SmartRing X1',
        color: 0,
        size: 7,
        rssi: device.rssi,
        advertising: device.advertising,
      };
    } catch (error) {
      console.error('Failed to extract Ring data from BLE device:', error);
      return null;
    }
  }


  /**
   * Setup BLE notification handlers
   * Following reference implementation pattern with listeners
   */
  private setupNotificationHandlers(): void {
    console.log('📡 Setting up Ring notification handlers...');

    // Setup BLE notification callback (like reference implementation)
    ringBleModule.setOnNotification((data: number[]) => {
      console.log('📨 Ring notification received:', data);
      this.processRingNotification(data);
    });

    // Setup disconnection handler to detect when Ring disconnects
    ringBleModule.setOnDisconnection(async (deviceId: string, error?: any) => {
      console.log('❌ Ring device disconnected:', deviceId, error);

      // Update store to reflect disconnection
      const store = useRingStore.getState();
      store.setConnectionStatus({
        isConnected: false,
        isConnecting: false,
        deviceId: null,
        connectionError: error?.message || 'Device disconnected'
      });

      // Clear connected device from store but keep the device ID for reconnection
      const lastConnectedDevice = store.connectedRing;
      store.setConnectedRing(null);

      console.log('📊 Store updated to reflect disconnection');

      // Check if we should attempt automatic reconnection
      if (lastConnectedDevice && !this.isManualDisconnection) {
        console.log('🔄 Attempting automatic reconnection after unexpected disconnect...');

        // Update store to show we're attempting reconnection
        store.setConnectionStatus({
          isConnected: false,
          isConnecting: true,
          deviceId: deviceId,
          connectionError: null,
          retryMessage: 'Reconnecting to your Ring...'
        });

        // Attempt immediate reconnection
        this.attemptReconnectionAfterDisconnect(deviceId, lastConnectedDevice)
          .then(success => {
            if (success) {
              console.log('✅ Automatic reconnection successful!');
            } else {
              console.log('❌ Automatic reconnection failed');
              store.setConnectionStatus({
                isConnected: false,
                isConnecting: false,
                deviceId: null,
                connectionError: 'Failed to reconnect. Please connect manually.'
              });
            }
          })
          .catch(err => {
            console.error('❌ Reconnection error:', err);
            store.setConnectionStatus({
              isConnected: false,
              isConnecting: false,
              deviceId: null,
              connectionError: 'Reconnection failed'
            });
          });
      }
    });

    console.log('✅ Ring notification handlers setup complete');
  }

  /**
   * Register SDK listeners following manufacturer reference implementation
   */
  private async registerSDKListeners(): Promise<void> {
    try {
      console.log('📡 Registering SDK listeners (manufacturer pattern)...');

      // Get JavaScript version (like manufacturer code)
      const version = this.ringSDK.getJSVersion();
      console.log('Ring SDK version:', version);

      // Battery Data And State Listener
      const batteryDataAndStateListener = {
        onResult: (data: any) => {
          console.log('🔋 Battery data received from SDK:', data);
          if (data) {
            const isWireless = false; // TODO: Determine from device name
            const charging = data.status === 1;
            const result = charging ? "charging" : "uncharged";

            let batteryPer = 0;
            if (data.batteryPer) {
              batteryPer = data.batteryPer;
            } else {
              // Use SDK calculation like manufacturer
              batteryPer = this.ringSDK.calcBattery(data.batteryValue, charging, isWireless);
            }

            const batteryData = {
              batteryValue: data.batteryValue,
              batteryPer: batteryPer,
              status: result,
            };

            // Update store
            const store = useRingStore.getState();
            store.setBatteryData(batteryData);
            console.log('✅ Battery data updated via SDK listener:', batteryData);
          }
        },
      };

      // Device Info 1 Listener 
      const deviceInfo1Listener = {
        onResult: async (data: any) => {
          console.log('📱 Device Info 1 received from SDK:', data);

          // Signal command queue that response was received
          this.commandQueue.signalResponse('deviceInfo1');

          if (data) {
            let colorName = "";
            if (data.color === 0) {
              colorName = "Deep Black";
            } else if (data.color === 1) {
              colorName = "Silver";
            } else if (data.color === 2) {
              colorName = "Gold";
            } else if (data.color === 3) {
              colorName = "Rose Gold";
            }

            const deviceInfo1: IDeviceInfo1 = {
              color: data.color,
              size: data.size,
              bleAddress: data.bleAddress,
              deviceVer: data.deviceVer,
              switchOem: data.switchOem,
              chargingMode: data.chargingMode,
              mainChipModel: data.mainChipModel,
              productIteration: data.productIteration,
            };

            console.log('✅ Device Info 1 received:', deviceInfo1, 'Color Name:', colorName);

            // Store device info 1 in the store
            const store = useRingStore.getState();
            store.setDeviceInfo1(deviceInfo1);

            // CRITICAL DECISION POINT - switchOem determines the flow
            console.log('🔑 CRITICAL DECISION - switchOem:', data.switchOem);

            if (data.switchOem === 1) {
              console.log('🔐 Path A: OEM-Enabled Ring detected');
              console.log('📤 Queuing deviceInfo2 command...');

              // Send deviceInfo2 ONCE for OEM devices
              await this.commandQueue.enqueue(
                () => ringCommands.deviceInfo2(),
                'deviceInfo2',
                9 // High priority
              );
            } else {
              console.log('🚀 Path B: Non-OEM Ring - Starting nonOemSync()...');
              // Trigger nonOemSync for non-OEM rings
              await this.nonOemSync();
            }
          }
        },
      };

      // Re-package Listener (command responses) - FIXED INTERPRETATION
      const rePackageListener = {
        onResult: (data: any) => {
          console.log('📦 Command response received from SDK:', data);
          if (data) {
            // FIX: Correct interpretation - SDK returns "success" string or sometimes 0 for success
            const result = (data.result === "success" || data.result === 0) ? "success" : "fail";
            console.log(`Command 0x${data.cmd.toString(16)} result: ${result}`);

            // Handle successful command responses
            if (result === "success") {
              console.log(`✅ Command 0x${data.cmd.toString(16)} executed successfully`);

              // Special handling for OEM verification commands
              if (data.cmd === 15) { // 0x0F - deviceInfo1
                console.log('✅ deviceInfo1 command successful - OEM verification proceeding');
              }
              if (data.cmd === 16) { // 0x10 - deviceInfo2  
                console.log('✅ deviceInfo2 command successful - OEM verification complete');
              }
            } else {
              console.log(`❌ Command 0x${data.cmd.toString(16)} failed:`, data.reason || 'Unknown reason');
            }
          }
        },
      };

      // Device Info 2 Listener (REFERENCE PATTERN: Match reference implementation)
      const deviceInfo2Listener = {
        onResult: async (data: any) => {
          console.log('📱 Device Info 2 received from SDK:', data);

          // Signal command queue that response was received
          this.commandQueue.signalResponse('deviceInfo2');

          if (data) {
            // Extract all fields like reference implementation
            const deviceInfo2: IDeviceInfo2 = {
              sn: data.sn,
              sn8: data.sn8 || data.sn,  // Use sn as fallback for sn8
              sosSwitch: data.sosSwitch,
              doubleClickCount: data.doubleClickCount,
              clickInterval: data.clickInterval,
              tapDetectionThreshold: data.tapDetectionThreshold,
              startTime: data.startTime,
              endTime: data.endTime,
              bindStatus: data.bindStatus,
              samplingRate: data.samplingRate,
              rawWaveSwitch: data.rawWaveSwitch,
            };

            console.log('✅ Device Info 2 processed:', deviceInfo2);
            console.log(`📋 Ring Serial Number: ${data.sn}`);
            console.log(`🔗 Ring Bind Status: ${data.bindStatus}`);

            // Store device info 2 in the store
            const store = useRingStore.getState();
            store.setDeviceInfo2(deviceInfo2);

            console.log('🎉 SUCCESS: Complete Ring device identification achieved!');
            console.log(`Device: Size ${data.size || 'unknown'}, SN: ${data.sn}`);

            // Auto-store pairing information when both device infos are available
            await this.autoStorePairingInfo();

            // After deviceInfo2, queue remaining initialization commands
            await this.commandQueue.enqueue(
              () => ringCommands.batteryDataAndState(),
              'batteryDataAndState',
              5
            );
          }
        },
      };

      // OEM Result Listener - ENHANCED WITH POST-VERIFICATION HANDLING
      const oemResultListener = {
        onResult: (data: any) => {
          console.log('🔐 OEM verification result received:', data);
          const result = data ? "Verification successful" : "Verification failed";
          console.log('🔐 OEM verification result:', result);
          console.log(`🏆 Ring OEM Authentication: ${result.toUpperCase()}`);

          if (data) {
            console.log('✅ Ring OEM verification completed successfully!');
            console.log('🎯 Ring is now fully authenticated and ready for advanced operations');

            // Mark device as fully bound after successful OEM verification
            const store = useRingStore.getState();
            if (store.deviceInfo2) {
              // Force bind status to "Bind" after successful OEM verification
              const updatedDeviceInfo2 = { ...store.deviceInfo2, bindStatus: 1 };
              store.setDeviceInfo2(updatedDeviceInfo2);

              // Update persistence with successful binding
              DevicePersistenceService.storePairingState('Bind', true, false)
                .then(() => console.log('✅ Device marked as bound after OEM verification'))
                .catch(err => console.error('❌ Failed to update binding status:', err));
            }

            // Continue with post-OEM verification steps
            this.continueAfterOEMVerification().catch(error => {
              console.error('❌ Failed to continue after OEM verification:', error);
            });
          } else {
            console.log('❌ Ring OEM verification failed - Ring may have limited functionality');
          }
        },
      };

      // Historical Data Listeners
      const historicalNumListener = {
        onResult: (data: any) => {
          console.log('📊 Historical number data received from SDK:', data);
          if (data && data.num !== undefined) {
            console.log(`📈 Ring has ${data.num} historical records stored`);

            // Reset processing state for new sync
            this.historicalBuffer = [];
            this.processedUUIDs.clear();

            // Set max UUID for completion tracking (YoiHealth pattern)
            if (data.minUUID < data.maxUUID) {
              this.maxUUID = data.maxUUID;
              console.log(`📊 UUID range: ${data.minUUID} to ${data.maxUUID}`);
            } else {
              this.maxUUID = 0;
              console.log('⚠️ No valid UUID range - ring may have no data');
            }

            // Update store
            const store = useRingStore.getState();
            store.setHistoricalDataCount(data.num);
          }
        }
      };

      const historicalDataListener = {
        onResult: async (data: any) => {
          console.log('📊 HISTORICAL DATA LISTENER TRIGGERED!');
          console.log('📊 Historical data record received:', data);

          if (data) {
            // YoiHealth validation pattern
            const wearStatus = data.wearStatus === 1 ? "wear" : "noWear";
            const chargeStatus = data.chargeStatus === 1 ? "charging" : "uncharged";
            const detectionMode = data.detectionMode === 1 ? "BloodOxygenMode" : "HeartRateMode";

            // Bad data check (YoiHealth pattern)
            const isBadData = this.checkBadData(data.rawHr);

            // UUID-based deduplication
            if (!this.processedUUIDs.has(data.uuid)) {
              this.processedUUIDs.add(data.uuid);

              // Validate and process data
              if (this.isValidHistoricalData(data, isBadData)) {
                const processedRecord: IHistorical = {
                  timeStamp: data.timeStamp || data.ts,
                  heartRate: data.heartRate,
                  motionDetectionCount: data.motionDetectionCount || 0,
                  detectionMode,
                  wearStatus,
                  chargeStatus,
                  uuid: data.uuid,
                  hrv: data.hrv || 0,
                  temperature: data.finger_temperature || data.temperature || 0,
                  step: data.step || data.steps || 0,
                  ox: data.ox || data.bloodOxygen || 0,
                  rawHr: data.rawHr || []
                };

                // Add to processing buffer
                this.historicalBuffer.push(processedRecord);
                console.log(`✅ Processed historical record ${data.uuid}: HR=${data.heartRate}, SpO2=${processedRecord.ox}%`);
              } else {
                console.log(`⚠️ Skipped invalid historical record ${data.uuid}: HR=${data.heartRate}, wear=${wearStatus}, charge=${chargeStatus}`);
              }
            } else {
              console.log(`🔄 Skipped duplicate UUID ${data.uuid}`);
            }

            // Update max UUID for completion tracking
            if (data.uuid > this.maxUUID) {
              this.maxUUID = data.uuid;
            }

            // Check if this is the last record (maxUUID reached)
            if (data.uuid === this.maxUUID && this.historicalBuffer.length > 0) {
              console.log(`📈 Historical sync complete: ${this.historicalBuffer.length} valid records`);
              await this.finalizeHistoricalSync();
            }
          }
        }
      };

      // Register all listeners (like manufacturer code)
      this.ringSDK.registerBatteryDataAndStateListener(batteryDataAndStateListener);
      this.ringSDK.registerDeviceInfo1Listener(deviceInfo1Listener);
      this.ringSDK.registerDeviceInfo2Listener(deviceInfo2Listener);
      this.ringSDK.registerHistoricalNumListener(historicalNumListener);
      this.ringSDK.registerHistoricalDataListener(historicalDataListener);
      this.ringSDK.registerRePackageListener(rePackageListener);
      this.ringSDK.registerOEMResultListener(oemResultListener);

      console.log('✅ All SDK listeners registered successfully (including historical data)');
    } catch (error) {
      console.error('❌ Failed to register SDK listeners:', error);
      throw error;
    }
  }

  /**
   * Process incoming Ring notifications
   * Routes notifications to appropriate processors (battery, health data, etc.)
   * Based on reference implementation listener pattern
   */
  private processRingNotification(data: number[]): void {
    try {
      console.log('🔄 processRingNotification called with data:', data ? data.length : 'null');

      if (!data || data.length === 0) {
        console.warn('⚠️ Empty notification data received');
        return;
      }

      // Log ALL incoming data for debugging (like reference implementation)
      console.log('📨 Raw Ring notification data:', {
        bytes: data,
        hex: data.map(b => '0x' + b.toString(16).padStart(2, '0')).join(' '),
        opcode: data[0] ? '0x' + data[0].toString(16) : 'unknown',
        length: data.length
      });

      console.log('🔍 About to check opcode...');

      // Check if this is a battery notification (opcode 0x0c)
      if (BatteryProcessor.isBatteryNotification(data)) {
        console.log('🔋 Processing battery notification...');
        const result = BatteryProcessor.processBatteryNotification(data);

        if (result.processed && result.batteryData) {
          // Update store with battery data (like reference implementation)
          const store = useRingStore.getState();
          store.setBatteryData(result.batteryData);
          console.log('✅ Battery data updated in store:', result.batteryData);
        } else {
          console.error('❌ Failed to process battery notification:', result.error);
        }
        return;
      }

      // Check for SDK protocol responses (opcode 0xFE/254)
      const opcode = data[0];
      if (opcode === 254) { // 0xFE - SDK protocol marker
        console.log('🔧 SDK protocol response detected');
        const subCommand = data[1];

        // deviceInfo1 response (typically 0x87/135)
        if (subCommand === 135) { // 0x87
          console.log('📱 deviceInfo1 response detected - processing...');
          this.handleDeviceInfo1Response(data);
          return;
        }

        // Other SDK responses
        console.log(`🔧 SDK response: opcode=0x${opcode.toString(16)}, sub=0x${subCommand.toString(16)}`);
        return;
      }

      // Check for other command responses by opcode
      switch (opcode) {
        case 0x15: // Device bind response
          console.log('🔗 Device bind response received');
          break;

        case 0x04: // Time sync response
          console.log('⏰ Time sync response received');
          break;

        case 0x02: // Device info 1 response
          console.log('📱 Device info 1 response received');
          this.processDeviceInfoResponse(data);
          break;

        case 0x03: // Device info 2 response  
          console.log('📋 Device info 2 response received');
          break;

        case 0x0f: // Historical data count response
          console.log('📊 Historical data count response received');
          break;

        case 0x10: // Historical data response
          console.log('📈 Historical data response received');
          break;

        case 0x06: // Temperature response
          console.log('🌡️ Temperature response received');
          break;

        default:
          console.log(`📊 Unknown notification type (opcode: 0x${opcode?.toString(16) || 'unknown'})`);
          console.log('📝 This might be continuous health data or unknown response');
          break;
      }

    } catch (error) {
      console.error('❌ Error processing Ring notification:', error);
    }
  }

  /**
   * Process device info response (basic parsing for now)
   */
  private processDeviceInfoResponse(data: number[]): void {
    try {
      if (data.length < 4) {
        console.warn('⚠️ Device info response too short');
        return;
      }

      console.log('📱 Device info raw data:', data);
      // TODO: Parse device info according to reference implementation
      // This would include color, size, version, etc.

    } catch (error) {
      console.error('❌ Error processing device info response:', error);
    }
  }

  /**
   * Handle deviceInfo1 response using EXACT manufacturer pattern
   * Implements the critical switchOem decision logic from the guide
   */
  private handleDeviceInfo1Response(data: number[]): void {
    try {
      console.log('📱 Processing deviceInfo1 response (MANUFACTURER PATTERN)...');

      // Parse deviceInfo1 response based on manufacturer guide
      // Response: [254, 135, 1, 9, MAC[6], color, size, model, ver1, ver2, ver3, ver4, switchOem, ...]
      if (data.length >= 20) {
        // Extract device data based on actual response: [254, 135, 1, 9, MAC[6], ?, ?, color, size, ?, ?, ?, ?, switchOem, ?, ...]
        const deviceInfo1Data = {
          color: data[12] || 0,        // Ring color (0=Black, 1=Silver, 2=Gold, 3=Rose Gold) 
          size: data[13] || 7,         // Ring size
          bleAddress: data.slice(4, 10), // MAC address [6 bytes]
          deviceVer: [data[14], data[15], data[16], data[17]], // Firmware version
          switchOem: data[18] === 1,   // OEM verification support flag (CRITICAL!) - Fixed position
          chargingMode: data[10] || 0, // Charging mode
          mainChipModel: data[19] || 0,
          productIteration: data[11] || 0
        };

        console.log('📱 deviceInfo1 parsed:', deviceInfo1Data);
        console.log('🔑 CRITICAL DECISION - switchOem:', deviceInfo1Data.switchOem);

        // MANUFACTURER PATTERN: Critical Decision Point (syncListeners.ts:279-285)
        if (deviceInfo1Data.switchOem) {
          console.log('🔐 Path A: OEM-Enabled Ring - Starting OEM verification...');
          this.startOem = false; // Prevent multiple OEM verifications

          this.ringSDK.startOEMVerify((cmd: string, cmdData: any) => {
            console.log('📤 OEM verification command:', cmd, cmdData);
            ringCommands.sendCommand(cmd, cmdData);
          });
        } else {
          console.log('🚀 Path B: Non-OEM Ring - Starting nonOemSync()...');
          this.nonOemSync(); // Direct sync without OEM verification
        }

        // Store device info in state (manufacturer pattern)
        const colorNames = ["Deep Black", "Silver", "Gold", "Rose Gold"];
        const deviceInfo = {
          color: colorNames[deviceInfo1Data.color] || "Unknown",
          size: deviceInfo1Data.size,
          version: deviceInfo1Data.deviceVer.join('.'),
          switchOem: deviceInfo1Data.switchOem,
          bleAddress: Array.from(deviceInfo1Data.bleAddress).map(b => b.toString(16).padStart(2, '0')).join(':')
        };
        console.log('✅ deviceInfo1 stored:', deviceInfo);

      } else {
        console.error('❌ deviceInfo1 response too short:', data.length, 'bytes');
      }

    } catch (error) {
      console.error('❌ Failed to handle deviceInfo1 response:', error);
    }
  }

  /**
   * Non-OEM Sync Process (manufacturer pattern)
   * Called when switchOem = false - Ring doesn't require OEM verification
   */
  private async nonOemSync(): Promise<void> {
    try {
      console.log('🔄 Starting nonOemSync with proper command queuing...');

      // Use command queue to prevent flooding

      // Step 1: Device Binding
      console.log('🔗 Step 1: Queuing device bind...');
      await this.commandQueue.enqueue(
        () => ringCommands.deviceBind(),
        'deviceBind',
        8
      );

      // Step 2: Time Sync
      console.log('⏰ Step 2: Queuing time sync...');
      await this.commandQueue.enqueue(
        () => ringCommands.timeSyn(),
        'timeSyn',
        7
      );

      // Step 3: Query Device Info 2
      // CRITICAL FIX: Send deviceInfo2 for non-OEM devices
      console.log('📋 Step 3: Queuing device info 2...');
      await this.commandQueue.enqueue(
        () => ringCommands.deviceInfo2(),
        'deviceInfo2',
        6
      );

      // Step 4: Battery Status Check (will be queued by deviceInfo2 listener)
      // The deviceInfo2 listener already queues batteryDataAndState
      console.log('🔋 Step 4: Battery status will be queued after deviceInfo2 response');

      console.log('✅ nonOemSync commands queued successfully!');

    } catch (error) {
      console.error('❌ nonOemSync failed:', error);
      throw error;
    }
  }

  // ===== HEALTH DATA COLLECTION METHODS =====

  /**
   * Start health data collection with real-time monitoring
   * Based on YoiHealth pattern for continuous health monitoring
   * @param durationMinutes - Duration to collect data (default: 2 minutes)
   * @returns Promise<HealthReading[]> - Array of collected health readings
   */
  public async startHealthDataCollection(durationMinutes: number = 2): Promise<HealthReading[]> {
    console.log(`🩺 Starting ${durationMinutes}-minute health data collection...`);

    const healthData: HealthReading[] = [];

    // Health data listener following YoiHealth pattern
    const healthListener = {
      onResult: (data: any) => {
        console.log('📊 Raw health data received:', data);

        if (data && data.status === 2) { // Status 2 = valid reading
          if (data.oxValue >= 95 && data.heartValue > 0) { // Valid readings only
            const reading: HealthReading = {
              heartRate: data.heartValue,
              bloodOxygen: data.oxValue,
              timestamp: new Date().getTime(),
            };

            healthData.push(reading);
            console.log(`📈 Health reading: HR=${reading.heartRate} bpm, SpO2=${reading.bloodOxygen}%`);

            // Update store with real-time data
            const store = useRingStore.getState();
            store.addHealthReading(reading);
          } else {
            console.log(`⚠️ Invalid health reading: HR=${data.heartValue}, SpO2=${data.oxValue}`);
          }
        } else {
          console.log(`⚠️ Health data status invalid: ${data?.status}`);
        }
      }
    };

    try {
      // Register health listener
      this.ringSDK.registerHealthListener(healthListener);
      console.log('✅ Health listener registered');

      // Start comprehensive health monitoring (heart rate + blood oxygen)
      await ringCommands.openHealth();
      console.log('🔄 Health monitoring active - Ring collecting HR & SpO2');

      // Let it run for specified duration
      console.log(`⏱️ Collecting health data for ${durationMinutes} minutes...`);
      await new Promise(resolve => setTimeout(resolve, durationMinutes * 60 * 1000));

      // Stop health monitoring
      await ringCommands.closeHealth();
      console.log('⏹️ Health monitoring stopped');

      // Unregister listener to prevent memory leaks
      this.ringSDK.unregisterHealthListener();
      console.log('✅ Health listener unregistered');

      console.log(`📈 Health data collection complete - collected ${healthData.length} readings`);
      return healthData;

    } catch (error) {
      console.error('❌ Health data collection failed:', error);

      // Cleanup on error
      try {
        await ringCommands.closeHealth();
        this.ringSDK.unregisterHealthListener();
      } catch (cleanupError) {
        console.error('❌ Error during health collection cleanup:', cleanupError);
      }

      throw error;
    }
  }

  /**
   * Get single temperature reading
   * @returns Promise<number> - Temperature in Celsius
   */
  public async getTemperatureReading(): Promise<number | null> {
    return new Promise((resolve) => {
      let temperatureValue: number | null = null;

      // Temperature listener
      const temperatureListener = {
        onResult: (data: any) => {
          console.log('🌡️ Temperature data received:', data);

          if (data && data.temperature !== undefined) {
            temperatureValue = data.temperature;
            console.log(`🌡️ Finger Temperature: ${temperatureValue}°C`);

            // Update store
            const store = useRingStore.getState();
            if (temperatureValue !== null) {
              store.setTemperature(temperatureValue);
            }

            // Unregister listener and resolve
            this.ringSDK.unregisterTemperatureListener();
            resolve(temperatureValue);
          } else {
            console.warn('⚠️ Invalid temperature data received');
            this.ringSDK.unregisterTemperatureListener();
            resolve(null);
          }
        }
      };

      try {
        // Register temperature listener
        this.ringSDK.registerTemperatureListener(temperatureListener);
        console.log('✅ Temperature listener registered');

        // Request temperature reading
        ringCommands.temperature().catch((error) => {
          console.error('❌ Failed to request temperature:', error);
          this.ringSDK.unregisterTemperatureListener();
          resolve(null);
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (temperatureValue === null) {
            console.warn('⏰ Temperature reading timeout');
            this.ringSDK.unregisterTemperatureListener();
            resolve(null);
          }
        }, 10000);

      } catch (error) {
        console.error('❌ Temperature reading setup failed:', error);
        resolve(null);
      }
    });
  }

  /**
   * Start real-time health monitoring (continuous)
   * For live health data display in UI
   */
  public async startRealTimeHealthMonitoring(): Promise<void> {
    console.log('🔄 Starting real-time health monitoring...');

    // Real-time health listener
    const realtimeHealthListener = {
      onResult: (data: any) => {
        if (data && data.status === 2 && data.oxValue >= 95 && data.heartValue > 0) {
          const reading: HealthReading = {
            heartRate: data.heartValue,
            bloodOxygen: data.oxValue,
            timestamp: new Date().getTime(),
          };

          console.log(`📊 Real-time: HR=${reading.heartRate} bpm, SpO2=${reading.bloodOxygen}%`);

          // Update store for real-time UI updates
          const store = useRingStore.getState();
          store.setCurrentHealth(reading);
          store.addHealthReading(reading);
        }
      }
    };

    try {
      // Register real-time listener
      this.ringSDK.registerHealthListener(realtimeHealthListener);
      console.log('✅ Real-time health listener registered');

      // Start health monitoring
      await ringCommands.openHealth();
      console.log('🔄 Real-time health monitoring active');

    } catch (error) {
      console.error('❌ Failed to start real-time health monitoring:', error);
      throw error;
    }
  }

  /**
   * Stop real-time health monitoring
   */
  public async stopRealTimeHealthMonitoring(): Promise<void> {
    try {
      console.log('⏹️ Stopping real-time health monitoring...');

      // Stop health monitoring
      await ringCommands.closeHealth();
      console.log('⏹️ Health monitoring stopped');

      // Unregister listener
      this.ringSDK.unregisterHealthListener();
      console.log('✅ Real-time health listener unregistered');

    } catch (error) {
      console.error('❌ Failed to stop real-time health monitoring:', error);
      throw error;
    }
  }

  /**
   * Get current step count
   */
  public async getCurrentSteps(): Promise<number | null> {
    return new Promise((resolve) => {
      let stepCount: number | null = null;

      const stepListener = {
        onResult: (data: any) => {
          console.log('👟 Step data received:', data);

          if (data && data.steps !== undefined) {
            stepCount = data.steps;
            console.log(`👟 Current Steps: ${stepCount}`);

            // Update store
            const store = useRingStore.getState();
            if (stepCount !== null) {
              store.setSteps(stepCount);
            }

            resolve(stepCount);
          } else {
            console.warn('⚠️ Invalid step data received');
            resolve(null);
          }
        }
      };

      try {
        // Register step listener
        this.ringSDK.registerStepListener(stepListener);
        console.log('✅ Step listener registered');

        // Request step count
        ringCommands.getSteps().catch((error) => {
          console.error('❌ Failed to request steps:', error);
          resolve(null);
        });

        // Timeout after 10 seconds
        setTimeout(() => {
          if (stepCount === null) {
            console.warn('⏰ Step count timeout');
            resolve(null);
          }
        }, 10000);

      } catch (error) {
        console.error('❌ Step count setup failed:', error);
        resolve(null);
      }
    });
  }

  // ===== DATA COLLECTION CONFIGURATION METHODS =====

  /**
   * Configure Ring for data collection (CRITICAL for historical data)
   * Based on YoiHealth pattern: Ring needs to be told to start persisting data
   * @returns Promise<void>
   */
  public async configureDataCollection(): Promise<void> {
    try {
      console.log('⚙️ Configuring Ring for data collection...');

      // Get current Ring configuration
      const store = useRingStore.getState();
      const deviceInfo2 = store.deviceInfo2;

      if (!deviceInfo2) {
        console.warn('⚠️ DeviceInfo2 not available, cannot configure data collection');
        return;
      }

      console.log('📋 Current Ring configuration:', {
        samplingRate: deviceInfo2.samplingRate,
        rawWaveSwitch: deviceInfo2.rawWaveSwitch,
        startTime: deviceInfo2.startTime,
        endTime: deviceInfo2.endTime,
        bindStatus: deviceInfo2.bindStatus
      });

      // Check if Ring is already configured for data collection
      if (deviceInfo2.samplingRate > 0 && deviceInfo2.rawWaveSwitch > 0) {
        console.log('✅ Ring already configured for data collection');
        return;
      }

      console.log('🔧 Ring needs data collection configuration...');

      // YoiHealth Pattern: Configure Ring to start collecting data
      await this.enableRingDataCollection();

      console.log('✅ Ring data collection configuration completed');

    } catch (error) {
      console.error('❌ Failed to configure Ring data collection:', error);
    }
  }

  /**
   * Enable Ring data collection with optimal settings
   * Following YoiHealth pattern for data persistence activation
   * @returns Promise<void>
   */
  private async enableRingDataCollection(): Promise<void> {
    try {
      console.log('🔄 Enabling Ring data collection...');

      // YoiHealth Pattern: Ring SDK should have configuration methods
      // Try to configure Ring SDK for data collection first
      try {
        console.log('📡 Attempting Ring SDK data collection configuration...');

        const currentTime = Date.now();
        const config = {
          samplingRate: 1,           // Enable sampling (YoiHealth uses 1)
          rawWaveSwitch: 1,          // Enable raw wave data (YoiHealth uses 1)
          startTime: currentTime,    // Start collecting now
          endTime: 0,                // 0 = continuous collection
        };

        await this.ringSDK.setDataCollectionConfig(config);
        console.log('✅ Ring SDK data collection configured:', config);
        return; // Configuration successful, exit early

      } catch (sdkError) {
        console.log('🔧 Ring SDK configuration failed, using command sequence fallback:', sdkError instanceof Error ? sdkError.message : String(sdkError));

        // Fallback: Try to trigger data collection through device binding
        // This should signal to Ring that it's paired and should start collecting
        console.log('📡 Re-binding device to trigger data collection...');
        await ringCommands.deviceBind();
        await this.delay(500);

        // Additional: Try to trigger health monitoring
        console.log('❤️ Enabling health monitoring...');
        await ringCommands.openHealth();
        await this.delay(500);

        console.log('✅ Data collection enabled through command sequence');
      }

    } catch (error) {
      console.error('❌ Failed to enable Ring data collection:', error);
      throw error;
    }
  }

  /**
   * Check Ring data collection status
   * @returns Promise<boolean> - true if Ring is configured to collect data
   */
  public async isDataCollectionEnabled(): Promise<boolean> {
    try {
      const store = useRingStore.getState();
      const deviceInfo2 = store.deviceInfo2;

      if (!deviceInfo2) {
        return false;
      }

      const isEnabled = deviceInfo2.samplingRate > 0 && deviceInfo2.rawWaveSwitch > 0;

      console.log('📊 Ring data collection status:', {
        enabled: isEnabled,
        samplingRate: deviceInfo2.samplingRate,
        rawWaveSwitch: deviceInfo2.rawWaveSwitch,
        bindStatus: deviceInfo2.bindStatus
      });

      return isEnabled;
    } catch (error) {
      console.error('❌ Failed to check data collection status:', error);
      return false;
    }
  }

  /**
   * Force Ring to start data collection (manual trigger)
   * Use this if automatic configuration fails
   * @returns Promise<void>
   */
  public async forceEnableDataCollection(): Promise<void> {
    try {
      console.log('🚀 Force enabling Ring data collection...');

      // Multiple approaches to trigger data collection
      console.log('1️⃣ Device rebinding...');
      await ringCommands.deviceBind();
      await this.delay(500);

      console.log('2️⃣ Health monitoring activation...');
      await ringCommands.openHealth();
      await this.delay(500);

      console.log('3️⃣ Time sync refresh...');
      await ringCommands.timeSyn();
      await this.delay(500);

      console.log('4️⃣ Battery status check...');
      await ringCommands.batteryDataAndState();
      await this.delay(500);

      console.log('✅ Force data collection sequence completed');

      // Check if it worked
      const isEnabled = await this.isDataCollectionEnabled();
      if (isEnabled) {
        console.log('🎉 Data collection successfully enabled!');
      } else {
        console.warn('⚠️ Data collection may not be fully enabled. Check Ring settings.');
      }

    } catch (error) {
      console.error('❌ Failed to force enable data collection:', error);
      throw error;
    }
  }

  /**
   * Cleanup and destroy the service
   */
  public destroy(): void {
    try {
      this.disconnect();
      this.isInitialized = false;
      console.log('Ring service destroyed');
    } catch (error) {
      console.error('Error destroying Ring service:', error);
    }
  }
}

// Export singleton instance
export const ringService = RingService.getInstance();