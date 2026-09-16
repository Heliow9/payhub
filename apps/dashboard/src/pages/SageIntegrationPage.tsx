import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  client,
  type Connector,
  type ImportJob,
  type ImportJobLog,
  type ImportJobType,
  type PayHubUser,
} from '../api/client';

function formatDate(value: string | null) {
  if (!value) return 'Ainda não conectado';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString('pt-BR');
}

function jobLabel(type: ImportJobType) {
  if (type === 'CONNECTION_TEST') return 'Teste de conexão';
  if (type === 'SCHEMA_DISCOVERY') return 'Descoberta do schema';
  return 'Importação bruta da folha';
}

export function SageIntegrationPage({ user, csrfToken }: { user: PayHubUser; csrfToken: string }) {
  const [connectors, setConnectors] = useState<Connector[]>([]);
  const [jobs, setJobs] = useState<ImportJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [connectorName, setConnectorName] = useState('Servidor Sage');
  const [secret, setSecret] = useState<{ id: number; token: string } | null>(null);
  const [creatingConnector, setCreatingConnector] = useState(false);
  const [creatingJob, setCreatingJob] = useState(false);
  const [jobType, setJobType] = useState<ImportJobType>('CONNECTION_TEST');
  const [selectedJobId, setSelectedJobId] = useState<number | null>(null);
  const [logs, setLogs] = useState<ImportJobLog[]>([]);
  const [scope, setScope] = useState({ companyCode: '', employeeCode: '', year: '', month: '', types: '2,3,4,6', fromAdmission: false });

  async function load() {
    setError('');
    try {
      const [connectorResult, jobResult] = await Promise.all([client.connectors(), client.importJobs()]);
      setConnectors(connectorResult.connectors);
      setJobs(jobResult.jobs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar integração Sage.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => void load(), 10000);
    return () => window.clearInterval(timer);
  }, []);

  async function createConnector(event: FormEvent) {
    event.preventDefault();
    setCreatingConnector(true);
    setError('');
    try {
      const result = await client.createConnector(connectorName, csrfToken);
      setSecret({ id: result.connector.id, token: result.token });
      setConnectorName('Servidor Sage');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar conector.');
    } finally {
      setCreatingConnector(false);
    }
  }

  const parsedTypes = useMemo(() => scope.types
    .split(',')
    .map((value) => Number(value.trim()))
    .filter((value): value is 2 | 3 | 4 | 6 => [2, 3, 4, 6].includes(value)), [scope.types]);

  async function openLogs(jobId: number) {
    setSelectedJobId(jobId);
    try {
      const result = await client.importJobLogs(jobId);
      setLogs(result.logs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao carregar logs.');
    }
  }

  async function createJob(event: FormEvent) {
    event.preventDefault();
    setCreatingJob(true);
    setError('');
    try {
      const payload = jobType === 'PAYROLL_IMPORT' ? {
        companyCode: scope.companyCode,
        ...(scope.employeeCode ? { employeeCode: scope.employeeCode } : {}),
        ...(scope.year ? { year: Number(scope.year) } : {}),
        ...(scope.month ? { month: Number(scope.month) } : {}),
        ...(parsedTypes.length ? { types: parsedTypes } : {}),
        ...(scope.fromAdmission ? { fromAdmission: true } : {}),
      } : undefined;
      await client.createImportJob({ jobType, scope: payload }, csrfToken);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Falha ao criar job.');
    } finally {
      setCreatingJob(false);
    }
  }

  return (
    <section>
      <div className="page-heading row-between">
        <div>
          <span className="eyebrow">INTEGRAÇÃO</span>
          <h2>Integração Sage</h2>
          <p>Conector .NET 8, heartbeat, fila de importação e acompanhamento em tempo real.</p>
        </div>
        <button className="ghost-light-button" onClick={() => void load()}>Atualizar</button>
      </div>

      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="integration-grid">
        <article className="integration-card">
          <div className="card-title-row"><div><span className="eyebrow">CONECTORES</span><h3>Servidor Sage</h3></div><span className="badge">{connectors.length}</span></div>
          {loading ? <div className="empty-state">Carregando…</div> : connectors.length === 0 ? <div className="empty-state">Nenhum conector cadastrado.</div> : (
            <div className="connector-list">
              {connectors.map((connector) => (
                <div className="connector-item" key={connector.id}>
                  <div><strong>{connector.name}</strong><span>{connector.machineName ?? 'Aguardando primeiro heartbeat'}</span></div>
                  <div className="connector-meta"><span className={`status-badge ${connector.status.toLowerCase()}`}>{connector.status}</span><small>{formatDate(connector.lastSeenAt)}</small></div>
                </div>
              ))}
            </div>
          )}

          {user.role === 'MASTER' && (
            <form className="stack-form" onSubmit={createConnector}>
              <label>Nome do conector<input value={connectorName} onChange={(e) => setConnectorName(e.target.value)} minLength={2} maxLength={120} required /></label>
              <button className="primary-button" disabled={creatingConnector}>{creatingConnector ? 'Criando…' : '+ Criar conector'}</button>
            </form>
          )}
        </article>

        <article className="integration-card">
          <span className="eyebrow">NOVO JOB</span>
          <h3>Executar no Sage</h3>
          <form className="stack-form" onSubmit={createJob}>
            <label>Operação
              <select value={jobType} onChange={(e) => setJobType(e.target.value as ImportJobType)}>
                <option value="CONNECTION_TEST">Teste de conexão</option>
                <option value="SCHEMA_DISCOVERY">Descoberta do schema</option>
                <option value="PAYROLL_IMPORT">Importação bruta da folha</option>
              </select>
            </label>
            {jobType === 'PAYROLL_IMPORT' && <>
              <div className="form-two-cols">
                <label>Empresa<input value={scope.companyCode} onChange={(e) => setScope({ ...scope, companyCode: e.target.value })} required /></label>
                <label>Funcionário<input value={scope.employeeCode} onChange={(e) => setScope({ ...scope, employeeCode: e.target.value })} placeholder="Vazio = todos cadastrados" /></label>
              </div>
              <div className="form-two-cols">
                <label>Ano<input type="number" min={2000} max={2100} value={scope.year} onChange={(e) => setScope({ ...scope, year: e.target.value })} placeholder="Opcional" /></label>
                <label>Mês<input type="number" min={1} max={12} value={scope.month} onChange={(e) => setScope({ ...scope, month: e.target.value })} placeholder="Opcional" /></label>
              </div>
              <label>Tipos<input value={scope.types} onChange={(e) => setScope({ ...scope, types: e.target.value })} /><small className="field-hint">2 mensal · 3 adiantamento 13º · 4 13º · 6 rescisão</small></label>
              <label className="check-label"><input type="checkbox" checked={scope.fromAdmission} onChange={(e) => setScope({ ...scope, fromAdmission: e.target.checked })} /> Histórico desde admissão</label>
            </>}
            <button className="primary-button" disabled={creatingJob}>{creatingJob ? 'Enfileirando…' : 'Enfileirar job'}</button>
          </form>
        </article>
      </div>

      {secret && (
        <div className="secret-card">
          <strong>Token do conector #{secret.id}</strong>
          <p>Copie agora. O PayHub não exibirá este token novamente.</p>
          <code>{secret.token}</code>
          <button className="ghost-light-button" onClick={() => void navigator.clipboard.writeText(secret.token)}>Copiar token</button>
        </div>
      )}

      <div className="table-card jobs-table">
        <div className="table-card-heading"><div><span className="eyebrow">FILA</span><h3>Jobs recentes</h3></div></div>
        {jobs.length === 0 ? <div className="empty-state">Nenhum job criado.</div> : (
          <table>
            <thead><tr><th>ID</th><th>Operação</th><th>Status</th><th>Progresso</th><th>Mensagem</th><th>Criado</th><th></th></tr></thead>
            <tbody>{jobs.map((job) => {
              const percent = job.progressTotal > 0 ? Math.min(100, Math.round((job.progressCurrent / job.progressTotal) * 100)) : 0;
              return <tr key={job.id}>
                <td>#{job.id}</td>
                <td><strong>{jobLabel(job.jobType)}</strong></td>
                <td><span className={`status-badge ${job.status.toLowerCase()}`}>{job.status}</span></td>
                <td><div className="progress-cell"><div className="progress-track"><span style={{ width: `${percent}%` }} /></div><small>{job.progressTotal > 0 ? `${job.progressCurrent}/${job.progressTotal}` : '—'}</small></div></td>
                <td>{job.errorMessage ?? job.progressMessage ?? '—'}</td>
                <td>{formatDate(job.createdAt)}</td>
                <td><button className="link-button" onClick={() => void openLogs(job.id)}>Logs</button></td>
              </tr>;
            })}</tbody>
          </table>
        )}
      </div>
      {selectedJobId !== null && (
        <div className="logs-card">
          <div className="card-title-row"><div><span className="eyebrow">LOGS</span><h3>Job #{selectedJobId}</h3></div><button className="ghost-light-button" onClick={() => setSelectedJobId(null)}>Fechar</button></div>
          {logs.length === 0 ? <div className="empty-state">Nenhum log registrado.</div> : <div className="log-list">{logs.map((log) => <div className={`log-line ${log.level.toLowerCase()}`} key={log.id}><span>{log.level}</span><strong>{log.message}</strong><small>{formatDate(log.createdAt)}</small></div>)}</div>}
        </div>
      )}

    </section>
  );
}
