import { z } from 'zod';
import dotenv from 'dotenv';
import { join, resolve } from 'path';
import { homedir } from 'os';

// 加载 .env 文件
dotenv.config();

function getDefaultSqlitePath(): string {
  if (process.platform === 'win32') {
    const localAppData = process.env.LOCALAPPDATA;
    if (localAppData) {
      return join(localAppData, 'InfoHub', 'data', 'infohub_v2.db');
    }
  }

  return join(homedir(), '.infohub', 'data', 'infohub_v2.db');
}

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
  SQLITE_PATH: z.string().default(getDefaultSqlitePath()),

  // RSSHub配置
  RSSHUB_URL: z.string().default('http://localhost:1200'),
  CHROME_EXECUTABLE_PATH: z.string().optional(),
  WEIBO_COLLECTOR_MODE: z.enum(['http', 'browser']).default('http'),

  // 可选：Cookie配置（用于需要登录的平台）
  ZHIHU_COOKIES: z.string().optional(),
  TWITTER_COOKIE: z.string().optional(),

  // 加密密钥（用于凭证存储 AES-256-GCM）
  // 生成方式: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
  ENCRYPTION_KEY: z.string().optional(),
});

/**
 * 解析后的环境变量
 */
const parsedEnv = envSchema.parse(process.env);

export const env = {
  ...parsedEnv,
  SQLITE_PATH: parsedEnv.SQLITE_PATH.startsWith('.')
    ? resolve(process.cwd(), parsedEnv.SQLITE_PATH)
    : parsedEnv.SQLITE_PATH,
};

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
