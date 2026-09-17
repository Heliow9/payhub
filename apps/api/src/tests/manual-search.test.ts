import { describe, expect, it } from 'vitest';
import { normalizeManualCompetency } from '../core/time.js';

describe('manual payroll search competency', () => {
  it('accepts an explicit historical competency', () => {
    expect(normalizeManualCompetency({ year: 2018, month: 5 })).toEqual({ year: 2018, month: 5 });
  });

  it('rejects invalid month values', () => {
    expect(() => normalizeManualCompetency({ year: 2026, month: 13 })).toThrow(/mês/i);
  });
});
