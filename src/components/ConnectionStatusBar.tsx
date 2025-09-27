/**
 * Connection Status Bar Component
 * Shows device connection status
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  TouchableOpacity
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

interface ConnectionStatusBarProps {
  isConnected: boolean;
  deviceName?: string;
  onPress?: () => void;
}

const ConnectionStatusBar: React.FC<ConnectionStatusBarProps> = ({
  isConnected,
  deviceName,
  onPress
}) => {
  const [pulseAnim] = useState(new Animated.Value(1));

  useEffect(() => {
    if (isConnected) {
      // Pulse animation when connected
      Animated.loop(
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 1.2,
            duration: 1000,
            useNativeDriver: true
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true
          })
        ])
      ).start();
    } else {
      pulseAnim.setValue(1);
    }
  }, [isConnected, pulseAnim]);

  return (
    <TouchableOpacity
      style={[
        styles.container,
        isConnected ? styles.connected : styles.disconnected
      ]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      <View style={styles.content}>
        <Animated.View
          style={[
            styles.statusDot,
            isConnected ? styles.dotConnected : styles.dotDisconnected,
            { transform: [{ scale: pulseAnim }] }
          ]}
        />
        <View style={styles.textContainer}>
          <Text style={styles.statusText}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Text>
          {deviceName && isConnected && (
            <Text style={styles.deviceName}>{deviceName}</Text>
          )}
        </View>
        <Icon
          name={isConnected ? 'bluetooth-connect' : 'bluetooth-off'}
          size={20}
          color={isConnected ? '#34C759' : '#8E8E93'}
        />
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    marginHorizontal: 15,
    marginVertical: 10,
    borderRadius: 12,
    overflow: 'hidden'
  },
  connected: {
    backgroundColor: '#34C75915'
  },
  disconnected: {
    backgroundColor: '#8E8E9315'
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 15,
    paddingVertical: 12
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 10
  },
  dotConnected: {
    backgroundColor: '#34C759'
  },
  dotDisconnected: {
    backgroundColor: '#8E8E93'
  },
  textContainer: {
    flex: 1
  },
  statusText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#000'
  },
  deviceName: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2
  }
});

export default ConnectionStatusBar;