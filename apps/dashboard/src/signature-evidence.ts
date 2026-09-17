export type SignatureOrigin = 'PORTAL' | 'PWA' | 'ANDROID';

export type ClientSignatureEvidence = {
  captureVersion: '2';
  capturedAt: string;
  originHint: SignatureOrigin;
  device: {
    type: 'DESKTOP' | 'PHONE' | 'TABLET' | 'UNKNOWN';
    brand: string | null;
    model: string | null;
    manufacturer: string | null;
    platform: string | null;
    platformVersion: string | null;
    osName: string | null;
    osVersion: string | null;
    browserName: string | null;
    browserVersion: string | null;
    appVersion: string | null;
    architecture: string | null;
    mobile: boolean | null;
    screenWidth: number | null;
    screenHeight: number | null;
    pixelRatio: number | null;
    language: string | null;
    timezone: string | null;
    userAgent: string | null;
  };
  location: {
    status: 'CAPTURED' | 'DENIED' | 'UNAVAILABLE' | 'TIMEOUT' | 'ERROR' | 'UNSUPPORTED';
    permission: 'granted' | 'denied' | 'prompt' | 'unknown';
    latitude: number | null;
    longitude: number | null;
    accuracyMeters: number | null;
    altitude: number | null;
    altitudeAccuracyMeters: number | null;
    heading: number | null;
    speedMps: number | null;
    capturedAt: string | null;
    errorCode: number | null;
    errorMessage: string | null;
  };
};

declare global {
  interface Window {
    PayHubNative?: {
      getDeviceInfo?: () => string;
    };
  }

  interface Navigator {
    userAgentData?: {
      brands?: Array<{ brand: string; version: string }>;
      mobile?: boolean;
      platform?: string;
      getHighEntropyValues?: (hints: string[]) => Promise<Record<string, unknown>>;
    };
  }
}

function clip(value: unknown, max = 180): string | null {
  if (value == null) return null;
  const text = String(value).trim();
  return text ? text.slice(0, max) : null;
}

function numberOrNull(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseBrowser(ua: string): { name: string | null; version: string | null } {
  const rules: Array<[RegExp, string]> = [
    [/Edg\/([\d.]+)/, 'Edge'],
    [/OPR\/([\d.]+)/, 'Opera'],
    [/Chrome\/([\d.]+)/, 'Chrome'],
    [/CriOS\/([\d.]+)/, 'Chrome iOS'],
    [/Firefox\/([\d.]+)/, 'Firefox'],
    [/FxiOS\/([\d.]+)/, 'Firefox iOS'],
    [/Version\/([\d.]+).*Safari\//, 'Safari'],
  ];
  for (const [re, name] of rules) {
    const match = re.exec(ua);
    if (match) return { name, version: match[1] ?? null };
  }
  return { name: null, version: null };
}

function parseOs(ua: string): { name: string | null; version: string | null } {
  let match = /Android\s+([\d.]+)/i.exec(ua);
  if (match) return { name: 'Android', version: match[1] ?? null };
  match = /(?:iPhone|iPad).*OS\s([\d_]+)/i.exec(ua);
  if (match) return { name: 'iOS/iPadOS', version: (match[1] ?? '').replace(/_/g, '.') || null };
  match = /Windows NT\s([\d.]+)/i.exec(ua);
  if (match) return { name: 'Windows', version: match[1] ?? null };
  match = /Mac OS X\s([\d_]+)/i.exec(ua);
  if (match) return { name: 'macOS', version: (match[1] ?? '').replace(/_/g, '.') || null };
  if (/Linux/i.test(ua)) return { name: 'Linux', version: null };
  return { name: null, version: null };
}

function guessDeviceType(ua: string, mobileHint: boolean | null): ClientSignatureEvidence['device']['type'] {
  if (/iPad|Tablet|SM-T|Tab/i.test(ua)) return 'TABLET';
  if (mobileHint === true || /Mobi|Android|iPhone/i.test(ua)) return 'PHONE';
  if (ua) return 'DESKTOP';
  return 'UNKNOWN';
}

export function signatureOrigin(): SignatureOrigin {
  if (typeof window !== 'undefined' && window.PayHubNative?.getDeviceInfo) return 'ANDROID';
  if (typeof window !== 'undefined' && window.matchMedia?.('(display-mode: standalone)').matches) return 'PWA';
  if (typeof navigator !== 'undefined' && (navigator as Navigator & { standalone?: boolean }).standalone) return 'PWA';
  return 'PORTAL';
}

async function nativeDeviceInfo(): Promise<Record<string, unknown>> {
  try {
    const raw = window.PayHubNative?.getDeviceInfo?.();
    return raw ? JSON.parse(raw) as Record<string, unknown> : {};
  } catch {
    return {};
  }
}

async function collectDevice(): Promise<ClientSignatureEvidence['device']> {
  const ua = clip(navigator.userAgent, 500) ?? '';
  const uaData = navigator.userAgentData;
  let high: Record<string, unknown> = {};
  try {
    if (uaData?.getHighEntropyValues) {
      high = await uaData.getHighEntropyValues([
        'architecture', 'bitness', 'model', 'platformVersion', 'uaFullVersion', 'fullVersionList', 'wow64'
      ]);
    }
  } catch {
    high = {};
  }
  const native = await nativeDeviceInfo();
  const browser = parseBrowser(ua);
  const os = parseOs(ua);
  const mobileHint = typeof uaData?.mobile === 'boolean' ? uaData.mobile : null;
  const nativeType = clip(native.deviceType, 30)?.toUpperCase();
  const type = nativeType === 'TABLET' || nativeType === 'PHONE' || nativeType === 'DESKTOP'
    ? nativeType as ClientSignatureEvidence['device']['type']
    : guessDeviceType(ua, mobileHint);

  return {
    type,
    brand: clip(native.brand ?? native.manufacturer ?? null),
    model: clip(native.model ?? high.model ?? null),
    manufacturer: clip(native.manufacturer ?? null),
    platform: clip(native.platform ?? uaData?.platform ?? navigator.platform ?? null),
    platformVersion: clip(native.platformVersion ?? high.platformVersion ?? null),
    osName: clip(native.osName ?? os.name),
    osVersion: clip(native.osVersion ?? os.version),
    browserName: browser.name,
    browserVersion: clip(high.uaFullVersion ?? browser.version),
    appVersion: clip(native.appVersion ?? null),
    architecture: clip(native.architecture ?? high.architecture ?? null),
    mobile: typeof native.mobile === 'boolean' ? native.mobile : mobileHint,
    screenWidth: numberOrNull(window.screen?.width),
    screenHeight: numberOrNull(window.screen?.height),
    pixelRatio: numberOrNull(window.devicePixelRatio),
    language: clip(navigator.language, 40),
    timezone: clip(Intl.DateTimeFormat().resolvedOptions().timeZone, 80),
    userAgent: ua || null,
  };
}

async function permissionState(): Promise<'granted' | 'denied' | 'prompt' | 'unknown'> {
  try {
    if (!navigator.permissions?.query) return 'unknown';
    const result = await navigator.permissions.query({ name: 'geolocation' as PermissionName });
    return ['granted', 'denied', 'prompt'].includes(result.state) ? result.state as 'granted' | 'denied' | 'prompt' : 'unknown';
  } catch {
    return 'unknown';
  }
}

async function collectLocation(): Promise<ClientSignatureEvidence['location']> {
  const permission = await permissionState();
  if (!navigator.geolocation) {
    return { status: 'UNSUPPORTED', permission, latitude: null, longitude: null, accuracyMeters: null, altitude: null, altitudeAccuracyMeters: null, heading: null, speedMps: null, capturedAt: null, errorCode: null, errorMessage: 'Geolocalização indisponível neste dispositivo.' };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) => resolve({
        status: 'CAPTURED',
        permission: 'granted',
        latitude: numberOrNull(position.coords.latitude),
        longitude: numberOrNull(position.coords.longitude),
        accuracyMeters: numberOrNull(position.coords.accuracy),
        altitude: numberOrNull(position.coords.altitude),
        altitudeAccuracyMeters: numberOrNull(position.coords.altitudeAccuracy),
        heading: numberOrNull(position.coords.heading),
        speedMps: numberOrNull(position.coords.speed),
        capturedAt: new Date(position.timestamp || Date.now()).toISOString(),
        errorCode: null,
        errorMessage: null,
      }),
      (error) => {
        const status = error.code === 1 ? 'DENIED' : error.code === 2 ? 'UNAVAILABLE' : error.code === 3 ? 'TIMEOUT' : 'ERROR';
        resolve({
          status,
          permission: error.code === 1 ? 'denied' : permission,
          latitude: null,
          longitude: null,
          accuracyMeters: null,
          altitude: null,
          altitudeAccuracyMeters: null,
          heading: null,
          speedMps: null,
          capturedAt: null,
          errorCode: error.code,
          errorMessage: clip(error.message, 240),
        });
      },
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 },
    );
  });
}

export async function collectSignatureClientEvidence(): Promise<ClientSignatureEvidence> {
  const [device, location] = await Promise.all([collectDevice(), collectLocation()]);
  return {
    captureVersion: '2',
    capturedAt: new Date().toISOString(),
    originHint: signatureOrigin(),
    device,
    location,
  };
}
