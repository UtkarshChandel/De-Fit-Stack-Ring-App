/**
 * Sleep Analysis Utilities
 * Advanced sleep metrics processing for SmartRing X1 data
 */

import { IHistorical, SleepData } from '../../../types/ring';
import { healthMetricsProcessor } from './healthMetrics';
import { formatDateTime, minutesToHoursMinutes } from '../formatters/timeFormatters';

/**
 * Sleep Analysis Processor Class
 * Provides advanced sleep metrics and insights
 */
export class SleepAnalysisProcessor {
  /**
   * Generate comprehensive sleep report
   * @param historicalData - Historical health data
   * @returns Detailed sleep report
   */
  public generateSleepReport(historicalData: IHistorical[]): {
    sleepData: SleepData[];
    sleepScore: number;
    totalSleepTime: string;
    sleepEfficiency: number;
    avgDeepSleep: number;
    avgRemSleep: number;
    avgLightSleep: number;
    wakeUpCount: number;
    avgRespiratoryRate: number;
    avgOxygenSaturation: number;
    sleepTrends: {
      deepSleepTrend: 'improving' | 'declining' | 'stable';
      totalSleepTrend: 'improving' | 'declining' | 'stable';
      efficiencyTrend: 'improving' | 'declining' | 'stable';
    };
    recommendations: string[];
  } {
    try {
      const sleepData = healthMetricsProcessor.calculateSleepMetrics(historicalData);
      
      if (sleepData.length === 0) {
        return this.getEmptySleepReport();
      }

      const latestSleep = sleepData[sleepData.length - 1];
      const sleepScore = healthMetricsProcessor.calculateSleepScore(sleepData);
      
      // Calculate averages for the past week
      const recentSleepData = sleepData.slice(-7); // Last 7 nights
      const totalSleepMinutes = latestSleep.deepSleep + latestSleep.lightTime + latestSleep.remTime;
      const totalSleepTime = minutesToHoursMinutes(totalSleepMinutes);
      
      const sleepEfficiency = this.calculateSleepEfficiency(latestSleep);
      const avgDeepSleep = this.calculateAverageSleepStage(recentSleepData, 'deepSleep');
      const avgRemSleep = this.calculateAverageSleepStage(recentSleepData, 'remTime');
      const avgLightSleep = this.calculateAverageSleepStage(recentSleepData, 'lightTime');
      const wakeUpCount = this.estimateWakeUpCount(latestSleep);
      
      const avgRespiratoryRate = healthMetricsProcessor.calculateRespiratoryRate(recentSleepData);
      const avgOxygenSaturation = healthMetricsProcessor.getOxygenSaturation(recentSleepData);
      
      const sleepTrends = this.analyzeSleepTrends(sleepData);
      const recommendations = this.generateSleepRecommendations(sleepData, sleepScore);

      return {
        sleepData,
        sleepScore,
        totalSleepTime,
        sleepEfficiency,
        avgDeepSleep,
        avgRemSleep,
        avgLightSleep,
        wakeUpCount,
        avgRespiratoryRate,
        avgOxygenSaturation,
        sleepTrends,
        recommendations,
      };
    } catch (error) {
      console.error('Error generating sleep report:', error);
      return this.getEmptySleepReport();
    }
  }

  /**
   * Calculate sleep efficiency percentage
   * @param sleepData - Single night sleep data
   * @returns Sleep efficiency percentage
   */
  private calculateSleepEfficiency(sleepData: SleepData): number {
    const totalSleepTime = sleepData.deepSleep + sleepData.lightTime + sleepData.remTime;
    const totalTimeInBed = totalSleepTime + sleepData.wakeTime;
    
    if (totalTimeInBed === 0) return 0;
    
    return Math.round((totalSleepTime / totalTimeInBed) * 100);
  }

  /**
   * Calculate average for specific sleep stage
   * @param sleepDataArray - Array of sleep data
   * @param stage - Sleep stage key
   * @returns Average minutes for the sleep stage
   */
  private calculateAverageSleepStage(
    sleepDataArray: SleepData[], 
    stage: keyof Pick<SleepData, 'deepSleep' | 'lightTime' | 'remTime'>
  ): number {
    if (sleepDataArray.length === 0) return 0;
    
    const total = sleepDataArray.reduce((sum, sleep) => sum + sleep[stage], 0);
    return Math.round(total / sleepDataArray.length);
  }

  /**
   * Estimate number of wake-ups during sleep
   * @param sleepData - Single night sleep data
   * @returns Estimated wake-up count
   */
  private estimateWakeUpCount(sleepData: SleepData): number {
    // Rough estimation: every 30 minutes of wake time = 1 wake-up
    return Math.max(0, Math.round(sleepData.wakeTime / 30));
  }

  /**
   * Analyze sleep trends over time
   * @param sleepDataArray - Array of sleep data over time
   * @returns Sleep trend analysis
   */
  private analyzeSleepTrends(sleepDataArray: SleepData[]): {
    deepSleepTrend: 'improving' | 'declining' | 'stable';
    totalSleepTrend: 'improving' | 'declining' | 'stable';
    efficiencyTrend: 'improving' | 'declining' | 'stable';
  } {
    if (sleepDataArray.length < 3) {
      return {
        deepSleepTrend: 'stable',
        totalSleepTrend: 'stable',
        efficiencyTrend: 'stable',
      };
    }

    // Compare recent data (last 3 nights) with older data
    const recentData = sleepDataArray.slice(-3);
    const olderData = sleepDataArray.slice(-6, -3);

    if (olderData.length === 0) {
      return {
        deepSleepTrend: 'stable',
        totalSleepTrend: 'stable',
        efficiencyTrend: 'stable',
      };
    }

    const recentAvgDeepSleep = recentData.reduce((sum, s) => sum + s.deepSleep, 0) / recentData.length;
    const olderAvgDeepSleep = olderData.reduce((sum, s) => sum + s.deepSleep, 0) / olderData.length;

    const recentAvgTotalSleep = recentData.reduce((sum, s) => sum + s.deepSleep + s.lightTime + s.remTime, 0) / recentData.length;
    const olderAvgTotalSleep = olderData.reduce((sum, s) => sum + s.deepSleep + s.lightTime + s.remTime, 0) / olderData.length;

    const recentAvgEfficiency = recentData.reduce((sum, s) => sum + this.calculateSleepEfficiency(s), 0) / recentData.length;
    const olderAvgEfficiency = olderData.reduce((sum, s) => sum + this.calculateSleepEfficiency(s), 0) / olderData.length;

    const getTrend = (recent: number, older: number): 'improving' | 'declining' | 'stable' => {
      const diff = ((recent - older) / older) * 100;
      if (diff > 10) return 'improving';
      if (diff < -10) return 'declining';
      return 'stable';
    };

    return {
      deepSleepTrend: getTrend(recentAvgDeepSleep, olderAvgDeepSleep),
      totalSleepTrend: getTrend(recentAvgTotalSleep, olderAvgTotalSleep),
      efficiencyTrend: getTrend(recentAvgEfficiency, olderAvgEfficiency),
    };
  }

  /**
   * Generate personalized sleep recommendations
   * @param sleepDataArray - Array of sleep data
   * @param sleepScore - Current sleep score
   * @returns Array of recommendations
   */
  private generateSleepRecommendations(sleepDataArray: SleepData[], sleepScore: number): string[] {
    const recommendations: string[] = [];
    
    if (sleepDataArray.length === 0) {
      return ['Start tracking your sleep consistently for personalized recommendations.'];
    }

    const latestSleep = sleepDataArray[sleepDataArray.length - 1];
    const totalSleepMinutes = latestSleep.deepSleep + latestSleep.lightTime + latestSleep.remTime;
    const sleepEfficiency = this.calculateSleepEfficiency(latestSleep);

    // Sleep duration recommendations
    if (totalSleepMinutes < 420) { // Less than 7 hours
      recommendations.push('Try to get at least 7-8 hours of sleep for optimal health.');
    } else if (totalSleepMinutes > 600) { // More than 10 hours
      recommendations.push('Consider if you might be oversleeping. 7-9 hours is typically optimal.');
    }

    // Sleep efficiency recommendations
    if (sleepEfficiency < 85) {
      recommendations.push('Improve sleep efficiency by maintaining a consistent bedtime routine.');
      recommendations.push('Avoid screens 1 hour before bedtime to improve sleep quality.');
    }

    // Deep sleep recommendations
    const deepSleepRatio = latestSleep.deepSleep / totalSleepMinutes;
    if (deepSleepRatio < 0.15) {
      recommendations.push('Increase deep sleep by avoiding caffeine late in the day and keeping your bedroom cool.');
    }

    // Wake-up recommendations
    const wakeUpCount = this.estimateWakeUpCount(latestSleep);
    if (wakeUpCount > 3) {
      recommendations.push('Reduce nighttime disruptions by minimizing noise and light in your bedroom.');
    }

    // General score-based recommendations
    if (sleepScore < 60) {
      recommendations.push('Consider consulting a healthcare provider if poor sleep persists.');
    } else if (sleepScore < 75) {
      recommendations.push('Focus on consistent sleep and wake times to improve sleep quality.');
    }

    // Trending recommendations
    const trends = this.analyzeSleepTrends(sleepDataArray);
    if (trends.totalSleepTrend === 'declining') {
      recommendations.push('Your sleep duration has been declining. Try to prioritize getting to bed earlier.');
    }
    if (trends.efficiencyTrend === 'declining') {
      recommendations.push('Your sleep efficiency is declining. Review your bedtime habits and environment.');
    }

    return recommendations.slice(0, 5); // Limit to 5 recommendations
  }

  /**
   * Get empty sleep report structure
   * @returns Empty sleep report
   */
  private getEmptySleepReport() {
    return {
      sleepData: [],
      sleepScore: 0,
      totalSleepTime: '0h 0m',
      sleepEfficiency: 0,
      avgDeepSleep: 0,
      avgRemSleep: 0,
      avgLightSleep: 0,
      wakeUpCount: 0,
      avgRespiratoryRate: 0,
      avgOxygenSaturation: 0,
      sleepTrends: {
        deepSleepTrend: 'stable' as const,
        totalSleepTrend: 'stable' as const,
        efficiencyTrend: 'stable' as const,
      },
      recommendations: ['Start tracking your sleep to get personalized insights.'],
    };
  }

  /**
   * Classify sleep quality based on sleep score
   * @param sleepScore - Sleep score (0-100)
   * @returns Sleep quality classification
   */
  public classifySleepQuality(sleepScore: number): 'Excellent' | 'Good' | 'Fair' | 'Poor' {
    if (sleepScore >= 85) return 'Excellent';
    if (sleepScore >= 70) return 'Good';
    if (sleepScore >= 55) return 'Fair';
    return 'Poor';
  }

  /**
   * Get optimal bedtime suggestion based on sleep patterns
   * @param sleepDataArray - Array of sleep data
   * @param targetWakeTime - Desired wake time (24h format, e.g., "07:00")
   * @returns Suggested bedtime
   */
  public suggestOptimalBedtime(sleepDataArray: SleepData[], targetWakeTime: string): string {
    if (sleepDataArray.length === 0) {
      return '22:30'; // Default suggestion
    }

    // Calculate average sleep duration from recent data
    const recentData = sleepDataArray.slice(-7);
    const avgSleepDuration = recentData.reduce((sum, sleep) => {
      return sum + sleep.deepSleep + sleep.lightTime + sleep.remTime;
    }, 0) / recentData.length;

    // Parse target wake time
    const [wakeHours, wakeMinutes] = targetWakeTime.split(':').map(Number);
    const wakeTimeMinutes = wakeHours * 60 + wakeMinutes;

    // Calculate bedtime (sleep duration + 30 minutes to fall asleep)
    const bedtimeMinutes = wakeTimeMinutes - avgSleepDuration - 30;
    const bedtimeHours = Math.floor(bedtimeMinutes / 60) % 24;
    const bedtimeMinutesRemainder = bedtimeMinutes % 60;

    return `${bedtimeHours.toString().padStart(2, '0')}:${bedtimeMinutesRemainder.toString().padStart(2, '0')}`;
  }
}

// Export singleton instance
export const sleepAnalysisProcessor = new SleepAnalysisProcessor();