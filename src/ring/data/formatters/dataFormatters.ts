/**
 * Data Formatting Utilities
 * Utilities for formatting Ring health data for display and analysis
 */

import { IHistorical, HealthData, IBattery, IDeviceInfo1, IDeviceInfo2 } from '../../../types/ring';
import { formatDateTime, minutesToHoursMinutes } from './timeFormatters';

/**
 * Format heart rate value for display
 * @param heartRate - Heart rate in BPM
 * @returns Formatted heart rate string
 */
export function formatHeartRate(heartRate: number): string {
  if (!heartRate || heartRate <= 0) return '--';
  return `${Math.round(heartRate)} BPM`;
}

/**
 * Format blood oxygen value for display
 * @param oxygen - Blood oxygen percentage
 * @returns Formatted oxygen string
 */
export function formatBloodOxygen(oxygen: number): string {
  if (!oxygen || oxygen <= 0) return '--%';
  return `${Math.round(oxygen)}%`;
}

/**
 * Format temperature value for display
 * @param temperature - Temperature in Celsius
 * @param unit - Temperature unit ('C' or 'F')
 * @returns Formatted temperature string
 */
export function formatTemperature(temperature: number, unit: 'C' | 'F' = 'C'): string {
  if (!temperature || temperature <= 0) return `--°${unit}`;
  
  const temp = unit === 'F' ? (temperature * 9/5) + 32 : temperature;
  return `${temp.toFixed(1)}°${unit}`;
}

/**
 * Format step count for display
 * @param steps - Step count
 * @returns Formatted steps string
 */
export function formatSteps(steps: number): string {
  if (!steps || steps < 0) return '0';
  
  if (steps >= 1000) {
    return `${(steps / 1000).toFixed(1)}K`;
  }
  
  return steps.toString();
}

/**
 * Format battery percentage for display
 * @param battery - Battery information
 * @returns Formatted battery string
 */
export function formatBatteryLevel(battery: IBattery): string {
  if (!battery || battery.batteryPer < 0) return '--%';
  return `${Math.round(battery.batteryPer)}%`;
}

/**
 * Format battery status for display
 * @param battery - Battery information
 * @returns Human readable battery status
 */
export function formatBatteryStatus(battery: IBattery): string {
  if (!battery) return 'Unknown';
  
  switch (battery.status.toLowerCase()) {
    case 'charging':
      return 'Charging';
    case 'uncharged':
      return 'Not Charging';
    default:
      return battery.status;
  }
}

/**
 * Format device color for display
 * @param colorCode - Color code from device
 * @returns Human readable color name
 */
export function formatRingColor(colorCode: number): string {
  const colors: { [key: number]: string } = {
    0: 'Silver',
    1: 'Black',
    2: 'Rose Gold',
    3: 'Gold',
  };
  
  return colors[colorCode] || 'Unknown';
}

/**
 * Format ring size for display
 * @param size - Ring size
 * @returns Formatted size string
 */
export function formatRingSize(size: number): string {
  if (!size || size <= 0) return 'Unknown';
  return `Size ${size}`;
}

/**
 * Format device information for display
 * @param deviceInfo1 - Device hardware information
 * @returns Formatted device info object
 */
export function formatDeviceInfo(deviceInfo1: IDeviceInfo1): {
  color: string;
  size: string;
  version: string;
  model: string;
  address: string;
} {
  return {
    color: formatRingColor(deviceInfo1.color),
    size: formatRingSize(deviceInfo1.size),
    version: deviceInfo1.deviceVer || 'Unknown',
    model: deviceInfo1.mainChipModel || 'SmartRing X1',
    address: deviceInfo1.bleAddress || 'Unknown',
  };
}

/**
 * Format sleep duration for display
 * @param minutes - Duration in minutes
 * @returns Formatted duration string
 */
export function formatSleepDuration(minutes: number): string {
  if (!minutes || minutes <= 0) return '0h 0m';
  return minutesToHoursMinutes(minutes);
}

/**
 * Format HRV value for display
 * @param hrv - Heart rate variability value
 * @returns Formatted HRV string
 */
export function formatHRV(hrv: number): string {
  if (!hrv || hrv <= 0) return '--';
  return `${Math.round(hrv)} ms`;
}

/**
 * Format motion detection count for display
 * @param motionCount - Motion detection count
 * @returns Formatted motion string
 */
export function formatMotionCount(motionCount: number): string {
  if (!motionCount || motionCount <= 0) return 'No Motion';
  
  if (motionCount === 1) return '1 Movement';
  return `${motionCount} Movements`;
}

/**
 * Format historical data point for display
 * @param data - Historical data point
 * @returns Formatted data object for UI display
 */
export function formatHistoricalDataPoint(data: IHistorical): {
  timestamp: string;
  time: string;
  heartRate: string;
  bloodOxygen: string;
  temperature: string;
  steps: string;
  hrv: string;
  motion: string;
  wearStatus: string;
  chargeStatus: string;
} {
  return {
    timestamp: formatDateTime(data.timeStamp),
    time: formatDateTime(data.timeStamp).split('|')[1] || '',
    heartRate: formatHeartRate(data.heartRate),
    bloodOxygen: formatBloodOxygen(data.ox),
    temperature: formatTemperature(data.temperature),
    steps: formatSteps(data.step),
    hrv: formatHRV(data.hrv),
    motion: formatMotionCount(data.motionDetectionCount),
    wearStatus: data.wearStatus || 'Unknown',
    chargeStatus: data.chargeStatus || 'Unknown',
  };
}

/**
 * Format health data summary for dashboard display
 * @param data - Health data summary
 * @returns Formatted dashboard data
 */
export function formatDashboardData(data: {
  totalSteps: number;
  avgHeartRate: number;
  maxHeartRate: number;
  avgTemperature: number;
  avgOxygen: number;
  batteryLevel: number;
  lastSync: string;
}): {
  steps: { value: string; label: string };
  heartRate: { value: string; label: string };
  temperature: { value: string; label: string };
  oxygen: { value: string; label: string };
  battery: { value: string; label: string };
  lastSync: { value: string; label: string };
} {
  return {
    steps: {
      value: formatSteps(data.totalSteps),
      label: 'Steps Today',
    },
    heartRate: {
      value: formatHeartRate(data.avgHeartRate),
      label: `Max: ${formatHeartRate(data.maxHeartRate)}`,
    },
    temperature: {
      value: formatTemperature(data.avgTemperature),
      label: 'Avg Body Temp',
    },
    oxygen: {
      value: formatBloodOxygen(data.avgOxygen),
      label: 'Blood Oxygen',
    },
    battery: {
      value: `${Math.round(data.batteryLevel)}%`,
      label: 'Ring Battery',
    },
    lastSync: {
      value: data.lastSync,
      label: 'Last Sync',
    },
  };
}

/**
 * Format data range for charts and graphs
 * @param values - Array of numeric values
 * @returns Formatted range object
 */
export function formatDataRange(values: number[]): {
  min: number;
  max: number;
  avg: number;
  range: string;
} {
  if (!values || values.length === 0) {
    return { min: 0, max: 0, avg: 0, range: '0-0' };
  }

  const validValues = values.filter(v => v > 0);
  if (validValues.length === 0) {
    return { min: 0, max: 0, avg: 0, range: '0-0' };
  }

  const min = Math.min(...validValues);
  const max = Math.max(...validValues);
  const avg = validValues.reduce((sum, v) => sum + v, 0) / validValues.length;

  return {
    min: Math.round(min),
    max: Math.round(max),
    avg: Math.round(avg),
    range: `${Math.round(min)}-${Math.round(max)}`,
  };
}

/**
 * Format percentage value for display
 * @param value - Numeric value
 * @param total - Total value for percentage calculation
 * @returns Formatted percentage string
 */
export function formatPercentage(value: number, total: number): string {
  if (!total || total <= 0) return '0%';
  
  const percentage = (value / total) * 100;
  return `${Math.round(percentage)}%`;
}

/**
 * Sanitize and validate health data values
 * @param data - Raw health data
 * @returns Sanitized health data with valid ranges
 */
export function sanitizeHealthData(data: Partial<HealthData>): HealthData {
  return {
    heartRate: Math.max(0, Math.min(250, data.heartRate || 0)),
    oxValue: Math.max(0, Math.min(100, data.oxValue || 0)),
    steps: Math.max(0, data.steps || 0),
    temperature: Math.max(0, Math.min(50, data.temperature || 0)),
    hrv: Math.max(0, Math.min(1000, data.hrv || 0)),
    motion: Math.max(0, data.motion || 0),
    timestamp: data.timestamp || Date.now(),
  };
}