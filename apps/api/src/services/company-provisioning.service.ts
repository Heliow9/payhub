import type { Pool, ResultSetHeader, RowDataPacket } from 'mysql2/promise';
import { HttpError, badRequest } from '../core/errors.js';
import { hashSecret } from '../core/security.js';

export interface ProvisionCompanyInput {
  legalName: string;
  displayName: string;
  slug: string;
  sageCompanyCode: string;
  master: { name: string; email: string; password: string };
  externalSource?: string | null;
  externalId?: string | null;
  idempotencyKey?: string | null;
}

export class CompanyProvisioningService {
  constructor(private pool: Pool) {}

  async provision(input: ProvisionCompanyInput): Promise<{ companyId: number; masterUserId: number; alreadyProvisioned: boolean }> {
    const normalized = {
      legalName: input.legalName.trim(), displayName: input.displayName.trim(), slug: input.slug.trim().toLowerCase(),
      sageCompanyCode: input.sageCompanyCode.trim(), masterName: input.master.name.trim(), masterEmail: input.master.email.trim().toLowerCase(),
      externalSource: input.externalSource?.trim() || null, externalId: input.externalId?.trim() || null,
      idempotencyKey: input.idempotencyKey?.trim() || null,
    };
    if (!normalized.legalName || !normalized.displayName || !/^[a-z0-9-]+$/.test(normalized.slug) || !normalized.sageCompanyCode) throw badRequest('Dados da empresa inválidos.');
    if (normalized.masterName.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.masterEmail) || input.master.password.length < 10) throw badRequest('Dados do MASTER inválidos.');
    if ((normalized.externalSource && !normalized.externalId) || (!normalized.externalSource && normalized.externalId)) throw badRequest('Origem e identificador externo devem ser informados juntos.');

    const connection = await this.pool.getConnection();
    try {
      await connection.beginTransaction();
      if (normalized.externalSource && normalized.externalId) {
        const [existingRows] = await connection.execute<RowDataPacket[]>(
          `SELECT c.id companyId,c.legal_name legalName,c.display_name displayName,c.slug,c.sage_company_code sageCompanyCode,
                  u.id masterUserId,u.email masterEmail
             FROM companies c JOIN company_masters cm ON cm.company_id=c.id JOIN users u ON u.id=cm.user_id
            WHERE c.external_source=? AND c.external_id=? LIMIT 1 FOR UPDATE`,
          [normalized.externalSource, normalized.externalId],
        );
        const existing = existingRows[0];
        if (existing) {
          const matches = String(existing.legalName) === normalized.legalName && String(existing.displayName) === normalized.displayName
            && String(existing.slug) === normalized.slug && String(existing.sageCompanyCode) === normalized.sageCompanyCode
            && String(existing.masterEmail).toLowerCase() === normalized.masterEmail;
          if (!matches) throw new HttpError(409, 'Os dados não correspondem ao tenant já provisionado.', 'PROVISIONING_CONFLICT');
          await connection.commit();
          return { companyId: Number(existing.companyId), masterUserId: Number(existing.masterUserId), alreadyProvisioned: true };
        }
      }
      const [emailRows] = await connection.execute<RowDataPacket[]>(`SELECT id FROM users WHERE email=? LIMIT 1 FOR UPDATE`, [normalized.masterEmail]);
      if (emailRows[0]) throw new HttpError(409, 'Já existe um usuário com este e-mail.', 'EMAIL_ALREADY_EXISTS');
      const [companyResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO companies (legal_name,display_name,slug,status,sage_company_code,external_source,external_id,provisioning_key,created_at,updated_at)
         VALUES (?,?,?,'ACTIVE',?,?,?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
        [normalized.legalName, normalized.displayName, normalized.slug, normalized.sageCompanyCode, normalized.externalSource, normalized.externalId, normalized.idempotencyKey],
      );
      const companyId = companyResult.insertId;
      const [userResult] = await connection.execute<ResultSetHeader>(
        `INSERT INTO users (company_id,name,email,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,?,'MASTER','ACTIVE',UTC_TIMESTAMP(),UTC_TIMESTAMP())`,
        [companyId, normalized.masterName, normalized.masterEmail, await hashSecret(input.master.password)],
      );
      const masterUserId = userResult.insertId;
      await connection.execute(`INSERT INTO company_masters (company_id,user_id,created_at,updated_at) VALUES (?,?,UTC_TIMESTAMP(),UTC_TIMESTAMP())`, [companyId, masterUserId]);
      await connection.execute(
        `INSERT INTO app_settings (company_id,signature_mode,signature_link_ttl_minutes,acceptance_text,updated_by_user_id,updated_at)
         VALUES (?,'ACCEPT_AND_DRAW',1440,?,NULL,UTC_TIMESTAMP())`,
        [companyId, 'Declaro que visualizei o holerite, conferi seu conteúdo e manifesto eletronicamente minha ciência e recebimento.'],
      );
      await connection.commit();
      return { companyId, masterUserId, alreadyProvisioned: false };
    } catch (error) {
      await connection.rollback();
      if ((error as { code?: string }).code === 'ER_DUP_ENTRY') throw new HttpError(409, 'Empresa, e-mail ou chave de provisionamento já cadastrada.', 'PROVISIONING_CONFLICT');
      throw error;
    } finally {
      connection.release();
    }
  }
}
