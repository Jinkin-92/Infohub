# -*- coding: utf-8 -*-
# InfoHub Backend Dockerfile

FROM node:20-alpine AS base

# 安装依赖阶段
FROM base AS dependencies
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 构建阶段
FROM base AS builder
WORKDIR /app
COPY package*.json ./
COPY tsconfig.json ./
RUN npm ci
COPY src ./src
RUN npm run build

# 生产阶段
FROM base AS production
WORKDIR /app

# 安装生产依赖
COPY package*.json ./
RUN npm ci --only=production && npm cache clean --force

# 复制构建产物
COPY --from=builder /app/dist ./dist
COPY src/db/schema.sql ./src/db/schema.sql

# 设置环境变量
ENV NODE_ENV=production
ENV PORT=3002

# 暴露端口
EXPOSE 3002

# 启动命令
CMD ["node", "dist/index.js"]
