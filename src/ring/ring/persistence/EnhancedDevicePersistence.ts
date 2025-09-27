/**
 * Enhanced Device Persistence Service
 * Manages device pairing, auto-reconnection, and session persistence
 * Following official guide requirements
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { IDeviceInfo1 } from '../../types/ring';

// Storage keys
const STORAGE_KEYS = {
  PAIRED_DEVICE: '@ring/paired_device',
  CONNECTION_HISTORY: '@ring/connection_history',
  SYNC_STATE: '@ring/sync_state',
  USER_PREFERENCES: '@ring/user_preferences',
} as const;

/**
 * Paired device information for auto-reconnection
 */
export interface PairedDeviceInfo {
  // Device identity (unique ID from official guide)
  deviceId: string;
  deviceName: string;
  
  // Device specifications from deviceInfo1
  deviceInfo?: IDeviceInfo1;
  
  // Pairing metadata
  firstPairedAt: Date;
  lastConnected: Date;
  connectionCount: number;
  
  // Binding state
  isBound: boolean;
  bindingTimestamp?: Date;
}

/**
 * Connection history entry
 */
export interface ConnectionHistoryEntry {
  deviceId: string;
  connectedAt: Date;
  disconnectedAt?: Date;
  sessionDuration?: number;
  dataPointsCollected: number;
  connectionQuality: 'excellent' | 'good' | 'fair' | 'poor';
}

/**
 * Sync state for managing data synchronization
 */
export interface SyncState {
  lastHistoricalSync: Date;
  lastHealthSync: Date;
  lastBatterySync: Date;
  pendingSyncItems: number;
  syncInProgress: boolean;
}

/**
 * User preferences for Ring behavior
 */
export interface UserPreferences {
  autoConnect: boolean;
  autoSync: boolean;
  syncInterval: number; // minutes
  notificationsEnabled: boolean;
  healthAlerts: boolean;
  lowBatteryAlert: boolean;
  disconnectionAlert: boolean;
}

export class EnhancedDevicePersistence {
  private static instance: EnhancedDevicePersistence;
  
  private constructor() {}
  
  public static getInstance(): EnhancedDevicePersistence {
    if (!EnhancedDevicePersistence.instance) {
      EnhancedDevicePersistence.instance = new EnhancedDevicePersistence();
    }
    return EnhancedDevicePersistence.instance;
  }
  
  /**
   * Save paired device for auto-reconnection
   * Called after successful deviceInfo2 and binding
   */
  async savePairedDevice(info: Partial<PairedDeviceInfo>): Promise<void> {
    try {
      const existing = await this.getPairedDevice();
      
      const pairedDevice: PairedDeviceInfo = {
        deviceId: info.deviceId || existing?.deviceId || '',
        deviceName: info.deviceName || existing?.deviceName || 'Smart Ring',
        deviceInfo: info.deviceInfo || existing?.deviceInfo,
        firstPairedAt: existing?.firstPairedAt || new Date(),
        lastConnected: new Date(),
        connectionCount: (existing?.connectionCount || 0) + 1,
        isBound: info.isBound ?? existing?.isBound ?? false,
        bindingTimestamp: info.isBound ? new Date() : existing?.bindingTimestamp,
      };
      
      await AsyncStorage.setItem(
        STORAGE_KEYS.PAIRED_DEVICE,
        JSON.stringify(pairedDevice)
      );
      
      console.log('✅ Paired device saved:', {
        deviceId: pairedDevice.deviceId,
        isBound: pairedDevice.isBound,
        connectionCount: pairedDevice.connectionCount,
      });
    } catch (error) {
      console.error('Failed to save paired device:', error);
      throw error;
    }
  }
  
  /**
   * Get paired device information
   * Used for auto-reconnection on app launch
   */
  async getPairedDevice(): Promise<PairedDeviceInfo | null> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.PAIRED_DEVICE);
      if (!stored) return null;
      
      const parsed = JSON.parse(stored);
      
      // Convert date strings back to Date objects
      return {
        ...parsed,
        firstPairedAt: new Date(parsed.firstPairedAt),
        lastConnected: new Date(parsed.lastConnected),
        bindingTimestamp: parsed.bindingTimestamp ? new Date(parsed.bindingTimestamp) : undefined,
      };
    } catch (error) {
      console.error('Failed to get paired device:', error);
      return null;
    }
  }
  
  /**
   * Clear paired device (unpair)
   */
  async clearPairedDevice(): Promise<void> {
    try {
      await AsyncStorage.removeItem(STORAGE_KEYS.PAIRED_DEVICE);
      console.log('✅ Paired device cleared');
    } catch (error) {
      console.error('Failed to clear paired device:', error);
      throw error;
    }
  }
  
  /**
   * Add connection history entry
   */
  async addConnectionHistory(entry: ConnectionHistoryEntry): Promise<void> {
    try {
      const history = await this.getConnectionHistory();
      history.push(entry);
      
      // Keep only last 100 entries
      const trimmed = history.slice(-100);
      
      await AsyncStorage.setItem(
        STORAGE_KEYS.CONNECTION_HISTORY,
        JSON.stringify(trimmed)
      );
    } catch (error) {
      console.error('Failed to add connection history:', error);
    }
  }
  
  /**
   * Get connection history
   */
  async getConnectionHistory(): Promise<ConnectionHistoryEntry[]> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.CONNECTION_HISTORY);
      if (!stored) return [];
      
      const parsed = JSON.parse(stored);
      return parsed.map((entry: any) => ({
        ...entry,
        connectedAt: new Date(entry.connectedAt),
        disconnectedAt: entry.disconnectedAt ? new Date(entry.disconnectedAt) : undefined,
      }));
    } catch (error) {
      console.error('Failed to get connection history:', error);
      return [];
    }
  }
  
  /**
   * Update sync state
   */
  async updateSyncState(updates: Partial<SyncState>): Promise<void> {
    try {
      const current = await this.getSyncState();
      
      const newState: SyncState = {
        lastHistoricalSync: updates.lastHistoricalSync || current.lastHistoricalSync,
        lastHealthSync: updates.lastHealthSync || current.lastHealthSync,
        lastBatterySync: updates.lastBatterySync || current.lastBatterySync,
        pendingSyncItems: updates.pendingSyncItems ?? current.pendingSyncItems,
        syncInProgress: updates.syncInProgress ?? current.syncInProgress,
      };
      
      await AsyncStorage.setItem(
        STORAGE_KEYS.SYNC_STATE,
        JSON.stringify(newState)
      );
    } catch (error) {
      console.error('Failed to update sync state:', error);
    }
  }
  
  /**
   * Get sync state
   */
  async getSyncState(): Promise<SyncState> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_STATE);
      if (!stored) {
        return {
          lastHistoricalSync: new Date(0),
          lastHealthSync: new Date(0),
          lastBatterySync: new Date(0),
          pendingSyncItems: 0,
          syncInProgress: false,
        };
      }
      
      const parsed = JSON.parse(stored);
      return {
        ...parsed,
        lastHistoricalSync: new Date(parsed.lastHistoricalSync),
        lastHealthSync: new Date(parsed.lastHealthSync),
        lastBatterySync: new Date(parsed.lastBatterySync),
      };
    } catch (error) {
      console.error('Failed to get sync state:', error);
      return {
        lastHistoricalSync: new Date(0),
        lastHealthSync: new Date(0),
        lastBatterySync: new Date(0),
        pendingSyncItems: 0,
        syncInProgress: false,
      };
    }
  }
  
  /**
   * Check if should sync (throttling)
   */
  async shouldSync(type: 'historical' | 'health' | 'battery', intervalMinutes: number = 5): Promise<boolean> {
    try {
      const syncState = await this.getSyncState();
      const now = new Date();
      
      let lastSync: Date;
      switch (type) {
        case 'historical':
          lastSync = syncState.lastHistoricalSync;
          break;
        case 'health':
          lastSync = syncState.lastHealthSync;
          break;
        case 'battery':
          lastSync = syncState.lastBatterySync;
          break;
      }
      
      const timeSinceLastSync = now.getTime() - lastSync.getTime();
      const intervalMs = intervalMinutes * 60 * 1000;
      
      return timeSinceLastSync >= intervalMs;
    } catch (error) {
      console.error('Failed to check sync throttle:', error);
      return true; // Allow sync on error
    }
  }
  
  /**
   * Save user preferences
   */
  async saveUserPreferences(prefs: Partial<UserPreferences>): Promise<void> {
    try {
      const current = await this.getUserPreferences();
      
      const updated: UserPreferences = {
        ...current,
        ...prefs,
      };
      
      await AsyncStorage.setItem(
        STORAGE_KEYS.USER_PREFERENCES,
        JSON.stringify(updated)
      );
    } catch (error) {
      console.error('Failed to save user preferences:', error);
    }
  }
  
  /**
   * Get user preferences
   */
  async getUserPreferences(): Promise<UserPreferences> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
      if (!stored) {
        // Return defaults
        return {
          autoConnect: true,
          autoSync: true,
          syncInterval: 15, // 15 minutes
          notificationsEnabled: true,
          healthAlerts: true,
          lowBatteryAlert: true,
          disconnectionAlert: true,
        };
      }
      
      return JSON.parse(stored);
    } catch (error) {
      console.error('Failed to get user preferences:', error);
      // Return defaults on error
      return {
        autoConnect: true,
        autoSync: true,
        syncInterval: 15,
        notificationsEnabled: true,
        healthAlerts: true,
        lowBatteryAlert: true,
        disconnectionAlert: true,
      };
    }
  }
  
  /**
   * Clear all persistence data (factory reset)
   */
  async clearAllData(): Promise<void> {
    try {
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.PAIRED_DEVICE),
        AsyncStorage.removeItem(STORAGE_KEYS.CONNECTION_HISTORY),
        AsyncStorage.removeItem(STORAGE_KEYS.SYNC_STATE),
        AsyncStorage.removeItem(STORAGE_KEYS.USER_PREFERENCES),
      ]);
      
      console.log('✅ All persistence data cleared');
    } catch (error) {
      console.error('Failed to clear all data:', error);
      throw error;
    }
  }
  
  /**
   * Get comprehensive device status
   */
  async getDeviceStatus(): Promise<{
    hasPairedDevice: boolean;
    deviceId: string | null;
    isBound: boolean;
    lastConnected: Date | null;
    connectionCount: number;
    autoConnectEnabled: boolean;
    syncEnabled: boolean;
  }> {
    try {
      const pairedDevice = await this.getPairedDevice();
      const preferences = await this.getUserPreferences();
      
      return {
        hasPairedDevice: !!pairedDevice,
        deviceId: pairedDevice?.deviceId || null,
        isBound: pairedDevice?.isBound || false,
        lastConnected: pairedDevice?.lastConnected || null,
        connectionCount: pairedDevice?.connectionCount || 0,
        autoConnectEnabled: preferences.autoConnect,
        syncEnabled: preferences.autoSync,
      };
    } catch (error) {
      console.error('Failed to get device status:', error);
      return {
        hasPairedDevice: false,
        deviceId: null,
        isBound: false,
        lastConnected: null,
        connectionCount: 0,
        autoConnectEnabled: false,
        syncEnabled: false,
      };
    }
  }
}

export const devicePersistence = EnhancedDevicePersistence.getInstance();