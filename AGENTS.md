# ITH2Ome

IT之家第三方 VS Code 插件，划水特供版。

## 技术栈

- TypeScript
- VS Code Extension API
- esbuild (打包)
- pnpm (包管理)

## 常用命令

```bash
pnpm run esbuild        # 构建（带 sourcemap）
pnpm run esbuild-watch  # 构建并监听文件变化
pnpm run vscode:prepublish  # 生产构建（压缩）
```

发布到 VS Code 插件市场与 Open VSX 通过 GitHub Actions 自动完成，参见 `.github/workflows/`。

### 发布

- `publish.yml`：在 `release` 创建或 `workflow_dispatch` 时，先 `vsce package` 打一次包，再把**同一个 `.vsix`** 分别发到 VS Code Marketplace 与 Open VSX。
- 认证用两个 GitHub Actions secrets：`VSCE_PAT`（Marketplace，Azure DevOps PAT，2026-12-01 前有效）、`OVSX_PAT`（Open VSX）。
- `verify.yml`：push/PR 时打包；push 时用 `vsce verify-pat` 与 `ovsx verify-pat` 验证两个 registry 的发布权限。
- 待 open-vsx.org 升级到 v1.2.0 并启用 trusted publishing 后，Open VSX 步骤可换成 `ovsx publish --trusted-publishing`（`id-token: write`）并删除 `OVSX_PAT`。

## 类型检查

```bash
npx tsc --noEmit
```

## 代码检查

项目使用 ESLint，配置在 `@typescript-eslint`。运行：

```bash
npx eslint src/
```

- 配置文件为根目录 `eslint.config.mjs`（flat config）。
- `@typescript-eslint/no-explicit-any` 已关闭：之家 API 返回未类型化 JSON，回调中大量有意使用 `any`。

## 项目结构

- `src/extension.ts` — 插件入口
- `out/` — 构建输出
- `package.json` — 插件清单（含命令、视图、配置项定义）

## 代码规范

- TypeScript strict 模式开启
- 使用 tab 缩进
- 遵循 ESLint 默认规则

## 内容跳转约定

- 内容分两种：普通文章（`mode = 'news'`，`id` 为 `newsid`）与专题（`mode = 'topic'`，`id` 为 url 中 `/zt/` 后的 slug）。
- 打开内容统一走命令 `ith2ome.showContent(mode, title, id)`；webview 内链接点击通过 `postMessage({command:'showContent', title, mode, id})` 转发。
- 列表去重与 `TreeItem.id` 一律使用 `contentKey(news)`（专题用 slug，文章用 newsid），保证同一刷新内 id 唯一。
- 专题 `/zt` 整页渲染用 `specialTopicFormat(html)` 预处理（去脚本、懒加载图换 src、补协议相对链接、注入 CSP 与点击拦截）。
