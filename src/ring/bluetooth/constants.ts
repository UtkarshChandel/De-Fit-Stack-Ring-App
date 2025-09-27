/**
 * Ring BLE Constants
 * Ported from YoiHealth project for SmartRing X1 connectivity
 */

// Ring Device Service UUIDs (MANUFACTURER EXACT FORMAT)
export const UUID_SERVICE = "00001822-0000-1000-8000-00805F9B34FB"; // Android (EXACT)
export const UUID_SERVICE_IOS = "1822"; // iOS (EXACT)
export const WRITE_UUID = "000066FE-0000-1000-8000-00805F9B34FB"; // EXACT
export const NOTIFY_UUID = "000066FE-0000-1000-8000-00805F9B34FB"; // EXACT
export const FILTER_UUID = "FEF5"; // For BLE scanning (EXACT)
export const SPOTA_SERVICE_UUID = "0000FEF5-0000-1000-8000-00805F9B34FB"; // EXACT

// Legacy constants for backward compatibility  
export const RING_SERVICE_UUID = "00001822-0000-1000-8000-00805F9B34FB";  // Health monitoring service
export const RING_SERVICE_UUID_IOS = "1822";
export const RING_FILTER_UUID = "FEF5";  // Main filter UUID for scanning
export const RING_WRITE_UUID = "000066FE-0000-1000-8000-00805F9B34FB";
export const RING_NOTIFY_UUID = "000066FE-0000-1000-8000-00805F9B34FB";
export const RING_DATA_CHARACTERISTIC = "66FE";  // Short UUID for Ring health data verification

// Ring Command Opcodes (from reference implementation)
export const RING_COMMAND_OPCODES = {
  DEVICE_BIND: 0x15,           // Bind device
  TIME_SYNC: 0x04,             // Time synchronization  
  BATTERY_DATA_STATE: 0x0c,    // Battery info
  HISTORICAL_NUM: 0x0f,        // Get historical data count
  HISTORICAL_DATA: 0x10,       // Fetch historical data
  TEMPERATURE: 0x06,           // Finger temperature
  DEVICE_INFO1: 0x02,          // Device info (color, size, version)
  DEVICE_INFO2: 0x03,          // Device info (serial, bind status)
  OPEN_HEALTH: 0x07,           // Start comprehensive health monitoring
  CLOSE_HEALTH: 0x08,          // Stop health monitoring
  STEP_COUNT: 0x0e,            // Get step count
} as const;

// OTA (Over-The-Air) Update UUIDs
export const OTA_SPOTA_SERVICE_UUID = "0000FEF5-0000-1000-8000-00805F9B34FB";
export const OTA_SPOTA_MEM_DEV_UUID = "8082CAA8-41A6-4021-91C6-56F9B954CC34";
export const OTA_SPOTA_GPIO_MAP_UUID = "724249F0-5EC3-4B5F-8804-42345AF08651";
export const OTA_SPOTA_MEM_INFO_UUID = "6C53DB25-47A1-45FE-A022-7C92FB334FD4";
export const OTA_SPOTA_PATCH_LEN_UUID = "9D84B9A3-000C-49D8-9183-855B673FDA31";
export const OTA_SPOTA_PATCH_DATA_UUID = "457871E8-D516-4CA1-9116-57D0B17B9CB2";
export const OTA_SPOTA_SERV_STATUS_UUID = "5F78DF94-798C-46F5-990A-B3EB6A065C88";
export const OTA_CLIENT_CONFIG_DESCRIPTOR = "00002902-0000-1000-8000-00805F9B34FB";
export const OTA_SUOTA_VERSION_UUID = "64B4E8B5-0DE5-401B-A21D-ACC8DB3B913A";
export const OTA_SUOTA_PATCH_DATA_CHAR_SIZE_UUID = "42C3DFDD-77BE-4D9C-8454-8F875267FB3B";
export const OTA_SUOTA_MTU_UUID = "B7DE1EEA-823D-43BB-A3AF-C4903DFCE23C";
export const OTA_SUOTA_L2CAP_PSM_UUID = "61C8849C-F639-4765-946E-5C3419BEBB2A";

// Standard Bluetooth Characteristic UUIDs
export const BT_MANUFACTURER_NAME_STRING = "00002A29-0000-1000-8000-00805F9B34FB";
export const BT_MODEL_NUMBER_STRING = "00002A24-0000-1000-8000-00805F9B34FB";
export const BT_FIRMWARE_REVISION_STRING = "00002A26-0000-1000-8000-00805F9B34FB";
export const BT_SOFTWARE_REVISION_STRING = "00002A28-0000-1000-8000-00805F9B34FB";

// OTA Memory Configuration
export const OTA_I2C_ADDR: string | number = "0x50";
export const OTA_SCL = 2;
export const OTA_SDA = 3;
export const OTA_BANK = 0;
export const OTA_BLOCK_SIZE = "240";
export const OTA_MISO = 3;
export const OTA_MOSI = 0;
export const OTA_CS = 1;
export const OTA_SCK = 4;
export const OTA_MEMORY_TYPE = 3;

// Connection Parameters
export const CONNECTION_TIMEOUT = 15000;
export const SCAN_TIMEOUT = 10000;
export const OPERATION_TIMEOUT = 5000;
export const DEFAULT_MTU = 185;
export const MIN_MTU = 23;

// Ring Device Name Patterns
export const RING_DEVICE_NAME_PATTERNS = [
  "SmartRing",
  "RingX1",
  "Bonatra Ring",
  "Ring",
];

// Ring Color Mapping
export const RING_COLORS = {
  0: "Silver",
  1: "Black",
  2: "Rose Gold",
  3: "Gold"
} as const;

// Ring Size Range
export const RING_SIZE_MIN = 5;
export const RING_SIZE_MAX = 15;

// Data Collection Intervals (milliseconds)
export const DATA_COLLECTION_INTERVALS = {
  HEART_RATE: 1000,
  STEPS: 5000,
  TEMPERATURE: 10000,
  BATTERY: 30000,
  SYNC: 60000
} as const;