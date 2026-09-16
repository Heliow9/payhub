import type { Session } from '../domain/sessions/session.repository.js';
import type { User } from '../domain/users/user.repository.js';

declare global {
  namespace Express {
    interface Request {
      auth?: {
        user: User;
        session: Session;
      };
    }
  }
}

export {};
