/**
 * Health Data Sync Service
 * Manages synchronization of health data from Ring device
 */

import {
  ActivityData,
  BatteryData,
  BloodOxygenData,
  HealthSyncStatus,
  HeartRateData,
  HistoricalDataEntry,
  TemperatureData
} from '../../types/health';
import { ringCommands } from '../commands/ringCommands';
import { cleanRingConnection } from '../connection/CleanRingConnection';
import { RingSDK } from '../sdk/ringSDK';
import { useRingStore } from '../state/ringStore';
import { healthDataStorage } from '../storage/HealthDataStorage';

export class HealthDataSyncService {
  private static instance: HealthDataSyncService | null = null;
  private connectionManager: typeof cleanRingConnection;
  private ringSDK: RingSDK;
  private syncStatus: HealthSyncStatus = {
    isSyncing: false,
    syncProgress: 0,
    pendingRecords: 0,
    syncedRecords: 0
  };
  private syncInterval: any | null = null;
  private listeners: Map<string, Function[]> = new Map();

  private constructor() {
    this.connectionManager = cleanRingConnection;
    this.ringSDK = RingSDK.getInstance();
    this.registerEventListeners();
  }

  /**
   * Register event listeners for real-time health data
   */
  private registerEventListeners(): void {
    // Note: CleanRingConnection doesn't have event emitter methods
    // Data is received through SDK listeners instead

    // Register SDK health listeners for direct SDK data
    this.ringSDK.registerHealthListener({
      onResult: (data: any) => {
        console.log('💓 Health data from SDK:', data);
        if (data.heartRate) {
          const heartRateData: HeartRateData = {
            heartRate: data.heartRate,
            restingHeartRate: data.restingHeartRate,
            timestamp: Date.now()
          };
          healthDataStorage.saveHeartRateData(heartRateData);
          this.emit('heartRate', heartRateData);
        }
        if (data.oxValue) {
          const oxygenData: BloodOxygenData = {
            oxValue: data.oxValue,
            timestamp: Date.now()
          };
          healthDataStorage.saveBloodOxygenData(oxygenData);
          this.emit('oxygen', oxygenData);
        }
      }
    });

    this.ringSDK.registerStepListener({
      onResult: (data: any) => {
        console.log('👟 Step data from SDK:', data);
        const activityData: ActivityData = {
          steps: data.steps || 0,
          distance: data.distance || 0,
          calories: data.calories || 0,
          activeMinutes: data.activeMinutes || 0,
          date: new Date().toISOString().split('T')[0],
          timestamp: Date.now()
        };
        healthDataStorage.saveActivityData(activityData);
        this.emit('steps', activityData);
      }
    });

    this.ringSDK.registerTemperatureListener({
      onResult: (data: any) => {
        console.log('🌡️ Temperature data from SDK:', data);
        const tempData: TemperatureData = {
          temperature: data.temperature,
          timestamp: Date.now()
        };
        healthDataStorage.saveTemperatureData(tempData);
        this.emit('temperature', tempData);
      }
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): HealthDataSyncService {
    if (!HealthDataSyncService.instance) {
      HealthDataSyncService.instance = new HealthDataSyncService();
    }
    return HealthDataSyncService.instance;
  }

  /**
   * Start health data sync
   */
  public async startSync(): Promise<void> {
    if (this.syncStatus.isSyncing) {
      console.log('⏳ Sync already in progress');
      return;
    }

    try {
      console.log('🔄 Starting health data sync...');
      this.updateSyncStatus({
        isSyncing: true,
        syncProgress: 0,
        syncError: undefined
      });

      // Check connection
      if (!this.connectionManager.isConnected()) {
        throw new Error('Ring device not connected');
      }

      // 1. Battery status first (as per yoihealth)
      await this.syncBatteryStatus();
      this.updateSyncStatus({ syncProgress: 10 });

      // 2. Device info and potential OEM verification
      await this.syncDeviceInfo();
      this.updateSyncStatus({ syncProgress: 20 });

      // 3. Device bind (ensure device is bound)
      await this.ensureDeviceBound();
      this.updateSyncStatus({ syncProgress: 30 });

      // 4. Sync current time
      await this.syncTime();
      this.updateSyncStatus({ syncProgress: 40 });

      // 5. Get historical data count first
      const dataCount = await this.getHistoricalDataCount();
      this.updateSyncStatus({
        syncProgress: 50,
        pendingRecords: dataCount
      });

      // 6. Sync historical data if available
      if (dataCount > 0) {
        await this.syncHistoricalData(dataCount);

        // 7. Clean historical data after successful sync (as per yoihealth)
        console.log("Cleaning Historical Data");
        await this.cleanHistoricalDataOnDevice();
      }
      this.updateSyncStatus({ syncProgress: 80 });

      // 8. Don't start real-time monitoring automatically - let user control it
      // await this.startRealTimeMonitoring();
      this.updateSyncStatus({ syncProgress: 90 });

      // 9. Process and save data
      await this.processCollectedData();
      this.updateSyncStatus({ syncProgress: 100 });

      // Update last sync time
      healthDataStorage.updateLastSyncTime();

      console.log('✅ Health data sync completed successfully');
      this.updateSyncStatus({
        isSyncing: false,
        lastSyncTime: Date.now(),
        syncProgress: 100,
        syncError: undefined
      });

    } catch (error) {
      console.error('❌ Health data sync failed:', error);
      this.updateSyncStatus({
        isSyncing: false,
        syncError: error instanceof Error ? error.message : 'Sync failed',
        syncProgress: 0
      });
      throw error;
    }
  }

  /**
   * Stop health data sync
   */
  public async stopSync(): Promise<void> {
    console.log('🛑 Stopping health data sync...');

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }

    try {
      await this.stopRealTimeMonitoring();
    } catch (error) {
      console.error('Failed to stop monitoring:', error);
    }

    this.updateSyncStatus({
      isSyncing: false,
      syncProgress: 0
    });
  }

  /**
   * Trigger manual sync
   */
  public async triggerManualSync(): Promise<void> {
    console.log('🔄 Manual sync triggered');
    await this.startSync();
  }

  /**
   * Enable auto sync
   */
  public enableAutoSync(intervalMinutes: number = 30): void {
    console.log(`⏰ Enabling auto-sync every ${intervalMinutes} minutes`);

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
    }

    // Initial sync
    this.startSync().catch(console.error);

    // Set up recurring sync
    this.syncInterval = setInterval(() => {
      if (this.connectionManager.isConnected() && !this.syncStatus.isSyncing) {
        this.startSync().catch(console.error);
      }
    }, intervalMinutes * 60 * 1000);
  }

  /**
   * Disable auto sync
   */
  public disableAutoSync(): void {
    console.log('⏰ Disabling auto-sync');

    if (this.syncInterval) {
      clearInterval(this.syncInterval);
      this.syncInterval = null;
    }
  }

  /**
   * Sync device information
   */
  private async syncDeviceInfo(): Promise<void> {
    try {
      console.log('📱 Syncing device information...');

      // Get device info from store (set by SDK listeners)
      const store = useRingStore.getState();
      const deviceInfo = {
        deviceInfo1: store.deviceInfo1,
        deviceInfo2: store.deviceInfo2
      };

      if (deviceInfo.deviceInfo1 || deviceInfo.deviceInfo2) {
        // Store device info
        this.emit('deviceInfo', deviceInfo);
      }
    } catch (error) {
      console.error('Failed to sync device info:', error);
    }
  }

  /**
   * Ensure device is bound
   */
  private async ensureDeviceBound(): Promise<void> {
    try {
      console.log('🔐 Checking device binding status...');

      const store = useRingStore.getState();
      const deviceInfo2 = store.deviceInfo2;

      // Check if device is already bound
      const isBound = deviceInfo2?.bindStatus === 1 || deviceInfo2?.bindStatus === 'Bind';

      if (!isBound) {
        console.log('🔐 Device not bound, binding now...');
        await ringCommands.deviceBind();
        await new Promise(resolve => setTimeout(resolve, 1500));
      } else {
        console.log('✅ Device already bound');
      }
    } catch (error) {
      console.error('Failed to ensure device binding:', error);
    }
  }

  /**
   * Clean historical data on device after successful sync
   */
  private async cleanHistoricalDataOnDevice(): Promise<void> {
    try {
      console.log('🧾 Cleaning historical data on device...');
      await ringCommands.cleanHistoricalData();
      await new Promise(resolve => setTimeout(resolve, 500));
      console.log('✅ Device historical data cleared');
    } catch (error) {
      console.error('Failed to clean historical data:', error);
      // Don't throw - this is not critical
    }
  }

  /**
   * Sync battery status
   */
  private async syncBatteryStatus(): Promise<void> {
    try {
      console.log('🔋 Syncing battery status...');

      // Send battery command
      await ringCommands.batteryDataAndState();

      // Wait for response
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Get battery data from store (set by SDK listeners)
      const store = useRingStore.getState();
      const batteryData = store.batteryData;

      if (batteryData) {
        const battery: BatteryData = {
          batteryPer: batteryData.batteryPer,
          batteryValue: batteryData.batteryValue || 0,
          status: batteryData.status,
          timestamp: Date.now()
        };
        this.emit('battery', battery);
      }
    } catch (error) {
      console.error('Failed to sync battery status:', error);
    }
  }

  /**
   * Sync device time
   */
  private async syncTime(): Promise<void> {
    try {
      console.log('⏰ Syncing device time...');
      await ringCommands.timeSyn();
      await new Promise(resolve => setTimeout(resolve, 500));
    } catch (error) {
      console.error('Failed to sync time:', error);
    }
  }

  /**
   * Get historical data count
   */
  private async getHistoricalDataCount(): Promise<number> {
    try {
      console.log('📊 Getting historical data count...');

      // Clear any existing historical data first
      const store = useRingStore.getState();
      store.setHistoricalData([]);

      // Send command to get historical data count
      await ringCommands.historicalNum();

      // Wait longer for response (SDK needs time to process)
      await new Promise(resolve => setTimeout(resolve, 2000));

      // Get count from store
      const count = store.historicalDataCount || 0;
      console.log(`📊 Found ${count} historical records`);

      return count || 0;
    } catch (error) {
      console.error('Failed to get historical data count:', error);
      return 0;
    }
  }

  /**
   * Sync historical data
   */
  private async syncHistoricalData(totalRecords: number): Promise<void> {
    try {
      console.log(`📥 Syncing ${totalRecords} historical records...`);

      // Request all historical data at once (as per yoihealth pattern)
      await ringCommands.historicalData();

      // Wait longer for all data to be received and processed by SDK
      await new Promise(resolve => setTimeout(resolve, 5000));

      // Get received data from store
      const store = useRingStore.getState();
      const historicalData = store.historicalData || [];

      if (historicalData && historicalData.length > 0) {
        console.log(`📦 Received ${historicalData.length} historical records`);

        // Process and store data
        await this.processHistoricalData(historicalData);

        // Update progress
        this.updateSyncStatus({
          syncProgress: 70,
          syncedRecords: historicalData.length
        });

        console.log(`✅ Synced ${historicalData.length} historical records`);
      } else {
        console.log('⚠️ No historical data received');
      }
    } catch (error) {
      console.error('Failed to sync historical data:', error);
    }
  }

  /**
   * Process historical data
   */
  private async processHistoricalData(rawData: any[]): Promise<void> {
    try {
      const entries: HistoricalDataEntry[] = [];

      for (const item of rawData) {
        const entry: HistoricalDataEntry = {
          timestamp: item.timestamp || Date.now(),
          dataType: item.type || 'unknown'
        };

        // Extract specific metrics
        if (item.heartRate !== undefined) {
          entry.heartRate = item.heartRate;
        }
        if (item.oxValue !== undefined) {
          entry.oxValue = item.oxValue;
        }
        if (item.steps !== undefined) {
          entry.steps = item.steps;
        }
        if (item.temperature !== undefined) {
          entry.temperature = item.temperature;
        }
        if (item.motion !== undefined) {
          entry.motion = item.motion;
        }

        // Store raw data for debugging
        entry.rawData = item.raw || [];

        entries.push(entry);
      }

      // Save to storage
      healthDataStorage.saveHistoricalData(entries);

      // Process into specific metric types
      healthDataStorage.processHistoricalData(entries);

      // Update the store with today's step count from historical data
      const todayActivity = healthDataStorage.getTodayActivity();
      if (todayActivity && todayActivity.steps) {
        const { setSteps } = useRingStore.getState();
        setSteps(todayActivity.steps);
        console.log(`👟 Updated step count in store: ${todayActivity.steps}`);
      }

      // Also update the store with the total step count from all historical data
      const totalSteps = entries.reduce((sum, entry) => sum + (entry.steps || 0), 0);
      if (totalSteps > 0) {
        console.log(`📊 Total historical steps: ${totalSteps}`);
      }

      console.log(`📊 Processed ${entries.length} historical entries`);
    } catch (error) {
      console.error('Failed to process historical data:', error);
    }
  }

  /**
   * Start real-time health monitoring (PUBLIC - for user control)
   */
  public async startRealTimeMonitoring(): Promise<void> {
    try {
      console.log('🎯 Starting real-time health monitoring...');

      // Start comprehensive health monitoring
      await ringCommands.healthMonitoring();

      // Listen for real-time data
      this.setupRealTimeListeners();

      console.log('✅ Real-time monitoring started');
    } catch (error) {
      console.error('Failed to start real-time monitoring:', error);
    }
  }

  /**
   * Stop real-time health monitoring (PUBLIC - for user control)
   */
  public async stopRealTimeMonitoring(): Promise<void> {
    try {
      console.log('🛑 Stopping real-time health monitoring...');

      // Stop health monitoring
      await ringCommands.closeHealth();
      await ringCommands.closeSingleHealth();

      console.log('✅ Real-time monitoring stopped');
    } catch (error) {
      console.error('Failed to stop real-time monitoring:', error);
    }
  }

  /**
   * Setup real-time data listeners
   */
  private setupRealTimeListeners(): void {
    // Real-time data is handled through SDK listeners registered in constructor
    // The SDK listeners are already set up in registerEventListeners()
    // They handle:
    // - Health data (heart rate, oxygen) via registerHealthListener
    // - Step data via registerStepListener
    // - Temperature data via registerTemperatureListener

    console.log('✅ Real-time listeners are active through SDK');
  }

  /**
   * Process all collected data
   */
  private async processCollectedData(): Promise<void> {
    try {
      console.log('🔄 Processing collected data...');

      // Generate daily summaries
      await this.generateDailySummaries();

      // Clean up old data
      healthDataStorage.cleanupOldData(30);

      console.log('✅ Data processing completed');
    } catch (error) {
      console.error('Failed to process collected data:', error);
    }
  }

  /**
   * Generate daily summaries
   */
  private async generateDailySummaries(): Promise<void> {
    const today = new Date().toISOString().split('T')[0];
    const heartRates = healthDataStorage.getHeartRateHistory();
    const oxygen = healthDataStorage.getBloodOxygenHistory();
    const temperature = healthDataStorage.getTemperatureHistory();
    const activity = healthDataStorage.getTodayActivity();

    // Calculate averages and ranges for today
    const todayHeartRates = heartRates.filter(hr => {
      const date = new Date(hr.timestamp).toISOString().split('T')[0];
      return date === today;
    });

    const todayOxygen = oxygen.filter(ox => {
      const date = new Date(ox.timestamp).toISOString().split('T')[0];
      return date === today;
    });

    const todayTemperature = temperature.filter(temp => {
      const date = new Date(temp.timestamp).toISOString().split('T')[0];
      return date === today;
    });

    // Create summary
    const summary: any = {
      date: today
    };

    // Heart rate summary
    if (todayHeartRates.length > 0) {
      const hrValues = todayHeartRates.map(hr => hr.heartRate);
      summary.avgHeartRate = Math.round(hrValues.reduce((a, b) => a + b, 0) / hrValues.length);
      summary.minHeartRate = Math.min(...hrValues);
      summary.maxHeartRate = Math.max(...hrValues);
    }

    // Oxygen summary
    if (todayOxygen.length > 0) {
      const oxValues = todayOxygen.map(ox => ox.oxValue);
      summary.avgOxygen = Math.round(oxValues.reduce((a, b) => a + b, 0) / oxValues.length);
      summary.minOxygen = Math.min(...oxValues);
      summary.maxOxygen = Math.max(...oxValues);
    }

    // Temperature summary
    if (todayTemperature.length > 0) {
      const tempValues = todayTemperature.map(temp => temp.temperature);
      summary.avgTemperature = tempValues.reduce((a, b) => a + b, 0) / tempValues.length;
      summary.minTemperature = Math.min(...tempValues);
      summary.maxTemperature = Math.max(...tempValues);
    }

    // Activity summary
    if (activity) {
      summary.totalSteps = activity.steps;
      summary.activeMinutes = activity.activeMinutes;
      summary.calories = activity.calories;
    }

    // Save summary
    healthDataStorage.saveDailySummary(summary);
  }

  /**
   * Update sync status
   */
  private updateSyncStatus(updates: Partial<HealthSyncStatus>): void {
    this.syncStatus = {
      ...this.syncStatus,
      ...updates
    };
    this.emit('syncStatus', this.syncStatus);
  }

  /**
   * Get current sync status
   */
  public getSyncStatus(): HealthSyncStatus {
    return this.syncStatus;
  }


  /**
   * Fetch current step count from ring
   */
  public async fetchCurrentStepCount(): Promise<void> {
    try {
      console.log('👟 Fetching current step count...');

      // Check connection
      if (!this.connectionManager.isConnected()) {
        throw new Error('Ring device not connected');
      }

      // Request step count
      await ringCommands.getSteps();

      // The step listener will handle the response
      // Wait a bit for the response
      await new Promise(resolve => setTimeout(resolve, 2000));

      console.log('✅ Step count request sent');
    } catch (error) {
      console.error('Failed to fetch step count:', error);
    }
  }

  /**
   * Get health dashboard data
   */
  public getHealthDashboard() {
    return healthDataStorage.getHealthDashboard();
  }

  // Event handling

  /**
   * Add event listener
   */
  public on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event)?.push(callback);
  }

  /**
   * Remove event listener
   */
  public off(event: string, callback: Function): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      const index = callbacks.indexOf(callback);
      if (index >= 0) {
        callbacks.splice(index, 1);
      }
    }
  }

  /**
   * Emit event
   */
  private emit(event: string, data?: any): void {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach(callback => callback(data));
    }
  }
}

// Export singleton instance
export const healthDataSyncService = HealthDataSyncService.getInstance();