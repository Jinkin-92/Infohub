# InfoHub Windows 本地使用说明

目标是让普通用户只需要解压 ZIP 并双击 BAT 脚本，就可以在本地启动 InfoHub，不需要 Docker、Python、`we-mp-rss` 或额外的 AI 服务。

## 环境要求

- Windows 10/11
- PowerShell 5.1 或更新版本
- 网络可访问 npm 和 Node.js 官方下载地址

说明：
- 如果系统里已经有 Node.js 20/22/24，脚本会直接复用
- 如果没有可用的 Node.js，`install.bat` 会自动调用安装脚本下载项目内置的便携 Node.js
- 如果系统里没有 Chrome/Edge，`install.bat` 会自动下载本地浏览器运行时，并写入 `backend/.env`

## 首次安装

在项目根目录执行：

```bat
install.bat
```

这个脚本会自动完成：
1. 准备 Node.js 运行时
2. 准备浏览器运行时
3. 生成 `backend/.env`
4. 安装前后端依赖
5. 构建前后端产物

## 启动

在项目根目录执行：

```bat
start.bat
```

脚本会：
1. 校验运行时是否可用
2. 必要时补装依赖
3. 启动后端和前端
4. 等待 `3002` 和 `3000` 端口就绪

启动后访问：
- 前端：`http://localhost:3000`
- 后端：`http://localhost:3002`

## 停止

```bat
stop.bat
```

## 更新

推荐两种更新方式：
1. 使用新的 ZIP 覆盖原目录后执行 `update.bat`
2. 开发环境下执行 `git pull` 后再执行 `update.bat`

`update.bat` 会自动：
1. 停止当前 InfoHub
2. 重新检查运行时
3. 刷新依赖
4. 重新构建
5. 重新启动

## 微信说明

微信采集现在走项目内置链路：
- 登录使用 `mp.weixin.qq.com` 的二维码登录
- 账号识别走项目内置解析
- 文章采集直接调用微信后台接口
- 不再依赖 `we-mp-rss` 或 `localhost:8001`

如果微信状态显示 `invalid`，说明当前保存的 Cookie/Token 已失效，需要重新在“平台连接 -> 微信公众号”里登录一次。

## 发布建议

面向普通用户时，建议只暴露：
- `install.bat`
- `start.bat`
- `stop.bat`
- `update.bat`
- 本文档

普通用户不需要了解 `backend/`、`frontend/`、Docker 或开发模式。
