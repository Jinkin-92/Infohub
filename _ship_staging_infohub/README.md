# InfoHub

InfoHub 是一个面向个人用户的本地内容订阅中心，聚合知乎、微信公众号、微博、X、小红书、B 站、YouTube 和公开 RSS。

当前面向普通用户的推荐发布形态是：
- Windows 10/11
- SQLite 本地数据库
- 项目自带 BAT 启动脚本
- 默认优先使用项目内置的便携 Node.js 运行时
- 浏览器优先使用本机 Chrome/Edge；若不存在，会在安装时自动下载本地浏览器运行时

普通用户不需要 Docker，也不需要额外配置 Python、AI 服务或独立的微信采集器。

## 面向普通用户的使用方式

### 1. 首次安装

在项目根目录运行：

```bat
install.bat
```

这个脚本会自动：
- 检查并准备可用的 Node.js 20/22/24 运行时
- 自动下载项目内浏览器运行时，仅在本机没有 Chrome/Edge 时执行
- 补齐 `backend/.env`
- 安装前后端依赖
- 构建前后端产物

### 2. 启动

```bat
start.bat
```

启动成功后：
- 前端：`http://localhost:3000`
- 后端：`http://localhost:3002`

### 3. 停止

```bat
stop.bat
```

### 4. 更新

```bat
update.bat
```

推荐更新方式：
1. 发布 ZIP 包，用户覆盖原目录后执行 `update.bat`
2. 或者用户先 `git pull`，再执行 `update.bat`

## 产品原则

- 默认本地运行，尽量减少外部环境依赖
- 微信走项目内置采集链路，不再依赖 `we-mp-rss`
- 内容刷新以用户主动触发为主，不做高频后台自动采集
- RSSHub 作为本地基础服务被自动托管，但只管理 InfoHub 自己拉起的进程

## 当前脚本职责

- `install.bat`
  普通用户入口，调用安装脚本准备运行时、安装依赖、构建产物
- `start.bat`
  普通用户入口，启动前后端并等待就绪
- `stop.bat`
  普通用户入口，停止 InfoHub 自己的前后端进程
- `update.bat`
  普通用户入口，停止、更新依赖、重建并重启
- `package-release.bat`
  开发/打包入口，生成 Windows 测试分发 ZIP

底层仍保留对应的 `.ps1` 脚本，便于维护和调试，但普通用户默认只需要使用 `.bat`。

## 发布说明

为了让普通用户部署尽量简单，建议对外发布：
- ZIP 测试包
- 五个 BAT 脚本：`install.bat / start.bat / stop.bat / update.bat / package-release.bat`
- 一份简洁的 Windows 使用说明

更完整的本地部署说明见：
- `docs/windows-local-setup.md`
