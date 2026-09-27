#!/usr/bin/env bash
set -euo pipefail
ROOT="${1:-/var/www/payhub}"
cd "$ROOT"
STAMP="$(date +%Y%m%d-%H%M%S)"
BACKUP="$ROOT/.payhub-patch-backups/payroll-type-policy-$STAMP"
mkdir -p "$BACKUP"

FILES=(
  apps/api/src/services/settings.service.ts
  apps/api/src/routes/settings.routes.ts
  apps/api/src/services/payroll-run.service.ts
  apps/dashboard/src/api/client.ts
  apps/dashboard/src/pages/SettingsPage.tsx
  apps/dashboard/src/components/PayrollSearchModal.tsx
  apps/dashboard/src/pages/EmployeesPage.tsx
  apps/dashboard/src/pages/GroupsPage.tsx
)
for f in "${FILES[@]}"; do
  mkdir -p "$BACKUP/$(dirname "$f")"
  cp "$f" "$BACKUP/$f"
done

echo "Backup: $BACKUP"

cat > apps/api/src/db/migrations/009_company_payroll_type_policy.sql <<'SQL'
ALTER TABLE app_settings
  ADD COLUMN enabled_payroll_types_json VARCHAR(64) NOT NULL DEFAULT '[2,3,4,6]' AFTER acceptance_text;

UPDATE app_settings
   SET enabled_payroll_types_json='[2,3,4,6]'
 WHERE enabled_payroll_types_json IS NULL
    OR TRIM(enabled_payroll_types_json)='';
SQL

cat > apps/api/src/services/settings.service.ts <<'TS'
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { badRequest } from '../core/errors.js';
import type { RequestMeta, SignatureMode } from '../core/types.js';
import { AuditService } from './audit.service.js';

export const ALL_PAYROLL_TYPES = [2, 3, 4, 6] as const;

function normalizePayrollTypes(values: number[]): number[] {
  return [...new Set(values.map(Number))]
    .filter((value) => ALL_PAYROLL_TYPES.includes(value as (typeof ALL_PAYROLL_TYPES)[number]))
    .sort((a, b) => a - b);
}

function parsePayrollTypes(raw: unknown): number[] {
  if (raw == null || String(raw).trim() === '') return [...ALL_PAYROLL_TYPES];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? normalizePayrollTypes(parsed) : [...ALL_PAYROLL_TYPES];
  } catch {
    return [...ALL_PAYROLL_TYPES];
  }
}

function sameTypes(a: number[], b: number[]): boolean {
  return a.length === b.length && a.every((value, index) => value === b[index]);
}

export interface AppSettings {
  signatureMode: SignatureMode;
  signatureLinkTtlMinutes: number;
  acceptanceText: string;
  enabledPayrollTypes: number[];
  updatedAt: Date | null;
}

export class SettingsService {
  constructor(private pool: Pool, private audit: AuditService) {}

  async get(companyId: number): Promise<AppSettings> {
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT signature_mode signatureMode,
              signature_link_ttl_minutes signatureLinkTtlMinutes,
              acceptance_text acceptanceText,
              enabled_payroll_types_json enabledPayrollTypesJson,
              updated_at updatedAt
         FROM app_settings
        WHERE company_id=?
        LIMIT 1`,
      [companyId],
    );
    const row = rows[0];
    if (!row) {
      return {
        signatureMode: 'ACCEPT_AND_DRAW',
        signatureLinkTtlMinutes: 1440,
        acceptanceText: 'Declaro que visualizei o holerite, conferi seu conteúdo e manifesto eletronicamente minha ciência e recebimento.',
        enabledPayrollTypes: [...ALL_PAYROLL_TYPES],
        updatedAt: null,
      };
    }
    return {
      signatureMode: row.signatureMode,
      signatureLinkTtlMinutes: Number(row.signatureLinkTtlMinutes),
      acceptanceText: String(row.acceptanceText),
      enabledPayrollTypes: parsePayrollTypes(row.enabledPayrollTypesJson),
      updatedAt: row.updatedAt ?? null,
    };
  }

  async update(
    companyId: number,
    actorId: number,
    input: {
      signatureMode: SignatureMode;
      signatureLinkTtlMinutes: number;
      acceptanceText: string;
      enabledPayrollTypes?: number[];
    },
    meta: RequestMeta,
  ): Promise<void> {
    if (!['ACCEPT', 'ACCEPT_AND_DRAW'].includes(input.signatureMode)) throw badRequest('Modo de assinatura inválido.');
    if (!Number.isInteger(input.signatureLinkTtlMinutes) || input.signatureLinkTtlMinutes < 5 || input.signatureLinkTtlMinutes > 43200) {
      throw badRequest('Validade do link deve estar entre 5 minutos e 30 dias.');
    }
    if (input.acceptanceText.trim().length < 20) throw badRequest('Texto de aceite muito curto.');

    const before = await this.get(companyId);
    const enabledPayrollTypes = input.enabledPayrollTypes === undefined
      ? before.enabledPayrollTypes
      : normalizePayrollTypes(input.enabledPayrollTypes);

    if (input.enabledPayrollTypes !== undefined) {
      const invalid = input.enabledPayrollTypes.filter((value) => !ALL_PAYROLL_TYPES.includes(Number(value) as (typeof ALL_PAYROLL_TYPES)[number]));
      if (invalid.length) throw badRequest(`Tipo(s) de holerite inválido(s): ${invalid.join(', ')}.`);
    }

    await this.pool.execute(
      `UPDATE app_settings
          SET signature_mode=?,
              signature_link_ttl_minutes=?,
              acceptance_text=?,
              enabled_payroll_types_json=?,
              updated_by_user_id=?,
              updated_at=UTC_TIMESTAMP()
        WHERE company_id=?`,
      [input.signatureMode, input.signatureLinkTtlMinutes, input.acceptanceText.trim(), JSON.stringify(enabledPayrollTypes), actorId, companyId],
    );

    await this.audit.record({
      companyId,
      actorUserId: actorId,
      action: 'SIGNATURE_SETTINGS_UPDATED',
      targetType: 'SETTINGS',
      targetId: companyId,
      meta,
      metadata: { signatureMode: input.signatureMode, signatureLinkTtlMinutes: input.signatureLinkTtlMinutes, enabledPayrollTypes },
    });

    if (!sameTypes(before.enabledPayrollTypes, enabledPayrollTypes)) {
      await this.audit.record({
        companyId,
        actorUserId: actorId,
        action: 'PAYROLL_TYPES_SETTINGS_UPDATED',
        targetType: 'SETTINGS',
        targetId: companyId,
        meta,
        metadata: { before: before.enabledPayrollTypes, after: enabledPayrollTypes },
      });
    }
  }
}
TS

cat > apps/api/src/routes/settings.routes.ts <<'TS'
import { Router } from 'express';
import { z } from 'zod';
import { requestMeta } from '../core/request.js';
import { csrf, requireMaster, requireUser } from '../middleware/auth.js';
import type { SettingsService } from '../services/settings.service.js';

const payrollTypesSchema = z.array(
  z.union([z.literal(2), z.literal(3), z.literal(4), z.literal(6)]),
).max(4);

export function settingsRoutes(service: SettingsService) {
  const r = Router();

  r.get('/payroll-types', requireUser, async (req, res, next) => {
    try {
      const settings = await service.get(req.principal!.companyId);
      res.json({ enabledPayrollTypes: settings.enabledPayrollTypes });
    } catch (error) { next(error); }
  });

  r.use(requireMaster);

  r.get('/', async (req, res, next) => {
    try { res.json({ settings: await service.get(req.principal!.companyId) }); }
    catch (error) { next(error); }
  });

  r.put('/', csrf, async (req, res, next) => {
    try {
      const body = z.object({
        signatureMode: z.enum(['ACCEPT', 'ACCEPT_AND_DRAW']),
        signatureLinkTtlMinutes: z.number().int(),
        acceptanceText: z.string(),
        enabledPayrollTypes: payrollTypesSchema.optional(),
      }).parse(req.body);
      await service.update(req.principal!.companyId, req.principal!.id, body, requestMeta(req));
      res.status(204).end();
    } catch (error) { next(error); }
  });

  return r;
}
TS

cat > apps/dashboard/src/components/PayrollSearchModal.tsx <<'TSX'
import { useMemo, useState } from 'react';
import { Modal } from './Modal';

export interface PayrollSearchInput {
  year: number;
  month: number;
  types: number[];
}

const typeOptions = [
  { value: 2, label: '2 — Mensal' },
  { value: 3, label: '3 — Adiantamento 13º' },
  { value: 4, label: '4 — 13º salário' },
  { value: 6, label: '6 — Rescisão' },
];

const monthOptions = [
  'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
  'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro',
];

export function PayrollSearchModal({
  title,
  subtitle,
  defaultTypes,
  enabledTypes = [2, 3, 4, 6],
  onClose,
  onSubmit,
}: {
  title: string;
  subtitle?: string;
  defaultTypes: number[];
  enabledTypes?: number[];
  onClose(): void;
  onSubmit(input: PayrollSearchInput): Promise<void>;
}) {
  const now = new Date();
  const enabledSet = useMemo(() => new Set(enabledTypes.map(Number)), [enabledTypes]);
  const initialTypes = [...new Set(defaultTypes.map(Number))].filter((value) => enabledSet.has(value));
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [types, setTypes] = useState<number[]>(initialTypes.length ? initialTypes : (enabledTypes[0] ? [Number(enabledTypes[0])] : []));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  function toggleType(value: number) {
    if (!enabledSet.has(value)) return;
    setTypes((current) => current.includes(value)
      ? current.filter((item) => item !== value)
      : [...current, value].sort((a, b) => a - b));
  }

  async function submit() {
    const effective = types.filter((value) => enabledSet.has(value));
    if (year < 2000 || year > 2100 || month < 1 || month > 12 || effective.length === 0) return;
    setBusy(true);
    setError('');
    try {
      await onSubmit({ year, month, types: effective });
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao iniciar a busca de holerites.');
    } finally {
      setBusy(false);
    }
  }

  return <Modal title={title} onClose={onClose}>
    {subtitle && <p className="muted small">{subtitle}</p>}
    <div className="form-grid two">
      <label>Competência
        <select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {monthOptions.map((label, index) => <option key={label} value={index + 1}>{String(index + 1).padStart(2, '0')} — {label}</option>)}
        </select>
      </label>
      <label>Ano
        <input type="number" min="2000" max="2100" value={year} onChange={(e) => setYear(Number(e.target.value))}/>
      </label>
    </div>
    <div className="form-section">
      <span className="label strong">Tipos de holerite</span>
      <div className="check-grid">
        {typeOptions.map((option) => {
          const enabled = enabledSet.has(option.value);
          return <label className={`check-card ${!enabled ? 'muted' : ''}`} key={option.value}>
            <input type="checkbox" disabled={!enabled} checked={enabled && types.includes(option.value)} onChange={() => toggleType(option.value)}/>
            <span>{option.label}{!enabled && <small>Desativado pelo MASTER da empresa</small>}</span>
          </label>;
        })}
      </div>
    </div>
    {enabledTypes.length === 0
      ? <div className="warning-note compact-note"><strong>Novas buscas estão suspensas.</strong><span>O MASTER desativou todos os tipos de holerite para esta empresa.</span></div>
      : <div className="lookup-card"><div className="grow"><strong>Busca manual</strong><span>Consulta somente a competência e os tipos ativos selecionados nesta execução. As automações do grupo não são alteradas.</span></div></div>}
    {error && <div className="form-error">{error}</div>}
    <div className="modal-actions">
      <button className="secondary-button" onClick={onClose}>Cancelar</button>
      <button className="primary-button" disabled={busy || enabledTypes.length === 0 || types.length === 0 || year < 2000 || year > 2100} onClick={() => void submit()}>{busy ? 'Enfileirando…' : 'Buscar holerites'}</button>
    </div>
  </Modal>;
}
TSX

cat > apps/dashboard/src/pages/SettingsPage.tsx <<'TSX'
import { useEffect, useState } from 'react';
import { api } from '../api/client';

const payrollTypeOptions = [
  { value: 2, label: '2 — Mensal', description: 'Folha mensal do funcionário.' },
  { value: 3, label: '3 — Adiantamento 13º', description: 'Adiantamento da primeira parcela do 13º.' },
  { value: 4, label: '4 — 13º salário', description: 'Processamento do 13º salário.' },
  { value: 6, label: '6 — Rescisão', description: 'Documentos de processamento rescisório.' },
];

export function SettingsPage() {
  const [form, setForm] = useState<any>(null);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    api.settings().then((response) => setForm({
      ...response.settings,
      enabledPayrollTypes: response.settings?.enabledPayrollTypes ?? [2, 3, 4, 6],
    })).catch((cause) => setError(cause instanceof Error ? cause.message : 'Falha'));
  }, []);

  if (!form) return <section><div className="page-heading"><h1>Configurações</h1></div><div className="empty-state">Carregando…</div></section>;

  function togglePayrollType(value: number) {
    setForm((current: any) => {
      const enabled = current.enabledPayrollTypes ?? [];
      return { ...current, enabledPayrollTypes: enabled.includes(value) ? enabled.filter((item: number) => item !== value) : [...enabled, value].sort((a: number, b: number) => a - b) };
    });
  }

  async function save() {
    setSaving(true); setError(''); setSaved('');
    try {
      await api.updateSettings({
        signatureMode: form.signatureMode,
        signatureLinkTtlMinutes: Number(form.signatureLinkTtlMinutes),
        acceptanceText: form.acceptanceText,
        enabledPayrollTypes: form.enabledPayrollTypes ?? [],
      });
      setSaved('Configurações salvas com sucesso.');
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Falha ao salvar.'); }
    finally { setSaving(false); }
  }

  return <section>
    <div className="page-heading"><span className="eyebrow">MASTER</span><h1>Configurações de segurança</h1><p>Defina o padrão de assinatura, validade dos links e os tipos de holerite permitidos para a empresa. Analistas não podem alterar estas regras.</p></div>
    {error && <div className="form-error">{error}</div>}{saved && <div className="success-note">{saved}</div>}
    <div className="settings-grid">
      <div className="panel"><span className="eyebrow">ASSINATURA</span><h3>Método padrão</h3><div className="choice-list"><label className={`choice ${form.signatureMode==='ACCEPT'?'selected':''}`}><input type="radio" name="mode" checked={form.signatureMode==='ACCEPT'} onChange={()=>setForm({...form,signatureMode:'ACCEPT'})}/><div><strong>Aceite eletrônico autenticado</strong><span>PIN + aceite + evidências criptográficas.</span></div></label><label className={`choice ${form.signatureMode==='ACCEPT_AND_DRAW'?'selected':''}`}><input type="radio" name="mode" checked={form.signatureMode==='ACCEPT_AND_DRAW'} onChange={()=>setForm({...form,signatureMode:'ACCEPT_AND_DRAW'})}/><div><strong>Aceite + assinatura desenhada</strong><span>Adiciona assinatura manuscrita em tela ao pacote de evidências.</span></div></label></div></div>
      <div className="panel"><span className="eyebrow">LINK TEMPORÁRIO</span><h3>Validade padrão</h3><label>Minutos<input type="number" min={5} max={43200} value={form.signatureLinkTtlMinutes} onChange={(e)=>setForm({...form,signatureLinkTtlMinutes:e.target.value})}/></label><p className="muted">Ex.: 1440 = 24 horas. O link é único e deixa de ser utilizável após a assinatura.</p></div>
      <div className="panel span-2"><span className="eyebrow">GERAÇÃO DE DOCUMENTOS</span><h3>Tipos de holerite ativos</h3><p className="muted small">Somente o MASTER pode alterar esta política. Tipos desativados ficam indisponíveis em novas buscas individuais, manuais e automáticas. Holerites já gerados e configurações históricas dos grupos são preservados.</p><div className="check-grid">{payrollTypeOptions.map((option)=>{const active=(form.enabledPayrollTypes??[]).includes(option.value);return <label className={`check-card ${active?'selected':''}`} key={option.value}><input type="checkbox" checked={active} onChange={()=>togglePayrollType(option.value)}/><span><strong>{option.label}</strong><small>{active?'Ativo para novas buscas':'Inativo para novas buscas'} · {option.description}</small></span></label>;})}</div>{(form.enabledPayrollTypes??[]).length===0&&<div className="warning-note compact-note"><strong>Geração suspensa.</strong><span>Nenhum tipo de holerite está ativo. Novas buscas serão bloqueadas até que o MASTER reative ao menos um tipo.</span></div>}</div>
      <div className="panel span-2"><span className="eyebrow">DECLARAÇÃO</span><h3>Texto de aceite</h3><textarea rows={5} value={form.acceptanceText} onChange={(e)=>setForm({...form,acceptanceText:e.target.value})}/><p className="muted small">A versão e o hash deste texto são armazenados junto à evidência. O PayHub acrescenta automaticamente a declaração obrigatória sobre IP, dispositivo, sessão, integridade, localização quando disponível e assinatura desenhada quando utilizada.</p></div>
      <div className="panel span-2 security-features"><div><strong>SHA-256</strong><span>Integridade do PDF original e assinado</span></div><div><strong>Selo HMAC</strong><span>Envelope de evidências assinado pelo PayHub</span></div><div><strong>Carimbo externo</strong><span>RFC 3161 quando TSA_URL estiver configurado</span></div><div><strong>Cadeia de eventos</strong><span>Hashes encadeados para detectar alterações</span></div></div>
    </div>
    <div className="save-bar"><button className="primary-button" disabled={saving} onClick={()=>void save()}>{saving?'Salvando…':'Salvar configurações'}</button></div>
  </section>;
}
TSX

python3 <<'PY'
from pathlib import Path
ROOT=Path('/var/www/payhub')

def patch(path, old, new, label):
    p=ROOT/path
    s=p.read_text()
    if new in s:
        print('SKIP', label)
        return
    if old not in s:
        raise SystemExit(f'PATCH FALHOU [{label}] em {path}')
    p.write_text(s.replace(old,new,1))
    print('OK', label)

# api client
p=ROOT/'apps/dashboard/src/api/client.ts'
s=p.read_text()
if 'payrollTypePolicy:' not in s:
    old="  settings:()=>request<any>('/api/settings'),updateSettings:(body:any)=>request<void>('/api/settings',{method:'PUT',body:json(body)}),"
    new="  payrollTypePolicy:()=>request<{enabledPayrollTypes:number[]}>('/api/settings/payroll-types'),\n  settings:()=>request<any>('/api/settings'),updateSettings:(body:any)=>request<void>('/api/settings',{method:'PUT',body:json(body)}),"
    if old not in s: raise SystemExit('PATCH FALHOU [api client settings]')
    p.write_text(s.replace(old,new,1))

# payroll-run service
p=ROOT/'apps/api/src/services/payroll-run.service.ts'
s=p.read_text()
if 'parseEnabledPayrollTypes' not in s:
    old="""function sanitizeTypes(types: number[]): number[] {
  return [...new Set(types.map(Number))].filter((value) => ALLOWED_PAYROLL_TYPES.includes(value as (typeof ALLOWED_PAYROLL_TYPES)[number]));
}
"""
    new=old+"""
function parseEnabledPayrollTypes(raw: unknown): number[] {
  if (raw == null || String(raw).trim() === '') return [...ALLOWED_PAYROLL_TYPES];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? sanitizeTypes(parsed.map(Number)) : [...ALLOWED_PAYROLL_TYPES];
  } catch {
    return [...ALLOWED_PAYROLL_TYPES];
  }
}
"""
    if old not in s: raise SystemExit('PATCH FALHOU [parseEnabledPayrollTypes]')
    s=s.replace(old,new,1)
if 'private async enabledPayrollTypes(' not in s:
    old="  private async safeRunEvent(input: Parameters<PayrollRunEventService['append']>[0]): Promise<void> {"
    new="""  private async enabledPayrollTypes(companyId: number): Promise<number[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT enabled_payroll_types_json enabledPayrollTypesJson FROM app_settings WHERE company_id=? LIMIT 1`,
      [companyId],
    );
    return rows[0] ? parseEnabledPayrollTypes(rows[0].enabledPayrollTypesJson) : [...ALLOWED_PAYROLL_TYPES];
  }

"""+old
    if old not in s: raise SystemExit('PATCH FALHOU [enabledPayrollTypes method]')
    s=s.replace(old,new,1)
old="""    const configuredTypes = sanitizeTypes(JSON.parse(String(group.types)) as number[]);
    if (source === 'SCHEDULED' && !scheduled) throw badRequest('Contexto da agenda automática ausente.');
    let year: number;
    let month: number;
    let types: number[];

    if (source === 'SCHEDULED') {
      ({ year, month } = currentCompetency());
      types = configuredTypes;
    } else {
      if (!manual) throw badRequest('Informe competência, ano e tipo(s) para a busca manual.');
      ({ year, month } = normalizeManualCompetency(manual));
      types = sanitizeTypes(manual.types);
    }
    if (types.length === 0) throw badRequest('Selecione pelo menos um tipo de folha.');
"""
new="""    const configuredTypes = sanitizeTypes(JSON.parse(String(group.types)) as number[]);
    const enabledTypes = await this.enabledPayrollTypes(context.companyId);
    const enabledSet = new Set(enabledTypes);
    if (source === 'SCHEDULED' && !scheduled) throw badRequest('Contexto da agenda automática ausente.');
    let year: number;
    let month: number;
    let types: number[];
    let requestedTypes: number[];

    if (source === 'SCHEDULED') {
      ({ year, month } = currentCompetency());
      requestedTypes = configuredTypes;
      types = configuredTypes.filter((value) => enabledSet.has(value));
    } else {
      if (!manual) throw badRequest('Informe competência, ano e tipo(s) para a busca manual.');
      ({ year, month } = normalizeManualCompetency(manual));
      requestedTypes = sanitizeTypes(manual.types);
      types = requestedTypes.filter((value) => enabledSet.has(value));
    }
    if (types.length === 0) throw badRequest(enabledTypes.length === 0 ? 'A geração de holerites está suspensa pelo MASTER da empresa.' : 'Os tipos de holerite selecionados estão desativados nas configurações da empresa.','PAYROLL_TYPE_DISABLED');
    const disabledTypes = requestedTypes.filter((value) => !enabledSet.has(value));
"""
if new not in s:
    if old not in s: raise SystemExit('PATCH FALHOU [startGroup types]')
    s=s.replace(old,new,1)
old="""    const { year, month } = normalizeManualCompetency(manual);
    const types = sanitizeTypes(manual.types);
    if (types.length === 0) throw badRequest('Selecione pelo menos um tipo de folha.');
"""
new="""    const { year, month } = normalizeManualCompetency(manual);
    const enabledTypes = await this.enabledPayrollTypes(context.companyId);
    const enabledSet = new Set(enabledTypes);
    const requestedTypes = sanitizeTypes(manual.types);
    const types = requestedTypes.filter((value) => enabledSet.has(value));
    if (types.length === 0) throw badRequest(enabledTypes.length === 0 ? 'A geração de holerites está suspensa pelo MASTER da empresa.' : 'Os tipos de holerite selecionados estão desativados nas configurações da empresa.','PAYROLL_TYPE_DISABLED');
    const disabledTypes = requestedTypes.filter((value) => !enabledSet.has(value));
"""
if new not in s:
    if old not in s: raise SystemExit('PATCH FALHOU [startEmployee types]')
    s=s.replace(old,new,1)
s=s.replace("metadata: { employeeId, jobId, year, month, types },","metadata: { employeeId, jobId, year, month, types, requestedTypes, disabledTypes },")
p.write_text(s)

# EmployeesPage
p=ROOT/'apps/dashboard/src/pages/EmployeesPage.tsx'; s=p.read_text()
if 'enabledPayrollTypes,setEnabledPayrollTypes' not in s:
    old='const[page,setPage]=useState(1);const[pageSize,setPageSize]=useState(25);const[loading,setLoading]=useState(true);'
    new='const[page,setPage]=useState(1);const[pageSize,setPageSize]=useState(25);const[enabledPayrollTypes,setEnabledPayrollTypes]=useState<number[]>([2,3,4,6]);const[loading,setLoading]=useState(true);'
    if old not in s: raise SystemExit('PATCH FALHOU [Employees state]')
    s=s.replace(old,new,1)
old='useEffect(()=>{api.groups().then((response)=>setGroups(response.groups??[])).catch(()=>undefined);},[]);'
new="useEffect(()=>{api.groups().then((response)=>setGroups(response.groups??[])).catch(()=>undefined);void api.payrollTypePolicy().then((response)=>setEnabledPayrollTypes(response.enabledPayrollTypes??[2,3,4,6])).catch(()=>undefined);},[]);"
if new not in s:
    if old not in s: raise SystemExit('PATCH FALHOU [Employees policy load]')
    s=s.replace(old,new,1)
old="EmployeeModal employeeId={selected.id} groups={groups} isMaster={principal?.kind==='USER'&&principal.role==='MASTER'}"
new="EmployeeModal employeeId={selected.id} groups={groups} enabledPayrollTypes={enabledPayrollTypes} isMaster={principal?.kind==='USER'&&principal.role==='MASTER'}"
if new not in s:
    if old not in s: raise SystemExit('PATCH FALHOU [Employees modal call]')
    s=s.replace(old,new,1)
old='function EmployeeModal({employeeId,groups,isMaster,onClose,onChanged,onDeleted}:{employeeId:number;groups:any[];isMaster:boolean;'
new='function EmployeeModal({employeeId,groups,enabledPayrollTypes,isMaster,onClose,onChanged,onDeleted}:{employeeId:number;groups:any[];enabledPayrollTypes:number[];isMaster:boolean;'
if new not in s:
    if old not in s: raise SystemExit('PATCH FALHOU [Employees modal props]')
    s=s.replace(old,new,1)
old='defaultTypes={group?.payrollTypes??[2]} onClose={()=>setShowSearch(false)}'
new='defaultTypes={group?.payrollTypes??[2]} enabledTypes={enabledPayrollTypes} onClose={()=>setShowSearch(false)}'
if new not in s:
    if old not in s: raise SystemExit('PATCH FALHOU [Employees search modal]')
    s=s.replace(old,new,1)
p.write_text(s)

# GroupsPage
p=ROOT/'apps/dashboard/src/pages/GroupsPage.tsx'; s=p.read_text()
if 'enabledPayrollTypes,setEnabledPayrollTypes' not in s:
    old='  const [pageSize,setPageSize]=useState(12);'
    new='  const [pageSize,setPageSize]=useState(12);\n  const [enabledPayrollTypes,setEnabledPayrollTypes]=useState<number[]>([2,3,4,6]);'
    if old not in s: raise SystemExit('PATCH FALHOU [Groups state]')
    s=s.replace(old,new,1)
old="""      const response = await api.groups();
      setGroups(response.groups);
      setError('');"""
new="""      const [response, policy] = await Promise.all([api.groups(),api.payrollTypePolicy().catch(() => ({ enabledPayrollTypes: [2,3,4,6] }))]);
      setGroups(response.groups);
      setEnabledPayrollTypes(policy.enabledPayrollTypes ?? [2,3,4,6]);
      setError('');"""
if new not in s:
    if old not in s: raise SystemExit('PATCH FALHOU [Groups load]')
    s=s.replace(old,new,1)
old='{(group.payrollTypes ?? []).map((type: number) => <span className="chip" key={type}>{typeOptions.find((option) => option.value === type)?.label ?? type}</span>)}'
new='{(group.payrollTypes ?? []).map((type: number) => <span className={`chip ${enabledPayrollTypes.includes(type)?\'\':\'muted\'}`} key={type}>{typeOptions.find((option) => option.value === type)?.label ?? type}{!enabledPayrollTypes.includes(type)?\' · inativo\':\'\'}</span>)}'
if new not in s:
    if old not in s: raise SystemExit('PATCH FALHOU [Groups chips]')
    s=s.replace(old,new,1)
old='{editing && <GroupModal group={editing.new ? null : editing} onClose={() => setEditing(null)}'
new='{editing && <GroupModal group={editing.new ? null : editing} enabledPayrollTypes={enabledPayrollTypes} onClose={() => setEditing(null)}'
if new not in s:
    if old not in s: raise SystemExit('PATCH FALHOU [Groups modal call]')
    s=s.replace(old,new,1)
old='defaultTypes={searching.payrollTypes ?? [2]} onClose={() => setSearching(null)}'
new='defaultTypes={searching.payrollTypes ?? [2]} enabledTypes={enabledPayrollTypes} onClose={() => setSearching(null)}'
if new not in s:
    if old not in s: raise SystemExit('PATCH FALHOU [Groups search modal]')
    s=s.replace(old,new,1)
old='function GroupModal({ group, onClose, onSaved }: { group: any | null; onClose(): void; onSaved(): Promise<void> }) {'
new='function GroupModal({ group, enabledPayrollTypes, onClose, onSaved }: { group: any | null; enabledPayrollTypes: number[]; onClose(): void; onSaved(): Promise<void> }) {'
if new not in s:
    if old not in s: raise SystemExit('PATCH FALHOU [Groups modal props]')
    s=s.replace(old,new,1)
old='  const [types, setTypes] = useState<number[]>(group?.payrollTypes ?? [2]);'
new='  const [types, setTypes] = useState<number[]>(group?.payrollTypes ?? (enabledPayrollTypes[0] ? [enabledPayrollTypes[0]] : []));'
if new not in s:
    if old not in s: raise SystemExit('PATCH FALHOU [Groups initial types]')
    s=s.replace(old,new,1)
old='<div className="check-grid">{typeOptions.map((option) => <label className="check-card" key={option.value}><input type="checkbox" checked={types.includes(option.value)} onChange={() => toggleType(option.value)}/><span>{option.label}</span></label>)}</div>'
new='<div className="check-grid">{typeOptions.map((option) => {const enabled=enabledPayrollTypes.includes(option.value);return <label className={`check-card ${enabled?\'\':\'muted\'}`} key={option.value}><input type="checkbox" disabled={!enabled} checked={types.includes(option.value)} onChange={() => toggleType(option.value)}/><span>{option.label}{!enabled&&<small>Desativado pelo MASTER da empresa</small>}</span></label>;})}</div>'
if new not in s:
    if old not in s: raise SystemExit('PATCH FALHOU [Groups type controls]')
    s=s.replace(old,new,1)
p.write_text(s)
PY

echo
echo "Patch aplicado. Agora rode:"
echo "npm run build --workspace @payhub/api"
echo "npm run build --workspace @payhub/dashboard"
echo "npm run db:migrate --workspace @payhub/api"
echo "pm2 restart payhub-api --update-env"
echo "pm2 restart payhub-worker --update-env"
