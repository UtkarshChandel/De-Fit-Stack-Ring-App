/**
 * Ring Reconnecting Screen
 * Loading screen shown during auto-reconnection attempts
 */

import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Animated,
  Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

interface RingReconnectingScreenProps {
  deviceName?: string;
  onReconnectFailed?: () => void;
}

export default function RingReconnectingScreen({
  deviceName = 'SmartRing X1',
  onReconnectFailed,
}: RingReconnectingScreenProps) {
  const [dots, setDots] = useState('');
  const [fadeAnim] = useState(new Animated.Value(0));
  const [pulseAnim] = useState(new Animated.Value(1));
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    // Fade in animation
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 800,
      useNativeDriver: true,
    }).start();

    // Pulse animation for the ring icon
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.2,
          duration: 1000,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1000,
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.start();

    // Animated dots
    const dotsInterval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);

    // Cleanup
    return () => {
      clearInterval(dotsInterval);
      pulseAnimation.stop();
    };
  }, [fadeAnim, pulseAnim]);

  useEffect(() => {
    // Update retry count every 5 seconds
    const retryInterval = setInterval(() => {
      setRetryCount((prev) => prev + 1);
    }, 5000);

    return () => clearInterval(retryInterval);
  }, []);

  // Call onReconnectFailed after 30 seconds (6 retries)
  useEffect(() => {
    if (retryCount >= 6 && onReconnectFailed) {
      onReconnectFailed();
    }
  }, [retryCount, onReconnectFailed]);

  return (
    <SafeAreaView style={styles.container}>
      <Animated.View
        style={[
          styles.content,
          {
            opacity: fadeAnim,
          },
        ]}
      >
        {/* Ring Icon/Animation */}
        <View style={styles.iconContainer}>
          <Animated.View
            style={[
              styles.ringIconWrapper,
              {
                transform: [{ scale: pulseAnim }],
              },
            ]}
          >
            <View style={styles.ringIcon}>
              <View style={styles.ringInner} />
            </View>
          </Animated.View>
          
          {/* Bluetooth waves animation */}
          <View style={styles.bluetoothWaves}>
            <View style={[styles.wave, styles.wave1]} />
            <View style={[styles.wave, styles.wave2]} />
            <View style={[styles.wave, styles.wave3]} />
          </View>
        </View>

        {/* Status Text */}
        <Text style={styles.title}>Reconnecting to Your Ring</Text>
        <Text style={styles.deviceName}>{deviceName}</Text>
        
        {/* Loading indicator */}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#007AFF" />
          <Text style={styles.loadingText}>
            Searching for device{dots}
          </Text>
        </View>

        {/* Status Messages */}
        <View style={styles.statusContainer}>
          {retryCount === 0 && (
            <Text style={styles.statusText}>
              🔍 Looking for your previously paired Ring
            </Text>
          )}
          {retryCount === 1 && (
            <Text style={styles.statusText}>
              📡 Establishing secure connection
            </Text>
          )}
          {retryCount === 2 && (
            <Text style={styles.statusText}>
              🔄 Verifying device credentials
            </Text>
          )}
          {retryCount >= 3 && retryCount < 6 && (
            <Text style={styles.statusText}>
              ⏳ Taking longer than usual. Make sure your Ring is nearby and charged
            </Text>
          )}
          {retryCount >= 6 && (
            <Text style={[styles.statusText, styles.errorText]}>
              ❌ Unable to reconnect. Please try manual connection
            </Text>
          )}
        </View>

        {/* Tips */}
        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>Quick Tips:</Text>
          <Text style={styles.tipText}>• Keep your Ring within 10 feet</Text>
          <Text style={styles.tipText}>• Ensure Ring is charged (&gt;20%)</Text>
          <Text style={styles.tipText}>• Check Bluetooth is enabled</Text>
        </View>

        {/* Progress indicator */}
        {retryCount > 0 && retryCount < 6 && (
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>
              Attempt {Math.min(retryCount, 3)} of 3
            </Text>
            <View style={styles.progressBar}>
              <View
                style={[
                  styles.progressFill,
                  { width: `${Math.min((retryCount / 3) * 100, 100)}%` },
                ]}
              />
            </View>
          </View>
        )}
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8F9FA',
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  iconContainer: {
    width: 120,
    height: 120,
    marginBottom: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringIconWrapper: {
    position: 'absolute',
  },
  ringIcon: {
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 12,
    borderColor: '#007AFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringInner: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#007AFF',
    opacity: 0.3,
  },
  bluetoothWaves: {
    position: 'absolute',
    width: 120,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wave: {
    position: 'absolute',
    width: 100,
    height: 100,
    borderRadius: 50,
    borderWidth: 2,
    borderColor: '#007AFF',
    opacity: 0.3,
  },
  wave1: {
    width: 100,
    height: 100,
    animation: 'pulse 2s infinite',
  },
  wave2: {
    width: 120,
    height: 120,
    animation: 'pulse 2s infinite 0.5s',
  },
  wave3: {
    width: 140,
    height: 140,
    animation: 'pulse 2s infinite 1s',
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  deviceName: {
    fontSize: 18,
    color: '#666',
    marginBottom: 30,
  },
  loadingContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#666',
  },
  statusContainer: {
    marginBottom: 30,
    minHeight: 40,
    paddingHorizontal: 20,
  },
  statusText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
  errorText: {
    color: '#FF3B30',
  },
  tipsContainer: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    width: '100%',
    maxWidth: 300,
    marginBottom: 20,
  },
  tipsTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1C1C1E',
    marginBottom: 8,
  },
  tipText: {
    fontSize: 12,
    color: '#666',
    marginBottom: 4,
  },
  progressContainer: {
    width: '100%',
    maxWidth: 300,
    marginTop: 20,
  },
  progressText: {
    fontSize: 12,
    color: '#999',
    textAlign: 'center',
    marginBottom: 8,
  },
  progressBar: {
    height: 4,
    backgroundColor: '#E5E5E7',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#007AFF',
    borderRadius: 2,
  },
});