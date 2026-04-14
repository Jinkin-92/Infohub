import { z } from 'zod';
import dotenv from 'dotenv';

// 加载 .env 文件
dotenv.config();

/**
 * 环境变量验证Schema
 */
const envSchema = z.object({
  // 服务器配置
  PORT: z.string().default('3001'),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  // 数据库类型: postgresql 或 sqlite
  DB_TYPE: z.enum(['postgresql', 'sqlite']).default('sqlite'),

  // 数据库配置 (PostgreSQL)
  DATABASE_URL: z.string().optional().default(''),

  // SQLite 配置
  SQLITE_PATH: z.string().default('./data/infohub.db'),

  // RSSHub配置
  RSSHUB_URL: z.string().default('http://localhost:1200'),
  CHROME_EXECUTABLE_PATH: z.string().optional(),

  // 可选：Cookie配置（用于需要登录的平台）
  ZHIHU_COOKIES: z.string().optional(),
  TWITTER_COOKIE: z.string().optional(),
});

/**
 * 解析后的环境变量
 */
export const env = envSchema.parse(process.env);

/**
 * 是否为开发环境
 */
export const isDev = env.NODE_ENV === 'development';

/**
 * 是否为生产环境
 */
export const isProd = env.NODE_ENV === 'production';

/**
 * 是否为测试环境
 */
export const isTest = env.NODE_ENV === 'test';
