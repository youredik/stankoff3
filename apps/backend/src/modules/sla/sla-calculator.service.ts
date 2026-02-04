import { Injectable } from '@nestjs/common';
import { BusinessHours } from './entities/sla-definition.entity';

@Injectable()
export class SlaCalculatorService {
  /**
   * Calculate deadline considering business hours
   */
  calculateDeadline(
    startTime: Date,
    durationMinutes: number,
    businessHours: BusinessHours,
    businessHoursOnly: boolean,
  ): Date {
    if (!businessHoursOnly || durationMinutes <= 0) {
      return new Date(startTime.getTime() + durationMinutes * 60 * 1000);
    }

    let remainingMinutes = durationMinutes;
    let currentTime = new Date(startTime);

    // Limit iterations to prevent infinite loops
    const maxIterations = 365; // Max 1 year
    let iterations = 0;

    while (remainingMinutes > 0 && iterations < maxIterations) {
      iterations++;

      // Check if current day is a workday
      const dayOfWeek = this.getDayOfWeek(currentTime, businessHours.timezone);
      if (!businessHours.workdays.includes(dayOfWeek)) {
        currentTime = this.getNextWorkdayStart(currentTime, businessHours);
        continue;
      }

      // Get work hours for current day
      const workStart = this.parseTime(businessHours.start, currentTime, businessHours.timezone);
      const workEnd = this.parseTime(businessHours.end, currentTime, businessHours.timezone);

      // If current time is before work start
      if (currentTime < workStart) {
        currentTime = workStart;
      }

      // If current time is after work end
      if (currentTime >= workEnd) {
        currentTime = this.getNextWorkdayStart(currentTime, businessHours);
        continue;
      }

      // Calculate minutes until end of workday
      const minutesToEndOfDay = Math.floor((workEnd.getTime() - currentTime.getTime()) / 60000);

      if (remainingMinutes <= minutesToEndOfDay) {
        // Fits within current day
        return new Date(currentTime.getTime() + remainingMinutes * 60 * 1000);
      } else {
        // Doesn't fit - subtract and move to next day
        remainingMinutes -= minutesToEndOfDay;
        currentTime = this.getNextWorkdayStart(workEnd, businessHours);
      }
    }

    return currentTime;
  }

  /**
   * Calculate remaining SLA time in minutes
   */
  calculateRemainingMinutes(
    deadline: Date,
    currentTime: Date,
    businessHours: BusinessHours,
    businessHoursOnly: boolean,
    pausedMinutes = 0,
  ): number {
    if (currentTime >= deadline) {
      return -this.calculateElapsedMinutes(deadline, currentTime, businessHours, businessHoursOnly) + pausedMinutes;
    }

    if (!businessHoursOnly) {
      return Math.floor((deadline.getTime() - currentTime.getTime()) / 60000) + pausedMinutes;
    }

    // Calculate business minutes between currentTime and deadline
    let totalMinutes = 0;
    let iterTime = new Date(currentTime);

    const maxIterations = 365;
    let iterations = 0;

    while (iterTime < deadline && iterations < maxIterations) {
      iterations++;

      const dayOfWeek = this.getDayOfWeek(iterTime, businessHours.timezone);
      if (!businessHours.workdays.includes(dayOfWeek)) {
        iterTime = this.getNextWorkdayStart(iterTime, businessHours);
        continue;
      }

      const workStart = this.parseTime(businessHours.start, iterTime, businessHours.timezone);
      const workEnd = this.parseTime(businessHours.end, iterTime, businessHours.timezone);

      const effectiveStart = iterTime < workStart ? workStart : iterTime;
      const effectiveEnd = deadline < workEnd ? deadline : workEnd;

      if (effectiveStart < effectiveEnd) {
        totalMinutes += Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / 60000);
      }

      // Move to next day
      const nextDay = new Date(iterTime);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);
      iterTime = nextDay;
    }

    return totalMinutes + pausedMinutes;
  }

  /**
   * Calculate elapsed time in minutes (for breached SLAs)
   */
  calculateElapsedMinutes(
    startTime: Date,
    endTime: Date,
    businessHours: BusinessHours,
    businessHoursOnly: boolean,
  ): number {
    if (!businessHoursOnly) {
      return Math.floor((endTime.getTime() - startTime.getTime()) / 60000);
    }

    let totalMinutes = 0;
    let iterTime = new Date(startTime);

    const maxIterations = 365;
    let iterations = 0;

    while (iterTime < endTime && iterations < maxIterations) {
      iterations++;

      const dayOfWeek = this.getDayOfWeek(iterTime, businessHours.timezone);
      if (!businessHours.workdays.includes(dayOfWeek)) {
        iterTime = this.getNextWorkdayStart(iterTime, businessHours);
        continue;
      }

      const workStart = this.parseTime(businessHours.start, iterTime, businessHours.timezone);
      const workEnd = this.parseTime(businessHours.end, iterTime, businessHours.timezone);

      const effectiveStart = iterTime < workStart ? workStart : iterTime;
      const effectiveEnd = endTime < workEnd ? endTime : workEnd;

      if (effectiveStart < effectiveEnd) {
        totalMinutes += Math.floor((effectiveEnd.getTime() - effectiveStart.getTime()) / 60000);
      }

      // Move to next day
      const nextDay = new Date(iterTime);
      nextDay.setDate(nextDay.getDate() + 1);
      nextDay.setHours(0, 0, 0, 0);
      iterTime = nextDay;
    }

    return totalMinutes;
  }

  /**
   * Calculate percentage of SLA time used
   */
  calculateUsedPercent(
    startTime: Date,
    deadline: Date,
    currentTime: Date,
    businessHours: BusinessHours,
    businessHoursOnly: boolean,
    pausedMinutes = 0,
  ): number {
    const totalMinutes = this.calculateElapsedMinutes(startTime, deadline, businessHours, businessHoursOnly);
    if (totalMinutes <= 0) return 100;

    const elapsedMinutes = this.calculateElapsedMinutes(startTime, currentTime, businessHours, businessHoursOnly) - pausedMinutes;
    return Math.min(100, Math.max(0, (elapsedMinutes / totalMinutes) * 100));
  }

  /**
   * Get next workday start time
   */
  private getNextWorkdayStart(from: Date, businessHours: BusinessHours): Date {
    const next = new Date(from);
    next.setDate(next.getDate() + 1);
    next.setHours(0, 0, 0, 0);

    let iterations = 0;
    while (!businessHours.workdays.includes(this.getDayOfWeek(next, businessHours.timezone)) && iterations < 7) {
      next.setDate(next.getDate() + 1);
      iterations++;
    }

    return this.parseTime(businessHours.start, next, businessHours.timezone);
  }

  /**
   * Get day of week (0 = Sunday, 1 = Monday, etc.)
   */
  private getDayOfWeek(date: Date, timezone: string): number {
    // For simplicity, we use UTC day. In production, use a timezone library.
    // This is a simplified implementation.
    return date.getDay();
  }

  /**
   * Parse time string to Date with timezone
   */
  private parseTime(timeStr: string, date: Date, timezone: string): Date {
    const [hours, minutes] = timeStr.split(':').map(Number);
    const result = new Date(date);
    result.setHours(hours, minutes, 0, 0);
    // In production, use a proper timezone library like date-fns-tz or luxon
    return result;
  }

  /**
   * Check if current time is within business hours
   */
  isWithinBusinessHours(currentTime: Date, businessHours: BusinessHours): boolean {
    const dayOfWeek = this.getDayOfWeek(currentTime, businessHours.timezone);
    if (!businessHours.workdays.includes(dayOfWeek)) {
      return false;
    }

    const workStart = this.parseTime(businessHours.start, currentTime, businessHours.timezone);
    const workEnd = this.parseTime(businessHours.end, currentTime, businessHours.timezone);

    return currentTime >= workStart && currentTime < workEnd;
  }

  /**
   * Format duration in human-readable form
   */
  formatDuration(minutes: number): string {
    if (minutes < 0) {
      return `-${this.formatDuration(Math.abs(minutes))}`;
    }
    if (minutes < 60) {
      return `${minutes}м`;
    }
    if (minutes < 1440) {
      const hours = Math.floor(minutes / 60);
      const mins = minutes % 60;
      return mins > 0 ? `${hours}ч ${mins}м` : `${hours}ч`;
    }
    const days = Math.floor(minutes / 1440);
    const hours = Math.floor((minutes % 1440) / 60);
    return hours > 0 ? `${days}д ${hours}ч` : `${days}д`;
  }
}
