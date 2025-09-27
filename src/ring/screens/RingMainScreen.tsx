/**
 * Main Ring App Screen
 * Orchestrates the complete Ring device flow following official guide
 */

import React, { useEffect, useState } from 'react';
import {
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RingDeviceDiscovery } from '../components/RingDeviceDiscovery';
import HealthDashboardScreen from './HealthDashboard';
import { RingHealthDashboard } from '../components/RingHealthDashboard';
import { ConnectionState, cleanRingConnection } from '../ring/connection/CleanRingConnection';
import { devicePersistence } from '../ring/persistence/EnhancedDevicePersistence';
import { useRingStore } from '../ring/state/ringStore';

type TabType = 'discover' | 'health' | 'settings';

export const RingMainScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<TabType>('discover');
  const [connectionState, setConnectionState] = useState<ConnectionState>(ConnectionState.IDLE);
  const [autoConnectAttempted, setAutoConnectAttempted] = useState(false);
  const [hasAutoSwitched, setHasAutoSwitched] = useState(false);

  const connectionStatus = useRingStore(state => state.connectionStatus);
  const isConnected = connectionStatus?.isConnected || false;

  // Watch for connection status changes directly from the store
  useEffect(() => {
    if (isConnected && !hasAutoSwitched) {
      console.log('🔄 Store connection detected, switching to health tab immediately...');
      setActiveTab('health');
      setHasAutoSwitched(true);
    } else if (!isConnected) {
      setHasAutoSwitched(false);
    }
  }, [isConnected, hasAutoSwitched]);

  useEffect(() => {
    // Check for paired device on app launch
    checkAndAutoConnect();

    let syncTriggered = false;

    // Monitor connection phase changes
    const interval = setInterval(() => {
      const state = cleanRingConnection.getState();
      setConnectionState(state);

      // Also check the store's connection status
      const storeConnected = useRingStore.getState().connectionStatus?.isConnected;

      // Auto-switch to health tab when connected (remove activeTab condition, add hasAutoSwitched check)
      if ((state === ConnectionState.CONNECTED || storeConnected) && !hasAutoSwitched) {
        console.log('🔄 Connection detected, switching to health tab...');
        setActiveTab('health');
        setHasAutoSwitched(true);
      }

      // Reset auto-switch flag when disconnected
      if (!storeConnected && state === ConnectionState.IDLE) {
        setHasAutoSwitched(false);
      }

      // Trigger health sync when device is connected
      if ((state === ConnectionState.CONNECTED || storeConnected) && !syncTriggered) {
        syncTriggered = true;
        console.log('📊 Device in monitoring phase, starting health sync...');

        // Start health data sync after device is ready
        setTimeout(async () => {
          try {
            const { healthDataSyncService } = await import('../ring/services/HealthDataSyncService');
            await healthDataSyncService.startSync();
            // Enable auto-sync every 30 minutes to prevent overwhelming the ring
            healthDataSyncService.enableAutoSync(30);
            console.log('✅ Health sync started from main screen with 30 min auto-sync');
          } catch (error) {
            console.error('Failed to start health sync:', error);
          }
        }, 2000);
      }

      // Reset sync trigger when disconnected
      if (state === ConnectionState.IDLE && !storeConnected) {
        syncTriggered = false;
      }
    }, 1000);

    return () => clearInterval(interval);
  }, []);
  
  const checkAndAutoConnect = async () => {
    if (autoConnectAttempted) return;
    setAutoConnectAttempted(true);
    
    try {
      const status = await devicePersistence.getDeviceStatus();
      
      if (status.hasPairedDevice && status.autoConnectEnabled) {
        console.log('🔄 Auto-connecting to paired device...');
        const connected = await cleanRingConnection.autoConnect();
        
        if (connected) {
          setActiveTab('health');
        }
      }
    } catch (error) {
      console.error('Auto-connect failed:', error);
    }
  };
  
  const handleDisconnect = async () => {
    await cleanRingConnection.disconnect();
    setActiveTab('discover');
  };
  
  const renderConnectionStatus = () => {
    const phaseMessages: Record<ConnectionState, string> = {
      [ConnectionState.IDLE]: 'Not connected',
      [ConnectionState.SCANNING]: 'Scanning for devices...',
      [ConnectionState.CONNECTING]: 'Connecting...',
      [ConnectionState.CONNECTED]: 'Connected & monitoring',
      [ConnectionState.ERROR]: 'Connection error',
    };
    
    const statusColor = isConnected ? '#4CAF50' : 
                       connectionState === ConnectionState.ERROR ? '#F44336' : '#FFC107';
    
    return (
      <View style={[styles.statusBar, { backgroundColor: statusColor }]}>
        <View style={styles.statusContent}>
          <View style={[styles.statusDot, { backgroundColor: '#FFF' }]} />
          <Text style={styles.statusText}>
            {phaseMessages[connectionState]}
          </Text>
        </View>
        {isConnected && (
          <TouchableOpacity onPress={handleDisconnect} style={styles.disconnectButton}>
            <Text style={styles.disconnectText}>Disconnect</Text>
          </TouchableOpacity>
        )}
      </View>
    );
  };
  
  const renderTabs = () => (
    <View style={styles.tabBar}>
      <TouchableOpacity
        style={[styles.tab, activeTab === 'discover' && styles.activeTab]}
        onPress={() => setActiveTab('discover')}
      >
        <Text style={[styles.tabText, activeTab === 'discover' && styles.activeTabText]}>
          Discover
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[
          styles.tab,
          activeTab === 'health' && styles.activeTab,
          !isConnected && styles.disabledTab
        ]}
        onPress={() => isConnected && setActiveTab('health')}
        disabled={!isConnected}
      >
        <Text style={[
          styles.tabText,
          activeTab === 'health' && styles.activeTabText,
          !isConnected && styles.disabledTabText
        ]}>
          Health
        </Text>
      </TouchableOpacity>
      
      <TouchableOpacity
        style={[styles.tab, activeTab === 'settings' && styles.activeTab]}
        onPress={() => setActiveTab('settings')}
      >
        <Text style={[styles.tabText, activeTab === 'settings' && styles.activeTabText]}>
          Settings
        </Text>
      </TouchableOpacity>
    </View>
  );
  
  const renderSettings = () => {
    const [prefs, setPrefs] = useState({
      autoConnect: true,
      autoSync: true,
      syncInterval: 15,
      notificationsEnabled: true,
    });
    
    useEffect(() => {
      loadPreferences();
    }, []);
    
    const loadPreferences = async () => {
      const stored = await devicePersistence.getUserPreferences();
      setPrefs(stored);
    };
    
    const togglePreference = async (key: keyof typeof prefs) => {
      const newValue = !prefs[key];
      setPrefs(prev => ({ ...prev, [key]: newValue }));
      await devicePersistence.saveUserPreferences({ [key]: newValue });
    };
    
    return (
      <ScrollView style={styles.settingsContainer}>
        <View style={styles.settingsSection}>
          <Text style={styles.settingsTitle}>Connection Settings</Text>
          
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => togglePreference('autoConnect')}
          >
            <Text style={styles.settingLabel}>Auto-connect to paired device</Text>
            <View style={[styles.toggle, prefs.autoConnect && styles.toggleActive]} />
          </TouchableOpacity>
          
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => togglePreference('autoSync')}
          >
            <Text style={styles.settingLabel}>Auto-sync health data</Text>
            <View style={[styles.toggle, prefs.autoSync && styles.toggleActive]} />
          </TouchableOpacity>
        </View>
        
        <View style={styles.settingsSection}>
          <Text style={styles.settingsTitle}>Notifications</Text>
          
          <TouchableOpacity
            style={styles.settingRow}
            onPress={() => togglePreference('notificationsEnabled')}
          >
            <Text style={styles.settingLabel}>Enable notifications</Text>
            <View style={[styles.toggle, prefs.notificationsEnabled && styles.toggleActive]} />
          </TouchableOpacity>
        </View>
        
        <TouchableOpacity
          style={styles.resetButton}
          onPress={async () => {
            await devicePersistence.clearAllData();
            setActiveTab('discover');
          }}
        >
          <Text style={styles.resetButtonText}>Unpair Device & Reset</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  };
  
  return (
    <SafeAreaView style={styles.container}>
      {renderConnectionStatus()}
      {renderTabs()}
      
      <View style={styles.content}>
        {activeTab === 'discover' && <RingDeviceDiscovery />}
        {activeTab === 'health' && <RingHealthDashboard />}
        {activeTab === 'settings' && renderSettings()}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  statusBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  statusContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  statusText: {
    color: '#FFF',
    fontSize: 14,
    fontWeight: '600',
  },
  disconnectButton: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
  },
  disconnectText: {
    color: '#FFF',
    fontSize: 12,
    fontWeight: '600',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
  },
  activeTab: {
    borderBottomWidth: 2,
    borderBottomColor: '#2196F3',
  },
  disabledTab: {
    opacity: 0.5,
  },
  tabText: {
    fontSize: 14,
    color: '#666',
    fontWeight: '500',
  },
  activeTabText: {
    color: '#2196F3',
    fontWeight: '600',
  },
  disabledTabText: {
    color: '#CCC',
  },
  content: {
    flex: 1,
  },
  settingsContainer: {
    flex: 1,
    backgroundColor: '#F5F5F5',
  },
  settingsSection: {
    backgroundColor: '#FFF',
    marginBottom: 8,
    padding: 16,
  },
  settingsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 12,
  },
  settingRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  settingLabel: {
    fontSize: 14,
    color: '#333',
  },
  toggle: {
    width: 48,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#CCC',
  },
  toggleActive: {
    backgroundColor: '#4CAF50',
  },
  resetButton: {
    margin: 16,
    padding: 16,
    backgroundColor: '#F44336',
    borderRadius: 8,
    alignItems: 'center',
  },
  resetButtonText: {
    color: '#FFF',
    fontSize: 16,
    fontWeight: '600',
  },
});