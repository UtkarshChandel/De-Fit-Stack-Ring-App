/**
 * Mini Chart Component
 * Simple line chart for displaying trends
 */

import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions
} from 'react-native';
import Svg, { Path, Circle, Defs, LinearGradient, Stop } from 'react-native-svg';

interface ChartData {
  value: number;
  timestamp: number;
}

interface MiniChartProps {
  title: string;
  data: ChartData[];
  color: string;
  unit: string;
  height?: number;
}

const MiniChart: React.FC<MiniChartProps> = ({
  title,
  data,
  color,
  unit,
  height = 150
}) => {
  const width = Dimensions.get('window').width - 40;

  if (!data || data.length === 0) {
    return (
      <View style={[styles.container, { height }]}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.noData}>
          <Text style={styles.noDataText}>No data available</Text>
        </View>
      </View>
    );
  }

  // Prepare data for chart
  const values = data.map(d => d.value);
  const maxValue = Math.max(...values);
  const minValue = Math.min(...values);
  const range = maxValue - minValue || 1;

  // Create path for line chart
  const createPath = () => {
    const padding = 20;
    const chartWidth = width - padding * 2;
    const chartHeight = height - 60;

    const points = data.map((item, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((item.value - minValue) / range) * chartHeight;
      return `${x},${y}`;
    });

    return `M ${points.join(' L ')}`;
  };

  // Create gradient area path
  const createAreaPath = () => {
    const padding = 20;
    const chartWidth = width - padding * 2;
    const chartHeight = height - 60;

    const points = data.map((item, index) => {
      const x = padding + (index / (data.length - 1)) * chartWidth;
      const y = padding + chartHeight - ((item.value - minValue) / range) * chartHeight;
      return `${x},${y}`;
    });

    const firstX = padding;
    const lastX = padding + chartWidth;
    const bottomY = padding + chartHeight;

    return `M ${points.join(' L ')} L ${lastX},${bottomY} L ${firstX},${bottomY} Z`;
  };

  // Get latest value
  const latestValue = data[data.length - 1].value;
  const averageValue = values.reduce((a, b) => a + b, 0) / values.length;

  // Format time labels
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  return (
    <View style={[styles.container, { height }]}>
      <View style={styles.header}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.stats}>
          <Text style={[styles.value, { color }]}>
            {latestValue.toFixed(unit === '%' || unit === '°C' ? 1 : 0)} {unit}
          </Text>
          <Text style={styles.average}>
            avg: {averageValue.toFixed(unit === '%' || unit === '°C' ? 1 : 0)}
          </Text>
        </View>
      </View>

      <Svg width={width} height={height - 50}>
        <Defs>
          <LinearGradient id={`gradient-${title}`} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0%" stopColor={color} stopOpacity={0.3} />
            <Stop offset="100%" stopColor={color} stopOpacity={0} />
          </LinearGradient>
        </Defs>

        {/* Area under the line */}
        <Path
          d={createAreaPath()}
          fill={`url(#gradient-${title})`}
        />

        {/* Line */}
        <Path
          d={createPath()}
          stroke={color}
          strokeWidth={2}
          fill="none"
        />

        {/* Points */}
        {data.map((item, index) => {
          const padding = 20;
          const chartWidth = width - padding * 2;
          const chartHeight = height - 60;
          const x = padding + (index / (data.length - 1)) * chartWidth;
          const y = padding + chartHeight - ((item.value - minValue) / range) * chartHeight;

          return (
            <Circle
              key={index}
              cx={x}
              cy={y}
              r={3}
              fill={color}
              opacity={index === data.length - 1 ? 1 : 0.5}
            />
          );
        })}
      </Svg>

      {/* Time labels */}
      <View style={styles.timeLabels}>
        <Text style={styles.timeLabel}>
          {formatDate(data[0].timestamp)}
        </Text>
        <Text style={styles.timeLabel}>
          {formatDate(data[data.length - 1].timestamp)}
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FFF',
    borderRadius: 16,
    marginBottom: 15,
    paddingVertical: 15,
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
    paddingHorizontal: 20,
    marginBottom: 10
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#000'
  },
  stats: {
    alignItems: 'flex-end'
  },
  value: {
    fontSize: 18,
    fontWeight: 'bold'
  },
  average: {
    fontSize: 12,
    color: '#8E8E93',
    marginTop: 2
  },
  noData: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center'
  },
  noDataText: {
    fontSize: 14,
    color: '#8E8E93'
  },
  timeLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginTop: 5
  },
  timeLabel: {
    fontSize: 11,
    color: '#8E8E93'
  }
});

export default MiniChart;