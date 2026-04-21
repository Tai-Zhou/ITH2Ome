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

发布到 VS Code 插件市场通过 GitHub Actions 自动完成，参见 `.github/workflows/`。

## 类型检查

```bash
npx tsc --noEmit
```

## 代码检查

项目使用 ESLint，配置在 `@typescript-eslint`。运行：

```bash
npx eslint src/
```

## 项目结构

- `src/extension.ts` — 插件入口
- `out/` — 构建输出
- `package.json` — 插件清单（含命令、视图、配置项定义）

## 代码规范

- TypeScript strict 模式开启
- 使用 tab 缩进
- 遵循 ESLint 默认规则
