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
