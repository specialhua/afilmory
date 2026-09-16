# 阿里云静态部署（私有原图）

照片放在私有 OSS bucket，站点构建成静态文件发布到另一个 OSS bucket，原图通过函数计算 `fc/photo-auth` 签发带时效的 CDN 地址访问。
照片上传后，OSS 触发器调用转发函数，转发函数通知 webhook 自动重新构建发布。

```
照片上传到私有 bucket
        │ OSS 触发器
        ▼
oss-event-forwarder（函数计算）
        │ HTTPS POST /oss，请求头 X-Webhook-Token
        ▼
反向代理 ──► webhook/server.mjs（pm2 守护，防抖 30 秒）
                │
                ▼
      scripts/build-and-publish.sh
        ├─ pnpm build:manifest   处理照片，生成 manifest 与缩略图
        ├─ pnpm --filter web build
        ├─ ossutil 发布 dist 到站点 bucket
        └─ scripts/deploy-photo-auth.sh   打包 manifest 更新 photo-auth 函数
```

## 目录

| 路径                           | 说明                                           |
| ------------------------------ | ---------------------------------------------- |
| `.env.example`                 | 部署与 webhook 配置模板，复制为 `.env`         |
| `webhook/server.mjs`           | webhook 服务，仅依赖 Node 内置模块             |
| `webhook/ecosystem.config.cjs` | pm2 配置                                       |
| `scripts/build-and-publish.sh` | 构建并发布，可单独手动执行                     |
| `scripts/deploy-photo-auth.sh` | 更新函数计算代码                               |
| `oss-event-forwarder/`         | OSS 触发器调用的转发函数，在函数计算控制台部署 |
| `../../fc/photo-auth/`         | 原图鉴权函数源码                               |

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

按注释填写 `.env`。
该文件已被 git 忽略。

## 启动 webhook

```bash
pm2 start deploy/aliyun-static/webhook/ecosystem.config.cjs
pm2 save
curl -s http://127.0.0.1:3002/health
```

## 反向代理

webhook 只监听本机，由反向代理对外暴露。
最简单的方式是给 webhook 单独一个子域名，整站反向代理到 `http://127.0.0.1:3002`（例如 1Panel 创建反向代理网站）。

也可以挂在已有站点的 `/webhook/` 路径下，服务端两种路径都能识别：

```nginx
location /webhook/ {
    proxy_pass http://127.0.0.1:3002/webhook/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    # 状态页通过 ?token= 访问，不写入访问日志
    access_log off;
}
```

## OSS 事件通知

推荐链路：OSS 触发器 → `oss-event-forwarder` 函数 → webhook。

1. 在函数计算创建 Node.js 18+ 事件函数，代码为 `oss-event-forwarder/index.js`，入口 `index.handler`
2. 配置环境变量 `WEBHOOK_HOST`（webhook 域名）和 `WEBHOOK_TOKEN`（与 `.env` 一致）；挂在 `/webhook/` 路径下时再设 `WEBHOOK_PATH=/webhook/oss`
3. 给函数添加 OSS 触发器，事件选 `oss:ObjectCreated:*` 和 `oss:ObjectRemoved:*`，前缀填照片目录

转发函数通过 `X-Webhook-Token` 请求头携带 token，token 不会出现在 URL 和访问日志中。
webhook 返回非 2xx 时函数报错，由函数计算按异步调用策略重试。

不使用转发函数、直接配置 HTTP 回调时，可以把 token 放在路径里：`https://你的域名/oss/<WEBHOOK_TOKEN>`。
webhook 也能解析 Base64 与 MNS 的 XML / JSON 包装格式，无法解析的请求返回 400，日志里记录 content-type 和前 200 个字符。

## 接口

只读接口公开，方便随时在网页上查看构建情况；会触发构建的写接口必须带 token。
表中路径的 `/webhook` 前缀可省略。

| 方法 | 路径              | 鉴权 | 说明                           |
| ---- | ----------------- | ---- | ------------------------------ |
| GET  | `/webhook/`       | 公开 | 构建状态页，自动刷新状态和日志 |
| GET  | `/webhook/status` | 公开 | 状态 JSON                      |
| GET  | `/webhook/logs`   | 公开 | 最近 100 行公开日志            |
| GET  | `/webhook/health` | 公开 | 健康检查                       |
| POST | `/webhook/oss`    | 需要 | OSS 事件通知                   |
| POST | `/webhook/build`  | 需要 | 手动触发构建（同样走防抖）     |

写接口的 token 放在 `X-Webhook-Token` 请求头（推荐）、`Authorization: Bearer`、`?token=` 查询参数，或路径末尾（仅 `/oss/<token>`）。

手动触发：

```bash
curl -X POST -H "X-Webhook-Token: $WEBHOOK_TOKEN" https://你的域名/build
```

### 公开日志的脱敏方式

公开日志不是在原文上遮掉敏感词，而是只展示认得的日志行：

- 照常显示：照片文件名、构建各步骤的开始 / 成功 / 失败、上传与更新元数据的文件名、退出码
- 只显示概要：步骤失败的原始输出、`错误：` 详情、无法解析的通知、元数据更新失败
- 不显示：构建进程的 stderr 原文、被拒绝的未授权请求、来源 IP、bucket 名、服务器路径，以及任何未识别的日志行

完整日志保存在服务器的 `webhook/webhook.log`（超过 10MB 轮换为 `webhook.log.1`），每个构建步骤的完整输出在 `BUILD_LOG_DIR`。

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
