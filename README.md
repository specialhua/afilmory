<p align="center">
  <img src="https://github.com/Afilmory/assets/blob/main/afilmory-readme-2:1.webp?raw=true" alt="Afilmory" width="100%" />
</p>

# <p align="center">Afilmory · 阿里云私有原图版</p>

<p align="center">
  <em>基于 Afilmory 的摄影相册，专注「阿里云 OSS + 静态页面 + 原图私有化」的自托管方案</em>
</p>

<p align="center">
  <a href="https://afilm.site">演示站点</a> •
  <a href="./deploy/aliyun-static/README.md">部署说明</a> •
  <a href="#与官方仓库的差异">与官方的差异</a> •
  <a href="https://github.com/Afilmory/afilmory">官方仓库</a>
</p>

---

> [!NOTE]
> 本仓库是 [Afilmory/afilmory](https://github.com/Afilmory/afilmory) 的 fork，**只维护阿里云静态部署 + 原图私有化这一套方案**。
>
> 官方仓库目前的方向是 SaaS、iOS App 和一键部署。
> 如果你想零运维使用，请选择 [官方 SaaS](https://afilmory.art)；想用 Docker 部署，请参考 [Afilmory/docker](https://github.com/Afilmory/docker)。
> 本仓库会定期合并官方更新，但文档和问题讨论只围绕阿里云方案展开。

## 关于 Afilmory

**Afilmory**（/əˈfɪlməri/）的名字由 **Auto Focus（AF）**、**Aperture**（光圈）、**Film**（胶片）和 **Memory**（记忆）组合而来，是一个面向摄影爱好者的现代相册系统。
它使用 React + TypeScript 构建，从存储中自动同步照片，提供高性能的 WebGL 看图体验和完整的 EXIF 信息展示。

原作者为 [Innei](https://innei.in) 及 Afilmory 团队，原版英文介绍见 [官方仓库](https://github.com/Afilmory/afilmory)。

## 这套方案是什么

- **零数据库**：照片存在 OSS，配置是 JSON，站点构建成纯静态文件，放在 OSS 上由 CDN 分发。
- **原图不公开**：原图放在私有桶里。
  访客点开大图时，由函数计算临时签发一个有时效的 CDN 鉴权地址，原图链接过期后就无法再访问，不能被长期盗用；缩略图照常公开。
- **手机上传即发布**：在手机上把照片上传到 OSS，OSS 触发器通知服务器自动构建，大约 1 分钟后网站上就能看到新照片。
- **成本低**：一台最低配的轻量服务器负责构建，网站访问全部走 OSS + CDN，服务器宕机也不影响访问。

### 日常体验

1. 用 Lightroom / Photoshop 修完图，导出到手机的「文件」（不要存到「相册」，存相册会丢失 EXIF 信息）
2. 在手机上用 OSS 客户端（例如 iOS 的 OSS Browser）上传到私有桶的 `photos/` 目录
3. 等待约 1 分钟，打开相册即可看到新照片；构建进度可以在 webhook 状态页上实时查看

## 功能

### 官方版本的核心能力

- 🖼️ **WebGL 看图器**：流畅缩放、平移，支持手势；支持 HDR 和 JPEG Gain Map
- 📱 **响应式瀑布流**：适配各种屏幕尺寸
- 📊 **完整 EXIF 展示**：相机、镜头、焦距、光圈、ISO、快门等，支持富士胶片模拟配方
- 🔄 **格式支持**：HEIC / HEIF、TIFF、AVIF 自动处理
- 📷 **Live Photo 与动态照片**：识别并播放 iPhone 实况照片
- 🌈 **渐进加载**：缩略图 + Blurhash 占位
- 🏷️ **XMP 关键词与人物区域标注**
- 🗺️ **地图浏览**：按 GPS 坐标展示照片位置
- ⚡ **增量构建**：只处理新增或修改过的照片
- 🌐 **多语言**：简体中文、繁体中文、英文、日文、韩文
- 🔗 **社交分享**：自动生成 OpenGraph 预览图和 RSS
- 🧾 **ICP / 公安备案页脚**：中国大陆网站可在配置中开启

### 本仓库新增

- 🔒 **原图私有化**：原图与 Live Photo 视频放在私有 OSS 桶，经函数计算签发 CDN URL 鉴权地址访问
- 💬 **Waline 评论**：每张照片独立的评论区，信息面板显示评论数红点；无需官方后端
- 🤖 **自动构建与发布**：OSS 触发器 → 函数计算转发 → webhook → 构建并发布到 OSS，同时更新鉴权函数
- 📈 **公开的构建状态页**：网页上查看构建进度和脱敏日志；会触发构建的接口需要 token
- 📷 **理光 GR 系列适配**：识别镜头信息、影像控制、ND 滤镜和对焦模式
- ⏱️ **快门速度显示**：1/8 秒及更快用分数，长曝光用秒，信息面板、RSS、分享图统一
- 📱 **移动端信息面板改进**：弹出键盘时评论框不被遮挡、支持下拉关闭，修复 iOS Firefox 下的若干问题
- 🚫 **默认关闭遥测**：官方版本默认加载的 VibeLoft 统计脚本在本仓库默认关闭

## 与官方仓库的差异

| 方面     | 官方仓库                              | 本仓库                                             |
| -------- | ------------------------------------- | -------------------------------------------------- |
| 部署方式 | SaaS、Docker、SSR / 后端服务、iOS App | 只维护「OSS 静态托管 + CDN」一种                   |
| 原图访问 | 存储桶公开地址                        | 私有桶 + CDN URL 鉴权，函数计算签发临时地址        |
| 评论     | 依赖官方后端（Cloud 模式）            | Waline，静态部署也能用                             |
| 发布流程 | 手动构建或官方后端管理                | 上传 OSS 后自动构建发布，附构建状态页              |
| 云服务   | 不限定                                | 阿里云 OSS、CDN、函数计算                          |
| 遥测     | 默认开启 VibeLoft 统计                | 默认关闭                                           |
| 上游更新 | —                                     | 定期合并，iOS App、SaaS 等与本方案无关的部分不维护 |

## 架构

```
手机使用app、网页使用oss后台上传图片
      │
      ▼
私有 OSS 桶（photos/）──── OSS 触发器 ────► 函数计算：oss-event-forwarder
      ▲                                              │ HTTPS + token
      │ 私有回源                                       ▼
CDN：img.example.com                        轻量服务器：webhook（pm2）
（URL 鉴权）                                          │
      ▲                                              ▼
      │ 302 跳转到带签名的地址               构建脚本 build-and-publish.sh
      │                                        ├─ 处理照片，生成 manifest 与缩略图
函数计算：photo-auth                           ├─ 构建静态站点
（media-auth.example.com）◄── 更新 manifest ──┤
      ▲                                        └─ 发布到公开 OSS 桶
      │ 查看原图                                            │
      │                                                    ▼
浏览器 ◄──────────────────────── CDN：example.com ◄── 公开 OSS 桶（静态网站托管）
      │
      └── 评论 ──► Waline（comment.example.com，服务器上的 1Panel 应用）
```

## 需要准备什么

### 阿里云资源

| 资源            | 用途                                | 说明                                                   |
| --------------- | ----------------------------------- | ------------------------------------------------------ |
| 轻量应用服务器  | 构建站点、运行 webhook 和 Waline    | 2 核 2G 即可，构建时并发数等于 CPU 核数                |
| OSS 公开桶      | 存放静态站点和缩略图                | 开启静态网站托管，默认首页和 404 页都指向 `index.html` |
| OSS 私有桶      | 存放原图                            | 与函数计算在同一地域（OSS 触发器要求）                 |
| CDN             | 主站与原图加速                      | 原图域名开启私有 Bucket 回源和 URL 鉴权（Type A）      |
| 函数计算 FC     | 原图签名函数、OSS 事件转发函数      | 签名函数建议保留 1 个常驻实例，避免冷启动              |
| 域名 + ICP 备案 | 主站、原图、签名函数、webhook、评论 | 中国大陆 CDN 与函数计算自定义域名都需要备案            |
| RAM 子账号      | 构建读写 OSS、部署函数、签发证书    | 按用途拆分，只授予最小权限                             |

一共需要 5 个子域名（均以 `example.com` 示意，部署时替换为你自己的域名）：

- `example.com`：主站（CDN → 公开桶）
- `img.example.com`：原图（CDN → 私有桶）
- `media-auth.example.com`：原图签名函数的自定义域名
- `hook.example.com`：webhook（服务器反向代理）
- `comment.example.com`：Waline 评论（服务器反向代理）

### 服务器软件

实际运行环境：Debian 12、[1Panel](https://1panel.cn)（OpenResty + Waline 应用）。

| 软件       | 版本                         |
| ---------- | ---------------------------- |
| Node.js    | 22（最低 20.19）             |
| pnpm       | 11                           |
| Perl       | 5（exiftool 需要）           |
| ossutil    | 2.x（脚本使用 2.x 命令格式） |
| 阿里云 CLI | 3.x，安装 `fc` 插件          |
| pm2        | 任意近期版本                 |

## 费用参考

以作者的相册为例（私有桶约 700MB、公开桶约 50MB，访问量很小），不含服务器和域名：

| 项目     | 月费用      | 说明                                                           |
| -------- | ----------- | -------------------------------------------------------------- |
| OSS      | 0.2 ～ 1 元 | 随照片数量增长                                                 |
| 函数计算 | 7 ～ 17 元  | 主要是签名函数的常驻实例；选最小规格即可，签名计算几乎不耗资源 |
| CDN      | 几毛钱      | 取决于访问流量                                                 |

## 开始部署

- **仓库内说明**：[deploy/aliyun-static/README.md](./deploy/aliyun-static/README.md)，包括 webhook、构建脚本、OSS 事件转发函数的配置
- **完整图文教程**：从零开始的博客教程（整理中），会覆盖 OSS、CDN、函数计算、服务器、证书、Waline 的全部配置

基本流程：

```bash
git clone https://github.com/specialhua/afilmory.git
cd afilmory
git checkout private-oss
pnpm install

cp config.example.json config.json            # 站点信息、Waline、备案
cp builder.config.default.ts builder.config.ts
# 项目根目录 .env：私有桶凭据与 PHOTO_PROXY_BASE_URL
cp deploy/aliyun-static/.env.example deploy/aliyun-static/.env   # 发布与 webhook 配置

bash deploy/aliyun-static/scripts/build-and-publish.sh           # 首次构建并发布
pm2 start deploy/aliyun-static/webhook/ecosystem.config.cjs      # 启动 webhook
```

## 目录说明

只列出和本方案相关的部分：

```
afilmory/
├── apps/web/                 # 相册前端（Vite + React），构建产物发布到公开桶
├── packages/builder/         # 照片处理流水线：读取 OSS、EXIF、缩略图、manifest
├── fc/photo-auth/            # 函数计算：原图签名
├── deploy/aliyun-static/
│   ├── oss-event-forwarder/  # 函数计算：OSS 事件转发到 webhook
│   ├── webhook/              # webhook 服务与构建状态页（pm2）
│   └── scripts/              # 构建发布脚本、函数部署脚本
├── config.example.json       # 站点配置模板
└── builder.config.default.ts # 构建配置模板
```

## 同步官方更新

```bash
git remote add upstream https://github.com/Afilmory/afilmory.git
git fetch upstream
git merge upstream/main
```

官方仓库使用 eslint 的格式规则，本仓库改为由 prettier 负责格式化。
合并时不要对官方文件整体重新格式化，否则下次合并会产生大量冲突。

## 许可证

本仓库沿用官方仓库的 **Attribution Network License (ANL) v1.0** © 2025 Afilmory Team：

- 库代码（Library Code）使用 **MIT** 许可
- 项目代码（Project Code）使用 **AGPL-3.0-or-later**，并附加界面署名要求

详见 [LICENSE](./LICENSE)。
本仓库对项目代码的修改以 git 提交历史为准。

> [!NOTE]
> 许可证第 4.1 条要求在运行界面中展示「Powered by Afilmory」署名。
> 官方演示站目前未展示该署名，本仓库暂与上游保持一致；若上游后续在界面中加入署名，本仓库将同步。

## 致谢

感谢 [Innei](https://innei.in) 和 Afilmory 团队创造了这个优秀的相册项目，也感谢所有贡献者。
本仓库的 ICP 备案页脚功能已贡献回官方仓库（[#228](https://github.com/Afilmory/afilmory/pull/228)）。

---

<p align="center">
  如果这个方案对你有帮助，欢迎给本仓库和 <a href="https://github.com/Afilmory/afilmory">官方仓库</a> 点个 ⭐️
</p>
