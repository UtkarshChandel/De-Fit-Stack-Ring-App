/**
 * Bluetooth Low Energy (BLE) Types and Constants
 * Ported from YoiHealth project for SmartRing X1 connectivity
 */

// BLE Service and Characteristic UUIDs for Ring devices
export const BLE_CONSTANTS = {
  // Service UUIDs
  UUID_SERVICE: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E",
  UUID_SERVICE_IOS: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E",

  // Characteristic UUIDs
  UUID_WRITE: "6E400002-B5A3-F393-E0A9-E50E24DCCA9E",
  UUID_NOTIFY: "6E400003-B5A3-F393-E0A9-E50E24DCCA9E",

  // Filter UUID for device scanning
  FILTER_UUID: "6E400001-B5A3-F393-E0A9-E50E24DCCA9E",

  // Connection timeouts
  SCAN_TIMEOUT: 10000,
  CONNECT_TIMEOUT: 15000,
  OPERATION_TIMEOUT: 5000,

  // MTU settings
  DEFAULT_MTU: 185,
  MIN_MTU: 23,
} as const;

// BLE Permission types
export interface BLEPermissions {
  bluetoothScan: boolean;
  bluetoothConnect: boolean;
  bluetoothAdvertise: boolean;
  accessFineLocation: boolean;
  accessCoarseLocation: boolean;
}

// BLE Device Discovery
export interface BLEDevice {
  id: string;
  name: string | null;
  rssi: number;
  serviceUUIDs?: string[];
  advertising: {
    isConnectable?: boolean;
    localName?: string;
    manufacturerData?: any;
    serviceData?: any;
    serviceUUIDs?: string[];
    txPowerLevel?: number;
  };
}

// BLE Connection Options
export interface BLEConnectionOptions {
  autoConnect?: boolean;
  timeout?: number;
  requestMTU?: number;
  connectionPriority?: 'balanced' | 'high' | 'lowPower';
}

// BLE Scan Options
export interface BLEScanOptions {
  allowDuplicates?: boolean;
  scanMode?: 'lowPower' | 'balanced' | 'lowLatency';
  timeout?: number;
  serviceUUIDs?: string[];
}

// BLE Write Options
export interface BLEWriteOptions {
  withResponse?: boolean;
  timeout?: number;
}

// BLE Read/Write Data
export interface BLECharacteristic {
  serviceUUID: string;
  characteristicUUID: string;
  value?: number[] | Uint8Array;
  properties: string[];
}

// BLE Service Information
export interface BLEService {
  uuid: string;
  isPrimary: boolean;
  characteristics: BLECharacteristic[];
}

// BLE Connection State
export enum BLEConnectionState {
  DISCONNECTED = 'disconnected',
  CONNECTING = 'connecting',
  CONNECTED = 'connected',
  DISCONNECTING = 'disconnecting',
}

// BLE Manager State
export enum BLEManagerState {
  Unknown = 'Unknown',
  Resetting = 'Resetting',
  Unsupported = 'Unsupported',
  Unauthorized = 'Unauthorized',
  PoweredOff = 'PoweredOff',
  PoweredOn = 'PoweredOn',
}

// BLE Events
export enum BLEEvents {
  DISCOVER_PERIPHERAL = 'BleManagerDiscoverPeripheral',
  STOP_SCAN = 'BleManagerStopScan',
  CONNECT_PERIPHERAL = 'BleManagerConnectPeripheral',
  DISCONNECT_PERIPHERAL = 'BleManagerDisconnectPeripheral',
  UPDATE_VALUE_FOR_CHARACTERISTIC = 'BleManagerDidUpdateValueForCharacteristic',
  UPDATE_STATE = 'BleManagerDidUpdateState',
  PERIPHERAL_DID_BOND = 'BleManagerPeripheralDidBond',
  CENTRAL_MANAGER_WILL_RESTORE_STATE = 'BleManagerCentralManagerWillRestoreState',
  CHARACTERISTIC_DESCRIPTOR_READ = 'BleManagerDidUpdateNotificationStateFor',
}

// Error types
export interface BLEError {
  code: number;
  message: string;
  domain?: string;
}

// Platform specific BLE operations
export interface BLEPlatformOperations {
  requestMTU?: (deviceId: string, mtu: number) => Promise<number>;
  getBondedDevices?: () => Promise<BLEDevice[]>;
  createBond?: (deviceId: string) => Promise<void>;
  removeBond?: (deviceId: string) => Promise<void>;
  requestConnectionPriority?: (deviceId: string, priority: number) => Promise<void>;
}

// Ring-specific BLE data structures
export interface RingBLEData {
  command: string;
  data: number[];
  timestamp: number;
}

// BLE notification callback type
export type BLENotificationCallback = (data: number[]) => void;

// BLE connection callback types
export type BLEConnectionCallback = (deviceId: string) => void;
export type BLEDisconnectionCallback = (deviceId: string, error?: BLEError) => void;
export type BLEDiscoveryCallback = (device: BLEDevice) => void;
export type BLEStateChangeCallback = (state: BLEManagerState) => void;