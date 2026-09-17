export interface BrasiliaParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  weekday: number; // 1 segunda ... 7 domingo
}

const formatter = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Sao_Paulo',
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23', weekday: 'short'
});

const weekdayMap: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

export function brasiliaParts(date = new Date()): BrasiliaParts {
  const parts = Object.fromEntries(formatter.formatToParts(date).filter((p) => p.type !== 'literal').map((p) => [p.type, p.value]));
  return {
    year: Number(parts.year), month: Number(parts.month), day: Number(parts.day),
    hour: Number(parts.hour), minute: Number(parts.minute), second: Number(parts.second),
    weekday: weekdayMap[parts.weekday ?? 'Mon'] ?? 1
  };
}

export function currentCompetency(date = new Date()): { year: number; month: number } {
  const parts = brasiliaParts(date);
  return { year: parts.year, month: parts.month };
}

export function brDateKey(date = new Date()): string {
  const p = brasiliaParts(date);
  return `${p.year}-${String(p.month).padStart(2, '0')}-${String(p.day).padStart(2, '0')}`;
}

export function brTimeKey(date = new Date()): string {
  const p = brasiliaParts(date);
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:00`;
}

export function brTimestamp(date = new Date()): string {
  const p = brasiliaParts(date);
  return `${String(p.day).padStart(2, '0')}/${String(p.month).padStart(2, '0')}/${p.year} ${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}:${String(p.second).padStart(2, '0')} BRT`;
}

export function normalizeManualCompetency(input: { year: number; month: number }): { year: number; month: number } {
  const year = Number(input.year);
  const month = Number(input.month);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) throw new Error('Ano da competência inválido.');
  if (!Number.isInteger(month) || month < 1 || month > 12) throw new Error('Mês da competência inválido.');
  return { year, month };
}

