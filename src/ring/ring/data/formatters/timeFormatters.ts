/**
 * Time Formatting Utilities
 * Ported from YoiHealth project for SmartRing X1 connectivity
 */

import moment from 'moment';

/**
 * Format timestamp to readable date/time string
 * @param inputTime - Unix timestamp or Date object
 * @param isComplete - Whether to include time (default: true)
 * @returns Formatted date/time string
 */
export function formatDateTime(inputTime: number | Date, isComplete: boolean = true): string {
  const date = moment(inputTime);
  const result = isComplete 
    ? date.format("YYYY-MM-DD|HH:mm:ss")
    : date.format("YYYY-MM-DD");
  return result;
}

/**
 * Compare if two timestamps are on the same day
 * @param ts - First timestamp
 * @param targetTs - Second timestamp
 * @returns true if timestamps are on same day
 */
export function compareTime(ts: number | Date, targetTs: number | Date): boolean {
  const date = moment(ts);
  const targetDate = moment(targetTs);
  
  return date.isSame(targetDate, "day");
}

/**
 * Format timestamp to time only (HH:mm:ss)
 * @param inputTime - Unix timestamp or Date object
 * @returns Time string
 */
export function formatTimeOnly(inputTime: number | Date): string {
  return moment(inputTime).format("HH:mm:ss");
}

/**
 * Format timestamp to date only (YYYY-MM-DD)
 * @param inputTime - Unix timestamp or Date object
 * @returns Date string
 */
export function formatDateOnly(inputTime: number | Date): string {
  return moment(inputTime).format("YYYY-MM-DD");
}

/**
 * Get start of day timestamp
 * @param inputTime - Unix timestamp or Date object
 * @returns Start of day timestamp
 */
export function getStartOfDay(inputTime: number | Date): number {
  return moment(inputTime).startOf('day').valueOf();
}

/**
 * Get end of day timestamp
 * @param inputTime - Unix timestamp or Date object
 * @returns End of day timestamp
 */
export function getEndOfDay(inputTime: number | Date): number {
  return moment(inputTime).endOf('day').valueOf();
}

/**
 * Check if timestamp is today
 * @param inputTime - Unix timestamp or Date object
 * @returns true if timestamp is today
 */
export function isToday(inputTime: number | Date): boolean {
  return moment(inputTime).isSame(moment(), 'day');
}

/**
 * Get relative time string (e.g., "2 hours ago", "in 3 days")
 * @param inputTime - Unix timestamp or Date object
 * @returns Relative time string
 */
export function getRelativeTime(inputTime: number | Date): string {
  return moment(inputTime).fromNow();
}

/**
 * Get duration between two timestamps in human readable format
 * @param startTime - Start timestamp
 * @param endTime - End timestamp
 * @returns Duration string (e.g., "2 hours 30 minutes")
 */
export function getDuration(startTime: number | Date, endTime: number | Date): string {
  const start = moment(startTime);
  const end = moment(endTime);
  const duration = moment.duration(end.diff(start));
  
  const hours = Math.floor(duration.asHours());
  const minutes = duration.minutes();
  
  if (hours > 0 && minutes > 0) {
    return `${hours}h ${minutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else if (minutes > 0) {
    return `${minutes}m`;
  } else {
    return '< 1m';
  }
}

/**
 * Convert minutes to hours and minutes string
 * @param minutes - Total minutes
 * @returns Formatted string (e.g., "2h 30m")
 */
export function minutesToHoursMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  
  if (hours > 0 && remainingMinutes > 0) {
    return `${hours}h ${remainingMinutes}m`;
  } else if (hours > 0) {
    return `${hours}h`;
  } else {
    return `${remainingMinutes}m`;
  }
}

/**
 * Get time ago string for recent events
 * @param inputTime - Unix timestamp or Date object
 * @returns Time ago string optimized for recent events
 */
export function getTimeAgo(inputTime: number | Date): string {
  const now = moment();
  const time = moment(inputTime);
  const diff = now.diff(time);
  
  if (diff < 60000) { // Less than 1 minute
    return 'Just now';
  } else if (diff < 3600000) { // Less than 1 hour
    const minutes = Math.floor(diff / 60000);
    return `${minutes} min ago`;
  } else if (diff < 86400000) { // Less than 1 day
    const hours = Math.floor(diff / 3600000);
    return `${hours}h ago`;
  } else {
    return time.format('MMM D');
  }
}