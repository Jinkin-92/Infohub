#!/bin/bash
# 复制 WeRss 数据库到主机
# 用途: 将 Docker 容器内的 WeRss 数据库复制到主机，供 InfoHub 迁移使用

set -e

CONTAINER_NAME="we-mp-rss"
HOST_PATH="/tmp/werss.db"

echo "[copy-werss-db] Copying WeRss database from container..."

# 检查容器是否运行
if ! docker ps --format '{{.Names}}' | grep -q "^${CONTAINER_NAME}$"; then
    echo "[copy-werss-db] Error: Container '${CONTAINER_NAME}' is not running"
    exit 1
fi

# 复制数据库 (容器内路径: /app/data/db.db)
docker cp "${CONTAINER_NAME}:/app/data/db.db" "${HOST_PATH}"

if [ -f "${HOST_PATH}" ]; then
    SIZE=$(du -h "${HOST_PATH}" | cut -f1)
    echo "[copy-werss-db] Success! Database copied to: ${HOST_PATH} (${SIZE})"
else
    echo "[copy-werss-db] Error: Failed to copy database"
    exit 1
fi
