import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { badRequest, conflict, notFound } from '../core/errors.js';
import { parseJson } from '../core/json.js';
import { brasiliaParts } from '../core/time.js';
import type { RequestMeta, UserContext } from '../core/types.js';
import { AuditService } from './audit.service.js';

const allowedTypes = [2, 3, 4, 6];
const defaultWeekdays = [1, 2, 3, 4, 5];

function normalizeTypes(types: number[]): number[] {
  const unique = [...new Set(types.map(Number))].filter((value) => allowedTypes.includes(value));
  if (unique.length === 0) throw badRequest('Selecione pelo menos um tipo de folha.');
  return unique.sort((a, b) => a - b);
}

function normalizeTimes(times: string[]): string[] {
  const unique = [...new Set(times
    .map((time) => /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? `${time}:00` : time)
    .filter((time) => /^([01]\d|2[0-3]):[0-5]\d:00$/.test(time)))];
  if (unique.length === 0) throw badRequest('Informe pelo menos um horário válido.');
  return unique.sort();
}

export function normalizeWeekdays(days: number[] | undefined): number[] {
  const source = days?.length ? days : defaultWeekdays;
  const unique = [...new Set(source.map(Number))].filter((day) => Number.isInteger(day) && day >= 1 && day <= 7).sort((a, b) => a - b);
  if (unique.length === 0) throw badRequest('Selecione pelo menos um dia da semana.');
  return unique;
}

export function weekdaysToMask(days: number[]): number {
  return normalizeWeekdays(days).reduce((mask, day) => mask | (1 << (day - 1)), 0);
}

export function maskToWeekdays(mask: unknown): number[] {
  const value = Number(mask ?? 31);
  const result: number[] = [];
  for (let day = 1; day <= 7; day++) if ((value & (1 << (day - 1))) !== 0) result.push(day);
  return result.length ? result : [...defaultWeekdays];
}

function calendarDate(parts: ReturnType<typeof brasiliaParts>, offset: number): { year: number; month: number; day: number; weekday: number } {
  const date = new Date(Date.UTC(parts.year, parts.month - 1, parts.day + offset));
  const js = date.getUTCDay();
  return { year: date.getUTCFullYear(), month: date.getUTCMonth() + 1, day: date.getUTCDate(), weekday: js === 0 ? 7 : js };
}

function nextScheduledAt(schedules: Array<{ runTime: string; weekdays: number[] }>, now = new Date()): string | null {
  if (schedules.length === 0) return null;
  const p = brasiliaParts(now);
  const currentMinutes = p.hour * 60 + p.minute;
  for (let offset = 0; offset <= 7; offset++) {
    const date = calendarDate(p, offset);
    const ordered = [...schedules].sort((a, b) => a.runTime.localeCompare(b.runTime));
    for (const schedule of ordered) {
      if (!schedule.weekdays.includes(date.weekday)) continue;
      const timeParts = schedule.runTime.split(':');
      const hour = Number(timeParts[0] ?? 0);
      const minute = Number(timeParts[1] ?? 0);
      if (offset === 0 && hour * 60 + minute <= currentMinutes) continue;
      return `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:00-03:00`;
    }
  }
  return null;
}

export class GroupService {
  constructor(private pool: Pool, private audit: AuditService) {}

  async list(context: UserContext): Promise<Record<string, unknown>[]> {
    const [groups] = await this.pool.query<RowDataPacket[]>(
      `SELECT g.id,g.name,g.company_code companyCode,g.payroll_types_json payrollTypesJson,
              g.auto_search_enabled autoSearchEnabled,g.status,g.created_at createdAt,g.updated_at updatedAt,
              COUNT(e.id) employeeCount
         FROM employee_groups g
         LEFT JOIN employees e ON e.group_id=g.id AND e.company_id=g.company_id AND e.status='ACTIVE'
        WHERE g.company_id=?
        GROUP BY g.id ORDER BY g.name`,
      [context.companyId],
    );
    const [scheduleRows] = await this.pool.query<RowDataPacket[]>(
      `SELECT s.id,s.group_id groupId,TIME_FORMAT(s.run_time,'%H:%i') runTime,s.weekdays_mask weekdaysMask,s.enabled
         FROM group_schedules s
         JOIN employee_groups g ON g.id=s.group_id
        WHERE g.company_id=? AND s.enabled=1
        ORDER BY s.run_time`,
      [context.companyId],
    );
    const [lastRuns] = await this.pool.query<RowDataPacket[]>(
      `SELECT r.id runId,r.group_id groupId,r.source,r.status,r.employee_count employeeCount,
              r.success_count successCount,r.failure_count failureCount,r.message,r.created_at createdAt,
              r.started_at startedAt,r.finished_at finishedAt,
              TIMESTAMPDIFF(SECOND,COALESCE(r.started_at,r.created_at),COALESCE(r.finished_at,UTC_TIMESTAMP())) durationSeconds
         FROM payroll_runs r
         JOIN (
           SELECT group_id,MAX(id) id
             FROM payroll_runs
            WHERE company_id=? AND group_id IS NOT NULL
            GROUP BY group_id
         ) last ON last.id=r.id`,
      [context.companyId],
    );
    const [lastScheduleAttempts] = await this.pool.query<RowDataPacket[]>(
      `SELECT x.id executionId,x.group_id groupId,x.status,x.attempt_count attemptCount,x.error_message errorMessage,
              x.run_date runDate,TIME_FORMAT(x.run_time,'%H:%i') runTime,x.payroll_run_id payrollRunId,x.updated_at updatedAt
         FROM schedule_executions x
         JOIN (
           SELECT group_id,MAX(id) id
             FROM schedule_executions
            WHERE company_id=?
            GROUP BY group_id
         ) last ON last.id=x.id`,
      [context.companyId],
    );

    return groups.map((group) => {
      const schedules: Array<{ id: number; groupId: number; runTime: string; enabled: unknown; weekdays: number[] }> = scheduleRows
        .filter((schedule) => Number(schedule.groupId) === Number(group.id))
        .map((schedule) => ({
          id: Number(schedule.id),
          groupId: Number(schedule.groupId),
          runTime: String(schedule.runTime),
          enabled: schedule.enabled,
          weekdays: maskToWeekdays(schedule.weekdaysMask),
        }));
      const weekdayUnion = [...new Set(schedules.flatMap((schedule) => schedule.weekdays as number[]))].sort((a, b) => a - b);
      const lastExecution = lastRuns.find((run) => Number(run.groupId) === Number(group.id)) ?? null;
      const lastScheduleAttempt = lastScheduleAttempts.find((attempt) => Number(attempt.groupId) === Number(group.id)) ?? null;
      return {
        ...group,
        payrollTypes: parseJson<number[]>(group.payrollTypesJson, []),
        payrollTypesJson: undefined,
        schedules,
        weekdays: weekdayUnion.length ? weekdayUnion : [...defaultWeekdays],
        nextRunAt: group.autoSearchEnabled && group.status === 'ACTIVE' ? nextScheduledAt(schedules) : null,
        lastExecution,
        lastScheduleAttempt,
      };
    });
  }

  async get(context: UserContext, id: number): Promise<Record<string, unknown>> {
    const rows = await this.list(context);
    const group = rows.find((item) => Number(item.id) === id);
    if (!group) throw notFound('Grupo não encontrado.');
    return group;
  }

  async create(
    context: UserContext,
    input: { name: string; payrollTypes: number[]; times: string[]; weekdays?: number[]; autoSearchEnabled?: boolean },
    meta: RequestMeta,
  ): Promise<number> {
    const name = input.name.trim();
    if (name.length < 2) throw badRequest('Nome do grupo inválido.');
    const types = normalizeTypes(input.payrollTypes);
    const times = normalizeTimes(input.times);
    const weekdays = normalizeWeekdays(input.weekdays);
    const weekdaysMask = weekdaysToMask(weekdays);
    const [companies] = await this.pool.execute<RowDataPacket[]>(
      `SELECT sage_company_code companyCode FROM companies WHERE id=? AND status='ACTIVE' LIMIT 1`,
      [context.companyId],
    );
    if (!companies[0]) throw notFound('Empresa não encontrada.');
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.execute<ResultSetHeader>(
        `INSERT INTO employee_groups
          (company_id,name,company_code,payroll_types_json,auto_search_enabled,status,created_by_user_id,created_at,updated_at)
         VALUES (?,?,?,?,?,'ACTIVE',?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
        [context.companyId, name, String(companies[0].companyCode), JSON.stringify(types), input.autoSearchEnabled === false ? 0 : 1, context.userId],
      );
      for (const time of times) {
        await conn.execute(
          `INSERT INTO group_schedules (group_id,run_time,weekdays_mask,enabled,created_at) VALUES (?,?,?,1,UTC_TIMESTAMP())`,
          [result.insertId, time, weekdaysMask],
        );
      }
      await conn.commit();
      await this.audit.record({
        companyId: context.companyId,
        actorUserId: context.userId,
        action: 'GROUP_CREATED',
        targetType: 'GROUP',
        targetId: result.insertId,
        meta,
        metadata: { types, times, weekdays },
      });
      return result.insertId;
    } catch (error) {
      await conn.rollback();
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw conflict('Já existe um grupo com este nome.');
      throw error;
    } finally {
      conn.release();
    }
  }

  async update(
    context: UserContext,
    id: number,
    input: { name: string; payrollTypes: number[]; times: string[]; weekdays?: number[]; autoSearchEnabled: boolean; status: 'ACTIVE' | 'DISABLED' },
    meta: RequestMeta,
  ): Promise<void> {
    const name = input.name.trim();
    const types = normalizeTypes(input.payrollTypes);
    const times = normalizeTimes(input.times);
    const weekdays = normalizeWeekdays(input.weekdays);
    const weekdaysMask = weekdaysToMask(weekdays);
    const conn = await this.pool.getConnection();
    try {
      await conn.beginTransaction();
      const [result] = await conn.execute<ResultSetHeader>(
        `UPDATE employee_groups
            SET name=?,payroll_types_json=?,auto_search_enabled=?,status=?,updated_at=UTC_TIMESTAMP()
          WHERE id=? AND company_id=?`,
        [name, JSON.stringify(types), input.autoSearchEnabled ? 1 : 0, input.status, id, context.companyId],
      );
      if (result.affectedRows === 0) throw notFound('Grupo não encontrado.');

      // Preserva os IDs de agenda e, consequentemente, todo o histórico de schedule_executions.
      await conn.execute(`UPDATE group_schedules SET enabled=0 WHERE group_id=?`, [id]);
      for (const time of times) {
        await conn.execute(
          `INSERT INTO group_schedules (group_id,run_time,weekdays_mask,enabled,created_at)
           VALUES (?,?,?,1,UTC_TIMESTAMP())
           ON DUPLICATE KEY UPDATE weekdays_mask=VALUES(weekdays_mask),enabled=1`,
          [id, time, weekdaysMask],
        );
      }
      await conn.commit();
    } catch (error) {
      await conn.rollback();
      throw error;
    } finally {
      conn.release();
    }
    await this.audit.record({
      companyId: context.companyId,
      actorUserId: context.userId,
      action: 'GROUP_UPDATED',
      targetType: 'GROUP',
      targetId: id,
      meta,
      metadata: { types, times, weekdays, status: input.status, autoSearchEnabled: input.autoSearchEnabled },
    });
  }
}
