const REMEMBERED_EMAIL_KEY = 'payhub_remembered_email';

export function getRememberedEmail(): string {
  return localStorage.getItem(REMEMBERED_EMAIL_KEY)?.trim().toLowerCase() ?? '';
}

export function saveRememberedEmail(email: string): void {
  const normalized = email.trim().toLowerCase();
  if (normalized) localStorage.setItem(REMEMBERED_EMAIL_KEY, normalized);
  else localStorage.removeItem(REMEMBERED_EMAIL_KEY);
}

export function clearRememberedEmail(): void {
  localStorage.removeItem(REMEMBERED_EMAIL_KEY);
}
