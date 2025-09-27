/**
 * Ring Device Persistence Service
 * Manages storage and retrieval of paired Ring devices using MMKV
 * Enables auto-reconnection on app restart
 */

import { MMKV } from 'react-native-mmkv';
import { SmartRingX1 } from '../../types/ring';

// Storage keys
const STORAGE_KEYS = {
  PAIRED_DEVICE: 'ring_paired_device',
  LAST_CONNECTION_TIME: 'ring_last_connection_time',
  DEVICE_PREFERENCES: 'ring_device_preferences',
  AUTO_RECONNECT: 'ring_auto_reconnect_enabled',
  CONNECTION_HISTORY: 'ring_connection_history',
} as const;

// Device connection history entry
interface ConnectionHistoryEntry {
  deviceId: string;
  deviceName: string;
  connectedAt: string;
  disconnectedAt?: string;
  connectionDuration?: number;
}

// Device preferences
interface DevicePreferences {
  autoReconnect: boolean;
  healthMonitoringEnabled: boolean;
  syncInterval: number; // minutes
  lastSyncTime?: string;
}

/**
 * Ring Persistence Manager
 * Singleton class for managing Ring device persistence
 */
export class RingPersistence {
  private static instance: RingPersistence;
  private storage: MMKV;

  private constructor() {
    // Initialize MMKV with encryption for sensitive data
    this.storage = new MMKV({
      id: 'ring-storage',
      encryptionKey: 'ring-encryption-key-x1' // In production, use a secure key
    });
    
    console.log('📦 Ring Persistence initialized with MMKV');
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): RingPersistence {
    if (!RingPersistence.instance) {
      RingPersistence.instance = new RingPersistence();
    }
    return RingPersistence.instance;
  }

  // ===== PAIRED DEVICE MANAGEMENT =====

  /**
   * Save paired Ring device
   * Called after successful connection and pairing
   */
  public savePairedDevice(device: SmartRingX1): void {
    try {
      const deviceData = {
        ...device,
        pairedAt: new Date().toISOString()
      };
      
      this.storage.set(STORAGE_KEYS.PAIRED_DEVICE, JSON.stringify(deviceData));
      this.storage.set(STORAGE_KEYS.LAST_CONNECTION_TIME, Date.now());
      
      console.log('💾 Saved paired Ring device:', device.name, device.id);
      
      // Add to connection history
      this.addToConnectionHistory(device);
    } catch (error) {
      console.error('Failed to save paired device:', error);
    }
  }

  /**
   * Get saved paired device
   * Returns null if no device is saved
   */
  public getPairedDevice(): SmartRingX1 | null {
    try {
      const deviceData = this.storage.getString(STORAGE_KEYS.PAIRED_DEVICE);
      if (!deviceData) {
        console.log('📦 No paired device found in storage');
        return null;
      }
      
      const device = JSON.parse(deviceData) as SmartRingX1 & { pairedAt: string };
      console.log('📦 Retrieved paired device:', device.name, device.id);
      console.log('   Paired at:', device.pairedAt);
      
      return device;
    } catch (error) {
      console.error('Failed to retrieve paired device:', error);
      return null;
    }
  }

  /**
   * Clear paired device
   * Called when user manually unpairs or forgets device
   */
  public clearPairedDevice(): void {
    try {
      const device = this.getPairedDevice();
      if (device) {
        // Mark disconnection in history
        this.markDisconnection(device.id);
      }
      
      this.storage.delete(STORAGE_KEYS.PAIRED_DEVICE);
      this.storage.delete(STORAGE_KEYS.LAST_CONNECTION_TIME);
      
      console.log('🗑️ Cleared paired device from storage');
    } catch (error) {
      console.error('Failed to clear paired device:', error);
    }
  }

  /**
   * Check if we have a paired device
   */
  public hasPairedDevice(): boolean {
    return this.storage.contains(STORAGE_KEYS.PAIRED_DEVICE);
  }

  // ===== AUTO-RECONNECT SETTINGS =====

  /**
   * Set auto-reconnect preference
   */
  public setAutoReconnect(enabled: boolean): void {
    this.storage.set(STORAGE_KEYS.AUTO_RECONNECT, enabled);
    console.log(`🔄 Auto-reconnect ${enabled ? 'enabled' : 'disabled'}`);
  }

  /**
   * Get auto-reconnect preference
   * Defaults to true
   */
  public getAutoReconnect(): boolean {
    return this.storage.getBoolean(STORAGE_KEYS.AUTO_RECONNECT) ?? true;
  }

  // ===== DEVICE PREFERENCES =====

  /**
   * Save device preferences
   */
  public saveDevicePreferences(preferences: DevicePreferences): void {
    try {
      this.storage.set(STORAGE_KEYS.DEVICE_PREFERENCES, JSON.stringify(preferences));
      console.log('💾 Saved device preferences');
    } catch (error) {
      console.error('Failed to save device preferences:', error);
    }
  }

  /**
   * Get device preferences
   */
  public getDevicePreferences(): DevicePreferences {
    try {
      const prefsData = this.storage.getString(STORAGE_KEYS.DEVICE_PREFERENCES);
      if (!prefsData) {
        // Return defaults
        return {
          autoReconnect: true,
          healthMonitoringEnabled: true,
          syncInterval: 30, // 30 minutes default
        };
      }
      
      return JSON.parse(prefsData) as DevicePreferences;
    } catch (error) {
      console.error('Failed to retrieve device preferences:', error);
      return {
        autoReconnect: true,
        healthMonitoringEnabled: true,
        syncInterval: 30,
      };
    }
  }

  // ===== CONNECTION HISTORY =====

  /**
   * Add device to connection history
   */
  private addToConnectionHistory(device: SmartRingX1): void {
    try {
      const history = this.getConnectionHistory();
      
      const entry: ConnectionHistoryEntry = {
        deviceId: device.id,
        deviceName: device.name,
        connectedAt: new Date().toISOString(),
      };
      
      // Keep last 10 connections
      const updatedHistory = [entry, ...history.slice(0, 9)];
      
      this.storage.set(STORAGE_KEYS.CONNECTION_HISTORY, JSON.stringify(updatedHistory));
      console.log('📝 Added to connection history');
    } catch (error) {
      console.error('Failed to update connection history:', error);
    }
  }

  /**
   * Mark disconnection in history
   */
  private markDisconnection(deviceId: string): void {
    try {
      const history = this.getConnectionHistory();
      
      // Find the most recent connection for this device
      const entryIndex = history.findIndex(h => h.deviceId === deviceId && !h.disconnectedAt);
      
      if (entryIndex !== -1) {
        const entry = history[entryIndex];
        entry.disconnectedAt = new Date().toISOString();
        
        // Calculate connection duration
        const connectedTime = new Date(entry.connectedAt).getTime();
        const disconnectedTime = new Date(entry.disconnectedAt).getTime();
        entry.connectionDuration = Math.floor((disconnectedTime - connectedTime) / 1000); // seconds
        
        history[entryIndex] = entry;
        
        this.storage.set(STORAGE_KEYS.CONNECTION_HISTORY, JSON.stringify(history));
        console.log('📝 Marked disconnection in history');
      }
    } catch (error) {
      console.error('Failed to mark disconnection:', error);
    }
  }

  /**
   * Get connection history
   */
  public getConnectionHistory(): ConnectionHistoryEntry[] {
    try {
      const historyData = this.storage.getString(STORAGE_KEYS.CONNECTION_HISTORY);
      if (!historyData) {
        return [];
      }
      
      return JSON.parse(historyData) as ConnectionHistoryEntry[];
    } catch (error) {
      console.error('Failed to retrieve connection history:', error);
      return [];
    }
  }

  // ===== UTILITY METHODS =====

  /**
   * Get last connection time
   */
  public getLastConnectionTime(): number | null {
    const time = this.storage.getNumber(STORAGE_KEYS.LAST_CONNECTION_TIME);
    return time ?? null;
  }

  /**
   * Get time since last connection in human-readable format
   */
  public getTimeSinceLastConnection(): string {
    const lastTime = this.getLastConnectionTime();
    if (!lastTime) {
      return 'Never';
    }
    
    const now = Date.now();
    const diff = now - lastTime;
    
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) {
      return `${days} day${days > 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `${hours} hour${hours > 1 ? 's' : ''} ago`;
    } else if (minutes > 0) {
      return `${minutes} minute${minutes > 1 ? 's' : ''} ago`;
    } else {
      return 'Just now';
    }
  }

  /**
   * Clear all Ring-related storage
   * Use with caution - this removes all saved data
   */
  public clearAll(): void {
    try {
      Object.values(STORAGE_KEYS).forEach(key => {
        this.storage.delete(key);
      });
      
      console.log('🗑️ Cleared all Ring persistence data');
    } catch (error) {
      console.error('Failed to clear all data:', error);
    }
  }

  /**
   * Export all stored data (for debugging)
   */
  public exportData(): Record<string, any> {
    const data: Record<string, any> = {};
    
    Object.entries(STORAGE_KEYS).forEach(([name, key]) => {
      if (this.storage.contains(key)) {
        const value = this.storage.getString(key);
        try {
          data[name] = value ? JSON.parse(value) : value;
        } catch {
          data[name] = value;
        }
      }
    });
    
    return data;
  }
}

// Export singleton instance
export const ringPersistence = RingPersistence.getInstance();