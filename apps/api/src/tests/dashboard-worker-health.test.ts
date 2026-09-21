import { describe, expect, it } from 'vitest';
import { workerHealthFromRow } from '../routes/dashboard.routes.js';

describe('workerHealthFromRow', () => {
  const now = new Date('2026-09-20T21:00:00Z');
  it('diferencia HEALTHY, STALE, OFFLINE e ERROR', () => {
    expect(workerHealthFromRow({ phase:'IDLE',status:'RUNNING',lastHeartbeatAt:'2026-09-20T20:59:30Z' } as never,20,now).status).toBe('HEALTHY');
    expect(workerHealthFromRow({ phase:'NORMALIZING',status:'RUNNING',currentJobId:9,lastHeartbeatAt:'2026-09-20T20:59:00Z' } as never,20,now)).toMatchObject({status:'STALE',phase:'NORMALIZING',currentJobId:9});
    expect(workerHealthFromRow({ phase:'IDLE',status:'RUNNING',lastHeartbeatAt:'2026-09-20T20:50:00Z' } as never,20,now).status).toBe('OFFLINE');
    expect(workerHealthFromRow({ phase:'NORMALIZING',status:'ERROR',currentJobId:9,lastHeartbeatAt:'2026-09-20T20:59:55Z' } as never,20,now).status).toBe('ERROR');
  });
});
