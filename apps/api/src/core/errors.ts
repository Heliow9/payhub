export class HttpError extends Error {
  constructor(public statusCode: number, message: string, public code?: string, public details?: unknown) {
    super(message);
    this.name = 'HttpError';
  }
}
export const badRequest = (message: string, code?: string, details?: unknown) => new HttpError(400, message, code, details);
export const unauthorized = (message = 'Credenciais inválidas.', code?: string) => new HttpError(401, message, code);
export const forbidden = (message = 'Acesso negado.') => new HttpError(403, message);
export const notFound = (message = 'Registro não encontrado.') => new HttpError(404, message);
export const conflict = (message: string) => new HttpError(409, message);
