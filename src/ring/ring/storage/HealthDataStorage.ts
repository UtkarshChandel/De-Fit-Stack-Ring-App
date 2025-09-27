/**
 * Health Data Storage Service
 * Manages local storage of health metrics using MMKV
 */

import { MMKV } from 'react-native-mmkv';
import {
  HeartRateData,
  BloodOxygenData,
  SleepData,
  ActivityData,
  TemperatureData,
  StressData,
  HistoricalDataEntry,
  HealthMetricsSummary,
  HealthDashboard
} from '../../types/health';

const STORAGE_KEYS = {
  HEART_RATE: 'health.heartRate',
  BLOOD_OXYGEN: 'health.oxygen',
  SLEEP: 'health.sleep',
  ACTIVITY: 'health.activity',
  TEMPERATURE: 'health.temperature',
  STRESS: 'health.stress',
  HISTORICAL: 'health.historical',
  DASHBOARD: 'health.dashboard',
  SUMMARIES: 'health.summaries',
  LAST_SYNC: 'health.lastSync'
};

export class HealthDataStorage {
  private storage: MMKV;
  private static instance: HealthDataStorage | null = null;

  private constructor() {
    this.storage = new MMKV({
      id: 'health-data-storage'
    });
  }

  /**
   * Get singleton instance
   */
  public static getInstance(): HealthDataStorage {
    if (!HealthDataStorage.instance) {
      HealthDataStorage.instance = new HealthDataStorage();
    }
    return HealthDataStorage.instance;
  }

  // Heart Rate Data

  /**
   * Save heart rate data
   */
  public saveHeartRateData(data: HeartRateData): void {
    try {
      const existing = this.getHeartRateHistory();
      existing.push(data);

      // Keep only last 7 days of data
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const filtered = existing.filter(item => item.timestamp > sevenDaysAgo);

      this.storage.set(STORAGE_KEYS.HEART_RATE, JSON.stringify(filtered));
      console.log('💗 Heart rate data saved:', data);
    } catch (error) {
      console.error('Failed to save heart rate data:', error);
    }
  }

  /**
   * Get heart rate history
   */
  public getHeartRateHistory(): HeartRateData[] {
    try {
      const data = this.storage.getString(STORAGE_KEYS.HEART_RATE);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to get heart rate history:', error);
      return [];
    }
  }

  /**
   * Get latest heart rate
   */
  public getLatestHeartRate(): HeartRateData | null {
    const history = this.getHeartRateHistory();
    return history.length > 0 ? history[history.length - 1] : null;
  }

  // Blood Oxygen Data

  /**
   * Save blood oxygen data
   */
  public saveBloodOxygenData(data: BloodOxygenData): void {
    try {
      const existing = this.getBloodOxygenHistory();
      existing.push(data);

      // Keep only last 7 days of data
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const filtered = existing.filter(item => item.timestamp > sevenDaysAgo);

      this.storage.set(STORAGE_KEYS.BLOOD_OXYGEN, JSON.stringify(filtered));
      console.log('🫁 Blood oxygen data saved:', data);
    } catch (error) {
      console.error('Failed to save blood oxygen data:', error);
    }
  }

  /**
   * Get blood oxygen history
   */
  public getBloodOxygenHistory(): BloodOxygenData[] {
    try {
      const data = this.storage.getString(STORAGE_KEYS.BLOOD_OXYGEN);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to get blood oxygen history:', error);
      return [];
    }
  }

  /**
   * Get latest blood oxygen
   */
  public getLatestBloodOxygen(): BloodOxygenData | null {
    const history = this.getBloodOxygenHistory();
    return history.length > 0 ? history[history.length - 1] : null;
  }

  // Sleep Data

  /**
   * Save sleep data
   */
  public saveSleepData(data: SleepData): void {
    try {
      const existing = this.getSleepHistory();
      existing.push(data);

      // Keep only last 30 days of sleep data
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const filtered = existing.filter(item => item.startTime > thirtyDaysAgo);

      this.storage.set(STORAGE_KEYS.SLEEP, JSON.stringify(filtered));
      console.log('😴 Sleep data saved:', data);
    } catch (error) {
      console.error('Failed to save sleep data:', error);
    }
  }

  /**
   * Get sleep history
   */
  public getSleepHistory(): SleepData[] {
    try {
      const data = this.storage.getString(STORAGE_KEYS.SLEEP);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to get sleep history:', error);
      return [];
    }
  }

  /**
   * Get last night's sleep
   */
  public getLastNightSleep(): SleepData | null {
    const history = this.getSleepHistory();
    return history.length > 0 ? history[history.length - 1] : null;
  }

  // Activity Data

  /**
   * Save activity data
   */
  public saveActivityData(data: ActivityData): void {
    try {
      const existing = this.getActivityHistory();

      // Check if we already have data for this date
      const existingIndex = existing.findIndex(item => item.date === data.date);
      if (existingIndex >= 0) {
        existing[existingIndex] = data;
      } else {
        existing.push(data);
      }

      // Keep only last 30 days of activity data
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const filtered = existing.filter(item => item.timestamp > thirtyDaysAgo);

      this.storage.set(STORAGE_KEYS.ACTIVITY, JSON.stringify(filtered));
      console.log('🏃 Activity data saved:', data);
    } catch (error) {
      console.error('Failed to save activity data:', error);
    }
  }

  /**
   * Get activity history
   */
  public getActivityHistory(): ActivityData[] {
    try {
      const data = this.storage.getString(STORAGE_KEYS.ACTIVITY);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to get activity history:', error);
      return [];
    }
  }

  /**
   * Get today's activity
   */
  public getTodayActivity(): ActivityData | null {
    const today = new Date().toISOString().split('T')[0];
    const history = this.getActivityHistory();
    return history.find(item => item.date === today) || null;
  }

  // Temperature Data

  /**
   * Save temperature data
   */
  public saveTemperatureData(data: TemperatureData): void {
    try {
      const existing = this.getTemperatureHistory();
      existing.push(data);

      // Keep only last 7 days of data
      const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
      const filtered = existing.filter(item => item.timestamp > sevenDaysAgo);

      this.storage.set(STORAGE_KEYS.TEMPERATURE, JSON.stringify(filtered));
      console.log('🌡️ Temperature data saved:', data);
    } catch (error) {
      console.error('Failed to save temperature data:', error);
    }
  }

  /**
   * Get temperature history
   */
  public getTemperatureHistory(): TemperatureData[] {
    try {
      const data = this.storage.getString(STORAGE_KEYS.TEMPERATURE);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to get temperature history:', error);
      return [];
    }
  }

  /**
   * Get latest temperature
   */
  public getLatestTemperature(): TemperatureData | null {
    const history = this.getTemperatureHistory();
    return history.length > 0 ? history[history.length - 1] : null;
  }

  // Historical Data

  /**
   * Save historical data entries
   */
  public saveHistoricalData(entries: HistoricalDataEntry[]): void {
    try {
      const existing = this.getHistoricalData();
      const combined = [...existing, ...entries];

      // Keep only last 30 days of historical data
      const thirtyDaysAgo = Date.now() - (30 * 24 * 60 * 60 * 1000);
      const filtered = combined.filter(item => item.timestamp > thirtyDaysAgo);

      // Sort by timestamp
      filtered.sort((a, b) => a.timestamp - b.timestamp);

      this.storage.set(STORAGE_KEYS.HISTORICAL, JSON.stringify(filtered));
      console.log(`📊 ${entries.length} historical entries saved`);
    } catch (error) {
      console.error('Failed to save historical data:', error);
    }
  }

  /**
   * Get historical data
   */
  public getHistoricalData(): HistoricalDataEntry[] {
    try {
      const data = this.storage.getString(STORAGE_KEYS.HISTORICAL);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to get historical data:', error);
      return [];
    }
  }

  /**
   * Process historical data into specific metrics
   */
  public processHistoricalData(entries: HistoricalDataEntry[]): void {
    entries.forEach(entry => {
      if (entry.heartRate) {
        this.saveHeartRateData({
          heartRate: entry.heartRate,
          timestamp: entry.timestamp
        });
      }

      if (entry.oxValue) {
        this.saveBloodOxygenData({
          oxValue: entry.oxValue,
          timestamp: entry.timestamp
        });
      }

      if (entry.temperature) {
        this.saveTemperatureData({
          temperature: entry.temperature,
          timestamp: entry.timestamp
        });
      }

      if (entry.steps !== undefined) {
        const date = new Date(entry.timestamp).toISOString().split('T')[0];
        const existing = this.getTodayActivity() || {
          steps: 0,
          date,
          timestamp: entry.timestamp
        };

        this.saveActivityData({
          ...existing,
          steps: entry.steps,
          timestamp: entry.timestamp
        });
      }
    });
  }

  // Dashboard Data

  /**
   * Get health dashboard data
   */
  public getHealthDashboard(): HealthDashboard {
    return {
      currentHeartRate: this.getLatestHeartRate() || undefined,
      currentOxygen: this.getLatestBloodOxygen() || undefined,
      currentTemperature: this.getLatestTemperature() || undefined,
      todayActivity: this.getTodayActivity() || undefined,
      lastNightSleep: this.getLastNightSleep() || undefined,
      heartRateHistory: this.getHeartRateHistory(),
      oxygenHistory: this.getBloodOxygenHistory(),
      temperatureHistory: this.getTemperatureHistory(),
      activityHistory: this.getActivityHistory(),
      sleepHistory: this.getSleepHistory(),
      lastSyncTime: this.getLastSyncTime()
    };
  }

  /**
   * Save dashboard snapshot
   */
  public saveDashboardSnapshot(dashboard: HealthDashboard): void {
    try {
      this.storage.set(STORAGE_KEYS.DASHBOARD, JSON.stringify(dashboard));
      console.log('📊 Dashboard snapshot saved');
    } catch (error) {
      console.error('Failed to save dashboard snapshot:', error);
    }
  }

  // Daily Summaries

  /**
   * Save daily health summary
   */
  public saveDailySummary(summary: HealthMetricsSummary): void {
    try {
      const existing = this.getDailySummaries();

      // Check if we already have a summary for this date
      const existingIndex = existing.findIndex(item => item.date === summary.date);
      if (existingIndex >= 0) {
        existing[existingIndex] = summary;
      } else {
        existing.push(summary);
      }

      // Sort by date
      existing.sort((a, b) => a.date.localeCompare(b.date));

      this.storage.set(STORAGE_KEYS.SUMMARIES, JSON.stringify(existing));
      console.log('📅 Daily summary saved for:', summary.date);
    } catch (error) {
      console.error('Failed to save daily summary:', error);
    }
  }

  /**
   * Get daily summaries
   */
  public getDailySummaries(): HealthMetricsSummary[] {
    try {
      const data = this.storage.getString(STORAGE_KEYS.SUMMARIES);
      return data ? JSON.parse(data) : [];
    } catch (error) {
      console.error('Failed to get daily summaries:', error);
      return [];
    }
  }

  /**
   * Get summary for specific date
   */
  public getSummaryForDate(date: string): HealthMetricsSummary | null {
    const summaries = this.getDailySummaries();
    return summaries.find(item => item.date === date) || null;
  }

  // Sync Management

  /**
   * Update last sync time
   */
  public updateLastSyncTime(): void {
    this.storage.set(STORAGE_KEYS.LAST_SYNC, Date.now().toString());
  }

  /**
   * Get last sync time
   */
  public getLastSyncTime(): number | null {
    const time = this.storage.getString(STORAGE_KEYS.LAST_SYNC);
    return time ? parseInt(time, 10) : null;
  }

  // Data Management

  /**
   * Clear all health data
   */
  public clearAllData(): void {
    Object.values(STORAGE_KEYS).forEach(key => {
      this.storage.delete(key);
    });
    console.log('🗑️ All health data cleared');
  }

  /**
   * Clear old data (cleanup)
   */
  public cleanupOldData(retentionDays: number = 30): void {
    const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

    // Clean up each data type
    const heartRates = this.getHeartRateHistory().filter(item => item.timestamp > cutoffTime);
    const oxygen = this.getBloodOxygenHistory().filter(item => item.timestamp > cutoffTime);
    const temperature = this.getTemperatureHistory().filter(item => item.timestamp > cutoffTime);
    const activity = this.getActivityHistory().filter(item => item.timestamp > cutoffTime);
    const sleep = this.getSleepHistory().filter(item => item.startTime > cutoffTime);
    const historical = this.getHistoricalData().filter(item => item.timestamp > cutoffTime);

    // Save filtered data
    this.storage.set(STORAGE_KEYS.HEART_RATE, JSON.stringify(heartRates));
    this.storage.set(STORAGE_KEYS.BLOOD_OXYGEN, JSON.stringify(oxygen));
    this.storage.set(STORAGE_KEYS.TEMPERATURE, JSON.stringify(temperature));
    this.storage.set(STORAGE_KEYS.ACTIVITY, JSON.stringify(activity));
    this.storage.set(STORAGE_KEYS.SLEEP, JSON.stringify(sleep));
    this.storage.set(STORAGE_KEYS.HISTORICAL, JSON.stringify(historical));

    console.log(`🧹 Cleaned up data older than ${retentionDays} days`);
  }

  /**
   * Export all data
   */
  public exportAllData(): Record<string, any> {
    return {
      heartRate: this.getHeartRateHistory(),
      bloodOxygen: this.getBloodOxygenHistory(),
      sleep: this.getSleepHistory(),
      activity: this.getActivityHistory(),
      temperature: this.getTemperatureHistory(),
      historical: this.getHistoricalData(),
      summaries: this.getDailySummaries(),
      lastSync: this.getLastSyncTime(),
      exportDate: Date.now()
    };
  }
}

// Export singleton instance
export const healthDataStorage = HealthDataStorage.getInstance();