/**
 * Ring Initialization
 * Simple initialization without duplicate setup
 */

import { cleanRingConnection } from './connection/CleanRingConnection';
import { RingSDK } from './sdk/ringSDK';

let isInitialized = false;

/**
 * Initialize Ring services once
 */
export async function initializeRing(): Promise<void> {
  if (isInitialized) {
    console.log('Ring already initialized');
    return;
  }
  
  try {
    console.log('🔧 Initializing Ring services...');
    
    // Get SDK instance (initializes automatically)
    const sdk = RingSDK.getInstance();
    const version = sdk.getVersion();
    if (version) {
      console.log('Ring SDK version:', version);
    }
    
    // Get connection service (initializes automatically)
    const connection = cleanRingConnection;
    
    // Try auto-connect to stored device
    try {
      const autoConnected = await connection.autoConnect();

      if (autoConnected) {
        console.log('✅ Auto-connected to stored Ring device');

        // Start health data sync after successful auto-connection
        console.log('🔄 Starting automatic health data sync...');
        setTimeout(async () => {
          try {
            const { healthDataSyncService } = await import('./services/HealthDataSyncService');
            await healthDataSyncService.startSync();

            // Enable periodic sync every 15 minutes
            healthDataSyncService.enableAutoSync(15);
            console.log('✅ Health data sync initialized');
          } catch (syncError) {
            console.error('Failed to start health sync:', syncError);
          }
        }, 3000); // Give device 3 seconds to stabilize after connection

      } else {
        console.log('📱 No stored device or device not found');
      }
    } catch (autoError) {
      console.log('📱 Auto-connect skipped:', autoError.message);
    }
    
    isInitialized = true;
    console.log('✅ Ring services initialized');
    
  } catch (error) {
    console.error('Failed to initialize Ring services:', error);
    isInitialized = false;
    // Don't throw - allow app to continue even if initialization has issues
  }
}

/**
 * Check if Ring is initialized
 */
export function isRingInitialized(): boolean {
  return isInitialized;
}