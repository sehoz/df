# 三角洲特勤处收益排行

项目只保留两个主目录：

- `frontend`: Vite + React + TypeScript PWA 前端。
- `backend`: Hono + TypeScript 后端，部署为 CloudBase HTTP 云函数。

部署目标是腾讯云 CloudBase：

- 前端部署到 CloudBase 静态网站托管。
- 后端部署到 CloudBase HTTP 云函数 `df-api`。
- JSON 缓存放 CloudBase 数据库集合 `df_cache`。
- 图标文件放 CloudBase 云存储。

## 本地开发

```powershell
npm run install:all
copy .env.example .env
npm run dev:backend
npm run dev:frontend
```

前端默认运行在 `http://127.0.0.1:5173`，API 默认运行在 `http://127.0.0.1:8787`。

## API

- `GET /api/status`: 读取缓存状态，不调用外部接口。
- `GET /api/rankings`: 读取最新排行缓存，不调用外部接口。
- `POST /api/refresh`: 手动刷新。后端有全局冷却和刷新锁。

默认冷却时间为 `600000` 毫秒。冷却期内刷新会直接返回缓存，不消耗三角洲数据帝接口额度。

## CloudBase 配置

云函数环境变量：

```text
DF_API_TOKEN=你的三角洲数据帝 token
DF_API_BASE_URL=https://orzice.com/workApi
REFRESH_COOLDOWN_MS=600000
STORAGE_MODE=cloudbase
TCB_ENV_ID=你的 CloudBase 环境 ID
TCB_CACHE_COLLECTION=df_cache
```

GitHub Actions Secrets：

```text
TCB_ENV_ID
TENCENT_SECRET_ID
TENCENT_SECRET_KEY
VITE_API_BASE_URL
```

`VITE_API_BASE_URL` 填 CloudBase HTTP 云函数的公网访问地址，例如：

```text
https://xxxx.service.tcloudbase.com/df-api
```

## 自动部署

push 到 `main` 后，`.github/workflows/deploy.yml` 会：

1. 安装前后端依赖。
2. 构建后端和前端。
3. 使用 CloudBase CLI 部署 `backend` 为云函数 `df-api`。
4. 使用 CloudBase CLI 上传 `frontend/dist` 到静态网站托管。
