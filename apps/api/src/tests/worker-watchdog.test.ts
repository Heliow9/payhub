import { describe, expect, it, vi } from 'vitest';
import { startWatchdog } from '../worker/watchdog.js';

describe('worker watchdog', () => {
  it('não dispara quando é limpo antes do prazo', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const exit = vi.fn();
    const watchdog = startWatchdog({ timeoutMs: 1000, snapshot: () => ({ phase: 'IDLE', jobId: null }), onTimeout, exit });
    watchdog.clear();
    await vi.advanceTimersByTimeAsync(2000);
    expect(onTimeout).not.toHaveBeenCalled();
    expect(exit).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it('registra timeout e encerra o processo com código 1', async () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn().mockResolvedValue(undefined);
    const exit = vi.fn();
    const error = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    startWatchdog({ timeoutMs: 100, snapshot: () => ({ phase: 'NORMALIZING', jobId: 77 }), onTimeout, exit });
    await vi.advanceTimersByTimeAsync(150);
    await Promise.resolve();
    expect(onTimeout).toHaveBeenCalledOnce();
    expect(exit).toHaveBeenCalledWith(1);
    error.mockRestore();
    vi.useRealTimers();
  });
});
