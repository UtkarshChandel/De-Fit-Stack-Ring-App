/**
 * Ring State Management Store
 * Zustand store for managing Ring device state and data
 * Ported and modernized from YoiHealth project
 */

import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
import moment from 'moment';

import { 
  SmartRingX1, 
  IDeviceInfo1, 
  IDeviceInfo2, 
  IBattery, 
  IHistorical, 
  SleepData,
  ConnectionStatus,
  HealthReading
} from '../../types/ring';

// Main Ring Store Interface
interface RingStore {
  // Device Information
  connectedRing: SmartRingX1 | null;
  serialNumber: string;
  deviceInfo1: IDeviceInfo1 | null;
  deviceInfo2: IDeviceInfo2 | null;
  
  // Connection State
  connectionStatus: ConnectionStatus;
  isConnecting: boolean;
  isScanning: boolean;
  isReconnecting: boolean;
  reconnectionAttempt: number;
  bleManagerState: string;
  lastConnectionAttempt: string | null;
  discoveredDevices: SmartRingX1[];
  otaMode: boolean;
  
  // Health Data
  historicalData: IHistorical[];
  sleepData: SleepData[];
  processedHealthData: any[];
  
  // Real-time Health Data
  currentHealthReading: HealthReading | null;
  healthReadings: HealthReading[];
  isHealthMonitoringActive: boolean;
  temperature: number | null;
  steps: number | null;
  
  // Battery Information
  batteryData: IBattery | null;
  
  // Current Command Status
  currentCommand: string;
  commandInProgress: boolean;
  
  // Data Sync Status
  isHistoricalDataLoading: boolean;
  historicalDataCount: number;
  lastSyncTime: string | null;
  
  // Settings and Preferences
  permissionsGranted: boolean;
  autoSync: boolean;
  syncInterval: number; // in minutes
  
  // Actions - Device Management
  setConnectedRing: (ring: SmartRingX1 | null) => void;
  clearRing: () => void;
  setSerialNumber: (sn: string) => void;
  setDeviceInfo1: (info: IDeviceInfo1) => void;
  setDeviceInfo2: (info: IDeviceInfo2) => void;
  
  // Actions - Connection Management
  setConnectionStatus: (status: ConnectionStatus) => void;
  setIsConnecting: (connecting: boolean) => void;
  setIsScanning: (scanning: boolean) => void;
  setIsReconnecting: (reconnecting: boolean, attempt?: number) => void;
  setBleManagerState: (state: string) => void;
  updateLastConnectionAttempt: () => void;
  setDiscoveredDevices: (devices: SmartRingX1[]) => void;
  setOtaMode: (enabled: boolean) => void;
  
  // Actions - Health Data Management
  setHistoricalData: (data: IHistorical[]) => void;
  addHistoricalData: (data: IHistorical[]) => void;
  clearHistoricalData: () => void;
  setSleepData: (data: SleepData[]) => void;
  setProcessedHealthData: (data: any[]) => void;
  
  // Actions - Real-time Health Data
  setCurrentHealth: (reading: HealthReading) => void;
  addHealthReading: (reading: HealthReading) => void;
  clearHealthReadings: () => void;
  setHealthMonitoringActive: (active: boolean) => void;
  setTemperature: (temp: number) => void;
  setSteps: (count: number) => void;
  
  // Actions - Battery Management
  setBatteryData: (battery: IBattery) => void;
  
  // Actions - Command Management
  setCurrentCommand: (command: string) => void;
  setCommandInProgress: (inProgress: boolean) => void;
  clearCurrentCommand: () => void;
  
  // Actions - Sync Management
  setHistoricalDataLoading: (loading: boolean) => void;
  setHistoricalDataCount: (count: number) => void;
  updateLastSyncTime: () => void;
  
  // Actions - Settings
  setPermissionsGranted: (granted: boolean) => void;
  setAutoSync: (enabled: boolean) => void;
  setSyncInterval: (interval: number) => void;
  
  // Utility Actions
  resetStore: () => void;
  isDeviceConnected: () => boolean;
  getConnectionInfo: () => { ring: SmartRingX1 | null; isConnected: boolean; lastAttempt: string | null };
}

// Temporary Store Interface (for non-persisted state)
interface RingTempStore {
  // UI State
  currentDate: string;
  currentTimelinePage: number;
  
  // Mindfulness Data (session-specific)
  mindfulnessTestData: any[];
  
  // Listeners and UI References
  canListener: boolean;
  isOTAMode: boolean;
  
  // Loading States
  isHistoricalDataLoading: boolean;
  historicalNumLoader: number;
  
  // Actions
  setCurrentDate: (date: string) => void;
  setCurrentTimelinePage: (page: number) => void;
  clearMindfulnessTestData: () => void;
  setMindfulnessTestData: (data: any) => void;
  addMindfulnessTestData: (data: any) => void;
  setCanListener: (can: boolean) => void;
  setIsOTAMode: (isOTA: boolean) => void;
  setIsHistoricalDataLoading: (loading: boolean) => void;
  incrementNumLoader: () => void;
  resetNumLoader: () => void;
}

// Create main persisted Ring store
export const useRingStore = create<RingStore>()(
  persist(
    (set, get) => ({
      // Initial Device Information
      connectedRing: null,
      serialNumber: '',
      deviceInfo1: null,
      deviceInfo2: null,
      
      // Initial Connection State
      connectionStatus: {
        isConnected: false,
        isConnecting: false,
        deviceId: null,
        connectionError: null,
      },
      isConnecting: false,
      isScanning: false,
      isReconnecting: false,
      reconnectionAttempt: 0,
      bleManagerState: 'Unknown',
      lastConnectionAttempt: null,
      discoveredDevices: [],
      otaMode: false,
      
      // Initial Health Data
      historicalData: [],
      sleepData: [],
      processedHealthData: [],
      
      // Initial Real-time Health Data
      currentHealthReading: null,
      healthReadings: [],
      isHealthMonitoringActive: false,
      temperature: null,
      steps: null,
      
      // Initial Battery Information
      batteryData: null,
      
      // Initial Command Status
      currentCommand: '',
      commandInProgress: false,
      
      // Initial Data Sync Status
      isHistoricalDataLoading: false,
      historicalDataCount: 0,
      lastSyncTime: null,
      
      // Initial Settings
      permissionsGranted: false,
      autoSync: true,
      syncInterval: 30, // 30 minutes default
      
      // Device Management Actions
      setConnectedRing: (ring) => set({ connectedRing: ring }),
      clearRing: () => set({ 
        connectedRing: null,
        connectionStatus: {
          isConnected: false,
          isConnecting: false,
          deviceId: null,
          connectionError: null,
        }
      }),
      setSerialNumber: (sn) => set({ serialNumber: sn }),
      setDeviceInfo1: (info) => set({ deviceInfo1: info }),
      setDeviceInfo2: (info) => set({ deviceInfo2: info }),
      
      // Connection Management Actions
      setConnectionStatus: (status) => set({ connectionStatus: status }),
      setIsConnecting: (connecting) => set({ isConnecting: connecting }),
      setIsScanning: (scanning) => set({ isScanning: scanning }),
      setIsReconnecting: (reconnecting, attempt = 0) => set({ isReconnecting: reconnecting, reconnectionAttempt: attempt }),
      setBleManagerState: (state) => set({ bleManagerState: state }),
      updateLastConnectionAttempt: () => set({ lastConnectionAttempt: moment().toISOString() }),
      setDiscoveredDevices: (devices) => set({ discoveredDevices: devices }),
      setOtaMode: (enabled) => set({ otaMode: enabled }),
      
      // Health Data Management Actions
      setHistoricalData: (data) => {
        if (!data || !Array.isArray(data)) {
          console.log('📊 Clearing historical data');
          set({ historicalData: [] });
          return;
        }

        // Replace all historical data (don't append)
        console.log(`📊 Setting ${data.length} historical entries`);
        set({ historicalData: data });
      },
      addHistoricalData: (data) => set((state) => {
        if (!data || !Array.isArray(data)) {
          return state;
        }

        // Prevent duplicates by UUID
        const existingUUIDs = new Set(state.historicalData.map(item => item.uuid));
        const newData = data.filter(item => !existingUUIDs.has(item.uuid));

        if (newData.length > 0) {
          console.log(`📊 Adding ${newData.length} new historical entries (${data.length - newData.length} duplicates filtered)`);
          return { historicalData: [...state.historicalData, ...newData] };
        } else {
          console.log(`📊 No new historical data to add (all ${data.length} entries are duplicates)`);
          return state;
        }
      }),
      clearHistoricalData: () => {
        console.log('🧹 Clearing all historical data');
        set({ historicalData: [] });
      },
      setSleepData: (data) => set({ sleepData: data }),
      setProcessedHealthData: (data) => set({ processedHealthData: data }),
      
      // Real-time Health Data Actions
      setCurrentHealth: (reading) => set({ currentHealthReading: reading }),
      addHealthReading: (reading) => set((state) => ({
        healthReadings: [...state.healthReadings.slice(-99), reading] // Keep last 100 readings
      })),
      clearHealthReadings: () => set({ 
        healthReadings: [],
        currentHealthReading: null
      }),
      setHealthMonitoringActive: (active) => set({ isHealthMonitoringActive: active }),
      setTemperature: (temp) => set({ temperature: temp }),
      setSteps: (count) => set({ steps: count }),
      
      // Battery Management Actions
      setBatteryData: (battery) => set({ batteryData: battery }),
      
      // Command Management Actions
      setCurrentCommand: (command) => set({ currentCommand: command, commandInProgress: true }),
      setCommandInProgress: (inProgress) => set({ commandInProgress: inProgress }),
      clearCurrentCommand: () => set({ currentCommand: '', commandInProgress: false }),
      
      // Sync Management Actions
      setHistoricalDataLoading: (loading) => set({ isHistoricalDataLoading: loading }),
      setHistoricalDataCount: (count) => set({ historicalDataCount: count }),
      updateLastSyncTime: () => set({ lastSyncTime: moment().toISOString() }),
      
      // Settings Actions
      setPermissionsGranted: (granted) => set({ permissionsGranted: granted }),
      setAutoSync: (enabled) => set({ autoSync: enabled }),
      setSyncInterval: (interval) => set({ syncInterval: interval }),
      
      // Utility Actions
      resetStore: () => set({
        connectedRing: null,
        serialNumber: '',
        deviceInfo1: null,
        deviceInfo2: null,
        connectionStatus: {
          isConnected: false,
          isConnecting: false,
          deviceId: null,
          connectionError: null,
        },
        isConnecting: false,
        isScanning: false,
        bleManagerState: 'Unknown',
        lastConnectionAttempt: null,
        discoveredDevices: [],
        otaMode: false,
        historicalData: [],
        sleepData: [],
        processedHealthData: [],
        batteryData: null,
        currentCommand: '',
        commandInProgress: false,
        isHistoricalDataLoading: false,
        historicalDataCount: 0,
        lastSyncTime: null,
        permissionsGranted: false,
      }),
      
      isDeviceConnected: () => {
        const state = get();
        return state.connectionStatus.isConnected && state.connectedRing !== null;
      },
      
      getConnectionInfo: () => {
        const state = get();
        return {
          ring: state.connectedRing,
          isConnected: state.connectionStatus.isConnected,
          lastAttempt: state.lastConnectionAttempt,
        };
      },
    }),
    {
      name: 'ring-storage',
      storage: createJSONStorage(() => AsyncStorage),
      // Only persist important data, not temporary UI state
      partialize: (state) => ({
        connectedRing: state.connectedRing,
        serialNumber: state.serialNumber,
        deviceInfo1: state.deviceInfo1,
        deviceInfo2: state.deviceInfo2,
        historicalData: state.historicalData,
        sleepData: state.sleepData,
        batteryData: state.batteryData,
        lastSyncTime: state.lastSyncTime,
        permissionsGranted: state.permissionsGranted,
        autoSync: state.autoSync,
        syncInterval: state.syncInterval,
      }),
    }
  )
);

// Create temporary store for UI and session-specific state
export const useRingTempStore = create<RingTempStore>((set, get) => ({
  // Initial UI State
  currentDate: moment().format('YYYY-MM-DD'),
  currentTimelinePage: 1,
  
  // Initial Mindfulness Data
  mindfulnessTestData: [],
  
  // Initial Listeners and UI References
  canListener: true,
  isOTAMode: false,
  
  // Initial Loading States
  isHistoricalDataLoading: false,
  historicalNumLoader: 0,
  
  // Actions
  setCurrentDate: (date) => set({ currentDate: date }),
  setCurrentTimelinePage: (page) => set({ currentTimelinePage: page }),
  clearMindfulnessTestData: () => set({ mindfulnessTestData: [] }),
  setMindfulnessTestData: (data) => set({ mindfulnessTestData: data }),
  addMindfulnessTestData: (data) => set((state) => ({ 
    mindfulnessTestData: [...state.mindfulnessTestData, data]
  })),
  setCanListener: (can) => set({ canListener: can }),
  setIsOTAMode: (isOTA) => set({ isOTAMode: isOTA }),
  setIsHistoricalDataLoading: (loading) => set({ isHistoricalDataLoading: loading }),
  incrementNumLoader: () => set((state) => ({ 
    historicalNumLoader: state.historicalNumLoader + 1 
  })),
  resetNumLoader: () => set({ historicalNumLoader: 0 }),
}));