# 成长档案网站 · 产品与技术规格（v2）

> 本文档面向 AI 编程助手执行。每个阶段都有明确的范围、数据结构和验收标准。
> 执行原则：**一次只做一个里程碑；每个里程碑结束时项目必须可运行、可测试。**

---

## 0. 对原方案的评审摘要

### 做得好的地方
- 「照片是素材，时间轴是主线」的定位清晰，避免做成普通相册。
- 个人 / 孩子 / 宠物共用统一的"档案"模型，架构可扩展。
- 事件不依赖照片（可纯文字），符合真实使用场景。
- 提醒了"缺失数据不要自动补齐、不画虚假连续曲线"。

### 需要补充或修正的问题

| # | 问题 | 说明 |
|---|------|------|
| 1 | **缺少账号与认证** | 原方案有"权限分享"，却没有用户体系。必须先定义用户、登录、会话。 |
| 2 | **权限模型过于简略** | 需要明确角色：所有者 / 编辑者 / 查看者 / 公开链接，以及事件级别的可见性。 |
| 3 | **缺少隐私与安全设计** | 孩子照片极其敏感：需去除 EXIF 中的 GPS、分享链接可撤销、默认私密。 |
| 4 | **缺少数据备份与导出** | 长期记录网站的核心价值是"几十年后还在"。导出（含原图）是第一版必须项，而不是附加项。 |
| 5 | **缺少媒体处理流水线** | 缩略图、多尺寸、EXIF 日期提取、视频转码/封面、上传失败重试，都没提到。 |
| 6 | **日期模型不完整** | 需要支持"只知道年月"、"生日不确定（领养宠物）"、"逝世日期"、时区问题。 |
| 7 | **缺少批量导入** | 用户已有几千张旧照片，逐个建事件不现实。需要"按拍摄日期批量上传并自动分组"。 |
| 8 | **缺少提醒与回顾** | "历年今天"、生日倒计时是长期使用的留存点，原方案只放在统计里。 |
| 9 | **缺少搜索** | "几年后仍容易找到某个事件"需要全文搜索 + 标签。 |
| 10 | **缺少里程碑模板** | 孩子（第一次翻身、出牙）、宠物（疫苗、绝育）有常见节点，提供模板可显著降低记录门槛。 |
| 11 | **缺少非功能需求** | 性能、响应式、无障碍、多语言、PWA、部署方式均未涉及。 |
| 12 | **"成长数据"放第二阶段，但医疗记录没定位** | 疫苗、体检等应作为"带类型的事件"，第一版即可用事件类型承载。 |
| 13 | **缺少逝世/纪念状态** | 宠物档案不可避免会遇到，需要温和的"纪念模式"，而不是简单删除或无处安放。 |
| 14 | **缺少评论/互动（可选）** | 家人对照片留言、点赞是家庭使用的常见需求，可放在后期。 |
| 15 | **删除没有保护** | 需要软删除 + 回收站，避免误删多年记录。 |

---

## 1. 产品定位

**一个可长期保存、以时间轴为主线的个人 / 孩子 / 宠物成长档案。**

设计原则：
1. **长期可用**：数据可导出、格式开放、不依赖私有服务。
2. **隐私优先**：默认私密，分享需主动开启，可随时撤销。
3. **低记录门槛**：批量导入、模板、自动读取拍摄日期。
4. **内容清晰、加载快**：不追求复杂动画。
5. **可扩展**：统一的档案模型，新增类型无需改架构。

---

## 2. 功能范围（按阶段）

### Phase 1 · MVP（必须）

| 模块 | 功能 |
|------|------|
| 账号 | 邮箱+密码注册/登录/登出；会话 Cookie；修改密码 |
| 档案 | 创建/编辑/归档档案；类型：person / child / pet；头像、名称、出生日期（支持精度）、备注 |
| 事件 | 标题、日期（支持精度）、正文（Markdown 简化版或纯文本）、地点（文本）、事件类型、标签 |
| 媒体 | 照片上传（多选、拖拽）、自动生成缩略图、读取 EXIF 拍摄时间、去除 GPS、设置事件封面 |
| 时间轴 | 纵向时间轴、按年份分组、显示当时年龄、年份快速跳转、按类型/标签筛选 |
| 照片浏览 | 大图灯箱（键盘/滑动切换）、懒加载 |
| 分享 | 档案级成员邀请（查看者/编辑者）、只读公开链接（可撤销、可设过期） |
| 数据 | 软删除 + 回收站（30 天）；**整档案导出为 ZIP（JSON + 原图）** |
| 通用 | 响应式布局、中英文 i18n 框架、基础无障碍（键盘可达、alt 文本） |

### Phase 2

| 模块 | 功能 |
|------|------|
| 视频 | 上传、封面截取、转码为 H.264/MP4、播放 |
| 批量导入 | 一次上传大量照片，按拍摄日期自动聚类为"待确认事件草稿" |
| 成长数据 | 身高、体重、头围等度量（自定义度量类型）；折线图，缺失值不连线 |
| 里程碑模板 | 孩子/宠物预设模板，一键创建待办式事件 |
| 提醒与回顾 | "历年今天"页面、生日/纪念日邮件或站内提醒 |
| 搜索 | 全文搜索（SQLite FTS5）、按日期范围/人物/地点筛选 |
| 统计 | 年度记录数、照片数、每年代表照片、年度回顾页 |
| 纪念模式 | 档案可标记逝世日期，切换为纪念样式 |

### Phase 3（可选）

- 评论与表情互动
- 语音留言 / 语音转写
- 地图视图（事件地理分布）
- 生成年度相册 / PDF 打印册
- PWA 离线查看、移动端相机直传
- 多档案同一事件（如"全家出游"关联多个档案）
- 对象存储（S3 兼容）与 CDN

### 明确不做（防止范围膨胀）
- 复杂 CMS、富文本所见即所得编辑器
- 社交网络 / 公开广场
- AI 自动识别人脸（隐私风险高，除非用户明确要求）

---

## 3. 数据模型

使用 SQLite（单文件、便于备份）。以下为逻辑模型，字段类型可按所选 ORM 调整。

### 3.1 日期精度（重要）

事件和出生日期都使用"日期 + 精度"：

```ts
type DatePrecision = 'day' | 'month' | 'year';
// 存储：date (ISO 'YYYY-MM-DD'，缺失部分补 01) + precision
// 显示：precision=month → "2024 年 3 月"；precision=year → "2024 年"
// 不存时区；日期是"日历日期"，不是时间戳。拍摄时间另存为 takenAt（带时区偏移）。
```

年龄计算规则：
- 精度为 `year` 时显示"约 N 岁"；
- 出生日期未知则不显示年龄；
- 已逝世的档案，年龄计算截止到逝世日期。

### 3.2 表结构

```
users
  id, email (unique), password_hash, display_name, locale, created_at

profiles                      -- 成长档案
  id, owner_id → users
  kind: 'person' | 'child' | 'pet'
  name, avatar_media_id
  birth_date, birth_precision
  death_date, death_precision   -- 可空，纪念模式
  attributes JSON               -- 按 kind 的扩展属性（如宠物品种、性别）
  note, archived_at, deleted_at, created_at

profile_members               -- 协作者
  profile_id, user_id, role: 'viewer' | 'editor'
  invited_by, created_at

share_links                   -- 公开链接
  id, profile_id, token (随机 ≥ 32 字节), 
  scope: 'profile' | 'event', event_id (可空),
  expires_at, revoked_at, created_at

events
  id, profile_id
  title, body, 
  date, date_precision,
  place_text, place_lat, place_lng (可空)
  type: 'milestone' | 'birthday' | 'health' | 'travel' | 'school' | 'daily' | 'other'
  visibility: 'inherit' | 'private'   -- private 事件不出现在公开链接
  cover_media_id
  deleted_at, created_at, updated_at

tags / event_tags             -- 多对多

media
  id, profile_id, event_id (可空，未归属的素材)
  kind: 'image' | 'video'
  original_path, mime, size_bytes, width, height, duration_sec
  taken_at, taken_tz_offset     -- 来自 EXIF
  sha256                        -- 去重
  variants JSON                 -- 缩略图/中图路径
  alt_text, sort_order
  status: 'processing' | 'ready' | 'failed'
  deleted_at, created_at

measurements                    -- Phase 2
  id, profile_id, kind (weight|height|...), value, unit,
  date, date_precision, note

milestone_templates / template_items   -- Phase 2

audit_log                       -- 可选：谁在何时改了什么
```

### 3.3 档案属性扩展（`attributes` JSON，用 zod 按 kind 校验）

| 字段 | person | child | pet |
|------|:---:|:---:|:---:|
| 性别 | ✓ | ✓ | ✓ |
| 品种 / 毛色 | — | — | ✓ |
| 芯片号 | — | — | ✓ |
| 血型 | ✓ | ✓ | — |
| 过敏信息 | ✓ | ✓ | ✓ |

> 医疗/健康记录第一版通过 `events.type = 'health'` + 标签承载，不单独建表。

---

## 4. 权限规则

| 操作 | 所有者 | 编辑者 | 查看者 | 公开链接 |
|------|:---:|:---:|:---:|:---:|
| 查看档案和事件 | ✓ | ✓ | ✓ | ✓（不含 private 事件） |
| 新建/编辑事件与媒体 | ✓ | ✓ | — | — |
| 删除事件 | ✓ | ✓（进回收站） | — | — |
| 管理成员与分享链接 | ✓ | — | — | — |
| 导出完整数据 | ✓ | — | — | — |
| 删除档案 | ✓ | — | — | — |

实现要求：
- **所有 API 必须在服务端做权限检查**，前端隐藏按钮不算安全。
- 媒体文件访问也要鉴权（不能直接暴露静态目录）；公开链接下的媒体用带 token 的路径。
- 公开链接的媒体不得包含 GPS（上传时即已清除）。

---

## 5. 页面与路由

| 路由 | 页面 | 说明 |
|------|------|------|
| `/login` `/register` | 认证 | |
| `/` | 档案列表 | 卡片：头像、名称、年龄/年份范围、最近更新 |
| `/p/:profileId` | **成长时间轴（核心）** | 年份分组、跳转、筛选、无限滚动 |
| `/p/:profileId/e/:eventId` | 事件详情 | 正文、画廊、年龄、地点、上一条/下一条 |
| `/p/:profileId/manage` | 档案管理 | 信息编辑、成员、分享链接、导出、回收站 |
| `/p/:profileId/stats` | 统计（Phase 2） | |
| `/p/:profileId/today` | 历年今天（Phase 2） | |
| `/s/:token` | 公开分享页 | 只读，无需登录 |
| `/settings` | 个人设置 | 语言、密码、导出全部数据 |

时间轴要点：
- 数据量大时按年分页加载，滚动到哪年加载哪年。
- 显示"年龄"随事件日期动态计算，不入库。
- 没有照片的事件同样是一等公民，使用文字卡片样式。
- 空状态要友好（引导"添加第一个事件"）。

---

## 6. 技术方案（Node + Vite）

### 6.1 选型

| 层 | 选择 | 理由 |
|----|------|------|
| 语言 | TypeScript（全栈） | 类型共享，AI 生成代码更可靠 |
| 前端 | **Vite + React** + React Router | 生态成熟 |
| 数据请求 | TanStack Query | 缓存、分页、乐观更新 |
| 样式 | Tailwind CSS | 响应式快速落地 |
| 后端 | **Node 20+ / Hono**（或 Fastify） | 轻量、类型友好 |
| 校验 | zod（前后端共用 schema） | |
| 数据库 | **SQLite**（better-sqlite3）+ Drizzle ORM | 零运维、单文件备份；后期可迁移 Postgres |
| 迁移 | drizzle-kit | |
| 认证 | Cookie 会话（httpOnly, SameSite=Lax）+ argon2 | 比 JWT 更简单安全 |
| 图片处理 | sharp | 缩略图、旋转、去 EXIF |
| EXIF 读取 | exifr | 读取拍摄时间后再清除 GPS |
| 视频处理 | ffmpeg（Phase 2） | 转码、封面 |
| 存储 | 本地磁盘，抽象为 `StorageDriver` 接口 | 后期换 S3 |
| 测试 | Vitest（单元/接口）+ Playwright（关键流程 E2E） | |
| 规范 | ESLint + Prettier | |
| 部署 | Docker（单容器 + 挂载数据卷）；Caddy/Nginx 反代 HTTPS | |

### 6.2 目录结构（pnpm monorepo）

```
growth-archive/
├─ package.json                 # workspaces
├─ pnpm-workspace.yaml
├─ packages/
│  └─ shared/                   # zod schema、类型、日期/年龄工具
│     └─ src/
├─ apps/
│  ├─ web/                      # Vite + React
│  │  ├─ src/
│  │  │  ├─ routes/
│  │  │  ├─ components/
│  │  │  ├─ features/{profiles,events,media,share}/
│  │  │  ├─ i18n/
│  │  │  └─ lib/api.ts
│  │  └─ vite.config.ts         # dev 时代理 /api → 3000
│  └─ server/
│     ├─ src/
│     │  ├─ index.ts
│     │  ├─ db/{schema.ts,migrations/}
│     │  ├─ routes/
│     │  ├─ services/           # 业务逻辑
│     │  ├─ auth/
│     │  ├─ storage/            # StorageDriver, LocalDriver
│     │  ├─ media/              # 处理流水线
│     │  └─ jobs/               # 后台任务队列（先用进程内队列）
│     └─ data/                  # gitignore：sqlite 文件、uploads
├─ e2e/
├─ Dockerfile
└─ README.md
```

生产环境：Hono 同时托管 `apps/web/dist` 静态文件和 `/api`，单进程即可。

### 6.3 API 概要（REST，`/api/v1`）

```
POST   /auth/register | /auth/login | /auth/logout
GET    /auth/me

GET    /profiles
POST   /profiles
GET    /profiles/:id
PATCH  /profiles/:id
DELETE /profiles/:id                     # 软删除

GET    /profiles/:id/events?year=&type=&tag=&cursor=
POST   /profiles/:id/events
GET    /events/:id
PATCH  /events/:id
DELETE /events/:id

POST   /profiles/:id/media               # multipart，可多文件
PATCH  /media/:id                        # 归属事件、alt、排序
DELETE /media/:id
GET    /media/:id/file?size=thumb|medium|original   # 鉴权

GET    /profiles/:id/members     POST/PATCH/DELETE ...
GET    /profiles/:id/share-links POST / DELETE
GET    /public/:token/...                # 只读公开接口

POST   /profiles/:id/export              # 触发导出任务
GET    /exports/:id/download
GET    /profiles/:id/trash   POST /trash/:type/:id/restore
```

约定：统一错误格式 `{ error: { code, message } }`；列表接口用游标分页；所有输入用 zod 校验。

### 6.4 媒体处理流水线

1. 接收上传 → 校验 MIME（按文件头而非扩展名）与大小上限 → 计算 sha256（同档案内去重）。
2. 保存原图（**原图保留，但清除 GPS 等敏感 EXIF 后再存**；拍摄时间先提取入库）。
3. sharp 生成 `thumb`(320px)、`medium`(1280px)，WebP/AVIF，按 EXIF 方向旋转。
4. 状态 `processing → ready/failed`，前端轮询或 SSE 更新。
5. 大文件上传：前端并发限制（如 3）+ 失败重试；Phase 2 考虑分片续传。

### 6.5 导出格式

ZIP 内容：
```
export/
├─ manifest.json        # 版本号、导出时间
├─ profile.json
├─ events.json          # 含媒体引用
├─ measurements.json
└─ media/
   └─ 2025/06/xxx.jpg   # 原图，文件名含日期，便于脱离系统阅读
```
另提供一个纯静态 `index.html`（离线可浏览时间轴）作为 Phase 2 加分项。

---

## 7. 非功能需求

| 项目 | 要求 |
|------|------|
| 性能 | 时间轴首屏 < 2s（1 万张照片档案）；图片懒加载；缩略图优先 |
| 响应式 | 手机优先，≥ 360px 可用 |
| 无障碍 | 键盘可操作、图片 alt、颜色对比度 ≥ 4.5:1、`prefers-reduced-motion` |
| i18n | 所有文案走 i18n key；默认 zh-CN，预留 en |
| 安全 | argon2、CSRF 防护（SameSite + 校验 Origin）、上传类型限制、登录限流、公开 token 不可猜测、安全响应头 |
| 隐私 | 默认私密；不接入第三方统计；GPS 去除；账号删除时彻底清除数据 |
| 备份 | 文档说明如何备份 `data/` 目录；提供命令行脚本 `pnpm backup` |
| 可观测 | 结构化日志（pino），错误不泄露内部信息 |

---

## 8. 执行计划（给 AI 的里程碑）

每个里程碑必须：通过 lint/typecheck/test，README 更新运行说明。

### M0 · 项目骨架
- 初始化 pnpm monorepo、TypeScript、ESLint/Prettier、Vitest。
- `apps/server` 提供 `GET /api/v1/health`；`apps/web` 可显示一个页面并调用该接口。
- Vite dev 代理到后端。
- **验收**：`pnpm dev` 同时启动前后端，页面显示"服务正常"。

### M1 · 账号与档案
- Drizzle schema + 迁移（users, profiles）。
- 注册/登录/登出/`me`；会话中间件。
- 档案 CRUD、日期精度组件、`shared` 中的年龄计算（含单元测试：精度、逝世日期、闰日）。
- 档案列表页与新建/编辑表单。
- **验收**：可注册登录，创建三种类型档案；A 用户无法访问 B 用户的档案（接口测试覆盖）。

### M2 · 事件与时间轴
- events/tags 表与 CRUD。
- 时间轴页：按年份分组、年龄显示、年份跳转、类型/标签筛选、游标分页。
- 事件详情页、事件编辑表单。
- **验收**：创建 100 条测试事件（seed 脚本），时间轴滚动流畅；无照片事件正常显示。

### M3 · 媒体上传与处理
- StorageDriver + LocalDriver；上传接口；sharp 流水线；EXIF 读取与 GPS 清除（测试：带 GPS 的样例图上传后无 GPS）。
- 前端：拖拽多选上传、进度、失败重试、事件画廊、灯箱、设置封面、头像。
- 媒体鉴权访问。
- **验收**：未登录/无权限访问媒体 URL 返回 403/404；缩略图正确旋转。

### M4 · 分享与协作
- profile_members、邀请流程（先用"复制邀请链接"，不依赖邮件服务）。
- 公开链接（创建、撤销、过期）；公开页只读；private 事件被过滤。
- 权限矩阵自动化测试（对照第 4 节表格）。
- **验收**：撤销链接后立即失效；查看者不能修改任何内容。

### M5 · 数据安全
- 软删除 + 回收站 + 恢复；30 天清理任务。
- 导出 ZIP（流式生成，避免内存爆炸）；`pnpm backup` 脚本。
- 档案管理页整合（成员、分享、导出、回收站）。
- **验收**：导出的 ZIP 解压后，照片与 JSON 引用一致。

### M6 · 打磨与部署（MVP 完成）
- 空状态、加载骨架屏、错误提示、i18n 全覆盖、无障碍检查。
- Playwright 覆盖主流程：注册 → 建档案 → 加事件 → 传照片 → 分享。
- Dockerfile、部署文档、环境变量说明（`.env.example`）。
- **验收**：`docker compose up` 后全流程可用。

### Phase 2 按顺序
M7 视频 → M8 批量导入 → M9 度量与统计 → M10 模板与"历年今天" → M11 搜索 → M12 纪念模式。

---

## 9. 给 AI 的执行约束

1. 先读本文档，再动手；**不确定的需求先列出假设再实现，不要自行扩大范围**。
2. 每个里程碑开始前，输出一份简短计划（要改哪些文件）。
3. 数据库变更必须通过迁移文件，禁止手改 schema。
4. 任何涉及权限、文件路径、用户输入的代码都要有对应测试。
5. 不引入文中未列出的重量级依赖；新增依赖需说明理由。
6. 不得把密钥、真实用户数据写入仓库；提供 `.env.example`。
7. 日期一律按"日历日期 + 精度"处理，不用 JS `Date` 做生日/事件日期的时区转换（用字符串或专用工具函数）。
8. 提交信息使用约定式提交（`feat:` / `fix:` / `test:` …），每个里程碑一个可回滚的提交序列。

---

## 10. 待你确认的决策点

| 问题 | 默认假设 | 影响 |
|------|----------|------|
| 部署场景：自己家用还是对外开放注册？ | 家用，小规模，可关闭注册 | 决定是否需要邮件验证、限流强度 |
| 是否需要邮件功能（找回密码、提醒）？ | MVP 不做，提供命令行重置密码 | Phase 2 需要 SMTP |
| 存储位置 | 本地磁盘 | 数据量大时再换 S3 |
| 正文格式 | 纯文本 + 简单换行 | 若要 Markdown 需加渲染与 XSS 过滤 |
| 是否支持一个事件关联多个档案 | 否（Phase 3） | 影响数据模型，若想要请现在说 |
| 语言 | 先中文，预留英文 | |
