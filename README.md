# 成长档案 · Growth Archive

以时间轴为主线的个人 / 孩子 / 宠物成长档案。**默认私密、照片清除 GPS、数据随时可整档导出为 ZIP。**

按 `growth-archive-spec.md` 的 MVP（M0–M5）实现，Node 全栈单进程部署。

---

## 快速开始

```bash
npm install          # 安装依赖（npm workspaces）
npm run seed         # 可选：生成演示数据（账号 demo@growth.local / demo1234）
npm run dev          # 同时启动后端 :3000 与前端 :5173
```

打开 <http://localhost:5173> 。用演示账号登录，或直接注册新账号。

生产模式（单进程同时托管前端与 API）：

```bash
npm run build
npm start            # http://127.0.0.1:3000
```

其他命令：

| 命令                    | 作用                                             |
| --------------------- | ---------------------------------------------- |
| `npm test`            | shared 日期/年龄测试 + 服务端接口测试 + 前端类型检查              |
| `npm run typecheck`   | 三个 workspace 的类型检查                             |
| `npm run seed`        | 生成演示档案（已存在数据时跳过，加 `-- --force` 重建）             |
| `npm run backup`      | 把 `data/` 打包到 `backups/growth-backup-<时间>.zip` |
| `npm run db:generate` | 改了 schema 后用 drizzle-kit 生成迁移                  |
| `npm run media:rehome -- --dry` | 预演把老照片搬进可读目录（去掉 `--dry` 真搬，建议先停服务） |
| `npm run icons`      | 由 `apps/web/public/favicon.svg` 重新生成 favicon.ico 与 apple-touch-icon |

---

## 已实现的功能

**账号**：邮箱 + 密码注册/登录/登出（Cookie 会话，argon2id）、改密码、改昵称与语言、登录限流、CSRF Origin 校验。

**账号管理**（`/users`，仅管理员，入口在右上角用户菜单）：账号列表带角色、创建时间、上次登录、名下档案数；可以**新增账号**（昵称 / 邮箱 / 初始密码 / 角色）、**改昵称与角色**、**重置密码**（对方所有设备立即下线）、**停用与恢复**（停用即刻踢掉会话，记录与档案都保留），已停用的账号还可以**彻底删除**（从库里移除，留了「先停用再删除」这一道缓冲）。角色只有 `admin` / `user` 两种：**空库里第一个注册的账号自动成为管理员**，升级旧库时也会把最早创建的账号提为管理员；「至少保留一个管理员」「不能停用当前登录的账号」「名下还有档案的账号要先处理」都在服务端拦住。

**档案**：三种类型（个人 / 孩子 / 宠物）、头像（**编辑弹窗里直接换**：从档案已有照片里挑，或上传一张新图，圆形裁切）、多精度生日、离世日期（纪念模式）、**可维护的纪念日列表**（结婚纪念日、到家日、入园日……每个都有自己的日期精度）、按类型扩展属性（性别/品种/芯片号/血型/过敏）、软删除。编辑弹窗按「基本信息 / 日期 / 详细信息」两列排布，内容一屏可见。

**事件**：标题、日期 + 精度（日/月/年）、正文、地点、**类型（7 种内置 + 档案自定义，可在记录表单里直接新建）**、标签（**记录表单里是带候选的下拉**：从档案已有标签里挑，或输入新的回车即可；重复会自动去重）、`private` 可见性、封面、上一条/下一条。

**照片**：多选与拖拽上传、并发 3 路、失败重试、EXIF 拍摄时间读取、**上传即重编码去除全部 EXIF（含 GPS）**、缩略图 480px + 中图 1600px（WebP）、按 sha256 同档案去重、鉴权访问、灯箱（键盘/滑动）。新建记录时先本地预览选好的照片，保存后自动上传；编辑记录时可直接增删照片、设封面，改动即时生效。

**处理速度**：源图只解码一次，`clone()` 派生原图 / 缩略图 / 中图三份并行编码；浏览器已经摆正并重编码过的图（没有 EXIF/XMP/ICC）直接留用原字节，不再二次编码；重复照片先算 sha256 就跳过，连解码都不做；一次传多张时服务端按 3 路并行处理，浏览器端也是边压边传（第一张压好就开始上传）。实测 3 张 4000×3000 照片约 0.75s 传完（单张 12MP 的完整流水线约 280ms，此前约 930ms）。

**落盘可读**：照片按 `uploads/<档案名>-<档案id8>/<YYYY-MM 拍摄月>/<原文件名>-<媒体id8>/` 存放，例如 `uploads/小满-77bde782/2021-05/第一次去海边-3cb30167/original.jpg`，同一张图的 `original/thumb/medium` 在同一目录里，脱离数据库也能看懂是谁的、什么时候、哪张图。老数据用 `npm run media:rehome` 一次性搬进新结构（幂等，可先 `--dry` 预演）。

**上传前后的两件事**：① **旋转** —— 选好照片后每张都能原地左转/右转 90°（浏览器里直接转，预览立刻变），已上传的照片也能在编辑表单里转，服务端从原图重算原图 + 各尺寸，反复转不掉画质；② **压缩** —— 超过 2MB 的照片在上传前自动缩到长边 3200px 以内（JPEG 质量 0.86 / WebP 0.88，PNG 保持无损），失败就按原文件上传，界面上会显示「已压缩 62%」和「共省了 x MB」。

多图展示规则：**1 张**整幅大图；**2 张**并排；**3 张以上**固定三列，第三格叠加 `+N`（点开看全部）。详情页按 1/2/3 张自动调整列数，画廊里则用主图 + 缩略图切换。

**时间轴**：按年份分组、年份/类型/标签筛选、显示当时年龄、游标分页 + 滚动加载、无照片事件同样是一等公民。

筛选器是**联动**的：年份/类型/标签后面的数字都由服务端按「其它条件保持不变、只排除自己」重新算（`GET /profiles/:id/facets`）。所以选了 2026 年之后，标签下拉里只会剩下这一年在用的标签、数字也随之变小；选了标签之后，年份下拉里只列出这个标签出现过的年份。当前选中的年份或标签即使被筛成 0 也会留在列表里（显示 `· 0`），不会让下拉框看起来空掉。分页文案（「已经到底了」）用的是筛选后的记录数 `filteredTotal`，不是档案总数。

**画廊**（`/p/:id/gallery`）：与时间轴同一套数据与筛选，一件展品 = 一条记录。默认「只看有照片」，切到「全部记录」时纯文字记录也作为展品出现。

- 桌面端是**左图右展签**两栏：左边舞台放照片，右边一列是日期、年龄、类型、标题、正文、地点、标签、完整记录入口和「第 N / M 件」。文字不再堆在图片下面，一条记录的信息一屏能看完。
- **舞台尺寸恒定**（高度 `clamp(260px, 46vh, 520px)`，宽度占满左栏）：换展品、或者从有照片的记录切到纯文字记录，画面尺寸一模一样，不会抖。纯文字记录用同一个方框显示类型 + 标题 +「这条记录没有照片」。
- 图片用 `object-contain` 摆在方框里，两侧空白处铺同一张图的模糊版本（`scale-110 blur-2xl`）并压一层浅墨，所以竖图、宽幅图也不会出现死白边。
- 左右箭头 / 键盘 ← → / 触摸滑动切换；**一条记录有多张照片时，翻页先把这条记录的照片走完（此时标题、展签、胶片条都不动，只有主图淡入切换），最后一张之后才换下一条记录**；翻回上一条时落在它的最后一张；主图下方有缩略图条可换主图，点击主图进灯箱。
- **多图缩略条在右侧展签下面**（不再压在主图下方）：一条记录有 2 张以上照片时，展签末尾出现「这条记录有 N 张照片」和一排缩略图，点哪张主图就换哪张；图片区域保持满幅。
- 底部**展览条**（胶片条）紧跟在两栏下面，直接跳到任意一件；当前项只在不可见时才滚动，不会来回跳。

**分享与协作**：档案成员（查看者/编辑者）。加成员时**邮箱是下拉选择**（`GET /profiles/:id/member-candidates` 只返回能加的账号：已排除所有者、自己和已在成员列表里的），下拉里同时显示昵称与邮箱，不用再凭记忆敲邮箱；没有可加的账号时直接提示去「账号管理」开一个。公开链接支持整档或单条事件、可设过期、可撤销、**可从列表彻底删除**、256 位随机 token，`private` 事件与照片不进公开链接。

**数据**：回收站（30 天，可恢复/彻底删除/自动清理）。档案删除后可在「回收站」页恢复或彻底删除 —— 入口在顶栏、用户菜单、档案列表的 `回收站 N` 按钮，删除后也会自动跳过去；单条记录与照片的回收站在对应档案的「管理 → 回收站」。**归档下载**：管理 → 基本信息页的「归档下载」，把整个档案打包成 ZIP（manifest + profile + events + 原图，原图按 `media/YYYY/MM/日期-标题.jpg` 命名），生成后直接下载，可在本地长期保存，不依赖本站。

**分类管理**（管理 → 类型与标签）：事件类型支持新增、改名（同步改写已有记录）、删除（记录回退为「其他」）；标签支持新增、改名、删除（只解绑，不删记录），并显示各自被用到的次数。

**其他**：响应式（≥360px）、中英双语框架、键盘可达与 alt 文本、`prefers-reduced-motion`、骨架屏与空状态、页脚版权（`© lantianjialiang`）、结构化日志（pino）、Docker 部署。

---

## 目录结构

```
growth_story/
├─ packages/shared/          # zod schema、DTO、日期/年龄工具（前后端共用）
├─ apps/server/              # Hono + SQLite + Drizzle
│  ├─ src/{routes,services,auth,media,storage,jobs,db}
│  ├─ drizzle/*.sql          # 迁移文件（只能新增，不能改历史）
│  └─ data/                  # sqlite + uploads（gitignore，备份只需备份这里）
├─ apps/web/                 # Vite + React + Tailwind v4
│  ├─ src/{routes,components,lib,i18n}
│  └─ public/                # favicon.svg / favicon.ico / apple-touch-icon.png
├─ scripts/backup.mjs、rehome-media.ts
├─ Dockerfile / docker-compose.yml
└─ .env.example
```

数据库为单文件 SQLite（WAL 模式）。迁移在服务启动时自动执行，记录在 `__migrations` 表。

---

## 关键设计

### 日期是「日历日期 + 精度」

|                                  |       |                                                              |
| -------------------------------- | ----- | ------------------------------------------------------------ |
| 所有业务日期存 `YYYY-MM-DD` 字符串 + \`day | month | year`精度，**不经过`Date` 做时区转换**（`packages/shared/src/date.ts\`）。 |

- 精度 `month` 时日期规范化为 `YYYY-MM-01`，`year` 时为 `YYYY-01-01`；
- 年龄计算把出生日按月推进，取「不超过目标日的最大整月数」，因此 1 月 31 日 → 3 月 1 日是 1 个月 1 天，而不是负数；
- 2 月 29 日出生：平年以 3 月 1 日作为周年日；
- 出生日期只有年/月精度时显示「约 N 岁」；已逝世档案的年龄截止到纪念日。

### 权限一律在服务端判定

|                                                        |        |                                        |
| ------------------------------------------------------ | ------ | -------------------------------------- |
| \`requireProfileAccess(client, profileId, user, 'view' | 'edit' | 'manage')\` 是所有档案数据的唯一入口，对应规格第 4 节的矩阵： |

| 操作                     | 所有者 | 编辑者 | 查看者 |      公开链接     |
| ---------------------- | :-: | :-: | :-: | :-----------: |
| 查看档案/事件/照片             |  ✓  |  ✓  |  ✓  | ✓（不含 private） |
| 新建/编辑/删除事件与照片          |  ✓  |  ✓  |  —  |       —       |
| 管理成员与分享链接、导出、改档案信息、删档案 |  ✓  |  —  |  —  |       —       |

无权访问统一返回 **404**（而不是 403），避免泄露「这个 id 存在」。媒体文件不暴露静态目录，只能通过带鉴权的 `/api/v1/media/:id/file` 读取。

### 照片隐私

上传流程：校验文件头（不看扩展名）→ 读 EXIF 拍摄时间 → `sharp` 按方向摆正并重新编码（**不带 metadata，EXIF/GPS 整体丢弃**）→ 生成 thumb/medium WebP。原图本身也不保留 GPS。

`src/__tests__/media.test.ts` 里用代码构造了一张带 GPS 的 JPEG，断言上传后原图 `exifr.gps()` 为空、`sharp.metadata().exif` 为空。

### 照片怎么落盘

```
data/uploads/
└─ 小满-77bde782/            # 档案名 + 档案 id 前 8 位（档案改名不影响旧目录）
   ├─ 2021-05/               # 拍摄年月，没有 EXIF 时用上传时间
   │  └─ 第一次去海边-3cb30167/   # 原文件名 slug + 媒体 id 前 8 位
   │     ├─ original.jpg
   │     ├─ thumb.webp
   │     └─ medium.webp
   └─ 2021-06/…
```

- 目录名只是**给人看的**，真正权威的是 `media.original_path` / `variants` 里存的相对路径；档案改名后旧目录保持原样，不搬文件。
- 文件名会做 slug 化：去路径非法字符、空格转连字符、截断长度、避开 Windows 保留名（`CON`/`NUL`/`COM1`…），中文原样保留。
- 上传时会把原始文件名存进 `media.original_name`（迁移 `0004`），导出、重命名、搬目录时都用得上。
- 彻底删除照片时会连磁盘文件一起删，并把因此变空的目录一并清掉（`storage.pruneEmptyDirs`），不会留一堆空壳目录。
- 老库升级：`npm run media:rehome`（先 `--dry` 看计划）。它按 `拍摄时间 → 原文件名` 算出新位置、搬文件、更新数据库，重复执行安全。

### 图片处理要快

一条照片流水线原本要解码 4 次（原图 + 缩略图 + 中图 + 元数据）；现在：

1. `sharp(buffer).rotate()` 只建一条 pipeline，三份输出都用 `clone()`，源图只解码一次；
2. 三份编码并行跑（`Promise.all`），写盘也并行；
3. 浏览器送来的图通常已经摆正、没有 EXIF/XMP/ICC，**直接留用原字节**，省掉一次重编码（画质也少损失一代）；
4. 去重先算 sha256 再决定要不要处理，重复照片不做解码；
5. 一次上传多张时用 `lib/concurrency.ts` 的 `runPool` 3 路并行；浏览器端边压边传。

`npm run media:rehome` 之外没有后台任务，仍然在请求内同步完成（家用规模足够）。

### 下拉框不要用 `.input`

原生 `<select>` 在「固定高度 + 上下内边距」的组合下会把文字裁掉一半（`h-9` + `py-2.5` 尤其明显）。所以下拉框统一用 `.select` / `.select-sm`：上下内边距归零、高度固定、自绘箭头，由浏览器把文字垂直居中。新增下拉框时请用这两个类，不要写 `className="input"`。

### 文件响应不要直接塞 Node 流

媒体、导出 ZIP、前端静态资源都通过 `lib/fileStream.ts` 的 `streamFileBody()` 返回。不要改成 `c.body(fs.createReadStream(...))`：`@hono/node-server` 会用 `Readable.toWeb()` 适配，而它在响应结束/客户端断开时会 cancel 一次、底层流的 close 事件再 close 一次 controller，抛出 `ERR_INVALID_STATE: ReadableStream is already closed`。这个异常发生在微任务里，路由的 try/catch 抓不到，会直接杀掉进程（图片请求被用户中途打断就足以触发）。自实现的适配器把 close/error/cancel 做成幂等，并保留 pause/resume 背压。

---

## API 一览（`/api/v1`）

```
POST   /auth/register | /auth/login | /auth/logout | /auth/password
GET    /auth/me                     PATCH /auth/me

GET    /admin/users                 POST /admin/users        （仅管理员）
PATCH  /admin/users/:userId         DELETE /admin/users/:userId（停用）
POST   /admin/users/:userId/restore

GET    /profiles                    POST /profiles
GET    /profiles?deleted=true       档案回收站（含 deletedAt / expiresAt）
GET    /profiles/:id                PATCH /profiles/:id      DELETE /profiles/:id
POST   /profiles/:id/restore        DELETE /profiles/:id/permanent（彻底删除）

GET    /profiles/:id/events?year=&type=&tag=&cursor=&limit=
GET    /profiles/:id/facets?year=&type=&tag=   筛选计数（年份/标签）
POST   /profiles/:id/events
GET    /profiles/:id/tags?all=true    POST /profiles/:id/tags
PATCH  /profiles/:id/tags/:tagId      DELETE /profiles/:id/tags/:tagId
GET    /profiles/:id/event-types      POST /profiles/:id/event-types
PATCH  /profiles/:id/event-types/:id  DELETE /profiles/:id/event-types/:id
GET    /events/:id                  PATCH /events/:id        DELETE /events/:id
POST   /events/:id/restore

POST   /profiles/:id/media          GET /profiles/:id/media
PATCH  /media/:id                   DELETE /media/:id        POST /media/:id/restore
POST   /media/:id/rotate  { degrees: 90 | 180 | 270 | -90 }
GET    /media/:id/file?size=thumb|medium|original

GET/POST /profiles/:id/members      PATCH/DELETE /profiles/:id/members/:userId
GET    /profiles/:id/member-candidates  可添加的账号（排除所有者/自己/已在成员里）
GET/POST /profiles/:id/share-links  DELETE /profiles/:id/share-links/:linkId[?purge=true]

GET    /public/:token               GET /public/:token/events/:eventId
GET    /public/:token/facets?year=&type=&tag=  公开链接的筛选计数（只算 inherit）
GET    /public/:token/media/:id/file?size=

POST   /profiles/:id/export         GET /exports/:id         GET /exports/:id/download
GET    /profiles/:id/trash          DELETE /profiles/:id/trash/:kind/:id
```

错误统一为 `{ "error": { "code", "message", "details?" } }`；列表用游标分页（`nextCursor`）。

---

## 部署

### Docker

```bash
cp .env.example .env      # 按需修改
docker compose up -d --build
```

数据落在 `./data`（挂载到容器 `/data`）：`growth.db`、`growth.db-wal`、`uploads/`。备份直接打包这个目录即可。

### 反向代理

应用只监听 `127.0.0.1:3000`，用 Caddy / Nginx 终止 TLS：

```caddy
growth.example.com {
    reverse_proxy 127.0.0.1:3000
}
```

启用 HTTPS 后把 `COOKIE_SECURE=1`、`PUBLIC_ORIGIN=https://growth.example.com` 写上（后者用于写请求的 Origin 校验）。建议 `ALLOW_REGISTRATION=0` 关闭注册，只保留自己建的账号。

### 备份与恢复

```bash
npm run backup                  # → backups/growth-backup-YYYYMMDD-HHmmss.zip
# 恢复：停服务 → 解压覆盖 data/ → 启动
```

---

## 测试

```bash
npm test
```

- `packages/shared/src/date.test.ts`：日期精度、闰日、月末借位、出生前、约数标记（15 例）
- `apps/server/src/__tests__/permissions.test.ts`：权限矩阵、陌生人 404、软删除、日期规范化、游标分页、筛选（10 例）
- `apps/server/src/__tests__/media.test.ts`：文件头识别、EXIF 时间、GPS 清除、缩略图尺寸、按「档案名-年月-原文件名」落盘、去重、鉴权、伪装文件、跨档案移动、旋转后宽高互换与各尺寸重生成、两次 180° 复原、非编辑者不可旋转 / 非法角度被拒、彻底删除照片会清掉磁盘文件与空目录（13 例）
- `apps/server/src/__tests__/share.test.ts`：公开链接过滤/撤销/过期/随机性、单事件链接、成员邀请、候选账号列表排除所有者/自己/已邀请的人（9 例）
- `apps/server/src/__tests__/profileTrash.test.ts`：档案回收站列表、恢复、彻底删除级联、跨用户隔离、未登录拦截（4 例）
- `apps/server/src/__tests__/taxonomy.test.ts`：纪念日保存/替换/清空、自定义类型增改删并同步记录、未创建类型被拒、内置重复冲突、按自定义类型筛选、标签增改删、分享链接彻底删除（7 例）
- `apps/server/src/__tests__/adminUsers.test.ts`：首个账号即管理员、非管理员 403、新建账号并登录、改昵称与角色 / 保留最后一个管理员、重置密码后旧密码与旧会话失效、停用与恢复 / 不能停用自己或有档案的账号、彻底删除只能删已停用的账号（8 例）
- `apps/server/src/__tests__/facets.test.ts`：标签计数跟着年份变、年份计数跟着标签变、类型叠加后的交集、筛不到的标签记 0、筛选后记录数 filteredTotal 与档案总数分离、非成员 404、公开链接只算继承可见的记录（7 例）
- `apps/server/src/__tests__/fileStream.test.ts`：文件流完整读取、提前取消、重复取消幂等、文件缺失（4 例）

测试用内存 SQLite + 临时上传目录，互不影响。

---

## 与规格的差异 / 待办

**已按规格第 10 节默认假设落地**：家用小规模（可关注册）、无邮件功能、本地磁盘存储、纯文本正文（保留换行，不渲染 Markdown）、一个事件只属于一个档案、中文优先并预留英文。

**尚未实现（Phase 2 及以后）**：视频上传与转码、批量导入与按日期聚类、身高体重等度量与折线图、里程碑模板、「历年今天」、全文搜索（FTS5）、统计页、纪念模式专属样式、评论互动、地图视图、PWA、S3 存储。

**工程上的取舍**：

- 未接入 ESLint（用 `tsc --noUnusedLocals` + Prettier 兜底），Playwright E2E 未接入（关键流程用接口测试覆盖）；
- 图片处理在请求内同步完成（MVP 够用），大文件场景应改为后台任务 + 进度轮询；
- 导出任务为进程内串行队列，导出文件留在 `data/tmp-exports`，需要时可手动清理；
- 导出目前是「按档案」进行，设置页的「导出全部数据」与「注销账号并彻底清除数据」尚未做；
- 正文按纯文本渲染，未来若支持 Markdown 必须加 XSS 过滤。
