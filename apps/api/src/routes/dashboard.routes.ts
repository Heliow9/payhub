import { Router } from 'express';
import type { Pool, RowDataPacket } from 'mysql2/promise';
import { requireUser } from '../middleware/auth.js';

export function dashboardRoutes(pool: Pool) {
  const r = Router();
  r.use(requireUser);

  r.get('/', async (req, res, next) => {
    try {
      const companyId = req.principal!.companyId;
      const q = async (sql: string) => {
        const [rows] = await pool.execute<RowDataPacket[]>(sql, [companyId]);
        return Number(rows[0]?.value ?? 0);
      };

      const [employees, groups, ready, pending, signed, failed] = await Promise.all([
        q(`SELECT COUNT(*) value FROM employees WHERE company_id=? AND status='ACTIVE'`),
        q(`SELECT COUNT(*) value FROM employee_groups WHERE company_id=? AND status='ACTIVE'`),
        q(`SELECT COUNT(*) value FROM payrolls WHERE company_id=? AND is_current=1 AND status='READY'`),
        q(`SELECT COUNT(*) value FROM payrolls WHERE company_id=? AND is_current=1 AND status IN ('SIGNATURE_REQUESTED','VIEWED')`),
        q(`SELECT COUNT(*) value FROM payrolls WHERE company_id=? AND is_current=1 AND status='SIGNED'`),
        q(`SELECT COUNT(*) value FROM import_jobs WHERE company_id=? AND status='FAILED' AND created_at>=DATE_SUB(UTC_TIMESTAMP(),INTERVAL 30 DAY)`),
      ]);

      const [connectors] = await pool.execute<RowDataPacket[]>(
        `SELECT id,name,status,last_seen_at lastSeenAt,machine_name machineName
           FROM connectors
          WHERE company_id=?
          ORDER BY id DESC`,
        [companyId],
      );
      const [runs] = await pool.execute<RowDataPacket[]>(
        `SELECT r.id,r.source,r.status,r.year,r.month,r.employee_count employeeCount,
                r.success_count successCount,r.failure_count failureCount,r.message,
                r.created_at createdAt,g.name groupName
           FROM payroll_runs r
           LEFT JOIN employee_groups g ON g.id=r.group_id AND g.company_id=r.company_id
          WHERE r.company_id=?
          ORDER BY r.id DESC LIMIT 10`,
        [companyId],
      );

      res.json({ metrics: { employees, groups, ready, pending, signed, failed }, connectors, runs });
    } catch (e) { next(e); }
  });

  return r;
}
