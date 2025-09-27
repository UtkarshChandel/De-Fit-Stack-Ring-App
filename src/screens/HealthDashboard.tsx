/**
 * Health Dashboard Screen
 * Displays comprehensive health metrics from Ring device
 */

import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  TouchableOpacity,
  ActivityIndicator,
  Alert
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { healthDataSyncService } from '../ring/services/HealthDataSyncService';
import { healthDataStorage } from '../ring/storage/HealthDataStorage';
import { cleanRingConnection } from '../ring/connection/CleanRingConnection';
import {
  HealthDashboard,
  HeartRateData,
  BloodOxygenData,
  TemperatureData,
  ActivityData,
  BatteryData,
  HealthSyncStatus
} from '../types/health';
import HealthMetricCard from '../components/HealthMetricCard';
import ConnectionStatusBar from '../components/ConnectionStatusBar';
import BatteryIndicator from '../components/BatteryIndicator';
import MiniChart from '../components/MiniChart';

const HealthDashboardScreen: React.FC = () => {
  const [dashboard, setDashboard] = useState<HealthDashboard | null>(null);
  const [syncStatus, setSyncStatus] = useState<HealthSyncStatus>({
    isSyncing: false,
    syncProgress: 0,
    pendingRecords: 0,
    syncedRecords: 0
  });
  const [isConnected, setIsConnected] = useState(false);
  const [battery, setBattery] = useState<BatteryData | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date>(new Date());

  // Load dashboard data
  const loadDashboard = useCallback(() => {
    const data = healthDataStorage.getHealthDashboard();
    setDashboard(data);
    setBattery(data.battery || null);
    setLastUpdate(new Date());
  }, []);

  // Handle pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (isConnected) {
        await healthDataSyncService.triggerManualSync();
      }
      loadDashboard();
    } catch (error) {
      console.error('Refresh failed:', error);
      Alert.alert('Sync Failed', 'Unable to sync data. Please try again.');
    } finally {
      setRefreshing(false);
    }
  }, [isConnected, loadDashboard]);

  // Setup listeners
  useEffect(() => {
    // Load initial data
    loadDashboard();

    // Check connection status
    const connectionManager = cleanRingConnection;
    setIsConnected(connectionManager.isConnected());

    // Listen for sync status updates
    const handleSyncStatus = (status: HealthSyncStatus) => {
      setSyncStatus(status);
    };

    // Listen for real-time data updates
    const handleHeartRate = (data: HeartRateData) => {
      loadDashboard();
    };

    const handleOxygen = (data: BloodOxygenData) => {
      loadDashboard();
    };

    const handleTemperature = (data: TemperatureData) => {
      loadDashboard();
    };

    const handleActivity = (data: ActivityData) => {
      loadDashboard();
    };

    const handleBattery = (data: BatteryData) => {
      setBattery(data);
    };

    // Subscribe to events
    healthDataSyncService.on('syncStatus', handleSyncStatus);
    healthDataSyncService.on('heartRate', handleHeartRate);
    healthDataSyncService.on('oxygen', handleOxygen);
    healthDataSyncService.on('temperature', handleTemperature);
    healthDataSyncService.on('activity', handleActivity);
    healthDataSyncService.on('battery', handleBattery);

    // Listen for connection changes
    const handleConnectionChange = (connected: boolean) => {
      setIsConnected(connected);
      if (connected) {
        // Start auto sync when connected
        healthDataSyncService.enableAutoSync(15);
      }
    };

    // Note: CleanRingConnection doesn't have event emitter methods
    // We'll use polling or store updates instead
    // connectionManager.on('connectionStatusChanged', handleConnectionChange);

    // Cleanup
    return () => {
      healthDataSyncService.off('syncStatus', handleSyncStatus);
      healthDataSyncService.off('heartRate', handleHeartRate);
      healthDataSyncService.off('oxygen', handleOxygen);
      healthDataSyncService.off('temperature', handleTemperature);
      healthDataSyncService.off('activity', handleActivity);
      healthDataSyncService.off('battery', handleBattery);
      // connectionManager.off('connectionStatusChanged', handleConnectionChange);
    };
  }, [loadDashboard]);

  // Auto refresh every minute
  useEffect(() => {
    const interval = setInterval(() => {
      loadDashboard();
    }, 60000);

    return () => clearInterval(interval);
  }, [loadDashboard]);

  // Format time ago
  const formatTimeAgo = (date: Date): string => {
    const seconds = Math.floor((new Date().getTime() - date.getTime()) / 1000);
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  return (
    <SafeAreaView style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.headerTitle}>Health Dashboard</Text>
          <Text style={styles.headerSubtitle}>
            Updated {formatTimeAgo(lastUpdate)}
          </Text>
        </View>
        <View style={styles.headerRight}>
          {battery && <BatteryIndicator battery={battery} />}
          <TouchableOpacity
            style={[styles.headerSyncButton, syncStatus.isSyncing && styles.headerSyncButtonDisabled]}
            onPress={onRefresh}
            disabled={syncStatus.isSyncing || !isConnected}
          >
            {syncStatus.isSyncing ? (
              <ActivityIndicator size="small" color="#FFF" />
            ) : (
              <Icon name="refresh" size={20} color="#FFF" />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Connection Status */}
      <ConnectionStatusBar
        isConnected={isConnected}
        deviceName={dashboard?.deviceInfo?.mainChipModel || 'SmartRing X1'}
      />

      {/* Sync Progress */}
      {syncStatus.isSyncing && (
        <View style={styles.syncProgress}>
          <View style={styles.syncHeader}>
            <ActivityIndicator size="small" color="#007AFF" />
            <Text style={styles.syncText}>
              Syncing... {Math.round(syncStatus.syncProgress)}%
            </Text>
          </View>
          <View style={styles.progressBar}>
            <View
              style={[
                styles.progressFill,
                { width: `${syncStatus.syncProgress}%` }
              ]}
            />
          </View>
          {syncStatus.pendingRecords > 0 && (
            <Text style={styles.syncDetails}>
              {syncStatus.syncedRecords} / {syncStatus.pendingRecords} records
            </Text>
          )}
        </View>
      )}

      {/* Main Content */}
      <ScrollView
        style={styles.content}
        contentContainerStyle={styles.contentContainer}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={['#007AFF']}
            tintColor="#007AFF"
          />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* Quick Stats Grid */}
        <View style={styles.quickStats}>
          {/* Heart Rate */}
          <HealthMetricCard
            title="Heart Rate"
            value={dashboard?.currentHeartRate?.heartRate}
            unit="BPM"
            icon="heart-pulse"
            iconColor="#FF3B30"
            trend={dashboard?.heartRateHistory}
            onPress={() => {}}
          />

          {/* Blood Oxygen */}
          <HealthMetricCard
            title="Blood Oxygen"
            value={dashboard?.currentOxygen?.oxValue}
            unit="%"
            icon="water"
            iconColor="#007AFF"
            trend={dashboard?.oxygenHistory}
            onPress={() => {}}
          />

          {/* Temperature */}
          <HealthMetricCard
            title="Temperature"
            value={dashboard?.currentTemperature?.temperature}
            unit="°C"
            icon="thermometer"
            iconColor="#FF9500"
            trend={dashboard?.temperatureHistory}
            onPress={() => {}}
          />

          {/* Steps */}
          <HealthMetricCard
            title="Steps Today"
            value={dashboard?.todayActivity?.steps}
            unit="steps"
            icon="walk"
            iconColor="#34C759"
            trend={dashboard?.activityHistory}
            onPress={() => {}}
          />
        </View>

        {/* Sleep Section */}
        {dashboard?.lastNightSleep && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="sleep" size={24} color="#5856D6" />
              <Text style={styles.sectionTitle}>Last Night's Sleep</Text>
            </View>
            <View style={styles.sleepCard}>
              <View style={styles.sleepMain}>
                <Text style={styles.sleepDuration}>
                  {Math.floor(dashboard.lastNightSleep.totalSleepTime / 60)}h{' '}
                  {dashboard.lastNightSleep.totalSleepTime % 60}m
                </Text>
                <Text style={styles.sleepLabel}>Total Sleep</Text>
              </View>
              <View style={styles.sleepDetails}>
                <View style={styles.sleepStage}>
                  <Icon name="weather-night" size={16} color="#8E8E93" />
                  <Text style={styles.sleepStageText}>
                    Deep: {Math.floor(dashboard.lastNightSleep.deepSleepTime / 60)}h{' '}
                    {dashboard.lastNightSleep.deepSleepTime % 60}m
                  </Text>
                </View>
                <View style={styles.sleepStage}>
                  <Icon name="cloud" size={16} color="#8E8E93" />
                  <Text style={styles.sleepStageText}>
                    Light: {Math.floor(dashboard.lastNightSleep.lightSleepTime / 60)}h{' '}
                    {dashboard.lastNightSleep.lightSleepTime % 60}m
                  </Text>
                </View>
                <View style={styles.sleepStage}>
                  <Icon name="eye" size={16} color="#8E8E93" />
                  <Text style={styles.sleepStageText}>
                    REM: {Math.floor(dashboard.lastNightSleep.remSleepTime / 60)}h{' '}
                    {dashboard.lastNightSleep.remSleepTime % 60}m
                  </Text>
                </View>
              </View>
              {dashboard.lastNightSleep.sleepScore && (
                <View style={styles.sleepScore}>
                  <Text style={styles.sleepScoreLabel}>Sleep Score</Text>
                  <Text style={styles.sleepScoreValue}>
                    {dashboard.lastNightSleep.sleepScore}
                  </Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Activity Summary */}
        {dashboard?.todayActivity && (
          <View style={styles.section}>
            <View style={styles.sectionHeader}>
              <Icon name="run" size={24} color="#34C759" />
              <Text style={styles.sectionTitle}>Today's Activity</Text>
            </View>
            <View style={styles.activityGrid}>
              <View style={styles.activityItem}>
                <Icon name="walk" size={20} color="#34C759" />
                <Text style={styles.activityValue}>
                  {dashboard.todayActivity.steps?.toLocaleString() || 0}
                </Text>
                <Text style={styles.activityLabel}>Steps</Text>
              </View>
              {dashboard.todayActivity.distance && (
                <View style={styles.activityItem}>
                  <Icon name="map-marker-distance" size={20} color="#007AFF" />
                  <Text style={styles.activityValue}>
                    {(dashboard.todayActivity.distance / 1000).toFixed(1)}
                  </Text>
                  <Text style={styles.activityLabel}>km</Text>
                </View>
              )}
              {dashboard.todayActivity.calories && (
                <View style={styles.activityItem}>
                  <Icon name="fire" size={20} color="#FF9500" />
                  <Text style={styles.activityValue}>
                    {dashboard.todayActivity.calories}
                  </Text>
                  <Text style={styles.activityLabel}>kcal</Text>
                </View>
              )}
              {dashboard.todayActivity.activeMinutes && (
                <View style={styles.activityItem}>
                  <Icon name="timer" size={20} color="#5856D6" />
                  <Text style={styles.activityValue}>
                    {dashboard.todayActivity.activeMinutes}
                  </Text>
                  <Text style={styles.activityLabel}>Active mins</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* Historical Trends */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Icon name="chart-line" size={24} color="#007AFF" />
            <Text style={styles.sectionTitle}>7-Day Trends</Text>
          </View>

          {/* Heart Rate Chart */}
          {dashboard?.heartRateHistory && dashboard.heartRateHistory.length > 0 && (
            <MiniChart
              title="Heart Rate"
              data={dashboard.heartRateHistory.map(hr => ({
                value: hr.heartRate,
                timestamp: hr.timestamp
              }))}
              color="#FF3B30"
              unit="BPM"
            />
          )}

          {/* Oxygen Chart */}
          {dashboard?.oxygenHistory && dashboard.oxygenHistory.length > 0 && (
            <MiniChart
              title="Blood Oxygen"
              data={dashboard.oxygenHistory.map(ox => ({
                value: ox.oxValue,
                timestamp: ox.timestamp
              }))}
              color="#007AFF"
              unit="%"
            />
          )}

          {/* Steps Chart */}
          {dashboard?.activityHistory && dashboard.activityHistory.length > 0 && (
            <MiniChart
              title="Daily Steps"
              data={dashboard.activityHistory.map(act => ({
                value: act.steps,
                timestamp: act.timestamp
              }))}
              color="#34C759"
              unit="steps"
            />
          )}
        </View>

        {/* Last Sync Info */}
        {dashboard?.lastSyncTime && (
          <Text style={styles.lastSync}>
            Last sync: {new Date(dashboard.lastSyncTime).toLocaleString()}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F2F2F7'
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: '#FFF'
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#000'
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 2
  },
  headerLeft: {
    flex: 1
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10
  },
  headerSyncButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 10
  },
  headerSyncButtonDisabled: {
    backgroundColor: '#C7C7CC'
  },
  content: {
    flex: 1
  },
  contentContainer: {
    paddingBottom: 30
  },
  syncProgress: {
    backgroundColor: '#FFF',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E5E5EA'
  },
  syncHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8
  },
  syncText: {
    fontSize: 14,
    color: '#007AFF',
    marginLeft: 8
  },
  syncDetails: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 5
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E5EA',
    borderRadius: 2,
    overflow: 'hidden'
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2
  },
  quickStats: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    padding: 10
  },
  section: {
    marginTop: 20,
    paddingHorizontal: 20
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 15
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginLeft: 10,
    color: '#000'
  },
  sleepCard: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  sleepMain: {
    alignItems: 'center',
    marginBottom: 20
  },
  sleepDuration: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#5856D6'
  },
  sleepLabel: {
    fontSize: 14,
    color: '#8E8E93',
    marginTop: 5
  },
  sleepDetails: {
    flexDirection: 'row',
    justifyContent: 'space-around'
  },
  sleepStage: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  sleepStageText: {
    fontSize: 14,
    color: '#8E8E93',
    marginLeft: 5
  },
  sleepScore: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: '#E5E5EA',
    alignItems: 'center'
  },
  sleepScoreLabel: {
    fontSize: 14,
    color: '#8E8E93'
  },
  sleepScoreValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#5856D6',
    marginTop: 5
  },
  activityGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  activityItem: {
    alignItems: 'center'
  },
  activityValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#000',
    marginTop: 8
  },
  activityLabel: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 4
  },
  syncButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#007AFF',
    marginHorizontal: 20,
    marginTop: 30,
    paddingVertical: 15,
    borderRadius: 12,
    shadowColor: '#007AFF',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5
  },
  syncButtonDisabled: {
    backgroundColor: '#8E8E93',
    shadowOpacity: 0.1
  },
  syncButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8
  },
  lastSync: {
    textAlign: 'center',
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 10,
    marginBottom: 20
  }
});

export default HealthDashboardScreen;