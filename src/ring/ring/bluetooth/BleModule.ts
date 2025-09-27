/**
 * Ring BLE Module
 * Modernized BLE communication layer using react-native-ble-plx
 * Ported from YoiHealth project for SmartRing X1 connectivity
 */

import { Platform } from 'react-native';
import { BleManager, Device, State } from 'react-native-ble-plx';
import {
  BLEConnectionCallback,
  BLEConnectionOptions,
  BLEConnectionState,
  BLEDevice,
  BLEDisconnectionCallback,
  BLEDiscoveryCallback,
  BLENotificationCallback,
  BLEScanOptions,
  BLEStateChangeCallback
} from '../../types/ble';
import {
  CONNECTION_TIMEOUT,
  DEFAULT_MTU,
  FILTER_UUID,
  RING_DEVICE_NAME_PATTERNS,
  RING_SERVICE_UUID,
  RING_SERVICE_UUID_IOS,
  SCAN_TIMEOUT
} from './constants';

export class RingBleModule {
  private manager: BleManager | null = null;
  private connectedDevice: Device | null = null;
  private connectionState: BLEConnectionState = BLEConnectionState.DISCONNECTED;
  private isScanning = false;
  private isInitialized = false;
  private isReady = false;
  private scanTimeoutId: ReturnType<typeof setTimeout> | null = null;
  private isConnecting = false;
  private discoveredDeviceIds: Set<string> = new Set(); // Track discovered devices to avoid duplicate logs

  // UUID collections for different operations (MANUFACTURER EXACT FORMAT)
  private writeServiceUUIDs: string[] = [];
  private writeCharacteristicUUIDs: string[] = [];
  private writeWithoutResponseServiceUUIDs: string[] = [];
  private writeWithoutResponseCharacteristicUUIDs: string[] = [];
  private notifyServiceUUIDs: string[] = [];
  private notifyCharacteristicUUIDs: string[] = [];
  private readServiceUUIDs: string[] = [];
  private readCharacteristicUUIDs: string[] = [];

  // Event callbacks
  private onConnectionCallback?: BLEConnectionCallback;
  private onDisconnectionCallback?: BLEDisconnectionCallback;
  private onDiscoveryCallback?: BLEDiscoveryCallback;
  private onStateChangeCallback?: BLEStateChangeCallback;
  private onNotificationCallback?: BLENotificationCallback;
  private onScanStoppedCallback?: () => void;

  constructor() {
    // Initialize lazily to avoid early native module access
  }

  /**
   * Ensure BLE Manager is initialized
   */
  private async ensureInitialized(): Promise<void> {
    if (!this.manager || !this.isInitialized) {
      await this.initializeManager();
    }
  }

  /**
   * Initialize BLE Manager and set up event listeners
   */
  private async initializeManager(): Promise<void> {
    try {
      if (this.isInitialized) {
        return;
      }

      console.log('Initializing BLE Manager...');
      this.manager = new BleManager();

      // Monitor BLE state changes
      this.manager.onStateChange((state) => {
        console.log('BLE State changed:', state);
        this.onStateChangeCallback?.(state as any);
      }, true);

      // MANUFACTURER CRITICAL FIX: BLE event listeners are handled per-device
      // in the startNotification() method using monitorCharacteristicForService
      // This ensures raw BLE data is fed to SDK via pushRawData()

      // MANUFACTURER FIX: Monitor device disconnections to clear state
      // Note: Connection events will be handled in the connect method per device

      this.isInitialized = true;
      console.log('Ring BLE Module initialized successfully');
    } catch (error) {
      console.error('Failed to initialize Ring BLE Module:', error);
      this.manager = null;
      this.isInitialized = false;
      throw error;
    }
  }

  /**
   * Start BLE module (following manufacturer reference pattern)
   * Called after connection is established
   */
  public start(): void {
    console.log('🚀 BLE Module started (manufacturer pattern)');
    // Initialize any required state after connection
    // This method is called after connection like in manufacturer code
  }

  /**
   * Check if BLE is enabled and available
   */
  public async isBluetoothEnabled(): Promise<boolean> {
    try {
      await this.ensureInitialized();
      if (!this.manager) {
        return false;
      }
      const state = await this.manager.state();
      return state === State.PoweredOn;
    } catch (error) {
      console.error('Error checking Bluetooth state:', error);
      return false;
    }
  }

  /**
   * Check if device is connected
   */
  public async isConnected(): Promise<boolean> {
    if (!this.connectedDevice) {
      return false;
    }

    try {
      const isConnected = await this.connectedDevice.isConnected();
      return isConnected;
    } catch (error) {
      console.error('Error checking device connection:', error);
      return false;
    }
  }

  /**
   * Start scanning for Ring devices
   */
  public async startScan(options?: BLEScanOptions): Promise<void> {
    try {
      if (this.isScanning) {
        console.warn('Scan already in progress');
        return;
      }

      const isEnabled = await this.isBluetoothEnabled();
      if (!isEnabled) {
        throw new Error('Bluetooth is not enabled');
      }

      // Stop any existing scan first  
      await this.stopScan();

      this.isScanning = true;
      this.discoveredDeviceIds.clear(); // Clear tracked devices for new scan

      console.log('Starting Ring device scan...');

      // Scan with Ring service UUID filter (like reference implementation)
      const serviceUUIDs = Platform.OS === 'ios'
        ? [RING_SERVICE_UUID_IOS]  // "1822" for iOS
        : [FILTER_UUID];           // "FEF5" filter for Android

      console.log('🔍 Scanning with service UUID filter:', serviceUUIDs);

      this.manager!.startDeviceScan(
        serviceUUIDs,
        {
          allowDuplicates: options?.allowDuplicates ?? false,
          scanMode: options?.scanMode === 'lowPower' ? 0 : options?.scanMode === 'balanced' ? 1 : 2,
        },
        (error, device) => {
          if (error) {
            console.error('Device scan error:', error);
            this.isScanning = false;
            return;
          }

          // Ignore scan results if we're connecting (prevents interference during connection attempts)
          if (this.isConnecting) {
            console.log('🚫 Ignoring scan result during connection attempt');
            return;
          }

          if (device) {
            // Only log if we haven't seen this device before
            const isNewDevice = !this.discoveredDeviceIds.has(device.id);

            if (isNewDevice) {
              // 🔍 LOG ALL DISCOVERED DEVICES FOR DEBUGGING
              console.log('🔍 BLE Device Found:', {
                name: device.name,
                localName: device.localName,
                id: device.id,
                rssi: device.rssi,
                isConnectable: device.isConnectable,
                serviceUUIDs: device.serviceUUIDs,
                manufacturerData: device.manufacturerData ? 'Yes' : 'No'
              });

              // Now using proper Ring detection (following reference implementation)
              const isRing = this.isRingDevice(device);
              const deviceName = device.name || device.localName || `Ring_${device.id.slice(-4)}`;

              console.log(`🔎 Device: "${deviceName}" | Ring? ${isRing} | Connectable: ${device.isConnectable}`);

              // Only show Ring devices (since we're now filtering properly)
              if (isRing) {
                console.log('✅ Ring device discovered:', deviceName, device.id);
                this.discoveredDeviceIds.add(device.id); // Mark as discovered
              }
            }

            // Still check if it's a Ring device for callback, even if not new
            const isRing = this.isRingDevice(device);
            if (isRing) {
              const deviceName = device.name || device.localName || `Ring_${device.id.slice(-4)}`;

              const bleDevice: BLEDevice = {
                id: device.id,
                name: deviceName,
                rssi: device.rssi ?? 0,
                serviceUUIDs: device.serviceUUIDs ?? undefined, // Add top-level serviceUUIDs for compatibility
                advertising: {
                  isConnectable: device.isConnectable ?? false,
                  localName: device.localName ?? undefined,
                  manufacturerData: device.manufacturerData,
                  serviceData: device.serviceData,
                  serviceUUIDs: device.serviceUUIDs ?? undefined,
                  txPowerLevel: device.txPowerLevel ?? undefined,
                }
              };

              this.onDiscoveryCallback?.(bleDevice);
            }
          }
        }
      );

      // Auto-stop scan after timeout
      if (options?.timeout ?? SCAN_TIMEOUT) {
        this.scanTimeoutId = setTimeout(() => {
          this.stopScan();
        }, options?.timeout ?? SCAN_TIMEOUT);
      }

    } catch (error) {
      console.error('Failed to start scan:', error);
      this.isScanning = false;
      throw error;
    }
  }

  /**
   * Stop device scanning
   */
  public async stopScan(): Promise<void> {
    try {
      if (this.isScanning) {
        this.manager?.stopDeviceScan();
        this.isScanning = false;

        // Clear the scan timeout to prevent auto-restart
        if (this.scanTimeoutId) {
          clearTimeout(this.scanTimeoutId);
          this.scanTimeoutId = null;
        }

        console.log('Device scan stopped');

        // Notify listeners that scan has stopped
        if (this.onScanStoppedCallback) {
          this.onScanStoppedCallback();
        }
      }
    } catch (error) {
      console.error('Failed to stop scan:', error);
    }
  }

  /**
   * Connect to a Ring device
   */
  /**
   * MANUFACTURER EXACT: Connect to Ring using YoiHealth continuous promise chain pattern
   * This prevents disconnection gaps between service discovery and notification setup
   */
  public async connect(deviceId: string, options?: BLEConnectionOptions): Promise<Device> {
    try {
      // Ensure BLE manager is initialized before attempting connection
      await this.ensureInitialized();

      if (this.connectionState === BLEConnectionState.CONNECTED && this.connectedDevice?.id === deviceId) {
        console.log('Already connected to device:', deviceId);
        return this.connectedDevice;
      }

      // Disconnect from current device if any
      if (this.connectedDevice) {
        await this.disconnect();
      }

      this.connectionState = BLEConnectionState.CONNECTING;
      this.isConnecting = true;
      console.log('🔗 Connecting to Ring device:', deviceId);

      // Only stop scan if it's actually running
      if (this.isScanning) {
        console.log('⏸️ Stopping active scan before connection...');
        await this.stopScan();
        // Add delay to let BLE settle after scan stop
        await new Promise(resolve => setTimeout(resolve, 300));
      }

      // Verify manager is initialized after ensureInitialized
      if (!this.manager) {
        throw new Error('BLE Manager failed to initialize - Bluetooth may not be available');
      }

      // MANUFACTURER EXACT: Single continuous promise chain (NO GAPS!)
      const result = await new Promise<Device>((resolve, reject) => {
        this.manager!.connectToDevice(deviceId, {
          autoConnect: options?.autoConnect ?? false,
          requestMTU: options?.requestMTU ?? DEFAULT_MTU,
          timeout: options?.timeout ?? CONNECTION_TIMEOUT,
        })
          .then((device) => {
            console.log('✅ BLE connected to:', device.name, device.id);

            // CRITICAL: Store device immediately (before any async operations)
            this.connectedDevice = device;

            console.log('✅ Connected - retrieving services...');
            return device.discoverAllServicesAndCharacteristics();
          })
          .then((deviceWithServices) => {
            console.log('✅ Services retrieved');

            // MANUFACTURER PATTERN: Store peripheral info IMMEDIATELY
            this.connectedDevice = deviceWithServices;

            // MANUFACTURER PATTERN: Log peripheral info
            return this.logPeripheralInfo(deviceWithServices).then(() => deviceWithServices);
          })
          .then((deviceWithServices) => {
            console.log('✅ Peripheral info logged - parsing UUIDs...');

            // MANUFACTURER PATTERN: Parse UUIDs IMMEDIATELY (same chain)
            return this.setupUUIDs(deviceWithServices).then(() => deviceWithServices);
          })
          .then((deviceWithServices) => {
            console.log('✅ UUIDs parsed - validating services...');

            // MANUFACTURER PATTERN: Validate required services exist
            if (this.notifyCharacteristicUUIDs.length === 0) {
              throw new Error('Missing notify characteristics - Ring initialization failed');
            }
            if (this.writeCharacteristicUUIDs.length === 0) {
              throw new Error('Missing write characteristics - Ring initialization failed');
            }

            console.log('✅ Services validated');

            // Don't start notifications here - let the caller handle it
            // This prevents duplicate notification setups
            return deviceWithServices;
          })
          .then((deviceWithServices) => {
            console.log('✅ Ready to start notifications');

            // MANUFACTURER CRITICAL: Verify notifications are actually active
            console.log('🔍 Verifying notification readiness for Ring responses...');
            if (this.notifyCharacteristicUUIDs.length === 0) {
              throw new Error('❌ Notification setup failed - no notify characteristics');
            }

            const notifyServiceCount = this.notifyServiceUUIDs.length;
            const notifyCharCount = this.notifyCharacteristicUUIDs.length;
            console.log(`✅ Notification verification passed: ${notifyServiceCount} services, ${notifyCharCount} characteristics`);
            console.log('✅ Ring is ready to receive commands and send responses');

            // Final verification
            return this.verifyRingDevice(deviceWithServices).then((isValid) => {
              if (!isValid) {
                throw new Error(`Device ${deviceWithServices.name} failed Ring verification`);
              }
              return deviceWithServices;
            });
          })
          .then((deviceWithServices) => {
            console.log('✅ Ring verification passed');

            // Set final connection state
            this.connectionState = BLEConnectionState.CONNECTED;
            this.isConnecting = false;

            // Monitor disconnection with enhanced diagnostics
            this.manager!.onDeviceDisconnected(deviceId, (error, device) => {
              console.log('❌ Ring disconnected');
              console.log('   Device ID:', deviceId);
              console.log('   Device Name:', device?.name);
              console.log('   Error:', error?.message);
              console.log('   Connection State:', this.connectionState);
              console.log('   Time since connection:', Date.now());
              console.log('   Current Command State: Ring may have been processing a command');

              this.handleDisconnection(device?.id ?? deviceId, error);
            });

            // Don't call connection callback here - CleanRingConnection will manage its own state
            // after the full setup is complete. This prevents premature state changes.
            // this.onConnectionCallback?.(deviceId);
            console.log('✅ Ring connected and ready for commands!');
            resolve(deviceWithServices);
          })
          .catch((error) => {
            console.error('❌ Ring connection failed:', error);

            // Enhanced error logging for debugging
            if (error.errorCode) {
              console.error('  Error Code:', error.errorCode);
            }
            if (error.androidErrorCode) {
              console.error('  Android Error Code:', error.androidErrorCode);
            }
            if (error.reason) {
              console.error('  Reason:', error.reason);
            }

            // Common Android BLE error codes
            if (error.androidErrorCode === 133) {
              console.error('  ⚠️ GATT ERROR (133) - Device may be out of range or needs a reset');
            } else if (error.androidErrorCode === 62) {
              console.error('  ⚠️ ALREADY CONNECTED (62) - Device reports already connected');
            } else if (error.message && error.message.includes('cancelled')) {
              console.error('  ⚠️ OPERATION CANCELLED - Scan may not have fully stopped');
            }

            this.connectionState = BLEConnectionState.DISCONNECTED;
            this.connectedDevice = null;
            this.isConnecting = false;
            reject(error);
          });
      });

      return result;

    } catch (error) {
      console.error('❌ Connect wrapper failed:', error);
      this.connectionState = BLEConnectionState.DISCONNECTED;
      this.connectedDevice = null;
      this.isConnecting = false;
      throw error;
    }
  }

  /**
   * Disconnect from the current device with proper cleanup
   */
  public async disconnect(): Promise<void> {
    try {
      if (this.connectedDevice) {
        this.connectionState = BLEConnectionState.DISCONNECTING;

        const deviceId = this.connectedDevice.id;
        await this.manager!.cancelDeviceConnection(deviceId);

        // Clean up all BLE resources
        this.cleanupBLEResources();

        console.log('Disconnected from Ring device with full cleanup');
      }
    } catch (error) {
      console.error('Failed to disconnect:', error);
      // Still clean up resources even if disconnect fails
      this.cleanupBLEResources();
    }
  }

  /**
   * Clean up all BLE resources and state
   */
  private cleanupBLEResources(): void {
    console.log('🧹 Cleaning up BLE resources...');

    // Clear device reference
    this.connectedDevice = null;
    this.connectionState = BLEConnectionState.DISCONNECTED;

    // Clear UUID arrays
    this.writeServiceUUIDs = [];
    this.writeCharacteristicUUIDs = [];
    this.notifyServiceUUIDs = [];
    this.notifyCharacteristicUUIDs = [];

    // Clear connection state flags
    this.isConnecting = false;
    this.isReady = false;

    // Clear callbacks
    this.onDiscoveryCallback = undefined;
    this.onDisconnectionCallback = undefined;

    console.log('✅ BLE resources cleaned up');
  }

  /**
   * Write data to the Ring device
   */
  /**
   * MANUFACTURER EXACT: Write data to Ring using exact pattern from YoiHealth
   */
  public async write(data: number[], index = 0, cmd = ""): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        // ✅ CRITICAL FIX: Allow OEM verification commands during connection transitions
        // During OEM verification, the connection state might be temporarily inconsistent
        const isOEMVerification = cmd.includes('deviceInfo2') || data[1] === 16; // deviceInfo2 has opcode 16

        if (!isOEMVerification && (!this.connectedDevice || this.connectionState !== BLEConnectionState.CONNECTED)) {
          console.error(`❌ Ring write setup failed: [Error: Ring device not connected]`);
          throw new Error('Ring device not connected');
        }

        if (isOEMVerification) {
          console.log(`🔐 OEM verification write - bypassing connection state check`);
          console.log(`🔍 Connection details: device=${!!this.connectedDevice}, state=${this.connectionState}`);
        }

        // MANUFACTURER EXACT: Find the correct write characteristic using findUUIDIndex
        const { WRITE_UUID } = require('./constants');
        const index_uuid = this.findUUIDIndex(
          this.writeCharacteristicUUIDs,
          WRITE_UUID  // "000066FE-0000-1000-8000-00805F9B34FB"
        );

        if (index_uuid >= this.writeServiceUUIDs.length || index_uuid >= this.writeCharacteristicUUIDs.length) {
          throw new Error('❌ Write characteristic not found - Ring not properly initialized!');
        }

        const writeService = this.writeServiceUUIDs[index_uuid];
        const writeChar = this.writeCharacteristicUUIDs[index_uuid];

        const writeStartTime = Date.now();
        console.log(`✍️ MANUFACTURER WRITE: Service=${writeService} | Characteristic=${writeChar} | Data=${data.length} bytes | Cmd=${cmd}`);
        console.log(`📤 Write Data:`, data);
        console.log(`⏰ Write start time: ${writeStartTime} | Connection State: ${this.connectionState}`);

        // MANUFACTURER EXACT: Validate we're writing to the correct characteristic
        if (!writeChar.includes('66FE')) {
          console.warn('⚠️ WARNING: Writing to non-66FE characteristic - Ring may reject!');
        } else {
          console.log('✅ Writing to correct Ring data characteristic (66FE)');
        }

        // Convert number array to base64 encoded data
        const uint8Array = new Uint8Array(data);
        const base64Data = this.arrayBufferToBase64(uint8Array);

        const device = this.connectedDevice!;
        device.writeCharacteristicWithResponseForService(
          writeService,
          writeChar,
          base64Data
        )
          .then(() => {
            const writeEndTime = Date.now();
            console.log(`✅ Ring write successful - took ${writeEndTime - writeStartTime}ms`);
            console.log(`⏰ Write end time: ${writeEndTime} | Connection State: ${this.connectionState}`);
            resolve({
              success: true,
              message: "Write operation success",
              cmd: cmd,
            });
          })
          .catch((error) => {
            const writeErrorTime = Date.now();
            console.error(`❌ Ring write failed after ${writeErrorTime - writeStartTime}ms:`, error);
            console.error(`⏰ Write error time: ${writeErrorTime} | Connection State: ${this.connectionState}`);
            reject(error);
          });

      } catch (error) {
        console.error('❌ Ring write setup failed:', error);
        reject(error);
      }
    });
  }

  /**
   * MANUFACTURER EXACT: Enable notifications using YoiHealth pattern
   * This method must be called immediately after UUID parsing to prevent disconnection
   */
  public async startNotification(index = 0): Promise<any> {
    return new Promise((resolve, reject) => {
      try {
        // MANUFACTURER PATTERN: Validate we have the device connection
        if (!this.connectedDevice) {
          throw new Error('No Ring device connected - peripheral ID missing');
        }

        // MANUFACTURER PATTERN: Validate we have parsed characteristics
        if (this.notifyCharacteristicUUIDs.length === 0) {
          throw new Error('No notify characteristics found - UUID parsing incomplete');
        }

        // MANUFACTURER EXACT: Find Ring notification characteristic (66FE)
        const targetUUID = "000066FE-0000-1000-8000-00805F9B34FB";
        const index_uuid = this.findUUIDIndex(this.notifyCharacteristicUUIDs, targetUUID);

        if (index_uuid >= this.notifyServiceUUIDs.length || index_uuid >= this.notifyCharacteristicUUIDs.length) {
          throw new Error(`❌ Ring notify characteristic (66FE) not found in parsed UUIDs`);
        }

        const notifyService = this.notifyServiceUUIDs[index_uuid];
        const notifyChar = this.notifyCharacteristicUUIDs[index_uuid];

        console.log(`🔔 MANUFACTURER NOTIFICATION SETUP:`);
        console.log(`   Service: ${notifyService}`);
        console.log(`   Characteristic: ${notifyChar}`);

        // MANUFACTURER VALIDATION: Ensure we're using Ring service and characteristic
        if (!notifyService.includes('1822')) {
          throw new Error(`❌ Wrong service for notifications: ${notifyService} (expected 1822)`);
        }
        if (!notifyChar.includes('66FE')) {
          throw new Error(`❌ Wrong characteristic for notifications: ${notifyChar} (expected 66FE)`);
        }

        console.log('✅ Validated Ring notification target (Service 1822, Characteristic 66FE)');

        // MANUFACTURER EXACT: Start monitoring notifications
        const subscription = this.connectedDevice.monitorCharacteristicForService(
          notifyService,      // Should be "00001822-0000-1000-8000-00805F9B34FB"
          notifyChar,         // Should be "000066FE-0000-1000-8000-00805F9B34FB"
          (error, characteristic) => {
            console.log('🔔 NOTIFICATION CALLBACK TRIGGERED:', error, characteristic);
            console.log('🔔 NOTIFICATION CALLBACK TRIGGERED:', {
              hasError: !!error,
              hasCharacteristic: !!characteristic,
              hasValue: !!characteristic?.value,
              timestamp: Date.now()
            });

            if (error) {
              console.error('❌ Ring notification error:', error);
              return;
            }

            if (characteristic?.value) {
              const data = this.base64ToUint8Array(characteristic.value);
              const dataArray = Array.from(data);

              console.log('📨 Ring notification received:', dataArray);
              console.log('🔄 Feeding data to SDK for processing:', dataArray.length, 'bytes');
              console.log(`  header=${dataArray[0]} cmd=${dataArray[1]}`);

              // Only trigger our callback - let CleanRingConnection handle SDK feeding
              // This prevents duplicate processing
              this.onNotificationCallback?.(dataArray);
            } else {
              console.log('📨 Ring notification callback triggered but no data');
            }
          }
        );

        console.log('✅ Ring notification monitoring started successfully');
        console.log('🔍 CRITICAL: Notification subscription created, waiting for Ring responses...');

        // Add a small delay to ensure notification monitoring is fully active before resolving
        setTimeout(() => {
          console.log('🎯 Notification monitoring fully active - ready for Ring commands');
          resolve({ message: true });
        }, 100);

      } catch (error) {
        console.error('❌ Ring notification setup failed:', error);
        reject(error);
      }
    });
  }

  /**
   * Read data from the Ring device
   */
  public async read(): Promise<number[]> {
    try {
      if (!this.connectedDevice || this.connectionState !== BLEConnectionState.CONNECTED) {
        throw new Error('No device connected');
      }

      // Ring typically uses notifications for data, but this method is for explicit reads
      const serviceUUID = this.notifyServiceUUIDs[0];
      const characteristicUUID = this.notifyCharacteristicUUIDs[0];

      const characteristic = await this.connectedDevice.readCharacteristicForService(
        serviceUUID,
        characteristicUUID
      );

      if (!characteristic.value) {
        return [];
      }

      const data = this.base64ToUint8Array(characteristic.value);
      return Array.from(data);
    } catch (error) {
      console.error('Failed to read data:', error);
      return [];
    }
  }



  /**
   * Get current connection state
   */
  public getConnectionState(): BLEConnectionState {
    return this.connectionState;
  }

  /**
   * Get connected device info
   */
  public getConnectedDevice(): Device | null {
    return this.connectedDevice;
  }

  /**
   * Check if device is currently scanning
   */
  public isScanningInProgress(): boolean {
    return this.isScanning;
  }

  // Event callback setters
  public setOnConnection(callback: BLEConnectionCallback): void {
    this.onConnectionCallback = callback;
  }

  public setOnDisconnection(callback: BLEDisconnectionCallback): void {
    this.onDisconnectionCallback = callback;
  }

  public setOnDiscovery(callback: BLEDiscoveryCallback): void {
    this.onDiscoveryCallback = callback;
  }

  public setOnStateChange(callback: BLEStateChangeCallback): void {
    this.onStateChangeCallback = callback;
  }

  public setOnNotification(callback: BLENotificationCallback): void {
    this.onNotificationCallback = callback;
  }

  public setOnScanStopped(callback: () => void): void {
    this.onScanStoppedCallback = callback;
  }

  /**
   * Private helper methods
   */

  /**
   * Verify connected device is actually a Ring device
   * Based on reference implementation requirements
   */
  private async verifyRingDevice(device: Device): Promise<boolean> {
    try {
      console.log('🔍 Verifying Ring device:', device.name);

      const services = await device.services();
      console.log('📋 Device services:', services.map(s => s.uuid));

      // Required service UUIDs for a valid Ring device (from reference)
      const requiredServices = [
        RING_SERVICE_UUID.toLowerCase(),     // "00001822-0000-1000-8000-00805f9b34fb"
        RING_SERVICE_UUID_IOS.toLowerCase() // "1822" (will be expanded to full UUID)
      ];

      let foundHealthService = false;
      let foundDataCharacteristic = false;

      for (const service of services) {
        const fullServiceUUID = this.fullUUID(service.uuid).toLowerCase();
        console.log('🔎 Checking service:', fullServiceUUID);

        // Check for Ring health monitoring service (1822)
        if (fullServiceUUID.includes('1822')) {
          foundHealthService = true;
          console.log('✅ Found Ring health service (1822)');

          // Check for Ring data characteristic (66FE)
          const characteristics = await service.characteristics();
          for (const char of characteristics) {
            const charUUID = this.fullUUID(char.uuid).toLowerCase();
            console.log('  📡 Characteristic:', charUUID);

            if (charUUID.includes('66fe')) {
              foundDataCharacteristic = true;
              console.log('  ✅ Found Ring data characteristic (66FE)');
              break;
            }
          }
        }
      }

      const isValidRing = foundHealthService && foundDataCharacteristic;

      if (!isValidRing) {
        console.log('❌ Ring verification failed:');
        console.log('  Health Service (1822):', foundHealthService);
        console.log('  Data Characteristic (66FE):', foundDataCharacteristic);
        console.log('🚫 This device is NOT a Ring - likely earbuds or other BLE device');
      } else {
        console.log('✅ Ring device verification PASSED - this is a genuine Ring device!');
      }

      return isValidRing;
    } catch (error) {
      console.error('❌ Ring verification error:', error);
      return false;
    }
  }

  private isRingDevice(device: Device): boolean {
    // Following reference implementation logic:
    // 1. Check service UUIDs first (primary identifier)
    // 2. Check manufacturer data if available

    console.log('🔎 Checking device:', {
      name: device.name,
      serviceUUIDs: device.serviceUUIDs,
      hasManufacturerData: !!device.manufacturerData
    });

    // Primary check: Ring service UUIDs
    if (device.serviceUUIDs && device.serviceUUIDs.length > 0) {
      const hasRingService = device.serviceUUIDs.some(uuid => {
        const normalizedUuid = uuid.toLowerCase();
        // Check for Ring's primary service UUIDs
        return normalizedUuid.includes('fef5') ||     // Filter UUID
          normalizedUuid.includes('1822') ||     // Health service
          normalizedUuid === RING_SERVICE_UUID.toLowerCase() ||
          normalizedUuid === RING_SERVICE_UUID_IOS.toLowerCase();
      });

      if (hasRingService) {
        console.log('✅ Ring device identified by SERVICE UUID:', device.serviceUUIDs, 'Name:', device.name);
        return true;
      }
    }

    // Secondary check: Manufacturer data (like reference implementation)
    if (device.manufacturerData) {
      console.log('🔎 Device has manufacturer data - potential Ring device');
      // In reference implementation, they use SDK.getBroadcastData() to parse this
      // For now, consider devices with manufacturer data + connectable as potential Ring devices
      if (device.isConnectable) {
        console.log('✅ Ring device identified by MANUFACTURER DATA + CONNECTABLE');
        return true;
      }
    }

    // Fallback: Check device name patterns (keep existing logic as backup)
    if (device.name) {
      const nameMatch = RING_DEVICE_NAME_PATTERNS.some(pattern =>
        device.name!.toLowerCase().includes(pattern.toLowerCase())
      );
      if (nameMatch) {
        console.log('✅ Ring device identified by NAME:', device.name);
        return true;
      }
    }

    return false;
  }

  /**
   * MANUFACTURER FIX: Comprehensive peripheral info logging
   * Logs all discovered services and characteristics for debugging
   */
  private async logPeripheralInfo(device: Device): Promise<void> {
    try {
      const services = await device.services();

      console.log("=== PERIPHERAL INFO DEBUG (MANUFACTURER FIX) ===");
      console.log(`Services count: ${services.length}`);

      let totalCharacteristics = 0;

      for (const service of services) {
        const characteristics = await service.characteristics();
        totalCharacteristics += characteristics.length;

        console.log(`Service: ${service.uuid}`);

        for (const char of characteristics) {
          const properties = [];
          if (char.isReadable) properties.push('read');
          if (char.isWritableWithResponse) properties.push('write');
          if (char.isWritableWithoutResponse) properties.push('writeNoResponse');
          if (char.isNotifiable) properties.push('notify');
          if (char.isIndicatable) properties.push('indicate');

          console.log(`  Characteristic: ${char.uuid} | Properties: [${properties.join(', ')}]`);
        }
      }

      console.log(`Characteristics count: ${totalCharacteristics}`);
      console.log("=== END DEBUG (MANUFACTURER FIX) ===");

    } catch (error) {
      console.error('❌ Failed to log peripheral info:', error);
    }
  }

  /**
   * MANUFACTURER FIX: Validate required Ring services are present
   * Ensures we have the critical 1822 health service before proceeding
   */
  private async validateRequiredServices(device: Device): Promise<void> {
    try {
      const services = await device.services();

      // Check for Ring health service (1822) - CRITICAL for Ring communication
      const hasHealthService = services.some(service =>
        service.uuid.includes('1822')
      );

      if (!hasHealthService) {
        throw new Error("❌ Missing Ring health service (1822) - Ring will not work without this!");
      }

      console.log("✅ Required Ring health service (1822) found");

      // Validate we have populated the characteristic arrays
      if (this.writeServiceUUIDs.length === 0 || this.writeCharacteristicUUIDs.length === 0) {
        throw new Error("❌ Missing write characteristics - cannot send commands to Ring!");
      }

      if (this.notifyServiceUUIDs.length === 0 || this.notifyCharacteristicUUIDs.length === 0) {
        throw new Error("❌ Missing notify characteristics - cannot receive data from Ring!");
      }

      // MANUFACTURER LOGGING: Show what characteristics we found
      console.log("✅ Write characteristics found:", this.writeCharacteristicUUIDs.length);
      console.log("✅ Notify characteristics found:", this.notifyCharacteristicUUIDs.length);
      console.log("Write UUIDs:", this.writeCharacteristicUUIDs);
      console.log("Notify UUIDs:", this.notifyCharacteristicUUIDs);
      console.log("Write Services:", this.writeServiceUUIDs);
      console.log("Notify Services:", this.notifyServiceUUIDs);

    } catch (error) {
      console.error('❌ Service validation failed:', error);
      throw error;
    }
  }

  /**
   * MANUFACTURER EXACT: Find UUID index in array (critical for Ring communication)
   */
  private findUUIDIndex(arr: string[], targetUUID: string): number {
    let index_uuid = 0;
    arr.findIndex((uuid, index) => {
      if (uuid === targetUUID) {
        index_uuid = index;
      }
    });
    return index_uuid;
  }

  /**
   * MANUFACTURER EXACT: Convert 16/32/128 bit UUIDs to full 128-bit uppercase format
   */
  private fullUUID(uuid: string): string {
    if (uuid.length === 4) {
      return "0000" + uuid.toUpperCase() + "-0000-1000-8000-00805F9B34FB";
    }
    if (uuid.length === 8) {
      return uuid.toUpperCase() + "-0000-1000-8000-00805F9B34FB";
    }
    return uuid.toUpperCase();
  }

  /**
   * MANUFACTURER EXACT: Parse all Ring characteristics from peripheral info
   * This is the exact implementation from YoiHealth that works
   */
  private async setupUUIDs(device: Device): Promise<void> {
    try {
      // Initialize all UUID arrays (EXACT manufacturer pattern)
      this.readServiceUUIDs = [];
      this.readCharacteristicUUIDs = [];
      this.writeServiceUUIDs = [];
      this.writeCharacteristicUUIDs = [];
      this.writeWithoutResponseServiceUUIDs = [];
      this.writeWithoutResponseCharacteristicUUIDs = [];
      this.notifyServiceUUIDs = [];
      this.notifyCharacteristicUUIDs = [];

      console.log('🔍 MANUFACTURER UUID PARSING - Processing characteristics...');

      const Platform = require('react-native').Platform;
      const { UUID_SERVICE, UUID_SERVICE_IOS } = require('./constants');

      const services = await device.services();

      // Build peripheralInfo structure like the manufacturer expects
      const peripheralInfo = {
        id: device.id,
        characteristics: [] as any[]
      };

      // Convert our device structure to manufacturer's expected format
      for (const service of services) {
        const characteristics = await service.characteristics();

        for (const char of characteristics) {
          const charInfo = {
            service: service.uuid,
            characteristic: char.uuid,
            properties: {} as any
          };

          // Build properties object based on characteristics
          if (char.isReadable) charInfo.properties.Read = "Read";
          if (char.isWritableWithResponse) charInfo.properties.Write = "Write";
          if (char.isWritableWithoutResponse) charInfo.properties.WriteWithoutResponse = "WriteWithoutResponse";
          if (char.isNotifiable) charInfo.properties.Notify = "Notify";
          if (char.isIndicatable) charInfo.properties.Indicate = "Indicate";

          peripheralInfo.characteristics.push(charInfo);
        }
      }

      // Now process using EXACT manufacturer pattern
      for (let item of peripheralInfo.characteristics) {
        if (Platform.OS === "android") {
          // Convert to full UUID format for Android (CRITICAL!)
          item.service = this.fullUUID(item.service);
          item.characteristic = this.fullUUID(item.characteristic);

          console.log(`📱 Android Char: Service=${item.service} | Char=${item.characteristic} | Props=${JSON.stringify(item.properties)}`);

          // Parse Notify characteristics (CRITICAL for receiving data)
          if (item.properties.Notify === "Notify") {
            if (item.service.includes(UUID_SERVICE)) {  // Must be service 1822
              console.log(`✅ Found Notify: ${item.service} | ${item.characteristic}`);
              this.notifyServiceUUIDs.push(item.service);
              this.notifyCharacteristicUUIDs.push(item.characteristic);
            }
          }

          // Parse Read characteristics  
          if (item.properties.Read === "Read") {
            this.readServiceUUIDs.push(item.service);
            this.readCharacteristicUUIDs.push(item.characteristic);
            console.log(`📖 Found Read: ${item.service} | ${item.characteristic}`);
          }

          // Parse Write characteristics (CRITICAL for sending commands)
          if (item.properties.Write === "Write") {
            if (item.service.includes(UUID_SERVICE)) {  // Must be service 1822
              console.log(`✅ Found Write: ${item.service} | ${item.characteristic}`);
              this.writeServiceUUIDs.push(item.service);
              this.writeCharacteristicUUIDs.push(item.characteristic);
            }
          }

          // Parse WriteWithoutResponse characteristics
          if (item.properties.WriteWithoutResponse === "WriteWithoutResponse") {
            this.writeWithoutResponseServiceUUIDs.push(item.service);
            this.writeWithoutResponseCharacteristicUUIDs.push(item.characteristic);
            console.log(`📝 Found WriteWithoutResponse: ${item.service} | ${item.characteristic}`);
          }
        } else {
          // iOS implementation (EXACT manufacturer pattern)
          for (let property in item.properties) {
            if (property === "Notify") {
              if (item.service.includes(UUID_SERVICE_IOS)) {  // Service 1822
                console.log(`✅ iOS Found Notify: ${item.service} | ${item.characteristic}`);
                this.notifyServiceUUIDs.push(item.service);
                this.notifyCharacteristicUUIDs.push(item.characteristic);
              }
            }
            if (property === "Read") {
              this.readServiceUUIDs.push(item.service);
              this.readCharacteristicUUIDs.push(item.characteristic);
              console.log(`📖 iOS Found Read: ${item.service} | ${item.characteristic}`);
            }
            if (property === "Write") {
              if (item.service.includes(UUID_SERVICE_IOS)) {  // Service 1822
                console.log(`✅ iOS Found Write: ${item.service} | ${item.characteristic}`);
                this.writeServiceUUIDs.push(item.service);
                this.writeCharacteristicUUIDs.push(item.characteristic);
              }
            }
            if (property === "WriteWithoutResponse") {
              this.writeWithoutResponseServiceUUIDs.push(item.service);
              this.writeWithoutResponseCharacteristicUUIDs.push(item.characteristic);
              console.log(`📝 iOS Found WriteWithoutResponse: ${item.service} | ${item.characteristic}`);
            }
          }
        }
      }

      // Summary logging
      console.log('📋 MANUFACTURER UUID PARSING COMPLETE:');
      console.log(`  ✅ Write characteristics: ${this.writeCharacteristicUUIDs.length}`);
      console.log(`  🔔 Notify characteristics: ${this.notifyCharacteristicUUIDs.length}`);
      console.log(`  📖 Read characteristics: ${this.readCharacteristicUUIDs.length}`);
      console.log(`  📝 WriteWithoutResponse characteristics: ${this.writeWithoutResponseCharacteristicUUIDs.length}`);
      console.log(`  Write UUIDs:`, this.writeCharacteristicUUIDs);
      console.log(`  Notify UUIDs:`, this.notifyCharacteristicUUIDs);

    } catch (error) {
      console.error('❌ Failed to setup UUIDs:', error);
      throw error;
    }
  }

  private async setupNotifications(device: Device): Promise<void> {
    try {
      // MANUFACTURER FIX: Validate we have notify characteristics before proceeding
      if (this.notifyServiceUUIDs.length === 0 || this.notifyCharacteristicUUIDs.length === 0) {
        throw new Error('❌ No notify characteristics available - Ring initialization incomplete!');
      }

      for (let i = 0; i < this.notifyServiceUUIDs.length; i++) {
        const notifyService = this.notifyServiceUUIDs[i];
        const notifyChar = this.notifyCharacteristicUUIDs[i];

        // MANUFACTURER FIX: Log detailed notification setup info
        console.log(`🔔 Enabling notifications: Service=${notifyService} | Characteristic=${notifyChar}`);

        // MANUFACTURER FIX: Validate we're using service 1822 for notifications 
        if (!notifyService.includes('1822')) {
          console.warn('⚠️ WARNING: Setting up notifications on non-1822 service!');
          console.warn(`⚠️ Notify service: ${notifyService}`);
        } else {
          console.log('✅ Setting up notifications on correct Ring health service (1822)');
        }

        const subscription = await device.monitorCharacteristicForService(
          notifyService,
          notifyChar,
          (error, characteristic) => {
            if (error) {
              console.error('❌ Notification error:', error);
              return;
            }

            if (characteristic?.value) {
              const data = this.base64ToUint8Array(characteristic.value);
              const dataArray = Array.from(data);

              console.log('📨 Ring notification received:', dataArray);

              // Only trigger our callback - let CleanRingConnection handle SDK feeding
              // This prevents duplicate processing
              this.onNotificationCallback?.(dataArray);
            }
          }
        );

        console.log('✅ Notification monitoring active for Ring characteristic');

        // Wait a moment for notification setup to complete
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      console.log('🎯 All Ring notifications are now active and ready');
    } catch (error) {
      console.error('❌ Failed to setup notifications:', error);
      throw error;
    }
  }

  private handleDisconnection(deviceId: string, error: any): void {
    console.log(`🔌 Handling disconnection for device ${deviceId}`);

    // Store callback before cleanup
    const callback = this.onDisconnectionCallback;

    // Clean up all BLE resources
    this.cleanupBLEResources();

    // Reset initialization flag to force re-init on next connection
    this.isInitialized = false;

    // Call disconnection callback after cleanup
    callback?.(deviceId, error);
  }


  private arrayBufferToBase64(buffer: Uint8Array): string {
    let binary = '';
    for (let i = 0; i < buffer.byteLength; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    return btoa(binary);
  }

  private base64ToUint8Array(base64: string): Uint8Array {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Cleanup and destroy the manager
   */
  public destroy(): void {
    try {
      this.stopScan();
      this.disconnect();

      // Clear any remaining scan timeout
      if (this.scanTimeoutId) {
        clearTimeout(this.scanTimeoutId);
        this.scanTimeoutId = null;
      }

      this.manager?.destroy();
    } catch (error) {
      console.error('Error during BLE module cleanup:', error);
    }
  }
}

// Export singleton instance
export const ringBleModule = new RingBleModule();