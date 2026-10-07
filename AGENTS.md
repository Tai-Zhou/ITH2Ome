# ITH2Ome

IT之家第三方 VS Code 插件，划水特供版。

## 技术栈

- TypeScript 7（原生 Go 编译器，仅用于 `tsc --noEmit` 类型检查）
- VS Code Extension API
- rolldown (打包)
- oxlint (代码检查)
- pnpm (包管理，版本在 workflow 的 `pnpm/setup` 里用 `version` 指定；`package.json` **不写** `packageManager`，否则本地 pnpm 会被强制切到该版本，与"本地随时更新"冲突)

## 项目结构

- `src/extension.ts` — 插件入口
- `out/` — 构建输出
- `rolldown.config.ts` — 打包配置
- `.oxlintrc.json` — oxlint 配置
- `package.json` — 插件清单（含命令、视图、配置项定义）

## 常用命令

```bash
pnpm run build              # 构建（带 sourcemap）
pnpm run build:watch        # 构建并监听文件变化
pnpm run vscode:prepublish  # 生产构建（压缩）
```

### 类型检查

使用 TypeScript 7 的原生编译器：

```bash
pnpm exec tsc --noEmit
```

### 代码检查

项目使用 oxlint。运行：

```bash
pnpm exec oxlint src/
```

- 配置文件为根目录 `.oxlintrc.json`。
- `typescript/no-explicit-any` 已关闭：之家 API 返回未类型化 JSON，回调中大量有意使用 `any`。

### 发布

发布到 VS Code 插件市场与 Open VSX 通过 GitHub Actions 自动完成，参见 `.github/workflows/`。

- `publish.yml`：在 `release` 创建或 `workflow_dispatch` 时，先 `vsce package` 打一次包，再把**同一个 `.vsix`** 分别发到 VS Code Marketplace 与 Open VSX。
- `verify.yml`：push/PR 时先 `tsc --noEmit` 类型检查与 `oxlint` 检查，再打包；push 时用 `pnpm run verify`（即 `vsce verify-pat`）验证 Marketplace 发布权限。
- 两个 workflow 都用 `pnpm/setup@v3` 一步装好 pnpm 与 Node（`version: ^12.0.0` + `runtime: node@26`），不再用 `actions/setup-node`；`require-lockfile: true` 让它在安装前就要求 `pnpm-lock.yaml` 存在并以 `--frozen-lockfile` 安装，因此不需要单独的 `pnpm install` 步骤。仓库里没有 `.nvmrc`／`.node-version`／`.tool-versions`，Node 版本必须靠 `runtime` 显式指定。
- 认证只需一个 GitHub Actions secret：`VSCE_PAT`（Marketplace，Azure DevOps PAT，2026-12-01 前有效）。
- Open VSX 走 trusted publishing（`ovsx publish --trusted-publishing`，CI 里 `id-token: write`），不再需要 `OVSX_PAT` 与 `ovsx verify-pat`，也不需要额外的 secret。

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

## 功能约定

### 内容跳转

- 内容分两种：普通文章（`mode = 'news'`，`id` 为 `newsid`）与专题（`mode = 'topic'`，`id` 为 url 中 `/zt/` 后的 slug）。
- 打开内容统一走命令 `ith2ome.showContent(mode, title, id)`；webview 内链接点击通过 `postMessage({command:'showContent', title, mode, id})` 转发。
- 查看内容用统一的会话令牌 `contentSession`：`showContent` 入口 `let session = ++contentSession;`，所有会异步改写 webview 的回调（专题、正文、B 站视频、打分、相关文章、评论）开头都要 `if (session != contentSession) return;`，丢弃切换内容后才返回的旧请求。新增这类异步回调时必须照此加守卫，翻页请求（`moreComments`）传当前的 `contentSession`。`panel.onDidDispose` 里也要 `++contentSession`，关闭面板后同样作废在途请求，避免 `panel` 已置空、或被 dispose 后回调再访问 webview。
- 列表去重与 `TreeItem.id` 一律使用 `contentKey(news)`（专题用 slug，文章用 newsid），保证同一刷新内 id 唯一。
- 专题 `/zt` 整页渲染用 `specialTopicFormat(html)` 预处理（去脚本、懒加载图换 src、补协议相对链接、注入 CSP 与点击拦截）。

### 日历

- 日历（事件）数据走官方信息流接口 `https://napi.ithome.com/api/newsevent/geteventfeed`（`forward=true`、`pageSize=20`、`timeZone=<用户系统时区>`（取 `Intl.DateTimeFormat().resolvedOptions().timeZone`）），只消费 `feedType` 10026 分组，其余块（10027 日期栏、10007 分隔条）忽略。`timeZone` 决定服务端按哪天分组（`anchor`）与返回的时刻偏移，必须用系统时区，才能与本地 `date=` 键、`realTime` 的系统时区渲染一致；**不要**硬编码 `Asia/Shanghai`。
- 日历分页 `date` 与 `stamp` **互斥**：首屏 / 刷新 / 日期跳转只传 `date=<起始日>`，加载更多只传响应里的 `stamp`（同时传二者会被接口忽略 stamp、永远返回第一页）。
- 日历日期分割以各 `10026` 分组的 `anchor`（该日 0 点）为准去重，**不要**用 `10027` 的 `date`（它恒等于查询起始日，会吞掉后续日期的分割）；日期显示为「10月2日」（不补前导零），**非当前年份**才在日期前加年份（「2026年10月2日」），星期放 `description`。
- 日历视图为**两级层级树**：每个日期是一个父节点（`collapsibleState` 默认 `Expanded`，用 `dateMap` 按 `anchor` 复用，跨「加载更多」保留），事件作为其 `children`；`CalendarProvider.list` 只放根级项（日期父节点与「加载更多数据」），`getChildren(el)` 对子节点返回 `el.children ?? []`，`Ith2omeItem` 因此带有可选 `children`。
- 日历事件时刻一律由 `realTime` 按**系统时区**渲染（`eventTimeFormat`），不使用接口里的 `eventTime`；`timeNotdecided`（或时刻解析为空）的事件在 `label` 里显示为 `待定｜标题`，与 `时刻｜标题` 形式一致；tooltip 与复制文本只显示日期（`2026/10/2`），**不显示** `00:00:00` 与「（时间待定）」。
- 事件子节点保留 `calendar` 图标，用于与日期父节点的折叠箭头区分。
- 事件深链 `ithome://event?id=<id>` 统一用 `eventUrl(link)` 转成详情页 `https://img.ithome.com/app/calendar/event_detail.html?id=<id>`，事件去重与 `TreeItem.id` 使用该链接；事件条目**不设点击命令**（点击不执行动作），仅保留右键/行内的复制与浏览器按钮。复制命令 `ith2ome.share` 统一写 `shareInfo + resourceUri`，所以各条目的 `shareInfo` 内**不得**再自带链接。
- 日历起始日由视图标题栏的 `ith2ome.calendarPrevMonth/PrevWeek/Goto/NextWeek/NextMonth` 命令切换（`PrevWeek/NextWeek` 移动 ±7 天），状态保存在 `CalendarProvider.date`；`ith2ome.calendarGoto` 用 `showInputBox` 输入 `YYYYMMDD`（仅 4 位 `MMDD` 时自动补当前年份）跳转到指定日期；`ith2ome.calendarRefresh` 为手动刷新（无参）时回到今天，带 `true` 时为「加载更多」（保持当前起始日）。

### 评论翻页

- 文章底部评论走 `https://cmt.ithome.com/apiv2/comment/getnewscomment?sn=<DES(newsid)>`（设置里评论选「早」时加 `&latest=1`），`sn` 由 `commentSn(newsid)` 生成（DES / ECB / ZeroPadding，密钥 `(#i@x*l%`）。
- 翻页用 `cid` **游标**而非页码：传该次已显示的「最X评论」最后一条评论 id。默认「新」序 `cid` 取更旧、`latest=1`「早」序取更新，两种顺序都往列表**下方**追加；`page`/`pageNum`/`offset`/`pageSize` 等参数一律无效。
- 首次加载由 `loadComments(panel, id, true)` 渲染「置顶评论」「热门评论」「最X评论」三段；翻页只追加「最X评论」，统一由 `loadComments()` 经 `moreComments` / `appendComments` / `commentsDone` / `commentsError` 消息收发。翻页状态为内存变量 `commentNewsId`/`commentCid`/`commentDone`/`commentLoading`，首次加载时重置。
- 「最X评论」列表末尾放一个 `<a>` 链接（`li#commentmore`）：进入视口（`top <= innerHeight + 200`）时自动触发，链接同时充当「评论加载中 ...／加载失败，点击重试」的状态显示；到底（`commentsDone`）时**直接移除该节点**，不显示「没有更多评论了」。追加评论必须走 `postMessage` 在 DOM 里 `insertAdjacentHTML` 追加，**不能**重新赋值 `webview.html`（会整页重载、丢滚动位置）。
- 「到底」判定为翻页返回 0 条（接口没有可靠的 total/hasMore），因此最后一页之后可能多请求一次，由视口自动触发吸收。

### 评论黑名单

- 黑名单为设置项 `ith2ome.commentBlockUsers`（数组，默认空，留空即不启用），内容是软媒通行证数字 ID；`refreshConfig()` 里统一 `String(id).trim()` 后存入 `commentBlockUsers`，因此手输数字或前后带空格的 ID 都能命中。
- 命中判定在 `commentItemFormat()`：`commentBlockUsers.includes(String(comment.userInfo.id))` 成立时**整条评论模糊**——用一个 `<div class="${commentItemClass}">` 把 `img.avatar` 与承载昵称/等级/时间/正文的信息块 div 一起包住，整条只加**一层** `filter`（复用 `.blur` 样式与悬停恢复），与「多反对评论只糊正文」在视觉上区分开。
- 模糊类**不要**加到 `<li>` 上：`<li>` 内还嵌套着该评论的回复 `<ul>`，加到 `<li>` 会连带把别人的回复一起糊掉；包裹层必须在 `commentItemFormat` 那一行内闭合（该行末尾三个闭合标签依次收尾投票块、信息块、模糊包裹层，**少写一个回复列表就会落进模糊层**），回复 `<ul>` 由 `commentListFormat` 追加在包裹层之后。
- 改这一行时必须拿**生成的 HTML** 验证标签平衡（例如把该行 `return` 的表达式抽出来用 Node 跑一遍、检查结束时的未闭合栈只剩 `<li>`），不要只数源码行尾的 `</div>` 个数：行尾注释里写 `</div>` 会干扰计数，这个坑踩过一次。
- 与 `blurNegativeComment` 用 `else if` 互斥，黑名单命中时不再给正文叠加第二层模糊（嵌套 `filter` 会让正文明显更糊）。
- 该黑名单只作用于文章底部评论区（`commentItemFormat`）；「热评」视图走 `hotcommentlist` 接口、以 TreeItem 纯文本渲染，没有模糊机制，不受影响。设置改动与其它显示类设置一致，需下一次手动刷新（`refreshConfig()`）才生效。

### 搜索

- 搜索视图 `ith2ome.search`（在 `views.ith2ome` 中排在「最新」之前）为**两级层级树**：每次搜索在 `SearchProvider.list` 头部 `unshift` 一个父节点，该次搜索结果作为其 `children`，因此同一关键词多次搜索、不同关键词先后搜索都能纵向对照；父节点 `collapsibleState` 默认 `Expanded`，`description` 为该次搜索时刻（`eventTimeFormat`），`id` 为 `search<时间戳>`。
- 搜索接口为 `https://m.ithome.com/api/search/searchnewsget?keyWord=<urlencode 关键词>&maxNewsId=<翻页游标>&userhash=<通行证 userHash>`，由 `searchUrl(keyword, maxNewsId)` 统一拼装。**必须用 `userhash` 查询参数**：浏览器 cookie（`user=hash=`、`rmlogin_hash` 等）、`userhash` 请求头、以及 `napi.ithome.com` 系列对搜索均无效（分别返回 `needLogin`／`请登录`／401）。接口不校验 UA 与 Origin。
- 搜索登录态直接复用通行证 `userHash`，**不需要引入任何新 cookie**；未登录时提示先登录且不新建父节点，返回 `{"Success":0,"Result":"needLogin"}` 时提示登录失效。
- 翻页用 `maxNewsId` 传该次搜索**已显示的最后一篇 newsid**（首页传 `0`，游标取接口原始返回的最后一条，与广告过滤无关），接口每页固定 20 条；只有整页返回时才补「加载更多数据」子项，加载后没有新增内容就不再补。搜索结果无结果时返回 `{"Success":0}`（无 `Result`），此时子节点显示「没有找到相关内容」。
- 搜索结果子项 `id` 必须在整棵树内唯一，因此用 `<父节点 id>-` 前缀（`newsFormat` 产出的 id 基础上）；同一次搜索内按 `contentKey` 去重。
- 搜索**不套用 `blockWords`**（避免搜到被屏蔽的词时列表空白），只按 `hideAd` 过滤 `url` 含 `lapin` 的广告。
- 搜索接口没有 `commentcount` 字段，`newsFormat` 的 `counts` 需容忍缺省（缺省时不显示「｜评论数」）。
- 工具栏按钮为 `ith2ome.searchNew`（新建搜索，`$(search)`，视图 id 为 `ith2ome.search`，命令另起名避免与视图同名）与 `ith2ome.searchClear`（全部删除，`$(clear-all)`）；父节点行内按钮 `ith2ome.searchDelete`（`viewItem == ith2ome.search`）；树内分页命令 `ith2ome.searchMore` 带父节点参数，**不写进** `package.json` 的 `commands`（避免污染命令面板）。未搜索时视图返回「点击搜索」占位项。

### 未读徽标

- 未读徽标**没有任何独立轮询**：`unreadBaseline`/`maxid`/`newscount` 与 60 秒的 `setInterval` 全部移除（专题页仍在用 `getText`，不要顺手删）。徽标数只在「最新」的首屏刷新里算出来，即 `readOrder`（上次手动刷新时首屏最新的 `orderdate`）之后新出现的可见条目数——`toplist` 与 `newslist` 都算，`show()` 过滤掉的广告与屏蔽词不计。
- `refreshType == 0`（手动刷新，含激活时构造函数的首次加载）时把 `readOrder` 前移并归零徽标，所以**手动刷新那一刻新出现的条目按已读计**；`refreshType == 1` 的自动刷新、`>= 2` 的「加载更多」都不动 `readOrder`。基线不持久化（内存变量），重启后以当时的最新为已读位置。`autoRefresh` 为 0 时徽标只在手动刷新时归零，不会再增长。
- 徽标通过 `latestTreeView.badge = { value, tooltip }` 设置，计数为 0 时设 `undefined` 清除。因此 `ith2ome.latest` 必须用 `createTreeView` 注册（并 push 进 `context.subscriptions`）才能拿到视图句柄，其余视图仍用 `registerTreeDataProvider`。徽标挂在 **Activity Bar 的视图容器图标**上（六个视图共用一个容器图标），不是「最新」那一行。开关为 `ith2ome.unreadBadge`，默认开。
- 「上次阅读到这里」标记与未读徽标**不是同一个规则**，不要"顺手统一"：标记锚定 `lastReadId`（只在初始化与手动刷新时前移），停在**上一次列表刷新之前**的最新一篇，所以**手动刷新时新出现的那批条目会留在标记上方直到下次刷新**；而徽标在手动刷新那一刻就把它们算作已读、立即归零。两者相差的就是这批条目，这是有意为之。

### 新文提醒

- 新文提醒的判定**只在「最新」的自动刷新（`refreshType == 1`）里做**，不使用 `lastpush` 推送接口：手动刷新时用户注意力就在列表上，不弹窗。`LatestProvider` 维护 `notifyKeys`（上一次首屏刷新的 `contentKey` 集合，每次首屏刷新整体替换）与 `notifyReady`（首次首屏刷新只记基线），因此**只有本次刷新新出现的条目**才可能提醒（手动刷新同样会推进基线，被手动刷新吸收的条目之后不再补提醒）。提醒条件为 `keyWordsPush` 开、条目已进入列表（`show()` 过滤掉的广告与屏蔽词不提醒）、`highlight(title)` 非空；命中即 `showInformationMessage(title, '查看')`，点「查看」走 `ith2ome.showContent`，一次刷新多条命中则每条各弹一个。置顶 `toplist` 不参与判定（每轮刷新都会重复出现）。
- 开关为 `ith2ome.keyWordsPush`，默认关；关键词为空时永不提醒；`ith2ome.autoRefresh` 为 0（关闭自动刷新）时该功能不触发。
- 自动刷新前会先 `refreshConfig()` 重读设置（在 `setTimeout` 回调里），因此设置项改动在一个自动刷新周期内生效（默认 300 秒）。
