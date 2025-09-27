/**
 * Ring Device Setup Hook (Refactored)
 * Thin consumer hook that delegates to RingConnectionCoordinator
 * Production-grade architecture with clean separation of concerns
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { check, PERMISSIONS, request, RESULTS } from 'react-native-permissions';

import { SmartRingX1 } from '../../types/ring';
import { 
  RingConnectionCoordinator, 
  ConnectionContext 
} from '../connection/RingConnectionCoordinator';

/**
 * Simplified hook that consumes the connection coordinator
 * This hook is now just a thin wrapper around the coordinator
 */
export const useRingSetup = () => {
  // Get singleton coordinator instance
  const coordinator = useMemo(() => RingConnectionCoordinator.getInstance(), []);
  
  // Subscribe to coordinator state changes
  const [connectionContext, setConnectionContext] = useState<ConnectionContext>(
    coordinator.getState()
  );

  // Subscribe to state updates
  useEffect(() => {
    const unsubscribe = coordinator.subscribe(setConnectionContext);
    
    // Cleanup on unmount
    return () => {
      unsubscribe();
    };
  }, [coordinator]);

  /**
   * Request BLE permissions with proper platform handling
   */
  const requestBLEPermissions = useCallback(async (): Promise<boolean> => {
    try {
      console.log('[Hook] Requesting BLE permissions...');
      let allGranted = true;

      if (Platform.OS === 'android') {
        const androidVersion = Platform.Version;
        
        if (androidVersion >= 31) {
          // Android 12+ permissions
          const bluetoothPermissions = [
            PERMISSIONS.ANDROID.BLUETOOTH_SCAN,
            PERMISSIONS.ANDROID.BLUETOOTH_CONNECT,
            PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION,
          ];

          for (const permission of bluetoothPermissions) {
            const result = await check(permission);
            
            if (result !== RESULTS.GRANTED) {
              const requestResult = await request(permission);
              if (requestResult !== RESULTS.GRANTED) {
                console.warn(`[Hook] Permission ${permission} not granted:`, requestResult);
                allGranted = false;
              }
            }
          }
        } else {
          // Pre-Android 12
          const locationResult = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
          if (locationResult !== RESULTS.GRANTED) {
            allGranted = false;
          }
        }
      } else {
        // iOS - handled automatically by react-native-ble-plx
        allGranted = true;
      }

      if (!allGranted) {
        Alert.alert(
          'Permissions Required',
          'Bluetooth and location permissions are required to connect to your Ring device.',
          [
            { text: 'OK', style: 'default' }
          ]
        );
      }

      return allGranted;
    } catch (error) {
      console.error('[Hook] Error requesting permissions:', error);
      return false;
    }
  }, []);

  /**
   * Start scanning for Ring devices
   */
  const startScan = useCallback(async (): Promise<void> => {
    try {
      // Check permissions first
      const hasPermissions = await requestBLEPermissions();
      if (!hasPermissions) {
        throw new Error('Bluetooth permissions not granted');
      }

      await coordinator.startScan(10000); // 10 second scan
    } catch (error) {
      console.error('[Hook] Scan failed:', error);
      Alert.alert(
        'Scan Error', 
        'Failed to start scanning for Ring devices. Please ensure Bluetooth is enabled.'
      );
      throw error;
    }
  }, [coordinator, requestBLEPermissions]);

  /**
   * Stop scanning
   */
  const stopScan = useCallback(async (): Promise<void> => {
    try {
      await coordinator.stopScan();
    } catch (error) {
      console.error('[Hook] Failed to stop scan:', error);
    }
  }, [coordinator]);

  /**
   * Connect to a Ring device
   */
  const connectToRing = useCallback(async (deviceId: string): Promise<void> => {
    try {
      await coordinator.connect(deviceId);
    } catch (error) {
      console.error('[Hook] Connection failed:', error);
      throw error;
    }
  }, [coordinator]);

  /**
   * Disconnect from current device
   */
  const disconnectFromRing = useCallback(async (): Promise<void> => {
    try {
      await coordinator.disconnect();
    } catch (error) {
      console.error('[Hook] Disconnect failed:', error);
      throw error;
    }
  }, [coordinator]);

  /**
   * Auto-connect to stored device
   */
  const autoConnect = useCallback(async (): Promise<boolean> => {
    try {
      return await coordinator.autoConnect();
    } catch (error) {
      console.error('[Hook] Auto-connect failed:', error);
      return false;
    }
  }, [coordinator]);

  // Convert discovered devices map to array for UI
  const discoveredDevices = useMemo(
    () => Array.from(connectionContext.discoveredDevices.values()),
    [connectionContext.discoveredDevices]
  );

  // Return simplified interface for UI consumption
  return {
    // State
    isScanning: connectionContext.isScanning,
    isConnecting: connectionContext.isConnecting,
    isConnected: connectionContext.isConnected,
    discoveredDevices,
    connectedRing: connectionContext.connectedDevice,
    connectionError: connectionContext.error?.message || null,
    connectionStatus: {
      isConnected: connectionContext.isConnected,
      isConnecting: connectionContext.isConnecting,
      deviceId: connectionContext.connectedDevice?.id || null,
      connectionError: connectionContext.error?.message || null,
    },
    
    // Actions (all delegated to coordinator)
    startScan,
    stopScan,
    connectToRing,
    disconnectFromRing,
    requestBLEPermissions,
    autoConnect,
    
    // Utilities
    isBluetoothEnabled: () => true, // This would check actual BLE state
    refreshDeviceList: () => {
      // Force UI refresh if needed
      setConnectionContext({ ...coordinator.getState() });
    },
  };
};

export default useRingSetup;