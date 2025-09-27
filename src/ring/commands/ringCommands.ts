/**
 * Ring Commands and Device Control Functions
 * Ported from YoiHealth project for SmartRing X1 connectivity
 */

import { RingCommand } from '../../types/ring';
import { ringBleModule } from '../bluetooth/BleModule';
import { RingSDK } from '../sdk/ringSDK';

/**
 * Ring Commands Class
 * Provides high-level interface for all Ring device operations
 */
export class RingCommands {
  private ringSDK: RingSDK;

  constructor() {
    this.ringSDK = RingSDK.getInstance();
  }

  /**
   * Send command to Ring device (for OEM verification and SDK callbacks)
   * @param cmd - Command string or RingCommand  
   * @param data - Optional command data
   * @returns Promise<void>
   */
  public async sendCommand(cmd: string | RingCommand, data?: any): Promise<void> {
    try {
      console.log(`📤 Sending command from SDK: ${cmd}`, data);

      if (typeof cmd === 'string') {
        // Convert string command to RingCommand if needed
        const ringCommand = cmd as RingCommand;
        await this.sendData(ringCommand, data);
      } else {
        await this.sendData(cmd, data);
      }
    } catch (error) {
      console.error(`❌ Failed to send command ${cmd}:`, error);
      throw error;
    }
  }

  /**
   * Send command data to Ring device
   * Following reference implementation pattern with proper command bytes
   * @param command - Ring command to execute
   * @param data - Optional command data/parameters
   * @returns Promise<void>
   */
  private async sendData(command: RingCommand, data?: any): Promise<void> {
    try {
      // ✅ CRITICAL FIX: Skip connection check for OEM verification commands
      // The Ring is connected but BLE state might be temporarily inconsistent during OEM flow
      const isOEMCommand = ['deviceInfo2'].includes(command);
      
      if (!isOEMCommand && !ringBleModule.isConnected()) {
        throw new Error('Ring device not connected');
      }
      
      if (isOEMCommand) {
        console.log(`🔐 OEM verification command ${command} - bypassing connection check`);
      }

      console.log(`🔗 Sending Ring command: ${command}`);

      // Generate command data using Ring SDK (with proper error handling)
      let commandData: Uint8Array;

      // CRITICAL FIX: Use SDK command when available - it generates the correct protocol!
      // The Ring device expects exact SDK-generated commands, not our manual ones
      console.log('🎯 Using SDK-generated command for proper Ring protocol');

      try {
        // Try SDK first (this generates the CORRECT command!)
        // Pass data as second parameter (even if undefined) for SDK compatibility
        const sdkResult = this.ringSDK.startDetect(command, data);
        if (sdkResult && sdkResult.length > 0) {
          console.log(`✅ SDK generated command:`, Array.from(sdkResult));
          commandData = sdkResult; // ✅ USE THE SDK COMMAND!
        } else {
          console.log('⚠️ SDK returned empty/null, using manual fallback...');
          commandData = this.generateManualCommand(command);
          console.log(`🔨 Manual fallback command:`, Array.from(commandData));
        }

      } catch (sdkError) {
        console.warn(`⚠️ SDK failed for ${command}:`, sdkError);
        commandData = this.generateManualCommand(command);
        console.log(`🔨 Manual fallback command:`, Array.from(commandData));
      }

      console.log(`📤 About to write ${commandData.length} bytes to Ring...`);
      const writeStartTime = Date.now();

      await ringBleModule.write(Array.from(commandData));

      const writeEndTime = Date.now();
      console.log(`✅ Ring command sent: ${command} (${commandData.length} bytes) - Write took ${writeEndTime - writeStartTime}ms`);
    } catch (error) {
      console.error(`❌ Failed to send Ring command ${command}:`, error);
      throw error;
    }
  }

  /**
   * Generate manual command bytes when SDK fails
   * Based on reference implementation opcodes and Ring protocol
   * @param command - Ring command to execute  
   * @returns Uint8Array command data
   */
  private generateManualCommand(command: RingCommand): Uint8Array {
    // Import command opcodes
    const { RING_COMMAND_OPCODES } = require('../bluetooth/constants');

    const timestamp = Math.floor(Date.now() / 1000);

    // Ring commands are typically 20 bytes (based on BLE characteristic size)
    const COMMAND_LENGTH = 20;

    let commandBytes: number[] = [];

    switch (command) {
      case 'deviceBind':
        // Device bind command (0x15) - simplified format
        commandBytes = [
          RING_COMMAND_OPCODES.DEVICE_BIND, // 0x15
          0x01, // Sub-command or parameter
          ...this.timestampToBytes(timestamp), // 4 bytes
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Padding
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00 // More padding
        ];
        break;

      case 'timeSyn':
        // Time sync command (0x04) - with timestamp
        commandBytes = [
          RING_COMMAND_OPCODES.TIME_SYNC, // 0x04
          0x00, // Parameter
          ...this.timestampToBytes(timestamp), // 4 bytes timestamp
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Padding  
          0x00, 0x00, 0x00, 0x00 // More padding
        ];
        break;

      case 'batteryDataAndState':
        // Battery command (0x0c) - simple request
        commandBytes = [
          RING_COMMAND_OPCODES.BATTERY_DATA_STATE, // 0x0c
          0x00, // Parameter 
          ...this.timestampToBytes(timestamp), // 4 bytes
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Padding
          0x00, 0x00, 0x00, 0x00 // More padding
        ];
        break;

      case 'deviceInfo1':
        // Device info command (0x02)
        commandBytes = [
          RING_COMMAND_OPCODES.DEVICE_INFO1, // 0x02
          0x00, // Parameter
          ...this.timestampToBytes(timestamp), // 4 bytes
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Padding
          0x00, 0x00, 0x00, 0x00 // More padding
        ];
        break;

      case 'historicalNum':
        // Historical data count command - SDK should handle this
        console.log('⚠️ historicalNum should be handled by SDK');
        commandBytes = [
          0x1a, // Historical num opcode from SDK
          0x00, // Parameter
          ...this.timestampToBytes(timestamp), // 4 bytes
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Padding
          0x00, 0x00, 0x00, 0x00 // More padding
        ];
        break;

      case 'historicalData':
        // Historical data fetch command - SDK should handle this
        console.log('⚠️ historicalData should be handled by SDK');
        commandBytes = [
          0x1b, // Historical data opcode from SDK
          0x00, // Parameter
          ...this.timestampToBytes(timestamp), // 4 bytes
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Padding
          0x00, 0x00, 0x00, 0x00 // More padding
        ];
        break;

      case 'cleanHistoricalData':
        // Clean historical data command (0x11)
        commandBytes = [
          0x11, // Clean historical data opcode
          0x00, // Parameter
          ...this.timestampToBytes(timestamp), // 4 bytes
          0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, // Padding
          0x00, 0x00, 0x00, 0x00 // More padding
        ];
        break;

      default:
        console.warn(`⚠️ Unknown command: ${command}, using generic format`);
        commandBytes = [
          0x00, // Unknown opcode
          0x00,
          ...this.timestampToBytes(timestamp),
          ...Array(COMMAND_LENGTH - 6).fill(0) // Fill rest with zeros
        ];
        break;
    }

    // Ensure exactly COMMAND_LENGTH bytes
    if (commandBytes.length > COMMAND_LENGTH) {
      commandBytes = commandBytes.slice(0, COMMAND_LENGTH);
    } else if (commandBytes.length < COMMAND_LENGTH) {
      commandBytes.push(...Array(COMMAND_LENGTH - commandBytes.length).fill(0));
    }

    return new Uint8Array(commandBytes);
  }

  /**
   * Convert timestamp to byte array (4 bytes, little endian)
   * @param timestamp - Unix timestamp
   * @returns Byte array
   */
  private timestampToBytes(timestamp: number): number[] {
    return [
      timestamp & 0xFF,
      (timestamp >> 8) & 0xFF,
      (timestamp >> 16) & 0xFF,
      (timestamp >> 24) & 0xFF
    ];
  }

  // Device Control Commands

  /**
   * Power off the Ring device
   */
  public async shutDown(): Promise<void> {
    await this.sendData("shutDown");
  }

  /**
   * Reboot the Ring device
   */
  public async restart(): Promise<void> {
    await this.sendData("restart");
  }

  /**
   * Perform factory reset on the Ring device
   */
  public async restoreFactorySettings(): Promise<void> {
    await this.sendData("restoreFactorySettings");
  }

  /**
   * Bind device to user account
   */
  public async deviceBind(): Promise<void> {
    await this.sendData("deviceBind");
  }

  /**
   * Unbind device from user account
   */
  public async deviceUnBind(): Promise<void> {
    await this.sendData("deviceUnBind");
  }

  // Health Data Collection Commands

  /**
   * Start single health monitoring (heart rate only)
   */
  public async openSingleHealth(): Promise<void> {
    await this.sendData("openSingleHealth");
  }

  /**
   * Stop single health monitoring
   */
  public async closeSingleHealth(): Promise<void> {
    await this.sendData("closeSingleHealth");
  }

  /**
   * Start comprehensive health monitoring (heart rate + blood oxygen)
   */
  public async openHealth(): Promise<void> {
    await this.sendData("openHealth");
  }

  /**
   * Stop comprehensive health monitoring
   */
  public async closeHealth(): Promise<void> {
    await this.sendData("closeHealth");
  }

  /**
   * Get current step count
   */
  public async getSteps(): Promise<void> {
    await this.sendData("step");
  }

  /**
   * Get finger temperature reading
   */
  public async temperature(): Promise<void> {
    await this.sendData("temperature");
  }

  // Device Information Commands

  /**
   * Get device specifications (color, size, version)
   */
  public async deviceInfo1(): Promise<void> {
    await this.sendData("deviceInfo1");
  }

  /**
   * Get device settings and serial number
   */
  public async deviceInfo2(): Promise<void> {
    await this.sendData("deviceInfo2");
  }

  /**
   * Get battery level and charging status
   */
  public async batteryDataAndState(): Promise<void> {
    await this.sendData("batteryDataAndState");
  }

  // Historical Data Commands

  /**
   * Get number of historical data records stored on device
   */
  public async historicalNum(): Promise<void> {
    await this.sendData("historicalNum");
  }

  /**
   * Retrieve historical health data from device
   */
  public async historicalData(): Promise<void> {
    await this.sendData("historicalData");
  }

  /**
   * Clear all historical data stored on device
   */
  public async cleanHistoricalData(): Promise<void> {
    await this.sendData("cleanHistoricalData");
  }

  // Time Synchronization

  /**
   * Synchronize device time with app time
   */
  public async timeSyn(): Promise<void> {
    await this.sendData("timeSyn");
  }

  // High-level convenience methods

  /**
   * Initialize device connection and basic setup
   */
  public async initializeDevice(): Promise<void> {
    try {
      console.log('Initializing Ring device...');

      // Sync time first
      await this.timeSyn();

      // Get device information
      await this.deviceInfo1();
      await this.deviceInfo2();

      // Get battery status
      await this.batteryDataAndState();

      // Bind device if not already bound
      await this.deviceBind();

      console.log('Ring device initialization completed');
    } catch (error) {
      console.error('Failed to initialize Ring device:', error);
      throw error;
    }
  }

  /**
   * Start comprehensive health monitoring session
   */
  public async startHealthMonitoring(): Promise<void> {
    try {
      console.log('Starting health monitoring session...');

      // Start comprehensive health monitoring
      await this.openHealth();

      console.log('Health monitoring session started');
    } catch (error) {
      console.error('Failed to start health monitoring:', error);
      throw error;
    }
  }

  /**
   * Start health monitoring (alias for compatibility)
   */
  public async healthMonitoring(): Promise<void> {
    return this.openHealth();
  }

  /**
   * Stop all health monitoring
   */
  public async stopHealthMonitoring(): Promise<void> {
    try {
      console.log('Stopping health monitoring session...');

      // Stop all health monitoring
      await this.closeHealth();
      await this.closeSingleHealth();

      console.log('Health monitoring session stopped');
    } catch (error) {
      console.error('Failed to stop health monitoring:', error);
      throw error;
    }
  }

  /**
   * Perform data sync operation
   */
  public async syncData(): Promise<void> {
    try {
      console.log('Starting data sync...');

      // Get current step count
      await this.getSteps();

      // Get temperature
      await this.temperature();

      // Get battery status
      await this.batteryDataAndState();

      // Get number of historical records
      await this.historicalNum();

      // Retrieve historical data
      await this.historicalData();

      console.log('Data sync completed');
    } catch (error) {
      console.error('Failed to sync data:', error);
      throw error;
    }
  }

  /**
   * Perform device health check
   */
  public async performHealthCheck(): Promise<void> {
    try {
      console.log('Performing device health check...');

      // Check device information
      await this.deviceInfo1();
      await this.deviceInfo2();

      // Check battery status
      await this.batteryDataAndState();

      // Sync time
      await this.timeSyn();

      console.log('Device health check completed');
    } catch (error) {
      console.error('Failed to perform health check:', error);
      throw error;
    }
  }

  /**
   * Reset device to factory settings (with confirmation)
   */
  public async performFactoryReset(confirm: boolean = false): Promise<void> {
    if (!confirm) {
      throw new Error('Factory reset requires explicit confirmation');
    }

    try {
      console.log('Performing factory reset...');

      // Stop all monitoring first
      await this.stopHealthMonitoring();

      // Clear historical data
      await this.cleanHistoricalData();

      // Unbind device
      await this.deviceUnBind();

      // Perform factory reset
      await this.restoreFactorySettings();

      console.log('Factory reset completed');
    } catch (error) {
      console.error('Failed to perform factory reset:', error);
      throw error;
    }
  }

  /**
   * Check if Ring SDK is available
   */
  public isSDKAvailable(): boolean {
    return this.ringSDK.isAvailable();
  }

  /**
   * Get SDK version
   */
  public getSDKVersion(): string | null {
    return this.ringSDK.getVersion();
  }
}

// Export singleton instance
export const ringCommands = new RingCommands();