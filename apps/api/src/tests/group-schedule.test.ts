import { describe, expect, it } from 'vitest';
import { maskToWeekdays, normalizeWeekdays, weekdaysToMask } from '../services/group.service.js';

describe('group schedule weekdays', () => {
  it('defaults to monday through friday', () => {
    expect(normalizeWeekdays(undefined)).toEqual([1, 2, 3, 4, 5]);
    expect(weekdaysToMask([1, 2, 3, 4, 5])).toBe(31);
    expect(maskToWeekdays(31)).toEqual([1, 2, 3, 4, 5]);
  });

  it('supports weekend schedules', () => {
    const mask = weekdaysToMask([1, 6, 7]);
    expect(mask).toBe(97);
    expect(maskToWeekdays(mask)).toEqual([1, 6, 7]);
  });
});
