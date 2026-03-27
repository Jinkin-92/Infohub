#!/bin/bash

# 个人信息中枢 - 快速启动脚本

echo "=========================================="
echo "  个人信息中枢 (InfoHub)"
echo "=========================================="

# 检查Docker
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

# 启动服务
echo ""
echo "🚀 启动服务..."
docker-compose up -d --build

# 等待服务启动
echo ""
echo "⏳ 等待服务启动..."
sleep 10

# 健康检查
echo ""
echo "🏥 健康检查..."

# 检查后端
if curl -s http://localhost:3001/health > /dev/null; then
    echo "✅ 后端服务正常"
else
    echo "⚠️  后端服务启动中，请稍后重试"
fi

# 检查前端
if curl -s http://localhost:3000 > /dev/null; then
    echo "✅ 前端服务正常"
else
    echo "⚠️  前端服务启动中，请稍后重试"
fi

echo ""
echo "=========================================="
echo "  服务地址"
echo "=========================================="
echo "  前端界面: http://localhost:3000"
echo "  后端API:  http://localhost:3001"
echo "  RSSHub:   http://localhost:1200"
echo ""
echo "  常用命令:"
echo "    ./stop.sh      - 停止服务"
echo "    ./logs.sh      - 查看日志"
echo "    ./reset-db.sh  - 重置数据库"
echo "=========================================="
