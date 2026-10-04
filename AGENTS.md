# ITH2Ome

IT之家第三方 VS Code 插件，划水特供版。

## 技术栈

- TypeScript 7（原生 Go 编译器，仅用于 `tsc --noEmit` 类型检查）
- VS Code Extension API
- rolldown (打包)
- oxlint (代码检查)
- pnpm (包管理，版本由 `package.json` 的 `packageManager` 固定，workflow 里不写 `version`)

## 常用命令

```bash
pnpm run build              # 构建（带 sourcemap）
pnpm run build:watch        # 构建并监听文件变化
pnpm run vscode:prepublish  # 生产构建（压缩）
```

发布到 VS Code 插件市场与 Open VSX 通过 GitHub Actions 自动完成，参见 `.github/workflows/`。

### 发布

- `publish.yml`：在 `release` 创建或 `workflow_dispatch` 时，先 `vsce package` 打一次包，再把**同一个 `.vsix`** 分别发到 VS Code Marketplace 与 Open VSX。
- 认证只需一个 GitHub Actions secret：`VSCE_PAT`（Marketplace，Azure DevOps PAT，2026-12-01 前有效）；Open VSX 走 trusted publishing，不需要 secret。
- `verify.yml`：push/PR 时先 `tsc --noEmit` 类型检查与 `oxlint` 检查，再打包；push 时用 `pnpm run verify`（即 `vsce verify-pat`）验证 Marketplace 发布权限。
- Open VSX 走 trusted publishing（`ovsx publish --trusted-publishing`，CI 里 `id-token: write`），不再需要 `OVSX_PAT` 与 `ovsx verify-pat`。

## 类型检查

使用 TypeScript 7 的原生编译器：

```bash
pnpm exec tsc --noEmit
```

## 代码检查

项目使用 oxlint。运行：

```bash
pnpm exec oxlint src/
```

- 配置文件为根目录 `.oxlintrc.json`。
- `typescript/no-explicit-any` 已关闭：之家 API 返回未类型化 JSON，回调中大量有意使用 `any`。

## 项目结构

- `src/extension.ts` — 插件入口
- `out/` — 构建输出
- `rolldown.config.ts` — 打包配置
- `.oxlintrc.json` — oxlint 配置
- `package.json` — 插件清单（含命令、视图、配置项定义）

## 代码规范

- TypeScript strict 模式开启
- 使用 tab 缩进
- 遵循 oxlint 默认规则

### 命名规范

| 类型                             | 规范               | 示例                       |
| :------------------------------- | :----------------- | :------------------------- |
| 类、接口、类型别名、枚举名       | `PascalCase`       | `interface UserInfo`       |
| 枚举成员                         | `PascalCase`       | `Kind.Latest`              |
| 函数、方法、属性、局部变量、参数 | `camelCase`        | `function refreshConfig()` |
| 常量（模块级）                   | `UPPER_SNAKE_CASE` | `const MAX_RETRIES = 3;`   |
| 类型参数                         | 单字母或 `T` 前缀  | `T`、`TKey`、`TResult`     |

- 接口不加 `I` 前缀：用 `Foo`，不用 `IFoo`。
- 布尔值用 `is` / `has` / `can` / `should` 前缀：`isSignedIn`。
- 私有成员不加 `_` 前缀：用 `private` 字段或 `#` 私有字段。
- 类型建模优先用字符串字面量联合 + `as const`，避免 `enum` 产生运行时代码。
- 遍历数组用 `for...of` / `entries()`，遍历对象用 `Object.entries()`，禁止用 `for...in` 遍历数组。

## 内容跳转约定

- 内容分两种：普通文章（`mode = 'news'`，`id` 为 `newsid`）与专题（`mode = 'topic'`，`id` 为 url 中 `/zt/` 后的 slug）。
- 打开内容统一走命令 `ith2ome.showContent(mode, title, id)`；webview 内链接点击通过 `postMessage({command:'showContent', title, mode, id})` 转发。
- 列表去重与 `TreeItem.id` 一律使用 `contentKey(news)`（专题用 slug，文章用 newsid），保证同一刷新内 id 唯一。
- 专题 `/zt` 整页渲染用 `specialTopicFormat(html)` 预处理（去脚本、懒加载图换 src、补协议相对链接、注入 CSP 与点击拦截）。
- 日历（事件）数据走官方信息流接口 `https://napi.ithome.com/api/newsevent/geteventfeed`（`forward=true`、`pageSize=20`、`timeZone=<用户系统时区>`（取 `Intl.DateTimeFormat().resolvedOptions().timeZone`）），只消费 `feedType` 10026 分组，其余块（10027 日期栏、10007 分隔条）忽略。`timeZone` 决定服务端按哪天分组（`anchor`）与返回的时刻偏移，必须用系统时区，才能与本地 `date=` 键、`realTime` 的系统时区渲染一致；**不要**硬编码 `Asia/Shanghai`。
- 日历分页 `date` 与 `stamp` **互斥**：首屏 / 刷新 / 日期跳转只传 `date=<起始日>`，加载更多只传响应里的 `stamp`（同时传二者会被接口忽略 stamp、永远返回第一页）。
- 日历日期分割以各 `10026` 分组的 `anchor`（该日 0 点）为准去重，**不要**用 `10027` 的 `date`（它恒等于查询起始日，会吞掉后续日期的分割）；日期显示为「10月2日」（不补前导零），**非当前年份**才在日期前加年份（「2026年10月2日」），星期放 `description`。
- 日历视图为**两级层级树**：每个日期是一个父节点（`collapsibleState` 默认 `Expanded`，用 `dateMap` 按 `anchor` 复用，跨「加载更多」保留），事件作为其 `children`；`CalendarProvider.list` 只放根级项（日期父节点与「加载更多数据」），`getChildren(el)` 对子节点返回 `el.children ?? []`，`Ith2omeItem` 因此带有可选 `children`。
- 日历事件时刻一律由 `realTime` 按**系统时区**渲染（`eventTimeFormat`），不使用接口里的 `eventTime`；`timeNotdecided`（或时刻解析为空）的事件在 `label` 里显示为 `待定｜标题`，与 `时刻｜标题` 形式一致；tooltip 与复制文本只显示日期（`2026/10/2`），**不显示** `00:00:00` 与「（时间待定）」。
- 事件子节点保留 `calendar` 图标，用于与日期父节点的折叠箭头区分。
- 事件深链 `ithome://event?id=<id>` 统一用 `eventUrl(link)` 转成详情页 `https://img.ithome.com/app/calendar/event_detail.html?id=<id>`，事件去重与 `TreeItem.id` 使用该链接；事件条目**不设点击命令**（点击不执行动作），仅保留右键/行内的复制与浏览器按钮。复制命令 `ith2ome.share` 统一写 `shareInfo + resourceUri`，所以各条目的 `shareInfo` 内**不得**再自带链接。
- 日历起始日由视图标题栏的 `ith2ome.calendarPrevMonth/PrevWeek/Goto/NextWeek/NextMonth` 命令切换（`PrevWeek/NextWeek` 移动 ±7 天），状态保存在 `CalendarProvider.date`；`ith2ome.calendarGoto` 用 `showInputBox` 输入 `YYYYMMDD`（仅 4 位 `MMDD` 时自动补当前年份）跳转到指定日期；`ith2ome.calendarRefresh` 为手动刷新（无参）时回到今天，带 `true` 时为「加载更多」（保持当前起始日）。
