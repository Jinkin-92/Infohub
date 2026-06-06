import { z } from 'zod';
import type { Context, Next } from 'hono';
import { ValidationError } from './error.js';

/**
 * 验证请求Body
 */
export function validateBody<T>(schema: z.ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    try {
      const body = await c.req.json();
      const validated = schema.parse(body);
      c.set('validatedBody', validated);
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string[]> = {};
        for (const issue of error.issues) {
          const path = issue.path.join('.');
          if (!errors[path]) errors[path] = [];
          errors[path].push(issue.message);
        }
        throw new ValidationError('请求参数验证失败', errors);
      }
      throw error;
    }
  };
}

/**
 * 验证Query参数
 */
export function validateQuery<T>(schema: z.ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    try {
      const query = c.req.query();
      const validated = schema.parse(query);
      c.set('validatedQuery', validated);
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        const errors: Record<string, string[]> = {};
        for (const issue of error.issues) {
          const path = issue.path.join('.');
          if (!errors[path]) errors[path] = [];
          errors[path].push(issue.message);
        }
        throw new ValidationError('查询参数验证失败', errors);
      }
      throw error;
    }
  };
}

/**
 * 验证Params
 */
export function validateParams<T>(schema: z.ZodSchema<T>) {
  return async (c: Context, next: Next) => {
    try {
      const params = c.req.param();
      const validated = schema.parse(params);
      c.set('validatedParams', validated);
      await next();
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw new ValidationError('路径参数验证失败');
      }
      throw error;
    }
  };
}

/**
 * 获取验证后的Body
 */
export function getValidatedBody<T>(c: Context): T {
  return c.get('validatedBody') as T;
}

/**
 * 获取验证后的Query
 */
export function getValidatedQuery<T>(c: Context): T {
  return c.get('validatedQuery') as T;
}

/**
 * 获取验证后的Params
 */
export function getValidatedParams<T>(c: Context): T {
  return c.get('validatedParams') as T;
}
