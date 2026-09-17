import { canonicalJson } from '../core/json.js';
import { sha256 } from '../core/security.js';

export interface SourceBatch {
  sourceTable: string;
  rows: Array<Record<string, unknown>>;
}

export interface NormalizedItem {
  code: string;
  description: string;
  reference: string | null;
  amount: number;
  nature: 'EARNING' | 'DEDUCTION' | 'BASE' | 'OTHER';
}

export interface NormalizedPayroll {
  sageEmployeeCode: string;
  year: number;
  month: number;
  payrollType: number;
  payrollTypeLabel: string;
  gross: number | null;
  deductions: number | null;
  net: number | null;
  items: NormalizedItem[];
  sourceHash: string;
  rawReference: Record<string, unknown>;
}

const typeLabels: Record<number, string> = {
  2: 'Mensal',
  3: 'Adiantamento 13º',
  4: '13º salário',
  6: 'Rescisão',
};

const aliases = {
  employee: ['cd_funcionario', 'codigo_funcionario', 'funcionario', 'id_funcionario', 'cod_funcionario'],
  year: ['ano', 'nr_ano', 'ano_referencia', 'ano_competencia'],
  month: ['mes', 'nr_mes', 'mes_referencia', 'mes_competencia'],
  type: ['tipo', 'tipo_processamento', 'tp_folha', 'tipo_folha', 'cd_tipo'],
  event: ['cd_evento', 'codigo_evento', 'evento', 'id_evento'],
  amount: ['vl_evento', 'valor_evento', 'valor', 'vlr_evento', 'vl_calculado', 'valor_calculado'],
  refEdited: ['referencia_editada', 'referencia_formatada'],
  ref: ['referencia', 'vl_referencia', 'valor_referencia', 'quantidade', 'qtd'],
  desc: ['ds_evento', 'descricao', 'descricao_evento', 'nm_evento', 'nome'],
  nature: ['tp_evento', 'tipo_evento', 'natureza', 'fl_provento_desconto', 'indicador'],
  effectiveFrom: ['dt_inicio', 'data_inicio', 'inicio_vigencia', 'dt_vigencia'],
} as const;

type PayrollKey = {
  employee: string;
  year: number;
  month: number;
  type: number;
};

function entriesCI(row: Record<string, unknown>): Map<string, unknown> {
  const map = new Map<string, unknown>();
  for (const [key, value] of Object.entries(row)) map.set(key.toLowerCase(), value);
  return map;
}

function pick(row: Record<string, unknown>, names: readonly string[]): unknown {
  const map = entriesCI(row);
  for (const name of names) {
    const value = map.get(name.toLowerCase());
    if (value !== undefined && value !== null && value !== '') return value;
  }
  return null;
}

function text(value: unknown): string {
  return value == null ? '' : String(value).trim();
}

function num(value: unknown): number | null {
  if (value == null || value === '') return null;
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  const normalized = String(value).trim().replace(/\./g, '').replace(',', '.');
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function int(value: unknown): number | null {
  const parsed = num(value);
  return parsed == null ? null : Math.trunc(parsed);
}

function same(a: unknown, b: unknown): boolean {
  return text(a) === text(b);
}

function rowKey(row: Record<string, unknown>): PayrollKey | null {
  const employee = text(pick(row, aliases.employee));
  const year = int(pick(row, aliases.year));
  const month = int(pick(row, aliases.month));
  const type = int(pick(row, aliases.type));
  if (!employee || !year || !month || !type) return null;
  return { employee, year, month, type };
}

function keyText(key: PayrollKey): string {
  return `${key.employee}|${key.year}|${key.month}|${key.type}`;
}

function samePayroll(row: Record<string, unknown>, key: PayrollKey): boolean {
  return same(pick(row, aliases.employee), key.employee)
    && int(pick(row, aliases.year)) === key.year
    && int(pick(row, aliases.month)) === key.month
    && int(pick(row, aliases.type)) === key.type;
}

function sameEmployeeCompetence(row: Record<string, unknown>, key: PayrollKey): boolean {
  return same(pick(row, aliases.employee), key.employee)
    && int(pick(row, aliases.year)) === key.year
    && int(pick(row, aliases.month)) === key.month;
}

function parseDate(value: unknown): number | null {
  if (value == null || value === '') return null;
  const time = Date.parse(String(value));
  return Number.isFinite(time) ? time : null;
}

function applicableDefinition(
  definitionsByCode: Map<string, Array<Record<string, unknown>>>,
  code: string,
  year: number,
  month: number,
): Record<string, unknown> | undefined {
  const candidates = definitionsByCode.get(code) ?? [];
  if (candidates.length === 0) return undefined;

  const competenceEnd = Date.UTC(year, month, 0, 23, 59, 59, 999);
  const dated = candidates
    .map((row) => ({ row, date: parseDate(pick(row, aliases.effectiveFrom)) }))
    .filter((entry): entry is { row: Record<string, unknown>; date: number } => entry.date !== null)
    .sort((a, b) => b.date - a.date);

  return dated.find((entry) => entry.date <= competenceEnd)?.row
    ?? dated[0]?.row
    ?? candidates[candidates.length - 1];
}

function inferNature(
  eventRow: Record<string, unknown>,
  definition: Record<string, unknown> | undefined,
  description: string,
  amount: number,
): NormalizedItem['nature'] {
  const raw = text(pick(definition ?? {}, aliases.nature) ?? pick(eventRow, aliases.nature)).toUpperCase();
  const desc = description.toUpperCase();

  // No Sage real: D = desconto e V = vencimento/provento.
  if (raw === 'D' || raw === '2' || raw.includes('DESC')) return 'DEDUCTION';
  if (raw === 'V' || raw === 'P' || raw === '1' || raw.includes('PROV') || raw.includes('VENC')) return 'EARNING';
  if (raw.includes('BASE')) return 'BASE';

  // Fallbacks para instalações Sage com cadastros antigos/incompletos.
  if (desc.includes('DESCONTO') || desc.includes('DESC ') || desc.includes('INSS') || desc.includes('IRRF') || desc.includes('FALTA')) return 'DEDUCTION';
  if (desc.includes('SALÁRIO') || desc.includes('SALARIO') || desc.includes('HORA EXTRA') || desc.includes('GRATIF') || desc.includes('ADICIONAL') || desc.includes('DSR')) return 'EARNING';
  if (desc.startsWith('BASE ')) return 'BASE';
  if (amount < 0) return 'DEDUCTION';
  return 'OTHER';
}

function referenceText(row: Record<string, unknown>): string | null {
  const edited = text(pick(row, aliases.refEdited));
  if (edited) return edited;
  const raw = pick(row, aliases.ref);
  return raw == null || raw === '' ? null : text(raw);
}

function rounded(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function itemNatureRank(nature: NormalizedItem['nature']): number {
  if (nature === 'EARNING') return 0;
  if (nature === 'DEDUCTION') return 1;
  if (nature === 'BASE') return 2;
  return 3;
}

function eventCodeNumber(code: string): number {
  const normalized = code.replace(/\D/g, '');
  const parsed = Number(normalized);
  return normalized && Number.isFinite(parsed) ? parsed : Number.MAX_SAFE_INTEGER;
}

function sortPayrollItems(items: NormalizedItem[]): NormalizedItem[] {
  return [...items].sort((a, b) =>
    itemNatureRank(a.nature) - itemNatureRank(b.nature)
    || eventCodeNumber(a.code) - eventCodeNumber(b.code)
    || a.code.localeCompare(b.code, 'pt-BR')
  );
}

export function normalizePayrollBatches(batches: SourceBatch[], targetEmployees: string[]): NormalizedPayroll[] {
  const tables = new Map<string, Array<Record<string, unknown>>>();
  for (const batch of batches) {
    const table = batch.sourceTable.toLowerCase();
    tables.set(table, [...(tables.get(table) ?? []), ...batch.rows]);
  }

  const movCapa = tables.get('movcapa') ?? [];
  const movEvento = tables.get('movevento') ?? [];
  const procEvento = tables.get('procevento') ?? [];
  const procBase = tables.get('procbase') ?? [];
  const eventoGVigencia = tables.get('eventogvigencia') ?? [];

  const targetSet = new Set(targetEmployees.map(String));

  // ProcEvento é a fonte financeira real do Sage. Em versões antigas do PayHub,
  // ele era tratado incorretamente como cadastro/descrição de evento.
  const processedEvents = procEvento.filter((row) => {
    const key = rowKey(row);
    return key !== null && targetSet.has(key.employee) && num(pick(row, aliases.amount)) !== null;
  });

  // Compatibilidade com lotes antigos: se ProcEvento não trouxer eventos processados,
  // usa MovEvento como fonte financeira quando ele efetivamente contiver valor.
  const financialEvents = processedEvents.length > 0
    ? processedEvents
    : movEvento.filter((row) => {
        const key = rowKey(row);
        return key !== null && targetSet.has(key.employee) && num(pick(row, aliases.amount)) !== null;
      });

  // EventoGVigencia é o cadastro de descrição/natureza. Mantemos também suporte
  // ao formato legado em que ProcEvento vinha apenas com descrição do evento.
  const legacyDefinitions = procEvento.filter((row) => rowKey(row) === null && text(pick(row, aliases.event)) !== '');
  const definitions = [...eventoGVigencia, ...legacyDefinitions];
  const definitionsByCode = new Map<string, Array<Record<string, unknown>>>();
  for (const row of definitions) {
    const code = text(pick(row, aliases.event));
    if (!code) continue;
    definitionsByCode.set(code, [...(definitionsByCode.get(code) ?? []), row]);
  }

  const keys = new Map<string, PayrollKey>();
  for (const row of financialEvents) {
    const key = rowKey(row);
    if (key && targetSet.has(key.employee)) keys.set(keyText(key), key);
  }

  // Fallback para instalações em que MovEvento possui competência/tipo e o valor
  // está em outra coluna reconhecida posteriormente.
  if (keys.size === 0) {
    for (const row of movEvento) {
      const key = rowKey(row);
      if (key && targetSet.has(key.employee)) keys.set(keyText(key), key);
    }
  }

  const result: NormalizedPayroll[] = [];
  for (const [keyString, meta] of keys) {
    const eventRows = financialEvents.filter((row) => samePayroll(row, meta));
    if (eventRows.length === 0) continue;

    const items: NormalizedItem[] = sortPayrollItems(eventRows.map((row) => {
      const code = text(pick(row, aliases.event)) || '—';
      const definition = applicableDefinition(definitionsByCode, code, meta.year, meta.month);
      const description = text(pick(definition ?? {}, aliases.desc))
        || text(pick(row, aliases.desc))
        || `Evento ${code}`;
      const signedAmount = num(pick(row, aliases.amount)) ?? 0;
      const nature = inferNature(row, definition, description, signedAmount);
      return {
        code,
        description,
        reference: referenceText(row),
        amount: Math.abs(signedAmount),
        nature,
      };
    }));

    const grossValue = items
      .filter((item) => item.nature === 'EARNING')
      .reduce((sum, item) => sum + item.amount, 0);
    const deductionValue = items
      .filter((item) => item.nature === 'DEDUCTION')
      .reduce((sum, item) => sum + item.amount, 0);

    const gross = grossValue > 0 ? rounded(grossValue) : null;
    const deductions = deductionValue > 0 ? rounded(deductionValue) : null;
    const net = gross !== null ? rounded(gross - (deductions ?? 0)) : null;

    const capaRow = movCapa.find((row) => sameEmployeeCompetence(row, meta)) ?? {};
    const baseRow = procBase.find((row) => samePayroll(row, meta)) ?? {};
    const movementRows = movEvento.filter((row) => samePayroll(row, meta));
    const selectedDefinitions = eventRows.map((row) => {
      const code = text(pick(row, aliases.event));
      return applicableDefinition(definitionsByCode, code, meta.year, meta.month) ?? null;
    });

    const rawReference = {
      key: keyString,
      capa: capaRow,
      base: baseRow,
      processedEventCount: eventRows.length,
      movementEventCount: movementRows.length,
    };

    const sourceHash = sha256(canonicalJson({
      documentTemplateVersion: 'sage-holerite-v2',
      capa: capaRow,
      base: baseRow,
      eventosProcessados: eventRows,
      movimentos: movementRows,
      definicoes: selectedDefinitions,
    }));

    let label = typeLabels[meta.type] ?? `Tipo ${meta.type}`;
    const hasRescisaoEvent = items.some((item) => item.code === '180' || item.description.toUpperCase().includes('LIQUIDO RESCISAO'));
    if (meta.type === 2 && hasRescisaoEvent) label = 'Rescisão';

    result.push({
      sageEmployeeCode: meta.employee,
      year: meta.year,
      month: meta.month,
      payrollType: meta.type,
      payrollTypeLabel: label,
      gross,
      deductions,
      net,
      items,
      sourceHash,
      rawReference,
    });
  }

  return result.sort((a, b) =>
    a.sageEmployeeCode.localeCompare(b.sageEmployeeCode)
    || a.year - b.year
    || a.month - b.month
    || a.payrollType - b.payrollType
  );
}
