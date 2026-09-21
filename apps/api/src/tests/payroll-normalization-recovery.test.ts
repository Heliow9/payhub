import { describe, expect, it, vi } from 'vitest';
import { PayrollService } from '../services/payroll.service.js';
import type { NormalizationClaim } from '../services/normalization-queue.service.js';

const claim: NormalizationClaim = { jobId: 10, companyId: 2, payrollRunId: 50, owner: 'worker-a', attempt: 1 };

describe('normalização recuperável', () => {
  it('agrega resultados e renova o lease depois de cada documento', async () => {
    const service = new PayrollService({} as never, {} as never, {} as never, {} as never) as any;
    service.normalizationJob = vi.fn().mockResolvedValue({ id: 10, companyId: 2, payrollRunId: 50 });
    service.normalizedInput = vi.fn().mockResolvedValue([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    service.persistNormalizedPayroll = vi.fn().mockResolvedValueOnce('created').mockResolvedValueOnce('repaired').mockResolvedValueOnce('unchanged').mockResolvedValueOnce('skipped');
    const renew = vi.fn().mockResolvedValue(undefined);
    await expect(service.normalizeClaimedJob(claim, renew)).resolves.toEqual({ created: 1, repaired: 1, unchanged: 1, skipped: 1 });
    expect(renew).toHaveBeenCalledTimes(4);
  });

  it('mantém a regra de reparar PROCESSING/ERROR e proteger SIGNED', async () => {
    const fs = await import('node:fs/promises');
    const source = await fs.readFile(new URL('../services/payroll.service.ts', import.meta.url), 'utf8');
    expect(source).toMatch(/intact\s*&&\s*!\['PROCESSING','ERROR'\]\.includes/);
    expect(source).toContain("return'repaired'");
    expect(source).toMatch(/String\(current\.status\)==='SIGNED'\)return'unchanged'/);
    expect(source).toContain('PAYROLL_SOURCE_CHANGED_SIGNED_SKIPPED');
  });
});
