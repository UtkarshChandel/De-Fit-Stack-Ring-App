/**
 * Ring Dashboard Component
 * Clean UI for Ring device connection and health monitoring
 */

import React, { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Platform,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View
} from 'react-native';
import { check, request, PERMISSIONS, RESULTS } from 'react-native-permissions';
import { SmartRingX1 } from '../../types/ring';
import { cleanRingConnection, ConnectionState } from '../../ring/connection/CleanRingConnection';
import { useRingStore } from '../../ring/state/ringStore';
import { initializeRing } from '../../ring/initializeRing';
import { testRingDetection } from '../../utils/testRingDetection';

export const RingDashboard: React.FC = () => {
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.IDLE);
  const [isScanning, setIsScanning] = useState(false);
  const [discoveredDevices, setDiscoveredDevices] = useState<SmartRingX1[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [isInitializing, setIsInitializing] = useState(true);
  const [isMonitoring, setIsMonitoring] = useState(false);
  
  // Store data
  const deviceInfo1 = useRingStore(state => state.deviceInfo1);
  const deviceInfo2 = useRingStore(state => state.deviceInfo2);
  const batteryData = useRingStore(state => state.batteryData);
  const currentHealth = useRingStore(state => state.currentHealth);
  
  const isConnected = connectionState === ConnectionState.CONNECTED;
  
  useEffect(() => {
    // Initialize Ring services first
    initializeServices();
    
    // Poll connection state
    const interval = setInterval(() => {
      setConnectionState(cleanRingConnection.getState());
    }, 1000);
    
    return () => clearInterval(interval);
  }, []);
  
  const initializeServices = async () => {
    try {
      // Request permissions first on Android
      if (Platform.OS === 'android') {
        await requestBluetoothPermissions();
      }
      
      await initializeRing();
      setIsInitializing(false);
      
      // Check if already connected after initialization
      if (cleanRingConnection.isConnected()) {
        setConnectionState(ConnectionState.CONNECTED);
      }
    } catch (error) {
      console.error('Failed to initialize:', error);
      setIsInitializing(false);
    }
  };
  
  const requestBluetoothPermissions = async (): Promise<boolean> => {
    try {
      if (Platform.OS === 'android') {
        const androidVersion = Platform.Version;
        
        if (androidVersion >= 31) {
          // Android 12+ permissions
          const scanResult = await request(PERMISSIONS.ANDROID.BLUETOOTH_SCAN);
          const connectResult = await request(PERMISSIONS.ANDROID.BLUETOOTH_CONNECT);
          const locationResult = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
          
          return scanResult === RESULTS.GRANTED && 
                 connectResult === RESULTS.GRANTED && 
                 locationResult === RESULTS.GRANTED;
        } else {
          // Pre-Android 12
          const locationResult = await request(PERMISSIONS.ANDROID.ACCESS_FINE_LOCATION);
          return locationResult === RESULTS.GRANTED;
        }
      } else {
        // iOS permissions are handled automatically
        return true;
      }
    } catch (error) {
      console.error('Permission request failed:', error);
      return false;
    }
  };
  
  const handleScan = async () => {
    if (isScanning) return;
    
    // Check permissions first
    const hasPermissions = await requestBluetoothPermissions();
    if (!hasPermissions) {
      Alert.alert(
        'Permissions Required',
        'Bluetooth and location permissions are required to scan for Ring devices.',
        [{ text: 'OK' }]
      );
      return;
    }
    
    setIsScanning(true);
    setDiscoveredDevices([]);
    
    try {
      const devices = await cleanRingConnection.startScan(10000);
      setDiscoveredDevices(devices);
    } catch (error) {
      console.error('Scan failed:', error);
      Alert.alert('Scan Error', 'Failed to scan for devices. Please ensure Bluetooth is enabled.');
    } finally {
      setIsScanning(false);
    }
  };
  
  
  const handleConnect = async (deviceId: string) => {
    setConnectionState(ConnectionState.CONNECTING);
    
    const success = await cleanRingConnection.connectAndSetup(deviceId);
    
    if (success) {
      setConnectionState(ConnectionState.CONNECTED);
      setDiscoveredDevices([]);
    } else {
      setConnectionState(ConnectionState.IDLE);
    }
  };
  
  const handleDisconnect = async () => {
    await cleanRingConnection.disconnect();
    setConnectionState(ConnectionState.IDLE);
  };
  
  const handleRefresh = async () => {
    setRefreshing(true);
    
    try {
      await cleanRingConnection.getHealthData();
      await cleanRingConnection.fetchHistoricalData();
    } catch (error) {
      console.error('Refresh failed:', error);
    } finally {
      setRefreshing(false);
    }
  };
  
  const handleToggleMonitoring = async () => {
    try {
      if (isMonitoring) {
        // Stop health monitoring
        await cleanRingConnection.stopHealthMonitoring();
        setIsMonitoring(false);
        Alert.alert('Health Monitoring', 'Health monitoring stopped');
      } else {
        // Start health monitoring
        const started = await cleanRingConnection.startHealthMonitoring();
        if (started) {
          setIsMonitoring(true);
          Alert.alert('Health Monitoring', 'Health monitoring started. The ring will collect data continuously.');
        } else {
          Alert.alert('Error', 'Failed to start health monitoring');
        }
      }
    } catch (error) {
      console.error('Failed to toggle monitoring:', error);
      Alert.alert('Error', 'Failed to toggle health monitoring');
    }
  };
  
  const renderConnectionStatus = () => {
    const statusMessages = {
      [ConnectionState.IDLE]: 'Not Connected',
      [ConnectionState.SCANNING]: 'Scanning...',
      [ConnectionState.CONNECTING]: 'Connecting...',
      [ConnectionState.CONNECTED]: 'Connected',
      [ConnectionState.ERROR]: 'Connection Error'
    };
    
    const statusColors = {
      [ConnectionState.IDLE]: '#666',
      [ConnectionState.SCANNING]: '#FFC107',
      [ConnectionState.CONNECTING]: '#2196F3',
      [ConnectionState.CONNECTED]: '#4CAF50',
      [ConnectionState.ERROR]: '#F44336'
    };
    
    return (
      <View style={[styles.statusBar, { backgroundColor: statusColors[connectionState] }]}>
        <Text style={styles.statusText}>{statusMessages[connectionState]}</Text>
        {isConnected && (
          <TouchableOpacity onPress={handleDisconnect}>
            <Text style={styles.disconnectText}>Disconnect</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };
  
  const renderDeviceInfo = () => {
    if (!isConnected || !deviceInfo1 || !deviceInfo2) return null;
    
    return (
      <View style={styles.infoCard}>
        <Text style={styles.infoTitle}>Smart Ring Information</Text>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Model:</Text>
          <Text style={styles.infoValue}>SR09 Series</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Serial Number:</Text>
          <Text style={styles.infoValue}>{deviceInfo2.sn || 'Unknown'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Firmware Version:</Text>
          <Text style={styles.infoValue}>{deviceInfo1.deviceVer || 'Unknown'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ring Color:</Text>
          <Text style={styles.infoValue}>{getColorName(deviceInfo1.color)}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Ring Size:</Text>
          <Text style={styles.infoValue}>Size {deviceInfo1.size || 'Unknown'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Battery Level:</Text>
          <Text style={styles.infoValue}>{batteryData?.batteryPer || 0}% {batteryData?.status === 'charging' ? '🔌' : ''}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>Binding Status:</Text>
          <Text style={styles.infoValue}>{deviceInfo2.bindStatus === 'Bind' ? '✅ Bound' : '⚠️ Not Bound'}</Text>
        </View>
        <View style={styles.infoRow}>
          <Text style={styles.infoLabel}>MAC Address:</Text>
          <Text style={styles.infoValue}>{deviceInfo1.bleAddress || 'Unknown'}</Text>
        </View>
      </View>
    );
  };
  
  const renderHealthData = () => {
    if (!isConnected || !currentHealth) return null;
    
    return (
      <View style={styles.healthCard}>
        <Text style={styles.healthTitle}>Health Metrics</Text>
        
        <View style={styles.metricsGrid}>
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Heart Rate</Text>
            <Text style={styles.metricValue}>{currentHealth.heartRate || '--'}</Text>
            <Text style={styles.metricUnit}>bpm</Text>
          </View>
          
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Steps</Text>
            <Text style={styles.metricValue}>{currentHealth.steps || 0}</Text>
            <Text style={styles.metricUnit}>steps</Text>
          </View>
          
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>SpO2</Text>
            <Text style={styles.metricValue}>{currentHealth.spO2 || '--'}</Text>
            <Text style={styles.metricUnit}>%</Text>
          </View>
          
          <View style={styles.metric}>
            <Text style={styles.metricLabel}>Temperature</Text>
            <Text style={styles.metricValue}>{currentHealth.temperature?.toFixed(1) || '--'}</Text>
            <Text style={styles.metricUnit}>°C</Text>
          </View>
        </View>
        
        <View style={styles.buttonContainer}>
          <TouchableOpacity style={styles.refreshButton} onPress={handleRefresh}>
            <Text style={styles.refreshButtonText}>Refresh Data</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={[styles.monitorButton, isMonitoring && styles.monitorButtonActive]} 
            onPress={handleToggleMonitoring}
          >
            <Text style={styles.monitorButtonText}>
              {isMonitoring ? 'Stop Monitoring' : 'Start Health Monitoring'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };
  
  const renderDiscovery = () => {
    if (isConnected) return null;
    
    return (
      <View style={styles.discoveryCard}>
        <TouchableOpacity
          style={[styles.scanButton, isScanning && styles.scanButtonActive]}
          onPress={handleScan}
          disabled={isScanning || connectionState === ConnectionState.CONNECTING}
        >
          {isScanning ? (
            <ActivityIndicator color="#FFF" />
          ) : (
            <Text style={styles.scanButtonText}>Scan for Smart Ring</Text>
          )}
        </TouchableOpacity>
        
        {discoveredDevices.map(device => (
          <TouchableOpacity
            key={device.id}
            style={styles.deviceItem}
            onPress={() => handleConnect(device.id)}
            disabled={connectionState === ConnectionState.CONNECTING}
          >
            <View>
              <Text style={styles.deviceName}>{device.name}</Text>
              <Text style={styles.deviceId}>{device.id}</Text>
            </View>
            <Text style={styles.deviceRssi}>{device.rssi} dBm</Text>
          </TouchableOpacity>
        ))}
        
        {discoveredDevices.length === 0 && !isScanning && (
          <Text style={styles.noDevicesText}>
            No Smart Ring devices found. Make sure your Ring (SR09_xxxx) is powered on and nearby.
            {"\n"}Note: Ring chargers (SR09WC) are ignored.
          </Text>
        )}
      </View>
    );
  };
  
  if (isInitializing) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#2196F3" />
          <Text style={styles.loadingText}>Initializing Ring Services...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container}>
      {renderConnectionStatus()}
      
      <ScrollView
        style={styles.content}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {renderDiscovery()}
        {renderDeviceInfo()}
        {renderHealthData()}
      </ScrollView>
    </SafeAreaView>
  );
};

function getColorName(colorCode: number): string {
  const colors: Record<number, string> = {
    0: 'Black',
    1: 'Silver',
    2: 'Gold',
    3: 'Rose Gold',
    4: 'Blue',
    5: 'Red'
  };
  return colors[colorCode] || 'Unknown';
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  statusBar: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  disconnectText: {
    color: '#FFF',
    fontSize: 14,
    textDecorationLine: 'underline',
  },
  content: {
    flex: 1,
  },
  discoveryCard: {
    backgroundColor: '#FFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  scanButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  scanButtonActive: {
    backgroundColor: '#F44336',
  },
  scanButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  deviceItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
  },
  deviceId: {
    fontSize: 12,
    color: '#666',
    marginTop: 2,
  },
  deviceRssi: {
    fontSize: 14,
    color: '#999',
  },
  noDevicesText: {
    textAlign: 'center',
    color: '#999',
    fontSize: 14,
    marginTop: 16,
  },
  infoCard: {
    backgroundColor: '#FFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  infoTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  infoLabel: {
    fontSize: 14,
    color: '#666',
  },
  infoValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  healthCard: {
    backgroundColor: '#FFF',
    margin: 16,
    padding: 16,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  healthTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    marginBottom: 16,
  },
  metricsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -8,
  },
  metric: {
    width: '50%',
    padding: 8,
    alignItems: 'center',
    marginBottom: 16,
  },
  metricLabel: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  metricValue: {
    fontSize: 24,
    fontWeight: '600',
    color: '#2196F3',
  },
  metricUnit: {
    fontSize: 12,
    color: '#999',
  },
  refreshButton: {
    backgroundColor: '#4CAF50',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  refreshButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  buttonContainer: {
    marginTop: 8,
  },
  monitorButton: {
    backgroundColor: '#2196F3',
    paddingVertical: 12,
    borderRadius: 8,
    alignItems: 'center',
    marginTop: 8,
  },
  monitorButtonActive: {
    backgroundColor: '#F44336',
  },
  monitorButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
});