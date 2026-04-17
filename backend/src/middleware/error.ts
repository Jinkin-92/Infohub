/**
 * 应用错误类
 * 统一错误处理机制（工程审查要求）
 */
export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;

    Error.captureStackTrace(this, this.constructor);
  }
}

/**
 * 404 Not Found 错误
 */
export class NotFoundError extends AppError {
  constructor(message: string = '资源不存在') {
    super(message, 404, 'NOT_FOUND');
  }
}

/**
 * 400 Bad Request 错误
 */
export class BadRequestError extends AppError {
  constructor(message: string = '请求参数错误') {
    super(message, 400, 'BAD_REQUEST');
  }
}

/**
 * 401 Unauthorized 错误
 */
export class UnauthorizedError extends AppError {
  constructor(message: string = '未授权') {
    super(message, 401, 'UNAUTHORIZED');
  }
}

/**
 * 403 Forbidden 错误
 */
export class ForbiddenError extends AppError {
  constructor(message: string = '禁止访问') {
    super(message, 403, 'FORBIDDEN');
  }
}

/**
 * 409 Conflict 错误
 */
export class ConflictError extends AppError {
  constructor(message: string = '资源冲突') {
    super(message, 409, 'CONFLICT');
  }
}

/**
 * 422 Validation 错误
 */
export class ValidationError extends AppError {
  public readonly errors: Record<string, string[]>;

  constructor(message: string = '验证失败', errors: Record<string, string[]> = {}) {
    super(message, 422, 'VALIDATION_ERROR');
    this.errors = errors;
  }
}

/**
 * 503 Service Unavailable 错误
 */
export class ServiceUnavailableError extends AppError {
  constructor(message: string = '服务暂不可用') {
    super(message, 503, 'SERVICE_UNAVAILABLE');
  }
}

/**
 * 错误响应格式
 */
export interface ErrorResponse {
  ok: false;
  error: string;
  code: string;
  errors?: Record<string, string[]>;
  stack?: string;
}

/**
 * 格式化错误为响应
 */
export function formatError(error: Error): ErrorResponse {
  const response: ErrorResponse = {
    ok: false,
    error: error.message,
    code: 'INTERNAL_ERROR'
  };

  if (error instanceof AppError) {
    response.code = error.code;
    if (error instanceof ValidationError) {
      response.errors = error.errors;
    }
  }

  // 开发环境返回堆栈
  if (process.env.NODE_ENV === 'development') {
    response.stack = error.stack;
  }

  return response;
}

/**
 * 获取HTTP状态码
 */
export function getStatusCode(error: Error): number {
  if (error instanceof AppError) {
    return error.statusCode;
  }
  return 500;
}
