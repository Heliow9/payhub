import { describe, expect, it, vi } from 'vitest';
import { scheduleCompanyDue } from '../worker/main.js';

describe('durable group scheduler', () => {
  it('recovers a schedule that became due before the exact worker minute', async () => {
    const execute = vi.fn()
      .mockResolvedValueOnce([[{ scheduleId: 7, groupId: 4, companyId: 2, scheduledTime: '08:00:00' }], []])
      .mockResolvedValueOnce([{ affectedRows: 1, insertId: 21 }, []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []])
      .mockResolvedValueOnce([[{ id: 21, attemptCount: 1 }], []])
      .mockResolvedValueOnce([{ affectedRows: 1 }, []]);
    const startGroup = vi.fn().mockResolvedValue({ runId: 81, jobId: 91 });

    const result = await scheduleCompanyDue(
      { execute } as any,
      { runs: { startGroup }, runEvents: {} as any } as any,
      new Date('2026-09-21T11:03:20.000Z'), // 08:03 em Brasília
      'worker-test',
    );

    expect(String(execute.mock.calls[0][0])).toContain("TIME_FORMAT(s.run_time,'%H:%i:00')<=?");
    expect(String(execute.mock.calls[0][0])).toContain('LEFT JOIN schedule_executions');
    expect(execute.mock.calls[0][1]).toEqual(['2026-09-21', 1, '08:03:00']);
    expect(startGroup).toHaveBeenCalledWith(
      expect.objectContaining({ companyId: 2 }),
      4,
      expect.anything(),
      'SCHEDULED',
      undefined,
      expect.objectContaining({ scheduleExecutionId: 21, scheduleId: 7, scheduledTime: '08:00:00' }),
    );
    expect(result).toEqual([{ companyId: 2, groupId: 4, scheduleId: 7, runId: 81, jobId: 91 }]);
  });
});
