import { describe, expect, it } from 'vitest';
import type { Env } from '../config/env.js';
import { normalizeClientSignatureEvidence } from '../services/signature-client-evidence.js';

const env = {
  REVERSE_GEOCODING_ENABLED: false,
  REVERSE_GEOCODING_URL: 'https://nominatim.openstreetmap.org/reverse',
} as Env;

describe('evidência técnica do cliente', () => {
  it('preserva dispositivo e coordenadas válidas sem bloquear quando geocodificação está desabilitada', async () => {
    const evidence = await normalizeClientSignatureEvidence({
      captureVersion: '2',
      originHint: 'ANDROID',
      device: { type: 'PHONE', brand: 'Samsung', model: 'SM-X', osName: 'Android', appVersion: '0.4.2' },
      location: { status: 'CAPTURED', permission: 'granted', latitude: -8.05, longitude: -34.9, accuracyMeters: 12 },
    }, env);
    expect((evidence.device as any).brand).toBe('Samsung');
    expect((evidence.location as any).latitude).toBe(-8.05);
    expect((evidence.location as any).geocodingStatus).toBe('DISABLED');
  });

  it('registra negação de localização sem exigir coordenadas', async () => {
    const evidence = await normalizeClientSignatureEvidence({
      location: { status: 'DENIED', permission: 'denied', errorCode: 1, errorMessage: 'User denied Geolocation' },
    }, env);
    expect((evidence.location as any).status).toBe('DENIED');
    expect((evidence.location as any).latitude).toBeNull();
  });
});
