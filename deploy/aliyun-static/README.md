# 阿里云静态部署（私有原图）

照片放在私有 OSS bucket，站点构建成静态文件发布到另一个 OSS bucket，原图通过函数计算 `fc/photo-auth` 签发带时效的 CDN 地址访问。照片上传后，OSS 事件通知触发 webhook 自动重新构建发布。

```
照片上传到私有 bucket
        │ OSS 事件通知（HTTP，URL 带 token）
        ▼
nginx ──► webhook/server.mjs（pm2 守护，防抖 30 秒）
                │
                ▼
      scripts/build-and-publish.sh
        ├─ pnpm build:manifest   处理照片，生成 manifest 与缩略图
        ├─ pnpm --filter web build
        ├─ ossutil 发布 dist 到站点 bucket
        └─ scripts/deploy-photo-auth.sh   打包 manifest 更新 photo-auth 函数
```

## 目录

| 路径 | 说明 |
|---|---|
| `.env.example` | 部署与 webhook 配置模板，复制为 `.env` |
| `webhook/server.mjs` | webhook 服务，仅依赖 Node 内置模块 |
| `webhook/ecosystem.config.cjs` | pm2 配置 |
| `scripts/build-and-publish.sh` | 构建并发布，可单独手动执行 |
| `scripts/deploy-photo-auth.sh` | 更新函数计算代码 |
| `../../fc/photo-auth/` | 原图鉴权函数源码 |

## 前置条件

- Node.js ≥ 20.19、pnpm 11、Perl（exiftool 需要）
- `ossutil` 已配置好对站点 bucket 的写权限
- `aliyun` CLI 已安装 fc 插件（`aliyun plugin install --names fc`），并配置了对应 profile
- pm2
- 项目根目录的 `.env`、`builder.config.ts`、`config.json` 已配置好（照片存储凭据、`PHOTO_PROXY_BASE_URL` 等）

## 配置

```bash
cp deploy/aliyun-static/.env.example deploy/aliyun-static/.env
openssl rand -hex 32   # 生成 WEBHOOK_TOKEN
```

按注释填写 `.env`。该文件已被 git 忽略。

## 启动 webhook

```bash
pm2 start deploy/aliyun-static/webhook/ecosystem.config.cjs
pm2 save
curl -s http://127.0.0.1:3002/health
```

## 反向代理

webhook 只监听本机，由 nginx 对外暴露。路径带不带 `/webhook` 前缀都能识别：

```nginx
location /webhook/ {
    proxy_pass http://127.0.0.1:3002;
    proxy_set_header X-Forwarded-For $remote_addr;
    # token 会出现在 URL 中，不写入访问日志
    access_log off;
}
```

## OSS 事件通知

通知地址填：

```
https://你的域名/webhook/oss/<WEBHOOK_TOKEN>
```

支持直接投递 JSON、Base64 编码 JSON，以及 MNS 主题 HTTP 订阅的 XML / JSON 包装格式。无法解析的请求返回 400，不会触发构建，日志里会记录 content-type 和前 200 个字符，便于排查。

## 接口

除 `/health` 外都需要 token，可以放在路径末尾（仅 `/oss`）、`?token=` 查询参数、`X-Webhook-Token` 请求头或 `Authorization: Bearer`。

| 方法 | 路径 | 说明 |
|---|---|---|
| GET | `/webhook/health` | 健康检查，公开 |
| POST | `/webhook/oss/<token>` | OSS 事件通知 |
| POST | `/webhook/build` | 手动触发构建（同样走防抖） |
| GET | `/webhook/?token=` | 状态页 |
| GET | `/webhook/status?token=` | 状态 JSON |
| GET | `/webhook/logs?token=` | 最近 100 行日志（已脱敏） |

手动触发：

```bash
curl -X POST -H "X-Webhook-Token: $WEBHOOK_TOKEN" https://你的域名/webhook/build
```

## 手动构建与排错

```bash
bash deploy/aliyun-static/scripts/build-and-publish.sh
```

各步骤的完整输出在 `BUILD_LOG_DIR`（默认 `/tmp/afilmory-build-logs/`）。

## 更新代码

构建脚本不会自动拉取代码：

```bash
git pull && pnpm install --frozen-lockfile
pm2 restart afilmory-webhook   # 只有 webhook/server.mjs 变化时才需要
```

每次 web 构建都会用根目录 `logo.jpg` 重新生成 `apps/web/public/` 下的 favicon，`git pull` 前如有冲突先 `git restore apps/web/public`。
