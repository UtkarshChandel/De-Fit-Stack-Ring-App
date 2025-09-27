/**
 * Ring Reconnection Banner
 * Shows when the app is attempting to reconnect to the Ring device
 */

import React from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  StyleSheet,
  Animated,
} from 'react-native';
import { useRingStore } from '../../src/ring/state/ringStore';

export default function RingReconnectionBanner() {
  const { isReconnecting, reconnectionAttempt } = useRingStore();
  const fadeAnim = React.useRef(new Animated.Value(0)).current;

  React.useEffect(() => {
    if (isReconnecting) {
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start();
    }
  }, [isReconnecting, fadeAnim]);

  if (!isReconnecting) {
    return null;
  }

  return (
    <Animated.View
      style={[
        styles.container,
        {
          opacity: fadeAnim,
          transform: [
            {
              translateY: fadeAnim.interpolate({
                inputRange: [0, 1],
                outputRange: [-50, 0],
              }),
            },
          ],
        },
      ]}
    >
      <View style={styles.content}>
        <ActivityIndicator size="small" color="#FFFFFF" style={styles.spinner} />
        <View style={styles.textContainer}>
          <Text style={styles.title}>Reconnecting to Ring...</Text>
          {reconnectionAttempt > 0 && (
            <Text style={styles.subtitle}>
              Attempt {reconnectionAttempt} of 3
            </Text>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FF9500',
    zIndex: 1000,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingTop: 50, // Account for status bar
  },
  spinner: {
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  subtitle: {
    color: '#FFFFFF',
    fontSize: 14,
    opacity: 0.9,
    marginTop: 2,
  },
});