import { z } from 'zod';
import type { Env } from '../config/env.js';

const short = z.string().max(180).nullable().optional();
const finite = z.number().finite().nullable().optional();

export const clientSignatureEvidenceSchema = z.object({
  captureVersion: z.string().max(20).optional(),
  capturedAt: z.string().max(60).optional(),
  originHint: z.enum(['PORTAL', 'PWA', 'ANDROID']).optional(),
  device: z.object({
    type: z.enum(['DESKTOP', 'PHONE', 'TABLET', 'UNKNOWN']).optional(),
    brand: short,
    model: short,
    manufacturer: short,
    platform: short,
    platformVersion: short,
    osName: short,
    osVersion: short,
    browserName: short,
    browserVersion: short,
    appVersion: short,
    architecture: short,
    mobile: z.boolean().nullable().optional(),
    screenWidth: finite,
    screenHeight: finite,
    pixelRatio: finite,
    language: z.string().max(40).nullable().optional(),
    timezone: z.string().max(80).nullable().optional(),
    userAgent: z.string().max(500).nullable().optional(),
  }).optional(),
  location: z.object({
    status: z.enum(['CAPTURED', 'DENIED', 'UNAVAILABLE', 'TIMEOUT', 'ERROR', 'UNSUPPORTED']).optional(),
    permission: z.enum(['granted', 'denied', 'prompt', 'unknown']).optional(),
    latitude: z.number().finite().min(-90).max(90).nullable().optional(),
    longitude: z.number().finite().min(-180).max(180).nullable().optional(),
    accuracyMeters: z.number().finite().min(0).max(1_000_000).nullable().optional(),
    altitude: finite,
    altitudeAccuracyMeters: finite,
    heading: finite,
    speedMps: finite,
    capturedAt: z.string().max(60).nullable().optional(),
    errorCode: z.number().int().min(0).max(100).nullable().optional(),
    errorMessage: z.string().max(240).nullable().optional(),
  }).optional(),
}).optional();

export type ClientSignatureEvidenceInput = z.infer<typeof clientSignatureEvidenceSchema>;
type ClientSignatureEvidenceObject = Exclude<ClientSignatureEvidenceInput, undefined>;
type ClientDeviceInput = NonNullable<ClientSignatureEvidenceObject['device']>;
type ClientLocationInput = NonNullable<ClientSignatureEvidenceObject['location']>;

function cleanText(value: unknown, max = 180): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function cleanNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export async function normalizeClientSignatureEvidence(
  raw: ClientSignatureEvidenceInput,
  env: Env,
): Promise<Record<string, unknown>> {
  const input: ClientSignatureEvidenceObject = raw ?? {};
  const device: ClientDeviceInput = input.device ?? {};
  const location: ClientLocationInput = input.location ?? {};
  const latitude = cleanNumber(location.latitude);
  const longitude = cleanNumber(location.longitude);

  let address: string | null = null;
  let addressDetails: Record<string, unknown> | null = null;
  let geocodingStatus: 'NOT_REQUESTED' | 'RESOLVED' | 'FAILED' | 'DISABLED' = 'NOT_REQUESTED';

  if (latitude !== null && longitude !== null) {
    if (!env.REVERSE_GEOCODING_ENABLED) {
      geocodingStatus = 'DISABLED';
    } else {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 3500);
        const base = env.REVERSE_GEOCODING_URL.replace(/\/$/, '');
        const url = `${base}?format=jsonv2&lat=${encodeURIComponent(String(latitude))}&lon=${encodeURIComponent(String(longitude))}&addressdetails=1&zoom=18&accept-language=pt-BR`;
        const response = await fetch(url, {
          headers: {
            accept: 'application/json',
            'user-agent': 'PayHub/0.4.2 signature-evidence',
            'accept-language': 'pt-BR,pt;q=0.9',
          },
          signal: controller.signal,
        }).finally(() => clearTimeout(timer));
        if (response.ok) {
          const payload = await response.json() as Record<string, unknown>;
          address = cleanText(payload.display_name, 500);
          const rawAddress = payload.address;
          if (rawAddress && typeof rawAddress === 'object' && !Array.isArray(rawAddress)) {
            addressDetails = Object.fromEntries(
              Object.entries(rawAddress as Record<string, unknown>)
                .slice(0, 40)
                .map(([key, value]) => [key.slice(0, 80), cleanText(value, 180)])
                .filter(([, value]) => value !== null),
            );
          }
          geocodingStatus = address ? 'RESOLVED' : 'FAILED';
        } else {
          geocodingStatus = 'FAILED';
        }
      } catch {
        geocodingStatus = 'FAILED';
      }
    }
  }

  return {
    captureVersion: cleanText(input.captureVersion, 20) ?? '2',
    capturedAt: cleanText(input.capturedAt, 60),
    originHint: cleanText(input.originHint, 20),
    device: {
      type: cleanText(device.type, 30),
      brand: cleanText(device.brand),
      model: cleanText(device.model),
      manufacturer: cleanText(device.manufacturer),
      platform: cleanText(device.platform),
      platformVersion: cleanText(device.platformVersion),
      osName: cleanText(device.osName),
      osVersion: cleanText(device.osVersion),
      browserName: cleanText(device.browserName),
      browserVersion: cleanText(device.browserVersion),
      appVersion: cleanText(device.appVersion),
      architecture: cleanText(device.architecture),
      mobile: typeof device.mobile === 'boolean' ? device.mobile : null,
      screenWidth: cleanNumber(device.screenWidth),
      screenHeight: cleanNumber(device.screenHeight),
      pixelRatio: cleanNumber(device.pixelRatio),
      language: cleanText(device.language, 40),
      timezone: cleanText(device.timezone, 80),
      userAgent: cleanText(device.userAgent, 500),
    },
    location: {
      status: cleanText(location.status, 30) ?? 'UNSUPPORTED',
      permission: cleanText(location.permission, 20) ?? 'unknown',
      latitude,
      longitude,
      accuracyMeters: cleanNumber(location.accuracyMeters),
      altitude: cleanNumber(location.altitude),
      altitudeAccuracyMeters: cleanNumber(location.altitudeAccuracyMeters),
      heading: cleanNumber(location.heading),
      speedMps: cleanNumber(location.speedMps),
      capturedAt: cleanText(location.capturedAt, 60),
      errorCode: cleanNumber(location.errorCode),
      errorMessage: cleanText(location.errorMessage, 240),
      address,
      addressDetails,
      geocodingStatus,
    },
  };
}
