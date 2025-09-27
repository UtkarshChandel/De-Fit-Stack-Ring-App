/**
 * Battery Indicator Component
 * Shows device battery level and charging status
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';
import { BatteryData } from '../types/health';

interface BatteryIndicatorProps {
  battery: BatteryData;
  showPercentage?: boolean;
}

const BatteryIndicator: React.FC<BatteryIndicatorProps> = ({
  battery,
  showPercentage = true
}) => {
  const getBatteryIcon = () => {
    const level = battery.batteryPer;
    const isCharging = battery.status === 1;

    if (isCharging) return 'battery-charging';
    if (level >= 90) return 'battery';
    if (level >= 70) return 'battery-70';
    if (level >= 50) return 'battery-50';
    if (level >= 30) return 'battery-30';
    if (level >= 10) return 'battery-10';
    return 'battery-alert';
  };

  const getBatteryColor = () => {
    const level = battery.batteryPer;
    if (battery.status === 1) return '#34C759'; // Charging
    if (level >= 50) return '#34C759'; // Good
    if (level >= 20) return '#FF9500'; // Warning
    return '#FF3B30'; // Critical
  };

  return (
    <View style={styles.container}>
      <Icon
        name={getBatteryIcon()}
        size={24}
        color={getBatteryColor()}
      />
      {showPercentage && (
        <Text style={[styles.percentage, { color: getBatteryColor() }]}>
          {battery.batteryPer}%
        </Text>
      )}
      {battery.status === 1 && (
        <Icon
          name="lightning-bolt"
          size={12}
          color="#34C759"
          style={styles.chargingIcon}
        />
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  percentage: {
    fontSize: 12,
    fontWeight: '600',
    marginLeft: 4
  },
  chargingIcon: {
    marginLeft: 2
  }
});

export default BatteryIndicator;