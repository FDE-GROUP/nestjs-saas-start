---
kind: frontend_style
name: Tailwind v4 + React 主题系统（双前端应用）
category: frontend_style
scope:
    - '**'
source_files:
    - apps/web/src/index.css
    - apps/web/src/lib/theme.ts
    - apps/web/src/lib/theme-provider.tsx
    - apps/web/index.html
    - apps/web/vite.config.ts
    - apps/web/package.json
    - apps/odoo-rpc-web/src/index.css
    - apps/odoo-rpc-web/package.json
---

## 1. 采用的体系

仓库包含两个独立的 Vite + React 前端应用，均使用 **Tailwind CSS v4**（`tailwindcss ^4.3.3` + `@tailwindcss/vite`），通过 `@import 'tailwindcss'` 在入口 CSS 中引入，无传统 `tailwind.config.js` 文件。

- `apps/web`：SaaS 控制台主前端（TanStack Router + oRPC）。
- `apps/odoo-rpc-web`：Odoo RPC 演示前端（React + TanStack Router，只读数据面）。

样式策略为 **原子类优先（utility-first）**，组件内直接写 Tailwind `className`；未引入任何 UI 组件库（如 shadcn、AntD、MUI），也未见 SCSS/Sass/Less 或 CSS Modules。响应式与暗色模式全部通过 Tailwind 的 `dark:` 变体实现。

## 2. 关键文件

- `apps/web/src/index.css` — Tailwind v4 入口，定义 `@custom-variant dark (&:where(.dark, .dark *))`，并通过 `color-scheme` 联动原生控件明暗。
- `apps/web/src/lib/theme.ts` — 纯逻辑主题引擎（可脱离 React/SSR 测试），维护三态 `light | dark | system`，读写 `localStorage` 键 `saas-theme`，将生效主题映射到 `<html class="dark">`。
- `apps/web/src/lib/theme-provider.tsx` — React Context 提供者，暴露 `useTheme()`，监听 `prefers-color-scheme` 变化并持久化用户选择。
- `apps/web/index.html` — 防 FOUC 内联脚本，在 JS 执行前按存储/系统偏好预置 `.dark` 类。
- `apps/web/vite.config.ts` — 注册 `@tailwindcss/vite` 插件。
- `apps/odoo-rpc-web/src/index.css` — 该应用的 Tailwind 入口，仅设置基础 `bg-gray-50 text-gray-900 antialiased`，无暗色模式。
- `apps/web/package.json` / `apps/odoo-rpc-web/package.json` — 声明 Tailwind v4 依赖。

## 3. 架构与约定

### 主题运行时
主题状态遵循“单一真源”原则：

1. `theme.ts` 是纯函数模块，导出 `readStoredMode` / `writeStoredMode` / `resolveEffective` / `applyTheme` / `prefersDark`。
2. `ThemeProvider` 在 React 树顶层持有 `mode`（用户显式选择）和 `effective`（解析后的 light/dark）。
3. 切换时先 `writeStoredMode` 持久化，再更新 state 触发 `applyTheme`，把 `.dark` 类加/减到 `document.documentElement`。
4. 当 `mode === 'system'` 时，订阅 `window.matchMedia('(prefers-color-scheme: dark)')` 自动跟随系统。
5. `index.html` 中的内联脚本与 `theme.ts` 语义同构，保证 SSR/首屏不闪烁。

### Tailwind 暗色模式
Tailwind v4 默认基于媒体查询的 `prefers-color-scheme`，但本仓库通过 `@custom-variant dark (&:where(.dark, .dark *))` 将其改为**手动类名驱动**——只有 `<html>` 上存在 `.dark` 时才启用暗色变体。所有暗色样式统一以 `dark:` 前缀书写，例如 `text-slate-600 dark:text-slate-300`、`border border-slate-200 dark:border-slate-700`。

### 颜色与排版
- 颜色族主要使用 `slate-*`（边框、文字、背景），辅以少量 `blue-*` 作为强调色。
- 字号以 `text-xs` / `text-sm` 为主，行高与间距通过 `gap-*`、`px-*`、`py-*` 组合。
- 圆角统一用 `rounded` / `rounded-lg`。
- 按钮风格：`rounded bg-slate-800 px-3 py-1.5 text-white hover:bg-slate-700 dark:bg-slate-100 dark:text-slate-900`。

### 组件组织
- 页面级路由位于 `src/routes/`，采用 TanStack Router 的文件式路由命名（如 `settings.roles.$roleId.tsx`）。
- 共享 UI 片段放在 `src/components/`（如 `forms.tsx`、`rbac-matrix.tsx`、`route-feedback.tsx`、`theme-toggle.tsx`）。
- 工具与上下文放在 `src/lib/`（认证、格式化、上传、主题等）。

### 响应式策略
未发现 `@media` 查询或断点变量；布局完全依赖 Tailwind 原子类（`flex`、`grid`、`w-full`、`max-w-*` 等），未观察到移动端专用适配层。

## 4. 约定与约束

- **样式语言**：仅使用 Tailwind 原子类 + 少量 `@layer base` 全局规则（`color-scheme`、`body` 基础样式），未见 SCSS/CSS Modules。
- **暗色模式开关**：必须通过 `lib/theme.ts` 的 `applyTheme` 操作 `<html>.dark`，组件内不得自行操作 DOM 类名。
- **暗色变体写法**：所有暗色样式统一使用 `dark:` 前缀，由 `@custom-variant` 绑定到 `.dark` 祖先元素。
- **主题持久化键**：固定为 `localStorage['saas-theme']`，值域限定为 `'light' | 'dark' | 'system'`，非法值回退到 `system`。
- **FOUC 防护**：`index.html` 必须在 React 加载前运行内联脚本预置 `.dark` 类，且其读取逻辑与 `theme.ts` 保持同构（注释明确标注“测锁映射一致”）。
- **错误处理**：`localStorage` 读取失败（隐私模式/禁用 Cookie）抛 `SecurityError` 时静默降级为 `system`；写入失败同样静默忽略，不影响当前会话。
- **Provider 契约**：`useTheme()` 在未包裹 `ThemeProvider` 时抛出 `Error('useTheme 必须在 ThemeProvider 内使用')`，禁止静默降级。
- **无设计令牌系统**：仓库未定义自定义 CSS 变量、design token 文件或调色板抽象，颜色与尺寸直接使用 Tailwind 内置色板。
- **无第三方 UI 库**：两个前端均未引入 Ant Design、shadcn/ui、MUI 等组件库，所有交互控件均为手写 React 组件。
- **odoo-rpc-web 子应用**：仅继承 Tailwind 基础样式，不包含主题切换能力，保持最简视觉基线。