/**
 * Health Data Types and Interfaces
 * Comprehensive health metrics for SmartRing X1
 */

/**
 * Heart Rate Data
 */
export interface HeartRateData {
  heartRate: number;              // Current heart rate in BPM
  restingHeartRate?: number;      // Resting heart rate
  minHeartRate?: number;          // Minimum heart rate in period
  maxHeartRate?: number;          // Maximum heart rate in period
  avgHeartRate?: number;          // Average heart rate
  hrv?: number;                   // Heart rate variability
  timestamp: number;              // Unix timestamp
}

/**
 * Blood Oxygen Data
 */
export interface BloodOxygenData {
  oxValue: number;                // SpO2 percentage
  minOxygen?: number;             // Minimum oxygen level
  maxOxygen?: number;             // Maximum oxygen level
  avgOxygen?: number;             // Average oxygen level
  timestamp: number;              // Unix timestamp
}

/**
 * Sleep Data
 */
export interface SleepData {
  totalSleepTime: number;         // Total sleep time in minutes
  deepSleepTime: number;          // Deep sleep in minutes
  lightSleepTime: number;         // Light sleep in minutes
  remSleepTime: number;           // REM sleep in minutes
  awakeTime: number;              // Awake time in minutes
  sleepScore?: number;            // Sleep quality score (0-100)
  sleepEfficiency?: number;       // Sleep efficiency percentage
  sleepStages?: SleepStage[];    // Detailed sleep stages
  respiratoryRate?: number;       // Breathing rate during sleep
  startTime: number;              // Sleep start timestamp
  endTime: number;                // Sleep end timestamp
}

/**
 * Sleep Stage
 */
export interface SleepStage {
  stage: 'awake' | 'light' | 'deep' | 'rem';
  startTime: number;
  endTime: number;
  duration: number;               // Duration in minutes
}

/**
 * Activity Data
 */
export interface ActivityData {
  steps: number;                  // Step count
  distance?: number;              // Distance in meters
  calories?: number;              // Calories burned
  activeMinutes?: number;         // Active minutes
  movementIndex?: number;         // Movement intensity index
  timestamp: number;              // Unix timestamp
  date: string;                   // Date string (YYYY-MM-DD)
}

/**
 * Temperature Data
 */
export interface TemperatureData {
  temperature: number;            // Finger temperature in Celsius
  minTemperature?: number;        // Minimum temperature
  maxTemperature?: number;        // Maximum temperature
  avgTemperature?: number;        // Average temperature
  timestamp: number;              // Unix timestamp
}

/**
 * Stress Level Data
 */
export interface StressData {
  stressLevel: number;            // Stress level (0-100)
  stressScore?: number;           // Stress score
  relaxationMinutes?: number;     // Relaxation time in minutes
  timestamp: number;              // Unix timestamp
}

/**
 * Battery Data
 */
export interface BatteryData {
  batteryValue: number;           // Raw battery voltage in mV
  batteryPer: number;             // Battery percentage (0-100)
  status: number;                 // 0: uncharged, 1: charging
  timestamp?: number;             // Unix timestamp
}

/**
 * Device Information
 */
export interface DeviceInfo {
  // Device Info 1
  color?: number;                 // Ring color code
  size?: number;                  // Ring size
  bleAddress?: string;            // BLE MAC address
  deviceVer?: string;             // Firmware version
  chargingMode?: number;          // Charging type
  mainChipModel?: string;         // Hardware model
  hasSportsMode?: string;         // Sports mode availability
  switchOem?: number;             // OEM switch status
  productIteration?: string;      // Product generation

  // Device Info 2
  serialNumber?: string;          // Device serial number
  sn?: string;                    // Short serial number
  sn8?: string;                   // 8-digit serial number
  bindStatus?: string;            // Bind status
  samplingRate?: number;          // Data sampling rate
  clickInterval?: number;         // Click detection interval
  doubleClickCount?: number;      // Double click count
  tapDetectionThreshold?: number; // Tap sensitivity
  sosSwitch?: number;             // SOS feature switch
  rawWaveSwitch?: number;         // Raw wave data switch
  startTime?: number;             // Start timestamp
  endTime?: number;               // End timestamp
}

/**
 * Historical Data Entry
 */
export interface HistoricalDataEntry {
  timestamp: number;              // Data timestamp
  heartRate?: number;             // Heart rate value
  oxValue?: number;               // Blood oxygen value
  steps?: number;                 // Step count
  temperature?: number;           // Temperature value
  motion?: number;                // Motion detection
  dataType: string;              // Type of data
  rawData?: number[];            // Raw data array
}

/**
 * Historical Data Summary
 */
export interface HistoricalDataSummary {
  totalRecords: number;           // Total number of records
  startDate?: number;             // Earliest data timestamp
  endDate?: number;               // Latest data timestamp
  dataTypes?: string[];           // Available data types
}

/**
 * Health Dashboard Data
 */
export interface HealthDashboard {
  // Current Values
  currentHeartRate?: HeartRateData;
  currentOxygen?: BloodOxygenData;
  currentTemperature?: TemperatureData;
  currentStress?: StressData;

  // Daily Summaries
  todayActivity?: ActivityData;
  lastNightSleep?: SleepData;

  // Historical Data
  heartRateHistory?: HeartRateData[];
  oxygenHistory?: BloodOxygenData[];
  temperatureHistory?: TemperatureData[];
  activityHistory?: ActivityData[];
  sleepHistory?: SleepData[];

  // Device Status
  deviceInfo?: DeviceInfo;
  battery?: BatteryData;
  connectionStatus?: ConnectionStatus;
  lastSyncTime?: number;
}

/**
 * Connection Status
 */
export interface ConnectionStatus {
  isConnected: boolean;
  deviceId?: string;
  deviceName?: string;
  rssi?: number;                  // Signal strength
  lastConnected?: number;         // Last connection timestamp
  connectionDuration?: number;    // Connection duration in seconds
}

/**
 * Health Sync Status
 */
export interface HealthSyncStatus {
  isSyncing: boolean;
  lastSyncTime?: number;
  syncProgress?: number;           // Progress percentage (0-100)
  syncError?: string;             // Error message if sync failed
  pendingRecords?: number;        // Number of records to sync
  syncedRecords?: number;         // Number of records synced
}

/**
 * Health Monitoring Configuration
 */
export interface HealthMonitoringConfig {
  heartRateEnabled: boolean;
  oxygenEnabled: boolean;
  temperatureEnabled: boolean;
  stepsEnabled: boolean;
  sleepEnabled: boolean;
  autoSync: boolean;
  syncInterval: number;            // Sync interval in minutes
  dataRetentionDays: number;      // Days to keep historical data
}

/**
 * Health Alert
 */
export interface HealthAlert {
  id: string;
  type: 'heartRate' | 'oxygen' | 'temperature' | 'activity' | 'battery';
  severity: 'low' | 'medium' | 'high' | 'critical';
  title: string;
  message: string;
  value?: number;
  threshold?: number;
  timestamp: number;
  acknowledged: boolean;
}

/**
 * Health Metrics Summary
 */
export interface HealthMetricsSummary {
  date: string;                    // Date (YYYY-MM-DD)

  // Heart Rate Summary
  avgHeartRate?: number;
  minHeartRate?: number;
  maxHeartRate?: number;
  restingHeartRate?: number;

  // Oxygen Summary
  avgOxygen?: number;
  minOxygen?: number;
  maxOxygen?: number;

  // Activity Summary
  totalSteps?: number;
  activeMinutes?: number;
  calories?: number;
  distance?: number;

  // Sleep Summary
  totalSleepMinutes?: number;
  sleepScore?: number;
  sleepEfficiency?: number;

  // Temperature Summary
  avgTemperature?: number;
  minTemperature?: number;
  maxTemperature?: number;

  // Stress Summary
  avgStressLevel?: number;
  maxStressLevel?: number;
  relaxationMinutes?: number;
}

/**
 * Data Processing Status
 */
export interface DataProcessingStatus {
  isProcessing: boolean;
  currentOperation?: string;
  progress?: number;
  processedRecords?: number;
  totalRecords?: number;
  errors?: string[];
}

/**
 * Health Data Export Format
 */
export interface HealthDataExport {
  exportDate: number;
  deviceInfo: DeviceInfo;
  dateRange: {
    startDate: number;
    endDate: number;
  };
  data: {
    heartRate?: HeartRateData[];
    oxygen?: BloodOxygenData[];
    sleep?: SleepData[];
    activity?: ActivityData[];
    temperature?: TemperatureData[];
    stress?: StressData[];
  };
  summary?: HealthMetricsSummary[];
}