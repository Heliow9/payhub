import { describe, expect, it } from 'vitest';
import { brasiliaParts, currentCompetency } from '../core/time.js';

describe('competência e agenda em Brasília', () => {
  it('usa mês atual de America/Sao_Paulo', () => {
    const date = new Date('2026-09-17T02:30:00.000Z'); // 16/09 23:30 BRT
    expect(currentCompetency(date)).toEqual({ year: 2026, month: 9 });
    expect(brasiliaParts(date).weekday).toBe(3);
  });

  it('permite distinguir fim de semana', () => {
    expect(brasiliaParts(new Date('2026-09-19T15:00:00.000Z')).weekday).toBe(6);
    expect(brasiliaParts(new Date('2026-09-20T15:00:00.000Z')).weekday).toBe(7);
  });
});
