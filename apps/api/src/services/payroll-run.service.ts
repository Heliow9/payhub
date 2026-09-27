import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { badRequest, notFound } from '../core/errors.js';
import { currentCompetency, normalizeManualCompetency } from '../core/time.js';
import type { RequestMeta, UserContext } from '../core/types.js';
import { AuditService } from './audit.service.js';
import { ConnectorService } from './connector.service.js';
import { PayrollRunEventService } from './payroll-run-event.service.js';

export interface ManualPayrollSearchInput {
  year: number;
  month: number;
  types: number[];
}

export interface ScheduledRunContext {
  scheduleExecutionId: number;
  scheduleId: number;
  scheduledTime: string;
}

const ALLOWED_PAYROLL_TYPES = [2, 3, 4, 6] as const;

function sanitizeTypes(types: number[]): number[] {
  return [...new Set(types.map(Number))].filter((value) => ALLOWED_PAYROLL_TYPES.includes(value as (typeof ALLOWED_PAYROLL_TYPES)[number]));
}

function parseEnabledPayrollTypes(raw: unknown): number[] {
  if (raw == null || String(raw).trim() === '') return [...ALLOWED_PAYROLL_TYPES];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? sanitizeTypes(parsed.map(Number)) : [...ALLOWED_PAYROLL_TYPES];
  } catch {
    return [...ALLOWED_PAYROLL_TYPES];
  }
}

export class PayrollRunService {
  constructor(
    private pool: Pool,
    private connector: ConnectorService,
    private audit: AuditService,
    private runEvents?: PayrollRunEventService,
  ) {}

  private async enabledPayrollTypes(companyId: number): Promise<number[]> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT enabled_payroll_types_json enabledPayrollTypesJson FROM app_settings WHERE company_id=? LIMIT 1`,
      [companyId],
    );
    return rows[0] ? parseEnabledPayrollTypes(rows[0].enabledPayrollTypesJson) : [...ALLOWED_PAYROLL_TYPES];
  }

  private async safeRunEvent(input: Parameters<PayrollRunEventService['append']>[0]): Promise<void> {
    if (!this.runEvents) return;
    try {
      await this.runEvents.append(input);
    } catch (error) {
      // A timeline é observabilidade: não pode impedir a criação do run/job.
      console.error(`[payroll-run] falha ao registrar evento da execução #${input.payrollRunId}`, error);
    }
  }

  private async existingScheduledRun(companyId: number, executionId: number): Promise<{ runId: number; jobId?: number } | null> {
    const [runs] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id FROM payroll_runs WHERE company_id=? AND schedule_execution_id=? LIMIT 1`,
      [companyId, executionId],
    );
    if (!runs[0]) return null;
    const runId = Number(runs[0].id);
    const [jobs] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id FROM import_jobs WHERE company_id=? AND payroll_run_id=? AND job_type='PAYROLL_IMPORT' ORDER BY id ASC LIMIT 1`,
      [companyId, runId],
    );
    return { runId, jobId: jobs[0] ? Number(jobs[0].id) : undefined };
  }

  async startGroup(
    context: UserContext,
    groupId: number,
    meta: RequestMeta,
    source: 'MANUAL' | 'SCHEDULED' = 'MANUAL',
    manual?: ManualPayrollSearchInput,
    scheduled?: ScheduledRunContext,
  ): Promise<{ runId: number; jobId: number }> {
    const [groups] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id,name,payroll_types_json types,status FROM employee_groups WHERE id=? AND company_id=? LIMIT 1`,
      [groupId, context.companyId],
    );
    const group = groups[0];
    if (!group || group.status !== 'ACTIVE') throw notFound('Grupo não encontrado ou inativo.');

    const configuredTypes = sanitizeTypes(JSON.parse(String(group.types)) as number[]);
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

    const [employees] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id,sage_employee_code code FROM employees WHERE group_id=? AND company_id=? AND status='ACTIVE' ORDER BY id`,
      [groupId, context.companyId],
    );
    if (employees.length === 0) throw badRequest('O grupo não possui funcionários ativos.');

    let runId: number;
    const existing = source === 'SCHEDULED' && scheduled
      ? await this.existingScheduledRun(context.companyId, scheduled.scheduleExecutionId)
      : null;
    if (existing) {
      runId = existing.runId;
    } else {
      try {
        const [run] = await this.pool.execute<ResultSetHeader>(
          `INSERT INTO payroll_runs
            (company_id,group_id,schedule_execution_id,requested_by_user_id,source,year,month,payroll_types_json,employee_count,status,created_at)
           VALUES (?,?,?,?,?,?,?,?,?,'QUEUED',UTC_TIMESTAMP())`,
          [
            context.companyId,
            groupId,
            source === 'SCHEDULED' ? scheduled?.scheduleExecutionId ?? null : null,
            source === 'SCHEDULED' ? null : context.userId,
            source,
            year,
            month,
            JSON.stringify(types),
            employees.length,
          ],
        );
        runId = run.insertId;
      } catch (error) {
        if (source !== 'SCHEDULED' || !scheduled || (error as { code?: string }).code !== 'ER_DUP_ENTRY') throw error;
        const concurrent = await this.existingScheduledRun(context.companyId, scheduled.scheduleExecutionId);
        if (!concurrent) throw error;
        runId = concurrent.runId;
      }
    }

    let jobId: number;
    const [existingJobs] = await this.pool.execute<RowDataPacket[]>(
      `SELECT id FROM import_jobs WHERE company_id=? AND payroll_run_id=? AND job_type='PAYROLL_IMPORT' ORDER BY id ASC LIMIT 1`,
      [context.companyId, runId],
    );
    if (existingJobs[0]) {
      jobId = Number(existingJobs[0].id);
    } else {
      const employeeCodes = employees.map((employee) => String(employee.code));
      jobId = await this.connector.createJob({
        companyId: context.companyId,
        requestedByUserId: source === 'SCHEDULED' ? null : context.userId,
        payrollRunId: runId,
        jobType: 'PAYROLL_IMPORT',
        scope: { employeeCodes, year, month, types, fromAdmission: false },
      });
    }

    await this.safeRunEvent({
      companyId: context.companyId,
      payrollRunId: runId,
      eventType: source === 'SCHEDULED' ? 'SCHEDULE_ENQUEUED' : 'RUN_ENQUEUED',
      stage: 'QUEUE',
      message: source === 'SCHEDULED'
        ? `Busca automática em lote enfileirada para ${group.name}: ${employees.length} funcionário(s) · agenda ${scheduled?.scheduledTime ?? '—'}.`
        : `Busca manual em lote enfileirada para ${group.name}: ${employees.length} funcionário(s).`,
      dedupKey: 'run-enqueued',
      metadata: {
        source,
        groupId,
        groupName: String(group.name),
        jobId,
        year,
        month,
        types,
        employeeCount: employees.length,
        scheduleId: scheduled?.scheduleId ?? null,
        scheduleExecutionId: scheduled?.scheduleExecutionId ?? null,
        scheduledTime: scheduled?.scheduledTime ?? null,
      },
    });

    await this.audit.record({
      companyId: context.companyId,
      actorUserId: source === 'SCHEDULED' ? null : context.userId,
      action: source === 'SCHEDULED' ? 'GROUP_AUTOMATIC_SEARCH' : 'GROUP_MANUAL_SEARCH',
      targetType: 'PAYROLL_RUN',
      targetId: runId,
      meta,
      metadata: {
        groupId,
        jobId,
        year,
        month,
        types,
        employeeCount: employees.length,
        scheduleId: scheduled?.scheduleId,
        scheduleExecutionId: scheduled?.scheduleExecutionId,
      },
    });

    return { runId, jobId };
  }

  async startEmployee(
    context: UserContext,
    employeeId: number,
    manual: ManualPayrollSearchInput,
    meta: RequestMeta,
  ): Promise<{ runId: number; jobId: number }> {
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT sage_employee_code code,name,status FROM employees WHERE id=? AND company_id=? LIMIT 1`,
      [employeeId, context.companyId],
    );
    const employee = rows[0];
    if (!employee || employee.status !== 'ACTIVE') throw notFound('Funcionário não encontrado ou inativo.');

    const { year, month } = normalizeManualCompetency(manual);
    const enabledTypes = await this.enabledPayrollTypes(context.companyId);
    const enabledSet = new Set(enabledTypes);
    const requestedTypes = sanitizeTypes(manual.types);
    const types = requestedTypes.filter((value) => enabledSet.has(value));
    if (types.length === 0) throw badRequest(enabledTypes.length === 0 ? 'A geração de holerites está suspensa pelo MASTER da empresa.' : 'Os tipos de holerite selecionados estão desativados nas configurações da empresa.','PAYROLL_TYPE_DISABLED');
    const disabledTypes = requestedTypes.filter((value) => !enabledSet.has(value));

    const [run] = await this.pool.execute<ResultSetHeader>(
      `INSERT INTO payroll_runs
        (company_id,group_id,schedule_execution_id,requested_by_user_id,source,year,month,payroll_types_json,employee_count,status,created_at)
       VALUES (?,NULL,NULL,?,'INDIVIDUAL',?,?,?,1,'QUEUED',UTC_TIMESTAMP())`,
      [context.companyId, context.userId, year, month, JSON.stringify(types)],
    );

    const jobId = await this.connector.createJob({
      companyId: context.companyId,
      requestedByUserId: context.userId,
      payrollRunId: run.insertId,
      jobType: 'PAYROLL_IMPORT',
      scope: { employeeCodes: [String(employee.code)], year, month, types, fromAdmission: false },
    });

    await this.safeRunEvent({
      companyId: context.companyId,
      payrollRunId: run.insertId,
      eventType: 'RUN_ENQUEUED',
      stage: 'QUEUE',
      message: `Busca individual enfileirada para ${employee.name}.`,
      dedupKey: 'run-enqueued',
      metadata: { employeeId, jobId, year, month, types, requestedTypes, disabledTypes },
    });

    await this.audit.record({
      companyId: context.companyId,
      actorUserId: context.userId,
      action: 'EMPLOYEE_MANUAL_SEARCH',
      targetType: 'PAYROLL_RUN',
      targetId: run.insertId,
      meta,
      metadata: { employeeId, jobId, year, month, types, requestedTypes, disabledTypes },
    });

    return { runId: run.insertId, jobId };
  }

  async list(context: UserContext, limit = 100): Promise<Record<string, unknown>[]> {
    const safe = Math.min(Math.max(limit, 1), 300);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT r.*,g.name groupName,u.name requestedByName,
              TIMESTAMPDIFF(SECOND,COALESCE(r.started_at,r.created_at),COALESCE(r.finished_at,UTC_TIMESTAMP())) durationSeconds
         FROM payroll_runs r
         LEFT JOIN employee_groups g ON g.id=r.group_id AND g.company_id=r.company_id
         LEFT JOIN users u ON u.id=r.requested_by_user_id AND u.company_id=r.company_id
        WHERE r.company_id=? ORDER BY r.id DESC LIMIT ${safe}`,
      [context.companyId],
    );
    return rows;
  }

  async listGroupRuns(context: UserContext, groupId: number, limit = 25): Promise<Record<string, unknown>[]> {
    const safe = Math.min(Math.max(Number(limit) || 25, 1), 100);
    const [rows] = await this.pool.query<RowDataPacket[]>(
      `SELECT r.id runId,r.source,r.status,r.year,r.month,r.employee_count employeeCount,
              r.success_count successCount,r.failure_count failureCount,r.message,r.created_at createdAt,
              r.started_at startedAt,r.finished_at finishedAt,
              TIMESTAMPDIFF(SECOND,COALESCE(r.started_at,r.created_at),COALESCE(r.finished_at,UTC_TIMESTAMP())) durationSeconds,
              j.id jobId,j.status jobStatus,j.normalization_state normalizationState
         FROM payroll_runs r
         LEFT JOIN import_jobs j ON j.company_id=r.company_id AND j.payroll_run_id=r.id AND j.job_type='PAYROLL_IMPORT'
        WHERE r.company_id=? AND r.group_id=?
        ORDER BY r.id DESC LIMIT ${safe}`,
      [context.companyId, groupId],
    );
    return rows;
  }

  async listEvents(context: UserContext, runId: number): Promise<Record<string, unknown>[]> {
    return this.runEvents?.list(context.companyId, runId, 1000) ?? [];
  }
}
