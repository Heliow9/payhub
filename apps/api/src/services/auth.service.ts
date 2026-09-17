import type { Pool, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { Env } from '../config/env.js';
import { badRequest, forbidden, notFound, unauthorized } from '../core/errors.js';
import { hashSecret, isSixDigitPin, isValidCpf, normalizeCpf, randomToken, sha256, verifySecret } from '../core/security.js';
import type { Principal, RequestMeta } from '../core/types.js';
import { AuditService } from './audit.service.js';

export interface LoginResult { principal: Principal; token: string; csrfToken: string; expiresAt: Date; }

export class AuthService {
  constructor(private pool: Pool, private env: Env, private audit: AuditService) {}

  private async makeAdminSession(userId: number, meta: RequestMeta): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
    const token = randomToken(32); const csrfToken = randomToken(24);
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_HOURS * 3600_000);
    await this.pool.execute(
      `INSERT INTO sessions (user_id, token_hash, csrf_token_hash, expires_at, created_at, last_seen_at, revoked_at)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), NULL)`,
      [userId, sha256(token), sha256(csrfToken), expiresAt]
    );
    await this.audit.record({ actorUserId: userId, action: 'LOGIN', targetType: 'USER', targetId: userId, meta });
    return { token, csrfToken, expiresAt };
  }

  private async makeEmployeeSession(employeeId: number, meta: RequestMeta): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
    const token = randomToken(32); const csrfToken = randomToken(24);
    const expiresAt = new Date(Date.now() + this.env.EMPLOYEE_SESSION_TTL_HOURS * 3600_000);
    await this.pool.execute(
      `INSERT INTO employee_sessions (employee_id, token_hash, csrf_token_hash, expires_at, created_at, last_seen_at, revoked_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), NULL, ?, ?)`,
      [employeeId, sha256(token), sha256(csrfToken), expiresAt, meta.ipAddress, meta.userAgent]
    );
    await this.pool.execute(`UPDATE employee_credentials SET last_login_at = UTC_TIMESTAMP(), failed_attempts = 0, locked_until = NULL, updated_at = UTC_TIMESTAMP() WHERE employee_id = ?`, [employeeId]);
    return { token, csrfToken, expiresAt };
  }

  async adminLogin(identifier: string, password: string, meta: RequestMeta): Promise<LoginResult> {
    const email = identifier.trim().toLowerCase();
    const [rows] = await this.pool.execute<RowDataPacket[]>(`SELECT id, name, email, password_hash, role, status FROM users WHERE email = ? LIMIT 1`, [email]);
    const row = rows[0];
    if (!row || row.status !== 'ACTIVE' || !(await verifySecret(password, row.password_hash as string))) throw unauthorized();
    const session = await this.makeAdminSession(Number(row.id), meta);
    return { principal: { kind: 'USER', id: Number(row.id), name: String(row.name), email: String(row.email), role: row.role, status: row.status }, ...session };
  }

  async employeeLogin(identifier: string, pin: string, meta: RequestMeta): Promise<LoginResult> {
    const cpf = normalizeCpf(identifier);
    if (!isValidCpf(cpf)) throw unauthorized('CPF inválido.');
    if (!isSixDigitPin(pin)) throw unauthorized('PIN inválido.');
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT e.id, e.name, e.cpf, e.status, c.pin_hash, c.failed_attempts, c.locked_until
         FROM employees e LEFT JOIN employee_credentials c ON c.employee_id = e.id
        WHERE e.cpf = ? LIMIT 1`, [cpf]
    );
    const row = rows[0];
    if (!row || row.status !== 'ACTIVE') throw unauthorized();
    if (!row.pin_hash) throw unauthorized('Primeiro acesso necessário.', 'PIN_NOT_SET');
    if (row.locked_until && new Date(row.locked_until as string).getTime() > Date.now()) throw unauthorized('Acesso temporariamente bloqueado. Tente novamente mais tarde.', 'EMPLOYEE_LOCKED');
    const ok = await verifySecret(pin, String(row.pin_hash));
    if (!ok) {
      const attempts = Number(row.failed_attempts ?? 0) + 1;
      const lock = attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null;
      await this.pool.execute(`UPDATE employee_credentials SET failed_attempts = ?, locked_until = ?, updated_at = UTC_TIMESTAMP() WHERE employee_id = ?`, [attempts, lock, row.id]);
      throw unauthorized('CPF ou PIN inválido.');
    }
    const session = await this.makeEmployeeSession(Number(row.id), meta);
    return { principal: { kind: 'EMPLOYEE', id: Number(row.id), name: String(row.name), cpf: String(row.cpf), status: row.status }, ...session };
  }

  async firstAccess(cpfInput: string, birthDate: string, pin: string, meta: RequestMeta): Promise<LoginResult> {
    const cpf = normalizeCpf(cpfInput);
    if (!isValidCpf(cpf)) throw badRequest('CPF inválido.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw badRequest('Data de nascimento inválida.');
    if (!isSixDigitPin(pin)) throw badRequest('O PIN deve possuir exatamente 6 números.');
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT e.id, e.name, e.cpf, e.status, DATE_FORMAT(e.birth_date,'%Y-%m-%d') birthDate, c.pin_hash
         FROM employees e LEFT JOIN employee_credentials c ON c.employee_id = e.id
        WHERE e.cpf = ? LIMIT 1`, [cpf]
    );
    const row = rows[0];
    if (!row) throw notFound('Funcionário não cadastrado no PayHub.');
    if (row.status !== 'ACTIVE') throw forbidden('Cadastro do funcionário está inativo.');
    if (String(row.birthDate) !== birthDate) throw unauthorized('CPF ou data de nascimento não conferem.');
    if (row.pin_hash) throw badRequest('O PIN já foi cadastrado. Utilize o login normal.', 'PIN_ALREADY_SET');
    const pinHash = await hashSecret(pin);
    await this.pool.execute(
      `INSERT INTO employee_credentials (employee_id, pin_hash, activated_at, pin_changed_at, failed_attempts, locked_until, last_login_at, updated_at)
       VALUES (?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), 0, NULL, NULL, UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE pin_hash=VALUES(pin_hash), activated_at=UTC_TIMESTAMP(), pin_changed_at=UTC_TIMESTAMP(), failed_attempts=0, locked_until=NULL, updated_at=UTC_TIMESTAMP()`,
      [row.id, pinHash]
    );
    const session = await this.makeEmployeeSession(Number(row.id), meta);
    return { principal: { kind: 'EMPLOYEE', id: Number(row.id), name: String(row.name), cpf: String(row.cpf), status: row.status }, ...session };
  }

  async authenticate(rawToken: string | undefined): Promise<{ principal: Principal; tokenHash: string; csrfHash: string } | null> {
    if (!rawToken) return null;
    const tokenHash = sha256(rawToken);
    const [adminRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT s.id sessionId, s.csrf_token_hash csrfHash, u.id, u.name, u.email, u.role, u.status
         FROM sessions s JOIN users u ON u.id=s.user_id
        WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP() LIMIT 1`, [tokenHash]
    );
    const admin = adminRows[0];
    if (admin && admin.status === 'ACTIVE') {
      await this.pool.execute(`UPDATE sessions SET last_seen_at=UTC_TIMESTAMP() WHERE id=?`, [admin.sessionId]);
      return { principal: { kind: 'USER', id:Number(admin.id), name:String(admin.name), email:String(admin.email), role:admin.role, status:admin.status }, tokenHash, csrfHash:String(admin.csrfHash) };
    }
    const [employeeRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT s.id sessionId, s.csrf_token_hash csrfHash, e.id, e.name, e.cpf, e.status
         FROM employee_sessions s JOIN employees e ON e.id=s.employee_id
        WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP() LIMIT 1`, [tokenHash]
    );
    const employee = employeeRows[0];
    if (employee && employee.status === 'ACTIVE') {
      await this.pool.execute(`UPDATE employee_sessions SET last_seen_at=UTC_TIMESTAMP() WHERE id=?`, [employee.sessionId]);
      return { principal: { kind:'EMPLOYEE', id:Number(employee.id), name:String(employee.name), cpf:String(employee.cpf), status:employee.status }, tokenHash, csrfHash:String(employee.csrfHash) };
    }
    return null;
  }

  async logout(tokenHash: string | undefined, principal: Principal | undefined, meta: RequestMeta): Promise<void> {
    if (!tokenHash || !principal) return;
    if (principal.kind === 'USER') {
      await this.pool.execute(`UPDATE sessions SET revoked_at=UTC_TIMESTAMP() WHERE token_hash=?`, [tokenHash]);
      await this.audit.record({ actorUserId: principal.id, action:'LOGOUT', targetType:'USER', targetId:principal.id, meta });
    } else {
      await this.pool.execute(`UPDATE employee_sessions SET revoked_at=UTC_TIMESTAMP() WHERE token_hash=?`, [tokenHash]);
    }
  }

  async createAnalyst(actorId: number, name: string, email: string, password: string, meta: RequestMeta): Promise<number> {
    const cleanName = name.trim(); const cleanEmail = email.trim().toLowerCase();
    if (cleanName.length < 2) throw badRequest('Nome inválido.');
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) throw badRequest('E-mail inválido.');
    if (password.length < 10) throw badRequest('A senha deve possuir pelo menos 10 caracteres.');
    const hash = await hashSecret(password);
    try {
      const [result] = await this.pool.execute<ResultSetHeader>(
        `INSERT INTO users (name,email,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,'ANALISTA','ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
        [cleanName, cleanEmail, hash]
      );
      await this.audit.record({ actorUserId:actorId, action:'ANALYST_CREATED', targetType:'USER', targetId:result.insertId, meta, metadata:{email:cleanEmail} });
      return result.insertId;
    } catch (error) {
      if ((error as {code?:string}).code === 'ER_DUP_ENTRY') throw badRequest('Já existe um usuário com este e-mail.');
      throw error;
    }
  }
}
