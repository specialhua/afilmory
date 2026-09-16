# Afilmory 全局身份与 Workspace Membership 改造规格

- 状态：Implemented，核心改造与回归验证完成
- 日期：2026-07-31
- 范围：`be/packages/db`、`be/apps/core`、`be/apps/dashboard`、`apps/mobile`

## 1. 决策摘要

Afilmory 将由“每个租户各自拥有一套用户身份”改为以下模型：

1. `auth_user` 表示平台级全局身份，一个自然人只对应一个平台用户。
2. `tenant_membership` 表示用户与工作区之间的授权关系。
3. 请求解析得到的租户仅表示资源所属工作区及数据库隔离范围，不表示用户已经获得该工作区权限。
4. `auth_session.active_tenant_id` 仅表示用户当前选中的工作区，用于导航和默认展示；任何授权决策均不得依赖该字段。
5. 平台角色与工作区角色完全分离：
   - 平台角色：`user | superadmin`
   - 工作区角色：`member | admin | owner`
6. Explorer 浏览保持公开；评论、反应、订阅等社交操作要求全局登录，但不要求成为目标工作区成员；上传、设置、账单和删除等管理操作要求目标工作区 Membership。
7. 旧租户会话在迁移时全部失效，用户必须重新登录。旧会话不得直接升级为全局会话。

该方案与 Slack 类产品的身份边界相同：账号属于平台，工作区权限属于 Membership；但 Afilmory 的公开 Gallery 与跨 Gallery 社交能力是本项目自己的领域规则。

## 2. 背景与当前问题

当前数据模型把 `tenant_id` 同时放在 `auth_user`、`auth_account` 和 `auth_session` 上，并通过 Better Auth 的租户感知 Adapter 将用户、OAuth Account 和 Session 全部限制在当前租户内。因此：

- 同一邮箱或同一 OAuth Provider Account 可以在不同租户产生多个 `auth_user`。
- 一个 Session 只能代表一个租户身份。
- `AuthGuard` 将 Session 租户与请求租户直接比较。
- 移动端用户登录工作区 A 后，向 Gallery B 发送评论或未来执行订阅时，会在业务逻辑执行前被拒绝。
- `role = admin` 同时承担平台身份属性与租户权限属性，无法表达“同一用户在 A 是 owner、在 B 是 member”。
- 删除租户会删除该租户的 `auth_user`，这与跨工作区全局身份不兼容。
- 账单、站点作者、评论通知等逻辑通过 `auth_user.tenant_id` 反查租户，均隐含了“一名用户只属于一个租户”的假设。

问题不在于租户数据隔离本身。资源数据继续严格按租户隔离是正确的；需要移除的是“身份也只能属于一个租户”的限制。

## 3. 术语

| 术语               | 定义                                                                   |
| ------------------ | ---------------------------------------------------------------------- |
| Platform User      | 平台级全局身份，对应 `auth_user`                                       |
| Workspace          | 产品层的工作区；当前内部实现继续对应 `tenant`                          |
| Membership         | Platform User 在某个 Workspace 中的角色与状态                          |
| Resource Workspace | 当前请求所访问资源所属的 Workspace，由 Host、Domain 或明确路由参数解析 |
| Active Workspace   | Session 中用于导航的当前选择，不具备授权意义                           |
| Platform Role      | 平台级权限，仅包含普通用户和平台超级管理员                             |
| Workspace Role     | 工作区内权限，包含 member、admin 和 owner                              |
| Social Action      | 以全局身份对公开 Gallery 执行的评论、反应、订阅等操作                  |

## 4. 目标与非目标

### 4.1 目标

- 一个账号可拥有、加入并切换多个工作区。
- 同一全局登录态可以浏览和参与不同 Gallery 的公开社交功能。
- 工作区管理权限始终由目标工作区 Membership 决定。
- 保持所有租户资源表的租户隔离，不扩大任何数据读取范围。
- 为后续 Gallery 订阅、上传通知与全局设备 Push Token 提供稳定身份基础。
- 通过行为测试覆盖跨租户授权的允许与拒绝边界。

### 4.2 非目标

- 本次不实现邀请、成员管理 UI、所有权转让及组织目录。
- 本次不实现 Gallery 订阅和 Push Notification 本身；仅保证其所需身份边界成立。
- 本次不将内部所有 `tenant` 命名机械替换为 `workspace`。资源隔离层继续使用 tenant，产品和 API 身份层使用 workspace。
- 本次不允许通过邮箱相同自动加入已有工作区。
- 本次不提供旧租户身份模型的兼容开关或双写路径。应用尚未发布，迁移完成后只保留新模型。

## 5. 不可破坏的安全不变量

每个受保护请求必须按以下顺序处理：

```mermaid
flowchart LR
  A["Authenticate global actor"] --> B["Resolve resource workspace"]
  B --> C["Apply tenant data scope"]
  C --> D["Authorize action policy"]
  D --> E["Execute domain operation"]
```

具体不变量如下：

1. `resourceWorkspaceId` 只能来自可信的 Tenant Resolver，不得从 Session 的 active workspace 推导。
2. `activeTenantId` 只能用于默认导航和客户端选择，禁止用于判断用户是否有权访问资源。
3. Workspace 管理权限必须同时满足：
   - 存在 `(userId, resourceWorkspaceId)` Membership；
   - Membership 状态为 `active`；
   - Membership 角色满足路由要求。
4. Social Action 只要求有效全局 Session，不得因为 Session active workspace 与目标 Gallery 不同而拒绝。
5. Platform `superadmin` 不自动成为所有工作区成员。只有明确标注 Platform Policy 的路由才能启用超级管理员数据库旁路。
6. 匿名公开请求和跨 Gallery 社交请求仍在 Resource Workspace 的数据库隔离上下文中执行。
7. Workspace URL、Slug、公开 Gallery 可见性或邮箱相同均不能创建 Membership。
8. 删除 Workspace 不删除 Platform User；仅删除 Workspace 资源和 Membership，并将引用该 Workspace 的 active workspace 置空。
9. 合并历史账号时，仅允许以下证据建立身份连通关系：
   - 完全相同的受信 OAuth `(provider_id, account_id)`；
   - 同一规范化邮箱组中的所有账号均已验证邮箱，且每个账号都只绑定当前系统支持的 GitHub/Google OAuth，不含 Credential 或未知 Provider。
     仅邮箱相同、未验证邮箱或包含密码凭据均不足以证明是同一自然人。

## 6. 目标数据模型

```mermaid
erDiagram
  AUTH_USER ||--o{ AUTH_ACCOUNT : owns
  AUTH_USER ||--o{ AUTH_SESSION : opens
  AUTH_USER ||--o{ TENANT_MEMBERSHIP : has
  TENANT ||--o{ TENANT_MEMBERSHIP : grants
  TENANT ||--o{ PHOTO_ASSET : scopes
  AUTH_USER ||--o{ COMMENT : writes
  TENANT ||--o{ COMMENT : contains
  TENANT o|--o{ AUTH_SESSION : selected_as_active

  AUTH_USER {
    text id PK
    text email UK
    platform_role role
  }
  AUTH_ACCOUNT {
    text id PK
    text user_id FK
    text provider_id
    text account_id
  }
  AUTH_SESSION {
    text id PK
    text user_id FK
    text active_tenant_id FK
  }
  TENANT_MEMBERSHIP {
    text id PK
    text tenant_id FK
    text user_id FK
    membership_role role
    membership_status status
  }
```

### 6.1 `auth_user`

| 字段         | 约束与语义                                                      |
| ------------ | --------------------------------------------------------------- |
| `id`         | 全局用户 ID，保持现有主键类型                                   |
| `email`      | 规范化为 `trim + lower`；建立 `lower(trim(email))` 全局唯一索引 |
| `role`       | `platform_role = user \| superadmin`                            |
| 其他资料字段 | 名称、头像、封禁、Trial 与 Creem Customer 继续属于全局用户      |

移除 `tenant_id`。`admin` 不再是合法 Platform Role。

### 6.2 `auth_account`

- 移除 `tenant_id`。
- `(provider_id, account_id)` 全局唯一。
- OAuth Account 绑定属于全局用户，不属于某个 Workspace。
- Credential Account 同样只属于全局用户。

### 6.3 `auth_session`

- 将租户字段改为 `active_tenant_id`。
- `active_tenant_id` 可空，并在 Workspace 删除时 `SET NULL`。
- Session 的有效性只证明 Platform User 身份；它不证明任何 Workspace 权限。

### 6.4 `tenant_membership`

| 字段                       | 约束与语义                           |
| -------------------------- | ------------------------------------ |
| `id`                       | 主键                                 |
| `tenant_id`                | Workspace；删除 Workspace 时级联删除 |
| `user_id`                  | Platform User；删除账号时级联删除    |
| `role`                     | `owner \| admin \| member`           |
| `status`                   | `active \| suspended`                |
| `created_at`, `updated_at` | 审计字段                             |

约束：

- `(tenant_id, user_id)` 唯一。
- 每个 Workspace 至少存在一个 active owner。
- 当前版本每个 Workspace 只允许一个 active owner；所有权转让必须在单个事务中完成。

### 6.5 账单归属

`creem_subscription` 增加可空的 `tenant_id`：

- 新 Checkout 必须携带 `tenantId` metadata。
- Webhook 持久化后必须按 Creem Subscription ID 将 `tenant_id` 写回。
- 查询 Workspace 订阅状态必须按 `tenant_id + product_id`，禁止再通过“该 Workspace 的任意用户 ID”反推订阅。
- 历史记录可在迁移时由旧 `auth_user.tenant_id` 回填；无法确定者保持空值，不参与 Workspace 权益判断。

## 7. 角色与权限

### 7.1 角色继承

| 作用域    | 角色         | 包含权限                                |
| --------- | ------------ | --------------------------------------- |
| Platform  | `user`       | 登录、全局资料、公开社交行为            |
| Platform  | `superadmin` | 平台运维路由；不隐式继承 Workspace 权限 |
| Workspace | `member`     | 需要成员身份的普通能力                  |
| Workspace | `admin`      | `member` + 内容与配置管理               |
| Workspace | `owner`      | `admin` + 账单、删除、所有权相关能力    |

当前管理路由的迁移规则：

- 原 `@Roles('user')` 社交路由改为 `@RequireAuth()`。
- 原租户内 `@Roles('admin')` 改为 `@TenantRoles('admin')`，owner 自动满足。
- Workspace 删除、账单变更应提升为 `@TenantRoles('owner')`。
- 原 `@Roles('superadmin')` 改为 `@PlatformRoles('superadmin')`。

### 7.2 路由策略矩阵

| 路由类别         | 登录 | Membership         | 数据作用域            | 示例                           |
| ---------------- | ---- | ------------------ | --------------------- | ------------------------------ |
| Public           | 否   | 否                 | Resource Workspace    | Gallery、照片、已批准评论      |
| Social           | 是   | 否                 | Resource Workspace    | 新建评论、反应、未来订阅       |
| Workspace member | 是   | active member+     | Resource Workspace    | 未来成员能力                   |
| Workspace admin  | 是   | active admin/owner | Resource Workspace    | 上传、同步、站点设置、评论审核 |
| Workspace owner  | 是   | active owner       | Resource Workspace    | 账单、删除 Workspace           |
| Platform admin   | 是   | 否                 | 显式 Superadmin Scope | 平台设置、租户运维             |

## 8. 服务端授权组件

废除含混的单一 `@Roles()` 语义，拆分为三种元数据：

```ts
@RequireAuth()
@TenantRoles('member' | 'admin' | 'owner')
@PlatformRoles('superadmin')
```

全局 Guard 的职责：

1. Tenant Context Guard：只验证需要 Tenant 的路由是否成功解析 Resource Workspace，并处理 Placeholder 规则；不比较 Session tenant。
2. Authorization Guard：
   - `@RequireAuth()`：验证全局 Session；
   - `@TenantRoles()`：读取 Resource Workspace，查询 active Membership 并判断角色；
   - `@PlatformRoles()`：验证 Platform Role，并只在此分支显式启用数据库 superadmin scope。
3. Database Context Middleware：无论用户属于哪个 Workspace，始终以 Resource Workspace 建立事务隔离上下文。

## 9. Session 与 Workspace API

### 9.1 Session 投影

`GET /auth/session` 返回：

```ts
interface AuthSessionProjection {
  user: PlatformUser
  session: {
    id: string
    activeTenantId: string | null
    expiresAt: string
  }
  activeWorkspace: WorkspaceSummary | null
  requestedWorkspace: WorkspaceSummary | null
  requestedMembership: MembershipSummary | null
  memberships: Array<{
    role: 'owner' | 'admin' | 'member'
    status: 'active' | 'suspended'
    workspace: WorkspaceSummary
  }>
}
```

- API/Mobile Broker Host 没有 Resource Workspace，此时 `requestedWorkspace = null`。
- Workspace Host 上的 `requestedWorkspace` 表示当前 Host 对应 Workspace，即使用户不是成员也可返回公开摘要。
- `requestedMembership = null` 明确表示用户没有管理该 Workspace 的权限。

### 9.2 列表与切换

- `GET /auth/workspaces`：返回当前用户的 active Membership 列表。
- `POST /auth/workspaces/switch`，Body 为 `{ tenantId: string }`：
  1. 验证当前全局 Session；
  2. 验证目标 active Membership；
  3. 更新当前 Session 的 `active_tenant_id`；
  4. 返回更新后的 active workspace。

切换操作只改变导航状态，不改变权限集合，也不影响当前请求的 Resource Workspace。

## 10. 认证与注册流程

### 10.1 OAuth 与邮箱登录

- Better Auth 使用普通全局 Drizzle Adapter。
- Better Auth Admin 插件必须在 `roles` 中显式注册 `user` 与 `superadmin`，其中 `superadmin` 复用完整 Admin Access Control；仅设置 `adminRoles` 不足以注册自定义角色。
- 删除 Tenant-aware Adapter 与 Mobile Broker 的重复账号选择逻辑。
- OAuth callback 仍可保留 Tenant Slug State，用于回到发起登录的 Host；该 State 不参与身份匹配和授权。
- Mobile Broker 可创建或登录全局身份。没有 Membership 的用户仍可使用 Explorer 和 Social Action，但 `activeWorkspace = null`。
- OAuth Account 绑定与解绑属于全局身份操作，只要求 `@RequireAuth()`。

### 10.2 创建 Workspace

已登录用户创建 Workspace：

1. 创建 Tenant；
2. 创建 `(userId, tenantId, owner, active)` Membership；
3. 初始化设置；
4. 将当前 Session 的 active workspace 更新为新 Tenant；
5. 返回 Workspace 摘要。

用户可以重复执行此流程以拥有多个 Workspace。

新账号与 Workspace 一次性注册：

1. 创建全局用户；
2. 创建 Tenant；
3. 创建 owner Membership；
4. 任一步失败时回滚本次创建的 Tenant/Membership；不得删除既有全局用户。

### 10.3 已存在 Workspace

- 不允许仅凭邮箱注册或访问 Workspace URL 自动创建 Membership。
- 已有全局账号必须通过未来的 Invite/Member Management 流程加入 Workspace。
- 当前版本中，除 Workspace 创建和历史迁移外，不提供普通成员创建入口。

## 11. 跨 Gallery 社交与未来订阅

评论与反应流程：

```mermaid
sequenceDiagram
  participant U as "Global user"
  participant A as "Gallery A session"
  participant B as "Gallery B API"
  participant DB as "Tenant-scoped DB"
  U->>A: "Authenticate once"
  A->>B: "POST social action with global session"
  B->>B: "Resolve Gallery B as resource workspace"
  B->>B: "Require global auth only"
  B->>DB: "Write under Gallery B tenant scope"
  DB-->>B: "Record author as global user ID"
  B-->>U: "Success"
```

未来订阅应优先建模为 Gallery Subscription，而不是含混的“用户订阅”：

```ts
gallery_subscription {
  subscriberUserId: string
  tenantId: string
}
```

原因是一个 Platform User 可以拥有多个 Workspace，而 Explorer 中被浏览和更新的实际发布单元是 Gallery/Workspace。上传事件以 `tenantId` 为主体，向订阅该 Gallery 的全局用户设备发送通知。若未来需要“关注创作者的全部 Gallery”，应作为另一种显式关系，不与 Gallery Subscription 混用。

Push Device Token 应绑定 `auth_user.id`，而不是 Tenant 或 Membership。

## 12. 历史数据迁移

迁移采用单向 Forward Migration，不保留双写或兼容模式。

### 12.1 自动合并规则

1. 根据完全相同的非 Credential OAuth `(provider_id, account_id)` 建立身份连通边。
2. 对同一规范化邮箱建立受限桥接边，但必须同时满足：
   - 该邮箱组内所有旧用户的 `email_verified = true`；
   - 每个旧用户至少拥有一个 GitHub 或 Google OAuth Account；
   - 每个旧用户均不含 Credential Account 或未知 Provider Account。
3. 基于上述边计算身份连通分量，并为每个分量选择一个 canonical user：
   - `superadmin` 优先；
   - 已验证邮箱优先；
   - 较早创建者优先；
   - ID 作为最终稳定排序。
4. 在删除重复用户前：
   - 仅当某个 `(tenant_id, canonical_user)` 分组至少包含一条旧 `admin` 或 `superadmin` 记录时，才创建 Membership；
   - 旧 `role=user` 仅表示该全局身份曾在目标 Gallery 完成认证，不构成 Workspace 授权证据；
   - 重写 Comment 与 Comment Reaction 的 `user_id`；
   - 去重可能冲突的 Reaction；
   - 合并 OAuth Account，按 `updated_at` 保留最新 Token；
   - 汇总 `had_trial`、`superadmin` 与封禁状态；任何永久封禁都按永久封禁保留；
   - 回填可确定的 `creem_subscription.tenant_id`。
5. 每个 Tenant 只从旧 admin/superadmin 集合中选择最早账号作为 owner，其余旧 admin 迁移为 admin。
6. active Tenant 若无法从旧 admin/superadmin 生成 owner，迁移必须失败关闭并进入人工审计；不得将普通 `user` 或社交登录身份自动提升为 owner。

### 12.2 冲突即中止

迁移必须在以下情况抛出错误并整体回滚：

- 精确 OAuth 与受限已验证邮箱桥接完成后，仍存在相同规范化邮箱对应多个 canonical user；
- 同一 `(provider_id, account_id)` 无法确定唯一 canonical user；
- 任一 active Tenant 无法生成 owner；
- 重写后仍存在 Account 或 Reaction 唯一键冲突；
- 外键引用无法重写。

特别地，即使两个 Credential 用户的邮箱均被标记为已验证，也不得据此自动合并；未知 Provider 同样不得进入邮箱桥接。密码凭据或 Provider 信任边界不同会产生账号接管风险，必须中止迁移并人工审计。

### 12.3 Session 处理

迁移删除所有旧 `auth_session`。原因是旧 Cookie 的安全边界是单租户，将其无提示升级为全局 Session 会扩大原会话权限语义。重新登录后，新 Session 按以下顺序选择初始 active workspace：

1. 登录请求所在 Resource Workspace 且用户有 active Membership；
2. 用户最近更新的 active Membership；
3. `null`。

### 12.4 Cookie 边界与命名空间轮换

数据库中的 Session 继续表示全局身份，但浏览器 Cookie 必须以具体 Host 为安全边界：

- Cookie 命名空间从原来的 `afilmory-global` 轮换为 `afilmory-tenant`，防止浏览器遗留的 parent-domain Cookie 与新 host-only Cookie 同名并产生解析歧义；
- 平台 `baseDomain`、每个 Workspace 子域、OAuth/Mobile Broker 子域、Localhost 以及 Custom Domain 均只签发 host-only Cookie，不设置 `Domain` 属性；
- 生产 Cookie 保持 `HttpOnly`、`Secure` 与 `SameSite=Lax`；
- 全局 Platform User 与 host-only Cookie 不冲突：不同 Host 的 Session 可以指向同一个 Global User，但浏览器不会自动向兄弟租户发送凭据；
- 切换 Workspace 不得依赖 parent-domain Cookie。目标 Host 已有 Session 时可直接使用，否则必须重新认证；未来若要求无感单点登录，应通过 Platform Auth Broker 的短时一次性交换码完成；
- 迁移到新命名空间时必须删除既有 `auth_session`，使旧全域 Cookie 中的 bearer token 立即失效，而不是仅依赖浏览器自然过期。

Host-only Cookie 可缩小凭据的被动暴露范围并阻止兄弟子域直接覆盖该 Cookie，但它不能替代服务端授权、Origin/CSRF 防护或安全的内容隔离策略。

### 12.5 已发布迁移的前向权限修复

0015 首次部署版本曾错误地把所有旧 `auth_user.tenant_id` 关系转换为 Membership，并在没有旧管理员时把最早的普通用户提升为 owner。该问题不得通过运行时兼容逻辑掩盖，必须由 0016 执行一次性、可审计的前向修复。

对 `2026-07-31T15:08:20.893Z` 迁移前生产备份进行隔离恢复并按 0015 的身份连通算法重建授权证据后，结果如下：

| 审计项                                           | 数量 |
| ------------------------------------------------ | ---: |
| 旧 `(tenant, canonical user)` 关系               |  663 |
| 有旧 admin/superadmin 证据的合法授权             |  553 |
| 仅有旧 `user` 的非授权关系                       |  110 |
| 被错误创建为 member                              |   83 |
| 被错误兜底提升为 owner                           |   27 |
| 生产中缺失的合法 owner/admin 授权                |    0 |
| 异常 owner 所属 pending Tenant                   |   26 |
| 异常 owner 所属 active Tenant                    |    1 |
| 异常 owner Tenant 的 Session/照片/配置/域名/订阅 |    0 |

0016 必须按以下顺序执行：

1. 识别 0015 生成的全部 `m_<md5>` member，以及备份审计确认的 27 个错误 owner 精确 `(tenant_id, user_id)` 对；
2. 对 active workspace 指向待撤销 Membership 的 Session，优先重定位到该用户仍然拥有的 active owner/admin，其次为显式创建的 member；无剩余 Membership 时置为 `null`；
3. 删除待撤销 Membership，不删除 Global User、OAuth Account、评论或 Reaction；
4. 若撤销错误 owner 后某个 active Tenant 不再有 owner，则将其恢复为 `pending`；
5. 在同一事务内验证：不存在残留的迁移生成 member、每个非空 active Session 都有匹配的 active Membership、每个 active Tenant 都有 active owner；任一不变量失败则整体回滚。

0015 同时修正为干净重放语义，避免从迁移前备份恢复时再次生成普通用户 Membership；生产数据库依靠 0016 修复既有状态，不重跑历史数据变换。

## 13. Workspace 删除语义

删除 Workspace 必须要求 owner Membership；Platform Superadmin 使用独立平台运维路由。

删除顺序：

1. 删除外部托管存储；
2. 删除 Tenant-scoped 资源；
3. 删除该 Tenant 的 Membership；
4. 将相关 Session `active_tenant_id` 置空；
5. 删除 Tenant；
6. 保留 Platform User、Auth Account、其他 Membership、其他 Session 与用户在其他 Gallery 的评论。

评论属于目标 Gallery，删除该 Gallery 时可级联删除；用户在其他 Gallery 的评论不得受影响。

## 14. 客户端行为

### 14.1 Mobile

- Auth Store 保存完整 Membership 列表与 `activeWorkspace`。
- Tenant API Client 只使用用户显式选择的 active workspace slug。
- Gallery API Client 继续根据 Explorer 目标 Gallery slug 请求平台管理的 Gallery Host。Native Client 显式保存并附加 Broker Session，不依赖浏览器的跨子域 Cookie 规则，且不得向任意 Custom Domain 转发该凭据。
- 用户没有 Workspace 时，Explorer 与社交能力可用；Own Gallery、Studio 和上传入口显示“创建或选择 Workspace”。
- Workspace 切换必须先调用服务端 switch API，成功后再更新本地 active slug。

### 14.2 Dashboard

- Dashboard 以当前 Host 的 `requestedWorkspace` 为资源工作区。
- 进入管理页面时检查 `requestedMembership` 或权限端点，而不是将用户强制重定向到 Session active workspace。
- Workspace Selector 跳转到目标 Workspace Host；目标 Host 已有独立 Session 时直接进入，否则进入该 Host 的登录流程。不得把来源 Host 的 Cookie 转交给目标 Host。
- Platform Superadmin 页面只依赖 Platform Role。

### 14.3 公开资料链接

在独立 Platform Profile 尚未实现前，评论作者的公开站点链接按其最早创建的 active owner Membership 选择，并以 Workspace ID 和已验证域名创建时间作为稳定排序。该规则只提供确定性展示，不构成“主工作区”授权语义，也不得读取 Session active workspace。

## 15. 实现阶段

| 阶段 | 内容                        | 完成标准                                                    |
| ---- | --------------------------- | ----------------------------------------------------------- |
| A    | Schema 与 Forward Migration | 新表、枚举、唯一键、冲突检查、旧 Session 失效               |
| B    | 全局 Auth Provider          | 普通 Adapter、全局 Account、active workspace Session        |
| C    | 授权 Guard                  | 三类 Decorator、Membership 校验、显式 superadmin scope      |
| D    | 注册与生命周期              | 多 Workspace 创建、Root Membership、删除保留全局用户        |
| E    | 领域查询迁移                | 作者、评论、通知、Featured、Billing 改用 Membership         |
| F    | Client Session              | Dashboard 与 Mobile 使用新 Session Projection 和 switch API |
| G    | 安全回归验证                | 行为测试、类型检查、构建、迁移静态审计                      |

## 16. 验收与回归测试矩阵

### 16.1 授权行为

| 场景                                               | 预期                                                     |
| -------------------------------------------------- | -------------------------------------------------------- |
| 匿名浏览 Gallery B                                 | 允许，只能读取公开数据                                   |
| A 的 owner 浏览 Gallery B                          | 允许，不产生 B Membership                                |
| A 的 owner 在 B 评论/反应                          | 允许，作者为同一 global user                             |
| A 的 owner读取 B 管理 API                          | 403                                                      |
| 同一用户是 A owner、B admin                        | A owner API 允许；B admin API 允许；B owner-only API 403 |
| suspended Membership 访问管理 API                  | 403                                                      |
| active workspace=A，但请求 B 且拥有 B Membership   | 按 B Membership 授权，与 active workspace 无关           |
| active workspace=A，请求 B 且无 B Membership       | Public/Social 按策略允许；管理 API 403                   |
| 普通用户访问 Platform API                          | 403                                                      |
| superadmin 访问 Platform API                       | 允许并显式启用 superadmin DB scope                       |
| superadmin 无 Membership 访问普通 Tenant Admin API | 403                                                      |

### 16.2 生命周期

| 场景                                                   | 预期                                                               |
| ------------------------------------------------------ | ------------------------------------------------------------------ |
| 用户创建第二个 Workspace                               | 保留原 Membership，新 Workspace 为 owner，可切换                   |
| 删除一个 Workspace                                     | 用户和其他 Workspace 不受影响，active workspace 被置空或重新选择   |
| Mobile Broker 登录无 Membership 用户                   | 登录成功，Explorer 可用，active workspace 为空                     |
| 相同 OAuth Account 历史重复用户                        | 安全合并，评论与 Membership 保留                                   |
| 已验证同邮箱且全部为 GitHub/Google OAuth-only 历史用户 | 安全合并，保留全部不同 OAuth Account 与去重后的 Membership         |
| 同邮箱但包含 Credential、未验证邮箱或未知 Provider     | 迁移中止，不自动合并                                               |
| 使用 Workspace URL 尝试注册到已有 Workspace            | 不创建 Membership                                                  |
| 旧普通用户仅在其他 Gallery 登录/评论                   | 合并为 Global User，但不创建目标 Gallery Membership                |
| 已发布 0015 错误 member 的 Session                     | 重定位到合法 Workspace；无合法 Membership 时 active workspace 为空 |
| 已发布 0015 错误 owner 且无其他 owner                  | 撤销 Membership；active Tenant 回到 pending                        |

### 16.3 验证命令

- PostgreSQL 迁移与鉴权集成验证：

  ```bash
  AFILMORY_MIGRATION_TEST_DATABASE_URL=postgresql://postgres:password@127.0.0.1:55439/postgres \
    pnpm --filter @afilmory/core test:global-identity-migration
  ```

  该命令只接受 `localhost`、`127.0.0.1` 或 `::1`，为每个场景创建独立临时数据库，并在结束时强制删除。它通过正式的 `drizzle-orm/node-postgres/migrator` 执行 0015 与 0016，重建首次发布 0015 的错误授权状态，并验证前向撤权、Session 重定位、Migration Journal 与事务回滚边界。

- Core 定向 Vitest：授权策略、Membership、Session 切换、注册与删除。
- `pnpm --filter @afilmory/core build`
- `pnpm --filter @afilmory/dashboard type-check`（若包脚本存在）
- `pnpm --filter web type-check`
- Mobile TypeScript 检查与现有测试。
- 在空数据库执行全部 Migration。
- 在包含跨租户重复 OAuth 用户，以及生产同型“已验证同邮箱、不同 OAuth Account ID”的构造数据库执行迁移并核对审计结果。
- 在包含不安全重复邮箱的构造数据库验证 Migration 整体回滚。

当前数据库集成矩阵覆盖：

- 多租户重复 OAuth 身份、受限已验证邮箱桥接与跨 Provider 传递式身份连通分量；
- canonical user 选择、最新 OAuth Token、Credential Account、封禁与 Trial 状态归并；
- Comment、Reaction、Subscription 的重键、去重与 Workspace 归属；
- Session 全量失效、全局邮箱及 Provider Account 唯一约束；
- 仅 admin/superadmin 继承 Membership、普通社交身份不继承授权、已发布错误 member/owner 的前向撤权、suspended Membership、Platform Superadmin 隔离及跨 Workspace Social Action；
- active workspace 切换、错误 Session 所有者、无 Membership 与 Workspace 删除后的 `SET NULL`/`CASCADE`；
- 已验证 Credential 同邮箱、未知 Provider 同邮箱、Creem Customer、Credential Account 和无 Owner 活跃 Workspace 冲突的事务级失败关闭。

## 17. 完成定义

只有同时满足以下条件，改造才视为完成：

1. `auth_user`、`auth_account` 不再包含 Tenant 身份所有权。
2. 所有 Workspace 管理路由均由 Membership 授权。
3. Cross-Gallery Social Action 可在单一全局 Session 下工作。
4. Tenant 删除不会删除全局账号。
5. Mobile 与 Dashboard 均能读取 Membership，并能显式切换 active workspace。
6. 授权矩阵中的允许与拒绝路径均有行为测试。
7. Migration 对不安全账号合并采取 fail-closed 行为。
8. 全部定向测试、类型检查和构建通过；任何既有失败必须明确证明与本改造无关。
