/**
 * Ring Health Monitor Component
 * Real-time health data display with monitoring controls
 * Based on YoiHealth pattern for continuous health monitoring
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ringService } from '../../src/ring/RingService';
import { useRingStore } from '../../src/ring/state/ringStore';
import RingReconnectionBanner from './RingReconnectionBanner';

interface RingHealthMonitorProps {
  onBack: () => void;
}

export default function RingHealthMonitor({ onBack }: RingHealthMonitorProps) {
  const [isCollecting, setIsCollecting] = useState(false);
  const [isLoadingTemp, setIsLoadingTemp] = useState(false);
  const [isLoadingSteps, setIsLoadingSteps] = useState(false);

  // Ring store state
  const {
    currentHealthReading,
    healthReadings,
    isHealthMonitoringActive,
    temperature,
    steps,
    setHealthMonitoringActive,
  } = useRingStore();

  // Debug: Log when health readings change
  useEffect(() => {
    if (healthReadings.length > 0) {
      console.log(`📈 Health readings updated: ${healthReadings.length} total readings`);
      const latest = healthReadings[healthReadings.length - 1];
      console.log(`Latest: HR=${latest.heartRate} bpm, SpO2=${latest.bloodOxygen}%`);
    }
  }, [healthReadings.length]);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (isHealthMonitoringActive) {
        ringService.stopRealTimeHealthMonitoring().catch(console.error);
      }
    };
  }, [isHealthMonitoringActive]);

  /**
   * Start real-time health monitoring
   */
  const handleStartMonitoring = async () => {
    try {
      setIsCollecting(true);
      
      // ✅ This method properly registers listeners BEFORE starting monitoring
      await ringService.startRealTimeHealthMonitoring();
      setHealthMonitoringActive(true);
      setIsCollecting(false);
      
      Alert.alert(
        'Health Monitoring Started',
        'Ring is now collecting real-time heart rate and blood oxygen data. You can see the readings below.',
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Failed to start health monitoring:', error);
      setIsCollecting(false);
      Alert.alert(
        'Monitoring Error',
        'Failed to start health monitoring. Please ensure your Ring is connected and try again.',
        [{ text: 'OK' }]
      );
    }
  };

  /**
   * Stop real-time health monitoring
   */
  const handleStopMonitoring = async () => {
    try {
      setIsCollecting(false);
      await ringService.stopRealTimeHealthMonitoring();
      setHealthMonitoringActive(false);
      
      Alert.alert(
        'Health Monitoring Stopped',
        `Monitoring session completed. Collected ${healthReadings.length} readings.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      console.error('Failed to stop health monitoring:', error);
      Alert.alert(
        'Stop Error',
        'Failed to stop health monitoring gracefully.',
        [{ text: 'OK' }]
      );
    }
  };

  /**
   * Start timed health data collection
   */
  const handleTimedCollection = async (durationMinutes: number) => {
    try {
      Alert.alert(
        'Timed Collection',
        `Starting ${durationMinutes}-minute health data collection...`,
        [{ text: 'Cancel' }, { text: 'Start', onPress: () => startTimedCollection(durationMinutes) }]
      );
    } catch (error) {
      console.error('Timed collection error:', error);
    }
  };

  const startTimedCollection = async (durationMinutes: number) => {
    try {
      setIsCollecting(true);
      console.log(`🩺 Starting ${durationMinutes}-minute health data collection test...`);
      
      // ✅ This method registers listeners BEFORE starting monitoring
      const readings = await ringService.startHealthDataCollection(durationMinutes);
      setIsCollecting(false);
      
      console.log(`📈 Collection complete! Got ${readings.length} readings:`);
      readings.forEach((reading, index) => {
        console.log(`Reading ${index + 1}: HR=${reading.heartRate} bpm, SpO2=${reading.bloodOxygen}%`);
      });
      
      Alert.alert(
        'Collection Complete',
        `Successfully collected ${readings.length} health readings over ${durationMinutes} minutes.\n\nCheck the console for detailed readings.`,
        [{ text: 'OK' }]
      );
    } catch (error) {
      setIsCollecting(false);
      console.error('❌ Timed collection failed:', error);
      Alert.alert(
        'Collection Failed',
        'Health data collection failed. Please ensure your Ring is connected and try again.\n\nCheck the console for error details.',
        [{ text: 'OK' }]
      );
    }
  };

  /**
   * Get temperature reading
   */
  const handleGetTemperature = async () => {
    try {
      setIsLoadingTemp(true);
      const temp = await ringService.getTemperatureReading();
      setIsLoadingTemp(false);
      
      if (temp !== null) {
        Alert.alert(
          'Temperature Reading',
          `Current finger temperature: ${temp.toFixed(1)}°C`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Temperature Error',
          'Unable to get temperature reading. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      setIsLoadingTemp(false);
      console.error('Temperature reading failed:', error);
      Alert.alert(
        'Temperature Error',
        'Failed to get temperature reading.',
        [{ text: 'OK' }]
      );
    }
  };

  /**
   * Get current step count
   */
  const handleGetSteps = async () => {
    try {
      setIsLoadingSteps(true);
      const stepCount = await ringService.getCurrentSteps();
      setIsLoadingSteps(false);
      
      if (stepCount !== null) {
        Alert.alert(
          'Step Count',
          `Current steps: ${stepCount.toLocaleString()}`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Step Count Error',
          'Unable to get step count. Please try again.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      setIsLoadingSteps(false);
      console.error('Step count failed:', error);
      Alert.alert(
        'Step Count Error',
        'Failed to get step count.',
        [{ text: 'OK' }]
      );
    }
  };

  /**
   * Format timestamp for display
   */
  const formatTime = (timestamp: number): string => {
    return new Date(timestamp).toLocaleTimeString();
  };

  return (
    <SafeAreaView style={styles.container}>
      <RingReconnectionBanner />
      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack}>
          <Text style={styles.backButtonText}>← Back</Text>
        </TouchableOpacity>
        <Text style={styles.title}>Health Monitor</Text>
      </View>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Current Health Reading */}
        <View style={styles.currentReadingCard}>
          <Text style={styles.sectionTitle}>Current Reading</Text>
          {currentHealthReading ? (
            <View style={styles.healthData}>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{currentHealthReading.heartRate}</Text>
                <Text style={styles.metricUnit}>bpm</Text>
                <Text style={styles.metricLabel}>Heart Rate</Text>
              </View>
              <View style={styles.metric}>
                <Text style={styles.metricValue}>{currentHealthReading.bloodOxygen}</Text>
                <Text style={styles.metricUnit}>%</Text>
                <Text style={styles.metricLabel}>SpO2</Text>
              </View>
            </View>
          ) : (
            <View style={styles.noDataContainer}>
              <Text style={styles.noDataText}>
                {isHealthMonitoringActive ? '🔄 Waiting for data...' : '📊 Start monitoring to see real-time data'}
              </Text>
            </View>
          )}
          {currentHealthReading && (
            <Text style={styles.timestampText}>
              Last updated: {formatTime(currentHealthReading.timestamp)}
            </Text>
          )}
        </View>

        {/* Quick Metrics */}
        <View style={styles.quickMetricsCard}>
          <Text style={styles.sectionTitle}>Quick Metrics</Text>
          <View style={styles.quickMetricsRow}>
            <View style={styles.quickMetric}>
              <Text style={styles.quickMetricValue}>
                {temperature !== null ? `${temperature.toFixed(1)}°C` : '--'}
              </Text>
              <Text style={styles.quickMetricLabel}>Temperature</Text>
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={handleGetTemperature}
                disabled={isLoadingTemp}
              >
                {isLoadingTemp ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Text style={styles.refreshButtonText}>🔄</Text>
                )}
              </TouchableOpacity>
            </View>

            <View style={styles.quickMetric}>
              <Text style={styles.quickMetricValue}>
                {steps !== null ? steps.toLocaleString() : '--'}
              </Text>
              <Text style={styles.quickMetricLabel}>Steps</Text>
              <TouchableOpacity
                style={styles.refreshButton}
                onPress={handleGetSteps}
                disabled={isLoadingSteps}
              >
                {isLoadingSteps ? (
                  <ActivityIndicator size="small" color="#007AFF" />
                ) : (
                  <Text style={styles.refreshButtonText}>🔄</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Monitoring Controls */}
        <View style={styles.controlsCard}>
          <Text style={styles.sectionTitle}>Monitoring Controls</Text>
          
          {/* Real-time Monitoring */}
          <View style={styles.controlSection}>
            <Text style={styles.controlTitle}>Real-time Monitoring</Text>
            <Text style={styles.controlDescription}>
              Continuous heart rate and blood oxygen monitoring
            </Text>
            <TouchableOpacity
              style={[
                styles.controlButton,
                isHealthMonitoringActive ? styles.stopButton : styles.startButton
              ]}
              onPress={isHealthMonitoringActive ? handleStopMonitoring : handleStartMonitoring}
              disabled={isCollecting && !isHealthMonitoringActive}
            >
              {isCollecting && !isHealthMonitoringActive ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.controlButtonText}>
                  {isHealthMonitoringActive ? '⏹️ Stop Monitoring' : '▶️ Start Monitoring'}
                </Text>
              )}
            </TouchableOpacity>
          </View>

          {/* Timed Collection */}
          <View style={styles.controlSection}>
            <Text style={styles.controlTitle}>Timed Collection</Text>
            <Text style={styles.controlDescription}>
              Collect data for a specific duration
            </Text>
            <View style={styles.timedButtons}>
              <TouchableOpacity
                style={styles.timedButton}
                onPress={() => handleTimedCollection(0.1)} // 6 seconds for quick test
                disabled={isCollecting}
              >
                <Text style={styles.timedButtonText}>Test (6s)</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.timedButton}
                onPress={() => handleTimedCollection(1)}
                disabled={isCollecting}
              >
                <Text style={styles.timedButtonText}>1 min</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.timedButton}
                onPress={() => handleTimedCollection(2)}
                disabled={isCollecting}
              >
                <Text style={styles.timedButtonText}>2 min</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Recent Readings */}
        <View style={styles.readingsCard}>
          <Text style={styles.sectionTitle}>
            Recent Readings ({healthReadings.length})
          </Text>
          {healthReadings.length > 0 ? (
            <ScrollView style={styles.readingsList} nestedScrollEnabled>
              {healthReadings.slice(-10).reverse().map((reading, index) => (
                <View key={index} style={styles.readingItem}>
                  <Text style={styles.readingTime}>
                    {formatTime(reading.timestamp)}
                  </Text>
                  <Text style={styles.readingData}>
                    HR: {reading.heartRate} bpm • SpO2: {reading.bloodOxygen}%
                  </Text>
                </View>
              ))}
            </ScrollView>
          ) : (
            <View style={styles.noReadingsContainer}>
              <Text style={styles.noReadingsText}>
                No readings yet. Start monitoring to collect data.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    paddingBottom: 10,
  },
  backButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginRight: 16,
  },
  backButtonText: {
    color: '#007AFF',
    fontSize: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  
  // Current Reading Card
  currentReadingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  healthData: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginVertical: 16,
  },
  metric: {
    alignItems: 'center',
  },
  metricValue: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#007AFF',
  },
  metricUnit: {
    fontSize: 14,
    color: '#666',
    marginTop: -4,
  },
  metricLabel: {
    fontSize: 14,
    color: '#999',
    marginTop: 4,
  },
  noDataContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  noDataText: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  timestampText: {
    textAlign: 'center',
    fontSize: 12,
    color: '#999',
    marginTop: 8,
  },

  // Quick Metrics Card
  quickMetricsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  quickMetricsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: 16,
  },
  quickMetric: {
    alignItems: 'center',
    flex: 1,
  },
  quickMetricValue: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
  },
  quickMetricLabel: {
    fontSize: 14,
    color: '#666',
    marginTop: 4,
  },
  refreshButton: {
    marginTop: 8,
    padding: 8,
  },
  refreshButtonText: {
    fontSize: 16,
  },

  // Controls Card
  controlsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 16,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  controlSection: {
    marginBottom: 24,
  },
  controlTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
  },
  controlDescription: {
    fontSize: 14,
    color: '#666',
    marginBottom: 12,
  },
  controlButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  startButton: {
    backgroundColor: '#4CAF50',
  },
  stopButton: {
    backgroundColor: '#FF5722',
  },
  controlButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  timedButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  timedButton: {
    backgroundColor: '#007AFF',
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    minWidth: 80,
    alignItems: 'center',
  },
  timedButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '500',
  },

  // Readings Card
  readingsCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 20,
    marginBottom: 20,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  readingsList: {
    maxHeight: 200,
    marginTop: 12,
  },
  readingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  readingTime: {
    fontSize: 12,
    color: '#666',
    flex: 1,
  },
  readingData: {
    fontSize: 12,
    color: '#333',
    flex: 2,
    textAlign: 'right',
  },
  noReadingsContainer: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  noReadingsText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },

  // Common
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
});