import { useEffect, useMemo, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../auth/AuthProvider';
import { Modal } from '../components/Modal';
import { Pagination } from '../components/Pagination';
import { StatusBadge } from '../components/StatusBadge';
import { PayrollSearchModal, type PayrollSearchInput } from '../components/PayrollSearchModal';

const typeOptions = [
  { value: 2, label: '2 — Mensal' },
  { value: 3, label: '3 — Adiantamento 13º' },
  { value: 4, label: '4 — 13º salário' },
  { value: 6, label: '6 — Rescisão' },
];
const weekdayOptions = [
  { value: 1, short: 'Seg', label: 'Segunda' },
  { value: 2, short: 'Ter', label: 'Terça' },
  { value: 3, short: 'Qua', label: 'Quarta' },
  { value: 4, short: 'Qui', label: 'Quinta' },
  { value: 5, short: 'Sex', label: 'Sexta' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
  { value: 7, short: 'Dom', label: 'Domingo' },
];

function formatDateTime(value?: string | null) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function formatDuration(seconds?: number | null) {
  const total = Math.max(0, Number(seconds ?? 0));
  if (!total) return '—';
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes < 60) return `${minutes}m ${rest}s`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function weekdaySummary(days: number[] = []) {
  const normalized = [...new Set(days.map(Number))].sort((a, b) => a - b);
  if (normalized.join(',') === '1,2,3,4,5') return 'Segunda a sexta';
  if (normalized.length === 7) return 'Todos os dias';
  return normalized.map((day) => weekdayOptions.find((option) => option.value === day)?.short ?? day).join(' · ');
}

export function GroupsPage() {
  const { principal } = useAuth();
  const [groups, setGroups] = useState<any[]>([]);
  const [editing, setEditing] = useState<any | null>(null);
  const [searching, setSearching] = useState<any | null>(null);
  const [timelineGroup, setTimelineGroup] = useState<any | null>(null);
  const [error, setError] = useState('');
  const [query,setQuery]=useState('');
  const [statusFilter,setStatusFilter]=useState('');
  const [automationFilter,setAutomationFilter]=useState('');
  const [page,setPage]=useState(1);
  const [pageSize,setPageSize]=useState(12);
  const [enabledPayrollTypes,setEnabledPayrollTypes]=useState<number[]>([2,3,4,6]);

  async function load() {
    try {
      const [response, policy] = await Promise.all([api.groups(),api.payrollTypePolicy().catch(() => ({ enabledPayrollTypes: [2,3,4,6] }))]);
      setGroups(response.groups);
      setEnabledPayrollTypes(policy.enabledPayrollTypes ?? [2,3,4,6]);
      setError('');
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao carregar grupos.');
    }
  }
  useEffect(() => { void load(); }, []);

  const filtered=useMemo(()=>groups.filter((group)=>{
    const matchesQuery=!query.trim()||String(group.name??'').toLocaleLowerCase('pt-BR').includes(query.trim().toLocaleLowerCase('pt-BR'));
    const matchesStatus=!statusFilter||String(group.status)===statusFilter;
    const matchesAutomation=!automationFilter||(automationFilter==='ON'?Boolean(group.autoSearchEnabled):!group.autoSearchEnabled);
    return matchesQuery&&matchesStatus&&matchesAutomation;
  }),[groups,query,statusFilter,automationFilter]);
  const totalPages=Math.max(1,Math.ceil(filtered.length/pageSize));
  useEffect(()=>{setPage(1);},[query,statusFilter,automationFilter,pageSize]);
  useEffect(()=>{if(page>totalPages)setPage(totalPages);},[page,totalPages]);
  const pageRows=useMemo(()=>filtered.slice((page-1)*pageSize,page*pageSize),[filtered,page,pageSize]);

  async function force(group: any, input: PayrollSearchInput) {
    const result = await api.searchGroupNow(group.id, input);
    setError(`Busca ${String(input.month).padStart(2, '0')}/${input.year} enfileirada para ${group.name}: execução #${result.runId}, job #${result.jobId}.`);
    setSearching(null);
    await load();
  }

  return <section>
    <div className="page-heading row-between">
      <div><span className="eyebrow">AUTOMAÇÃO</span><h1>Grupos de funcionários</h1><p>Configure dias, horários e tipos de folha. Agendas vencidas são retomadas automaticamente pelo worker e cada execução mantém uma trilha completa.</p></div>
      <button className="primary-button compact" onClick={() => setEditing({ new: true })}>+ Novo grupo</button>
    </div>
    <div className="smart-toolbar"><div className="search-box grow"><span>⌕</span><input placeholder="Buscar grupo" value={query} onChange={(event)=>setQuery(event.target.value)}/>{query&&<button className="search-clear" onClick={()=>setQuery('')} aria-label="Limpar busca">×</button>}</div><label className="inline-control">Status<select value={statusFilter} onChange={(event)=>setStatusFilter(event.target.value)}><option value="">Todos</option><option value="ACTIVE">Ativos</option><option value="DISABLED">Desabilitados</option></select></label><label className="inline-control">Automação<select value={automationFilter} onChange={(event)=>setAutomationFilter(event.target.value)}><option value="">Todos</option><option value="ON">Ativa</option><option value="OFF">Desativada</option></select></label><button className="secondary-button compact" onClick={()=>void load()}>↻ Atualizar</button></div>
    <div className="result-strip"><span><strong>{filtered.length}</strong> grupo(s)</span><span className="push">{groups.filter((group)=>group.autoSearchEnabled).length} com automação ativa</span></div>
    {error && <div className={error.includes('enfileirada') ? 'success-note' : 'form-error'}>{error}</div>}
    <div className="group-grid">
      {pageRows.map((group) => {
        const last = group.lastExecution;
        return <article className="group-card" key={group.id}>
          <header><div><span className="eyebrow">GRUPO</span><h3>{group.name}</h3></div><StatusBadge status={group.status}/></header>
          <div className="group-kpis"><div><strong>{group.employeeCount}</strong><span>funcionários</span></div><div><strong>{principal?.companyName ?? '—'}</strong><span>empresa</span></div><div><strong>{group.schedules?.length ?? 0}</strong><span>horários</span></div></div>
          <div className="group-section"><span className="label">Tipos de folha</span><div className="chip-list">{(group.payrollTypes ?? []).map((type: number) => <span className={`chip ${enabledPayrollTypes.includes(type)?'':'muted'}`} key={type}>{typeOptions.find((option) => option.value === type)?.label ?? type}{!enabledPayrollTypes.includes(type)?' · inativo':''}</span>)}</div></div>
          <div className="group-section"><span className="label">Busca automática · {weekdaySummary(group.weekdays)}</span><div className="schedule-list">{group.schedules?.map((schedule: any) => <span key={schedule.id}>◷ {schedule.runTime}</span>)}</div></div>
          <div className="group-run-summary"><div><span className="label">Última execução</span>{last ? <><div className="group-run-line"><strong>#{last.runId} · {formatDateTime(last.createdAt)}</strong><StatusBadge status={last.status}/></div><small>{last.successCount ?? 0}/{last.employeeCount ?? 0} processados · {last.failureCount ?? 0} falhas · {formatDuration(last.durationSeconds)}</small></> : <small>Nenhuma execução registrada.</small>}</div><div><span className="label">Próxima execução</span><strong>{group.autoSearchEnabled ? formatDateTime(group.nextRunAt) : 'Automação desativada'}</strong><small>{group.autoSearchEnabled ? 'Competência atual · agenda durável' : 'Ative a busca automática para executar os horários.'}</small></div></div>
          {group.lastScheduleAttempt?.status === 'FAILED' && !group.lastScheduleAttempt?.payrollRunId && <div className="warning-note compact-note"><strong>Última agenda não conseguiu enfileirar a busca.</strong><span>{group.lastScheduleAttempt.errorMessage ?? 'O worker tentará novamente até o limite configurado.'}</span></div>}
          <footer className="group-actions"><button className="secondary-button compact" onClick={() => setEditing(group)}>Configurar</button><button className="secondary-button compact" disabled={!last} onClick={() => setTimelineGroup(group)}>Execuções e logs</button><button className="primary-button compact" onClick={() => setSearching(group)}>Buscar holerites agora</button></footer>
        </article>;
      })}
    </div>
    {filtered.length === 0 && <div className="empty-state panel">Nenhum grupo encontrado para os filtros.</div>}
    <Pagination page={page} pageSize={pageSize} total={filtered.length} onPageChange={setPage} onPageSizeChange={setPageSize} pageSizes={[6,12,24,48]} label="grupos"/>
    {editing && <GroupModal group={editing.new ? null : editing} enabledPayrollTypes={enabledPayrollTypes} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); await load(); }}/>} 
    {searching && <PayrollSearchModal title={`Buscar holerites · ${searching.name}`} subtitle="Os tipos vêm pré-selecionados conforme o grupo, mas podem ser alterados somente para esta execução manual." defaultTypes={searching.payrollTypes ?? [2]} enabledTypes={enabledPayrollTypes} onClose={() => setSearching(null)} onSubmit={(input) => force(searching, input)}/>} 
    {timelineGroup && <RunTimelineModal group={timelineGroup} onClose={() => setTimelineGroup(null)}/>} 
  </section>;
}

function GroupModal({ group, enabledPayrollTypes, onClose, onSaved }: { group: any | null; enabledPayrollTypes: number[]; onClose(): void; onSaved(): Promise<void> }) {
  const { principal } = useAuth();
  const [name, setName] = useState(group?.name ?? '');
  const [types, setTypes] = useState<number[]>(group?.payrollTypes ?? (enabledPayrollTypes[0] ? [enabledPayrollTypes[0]] : []));
  const [times, setTimes] = useState<string[]>(group?.schedules?.length ? group.schedules.map((schedule: any) => schedule.runTime) : ['08:00']);
  const [weekdays, setWeekdays] = useState<number[]>(group?.weekdays?.length ? group.weekdays : [1, 2, 3, 4, 5]);
  const [auto, setAuto] = useState(group ? Boolean(group.autoSearchEnabled) : true);
  const [status, setStatus] = useState<'ACTIVE' | 'DISABLED'>(group?.status ?? 'ACTIVE');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  function toggleType(value: number) {
    setTypes((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort());
  }
  function toggleWeekday(value: number) {
    setWeekdays((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value].sort());
  }
  function addTime() { setTimes((current) => [...current, '12:00']); }

  async function save() {
    setSaving(true);
    setError('');
    try {
      const body = { name, payrollTypes: types, times, weekdays, autoSearchEnabled: auto, status };
      if (group) await api.updateGroup(group.id, body); else await api.createGroup(body);
      await onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Falha ao salvar grupo.');
    } finally { setSaving(false); }
  }

  return <Modal title={group ? 'Configurar grupo' : 'Novo grupo'} onClose={onClose} wide>
    <div className="form-grid two">
      <label>Nome do grupo<input value={name} onChange={(event) => setName(event.target.value)} placeholder="Ex.: Administrativo"/></label>
      <label>Empresa<input value={principal?.companyName ?? '—'} disabled/><span className="field-hint">Contexto empresarial da sessão atual</span></label>
    </div>

    <div className="form-section">
      <span className="label strong">Tipos de folha consultados</span>
      <div className="check-grid">{typeOptions.map((option) => {const enabled=enabledPayrollTypes.includes(option.value);return <label className={`check-card ${enabled?'':'muted'}`} key={option.value}><input type="checkbox" disabled={!enabled} checked={types.includes(option.value)} onChange={() => toggleType(option.value)}/><span>{option.label}{!enabled&&<small>Desativado pelo MASTER da empresa</small>}</span></label>;})}</div>
    </div>

    <div className="form-section">
      <span className="label strong">Dias da busca automática</span>
      <p className="muted small">A execução é durável: se o worker estiver ocupado no minuto exato, a agenda vencida será retomada assim que ele voltar ao ciclo.</p>
      <div className="weekday-grid">{weekdayOptions.map((option) => <label className={`weekday-card ${weekdays.includes(option.value) ? 'selected' : ''}`} key={option.value}><input type="checkbox" checked={weekdays.includes(option.value)} onChange={() => toggleWeekday(option.value)}/><strong>{option.short}</strong><span>{option.label}</span></label>)}</div>
    </div>

    <div className="form-section">
      <div className="row-between">
        <div><span className="label strong">Horários automáticos</span><p className="muted small">Sempre na competência atual.</p></div>
        <button className="secondary-button compact" onClick={addTime}>+ Horário</button>
      </div>
      <div className="time-grid">{times.map((time, index) => <div className="time-row" key={`${index}-${time}`}><input type="time" value={time} onChange={(event) => setTimes((current) => current.map((value, currentIndex) => currentIndex === index ? event.target.value : value))}/><button className="icon-button danger-text" onClick={() => setTimes((current) => current.filter((_, currentIndex) => currentIndex !== index))}>×</button></div>)}</div>
    </div>

    <div className="form-grid two">
      <label className="switch-row"><input type="checkbox" checked={auto} onChange={(event) => setAuto(event.target.checked)}/><span><strong>Busca automática</strong><small>Executar os dias e horários deste grupo</small></span></label>
      {group && <label>Status<select value={status} onChange={(event) => setStatus(event.target.value as any)}><option value="ACTIVE">Ativo</option><option value="DISABLED">Desabilitado</option></select></label>}
    </div>

    {error && <div className="form-error">{error}</div>}
    <div className="modal-actions"><button className="secondary-button" onClick={onClose}>Cancelar</button><button className="primary-button" disabled={saving || !name || types.length === 0 || times.length === 0 || weekdays.length === 0} onClick={() => void save()}>{saving ? 'Salvando…' : 'Salvar grupo'}</button></div>
  </Modal>;
}

function RunTimelineModal({ group, onClose }: { group: any; onClose(): void }) {
  const [runs, setRuns] = useState<any[]>([]);
  const [selectedRunId, setSelectedRunId] = useState<number | null>(group.lastExecution?.runId ?? null);
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.groupRuns(group.id, 25);
        if (cancelled) return;
        setRuns(response.runs ?? []);
        const first = selectedRunId ?? response.runs?.[0]?.runId ?? null;
        setSelectedRunId(first);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Falha ao carregar execuções.');
      } finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, [group.id]);

  useEffect(() => {
    if (!selectedRunId) { setEvents([]); return; }
    let cancelled = false;
    void (async () => {
      try {
        const response = await api.runEvents(selectedRunId);
        if (!cancelled) setEvents(response.events ?? []);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : 'Falha ao carregar logs da execução.');
      }
    })();
    return () => { cancelled = true; };
  }, [selectedRunId]);

  const selected = useMemo(() => runs.find((run) => Number(run.runId) === Number(selectedRunId)) ?? group.lastExecution, [runs, selectedRunId, group.lastExecution]);

  return <Modal title={`Execuções e logs · ${group.name}`} onClose={onClose} wide>
    {error && <div className="form-error">{error}</div>}
    <div className="run-log-layout">
      <aside className="run-history-list">
        <span className="label strong">Histórico recente</span>
        {loading && <div className="empty-state">Carregando…</div>}
        {!loading && runs.length === 0 && <div className="empty-state">Nenhuma execução.</div>}
        {runs.map((run) => <button className={Number(run.runId) === Number(selectedRunId) ? 'active' : ''} key={run.runId} onClick={() => setSelectedRunId(Number(run.runId))}>
          <div><strong>#{run.runId} · {String(run.month).padStart(2, '0')}/{run.year}</strong><small>{run.source === 'SCHEDULED' ? 'Automática em lote' : 'Manual em lote'} · {formatDateTime(run.createdAt)}</small></div>
          <StatusBadge status={run.status}/>
        </button>)}
      </aside>
      <div className="run-timeline-panel">
        {selected && <div className="run-detail-head">
          <div><span className="eyebrow">EXECUÇÃO #{selected.runId}</span><h3>{selected.source === 'SCHEDULED' ? 'Busca automática em lote' : 'Busca manual em lote'}</h3></div>
          <StatusBadge status={selected.status}/>
          <div className="run-detail-stats"><span><strong>{selected.successCount ?? 0}</strong> processados</span><span><strong>{selected.failureCount ?? 0}</strong> falhas</span><span><strong>{formatDuration(selected.durationSeconds)}</strong> duração</span></div>
        </div>}
        <div className="run-event-list">
          {events.length === 0 ? <div className="empty-state">Ainda não há eventos técnicos para esta execução.</div> : events.map((event) => <div className={`run-event ${String(event.level ?? 'INFO').toLowerCase()}`} key={event.key ?? event.id}>
            <div className="run-event-dot"/>
            <div className="run-event-content"><div><strong>{event.stage}</strong><time>{formatDateTime(event.createdAt)}</time></div><p>{event.message}</p>{event.metadata?.jobId && <small>Job #{event.metadata.jobId}</small>}</div>
          </div>)}
        </div>
      </div>
    </div>
  </Modal>;
}
