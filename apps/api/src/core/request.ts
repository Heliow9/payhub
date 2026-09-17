import type { Request } from 'express';
import type { RequestMeta } from './types.js';

export function requestMeta(req: Request): RequestMeta {
  return {
    ipAddress: req.ip || req.socket.remoteAddress || null,
    userAgent: req.get('user-agent') ?? null
  };
}
