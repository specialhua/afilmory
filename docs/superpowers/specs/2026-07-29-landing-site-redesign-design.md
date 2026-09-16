# Afilmory 官网落地页改版（apps/site）

日期：2026-07-29  
状态：首版已落地（apps/site 可 build）  
依赖：无外部 spec；产品事实来自 monorepo 现网能力与 v0 落地页  
参考叙事结构：Kansoku `apps/site` 落地页（主张 + sticky 可交互 demo + 单一主 CTA），**不抄终端视觉**

## 目标

把 afilmory.art 从 v0 生成的「展览文案 + 静态图」营销页，换成：

1. **一句站得住的主张**（展览向，不是品类定义）
2. **主舞台：可交互的产品 demo**（网格 → 灯箱+EXIF → 创建空间）
3. **单一主转化**：创建 SaaS 空间；自建 / 文档为次要入口

落地代码迁入 monorepo 新包 `apps/site`，`v0-afilmory-landing-page` 冻结后下线主站职责。

## 非目标（首版不做）

- 完整 CMS、登录后控制台、真实账号上传进 demo
- 筛选策展章、分享/访客视角章
- 把 `apps/web` 整包 iframe 进落地页
- 绑定完整 WebGL 看图内核为关键路径（可选增强）
- 英/中以外的新语言
- 重做隐私/条款正文（可链现站或原样迁静态页）

## 定位与文案方向

### 内部定位（不直接当 slogan）

给想把自己的照片做成**线上展览**、而不是堆在网盘/朋友圈里的人。  
Afilmory 提供：专属空间、按摄影师方式看图（含 EXIF）、可分享的展览现场。

### 对外

| 角色 | 文案方向（实现时定稿进 locales，此处定方向） |
| --- | --- |
| 品类 | 线上摄影展览 / 影像馆 |
| **Hero 主张** | 展览向：照片不该埋在网盘里，该有自己的展览现场 |
| 副文 | 强调策展呈现、专属空间、几分钟可上线；不写「AI 赋能」「现代高性能」类空话 |
| 主 CTA | 创建我的空间 |
| 次链 | 文档、GitHub / 自建 |

### 明确不卖

- 不卖「又一个相册 App」
- 不卖算法推荐、社交 feed
- 不把 SaaS 和自建并排成同等主 CTA（自建可进页脚或次按钮）

## 页面叙事

| 段 | 内容 |
| --- | --- |
| S0（可选） | 极短进场，可跳过；**不做**终端开机自检 |
| S1 Hero | 主张 + 副文 + 主 CTA「创建我的空间」+ 次链；摄影暗色、大图气质 |
| S2 Live Demo | sticky 三章（见下） |
| S3 Discover（次要） | `GET /featured-galleries` 缩成一条横滑/网格，不抢 demo |
| S4 页脚 | 条款、隐私、文档、GitHub、自建入口 |

### S2 Live Demo 三章（定死）

| 章 | 访客能做什么 | 文案意图 |
| --- | --- | --- |
| 01 网格展览 | 看作品墙，点图 | 这是展览，不是文件夹列表 |
| 02 灯箱 + EXIF | 大图、基础 EXIF（机身/镜头/光圈/快门/ISO 等） | 按摄影师方式认真看 |
| 03 创建空间 | 打开创建弹层：slug 校验 → 跳转注册流 | 滚到这里就能开馆 |

- 滚动推进章节；可点章节标签 seek。
- `prefers-reduced-motion`：普通纵向分段，不绑 sticky 时间轴动画。
- Demo 数据：静态 manifest + monorepo 现有 demo 图，**零登录**。

**交互方案是产品侧主动决策**：把产品嵌成可交互 demo，而不是用 How-it-works 三步文案代替体验。实现由工程完成，章节与主路径以本文为准。

## 技术架构

### 包与栈

| 项 | 决策 |
| --- | --- |
| 路径 | `apps/site`，包名 `@afilmory/site` |
| 框架 | Astro 静态输出 + `@astrojs/react` 岛屿 |
| 样式 | monorepo Tailwind 4；暗色摄影向，**不用** kansoku 终端壳 |
| 根脚本 | `site:dev` / `site:build` / `site:preview` |

### 依赖边界

| 来源 | 用法 |
| --- | --- |
| Demo 素材 | `photos/`、`packages/data` 或构建时烘出的静态 JSON；构建期打包进 site |
| 网格 / 灯箱 | **site 内薄复刻**（React 岛屿），只做 demo 所需交互；不挂 `apps/web` 全量路由与状态机 |
| WebGL | 首版非关键；灯箱用高质量图 + EXIF 即可 |
| `@afilmory/ui` | 按需 primitives（按钮、弹层），不绑 dashboard 业务 |
| SaaS API | 与 v0 一致：`POST {API}/tenant/check-slug`、`GET {API}/featured-galleries`；环境变量 `PUBLIC_API_URL`（或等价） |

### Demo 编排

- sticky 容器高度由章节数决定；scroll progress → chapter index / chapter progress（同 kansoku LiveDemo 思路，实现可简化）。
- 章内 UI 状态（当前图、灯箱开关）可与 scroll 解耦：进入第 2 章时默认打开一张代表作。
- 第 3 章 CTA 与 Hero CTA 共用「创建空间」弹层组件。

### 创建空间弹层

从 `v0-afilmory-landing-page` 迁逻辑，行为保持：

1. slug：`/^[a-z0-9-]{3,}$/`
2. `POST /tenant/check-slug` body `{ slug }`
3. 成功则跳转 `next_url` / `nextUrl` / `redirect_url` / `redirectUrl`
4. 失败展示 API `message` 或本地校验文案

### i18n

- 首版 **zh + en**，从 v0 locales 迁并改结构：`hero` / `demo.chapters` / `createModal` / `discover` / `nav` / `footer`。
- 默认语言策略与现站一致（实现时读现网：语言开关或协商）；不得只做中文。

### 从 v0 迁入 / 废弃

| 迁入 monorepo site | 不迁 |
| --- | --- |
| 创建空间弹层逻辑 | 整页 serif 电影 Hero + manifesto 叙事结构 |
| featured galleries 请求与卡片字段 | Next 工具链、v0.app 同步工作流 |
| privacy / terms 链接或静态正文 | 与 demo 重复的 How-it-works 三步块 |

### 部署与交接

1. `pnpm site:build` 产出静态资源。
2. afilmory.art 指向 monorepo site 产物（平台跟现网：Vercel 等，实现计划里写具体命令）。
3. `v0-afilmory-landing-page`：功能冻结；切换后 README 标明主站已迁至 `Afilmory` monorepo `apps/site`。

## 模块划分（建议）

```
apps/site/
  package.json
  astro.config.mjs
  src/
    pages/
      index.astro
      privacy.astro   # 可选，或外链
      terms.astro
    components/
      Hero.astro
      LiveDemo.tsx          # React 岛屿：sticky 三章
      CreateSpaceModal.tsx
      Discover.tsx
      Nav.astro / Footer.astro
    lib/
      api.ts                # check-slug / featured-galleries
      demo-manifest.ts      # 静态 demo 数据
      i18n.ts
    styles/
      tokens.css
      demo.css
  public/
    demo/                   # 烘好的图或引用构建产物
```

## 错误处理

| 面 | 行为 |
| --- | --- |
| check-slug 网络失败 | 弹层内错误文案，不白屏 |
| featured-galleries 失败 | Discover 显示空态/错误句，不影响 Hero 与 Demo |
| demo 图缺失 | 占位或跳过该张，不阻断章节 |
| 无 `PUBLIC_API_URL` | 本地 dev 可走 mock 或 proxy；**生产构建缺少该变量则失败**（不静默指向错误主机） |

## 验收标准（首版）

1. `pnpm site:dev` 可完整滚完三章；网格可点、灯箱可开、EXIF 有字段。
2. 创建空间：合法 slug 能请求 API 并跳转；非法 slug 本地拦截。
3. 页上只有一个强主 CTA 语义（创建空间）；自建不抢主按钮。
4. 中英切换或双语文案可用（按现网策略）。
5. `prefers-reduced-motion` 下内容仍完整可达。
6. `pnpm site:build` 通过，产物可静态托管。

## 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| 复用 `apps/web` 过深导致包体积与耦合 | 强制薄复刻；禁止 import web 页面路由 |
| Demo 不像真产品 | 版式对齐 web 关键元素（网格密度、灯箱信息层级），用真 demo 图 |
| API CORS | 与现 v0 生产域名策略对齐；本地 dev proxy 写进实现计划 |
| 主张文案未定稿 | 方向已锁定展览向；实现前在 locales 里落一版可改短句，不阻塞骨架 |

## 实现顺序（概要，详细计划另文）

1. scaffold `apps/site` + 根脚本 + Tailwind
2. Hero + 布局 + i18n 骨架
3. LiveDemo 三章 + 静态 manifest
4. CreateSpaceModal + API
5. Discover 缩略条
6. 构建 / 预览 / 部署切换说明
7. 冻结 v0 README 交接

## 已拍板决策记录

| 问题 | 结论 |
| --- | --- |
| 仓库 | monorepo 新建 `apps/site`（非改 v0 仓库为主） |
| 主转化 | SaaS 创建空间 |
| 主张方向 | 展览向（网盘 vs 展览现场） |
| Demo 章节 | 网格 → 灯箱+EXIF → 创建空间 |
| 技术路径 | Astro + React 岛屿 |
| 视觉 | 摄影暗色；不抄 kansoku 终端 |
