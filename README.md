# IDMP 指标管理平台前端演示

本项目是基于 Vue 3、Vite、Element Plus 与 ECharts 实现的本地高保真演示前端。

项目不包含后端接口、数据库、登录鉴权、动态菜单、真实上传下载或数据持久化。页面数据均来自 `src/idmp/data/demo.js`，刷新后恢复初始状态。

## 页面

- 指标看板
- 指标管理
- 指标编辑
- 因子管理
- 场景管理
- 指标映射
- 指标分析
- 预警中心

“数据管理”和“系统管理”仅保留为禁用菜单。

## 本地运行

```powershell
corepack enable pnpm --install-directory "$env:APPDATA\npm"
pnpm install
pnpm dev
```

访问 `http://127.0.0.1:5173`。

## 生产构建

```powershell
pnpm run build:prod
```
