/**
 * Battery Data Processor
 * Based on reference implementation for processing Ring battery notifications
 */

import { IBattery } from '../../../types/ring';
import { RING_COMMAND_OPCODES } from '../../bluetooth/constants';

export interface BatteryProcessorResult {
    batteryData?: IBattery;
    processed: boolean;
    error?: string;
}

/**
 * Battery Data Processor Class
 * Processes battery notifications from Ring device following reference implementation
 */
export class BatteryProcessor {

    /**
     * Process battery notification data from Ring device
     * Based on reference implementation batteryDataAndStateListener
     * 
     * @param data - Raw notification data from Ring device
     * @returns BatteryProcessorResult with parsed battery info
     */
    public static processBatteryNotification(data: number[]): BatteryProcessorResult {
        try {
            console.log('🔋 Processing battery notification:', data);

            // Check if this is a battery response (opcode 0x0c)
            if (!data || data.length < 3) {
                return { processed: false, error: 'Invalid battery data length' };
            }

            const opcode = data[0];
            if (opcode !== RING_COMMAND_OPCODES.BATTERY_DATA_STATE) {
                return { processed: false, error: `Not a battery response (opcode: 0x${opcode.toString(16)})` };
            }

            // Parse battery data (following reference implementation structure)
            const batteryData = this.parseBatteryData(data);

            if (!batteryData) {
                return { processed: false, error: 'Failed to parse battery data' };
            }

            console.log('✅ Battery data processed successfully:', batteryData);

            return {
                batteryData,
                processed: true
            };

        } catch (error) {
            console.error('❌ Battery processing error:', error);
            return {
                processed: false,
                error: error instanceof Error ? error.message : 'Unknown battery processing error'
            };
        }
    }

    /**
     * Parse raw battery data into IBattery structure
     * Based on reference implementation logic
     * 
     * @param data - Raw battery notification data
     * @returns Parsed IBattery object or null
     */
    private static parseBatteryData(data: number[]): IBattery | null {
        try {
            // Reference implementation structure for battery data
            // Typical battery response format:
            // [0x0c, voltage_high, voltage_low, charging_status, ...]

            if (data.length < 4) {
                console.warn('Battery data too short:', data.length);
                return null;
            }

            // Extract battery voltage (usually 2 bytes)
            const voltageHigh = data[1];
            const voltageLow = data[2];
            const batteryValue = (voltageHigh << 8) | voltageLow; // Raw voltage in mV

            // Extract charging status
            const chargingStatus = data[3];
            const isCharging = chargingStatus === 1;

            // Calculate battery percentage from voltage
            // Reference implementation uses voltage mapping to percentage
            const batteryPer = this.calculateBatteryPercentage(batteryValue);

            const batteryInfo: IBattery = {
                batteryValue,                              // Raw voltage in mV
                batteryPer,                               // Percentage
                status: isCharging ? "charging" : "uncharged"
            };

            console.log('🔋 Parsed battery info:', {
                voltage: `${batteryValue}mV`,
                percentage: `${batteryPer}%`,
                status: batteryInfo.status
            });

            return batteryInfo;

        } catch (error) {
            console.error('Failed to parse battery data:', error);
            return null;
        }
    }

    /**
     * Calculate battery percentage from raw voltage
     * Based on typical Li-ion battery characteristics
     * 
     * @param voltageMillivolts - Raw voltage in millivolts
     * @returns Battery percentage (0-100)
     */
    private static calculateBatteryPercentage(voltageMillivolts: number): number {
        try {
            // Typical Li-ion voltage range for smart rings:
            // 3.0V (3000mV) = 0%
            // 4.2V (4200mV) = 100%

            const MIN_VOLTAGE = 3000; // 3.0V in mV
            const MAX_VOLTAGE = 4200; // 4.2V in mV

            // Clamp voltage to valid range
            const clampedVoltage = Math.max(MIN_VOLTAGE, Math.min(MAX_VOLTAGE, voltageMillivolts));

            // Calculate percentage
            const percentage = Math.round(((clampedVoltage - MIN_VOLTAGE) / (MAX_VOLTAGE - MIN_VOLTAGE)) * 100);

            // Ensure percentage is within 0-100 range
            return Math.max(0, Math.min(100, percentage));

        } catch (error) {
            console.error('Failed to calculate battery percentage:', error);
            return 0;
        }
    }

    /**
     * Check if notification data is a battery response
     * 
     * @param data - Raw notification data
     * @returns true if this is a battery notification
     */
    public static isBatteryNotification(data: number[]): boolean {
        return data && data.length >= 1 && data[0] === RING_COMMAND_OPCODES.BATTERY_DATA_STATE;
    }
}

// Export singleton instance
export const batteryProcessor = new BatteryProcessor();
