/**
 * Ring Device Types and Interfaces
 * Ported from YoiHealth project for SmartRing X1 connectivity
 */

// Core Ring Device Information
export interface SmartRingX1 {
  id: string;                    // Bluetooth device ID
  name: string;                  // Device name
  color: 0 | 1 | 2 | 3;         // Ring color index
  size: number;                  // Ring size
  rssi: number;                  // Signal strength
  advertising?: AdvertisingData; // BLE advertising data
}

// BLE Advertising Data Structure
export interface AdvertisingData {
  localName?: string;
  manufacturerData?: any;
  serviceUUIDs?: string[];
  txPowerLevel?: number;
  serviceData?: any;
}

// Device Hardware Information (deviceInfo1)
export interface IDeviceInfo1 {
  bleAddress: string;            // MAC address
  chargingMode: number;          // Charging type
  color: number;                 // Color code
  deviceVer: string;             // Firmware version
  mainChipModel: string;         // Hardware model
  productIteration: string;      // Product iteration
  size: number;                  // Physical size
  switchOem: number;            // OEM switch status
}

// Device Settings Information (deviceInfo2)
export interface IDeviceInfo2 {
  bindStatus: string | number;   // Device binding status ("Bind"/"Unbind" or 1/0)
  clickInterval: number;         // Click detection interval
  doubleClickCount: number;      // Double click count
  endTime: number;               // End time setting
  rawWaveSwitch: number;         // Raw wave data switch
  samplingRate: number;          // Data sampling rate
  sn: string;                    // Serial number (short)
  sn8: string;                   // Serial number (8-byte)
  sosSwitch: number;            // SOS functionality switch
  startTime: number;             // Start time setting
  tapDetectionThreshold: number; // Tap detection threshold
}

// Battery Information
export interface IBattery {
  batteryValue: number;          // Raw battery voltage (mV)
  batteryPer: number;           // Battery percentage (%)
  status: string;               // "charging" | "uncharged"
}

// Historical Health Data Point
export interface IHistorical {
  timeStamp: number;             // Data timestamp
  heartRate: number;             // Heart rate (BPM)
  motionDetectionCount: number;  // Motion detection count
  detectionMode: string;         // Detection mode
  wearStatus: string;           // Wear status
  chargeStatus: string;         // Charging status
  uuid: number;                 // Unique identifier
  hrv: number;                  // Heart rate variability
  temperature: number;          // Finger temperature (°C)
  step: number;                 // Step count
  ox: number;                   // Blood oxygen (%)
  rawHr: number | string[];     // Raw heart rate data
}

// Processed Health Data
export interface HealthData {
  heartRate: number;            // Heart rate (BPM)
  oxValue: number;              // Blood oxygen (%)
  steps: number;                // Step count
  temperature: number;          // Finger temperature (°C)
  hrv: number;                  // Heart rate variability
  motion: number;               // Motion detection count
  timestamp: number;            // Data timestamp
}

// Individual Health Reading (for real-time monitoring)
export interface HealthReading {
  heartRate: number;            // Heart rate (BPM)
  bloodOxygen: number;          // Blood oxygen (SpO2 %)
  timestamp: number;            // Unix timestamp
}

// Sleep Analysis Data
export interface SleepData {
  deepSleep: number;            // Deep sleep duration (minutes)
  lightTime: number;            // Light sleep duration (minutes)
  remTime: number;              // REM sleep duration (minutes)
  wakeTime: number;             // Wake time during sleep (minutes)
  napTime: number;              // Nap duration (minutes)
  startTime: string;            // Sleep start time (formatted)
  endTime: string;              // Sleep end time (formatted)
  sleepTimePeriod: {
    startTime: number;          // Sleep start timestamp
    endTime: number;            // Sleep end timestamp
  };
}

// BLE Connection States
export enum BleState {
  Unknown = "unknown",
  Resetting = "resetting",
  Unsupported = "unsupported",
  Unauthorized = "unauthorized",
  PoweredOff = "poweredOff",
  PoweredOn = "poweredOn",
  Off = "off"
}

// Ring Command Types
export type RingCommand =
  | "step"
  | "timeSyn"
  | "openSingleHealth"
  | "closeSingleHealth"
  | "openHealth"
  | "closeHealth"
  | "temperature"
  | "shutDown"
  | "restart"
  | "restoreFactorySettings"
  | "historicalNum"
  | "historicalData"
  | "cleanHistoricalData"
  | "deviceInfo1"
  | "deviceInfo2"
  | "batteryDataAndState"
  | "deviceBind"
  | "deviceUnBind";

// Connection Status
export interface ConnectionStatus {
  isConnected: boolean;
  isConnecting: boolean;
  deviceId: string | null;
  connectionError: string | null;
  retryAttempt?: number;
  maxRetries?: number;
  retryMessage?: string;
}

// Ring Service Status
export interface RingServiceStatus {
  bleState: BleState;
  permissionsGranted: boolean;
  isScanning: boolean;
  connectedRing: SmartRingX1 | null;
  lastError: string | null;
}

// API Response Types
export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

// Ring Dashboard Data
export interface RingDashboardData {
  steps: number;
  heartRate: number;
  temperature: number;
  batteryLevel: number;
  sleepScore: number;
  lastSync: string;
}

// OTA (Over-The-Air) Update Information
export interface OTAInfo {
  currentVersion: string;
  availableVersion: string | null;
  updateAvailable: boolean;
  updateInProgress: boolean;
  updateProgress: number;
}