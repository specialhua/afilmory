# Photo Info 面板 — 信息层级重建 — Design

**Date:** 2026-08-02
**Scope:** 重建 mobile 端 Photo Detail info 面板的信息层级：新增一张 Apple Photos 式器材卡吸收高频字段，其余长尾收进 6 个带摘要值的折叠分组，并去掉 6 处重复渲染。
**Touches:** `apps/mobile/modules/photo-masonry/ios/Sheets/**`、`apps/mobile/modules/photo-masonry/ios/Detail/PhotoDetailView.swift`、`apps/mobile/src/modules/photo-viewer/photoInfoModel.ts`、`apps/mobile/src/native/photoSheets.ts`、`locales/mobile/*.json`。
**不改：** 面板的呈现形态。`PhotoDetailInspectorPresenter` 的 pan 驱动上推面板、iPad 侧栏、`PhotoSheetsModule` 的独立 sheet 全部保持现状，本设计只改这些容器里渲染的内容。

## Problem

`PhotoInfoSectionsList` 把 10 个分组平铺进一个 `List(.insetGrouped)`，满数据时最坏 **58 行 + 3 个媒体块**，而 compact 面板视口只有 `clamp(46% 屏高, 300, 520)` pt。四个结构性问题：

1. **首屏给了最无聊的数据。** 渲染顺序第一组是「基础信息」，前四行是文件名 / 格式 / 尺寸 / 文件大小。相机和镜头要滚过 12 行才看得到。
2. **同一个值散落多处。** 焦距在拍摄参数卡 + 设备信息（实际）+ 设备信息（等效）三处；光圈在拍摄参数卡 + 最大光圈 + 技术参数 APEX 值三处；快门在拍摄参数卡 + 技术参数 APEX 值两处；文件名在标题块和基础信息两处；拍摄时间与地点导航栏已经显示过；白平衡在拍摄模式和富士 recipe 各一次。
3. **分组名无法预测内容。** 「基础信息」「拍摄模式」「技术参数」三个筐，读者猜不到测光模式在哪个里。
4. **卡片套在 List 里是双层容器。** `PhotoCaptureParameterView` / `PhotoToneMetricView` 用 `.quaternary` 圆角卡，放进 `.insetGrouped` 的 cell 里是卡中卡。

补充事实（`packages/builder/src/photo/info-extractor.ts`）：`photo.title` 就是**文件名**（basename 去掉日期/views token、下划线转空格），`description` builder 产出**恒为空字符串**。所以现有标题块那行 `.title2.bold()` 大字，实际内容多数是 `DSCF4823`。

## Decisions (confirmed)

| Decision | Choice |
|---|---|
| 视觉北极星 | iOS 26 Apple Photos 的照片信息卡；字体、间距、颜色一律走系统语义值 |
| 首屏结构 | 一张统一器材卡 → 标签 → 地图 → 折叠分组表 |
| 器材卡顺序 | 机身在前、曝光在后（标题行 / 镜头行 / 规格行 / 曝光条） |
| 长尾处理 | 6 个 `DisclosureGroup`，收起时右侧显示一行摘要值 |
| 容器 | `ScrollView` + `LazyVStack` 自绘卡片，**不用 `List(.insetGrouped)`** |
| 卡片圆角 | 9pt continuous，实测对齐 Photos |
| 地图 | 占首屏（M1），不收进折叠组 |
| 曝光条 | 五格：ISO / 等效焦距 / EV / 光圈 / 快门；无第二行标签，单位后缀即标签 |
| 曝光补偿 | 常驻第 3 格，`0 ev` 也照常显示，不做「非零才显示」 |
| 焦距 | 实际与等效**合并进曝光条同一格**：`70→105 mm`；两者相等时只出一个数 |
| 色调 | 类型升为器材卡上的胶囊；直方图与四个指标留在折叠组 |
| 评分 | 镜头行右侧星标，`rating <= 0` 时不渲染 |
| 删除的字段 | APEX `ShutterSpeedValue`、APEX `ApertureValue`（各自的真值已在曝光条） |
| 折叠态生命周期 | 按分组 id 保存，跨照片滑动保持；关闭面板不重置 |
| 两个消费方 | 上推面板与独立 sheet 共用同一套渲染，差别只有 header 与底部 inset |
| Out of scope | 面板呈现形态、iPad 侧栏布局、地图交互、EXIF 抽取管线 |

## 器材卡

```
┌────────────────────────────────────────────────┐
│ FUJIFILM X-T5            [JPEG] [Classic Chrome]│  标题行
├────────────────────────────────────────────────┤
│ XF23mmF2 R WR — 23 mm ƒ2                ★★★★☆ │  镜头行
│ 40 MP • 7728 × 5152 • 4.2 MB             (高调) │  规格行
├────────────────────────────────────────────────┤
│ ISO 400 │ 35 mm │ +0.3 ev │ ƒ2 │ 1/250 s        │  曝光条
└────────────────────────────────────────────────┘
```

一张卡吸收原先散在四个分组里的 11 个字段。

### 各行组成

| 行 | 内容 | 数据来源 |
|---|---|---|
| 标题 | 机身 | `joinMakeAndModel(Make, Model)` → `photo.camera` → `photo.title` |
| 标题·徽标 1 | 格式 | `photo.format.toUpperCase()`，恒在 |
| 标题·徽标 2 | 胶片模拟 | `formatFilmMode(FujiRecipe.FilmMode)`，仅富士机身 |
| 镜头 | 镜头名（不带任何数字） | `LensMake/LensModel` → `photo.lens` |
| 镜头·右 | 评分星标 | `photo.rating`，`<= 0` 不渲染 |
| 规格 | 像素 • 尺寸 • 文件大小 | `formatMegapixels` / `width × height` / `formatFileSize` |
| 规格·右 | 色调胶囊 | `toneAnalysis.toneType` |
| 曝光条 | ISO · 焦距对 · EV · 光圈 · 快门 | `ISO` / `FocalLength`+`FocalLengthIn35mmFormat` / `ExposureCompensation` / `FNumber` / `ExposureTime` |

### 镜头行为什么不带数字

初版把实际焦距和最大光圈挂在镜头行，两个问题：

**最大光圈是第三次重复。** 恒定光圈变焦（以及任何开到最大光圈拍的照片）上，它和曝光条里的实拍光圈是同一个数；而镜头型号串本身几乎总是已经写了一遍——`TAMRON 17-70mm F/2.8 DiIII-A VC RXD — 70 mm ƒ2.8 … ƒ2.8`，同一信息出现三次。

**两个焦距是一个事实的两种单位。** 70mm 是物理焦距，105mm 是它乘 APS-C 系数；把两个无标签的 `mm` 摆在不同位置，读者必须先知道「镜头行=实际、曝光条=等效」才看得懂，不可发现。参照的 Apple 面板其实不是这个结构——它的 `主相机 — 26 mm` 与条里的 `52 mm` **都是 35mm 等效**，一个是「这颗镜头是什么」、一个是「这张用了什么」，全程一套单位，从不显示物理焦距。位置照搬了，语义搬错了。

因此：镜头行只留型号名，焦距合并进曝光条同一格 `70→105 mm`（`formatFocalPair`），两值相等或只有其一时退化为单个数字。

实测等宽未被破坏——五格宽 76.0 / 72.7 / 72.3 / 72.7 / 76.0 pt，中间三格相等，两端多出的是曝光条自身 4pt 水平内边距。`70→105 mm` 在 `.caption` 等宽数字下约 62pt，370pt 卡片五等分每格 72pt，`ISO 12800`、`1/10000 s` 也都在余量内；只有 iPhone SE 那档 288pt 卡片会略溢出，由既有的 `minimumScaleFactor(0.75)` 兜住。

副作用是好的：镜头行腾出整行宽度，型号从 `DiIII-...` 变成 `DiIII-A VC RXD B07...`。

### 视觉规格

全部走系统语义值，不出现任何字面色值或 `.system(size:)`：

| 元素 | 字体 | 颜色 |
|---|---|---|
| 机身 | `.headline` | `.primary` |
| 徽标 | `.caption2` semibold | `.secondary` on `Color(.tertiarySystemFill)`，圆角 6 |
| 胶片模拟徽标 | 同上 | 同上，但 `.strokeBorder(.quaternary)` 描边、背景透明 |
| 镜头名 | `.subheadline` | `.secondary` |
| 镜头·焦距光圈 | `.subheadline` | `.primary` |
| 规格行 | `.footnote` monospacedDigit | `.secondary` |
| 色调胶囊 | `.caption` | `.secondary`，`Capsule().strokeBorder(.quaternary)` |
| 星标 | `.caption2` | `.secondary`（卡面整体保持无彩，不用黄色） |
| 曝光条 | `.caption` monospacedDigit | `.secondary` |

标题行底色比卡体深一档，分隔线走 `Divider()`。**具体是 `.tertiarySystemFill` 叠加还是别的层级，实现时在模拟器上与 Photos 并排比对确定**——这类取值从 header 里推不出来，项目既有 spec 也是这个做法。

内边距：卡内水平 16pt；标题行垂直 9pt；镜头行与规格行间距 3pt，body 垂直 10pt；曝光条垂直 7pt。

### 为什么不用 `List(.insetGrouped)`

iOS 26 的 `.insetGrouped` 把 section 圆角写死在 **20pt**，SwiftUI 只暴露 `listSectionMargins` / `listSectionSpacing` / `listRowInsets`，**没有圆角 API**（已查 SDK `swiftinterface` 确认）。对着模拟器上真实的 Photos 面板量：两者左右边距都是 16pt、卡宽都是 370pt，唯独圆角 Photos 只有 ~7pt，差 3 倍——这是"看着别扭但说不上哪里怪"的来源。

因此容器改成 `ScrollView` + `LazyVStack`，卡片用 `RoundedRectangle(cornerRadius: 9, style: .continuous)` 自绘。校准数据（顶边逐行横向内缩，px @3x）：

```
Photos    [21, 16, 13, 11, 10,  8, 7, 6, 6, 5, 4, 3, 3, 2, 2]
Afilmory  [22, 18, 15, 13, 11, 10, 9, 8, 7, 6, 5, 4, 4, 3, 3]
```

代价：`DisclosureGroup` 脱离 `List` 之后不可用。它把 label 和 chevron 都走 tint，先是整排标题变蓝；改用 `.tint(Color(.tertiaryLabel))` 压色后更糟——**`.primary` 这类层级样式是相对当前 tint 解析的，不是绝对 label 色**，于是标题跟着变灰、chevron 反而最亮，层级完全倒置。折叠行因此改为自绘：`Button` + `.buttonStyle(.plain)`，三档颜色写死成 `Color(.label)` / `Color(.secondaryLabel)` / `Color(.tertiaryLabel)`，chevron 用 `rotationEffect` 转 90°。

### 降级

四段各自独立塌陷，骨架不变形：

| 缺失 | 行为 |
|---|---|
| 机身 | 标题回退链 `photo.camera` → `photo.title` |
| 镜头 | 整个镜头行不渲染，规格行上提 |
| 最大光圈 | 从不渲染——见下 |
| 评分 / 色调 / 胶片模拟徽标 | 各自缺失即不渲染，不占位 |
| 曝光条单值 | 该格不出现，其余重新等分（不填 `—`） |
| 曝光条五值全缺 | 整条不渲染 |
| 完全无 EXIF | 卡只剩标题行 + 规格行；`emptyMessage` 作为独立一组跟在标签之后 |

## 折叠分组

`DisclosureGroup`，收起时 label 右侧显示一行摘要值。摘要值缺失时该位留空，分组仍然出现（前提是组内至少有一行有效数据）。

| 分组 | i18n key | 摘要值 | 展开内容 |
|---|---|---|---|
| 曝光与测光 | `mobile.photoInfo.exposure` | 曝光程序 | 曝光程序 · 曝光模式 · 测光模式 · 白平衡 · 色温偏移 · WB 微调 AB · WB 微调 GM · 闪光灯 · 闪光测光 · 光源 · 场景模式 · APEX 亮度值 · 感光方式 · 焦平面分辨率 |
| 胶片模拟 | `mobile.photoInfo.filmSimulation` | 胶片模式 | 富士 recipe 14 行 |
| 色调分析 | `mobile.photoInfo.tone` | 亮度 | 亮度 · 对比度 · 阴影占比 · 高光占比 · 直方图 |
| 位置详情 | `mobile.photoInfo.locationDetail` | 海拔 | 纬度 · 经度 · 海拔 · 详细地址 |
| 图像与文件 | `mobile.photoInfo.file` | 文件名 | 文件名 · 色彩空间 · 拍摄时间 · 时区 |
| 归属与处理 | `mobile.photoInfo.attribution` | 作者 | 作者 · 版权 · 处理软件 |

「曝光与测光」= 原「拍摄模式」+「技术参数」合并，去掉两个 APEX 重复值。

组内不再使用 `.quaternary` 卡片网格——四个色调指标和原拍摄参数一样改成普通 `label / value` 行，消除卡中卡。直方图保留 `PhotoHistogramView`，高度 128 不变。

## 首屏顺序

1. 器材卡
2. 说明文字（`description` 非空时才出现，`.body`，独立一组）
3. 标签（横滑 capsule，空则整组不渲染）
4. 地图 + 地点说明行（`mapLocation` 存在时才出现；说明行为 `place · 坐标`，`place` 沿用 `buildLocationSection` 现有的「城市, 国家」拼法，两者同名时只留一个）
5. 折叠分组表
6. 无 EXIF 提示（仅 `emptyMessage` 非空时）

## 字段去向对照

现有每个字段都有明确归宿，只有两个被删。

| 现有位置 | 字段 | 去向 |
|---|---|---|
| 标题块 | title / description | 说明文字组；title 降为标题回退链末位 + 「图像与文件」文件名 |
| 基础信息 | filename / color-space / capture-time / time-zone | 图像与文件 |
| 基础信息 | format / dimensions / file-size / megapixels | 器材卡（徽标 + 规格行） |
| 基础信息 | rating | 器材卡镜头行星标 |
| 基础信息 | artist / copyright / software | 归属与处理 |
| 拍摄参数 | focal-length / aperture / shutter-speed / iso / exposure-bias | 器材卡曝光条 |
| 设备信息 | camera | 器材卡标题 |
| 设备信息 | lens / lens-make | 器材卡镜头行（lens-make 沿用现有「已包含则不重复」判断） |
| 设备信息 | focal-length + focal-length-35mm | 器材卡曝光条，合并为一格 |
| 设备信息 | max-aperture | **删除**（型号串与曝光条各已写过一次） |
| 拍摄模式 | 11 行 | 曝光与测光 |
| 富士胶片模拟 | 14 行 | 胶片模拟（FilmMode 同时升为标题徽标） |
| 位置信息 | latitude / longitude / altitude / address | 位置详情 |
| 位置信息 | place | 地图说明行 |
| 技术参数 | brightness / sensing-method / focal-plane | 曝光与测光 |
| 技术参数 | shutter-value / aperture-value | **删除**（APEX 重复值） |
| 色调分析 | toneType | 器材卡色调胶囊 |
| 色调分析 | 4 指标 + 直方图 | 色调分析 |
| tags | — | 标签组 |
| mapLocation | — | 地图 |
| emptyMessage | — | 无 EXIF 提示组 |

白平衡的去重不靠删字段：富士机身时「曝光与测光」里的 `white-balance` 行不渲染，因为 recipe 组已给出更精确的值（含色温）。

## 数据模型

### TypeScript

`PhotoInfoSheetModel` 新增 `gear`，原 `captureParameters` 被 `gear.exposure` 取代后删除：

```ts
interface PhotoInfoGear {
  model: string                     // 已完成回退链
  formatBadge: string | null
  styleBadge: string | null         // 胶片模拟
  lens: string | null
  lensSpec: string | null           // "23 mm ƒ2"
  rating: number                    // 0 表示不渲染
  specs: string[]                   // ["40 MP", "7728 × 5152", "4.2 MB"]，已过滤空值
  tone: string | null               // 色调类型
  exposure: string[]                // ["ISO 400", "35 mm", "+0.3 ev", "ƒ2", "1/250 s"]，已过滤空值
}
```

`specs` 与 `exposure` 直接给成已格式化、已过滤的字符串数组——Swift 端不做拼接也不做空值判断，`ForEach` 直接渲染。这是本设计里唯一的跨语言约定：**格式化全部留在 TS，Swift 只负责排版**。

`PhotoInfoSection` 增加 `summary: string | null`，供折叠态显示。

`PhotoInfoModel.captureParameters` 与 `buildCaptureParameters()` 一并删除——`buildPhotoInfoModel` 全仓只有 `buildPhotoInfoSheetModel` 一个调用方（已 grep 确认），顺手取消它和 `PhotoInfoModel` 的 export。

### Swift

`PhotoSheetRecords.swift` 增加 `PhotoInfoGearRecord`；`PhotoInfoSectionRecord` 增加 `@Field var summary: String?`；`PhotoInfoSheetRecord` 增加 `gear`、删除 `captureParameters`。`PhotoCaptureParameterRecord` 整体删除。

## 文件拆分

两侧都已接近或越过 500 行上限，本次顺手拆开：

| 文件 | 现状 | 之后 |
|---|---|---|
| `Sheets/PhotoInfoSheetView.swift` | 222 行，承载 sections list + inspector + 三个 row 组件 | 只留 `PhotoInfoInspectorView` 与 sheet 外壳，~90 行 |
| `Sheets/PhotoInfoGearCardView.swift` | 新增 | 器材卡四行，~140 行 |
| `Sheets/PhotoInfoSectionsList.swift` | 新增 | 首屏顺序编排 + 6 个 `DisclosureGroup`，~170 行 |
| `Sheets/PhotoInfoRowView.swift` | 新增 | `label / value` 行、标签条、地图说明行，~70 行 |
| `Sheets/PhotoInfoVisualizations.swift` | 309 行 | 不动 |
| `src/modules/photo-viewer/photoInfoModel.ts` | 631 行 | 拆出格式化函数后 ~330 行 |
| `src/modules/photo-viewer/photoInfoFormatters.ts` | 新增 | 现有 20 个 `format*` / `textValue` / `joinMakeAndModel`，~300 行 |
| `src/modules/photo-viewer/photoInfoGear.ts` | 新增 | `buildGear()`，~110 行 |

## 交互

**折叠态。** `PhotoInfoSectionsList` 持有 `@State private var expanded: Set<String>`，键是分组 id。`PhotoDetailInfoView.setInfoJSON` 换照片时只替换 `rootView` 的 `info`，SwiftUI 视图 identity 不变，`@State` 自然保留——展开过富士 recipe 的人一路滑照片都能继续看到。独立 sheet 每次 present 是新实例，从全收起开始。

**两个消费方。** `PhotoInfoInspectorView(info:showsHeader:bottomContentInset:onClose:)` 签名不变，内部换成新的 `PhotoInfoSectionsList`。sheet 传 `showsHeader: true`，上推面板传 `false` + `bottomContentInset: 82`。

**下拉关闭。** `PhotoDetailInspectorPresenter.gestureRecognizerShouldBegin` 靠 hit-test 链找 `UIScrollView` 判断是否滚到顶。`List` 依旧由 `UIScrollView` 支撑，`DisclosureGroup` 不改变这一点，逻辑原样保留。

**底部 soft edge 必须走 UIKit 接线。** 详情页工具栏是 `PhotoDetailView` 的兄弟 UIView，不在 SwiftUI 层级里，所以 `.scrollEdgeEffectStyle(.soft, for: .bottom)` 无论配不配 `contentMargins` 还是 `safeAreaBar` 都不会渲染——SwiftUI 根本不知道底下有 bar。按 `PhotoMasonryView` 顶部已有的先例走 UIKit：

```swift
scrollView.bottomEdgeEffect.style = .soft
let interaction = UIScrollEdgeElementContainerInteraction()
interaction.scrollView = scrollView
interaction.edge = .bottom
toolbar.addInteraction(interaction)
```

`PhotoDetailInfoView.installScrollEdgeEffect(under:)` 在 hosting controller 的视图树里找到第一个 `UIScrollView` 再接线，由 `PhotoDetailView.layoutSubviews` 反复调用（内部按 scroll view 身份去重），因为 SwiftUI 的 scroll view 要等首次布局后才存在。

**沉浸模式单击手势必须放行面板内的点击。** `PhotoDetailView.gestureRecognizer(_:shouldReceive:)` 原先只排除 `[navigationBar, toolbar, reactionRail]`，而 `UITapGestureRecognizer.cancelsTouchesInView` 默认为 `true` —— 面板此前是只读列表（只有滚动这一 pan 手势），所以这个洞一直没暴露；折叠分组需要点击，`infoView` 必须加进排除列表，否则每一次展开都会被沉浸手势吞掉。实测确认。

**无障碍。** 器材卡四行各自 `.accessibilityElement(children: .combine)`；曝光条整体合并成一个元素，读作「ISO 400，35 毫米，曝光补偿 +0.3，光圈 f2，快门 1/250 秒」；`DisclosureGroup` 的展开态由系统播报，摘要值并入 label。

## i18n

新增键放 `locales/mobile/en.json`（**不改 `locales/app/`** 的 `exif.*`——那套 key 被 web SPA 共用，改了会波及 `apps/web`）：

```
mobile.photoInfo.exposure
mobile.photoInfo.filmSimulation
mobile.photoInfo.tone
mobile.photoInfo.locationDetail
mobile.photoInfo.file
mobile.photoInfo.attribution
```

行级 label 继续复用现有 `exif.*` key，不新增。ESLint 会自动从其余语言剥掉英文里没有的 key，所以先落 `en.json`。

原「基础信息 / 拍摄模式 / 技术参数 / 设备信息 / 拍摄参数」五个分组标题在 mobile 端不再使用，但 `exif.*` 里的 key 保留——web 还在用。

## Testing

1. **单测** — `photoInfoGear.ts` 的 `buildGear()` 走 `node:test`（与 `photoHeaderModel.test.mjs` 同一套路），覆盖：满数据、无镜头、无最大光圈、无评分、无色调、非富士、曝光值部分缺失、完全无 EXIF 的标题回退链。
2. **静态** — `pnpm --filter mobile type-check` + ESLint 限定改动文件。
3. **构建** — `pnpm --filter @afilmory/mobile bundle`。新增 Swift 文件需要 `pod install`（podspec 的 glob 在 install 时展开成固定文件列表）。
4. **模拟器实跑** — `axe` 注入点击，`xcrun simctl io <udid> screenshot` 取图。三档数据各跑一遍：富士满数据、索尼无 GPS、无 EXIF 截图。与 Photos 同屏比对器材卡的字号、行距、标题行底色深度。
5. **行为回归** — 上推面板 pan 开合、滚到顶才能下拉关闭、展开分组后仍能下拉关闭（滚动位置在顶时）、跨照片滑动折叠态保持、独立 sheet 从全收起开始、iPad 侧栏布局未变形。
6. **VoiceOver** — 器材卡四行分别可聚焦、曝光条读作一句、折叠分组展开态播报正确。

## 遗留到实现时在模拟器上定的

1. ~~标题行底色相对卡体的深度层级。~~ 已定：标题行 `.quaternarySystemFill`，格式徽标 `.tertiarySystemFill`（两者必须差一档，否则徽标在标题行上消失）。
2. 曝光条五格在 320pt 宽（iPhone SE / 侧栏 380pt）下是否会挤——若挤，等效焦距格与 EV 格允许缩到 `.caption2`，顺序不变。
3. 机身名过长时标题行的截断点：徽标不压缩、机身名 `.truncationMode(.tail)`，需确认 `Panasonic DC-S5M2X` + 两个徽标在最窄场景下的表现。
