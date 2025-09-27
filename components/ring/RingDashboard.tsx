/**
 * Ring Dashboard
 * Basic UI for displaying Ring health data and device status
 */

import React, { useEffect, useState } from "react";
import {
  Alert,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import {
  formatBatteryLevel,
  formatBatteryStatus,
  formatDashboardData,
  formatDeviceInfo,
} from "../../src/ring/data/formatters/dataFormatters";
import { getTimeAgo } from "../../src/ring/data/formatters/timeFormatters";
import { ringService } from "../../src/ring/RingService";
import { useRingStore } from "../../src/ring/state/ringStore";
import { SmartRingX1 } from "../../src/types/ring";
import RingReconnectionBanner from "./RingReconnectionBanner";

interface RingDashboardProps {
  connectedRing: SmartRingX1;
  onDisconnect: () => void;
  onNavigateToHealthMonitor: () => void;
}

export default function RingDashboard({
  connectedRing,
  onDisconnect,
  onNavigateToHealthMonitor,
}: RingDashboardProps) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isMonitoring, setIsMonitoring] = useState(false);
  const [dashboardData, setDashboardData] = useState<any>({
    totalSteps: 0,
    avgHeartRate: 0,
    maxHeartRate: 0,
    avgTemperature: 0,
    avgOxygen: 0,
    batteryLevel: 0,
    lastSync: "Never",
  });

  const {
    batteryData,
    deviceInfo1,
    historicalData,
    lastSyncTime,
    connectionStatus,
  } = useRingStore();

  useEffect(() => {
    loadInitialData();
  }, []);

  useEffect(() => {
    if (batteryData) {
      setDashboardData((prev) => ({
        ...prev,
        batteryLevel: batteryData.batteryPer,
      }));
    }
  }, [batteryData]);

  useEffect(() => {
    if (lastSyncTime) {
      setDashboardData((prev) => ({
        ...prev,
        lastSync: getTimeAgo(new Date(lastSyncTime)),
      }));
    }
  }, [lastSyncTime]);

  const loadInitialData = async () => {
    try {
      // IMPORTANT: Don't automatically refresh data anymore!
      // This was causing race conditions with Ring initialization.
      // Ring needs to complete OEM verification first before accepting data requests.

      console.log(
        "🏠 Dashboard loaded - waiting for Ring deviceInfo1 response..."
      );
      console.log(
        "💡 Dashboard will automatically update when Ring responds with device specifications"
      );
    } catch (error) {
      console.error("Failed to load initial data:", error);
    }
  };

  const refreshDeviceData = async () => {
    try {
      setIsRefreshing(true);

      // Get battery info
      const battery = await ringService.getBatteryInfo();

      // Get device info
      const deviceInfo = await ringService.getDeviceInfo();

      // Get current health readings
      await ringService.getStepCount();
      await ringService.getTemperature();

      console.log("Device data refreshed successfully");
    } catch (error) {
      console.error("Failed to refresh device data:", error);
      Alert.alert("Refresh Error", "Failed to refresh device data");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleStartMonitoring = async () => {
    try {
      setIsMonitoring(true);
      await ringService.startHealthMonitoring();
      Alert.alert("Monitoring Started", "Health monitoring is now active");
    } catch (error) {
      console.error("Failed to start monitoring:", error);
      Alert.alert("Error", "Failed to start health monitoring");
      setIsMonitoring(false);
    }
  };

  const handleStopMonitoring = async () => {
    try {
      await ringService.stopHealthMonitoring();
      setIsMonitoring(false);
      Alert.alert("Monitoring Stopped", "Health monitoring has been stopped");
    } catch (error) {
      console.error("Failed to stop monitoring:", error);
      Alert.alert("Error", "Failed to stop health monitoring");
    }
  };

  const handleSyncData = async () => {
    try {
      setIsRefreshing(true);

      const historicalData = await ringService.syncHistoricalData();

      Alert.alert(
        "Sync Complete",
        `Synced ${historicalData.length} health records`
      );
    } catch (error) {
      console.error("Failed to sync data:", error);
      Alert.alert("Sync Error", "Failed to sync historical data");
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleGenerateReport = async () => {
    try {
      const report = await ringService.generateHealthReport();

      // For now, just show a summary alert
      const { dailyActivity, sleepReport, healthAnomalies } = report;

      Alert.alert(
        "Health Report",
        `Daily Steps: ${dailyActivity.totalSteps || 0}\nAvg Heart Rate: ${
          dailyActivity.avgHeartRate || 0
        } BPM\nSleep Score: ${sleepReport.sleepScore || 0}/100\nAnomalies: ${
          healthAnomalies.length
        }`
      );
    } catch (error) {
      console.error("Failed to generate report:", error);
      Alert.alert("Report Error", "Failed to generate health report");
    }
  };

  const formattedData = formatDashboardData(dashboardData);
  const deviceFormattedInfo = deviceInfo1
    ? formatDeviceInfo(deviceInfo1)
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <RingReconnectionBanner />
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={refreshDeviceData}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerContent}>
            <Text style={styles.title}>SmartRing X1</Text>
            <Text style={styles.subtitle}>{connectedRing.name}</Text>
            <View style={styles.connectionStatus}>
              <View style={styles.statusIndicator} />
              <Text style={styles.statusText}>Connected</Text>
            </View>
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              style={styles.healthMonitorButton}
              onPress={onNavigateToHealthMonitor}
            >
              <Text style={styles.healthMonitorButtonText}>🩺 Health Monitor</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.disconnectButton}
              onPress={onDisconnect}
            >
              <Text style={styles.disconnectButtonText}>Disconnect</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Device Info */}
        {deviceFormattedInfo && (
          <View style={styles.deviceInfoCard}>
            <Text style={styles.cardTitle}>Device Information</Text>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Model:</Text>
              <Text style={styles.infoValue}>{deviceFormattedInfo.model}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Color:</Text>
              <Text style={styles.infoValue}>{deviceFormattedInfo.color}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Size:</Text>
              <Text style={styles.infoValue}>{deviceFormattedInfo.size}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Version:</Text>
              <Text style={styles.infoValue}>
                {deviceFormattedInfo.version}
              </Text>
            </View>
          </View>
        )}

        {/* Battery Status */}
        {batteryData && (
          <View style={styles.batteryCard}>
            <Text style={styles.cardTitle}>Battery Status</Text>
            <View style={styles.batteryInfo}>
              <View style={styles.batteryLevel}>
                <Text style={styles.batteryPercentage}>
                  {formatBatteryLevel(batteryData)}
                </Text>
                <View style={styles.batteryBar}>
                  <View
                    style={[
                      styles.batteryFill,
                      { width: `${batteryData.batteryPer}%` },
                      batteryData.batteryPer < 20
                        ? styles.batteryLow
                        : styles.batteryNormal,
                    ]}
                  />
                </View>
              </View>
              <Text style={styles.batteryStatus}>
                {formatBatteryStatus(batteryData)}
              </Text>
            </View>
          </View>
        )}

        {/* Health Metrics */}
        <View style={styles.metricsGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{formattedData.steps.value}</Text>
            <Text style={styles.metricLabel}>{formattedData.steps.label}</Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {formattedData.heartRate.value}
            </Text>
            <Text style={styles.metricLabel}>Heart Rate</Text>
            <Text style={styles.metricSubLabel}>
              {formattedData.heartRate.label}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>
              {formattedData.temperature.value}
            </Text>
            <Text style={styles.metricLabel}>
              {formattedData.temperature.label}
            </Text>
          </View>

          <View style={styles.metricCard}>
            <Text style={styles.metricValue}>{formattedData.oxygen.value}</Text>
            <Text style={styles.metricLabel}>{formattedData.oxygen.label}</Text>
          </View>
        </View>

        {/* Monitoring Controls */}
        <View style={styles.controlsCard}>
          <Text style={styles.cardTitle}>Health Monitoring</Text>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={[
                styles.actionButton,
                isMonitoring ? styles.stopButton : styles.startButton,
              ]}
              onPress={
                isMonitoring ? handleStopMonitoring : handleStartMonitoring
              }
            >
              <Text style={styles.actionButtonText}>
                {isMonitoring ? "Stop Monitoring" : "Start Monitoring"}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleSyncData}
              disabled={isRefreshing}
            >
              <Text style={styles.secondaryButtonText}>
                Sync Historical Data
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.buttonRow}>
            <TouchableOpacity
              style={styles.secondaryButton}
              onPress={handleGenerateReport}
            >
              <Text style={styles.secondaryButtonText}>
                Generate Health Report
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Last Sync Info */}
        <View style={styles.syncInfo}>
          <Text style={styles.syncText}>
            Last sync: {formattedData.lastSync.value}
          </Text>
          <Text style={styles.syncSubText}>
            Historical records: {historicalData.length}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8F9FA",
  },
  scrollView: {
    flex: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E5E5E7",
  },
  headerContent: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1C1C1E",
  },
  subtitle: {
    fontSize: 16,
    color: "#666",
    marginTop: 4,
  },
  connectionStatus: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
  },
  statusIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#4CAF50",
    marginRight: 6,
  },
  statusText: {
    fontSize: 14,
    color: "#4CAF50",
    fontWeight: "500",
  },
  headerButtons: {
    flexDirection: 'column',
    gap: 8,
  },
  healthMonitorButton: {
    backgroundColor: "#007AFF",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  healthMonitorButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  disconnectButton: {
    backgroundColor: "#FF3B30",
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
  },
  disconnectButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "600",
  },
  deviceInfoCard: {
    margin: 16,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1C1C1E",
    marginBottom: 12,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
  },
  infoLabel: {
    fontSize: 14,
    color: "#666",
  },
  infoValue: {
    fontSize: 14,
    color: "#1C1C1E",
    fontWeight: "500",
  },
  batteryCard: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  batteryInfo: {
    alignItems: "center",
  },
  batteryLevel: {
    alignItems: "center",
    marginBottom: 8,
  },
  batteryPercentage: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1C1C1E",
    marginBottom: 8,
  },
  batteryBar: {
    width: 200,
    height: 8,
    backgroundColor: "#E5E5E7",
    borderRadius: 4,
    overflow: "hidden",
  },
  batteryFill: {
    height: "100%",
    borderRadius: 4,
  },
  batteryNormal: {
    backgroundColor: "#4CAF50",
  },
  batteryLow: {
    backgroundColor: "#FF3B30",
  },
  batteryStatus: {
    fontSize: 14,
    color: "#666",
  },
  metricsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    margin: 16,
    marginTop: 0,
  },
  metricCard: {
    width: "48%",
    backgroundColor: "#FFFFFF",
    padding: 16,
    borderRadius: 12,
    margin: "1%",
    alignItems: "center",
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  metricValue: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#007AFF",
    marginBottom: 4,
  },
  metricLabel: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  metricSubLabel: {
    fontSize: 12,
    color: "#999",
    textAlign: "center",
    marginTop: 2,
  },
  controlsCard: {
    margin: 16,
    padding: 16,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    elevation: 2,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  buttonRow: {
    marginBottom: 12,
  },
  actionButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: "center",
  },
  startButton: {
    backgroundColor: "#4CAF50",
  },
  stopButton: {
    backgroundColor: "#FF3B30",
  },
  actionButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  secondaryButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    backgroundColor: "#007AFF",
    alignItems: "center",
  },
  secondaryButtonText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
  },
  syncInfo: {
    alignItems: "center",
    padding: 16,
  },
  syncText: {
    fontSize: 14,
    color: "#666",
    marginBottom: 4,
  },
  syncSubText: {
    fontSize: 12,
    color: "#999",
  },
});
