/**
 * Health Metrics Processing Utilities
 * Ported from YoiHealth project for SmartRing X1 connectivity
 */

import { RingSDK } from '../../sdk/ringSDK';
import { IHistorical, HealthData, SleepData } from '../../../types/ring';
import { formatDateTime } from '../formatters/timeFormatters';

/**
 * Health Metrics Processor Class
 * Processes raw Ring data into meaningful health insights
 */
export class HealthMetricsProcessor {
  private ringSDK: RingSDK;

  constructor() {
    this.ringSDK = RingSDK.getInstance();
  }

  /**
   * Process raw historical data into structured health data
   * @param rawData - Raw sensor data from Ring
   * @returns Processed historical data array
   */
  public processHistoricalData(rawData: any[]): IHistorical[] {
    try {
      if (!rawData || rawData.length === 0) {
        return [];
      }

      return this.ringSDK.processHistoryData(rawData);
    } catch (error) {
      console.error('Error processing historical data:', error);
      return [];
    }
  }

  /**
   * Calculate sleep metrics from historical data
   * @param historicalData - Array of historical health data points
   * @returns Array of sleep analysis data
   */
  public calculateSleepMetrics(historicalData: IHistorical[]): SleepData[] {
    try {
      if (!historicalData || historicalData.length === 0) {
        return [];
      }

      const sleepTimeArray = this.ringSDK.calcSleepTime(historicalData);
      
      // Format sleep data with readable timestamps
      return sleepTimeArray.map(sleep => ({
        ...sleep,
        startTime: formatDateTime(sleep.sleepTimePeriod?.startTime || 0),
        endTime: formatDateTime(sleep.sleepTimePeriod?.endTime || 0),
      }));
    } catch (error) {
      console.error('Error calculating sleep metrics:', error);
      return [];
    }
  }

  /**
   * Calculate respiratory rate from sleep data
   * @param sleepData - Sleep analysis data
   * @returns Average respiratory rate
   */
  public calculateRespiratoryRate(sleepData: SleepData[]): number {
    try {
      if (!sleepData || sleepData.length === 0) {
        return 0;
      }

      return this.ringSDK.calcRespiratoryRate(sleepData);
    } catch (error) {
      console.error('Error calculating respiratory rate:', error);
      return 0;
    }
  }

  /**
   * Get oxygen saturation from sleep data
   * @param sleepData - Sleep analysis data
   * @returns Average blood oxygen saturation percentage
   */
  public getOxygenSaturation(sleepData: SleepData[]): number {
    try {
      if (!sleepData || sleepData.length === 0) {
        return 0;
      }

      return this.ringSDK.getOxygenSaturation(sleepData);
    } catch (error) {
      console.error('Error calculating oxygen saturation:', error);
      return 0;
    }
  }

  /**
   * Calculate resting heart rate from historical data
   * @param historicalData - Historical health data
   * @returns Resting heart rate value
   */
  public calculateRestingHeartRate(historicalData: IHistorical[]): number {
    try {
      if (!historicalData || historicalData.length === 0) {
        return 0;
      }

      // Extract heart rate values
      const heartRateValues = historicalData
        .map(data => data.heartRate)
        .filter(hr => hr > 0 && hr < 200); // Filter valid heart rate values

      if (heartRateValues.length === 0) {
        return 0;
      }

      return this.ringSDK.calcRestingHeartRate(heartRateValues);
    } catch (error) {
      console.error('Error calculating resting heart rate:', error);
      return 0;
    }
  }

  /**
   * Calculate heart rate variability metrics
   * @param historicalData - Historical health data
   * @returns HRV immersion value
   */
  public calculateHeartRateVariability(historicalData: IHistorical[]): number {
    try {
      if (!historicalData || historicalData.length === 0) {
        return 0;
      }

      return this.ringSDK.calcHeartRateImmersion(historicalData);
    } catch (error) {
      console.error('Error calculating HRV:', error);
      return 0;
    }
  }

  /**
   * Calculate daily activity metrics
   * @param historicalData - Historical health data for a day
   * @returns Daily activity summary
   */
  public calculateDailyActivity(historicalData: IHistorical[]): {
    totalSteps: number;
    avgHeartRate: number;
    maxHeartRate: number;
    minHeartRate: number;
    avgTemperature: number;
    activeTime: number; // in minutes
    avgOxygen: number;
  } {
    try {
      if (!historicalData || historicalData.length === 0) {
        return {
          totalSteps: 0,
          avgHeartRate: 0,
          maxHeartRate: 0,
          minHeartRate: 0,
          avgTemperature: 0,
          activeTime: 0,
          avgOxygen: 0,
        };
      }

      const validHeartRates = historicalData
        .map(d => d.heartRate)
        .filter(hr => hr > 0 && hr < 200);

      const validTemperatures = historicalData
        .map(d => d.temperature)
        .filter(temp => temp > 0);

      const validOxygenLevels = historicalData
        .map(d => d.ox)
        .filter(ox => ox > 0 && ox <= 100);

      const totalSteps = historicalData.reduce((sum, data) => sum + (data.step || 0), 0);
      
      const avgHeartRate = validHeartRates.length > 0 
        ? validHeartRates.reduce((sum, hr) => sum + hr, 0) / validHeartRates.length
        : 0;

      const maxHeartRate = validHeartRates.length > 0 ? Math.max(...validHeartRates) : 0;
      const minHeartRate = validHeartRates.length > 0 ? Math.min(...validHeartRates) : 0;

      const avgTemperature = validTemperatures.length > 0
        ? validTemperatures.reduce((sum, temp) => sum + temp, 0) / validTemperatures.length
        : 0;

      const avgOxygen = validOxygenLevels.length > 0
        ? validOxygenLevels.reduce((sum, ox) => sum + ox, 0) / validOxygenLevels.length
        : 0;

      // Calculate active time based on motion detection
      const activeTime = historicalData.filter(d => d.motionDetectionCount > 0).length * 5; // Assuming 5-minute intervals

      return {
        totalSteps: Math.round(totalSteps),
        avgHeartRate: Math.round(avgHeartRate),
        maxHeartRate,
        minHeartRate,
        avgTemperature: Math.round(avgTemperature * 100) / 100,
        activeTime,
        avgOxygen: Math.round(avgOxygen),
      };
    } catch (error) {
      console.error('Error calculating daily activity:', error);
      return {
        totalSteps: 0,
        avgHeartRate: 0,
        maxHeartRate: 0,
        minHeartRate: 0,
        avgTemperature: 0,
        activeTime: 0,
        avgOxygen: 0,
      };
    }
  }

  /**
   * Calculate sleep quality score
   * @param sleepData - Sleep analysis data
   * @returns Sleep quality score (0-100)
   */
  public calculateSleepScore(sleepData: SleepData[]): number {
    try {
      if (!sleepData || sleepData.length === 0) {
        return 0;
      }

      const latestSleep = sleepData[sleepData.length - 1];
      if (!latestSleep) return 0;

      const totalSleep = latestSleep.deepSleep + latestSleep.lightTime + latestSleep.remTime;
      const deepSleepRatio = latestSleep.deepSleep / totalSleep;
      const remSleepRatio = latestSleep.remTime / totalSleep;
      const wakeRatio = latestSleep.wakeTime / totalSleep;

      // Simple scoring algorithm (can be enhanced)
      let score = 100;
      
      // Penalize too little total sleep (less than 6 hours)
      if (totalSleep < 360) {
        score -= (360 - totalSleep) / 360 * 30;
      }
      
      // Reward good deep sleep ratio (15-25% is optimal)
      if (deepSleepRatio < 0.15) {
        score -= (0.15 - deepSleepRatio) * 100;
      } else if (deepSleepRatio > 0.25) {
        score -= (deepSleepRatio - 0.25) * 100;
      }
      
      // Penalize excessive wake time during sleep
      if (wakeRatio > 0.1) {
        score -= (wakeRatio - 0.1) * 200;
      }

      return Math.max(0, Math.min(100, Math.round(score)));
    } catch (error) {
      console.error('Error calculating sleep score:', error);
      return 0;
    }
  }

  /**
   * Detect health anomalies in the data
   * @param historicalData - Historical health data
   * @returns Array of detected anomalies
   */
  public detectHealthAnomalies(historicalData: IHistorical[]): Array<{
    type: 'high_heart_rate' | 'low_heart_rate' | 'high_temperature' | 'low_oxygen';
    value: number;
    timestamp: number;
    severity: 'low' | 'medium' | 'high';
  }> {
    const anomalies: Array<{
      type: 'high_heart_rate' | 'low_heart_rate' | 'high_temperature' | 'low_oxygen';
      value: number;
      timestamp: number;
      severity: 'low' | 'medium' | 'high';
    }> = [];

    for (const data of historicalData) {
      // High heart rate detection
      if (data.heartRate > 120) {
        anomalies.push({
          type: 'high_heart_rate',
          value: data.heartRate,
          timestamp: data.timeStamp,
          severity: data.heartRate > 150 ? 'high' : data.heartRate > 135 ? 'medium' : 'low',
        });
      }

      // Low heart rate detection
      if (data.heartRate > 0 && data.heartRate < 50) {
        anomalies.push({
          type: 'low_heart_rate',
          value: data.heartRate,
          timestamp: data.timeStamp,
          severity: data.heartRate < 40 ? 'high' : 'medium',
        });
      }

      // High temperature detection (assuming Celsius)
      if (data.temperature > 37.5) {
        anomalies.push({
          type: 'high_temperature',
          value: data.temperature,
          timestamp: data.timeStamp,
          severity: data.temperature > 38.5 ? 'high' : data.temperature > 38 ? 'medium' : 'low',
        });
      }

      // Low oxygen detection
      if (data.ox > 0 && data.ox < 90) {
        anomalies.push({
          type: 'low_oxygen',
          value: data.ox,
          timestamp: data.timeStamp,
          severity: data.ox < 85 ? 'high' : data.ox < 88 ? 'medium' : 'low',
        });
      }
    }

    return anomalies;
  }
}

// Export singleton instance
export const healthMetricsProcessor = new HealthMetricsProcessor();