# 画簿 · 作品与授权工作台

一个操作简单的图稿档案与合作记录工具。

[打开公开工作台](https://adrianluo2022-debug.github.io/artwork-ledger/)

GitHub Pages 版免登录使用，作品和交易记录保存在当前浏览器的 IndexedDB 中，不上传到 GitHub。更换设备、浏览器或清除网站数据后不会自动恢复，请定期导出 JSON 备份。公开的源代码不包含实际账本、上传图片或数据库备份。

[原云端版](https://artwork-ledger-nov12-2026.huiheny.chatgpt.site)继续保留，登录账号的云端记录与 GitHub Pages 版互相独立，可通过 JSON 导出、导入转移记录。

## GitHub Pages 构建

```sh
npm ci
npx vite build --config pages/vite.config.mjs
```

`pages/` 为免登录版源码，`docs/` 为发布产物。GitHub Pages 发布源使用 `main` 分支的 `/docs` 目录。应用资源使用相对路径，可在项目子目录内运行。

浏览器存储测试：`npm --prefix pages ci`，然后运行 `node --test pages/tests/local-store.test.mjs`。

## 能做什么

- 作品只建档一次，记录作品名、创作时间、缩略图和备注。
- 同一作品关联多笔约稿或授权，分别记录客户、用途领域、价格、成交时间与收款情况。
- 授权记录支持起止日期、长期授权和独家授权标记，以及页面内的到期提示。
- 按作品、客户、领域和年份查询；旧记录可只填写年份。
- 导出 CSV 整理表格，导出或导入 JSON 备份。金额统一使用人民币。

详细操作见 [使用说明](./使用说明.md)。

## 原云端版本地开发

需要 Node.js 22.13.0 或更新版本，以及 npm。

```sh
npm ci
npm run build
node --import ./scripts/sites-env.mjs ./node_modules/wrangler/bin/wrangler.js d1 execute DB --local --config dist/server/wrangler.json --persist-to .wrangler/state --file drizzle/0000_blue_yellow_claw.sql
npm run dev
```

先构建以生成本地 Wrangler 配置，再应用现有数据库迁移。每条迁移在同一本地数据库只执行一次；已有数据库不要重复执行。开发地址以终端输出为准，默认从 5173 端口开始。

本地访问 `/signin-with-chatgpt?return_to=/` 使用开发模拟登录。该模拟登录仅用于本地开发，不会包含在正式构建中。本地与线上数据库彼此独立。

修改 `db/schema.ts` 后，才需要运行 `npm run db:generate` 生成新的迁移，并按顺序应用尚未执行的迁移。不要修改已应用的迁移。

验证命令：

```sh
node --test tests/validation.test.mjs tests/api.test.mjs
npm run build
```

`tests/http-smoke.mjs` 是独立的本地 HTTP 验证脚本，仅连接固定的本机 5187 端口，并写入明确标注的测试记录；它不会自动运行，也不会访问正式站点。

## 原云端版部署

`app/` 保留原服务端 API 与 D1 数据库版本，不能直接运行在 GitHub Pages。上方 `pages/` 是可在 GitHub Pages 运行的浏览器存储版。

通过 Sites 创建自己的新站点，将它返回的 `project_id` 写入 `.openai/hosting.json`，保留 `d1: "DB"` 与 `r2: null`，再按 Sites 的源码同步、构建和发布流程部署。发布会应用尚未执行的数据库迁移。本仓库不携带原站点的身份标识或部署凭据。

正式登录由 Sites 处理，API 按已认证用户的账号标识隔离数据。如果迁移到其他托管平台，必须配置该平台的可信身份验证；不能直接信任客户端自行传入的 `oai-authenticated-user-*` 请求头。

## 源码与数据边界

数据库文件、环境变量、凭据、运行缓存、依赖目录和发布归档不进入公开仓库。JSON 备份包含业务信息和缩略图，请自行妥善保存，不要提交到 GitHub。

保留的第三方许可证位于 `vendor/` 和 `scripts/vite/`。
