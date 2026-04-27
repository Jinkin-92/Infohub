#!/bin/bash
# -*- coding: utf-8 -*-
# InfoHub - 快速启动脚本

set -e

echo "=========================================="
echo "  InfoHub (个人信息中枢)"
echo "=========================================="

# 检查 Docker
if ! command -v docker &> /dev/null; then
    echo "❌ Docker 未安装"
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose 未安装"
    exit 1
fi

echo "✅ Docker 检查通过"

# 进入项目目录
cd "$(dirname "$0")"

# 检查环境变量
if [ ! -f .env ]; then
    echo "📝 复制环境变量文件..."
    cp .env.example .env
fi

# 创建必要目录
mkdir -p data logs

# 初始化数据库 (如果不存在)
if [ ! -f data/infohub.db ]; then
    echo "📦 初始化数据库..."
    docker-compose run --rm backend node -e "
        const { sql } = require('./dist/db/client.js');
        const fs = require('fs');
        const schema = fs.readFileSync('./src/db/schema.sql', 'utf-8');
        // 分离并执行每个 SQL 语句
        schema.split(';').forEach(stmt => {
            stmt = stmt.trim();
            if (stmt && !stmt.startsWith('--')) {
                try { sql.execute(stmt); } catch {}
            }
        });
        console.log('Database initialized');
        process.exit(0);
    " || echo "⚠️  数据库初始化将在首次启动时完成"
fi

# 停止旧服务 (如果存在)
echo ""
echo "🛑 停止旧服务..."
docker-compose down 2>/dev/null || true

# 启动服务
echo ""
echo "🚀 启动服务..."
docker-compose up -d --build

# 等待服务启动
echo ""
echo "⏳ 等待服务启动 (30秒)..."
sleep 30

# 健康检查
echo ""
echo "🏥 健康检查..."

# 检查 RSSHub
if curl -s --max-time 5 http://localhost:1200 > /dev/null 2>&1; then
    echo "✅ RSSHub     http://localhost:1200"
else
    echo "⚠️  RSSHub    启动中..."
fi

# 检查后端
if curl -s --max-time 5 http://localhost:3002/api/feed > /dev/null 2>&1; then
    echo "✅ 后端 API   http://localhost:3002"
else
    echo "⚠️  后端 API  启动中..."
fi

# 检查前端
if curl -s --max-time 5 http://localhost:3000 > /dev/null 2>&1; then
    echo "✅ 前端界面   http://localhost:3000"
else
    echo "⚠️  前端界面  启动中..."
fi

echo ""
echo "=========================================="
echo "  启动完成!"
echo "=========================================="
echo ""
echo "  服务地址:"
echo "    前端界面: http://localhost:3000"
echo "    后端API:  http://localhost:3002"
echo "    RSSHub:   http://localhost:1200"
echo ""
echo "  常用命令:"
echo "    docker-compose logs -f      - 查看日志"
echo "    docker-compose restart     - 重启服务"
echo "    docker-compose down          - 停止服务"
echo "=========================================="
