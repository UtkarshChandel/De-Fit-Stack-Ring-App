/**
 * Device Connection Persistence Service
 * Handles device pairing state, connection persistence, and smart reconnection
 * Based on YoiHealth patterns but with improved architecture
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { MMKV } from 'react-native-mmkv';
import { SmartRingX1, IDeviceInfo1, IDeviceInfo2 } from '../../types/ring';

// Storage keys
const STORAGE_KEYS = {
  DEVICE_INFO: 'aphelion_ring_device_info',
  PAIRING_STATE: 'aphelion_ring_pairing_state',
  SYNC_METADATA: 'aphelion_ring_sync_metadata',
} as const;

// Stored device information interface
export interface StoredDeviceInfo {
  // Core device identity
  serialNumber: string;
  bleAddress: string;
  deviceId: string;
  
  // Device specifications
  color: string;
  size: number;
  firmwareVersion: string;
  mainChipModel: string;
  productIteration: string;
  
  // Connection metadata
  firstPairedAt: number;
  lastConnectedAt: number;
  connectionCount: number;
}

// Pairing state information
export interface PairingState {
  // Binding status
  isDeviceBound: boolean;
  bindStatus: 'Bind' | 'Unbind' | 'Unknown';
  
  // OEM verification status
  oemVerificationComplete: boolean;
  switchOem: boolean;
  
  // Pairing completion
  pairingComplete: boolean;
  requiresFullPairing: boolean;
  
  // Timestamps
  lastPairingAt: number;
  lastOemVerificationAt: number;
}

// Sync throttling metadata
export interface SyncMetadata {
  // Historical sync tracking
  lastHistoricalSyncAt: number;
  lastSyncRecordCount: number;
  syncThrottleThreshold: number; // 5 minutes default
  
  // Health data sync
  lastHealthSyncAt: number;
  lastBatterySyncAt: number;
  
  // Sync preferences
  autoSyncEnabled: boolean;
  syncOnAppLaunch: boolean;
}

// Connection persistence service
export class DevicePersistenceService {
  // Default sync throttle threshold (5 minutes like YoiHealth)
  private static readonly DEFAULT_SYNC_THRESHOLD = 5 * 60 * 1000; // 5 minutes
  
  // MMKV storage instance for faster access
  private static mmkv: MMKV | null = null;
  
  /**
   * Initialize MMKV storage
   */
  private static getMMKV(): MMKV {
    if (!this.mmkv) {
      this.mmkv = new MMKV({
        id: 'ring-persistence',
        encryptionKey: 'ring-secure-key-x1'
      });
    }
    return this.mmkv;
  }

  /**
   * Store device information after successful pairing
   */
  static async storeDeviceInfo(
    ring: SmartRingX1,
    deviceInfo1: IDeviceInfo1,
    deviceInfo2: IDeviceInfo2
  ): Promise<void> {
    try {
      const deviceInfo: StoredDeviceInfo = {
        serialNumber: deviceInfo2.sn || '',
        bleAddress: deviceInfo1.bleAddress || '',
        deviceId: ring.id,
        color: deviceInfo1.color || 'Unknown',
        size: deviceInfo1.size || 0,
        firmwareVersion: deviceInfo1.deviceVer || 'Unknown',
        mainChipModel: deviceInfo1.mainChipModel || 'Unknown',
        productIteration: deviceInfo1.productIteration || 'Unknown',
        firstPairedAt: Date.now(),
        lastConnectedAt: Date.now(),
        connectionCount: 1,
      };

      // Use MMKV for faster storage
      const storage = this.getMMKV();
      storage.set(STORAGE_KEYS.DEVICE_INFO, JSON.stringify(deviceInfo));
      
      // Also save to AsyncStorage for backup
      await AsyncStorage.setItem(
        STORAGE_KEYS.DEVICE_INFO,
        JSON.stringify(deviceInfo)
      );

      console.log('✅ Device info stored for persistence:', {
        serialNumber: deviceInfo.serialNumber,
        bleAddress: deviceInfo.bleAddress,
        deviceId: deviceInfo.deviceId,
      });
    } catch (error) {
      console.error('❌ Failed to store device info:', error);
      throw error;
    }
  }

  /**
   * Store pairing state after successful binding
   */
  static async storePairingState(
    bindStatus: 'Bind' | 'Unbind' | 'Unknown',
    oemComplete: boolean = false,
    switchOem: boolean = false
  ): Promise<void> {
    try {
      const pairingState: PairingState = {
        isDeviceBound: bindStatus === 'Bind',
        bindStatus,
        oemVerificationComplete: oemComplete,
        switchOem,
        pairingComplete: bindStatus === 'Bind' && oemComplete,
        requiresFullPairing: bindStatus !== 'Bind' || !oemComplete,
        lastPairingAt: Date.now(),
        lastOemVerificationAt: oemComplete ? Date.now() : 0,
      };

      // Use MMKV for faster storage
      const storage = this.getMMKV();
      storage.set(STORAGE_KEYS.PAIRING_STATE, JSON.stringify(pairingState));
      
      // Also save to AsyncStorage for backup
      await AsyncStorage.setItem(
        STORAGE_KEYS.PAIRING_STATE,
        JSON.stringify(pairingState)
      );

      console.log('✅ Pairing state stored:', {
        isDeviceBound: pairingState.isDeviceBound,
        oemComplete: pairingState.oemVerificationComplete,
        requiresFullPairing: pairingState.requiresFullPairing,
      });
    } catch (error) {
      console.error('❌ Failed to store pairing state:', error);
      throw error;
    }
  }

  /**
   * Update sync metadata after successful sync operations
   */
  static async updateSyncMetadata(
    syncType: 'historical' | 'health' | 'battery',
    recordCount?: number
  ): Promise<void> {
    try {
      const existing = await this.getSyncMetadata();
      const now = Date.now();

      const updated: SyncMetadata = {
        ...existing,
        autoSyncEnabled: existing?.autoSyncEnabled ?? true,
        syncOnAppLaunch: existing?.syncOnAppLaunch ?? true,
        syncThrottleThreshold: existing?.syncThrottleThreshold ?? this.DEFAULT_SYNC_THRESHOLD,
      };

      // Update specific sync timestamps
      switch (syncType) {
        case 'historical':
          updated.lastHistoricalSyncAt = now;
          if (recordCount !== undefined) {
            updated.lastSyncRecordCount = recordCount;
          }
          break;
        case 'health':
          updated.lastHealthSyncAt = now;
          break;
        case 'battery':
          updated.lastBatterySyncAt = now;
          break;
      }

      await AsyncStorage.setItem(
        STORAGE_KEYS.SYNC_METADATA,
        JSON.stringify(updated)
      );

      console.log(`✅ Sync metadata updated for ${syncType}:`, {
        timestamp: now,
        recordCount,
      });
    } catch (error) {
      console.error('❌ Failed to update sync metadata:', error);
    }
  }

  /**
   * Get stored device information
   */
  static async getStoredDeviceInfo(): Promise<StoredDeviceInfo | null> {
    try {
      // Try MMKV first for faster access
      const storage = this.getMMKV();
      let stored = storage.getString(STORAGE_KEYS.DEVICE_INFO);
      
      // Fallback to AsyncStorage if not in MMKV
      if (!stored) {
        stored = await AsyncStorage.getItem(STORAGE_KEYS.DEVICE_INFO);
        // If found in AsyncStorage, save to MMKV for next time
        if (stored) {
          storage.set(STORAGE_KEYS.DEVICE_INFO, stored);
        }
      }
      
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('❌ Failed to get stored device info:', error);
      return null;
    }
  }

  /**
   * Get stored pairing state
   */
  static async getPairingState(): Promise<PairingState | null> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.PAIRING_STATE);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('❌ Failed to get pairing state:', error);
      return null;
    }
  }

  /**
   * Get sync metadata
   */
  static async getSyncMetadata(): Promise<SyncMetadata | null> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEYS.SYNC_METADATA);
      return stored ? JSON.parse(stored) : null;
    } catch (error) {
      console.error('❌ Failed to get sync metadata:', error);
      return null;
    }
  }

  /**
   * Check if device should perform full pairing or quick reconnection
   */
  static async shouldPerformFullPairing(): Promise<{
    requiresFullPairing: boolean;
    reason: string;
    storedDevice: StoredDeviceInfo | null;
    pairingState: PairingState | null;
  }> {
    try {
      const storedDevice = await this.getStoredDeviceInfo();
      const pairingState = await this.getPairingState();

      // No stored device - first time pairing
      if (!storedDevice) {
        return {
          requiresFullPairing: true,
          reason: 'No stored device information - first time pairing',
          storedDevice: null,
          pairingState: null,
        };
      }

      // No pairing state - incomplete pairing
      if (!pairingState) {
        return {
          requiresFullPairing: true,
          reason: 'No pairing state found - incomplete previous pairing',
          storedDevice,
          pairingState: null,
        };
      }

      // Device not bound - needs full pairing
      if (!pairingState.isDeviceBound || pairingState.bindStatus !== 'Bind') {
        return {
          requiresFullPairing: true,
          reason: 'Device not bound or binding incomplete',
          storedDevice,
          pairingState,
        };
      }

      // OEM verification incomplete - needs verification
      if (!pairingState.oemVerificationComplete) {
        return {
          requiresFullPairing: true,
          reason: 'OEM verification incomplete',
          storedDevice,
          pairingState,
        };
      }

      // All checks passed - quick reconnection allowed
      return {
        requiresFullPairing: false,
        reason: 'Device previously paired and bound - quick reconnection allowed',
        storedDevice,
        pairingState,
      };
    } catch (error) {
      console.error('❌ Failed to check pairing requirements:', error);
      return {
        requiresFullPairing: true,
        reason: 'Error checking pairing state - defaulting to full pairing',
        storedDevice: null,
        pairingState: null,
      };
    }
  }

  /**
   * Check if historical sync should be throttled (YoiHealth pattern)
   */
  static async shouldThrottleHistoricalSync(): Promise<{
    shouldThrottle: boolean;
    reason: string;
    timeSinceLastSync: number;
    nextSyncAllowedAt: number;
  }> {
    try {
      const syncMetadata = await this.getSyncMetadata();
      
      if (!syncMetadata) {
        return {
          shouldThrottle: false,
          reason: 'No sync metadata - first sync allowed',
          timeSinceLastSync: 0,
          nextSyncAllowedAt: 0,
        };
      }

      const now = Date.now();
      const lastSync = syncMetadata.lastHistoricalSyncAt || 0;
      const threshold = syncMetadata.syncThrottleThreshold || this.DEFAULT_SYNC_THRESHOLD;
      const timeSinceLastSync = now - lastSync;
      const nextSyncAllowedAt = lastSync + threshold;

      if (timeSinceLastSync >= threshold) {
        return {
          shouldThrottle: false,
          reason: `Sufficient time elapsed (${Math.round(timeSinceLastSync / 1000)}s > ${Math.round(threshold / 1000)}s)`,
          timeSinceLastSync,
          nextSyncAllowedAt,
        };
      } else {
        return {
          shouldThrottle: true,
          reason: `Recent sync detected (${Math.round(timeSinceLastSync / 1000)}s < ${Math.round(threshold / 1000)}s)`,
          timeSinceLastSync,
          nextSyncAllowedAt,
        };
      }
    } catch (error) {
      console.error('❌ Failed to check sync throttling:', error);
      return {
        shouldThrottle: false,
        reason: 'Error checking sync state - allowing sync',
        timeSinceLastSync: 0,
        nextSyncAllowedAt: 0,
      };
    }
  }

  /**
   * Update connection count and last connected timestamp
   */
  static async updateConnectionMetadata(): Promise<void> {
    try {
      const storedDevice = await this.getStoredDeviceInfo();
      if (storedDevice) {
        const updated: StoredDeviceInfo = {
          ...storedDevice,
          lastConnectedAt: Date.now(),
          connectionCount: storedDevice.connectionCount + 1,
        };

        await AsyncStorage.setItem(
          STORAGE_KEYS.DEVICE_INFO,
          JSON.stringify(updated)
        );

        console.log(`✅ Connection metadata updated - count: ${updated.connectionCount}`);
      }
    } catch (error) {
      console.error('❌ Failed to update connection metadata:', error);
    }
  }

  /**
   * Clear stored device information (for re-pairing)
   */
  static async clearStoredDevice(): Promise<void> {
    try {
      // Clear from MMKV
      const storage = this.getMMKV();
      storage.delete(STORAGE_KEYS.DEVICE_INFO);
      
      // Clear from AsyncStorage
      await AsyncStorage.removeItem(STORAGE_KEYS.DEVICE_INFO);
      await AsyncStorage.removeItem(STORAGE_KEYS.PAIRING_STATE);
      
      console.log('✅ Stored device information cleared');
    } catch (error) {
      console.error('❌ Failed to clear stored device:', error);
      throw error;
    }
  }

  /**
   * Clear all stored device data (unpair/reset)
   */
  static async clearAllDeviceData(): Promise<void> {
    try {
      // Clear from MMKV
      const storage = this.getMMKV();
      storage.delete(STORAGE_KEYS.DEVICE_INFO);
      
      // Clear from AsyncStorage
      await Promise.all([
        AsyncStorage.removeItem(STORAGE_KEYS.DEVICE_INFO),
        AsyncStorage.removeItem(STORAGE_KEYS.PAIRING_STATE),
        AsyncStorage.removeItem(STORAGE_KEYS.SYNC_METADATA),
      ]);

      console.log('✅ All device persistence data cleared');
    } catch (error) {
      console.error('❌ Failed to clear device data:', error);
      throw error;
    }
  }

  /**
   * Get comprehensive device status for debugging
   */
  static async getDeviceStatus(): Promise<{
    hasStoredDevice: boolean;
    isPaired: boolean;
    isOemComplete: boolean;
    requiresFullPairing: boolean;
    syncStatus: {
      lastHistoricalSync: string;
      syncThrottled: boolean;
      nextSyncAllowed: string;
    };
  }> {
    try {
      const deviceInfo = await this.getStoredDeviceInfo();
      const pairingState = await this.getPairingState();
      const syncCheck = await this.shouldThrottleHistoricalSync();

      return {
        hasStoredDevice: !!deviceInfo,
        isPaired: pairingState?.isDeviceBound || false,
        isOemComplete: pairingState?.oemVerificationComplete || false,
        requiresFullPairing: pairingState?.requiresFullPairing ?? true,
        syncStatus: {
          lastHistoricalSync: pairingState ? new Date(syncCheck.timeSinceLastSync).toISOString() : 'Never',
          syncThrottled: syncCheck.shouldThrottle,
          nextSyncAllowed: new Date(syncCheck.nextSyncAllowedAt).toISOString(),
        },
      };
    } catch (error) {
      console.error('❌ Failed to get device status:', error);
      return {
        hasStoredDevice: false,
        isPaired: false,
        isOemComplete: false,
        requiresFullPairing: true,
        syncStatus: {
          lastHistoricalSync: 'Error',
          syncThrottled: false,
          nextSyncAllowed: 'Error',
        },
      };
    }
  }
}