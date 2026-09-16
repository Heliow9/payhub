import type { Session } from '../domain/sessions/session.repository.js';
import type { User } from '../domain/users/user.repository.js';
import type { Connector } from '../domain/connectors/connector.repository.js';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: User;
        session: Session;
      };
      connector?: Connector;
    }
  }
}

export {};
