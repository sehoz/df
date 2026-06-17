# 三角洲特勤处收益排行

项目现在只分为两个主目录：

- `frontend`: Vite + React + TypeScript PWA 前端。
- `backend`: Hono + TypeScript API，可部署到腾讯云 SCF/API Gateway。

旧版单体 `server.js`、`public`、`lib`、`packages` 已移除。

## 本地开发

```powershell
npm run install:all
copy .env.example .env
npm run dev:backend
npm run dev:frontend
```

前端默认运行在 `http://127.0.0.1:5173`，API 默认运行在 `http://127.0.0.1:8787`。

## API

- `GET /api/status`: 读取缓存状态，不触发外部接口。
- `GET /api/rankings`: 读取最新排行缓存，不触发外部接口。
- `POST /api/refresh`: 所有用户可触发刷新；后端做全局冷却和刷新锁。

默认冷却时间为 `600000` 毫秒。冷却期内刷新会直接返回缓存，不调用外部三角洲接口。

## 缓存文件

本地开发使用 `LOCAL_DATA_DIR`，生产使用 COS：

- `cache/manufacture-latest.json`: 最新排行。
- `cache/refresh-lock.json`: 刷新锁和最近刷新时间。
- `cache/item-assets.json`: 物品图标、品质、COS 图标地址。
- `assets/items/*`: 下载后的图标文件。

## GitHub Push 自动部署

`.github/workflows/deploy.yml` 会在 push 到 `main` 后：

1. 分别安装 `backend` 和 `frontend` 依赖。
2. 构建后端和前端。
3. 将 `frontend/dist` 同步到 COS 静态网站桶。
4. 打包 `backend/dist` 和后端依赖，上传到 COS。
5. 调用腾讯云 SCF `UpdateFunctionCode` 更新云函数代码。

GitHub Secrets 需要配置：

- `TENCENT_SECRET_ID`
- `TENCENT_SECRET_KEY`
- `TENCENT_REGION`
- `COS_BUCKET`
- `COS_REGION`
- `SCF_FUNCTION_NAME`
- `SCF_CODE_BUCKET`
- `SCF_CODE_OBJECT`

腾讯云侧需要预先创建：

- 一个用于前端静态网站和缓存资源的 COS Bucket。
- 一个用于存放 SCF 代码包的 COS Object 路径。
- 一个 SCF 云函数，Handler 为 `dist/index.main_handler`。
- 一个 API Gateway 触发器，将 `/api/*` 转发到该云函数。

`DF_API_TOKEN` 等运行时环境变量需要在 SCF 函数环境变量中配置，不要放入 GitHub 仓库。
