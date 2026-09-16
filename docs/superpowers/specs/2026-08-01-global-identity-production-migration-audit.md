# Global Identity / Workspace Membership 生产迁移审计

- 日期：2026-08-01
- 范围：0015 已发布权限数据、0016 前向撤权迁移、Session active workspace 重定位
- 结论：0015 首次发布版本扩大了 110 条 Workspace 权限；0016 已在本地构造数据库与隔离生产副本中验证，可完整撤销错误授权且保留全部 553 条可证明的合法授权

## 1. 安全边界

审计期间未向生产数据库执行写入。使用两个独立临时 PostgreSQL 容器：

| 容器用途        | 数据来源                                   | 网络 | 持久卷 | 写入生产 |
| --------------- | ------------------------------------------ | ---- | ------ | -------- |
| 迁移前授权重建  | `2026-07-31T15-08-20-893Z.sql.gz` 生产备份 | 禁用 | 无     | 否       |
| 0016 部署前演练 | 当前生产 PostgreSQL 的只读 `pg_dump`       | 禁用 | 无     | 否       |

备份下载凭据仅在 Dokploy 容器内部传递给对象存储客户端，未写入仓库、审计输出或临时文件。临时数据库使用独立账号，不挂载生产卷。

## 2. 迁移前授权证据重建

身份合并严格复用 0015 的规则：

1. 完全相同的非 Credential `(provider_id, account_id)` 建立身份边；
2. 仅对全部已验证且仅含 GitHub/Google OAuth 的规范化邮箱组建立受限桥接边；
3. 计算连通分量，并按 superadmin、邮箱验证、创建时间、ID 选择 canonical user；
4. 以旧 `(tenant_id, canonical_user_id)` 分组；仅包含旧 `admin`/`superadmin` 的分组构成 Workspace 授权证据。

重建结果：

| 项目                                | 数量 |
| ----------------------------------- | ---: |
| 旧 `auth_user`                      |  666 |
| 旧 `(tenant, canonical user)` 关系  |  663 |
| 涉及 Tenant                         |  580 |
| 可证明的 admin/superadmin 授权      |  553 |
| 仅有旧 `role=user` 的非授权关系     |  110 |
| 无任何旧 admin/superadmin 的 Tenant |   27 |

## 3. 与已迁移生产数据逐项比对

对 553 条授权证据与当前生产 active owner/admin `(tenant_id, user_id)` 进行集合比较：

| 集合差异                   | 数量 |
| -------------------------- | ---: |
| 生产中存在且有旧管理员证据 |  553 |
| 旧管理员证据存在但生产缺失 |    0 |
| 生产存在但无旧管理员证据   |   27 |
| 0015 生成的错误 member     |   83 |

110 条非授权关系被首次发布的 0015 全部错误转换为 Membership：83 条保持 member，27 条因 Tenant 缺少旧管理员而被兜底提升为 owner。

27 个错误 owner Tenant 的业务状态：

| 状态或资源            | 数量 |
| --------------------- | ---: |
| pending Tenant        |   26 |
| active Tenant         |    1 |
| active Session        |    0 |
| 包含照片的 Tenant     |    0 |
| 包含站点配置的 Tenant |    0 |
| 包含域名的 Tenant     |    0 |
| 包含订阅的 Tenant     |    0 |

因此，撤销 27 条 owner 不会删除业务数据；唯一 active Tenant 在失去错误 owner 后应恢复为 pending。

## 4. 0016 前向修复行为

0016 在同一事务中执行：

1. 收集全部 0015 生成的 `m_<md5>` member，以及备份审计确认的 27 个错误 owner；
2. 将受影响 Session 重定位到仍然有效的 owner/admin 或显式 member；无有效 Membership 时置空；
3. 删除 110 条错误 Membership；
4. 将撤权后 ownerless 的 active Tenant 恢复为 pending；
5. 校验 Session-Membership、active Tenant-owner 及迁移 member 清零不变量；失败时整体回滚。

0015 的仓库版本同时修正为干净重放语义，确保从迁移前数据重新执行时普通 `user` 不再产生 Membership。生产数据库不重跑 0015，只由 0016 执行前向修复。

## 5. 本地构造数据库验证

验证脚本使用真实 PostgreSQL 与正式 `drizzle-orm/node-postgres/migrator`，覆盖：

- 普通用户在多个 Gallery 的登录、评论与反应，不产生 Membership；
- 同一 global user 同时拥有合法 owner 与错误 member 时，Session 回到合法 owner；
- 纯社交用户只有错误 member 时，Session active workspace 置空；
- 显式 post-migration member 被保留，并可作为 Session 替代 Workspace；
- 已审计错误 owner 被删除，ownerless active Tenant 回到 pending；
- owner/admin/member、suspended、Platform superadmin 与跨 Tenant 管理权限矩阵；
- 5 类身份冲突与 active Workspace 无 owner 的事务级失败关闭。

结果：

| 断言组               | 通过 |
| -------------------- | ---: |
| 成功迁移与数据不变量 |   40 |
| 数据库支持的鉴权行为 |   30 |
| 失败关闭场景         |   30 |

## 6. 当前生产副本演练

将当前生产数据库只读导出到第二个无网络容器，并使用 `psql -1 -v ON_ERROR_STOP=1` 单事务执行仓库中的实际 0016 SQL：

| SQL 行为                 | 行数 |
| ------------------------ | ---: |
| 收集待撤销 Membership    |  110 |
| 更新 Session             |    2 |
| 删除 Membership          |  110 |
| active Tenant 转 pending |    1 |

演练后状态：

| 不变量                                  |                     结果 |
| --------------------------------------- | -----------------------: |
| Membership 总数                         |                      553 |
| owner                                   |                      553 |
| 残留迁移 member                         |                        0 |
| active Tenant 无 active owner           |                        0 |
| 非空 active workspace 无匹配 Membership |                        0 |
| Innei 的 Membership                     | `innei / owner / active` |
| Innei Session active workspace          |                  `innei` |
| 另一个纯社交 Session active workspace   |                   `null` |

## 7. 生产发布验收门槛

发布后必须再次只读验证：

1. Migration Journal 已记录 0016；
2. Membership 总数为 553，且不存在 `role=member AND id LIKE 'm_%'`；
3. active Tenant 均有唯一 active owner；
4. 非空 Session active workspace 均存在相同用户的 active Membership；
5. Innei 仅拥有 `innei` Workspace，Session 不再指向 `qaq`；
6. Mobile 重新获取 Session 后展示 Innei Photos/Studio；Explorer 仍可公开浏览其他 Gallery，但不产生 Membership 或管理权限。
