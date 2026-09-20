import type { Pool, PoolConnection, RowDataPacket, ResultSetHeader } from 'mysql2/promise';
import type { Env } from '../config/env.js';
import { badRequest, notFound, unauthorized } from '../core/errors.js';
import { hashSecret, isSixDigitPin, isValidCpf, needsSecretRehash, normalizeCpf, randomToken, sha256, verifySecret } from '../core/security.js';
import type { EmployeePrincipal, Principal, RequestMeta } from '../core/types.js';
import { AuditService } from './audit.service.js';

export interface LoginResult { principal: Principal; token: string; csrfToken: string; expiresAt: Date; client?: ClientKind; }
export interface CompanyOption {
  employeeId: number;
  companyId: number;
  companyName: string;
  name: string;
  status: 'ACTIVE' | 'TERMINATED';
  accessMode: 'FULL' | 'HISTORICAL';
}
export interface CompanySelectionResult {
  requiresCompanySelection: true;
  selectionToken: string;
  companies: CompanyOption[];
}
export type LoginOutcome = LoginResult | CompanySelectionResult;
type ClientKind = 'WEB' | 'MOBILE';
type Executor = Pool | PoolConnection;

export class AuthService {
  constructor(private pool: Pool, private env: Env, private audit: AuditService) {}

  private async makeAdminSession(userId: number, companyId: number, meta: RequestMeta): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
    const token = randomToken(32); const csrfToken = randomToken(24);
    const expiresAt = new Date(Date.now() + this.env.SESSION_TTL_HOURS * 3600_000);
    await this.pool.execute(
      `INSERT INTO sessions (user_id, company_id, token_hash, csrf_token_hash, expires_at, created_at, last_seen_at, revoked_at)
       VALUES (?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), NULL)`,
      [userId, companyId, sha256(token), sha256(csrfToken), expiresAt]
    );
    await this.audit.record({ actorUserId: userId, action: 'LOGIN', targetType: 'USER', targetId: userId, meta });
    return { token, csrfToken, expiresAt };
  }

  private async makeEmployeeSession(employeeId: number, identityId: number, companyId: number, meta: RequestMeta, executor: Executor = this.pool): Promise<{ token: string; csrfToken: string; expiresAt: Date }> {
    const token = randomToken(32); const csrfToken = randomToken(24);
    const expiresAt = new Date(Date.now() + this.env.EMPLOYEE_SESSION_TTL_HOURS * 3600_000);
    await executor.execute(
      `INSERT INTO employee_sessions (employee_id, company_id, identity_id, token_hash, csrf_token_hash, expires_at, created_at, last_seen_at, revoked_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?, UTC_TIMESTAMP(), UTC_TIMESTAMP(), NULL, ?, ?)`,
      [employeeId, companyId, identityId, sha256(token), sha256(csrfToken), expiresAt, meta.ipAddress, meta.userAgent]
    );
    await executor.execute(`UPDATE employee_identities SET last_login_at = UTC_TIMESTAMP(), failed_attempts = 0, locked_until = NULL, updated_at = UTC_TIMESTAMP() WHERE id = ?`, [identityId]);
    return { token, csrfToken, expiresAt };
  }

  private async employeeLinks(identityId: number, executor: Executor = this.pool, companyId?: number): Promise<CompanyOption[]> {
    const [rows] = await executor.execute<RowDataPacket[]>(
      `SELECT e.id employeeId,e.company_id companyId,c.display_name companyName,e.name,e.status
         FROM employees e
         JOIN companies c ON c.id=e.company_id AND c.status='ACTIVE'
        WHERE e.identity_id=? AND e.status IN ('ACTIVE','TERMINATED')${companyId === undefined ? '' : ' AND e.company_id=?'}
        ORDER BY c.display_name,e.id`,
      companyId === undefined ? [identityId] : [identityId, companyId],
    );
    return rows.map((row) => ({
      employeeId: Number(row.employeeId), companyId: Number(row.companyId), companyName: String(row.companyName),
      name: String(row.name), status: row.status as 'ACTIVE' | 'TERMINATED',
      accessMode: row.status === 'TERMINATED' ? 'HISTORICAL' : 'FULL',
    }));
  }

  private employeePrincipal(identityId: number, cpf: string, link: CompanyOption): EmployeePrincipal {
    return {
      kind: 'EMPLOYEE', id: link.employeeId, identityId, companyId: link.companyId,
      companyName: link.companyName, name: link.name, cpf, status: link.status, accessMode: link.accessMode,
    };
  }

  private async completeEmployeeAuthentication(identityId: number, cpf: string, meta: RequestMeta, client: ClientKind): Promise<LoginOutcome> {
    const companies = await this.employeeLinks(identityId);
    if (companies.length === 0) throw unauthorized();
    if (companies.length === 1) {
      const company = companies[0]!;
      const session = await this.makeEmployeeSession(company.employeeId, identityId, company.companyId, meta);
      return { principal: this.employeePrincipal(identityId, cpf, company), ...session };
    }
    const selectionToken = randomToken(32);
    const expiresAt = new Date(Date.now() + 5 * 60_000);
    await this.pool.execute(
      `INSERT INTO employee_company_selections (identity_id,token_hash,client,ip_address,user_agent,expires_at,used_at,created_at)
       VALUES (?,?,?,?,?,?,NULL,UTC_TIMESTAMP())`,
      [identityId, sha256(selectionToken), client, meta.ipAddress, meta.userAgent, expiresAt],
    );
    return { requiresCompanySelection: true, selectionToken, companies };
  }

  async adminLogin(identifier: string, password: string, meta: RequestMeta): Promise<LoginResult> {
    const email = identifier.trim().toLowerCase();
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT u.id,u.company_id companyId,c.display_name companyName,u.name,u.email,u.password_hash,u.role,u.status
         FROM users u JOIN companies c ON c.id=u.company_id AND c.status='ACTIVE'
        WHERE u.email=? LIMIT 1`,
      [email],
    );
    const row = rows[0];
    if (!row || row.status !== 'ACTIVE' || !(await verifySecret(password, row.password_hash as string))) throw unauthorized();
    if (needsSecretRehash(String(row.password_hash))) {
      await this.pool.execute(`UPDATE users SET password_hash=?,updated_at=UTC_TIMESTAMP() WHERE id=?`, [await hashSecret(password), row.id]);
    }
    const session = await this.makeAdminSession(Number(row.id), Number(row.companyId), meta);
    return { principal: { kind: 'USER', id: Number(row.id), companyId:Number(row.companyId), companyName:String(row.companyName), name: String(row.name), email: String(row.email), role: row.role, status: row.status }, ...session };
  }

  async employeeLogin(identifier: string, pin: string, meta: RequestMeta, client: ClientKind = 'WEB'): Promise<LoginOutcome> {
    const cpf = normalizeCpf(identifier);
    if (!isValidCpf(cpf)) throw unauthorized('CPF inválido.');
    if (!isSixDigitPin(pin)) throw unauthorized('PIN inválido.');
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT i.id,i.cpf,DATE_FORMAT(i.birth_date,'%Y-%m-%d') birthDate,i.pin_hash,i.failed_attempts,i.locked_until
         FROM employee_identities i WHERE i.cpf = ? LIMIT 1`, [cpf]
    );
    const row = rows[0];
    if (!row) throw unauthorized();
    if (!row.pin_hash) throw unauthorized('Primeiro acesso necessário.', 'PIN_NOT_SET');
    if (row.locked_until && new Date(row.locked_until as string).getTime() > Date.now()) throw unauthorized('Acesso temporariamente bloqueado. Tente novamente mais tarde.', 'EMPLOYEE_LOCKED');
    const ok = await verifySecret(pin, String(row.pin_hash));
    if (!ok) {
      const attempts = Number(row.failed_attempts ?? 0) + 1;
      const lock = attempts >= 5 ? new Date(Date.now() + 15 * 60_000) : null;
      await this.pool.execute(`UPDATE employee_identities SET failed_attempts = ?, locked_until = ?, updated_at = UTC_TIMESTAMP() WHERE id = ?`, [attempts, lock, row.id]);
      throw unauthorized('CPF ou PIN inválido.');
    }
    if (needsSecretRehash(String(row.pin_hash))) {
      await this.pool.execute(`UPDATE employee_identities SET pin_hash=?,updated_at=UTC_TIMESTAMP() WHERE id=?`, [await hashSecret(pin), row.id]);
    }
    return this.completeEmployeeAuthentication(Number(row.id), String(row.cpf), meta, client);
  }

  async firstAccess(cpfInput: string, birthDate: string, pin: string, meta: RequestMeta, client: ClientKind = 'WEB'): Promise<LoginOutcome> {
    const cpf = normalizeCpf(cpfInput);
    if (!isValidCpf(cpf)) throw badRequest('CPF inválido.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw badRequest('Data de nascimento inválida.');
    if (!isSixDigitPin(pin)) throw badRequest('O PIN deve possuir exatamente 6 números.');
    const [rows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT i.id,i.cpf,DATE_FORMAT(i.birth_date,'%Y-%m-%d') birthDate,i.pin_hash
         FROM employee_identities i WHERE i.cpf = ? LIMIT 1`, [cpf]
    );
    const row = rows[0];
    if (!row) throw notFound('Funcionário não cadastrado no PayHub.');
    if (row.pin_hash) throw badRequest('O PIN já foi cadastrado. Utilize o login normal.', 'PIN_ALREADY_SET');
    if (String(row.birthDate) !== birthDate) throw unauthorized('CPF ou data de nascimento não conferem.');
    const pinHash = await hashSecret(pin);
    await this.pool.execute(
      `UPDATE employee_identities SET pin_hash=?,activated_at=UTC_TIMESTAMP(),pin_changed_at=UTC_TIMESTAMP(),failed_attempts=0,locked_until=NULL,updated_at=UTC_TIMESTAMP() WHERE id=?`,
      [pinHash, row.id]
    );
    return this.completeEmployeeAuthentication(Number(row.id), String(row.cpf), meta, client);
  }

  async selectEmployeeCompany(selectionToken: string, companyId: number, meta: RequestMeta): Promise<LoginResult> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const [selectionRows] = await connection.execute<RowDataPacket[]>(
        `SELECT id,identity_id identityId,client,expires_at expiresAt
           FROM employee_company_selections
          WHERE token_hash=? AND used_at IS NULL AND expires_at>UTC_TIMESTAMP() FOR UPDATE`,
        [sha256(selectionToken)],
      );
      const selection = selectionRows[0];
      if (!selection) throw unauthorized('Seleção de empresa inválida ou expirada.');
      const links = await this.employeeLinks(Number(selection.identityId), connection, companyId);
      if (links.length !== 1) throw unauthorized('Empresa não vinculada ao funcionário.');
      const link = links[0]!;
      const [identityRows] = await connection.execute<RowDataPacket[]>(`SELECT cpf FROM employee_identities WHERE id=? LIMIT 1`, [selection.identityId]);
      if (!identityRows[0]) throw unauthorized();
      await connection.execute(`UPDATE employee_company_selections SET used_at=UTC_TIMESTAMP() WHERE id=? AND used_at IS NULL`, [selection.id]);
      const session = await this.makeEmployeeSession(link.employeeId, Number(selection.identityId), link.companyId, meta, connection);
      await connection.commit();
      return { principal: this.employeePrincipal(Number(selection.identityId), String(identityRows[0].cpf), link), ...session, client: selection.client as ClientKind };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async switchEmployeeCompany(tokenHash: string, principal: EmployeePrincipal, companyId: number, meta: RequestMeta): Promise<LoginResult> {
    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      const links = await this.employeeLinks(principal.identityId, connection, companyId);
      if (links.length !== 1) throw unauthorized('Empresa não vinculada ao funcionário.');
      const link = links[0]!;
      await connection.execute(`UPDATE employee_sessions SET revoked_at=UTC_TIMESTAMP() WHERE token_hash=? AND identity_id=? AND revoked_at IS NULL`, [tokenHash, principal.identityId]);
      const session = await this.makeEmployeeSession(link.employeeId, principal.identityId, companyId, meta, connection);
      await connection.commit();
      return { principal: this.employeePrincipal(principal.identityId, principal.cpf, link), ...session };
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }
  }

  async authenticate(rawToken: string | undefined): Promise<{ principal: Principal; tokenHash: string; csrfHash: string } | null> {
    if (!rawToken) return null;
    const tokenHash = sha256(rawToken);
    const [adminRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT s.id sessionId,s.csrf_token_hash csrfHash,u.id,u.company_id companyId,c.display_name companyName,u.name,u.email,u.role,u.status
         FROM sessions s
         JOIN users u ON u.id=s.user_id AND u.company_id=s.company_id
         JOIN companies c ON c.id=s.company_id AND c.status='ACTIVE'
        WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP() LIMIT 1`, [tokenHash]
    );
    const admin = adminRows[0];
    if (admin && admin.status === 'ACTIVE') {
      await this.pool.execute(`UPDATE sessions SET last_seen_at=UTC_TIMESTAMP() WHERE id=?`, [admin.sessionId]);
      return { principal: { kind: 'USER', id:Number(admin.id), companyId:Number(admin.companyId), companyName:String(admin.companyName), name:String(admin.name), email:String(admin.email), role:admin.role, status:admin.status }, tokenHash, csrfHash:String(admin.csrfHash) };
    }
    const [employeeRows] = await this.pool.execute<RowDataPacket[]>(
      `SELECT s.id sessionId,s.csrf_token_hash csrfHash,e.id,e.identity_id identityId,e.company_id companyId,c.display_name companyName,e.name,e.cpf,e.status
         FROM employee_sessions s
         JOIN employees e ON e.id=s.employee_id AND e.identity_id=s.identity_id AND e.company_id=s.company_id
         JOIN companies c ON c.id=s.company_id AND c.status='ACTIVE'
        WHERE s.token_hash=? AND s.revoked_at IS NULL AND s.expires_at > UTC_TIMESTAMP() LIMIT 1`, [tokenHash]
    );
    const employee = employeeRows[0];
    if (employee && (employee.status === 'ACTIVE' || employee.status === 'TERMINATED')) {
      await this.pool.execute(`UPDATE employee_sessions SET last_seen_at=UTC_TIMESTAMP() WHERE id=?`, [employee.sessionId]);
      return { principal: { kind:'EMPLOYEE', id:Number(employee.id), identityId:Number(employee.identityId), companyId:Number(employee.companyId), companyName:String(employee.companyName), name:String(employee.name), cpf:String(employee.cpf), status:employee.status, accessMode:employee.status==='TERMINATED'?'HISTORICAL':'FULL' }, tokenHash, csrfHash:String(employee.csrfHash) };
    }
    return null;
  }

  async refreshCsrf(tokenHash: string | undefined, principal: Principal | undefined): Promise<string> {
    if (!tokenHash || !principal) throw unauthorized('Autenticação necessária.');
    const csrfToken = randomToken(24);
    const csrfHash = sha256(csrfToken);
    const table = principal.kind === 'USER' ? 'sessions' : 'employee_sessions';
    await this.pool.execute(
      `UPDATE ${table} SET csrf_token_hash=?,last_seen_at=UTC_TIMESTAMP() WHERE token_hash=? AND revoked_at IS NULL`,
      [csrfHash, tokenHash]
    );
    return csrfToken;
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
