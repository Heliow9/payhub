import type { Principal } from './core/types.js';

declare global {
  namespace Express {
    interface Request {
      principal?: Principal;
      sessionTokenHash?: string;
      csrfHash?: string;
      connectorId?: number;
      connectorCompanyId?: number;
    }
  }
}
export {};
