export class AppError extends Error {
  status: number;
  code: string;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const badRequest = (message: string, details?: unknown) =>
  new AppError(400, 'bad_request', message, details);

export const unauthorized = (message = '请先登录') => new AppError(401, 'unauthorized', message);

export const forbidden = (message = '没有权限执行该操作') => new AppError(403, 'forbidden', message);

export const notFound = (message = '内容不存在') => new AppError(404, 'not_found', message);

export const conflict = (message: string) => new AppError(409, 'conflict', message);

export const tooLarge = (message: string) => new AppError(413, 'payload_too_large', message);

export const unprocessable = (message: string, details?: unknown) =>
  new AppError(422, 'unprocessable_entity', message, details);
