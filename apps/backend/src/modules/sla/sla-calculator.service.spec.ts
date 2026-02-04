import { SlaCalculatorService } from './sla-calculator.service';
import { BusinessHours } from './entities/sla-definition.entity';

describe('SlaCalculatorService', () => {
  let service: SlaCalculatorService;

  const defaultBusinessHours: BusinessHours = {
    start: '09:00',
    end: '18:00',
    timezone: 'Europe/Moscow',
    workdays: [1, 2, 3, 4, 5], // Monday-Friday
  };

  beforeEach(() => {
    service = new SlaCalculatorService();
  });

  describe('calculateDeadline', () => {
    it('should return simple deadline when businessHoursOnly is false', () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const durationMinutes = 60;

      const result = service.calculateDeadline(
        startTime,
        durationMinutes,
        defaultBusinessHours,
        false,
      );

      expect(result).toEqual(new Date('2024-01-15T11:00:00Z'));
    });

    it('should return startTime for zero duration', () => {
      const startTime = new Date('2024-01-15T10:00:00Z');

      const result = service.calculateDeadline(
        startTime,
        0,
        defaultBusinessHours,
        true,
      );

      expect(result).toEqual(startTime);
    });

    it('should calculate deadline within same business day', () => {
      // Monday 10:00 + 4 hours = Monday 14:00
      const startTime = new Date('2024-01-15T10:00:00'); // Monday
      const durationMinutes = 240;

      const result = service.calculateDeadline(
        startTime,
        durationMinutes,
        defaultBusinessHours,
        true,
      );

      expect(result.getHours()).toBe(14);
    });

    it('should roll over to next business day when exceeding work hours', () => {
      // Monday 16:00 + 4 hours should go to Tuesday
      const startTime = new Date('2024-01-15T16:00:00'); // Monday 4pm
      const durationMinutes = 240; // 4 hours

      const result = service.calculateDeadline(
        startTime,
        durationMinutes,
        defaultBusinessHours,
        true,
      );

      // 2 hours left on Monday + 2 hours on Tuesday = Tuesday 11:00
      expect(result.getDate()).toBe(16); // Tuesday
      expect(result.getHours()).toBe(11);
    });

    it('should skip weekends when calculating deadline', () => {
      // Friday 17:00 + 2 hours should go to Monday
      const startTime = new Date('2024-01-19T17:00:00'); // Friday 5pm
      startTime.setDate(19); // Friday
      const durationMinutes = 120; // 2 hours

      // Mock to ensure correct day
      jest.spyOn(startTime, 'getDay').mockReturnValue(5); // Friday

      const result = service.calculateDeadline(
        startTime,
        durationMinutes,
        defaultBusinessHours,
        true,
      );

      // Should be on a weekday (Monday-Friday)
      expect([1, 2, 3, 4, 5]).toContain(result.getDay());
    });
  });

  describe('calculateRemainingMinutes', () => {
    it('should return negative value when deadline is passed', () => {
      const deadline = new Date('2024-01-15T10:00:00Z');
      const currentTime = new Date('2024-01-15T11:00:00Z');

      const result = service.calculateRemainingMinutes(
        deadline,
        currentTime,
        defaultBusinessHours,
        false,
        0,
      );

      expect(result).toBe(-60);
    });

    it('should calculate remaining minutes without business hours', () => {
      const deadline = new Date('2024-01-15T12:00:00Z');
      const currentTime = new Date('2024-01-15T10:00:00Z');

      const result = service.calculateRemainingMinutes(
        deadline,
        currentTime,
        defaultBusinessHours,
        false,
        0,
      );

      expect(result).toBe(120);
    });

    it('should add paused minutes to remaining time', () => {
      const deadline = new Date('2024-01-15T12:00:00Z');
      const currentTime = new Date('2024-01-15T10:00:00Z');
      const pausedMinutes = 30;

      const result = service.calculateRemainingMinutes(
        deadline,
        currentTime,
        defaultBusinessHours,
        false,
        pausedMinutes,
      );

      expect(result).toBe(150); // 120 + 30
    });
  });

  describe('calculateElapsedMinutes', () => {
    it('should calculate elapsed minutes without business hours', () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const endTime = new Date('2024-01-15T12:30:00Z');

      const result = service.calculateElapsedMinutes(
        startTime,
        endTime,
        defaultBusinessHours,
        false,
      );

      expect(result).toBe(150);
    });

    it('should return 0 when start equals end', () => {
      const time = new Date('2024-01-15T10:00:00Z');

      const result = service.calculateElapsedMinutes(
        time,
        time,
        defaultBusinessHours,
        false,
      );

      expect(result).toBe(0);
    });
  });

  describe('calculateUsedPercent', () => {
    it('should return 0% at start', () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const deadline = new Date('2024-01-15T12:00:00Z');

      const result = service.calculateUsedPercent(
        startTime,
        deadline,
        startTime,
        defaultBusinessHours,
        false,
        0,
      );

      expect(result).toBe(0);
    });

    it('should return 50% at halfway point', () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const deadline = new Date('2024-01-15T12:00:00Z');
      const currentTime = new Date('2024-01-15T11:00:00Z');

      const result = service.calculateUsedPercent(
        startTime,
        deadline,
        currentTime,
        defaultBusinessHours,
        false,
        0,
      );

      expect(result).toBe(50);
    });

    it('should return 100% at deadline', () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const deadline = new Date('2024-01-15T12:00:00Z');

      const result = service.calculateUsedPercent(
        startTime,
        deadline,
        deadline,
        defaultBusinessHours,
        false,
        0,
      );

      expect(result).toBe(100);
    });

    it('should cap at 100% when past deadline', () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const deadline = new Date('2024-01-15T12:00:00Z');
      const currentTime = new Date('2024-01-15T14:00:00Z');

      const result = service.calculateUsedPercent(
        startTime,
        deadline,
        currentTime,
        defaultBusinessHours,
        false,
        0,
      );

      expect(result).toBe(100);
    });

    it('should return 100% when total time is 0', () => {
      const time = new Date('2024-01-15T10:00:00Z');

      const result = service.calculateUsedPercent(
        time,
        time,
        time,
        defaultBusinessHours,
        false,
        0,
      );

      expect(result).toBe(100);
    });

    it('should account for paused minutes', () => {
      const startTime = new Date('2024-01-15T10:00:00Z');
      const deadline = new Date('2024-01-15T12:00:00Z');
      const currentTime = new Date('2024-01-15T11:30:00Z');
      const pausedMinutes = 30;

      const result = service.calculateUsedPercent(
        startTime,
        deadline,
        currentTime,
        defaultBusinessHours,
        false,
        pausedMinutes,
      );

      // (90 - 30) / 120 * 100 = 50%
      expect(result).toBe(50);
    });
  });

  describe('isWithinBusinessHours', () => {
    it('should return true during business hours on weekday', () => {
      const time = new Date('2024-01-15T10:00:00'); // Monday 10am

      const result = service.isWithinBusinessHours(time, defaultBusinessHours);

      expect(result).toBe(true);
    });

    it('should return false before business hours', () => {
      const time = new Date('2024-01-15T07:00:00'); // Monday 7am

      const result = service.isWithinBusinessHours(time, defaultBusinessHours);

      expect(result).toBe(false);
    });

    it('should return false after business hours', () => {
      const time = new Date('2024-01-15T19:00:00'); // Monday 7pm

      const result = service.isWithinBusinessHours(time, defaultBusinessHours);

      expect(result).toBe(false);
    });

    it('should return false on weekend', () => {
      const saturday = new Date('2024-01-20T10:00:00'); // Saturday

      const result = service.isWithinBusinessHours(saturday, defaultBusinessHours);

      expect(result).toBe(false);
    });
  });

  describe('formatDuration', () => {
    it('should format minutes correctly', () => {
      expect(service.formatDuration(30)).toBe('30м');
      expect(service.formatDuration(59)).toBe('59м');
    });

    it('should format hours correctly', () => {
      expect(service.formatDuration(60)).toBe('1ч');
      expect(service.formatDuration(90)).toBe('1ч 30м');
      expect(service.formatDuration(120)).toBe('2ч');
    });

    it('should format days correctly', () => {
      expect(service.formatDuration(1440)).toBe('1д');
      expect(service.formatDuration(1500)).toBe('1д 1ч');
      expect(service.formatDuration(2880)).toBe('2д');
    });

    it('should handle negative duration', () => {
      expect(service.formatDuration(-30)).toBe('-30м');
      expect(service.formatDuration(-90)).toBe('-1ч 30м');
    });

    it('should handle zero', () => {
      expect(service.formatDuration(0)).toBe('0м');
    });
  });
});
