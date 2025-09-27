/**
 * Ring App Component
 * Main component that manages Ring connection flow and navigation
 */

import React, { useState, useEffect } from 'react';
import { View, StatusBar, Alert, Platform } from 'react-native';

import RingConnectionScreen from './RingConnectionScreen';
import RingDashboard from './RingDashboard';
import RingHealthMonitor from './RingHealthMonitor';
import RingReconnectingScreen from './RingReconnectingScreen';
import { SmartRingX1 } from '../../src/types/ring';
import { useRingStore } from '../../src/ring/state/ringStore';
import { ringService } from '../../src/ring/RingService';
import { DevicePersistenceService } from '../../src/ring/persistence/DevicePersistence';

export default function RingApp() {
  const [currentScreen, setCurrentScreen] = useState<'reconnecting' | 'connection' | 'dashboard' | 'healthMonitor'>('connection');
  const [connectedRing, setConnectedRing] = useState<SmartRingX1 | null>(null);
  const [storedDeviceName, setStoredDeviceName] = useState<string>('SmartRing X1');

  const { isDeviceConnected } = useRingStore();

  useEffect(() => {
    const initializeApp = async () => {
      try {
        // Initialize Ring service first
        await ringService.initialize();
        console.log('✅ Ring service initialization completed');
        
        // Check if we already have an active connection
        if (isDeviceConnected()) {
          const store = useRingStore.getState();
          if (store.connectedRing) {
            console.log('📱 Active connection found - navigating to dashboard');
            setConnectedRing(store.connectedRing);
            setCurrentScreen('dashboard');
            return;
          }
        }
        
        // Check for stored device to attempt auto-reconnection
        const storedDevice = await DevicePersistenceService.getStoredDeviceInfo();
        
        if (storedDevice) {
          console.log('📦 Found stored device - attempting auto-reconnection');
          
          // Get device name for display
          const deviceName = `Ring_${storedDevice.serialNumber.slice(-4)}` || 'SmartRing X1';
          setStoredDeviceName(deviceName);
          
          // Show reconnecting screen
          setCurrentScreen('reconnecting');
          
          // Wait a bit for BLE to be fully ready
          await new Promise(resolve => setTimeout(resolve, 500));
          
          // Attempt auto-reconnection
          const reconnected = await ringService.autoConnectStoredDevice();
          
          if (reconnected) {
            console.log('✅ Auto-reconnection successful');
            const store = useRingStore.getState();
            if (store.connectedRing) {
              setConnectedRing(store.connectedRing);
              setCurrentScreen('dashboard');
            }
          } else {
            console.log('❌ Auto-reconnection failed - showing connection screen');
            setCurrentScreen('connection');
          }
        } else {
          console.log('ℹ️ No stored device found - showing connection screen');
          setCurrentScreen('connection');
        }
        
      } catch (error) {
        console.error('❌ App initialization failed:', error);
        setCurrentScreen('connection');
      }
    };

    initializeApp();
  }, []);

  const handleConnectionSuccess = (ring: SmartRingX1) => {
    console.log('Ring connected successfully:', ring.name);
    setConnectedRing(ring);
    setCurrentScreen('dashboard');
    
    // Device pairing info is now stored automatically by RingService
    // when deviceInfo1 and deviceInfo2 listeners receive data
  };

  const handleDisconnect = () => {
    Alert.alert(
      'Disconnect Ring',
      'Choose how to disconnect from your Ring device:',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Disconnect Only',
          onPress: async () => {
            try {
              await ringService.disconnect();
              setConnectedRing(null);
              setCurrentScreen('connection');
            } catch (error) {
              console.error('Disconnect failed:', error);
              Alert.alert('Error', 'Failed to disconnect from Ring device');
            }
          },
        },
        {
          text: 'Unpair Device',
          style: 'destructive',
          onPress: async () => {
            try {
              await ringService.unpairDevice();
              setConnectedRing(null);
              setCurrentScreen('connection');
              Alert.alert('Success', 'Ring device unpaired. You will need to pair again to reconnect.');
            } catch (error) {
              console.error('Unpair failed:', error);
              Alert.alert('Error', 'Failed to unpair Ring device');
            }
          },
        },
      ]
    );
  };

  const handleNavigateToHealthMonitor = () => {
    setCurrentScreen('healthMonitor');
  };

  const handleBackToDashboard = () => {
    setCurrentScreen('dashboard');
  };

  return (
    <View style={{ flex: 1 }}>
      <StatusBar
        barStyle={Platform.OS === 'ios' ? 'dark-content' : 'light-content'}
        backgroundColor="#F8F9FA"
      />
      
      {currentScreen === 'reconnecting' ? (
        <RingReconnectingScreen 
          deviceName={storedDeviceName}
          onReconnectFailed={() => setCurrentScreen('connection')}
        />
      ) : currentScreen === 'connection' ? (
        <RingConnectionScreen onConnectionSuccess={handleConnectionSuccess} />
      ) : currentScreen === 'dashboard' ? (
        connectedRing && (
          <RingDashboard 
            connectedRing={connectedRing}
            onDisconnect={handleDisconnect}
            onNavigateToHealthMonitor={handleNavigateToHealthMonitor}
          />
        )
      ) : currentScreen === 'healthMonitor' ? (
        <RingHealthMonitor onBack={handleBackToDashboard} />
      ) : null}
    </View>
  );
}