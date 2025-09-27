/**
 * Ring Health Dashboard Component
 * Displays real-time health metrics and historical data
 */

import React, { useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { cleanRingConnection } from "../ring/connection/CleanRingConnection";
import { useRingStore } from "../ring/state/ringStore";
import { SleepData } from "../types/ring";

interface MetricCardProps {
  title: string;
  value: string | number;
  unit: string;
  icon: string;
  color: string;
  trend?: "up" | "down" | "stable";
}

const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  unit,
  icon,
  color,
  trend,
}) => (
  <View style={[styles.metricCard, { borderLeftColor: color }]}>
    <View style={styles.metricHeader}>
      <Text style={styles.metricIcon}>{icon}</Text>
      <Text style={styles.metricTitle}>{title}</Text>
    </View>
    <View style={styles.metricValue}>
      <Text style={[styles.metricNumber, { color }]}>{value}</Text>
      <Text style={styles.metricUnit}>{unit}</Text>
    </View>
    {trend && (
      <View style={styles.trendIndicator}>
        <Text style={styles.trendIcon}>
          {trend === "up" ? "↑" : trend === "down" ? "↓" : "→"}
        </Text>
      </View>
    )}
  </View>
);

interface SleepStageProps {
  stage: string;
  duration: number;
  percentage: number;
  color: string;
}

const SleepStage: React.FC<SleepStageProps> = ({
  stage,
  duration,
  percentage,
  color,
}) => (
  <View style={styles.sleepStage}>
    <View style={styles.sleepStageInfo}>
      <Text style={styles.sleepStageName}>{stage}</Text>
      <Text style={styles.sleepStageDuration}>{formatDuration(duration)}</Text>
    </View>
    <View style={styles.sleepStageBar}>
      <View
        style={[
          styles.sleepStageProgress,
          { width: `${percentage}%`, backgroundColor: color },
        ]}
      />
    </View>
    <Text style={styles.sleepStagePercent}>{percentage}%</Text>
  </View>
);

export const RingHealthDashboard: React.FC = () => {
  const [refreshing, setRefreshing] = useState(false);
  const [monitoringActive, setMonitoringActive] = useState(false);
  const [monitoringLoading, setMonitoringLoading] = useState(false);
  const [syncingSteps, setSyncingSteps] = useState(false);

  const currentHealthReading = useRingStore(
    (state) => state.currentHealthReading
  );
  const steps = useRingStore((state) => state.steps);
  const temperature = useRingStore((state) => state.temperature);
  const batteryData = useRingStore((state) => state.batteryData);
  const sleepData = useRingStore((state) => state.sleepData);
  const historicalData = useRingStore((state) => state.historicalData);
  const connectionStatus = useRingStore((state) => state.connectionStatus);
  const isHistoricalDataLoading = useRingStore((state) => state.isHistoricalDataLoading);

  const isConnected = !!connectionStatus?.isConnected;

  const handleRefresh = async () => {
    if (!isConnected) return;

    setRefreshing(true);
    try {
      // Refresh current health data
      await cleanRingConnection.fetchHistoricalData();
    } catch (error) {
      console.error("Failed to refresh data:", error);
    } finally {
      setRefreshing(false);
    }
  };

  const handleFetchHistorical = async () => {
    if (!isConnected || isHistoricalDataLoading) return;

    try {
      await cleanRingConnection.fetchHistoricalData();
    } catch (error) {
      console.error("Failed to fetch historical data:", error);
    }
  };

  // Toggle real-time monitoring
  const handleToggleMonitoring = async () => {
    if (!isConnected) return;

    setMonitoringLoading(true);
    try {
      if (monitoringActive) {
        // Stop monitoring
        const success = await cleanRingConnection.stopHealthMonitoring();
        if (success) {
          setMonitoringActive(false);
        }
      } else {
        // Start monitoring
        const success = await cleanRingConnection.startHealthMonitoring();
        if (success) {
          setMonitoringActive(true);
        }
      }
    } catch (error) {
      console.error("Failed to toggle monitoring:", error);
    } finally {
      setMonitoringLoading(false);
    }
  };

  // Sync step count from ring
  const handleSyncSteps = async () => {
    if (!isConnected || syncingSteps) return;

    setSyncingSteps(true);
    try {
      const { healthDataSyncService } = await import('../ring/services/HealthDataSyncService');
      await healthDataSyncService.fetchCurrentStepCount();

      // Also trigger a manual sync to get latest historical data
      await healthDataSyncService.triggerManualSync();

      console.log('✅ Step count sync completed');
    } catch (error) {
      console.error("Failed to sync step count:", error);
    } finally {
      setSyncingSteps(false);
    }
  };

  if (!isConnected) {
    return (
      <View style={styles.disconnectedContainer}>
        <Text style={styles.disconnectedIcon}>📱</Text>
        <Text style={styles.disconnectedTitle}>No Ring Connected</Text>
        <Text style={styles.disconnectedSubtitle}>
          Connect your Ring device to view health metrics
        </Text>
      </View>
    );
  }

  const lastSleep = sleepData?.[0];
  const totalSleepMinutes = lastSleep
    ? lastSleep.deepSleep +
      lastSleep.lightTime +
      lastSleep.remTime +
      lastSleep.wakeTime
    : 0;

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
      }
    >
      {/* Real-time Monitoring Control */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Real-time Monitoring</Text>
          <TouchableOpacity
            style={[styles.fetchButton, monitoringActive && styles.activeButton]}
            onPress={handleToggleMonitoring}
            disabled={monitoringLoading}
          >
            {monitoringLoading ? (
              <ActivityIndicator size="small" color="#2196F3" />
            ) : (
              <Text style={styles.fetchButtonText}>
                {monitoringActive ? "Stop Monitoring" : "Start Monitoring"}
              </Text>
            )}
          </TouchableOpacity>
        </View>
        {monitoringActive && (
          <Text style={styles.monitoringStatus}>🟢 Monitoring active - Real-time data is being collected</Text>
        )}
      </View>

      {/* Battery Status */}
      <View style={styles.batterySection}>
        <View style={styles.batteryInfo}>
          <Text style={styles.batteryLabel}>Battery</Text>
          <Text style={styles.batteryValue}>
            {batteryData?.batteryPer || 0}%
          </Text>
        </View>
        <View style={styles.batteryBar}>
          <View
            style={[
              styles.batteryProgress,
              {
                width: `${batteryData?.batteryPer || 0}%`,
                backgroundColor: getBatteryColor(batteryData?.batteryPer || 0),
              },
            ]}
          />
        </View>
      </View>

      {/* Current Health Metrics */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Current Vitals</Text>
        <View style={styles.metricsGrid}>
          <MetricCard
            title="Heart Rate"
            value={currentHealthReading?.heartRate ?? "--"}
            unit="bpm"
            icon="❤️"
            color="#F44336"
            trend={getHeartRateTrend(currentHealthReading?.heartRate)}
          />
          <MetricCard
            title="Steps"
            value={formatNumber(steps || 0)}
            unit="steps"
            icon="👟"
            color="#4CAF50"
          />
          <TouchableOpacity
            style={[styles.fetchButton, { marginTop: 8 }]}
            onPress={handleSyncSteps}
            disabled={syncingSteps}
          >
            {syncingSteps ? (
              <ActivityIndicator size="small" color="#2196F3" />
            ) : (
              <Text style={styles.fetchButtonText}>Sync Steps</Text>
            )}
          </TouchableOpacity>
          <MetricCard
            title="SpO2"
            value={currentHealthReading?.bloodOxygen ?? "--"}
            unit="%"
            icon="💨"
            color="#2196F3"
          />
          <MetricCard
            title="Temperature"
            value={temperature != null ? temperature.toFixed(1) : "--"}
            unit="°C"
            icon="🌡️"
            color="#FF9800"
          />
          <MetricCard
            title="Calories"
            value={0}
            unit="kcal"
            icon="🔥"
            color="#9C27B0"
          />
          <MetricCard
            title="Distance"
            value={(((steps || 0) * 0.8) / 1000).toFixed(2)}
            unit="km"
            icon="📍"
            color="#00BCD4"
          />
        </View>
      </View>

      {/* Sleep Analysis */}
      {lastSleep && (
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Last Night's Sleep</Text>
          <View style={styles.sleepSummary}>
            <View style={styles.sleepTotalContainer}>
              <Text style={styles.sleepTotalLabel}>Total Sleep</Text>
              <Text style={styles.sleepTotalValue}>
                {formatDuration(totalSleepMinutes)}
              </Text>
            </View>
            <View style={styles.sleepQuality}>
              <Text style={styles.sleepQualityLabel}>Sleep Quality</Text>
              <Text style={styles.sleepQualityValue}>
                {getSleepQuality(lastSleep)}
              </Text>
            </View>
          </View>

          <View style={styles.sleepStages}>
            <SleepStage
              stage="Deep Sleep"
              duration={lastSleep.deepSleep}
              percentage={Math.round(
                (lastSleep.deepSleep / (totalSleepMinutes || 1)) * 100
              )}
              color="#4A148C"
            />
            <SleepStage
              stage="Light Sleep"
              duration={lastSleep.lightTime}
              percentage={Math.round(
                (lastSleep.lightTime / (totalSleepMinutes || 1)) * 100
              )}
              color="#7B1FA2"
            />
            <SleepStage
              stage="REM Sleep"
              duration={lastSleep.remTime}
              percentage={Math.round(
                (lastSleep.remTime / (totalSleepMinutes || 1)) * 100
              )}
              color="#9C27B0"
            />
            <SleepStage
              stage="Awake"
              duration={lastSleep.wakeTime}
              percentage={Math.round(
                (lastSleep.wakeTime / (totalSleepMinutes || 1)) * 100
              )}
              color="#CE93D8"
            />
          </View>
        </View>
      )}

      {/* Historical Data */}
      <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Historical Data</Text>
          <TouchableOpacity
            style={styles.fetchButton}
            onPress={handleFetchHistorical}
            disabled={isHistoricalDataLoading}
          >
            {isHistoricalDataLoading ? (
              <ActivityIndicator size="small" color="#2196F3" />
            ) : (
              <Text style={styles.fetchButtonText}>Fetch Data</Text>
            )}
          </TouchableOpacity>
        </View>

        {historicalData.length > 0 ? (
          <View style={styles.historicalList}>
            <Text style={styles.historicalCount}>
              {historicalData.length} unique records available
            </Text>
            <Text style={styles.historicalHint}>
              Latest record:{" "}
              {new Date(historicalData[historicalData.length - 1]?.timeStamp || Date.now()).toLocaleString()}
            </Text>
            {isHistoricalDataLoading && (
              <Text style={styles.historicalHint}>
                Fetching new data...
              </Text>
            )}
          </View>
        ) : (
          <Text style={styles.noDataText}>
            {isHistoricalDataLoading
              ? "Fetching historical data..."
              : "No historical data available. Tap \"Fetch Data\" to retrieve."}
          </Text>
        )}
      </View>
    </ScrollView>
  );
};

// Helper functions
function formatNumber(num: number): string {
  if (num >= 1000) {
    return `${(num / 1000).toFixed(1)}k`;
  }
  return num.toString();
}

function formatDuration(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return `${hours}h ${mins}m`;
}

function getBatteryColor(level: number): string {
  if (level > 60) return "#4CAF50";
  if (level > 30) return "#FFC107";
  return "#F44336";
}

function getHeartRateTrend(hr?: number): "up" | "down" | "stable" | undefined {
  if (!hr) return undefined;
  if (hr > 100) return "up";
  if (hr < 60) return "down";
  return "stable";
}

function getSleepQuality(sleep: SleepData): string {
  const total = sleep.deepSleep + sleep.lightTime + sleep.remTime;
  if (total <= 0) return "Poor";
  const deepSleepPercent = (sleep.deepSleep / total) * 100;
  if (deepSleepPercent > 20) return "Excellent";
  if (deepSleepPercent > 15) return "Good";
  if (deepSleepPercent > 10) return "Fair";
  return "Poor";
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F5F5F5",
  },
  disconnectedContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  disconnectedIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  disconnectedTitle: {
    fontSize: 20,
    fontWeight: "600",
    color: "#333",
    marginBottom: 8,
  },
  disconnectedSubtitle: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  batterySection: {
    backgroundColor: "#FFF",
    padding: 16,
    marginBottom: 8,
  },
  batteryInfo: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  batteryLabel: {
    fontSize: 14,
    color: "#666",
  },
  batteryValue: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
  },
  batteryBar: {
    height: 8,
    backgroundColor: "#E0E0E0",
    borderRadius: 4,
    overflow: "hidden",
  },
  batteryProgress: {
    height: "100%",
    borderRadius: 4,
  },
  section: {
    backgroundColor: "#FFF",
    padding: 16,
    marginBottom: 8,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#333",
    marginBottom: 16,
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -8,
  },
  metricCard: {
    width: "50%",
    padding: 8,
  },
  metricHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  metricIcon: {
    fontSize: 20,
    marginRight: 8,
  },
  metricTitle: {
    fontSize: 12,
    color: "#666",
  },
  metricValue: {
    flexDirection: "row",
    alignItems: "baseline",
  },
  metricNumber: {
    fontSize: 24,
    fontWeight: "600",
  },
  metricUnit: {
    fontSize: 12,
    color: "#999",
    marginLeft: 4,
  },
  trendIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
  },
  trendIcon: {
    fontSize: 16,
    color: "#666",
  },
  sleepSummary: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 24,
  },
  sleepTotalContainer: {
    alignItems: "center",
  },
  sleepTotalLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  sleepTotalValue: {
    fontSize: 24,
    fontWeight: "600",
    color: "#333",
  },
  sleepQuality: {
    alignItems: "center",
  },
  sleepQualityLabel: {
    fontSize: 12,
    color: "#666",
    marginBottom: 4,
  },
  sleepQualityValue: {
    fontSize: 18,
    fontWeight: "600",
    color: "#4CAF50",
  },
  sleepStages: {
    marginTop: 16,
  },
  sleepStage: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  sleepStageInfo: {
    width: 100,
  },
  sleepStageName: {
    fontSize: 12,
    color: "#333",
  },
  sleepStageDuration: {
    fontSize: 10,
    color: "#666",
  },
  sleepStageBar: {
    flex: 1,
    height: 20,
    backgroundColor: "#E0E0E0",
    borderRadius: 10,
    marginHorizontal: 8,
    overflow: "hidden",
  },
  sleepStageProgress: {
    height: "100%",
    borderRadius: 10,
  },
  sleepStagePercent: {
    width: 40,
    fontSize: 12,
    color: "#666",
    textAlign: "right",
  },
  fetchButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#E3F2FD",
    borderRadius: 16,
  },
  fetchButtonText: {
    fontSize: 14,
    color: "#2196F3",
    fontWeight: "600",
  },
  historicalList: {
    padding: 12,
    backgroundColor: "#F5F5F5",
    borderRadius: 8,
  },
  historicalCount: {
    fontSize: 14,
    fontWeight: "600",
    color: "#333",
    marginBottom: 4,
  },
  historicalHint: {
    fontSize: 12,
    color: "#666",
  },
  noDataText: {
    fontSize: 14,
    color: "#999",
    textAlign: "center",
    paddingVertical: 16,
  },
  activeButton: {
    backgroundColor: "#4CAF50",
  },
  monitoringStatus: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    backgroundColor: "#E8F5E9",
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 8,
  },
});
