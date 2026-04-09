# CodeSnip（桌面贴图 + 代码高亮）

一个跨平台轻量级桌面贴图工具骨架：Tauri 负责透明/置顶/无边框窗口与窗口控制命令，Next.js 渲染贴图内容并增强“代码粘贴”体验（自动识别语言 + 语法高亮）。

## 开发环境要求

- Node.js（当前项目已用 `npm` 初始化）
- Rust 工具链（Tauri 必需）
  - 安装 Rust（含 `cargo`）：请使用 Rust 官方安装器（Windows 推荐 `rustup`）
  - 安装后确保 `cargo --version` 可用

## 启动

在 `apps/desktop/` 目录（或在仓库根目录运行 `pnpm desktop:dev`）：

```bash
pnpm install
pnpm dev:tauri
```

## 已实现（骨架）

- **Tauri 窗口**：透明、无边框、置顶（配置在 `src-tauri/tauri.conf.json`）
- **主进程命令**：
  - `set_click_through(enabled)`：切换鼠标穿透
  - `set_always_on_top(enabled)`：切换置顶
- **StickyCard（前端）**：
  - 轮询剪贴板文本（Tauri 环境）
  - 自动猜测语言（auto）
  - 使用 shiki 渲染高亮 HTML
  - 滚轮缩放（`react-use` 的 `useMouseWheel` 作为 wheel 输入）
  - CSS 变量控制 `opacity` 与 `scale`
  - 右键菜单：语言、透明度、缩放、鼠标穿透、关闭窗口
  - 拖拽窗口：顶部栏支持拖拽（`data-tauri-drag-region`）
