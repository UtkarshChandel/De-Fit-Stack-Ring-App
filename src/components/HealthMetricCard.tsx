/**
 * Health Metric Card Component
 * Displays a single health metric with icon, value, and trend
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ActivityIndicator
} from 'react-native';
import { MaterialCommunityIcons as Icon } from '@expo/vector-icons';

interface HealthMetricCardProps {
  title: string;
  value?: number;
  unit: string;
  icon: string;
  iconColor: string;
  trend?: { value: number; timestamp: number }[];
  onPress: () => void;
  loading?: boolean;
}

const HealthMetricCard: React.FC<HealthMetricCardProps> = ({
  title,
  value,
  unit,
  icon,
  iconColor,
  trend,
  onPress,
  loading = false
}) => {
  // Calculate trend direction
  const getTrend = () => {
    if (!trend || trend.length < 2) return null;
    const recent = trend[trend.length - 1].value;
    const previous = trend[trend.length - 2].value;
    const change = recent - previous;

    if (change > 0) return { icon: 'trending-up', color: '#34C759' };
    if (change < 0) return { icon: 'trending-down', color: '#FF3B30' };
    return { icon: 'trending-neutral', color: '#8E8E93' };
  };

  const trendInfo = getTrend();

  return (
    <TouchableOpacity style={styles.container} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.header}>
        <View style={[styles.iconContainer, { backgroundColor: `${iconColor}15` }]}>
          <Icon name={icon} size={24} color={iconColor} />
        </View>
        {trendInfo && (
          <Icon name={trendInfo.icon} size={16} color={trendInfo.color} />
        )}
      </View>

      <View style={styles.content}>
        {loading ? (
          <ActivityIndicator size="small" color={iconColor} />
        ) : value !== undefined ? (
          <>
            <Text style={styles.value}>{value}</Text>
            <Text style={styles.unit}>{unit}</Text>
          </>
        ) : (
          <Text style={styles.noData}>--</Text>
        )}
      </View>

      <Text style={styles.title}>{title}</Text>

      {/* Mini sparkline */}
      {trend && trend.length > 0 && (
        <View style={styles.sparkline}>
          {trend.slice(-7).map((point, index) => {
            const maxValue = Math.max(...trend.slice(-7).map(p => p.value));
            const minValue = Math.min(...trend.slice(-7).map(p => p.value));
            const range = maxValue - minValue || 1;
            const height = ((point.value - minValue) / range) * 20;

            return (
              <View
                key={index}
                style={[
                  styles.sparklineBar,
                  {
                    height: Math.max(2, height),
                    backgroundColor: iconColor,
                    opacity: 0.3 + (index / 7) * 0.7
                  }
                ]}
              />
            );
          })}
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    padding: 15,
    margin: 5,
    width: '47%',
    minHeight: 140,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10
  },
  iconContainer: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center'
  },
  content: {
    flexDirection: 'row',
    alignItems: 'baseline',
    marginBottom: 8
  },
  value: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#000'
  },
  unit: {
    fontSize: 14,
    color: '#8E8E93',
    marginLeft: 4
  },
  noData: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#C7C7CC'
  },
  title: {
    fontSize: 14,
    color: '#8E8E93',
    fontWeight: '500'
  },
  sparkline: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    height: 20,
    marginTop: 10
  },
  sparklineBar: {
    width: 4,
    borderRadius: 2,
    marginHorizontal: 1
  }
});

export default HealthMetricCard;