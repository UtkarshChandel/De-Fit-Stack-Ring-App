/**
 * Ring SDK TypeScript Wrapper
 * Provides type-safe interface for the obfuscated Ring SDK
 */

// Import the obfuscated SDK
// @ts-ignore - Obfuscated SDK doesn't have type definitions
import { IHistorical, RingCommand, SleepData } from '../../types/ring';
import SDK from './ringSDK_Bonatra.js';

/**
 * Ring SDK Wrapper Class
 * Provides TypeScript interface for the obfuscated Ring SDK
 */
export class RingSDK {
  private static instance: RingSDK;
  private sdk: any;

  private constructor() {
    this.sdk = SDK;
  }

  /**
   * Get singleton instance of Ring SDK
   */
  public static getInstance(): RingSDK {
    if (!RingSDK.instance) {
      console.log('🔐 Creating new RingSDK instance');
      RingSDK.instance = new RingSDK();
    }
    return RingSDK.instance;
  }

  /**
   * Start command detection and generate command data
   * @param command - Ring command to execute
   * @param data - Optional command data/parameters
   * @returns Uint8Array command data to send via BLE
   */
  public startDetect(command: RingCommand, data?: any): Uint8Array {
    try {
      const result = this.sdk.startDetect(command, data);
      return new Uint8Array(result);
    } catch (error) {
      console.error('Ring SDK startDetect error:', error);
      throw new Error(`Failed to generate command data for: ${command}`);
    }
  }

  /**
   * Calculate sleep time analysis from historical data
   * @param historicalData - Array of historical health data points
   * @returns Array of sleep analysis data
   */
  public calcSleepTime(historicalData: IHistorical[]): SleepData[] {
    try {
      if (!historicalData || historicalData.length === 0) {
        return [];
      }
      return this.sdk.calcSleepTime(historicalData);
    } catch (error) {
      console.error('Ring SDK calcSleepTime error:', error);
      throw new Error('Failed to calculate sleep time from historical data');
    }
  }

  /**
   * Calculate respiratory rate from sleep data
   * @param sleepData - Sleep analysis data
   * @returns Respiratory rate value
   */
  public calcRespiratoryRate(sleepData: SleepData[]): number {
    try {
      return this.sdk.calcRespiratoryRate(sleepData);
    } catch (error) {
      console.error('Ring SDK calcRespiratoryRate error:', error);
      return 0;
    }
  }

  /**
   * Get oxygen saturation from sleep data
   * @param sleepData - Sleep analysis data
   * @returns Blood oxygen saturation percentage
   */
  public getOxygenSaturation(sleepData: SleepData[]): number {
    try {
      return this.sdk.getOxygenSaturation(sleepData);
    } catch (error) {
      console.error('Ring SDK getOxygenSaturation error:', error);
      return 0;
    }
  }

  /**
   * Calculate resting heart rate from heart rate data
   * @param heartData - Heart rate data array
   * @returns Resting heart rate value
   */
  public calcRestingHeartRate(heartData: number[]): number {
    try {
      return this.sdk.calcRestingHeartRate(heartData);
    } catch (error) {
      console.error('Ring SDK calcRestingHeartRate error:', error);
      return 0;
    }
  }

  /**
   * Calculate heart rate variability immersion
   * @param data - Health data for HRV calculation
   * @returns HRV immersion value
   */
  public calcHeartRateImmersion(data: IHistorical[]): number {
    try {
      return this.sdk.calcHeartRateImmersion(data);
    } catch (error) {
      console.error('Ring SDK calcHeartRateImmersion error:', error);
      return 0;
    }
  }

  /**
   * Process raw historical data
   * @param rawData - Raw sensor data from ring
   * @returns Processed historical data array
   */
  public processHistoryData(rawData: any[]): IHistorical[] {
    try {
      return this.sdk.processHistoryData(rawData);
    } catch (error) {
      console.error('Ring SDK processHistoryData error:', error);
      return [];
    }
  }

  /**
   * Check if SDK is available and functional
   * @returns true if SDK is available
   */
  public isAvailable(): boolean {
    try {
      return this.sdk && typeof this.sdk.startDetect === 'function';
    } catch (error) {
      console.error('Ring SDK availability check failed:', error);
      return false;
    }
  }

  /**
   * Get SDK version information (if available)
   * @returns SDK version string or null
   */
  public getVersion(): string | null {
    try {
      return this.sdk.version || null;
    } catch (error) {
      return null;
    }
  }

  /**
   * Parse BLE notification data
   * @param data - Raw BLE notification data
   * @returns Parsed data object
   */
  public parseNotificationData(data: number[]): any {
    try {
      return this.sdk.parseData ? this.sdk.parseData(data) : null;
    } catch (error) {
      console.error('Ring SDK parseNotificationData error:', error);
      return null;
    }
  }

  // ===== MANUFACTURER REFERENCE METHODS =====

  /**
   * Get JavaScript SDK version (manufacturer pattern)
   * @returns SDK version string
   */
  public getJSVersion(): string {
    try {
      return this.sdk.getJSVersion ? this.sdk.getJSVersion() : 'Unknown';
    } catch (error) {
      console.error('Ring SDK getJSVersion error:', error);
      return 'Error';
    }
  }

  /**
   * Calculate battery percentage (manufacturer pattern)
   * @param batteryValue - Raw battery voltage value
   * @param charging - Is device charging
   * @param isWireless - Is wireless charging
   * @returns Battery percentage (0-100)
   */
  public calcBattery(batteryValue: number, charging: boolean, isWireless: boolean): number {
    try {
      return this.sdk.calcBattery ? this.sdk.calcBattery(batteryValue, charging, isWireless) : 0;
    } catch (error) {
      console.error('Ring SDK calcBattery error:', error);
      return 0;
    }
  }

  /**
   * Start OEM verification process (manufacturer pattern)
   * @param callback - Callback function for sending OEM commands
   */
  public startOEMVerify(callback: (cmd: string, data: any) => void): void {
    try {
      if (this.sdk.startOEMVerify) {
        this.sdk.startOEMVerify(callback);
      } else {
        console.warn('startOEMVerify not available in SDK');
      }
    } catch (error) {
      console.error('Ring SDK startOEMVerify error:', error);
    }
  }

  /**
   * MANUFACTURER FIX: Feed raw BLE notification data to SDK for processing
   * This is CRITICAL - without this, Ring will disconnect!
   * @param rawData - Raw notification data from BLE characteristic
   */
  public pushRawData(rawData: number[]): void {
    try {
      console.log('🔄 Feeding data to SDK for processing:', rawData.length, 'bytes');

      if (this.sdk.pushRawData) {
        this.sdk.pushRawData(new Uint8Array(rawData));
        console.log('✅ Data successfully fed to SDK');
      } else if (this.sdk.receiveData) {
        this.sdk.receiveData(new Uint8Array(rawData));
        console.log('✅ Data successfully fed to SDK (receiveData)');
      } else if (this.sdk.processData) {
        this.sdk.processData(new Uint8Array(rawData));
        console.log('✅ Data successfully fed to SDK (processData)');
      } else {
        console.warn('⚠️ SDK data processing method not found - trying manual trigger');
        // Fallback: try to trigger SDK processing manually
        this.triggerSDKProcessing(rawData);
      }
    } catch (error) {
      console.error('❌ Failed to feed data to SDK:', error);
    }
  }

  /**
   * Fallback method to trigger SDK processing when direct methods aren't available
   */
  private triggerSDKProcessing(data: number[]): void {
    try {
      // Try common SDK processing method names
      const possibleMethods = ['handleData', 'onData', 'processNotification', 'handleNotification'];

      for (const method of possibleMethods) {
        if (this.sdk[method]) {
          console.log(`🔧 Using SDK method: ${method}`);
          this.sdk[method](new Uint8Array(data));
          return;
        }
      }

      console.warn('⚠️ No SDK processing method found - data may not be processed properly');
    } catch (error) {
      console.error('❌ SDK processing fallback failed:', error);
    }
  }

  // ===== SDK LISTENER REGISTRATION METHODS =====

  /**
   * Register battery data and state listener (manufacturer pattern)
   */
  public registerBatteryDataAndStateListener(listener: { onResult: (data: any) => void }): void {
    try {
      if (this.sdk.registerBatteryDataAndStateListener) {
        this.sdk.registerBatteryDataAndStateListener(listener);
        console.log('✅ Battery listener registered');
      } else {
        console.warn('⚠️ registerBatteryDataAndStateListener not available in SDK');
      }
    } catch (error) {
      console.error('Ring SDK registerBatteryDataAndStateListener error:', error);
    }
  }

  /**
   * Register device info 1 listener (manufacturer pattern)
   */
  public registerDeviceInfo1Listener(listener: { onResult: (data: any) => void }): void {
    try {
      console.log('🔍 Attempting to register Device Info 1 listener...');
      console.log('SDK has method?', typeof this.sdk.registerDeviceInfo1Listener);
      
      if (this.sdk.registerDeviceInfo1Listener) {
        this.sdk.registerDeviceInfo1Listener(listener);
        console.log('✅ Device Info 1 listener registered successfully');
      } else {
        console.warn('⚠️ registerDeviceInfo1Listener not available in SDK');
        // Try alternative names
        if (this.sdk.setDeviceInfo1Listener) {
          console.log('📱 Using setDeviceInfo1Listener instead');
          this.sdk.setDeviceInfo1Listener(listener);
        }
      }
    } catch (error) {
      console.error('Ring SDK registerDeviceInfo1Listener error:', error);
    }
  }

  /**
   * Register device info 2 listener (manufacturer pattern)
   */
  public registerDeviceInfo2Listener(listener: { onResult: (data: any) => void }): void {
    try {
      console.log('🔍 Attempting to register Device Info 2 listener...');
      console.log('SDK has method?', typeof this.sdk.registerDeviceInfo2Listener);
      
      if (this.sdk.registerDeviceInfo2Listener) {
        this.sdk.registerDeviceInfo2Listener(listener);
        console.log('✅ Device Info 2 listener registered successfully');
      } else {
        console.warn('⚠️ registerDeviceInfo2Listener not available in SDK');
        // Try alternative names
        if (this.sdk.setDeviceInfo2Listener) {
          console.log('📱 Using setDeviceInfo2Listener instead');
          this.sdk.setDeviceInfo2Listener(listener);
        }
      }
    } catch (error) {
      console.error('Ring SDK registerDeviceInfo2Listener error:', error);
    }
  }

  /**
   * Register health listener (manufacturer pattern)
   */
  public registerHealthListener(listener: { onResult: (data: any) => void }): void {
    try {
      if (this.sdk.registerHealthListener) {
        this.sdk.registerHealthListener(listener);
        console.log('✅ Health listener registered');
      } else {
        console.warn('⚠️ registerHealthListener not available in SDK');
      }
    } catch (error) {
      console.error('Ring SDK registerHealthListener error:', error);
    }
  }

  /**
   * Register temperature listener (manufacturer pattern)
   */
  public registerTemperatureListener(listener: { onResult: (data: any) => void }): void {
    try {
      if (this.sdk.registerTemperatureListener) {
        this.sdk.registerTemperatureListener(listener);
        console.log('✅ Temperature listener registered');
      } else {
        console.warn('⚠️ registerTemperatureListener not available in SDK');
      }
    } catch (error) {
      console.error('Ring SDK registerTemperatureListener error:', error);
    }
  }

  /**
   * Register step listener (manufacturer pattern)
   */
  public registerStepListener(listener: { onResult: (data: any) => void }): void {
    try {
      if (this.sdk.registerStepListener) {
        this.sdk.registerStepListener(listener);
        console.log('✅ Step listener registered');
      } else {
        console.warn('⚠️ registerStepListener not available in SDK');
      }
    } catch (error) {
      console.error('Ring SDK registerStepListener error:', error);
    }
  }

  /**
   * Register re-package listener (manufacturer pattern)
   * Handles command response acknowledgments
   */
  public registerRePackageListener(listener: { onResult: (data: any) => void }): void {
    try {
      if (this.sdk.registerRePackageListener) {
        this.sdk.registerRePackageListener(listener);
        console.log('✅ RePackage listener registered');
      } else {
        console.warn('⚠️ registerRePackageListener not available in SDK');
      }
    } catch (error) {
      console.error('Ring SDK registerRePackageListener error:', error);
    }
  }

  /**
   * Register OEM result listener (manufacturer pattern)
   * Handles OEM verification results
   */
  public registerOEMResultListener(listener: { onResult: (data: any) => void }): void {
    try {
      if (this.sdk.registerOEMResultListener) {
        this.sdk.registerOEMResultListener(listener);
        console.log('✅ OEM Result listener registered');
      } else {
        console.warn('⚠️ registerOEMResultListener not available in SDK');
      }
    } catch (error) {
      console.error('Ring SDK registerOEMResultListener error:', error);
    }
  }

  /**
   * Register historical data listener (manufacturer pattern)
   */
  public registerHistoricalDataListener(listener: { onResult: (data: any) => void }): void {
    try {
      if (this.sdk.registerHistoricalDataListener) {
        this.sdk.registerHistoricalDataListener(listener);
        console.log('✅ Historical Data listener registered');
      } else {
        console.warn('⚠️ registerHistoricalDataListener not available in SDK');
      }
    } catch (error) {
      console.error('Ring SDK registerHistoricalDataListener error:', error);
    }
  }

  /**
   * Register historical number listener (manufacturer pattern)
   */
  public registerHistoricalNumListener(listener: { onResult: (data: any) => void }): void {
    try {
      if (this.sdk.registerHistoricalNumListener) {
        this.sdk.registerHistoricalNumListener(listener);
        console.log('✅ Historical Num listener registered');
      } else {
        console.warn('⚠️ registerHistoricalNumListener not available in SDK');
      }
    } catch (error) {
      console.error('Ring SDK registerHistoricalNumListener error:', error);
    }
  }

  // ===== UNREGISTER METHODS =====

  /**
   * Unregister health listener
   */
  public unregisterHealthListener(): void {
    try {
      if (this.sdk.unregisterHealthListener) {
        this.sdk.unregisterHealthListener();
        console.log('✅ Health listener unregistered');
      }
    } catch (error) {
      console.error('Ring SDK unregisterHealthListener error:', error);
    }
  }

  /**
   * Unregister temperature listener
   */
  public unregisterTemperatureListener(): void {
    try {
      if (this.sdk.unregisterTemperatureListener) {
        this.sdk.unregisterTemperatureListener();
        console.log('✅ Temperature listener unregistered');
      }
    } catch (error) {
      console.error('Ring SDK unregisterTemperatureListener error:', error);
    }
  }

  /**
   * Unregister all listeners (manufacturer pattern)
   */
  public unregisterAllListeners(): void {
    try {
      this.sdk.unregisterHealthListener?.();
      this.sdk.unregisterBatteryDataAndStateListener?.();
      this.sdk.unregisterDeviceInfo1Listener?.();
      this.sdk.unregisterDeviceInfo2Listener?.();
      this.sdk.unregisterHistoricalDataListener?.();
      this.sdk.unregisterHistoricalNumListener?.();
      this.sdk.unregisterStepListener?.();
      this.sdk.unregisterTemperatureListener?.();
      this.sdk.unregisterRePackageListener?.();
      this.sdk.unregisterOEMResultListener?.();
      console.log('✅ All SDK listeners unregistered');
    } catch (error) {
      console.error('Ring SDK unregisterAllListeners error:', error);
    }
  }

  // ===== DATA COLLECTION CONFIGURATION METHODS =====

  /**
   * Configure Ring data collection settings (experimental)
   * Following YoiHealth pattern for Ring data collection activation
   * @param config - Data collection configuration
   */
  public async setDataCollectionConfig(config: {
    samplingRate: number;
    rawWaveSwitch: number;
    startTime: number;
    endTime: number;
  }): Promise<void> {
    try {
      console.log('⚙️ Configuring Ring SDK data collection...', config);
      
      if (this.sdk.setDataCollectionConfig) {
        await this.sdk.setDataCollectionConfig(config);
        console.log('✅ Ring SDK data collection configuration set');
      } else if (this.sdk.configDataCollection) {
        await this.sdk.configDataCollection(config);
        console.log('✅ Ring SDK data collection configured (configDataCollection)');
      } else if (this.sdk.setConfig) {
        await this.sdk.setConfig('dataCollection', config);
        console.log('✅ Ring SDK data collection configured (setConfig)');
      } else {
        console.warn('⚠️ Ring SDK data collection configuration method not found');
        
        // Try to signal the SDK about data collection activation
        if (this.sdk.enableDataCollection) {
          await this.sdk.enableDataCollection(true);
          console.log('✅ Ring SDK data collection enabled');
        } else {
          throw new Error('No data collection configuration method available in SDK');
        }
      }
    } catch (error) {
      console.error('Ring SDK setDataCollectionConfig error:', error);
      throw error;
    }
  }

  /**
   * Check if data collection is enabled in SDK
   * @returns boolean - true if data collection is enabled
   */
  public isDataCollectionEnabled(): boolean {
    try {
      if (this.sdk.isDataCollectionEnabled) {
        return this.sdk.isDataCollectionEnabled();
      } else if (this.sdk.getDataCollectionStatus) {
        return this.sdk.getDataCollectionStatus();
      } else {
        console.warn('⚠️ Cannot check data collection status - method not available');
        return false;
      }
    } catch (error) {
      console.error('Ring SDK isDataCollectionEnabled error:', error);
      return false;
    }
  }

  /**
   * Get current data collection configuration
   * @returns Configuration object or null
   */
  public getDataCollectionConfig(): any {
    try {
      if (this.sdk.getDataCollectionConfig) {
        return this.sdk.getDataCollectionConfig();
      } else if (this.sdk.getConfig) {
        return this.sdk.getConfig('dataCollection');
      } else {
        console.warn('⚠️ Cannot get data collection config - method not available');
        return null;
      }
    } catch (error) {
      console.error('Ring SDK getDataCollectionConfig error:', error);
      return null;
    }
  }
}

// Export singleton instance
export default RingSDK.getInstance();