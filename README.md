# IDMP 医疗质量指标数据管理平台前端

本项目是 IDMP 前端 demo 与后端联调版本，基于 Vue 3、Vite、Element Plus 和 ECharts 实现。

当前分支重点用于展示医疗质量指标从“数据资产、因子、指标配置、试算计算、看板展示、指标分析、系统联调”的核心业务链路。

## 技术栈

- Vue 3
- Vue Router
- Element Plus
- ECharts
- Vite
- pnpm

## 本地运行

```powershell
cd "IDMP-Frontend"
pnpm install
pnpm dev
```

默认访问：

```text
http://127.0.0.1:5173/
```

生产构建：

```powershell
pnpm.cmd build:prod
```

## 后端地址配置

前端 API 默认使用：

```text
/api/v1
```

部署到服务器时，由 Nginx 将 `/api/v1` 代理到后端服务。

如果本地需要直连后端，可以配置环境变量：

```text
VITE_API_BASE_URL=http://192.168.123.14:8081/api/v1
```

## 已实现页面

### 指标看板

路径：

```text
/dashboard
```

已实现功能：

- 默认指标看板展示
- 住院死亡率等核心指标卡
- 趋势图、饼图、预警列表、科室排名
- 编辑看板布局
- 拖拽、调整组件尺寸
- 添加、删除组件
- 添加组件时先选择指标数据，再选择展示形式
- 支持指标卡、柱状图、折线图、饼图等形式
- 指标卡点击跳转到指标分析页

后端接入情况：

- `GET /api/v1/indicators`
  - 用于看板编辑时加载可选指标数据
- 住院死亡率只读链路
  - 用于展示真实后端试算结果
- 分析看板接口已尝试接入
  - 如果后端 `quality-overview` 看板模板不存在，会使用前端兜底数据

说明：

- 看板布局当前保存在浏览器 `localStorage`
- 后端尚未提供完整的“保存用户看板布局”接口

### 指标管理

路径：

```text
/indicator
```

已实现功能：

- 指标列表展示
- 表格/卡片视图切换
- 指标编码、名称、分类、状态筛选
- 新增指标入口
- 编辑指标入口

后端接入情况：

- `GET /api/v1/indicators`
  - 查询后端指标列表

说明：

- 后端当前未实现指标详情、修改、删除、发布接口
- 因此删除指标、真正修改已有指标暂不可做

### 指标编辑

路径：

```text
/indicator/edit/new
```

已实现功能：

- 填写指标基本信息
- 保存指标基本信息
- 创建指标版本
- 配置公式
- 保存公式
- 公式校验
- 发起指标试算
- 查看试算结果

后端接入情况：

- `POST /api/v1/indicators`
- `POST /api/v1/indicators/{id}/versions`
- `PUT /api/v1/indicator-versions/{id}/formula`
- `POST /api/v1/indicator-versions/{id}/formula/compile`
- `POST /api/v1/indicator-versions/{id}/trial`
- `GET /api/v1/async-tasks/{taskId}`
- `GET /api/v1/calc/batches/{batchId}`
- `GET /api/v1/indicator-versions/{id}/trials/{batchId}/results`

说明：

- 当前公式 demo 使用已发布的住院死亡率相关因子版本作为公式引用基础
- 指标完整发布接口后端暂未实现

### 因子管理

路径：

```text
/factor
```

已实现功能：

- 因子列表展示与筛选
- 因子配置工作台
- 保存因子定义
- 校验 DSL
- 发起因子试算
- 查看因子试算结果
- 发布因子版本
- 开发验证工具：一键验证完整因子链路

后端接入情况：

- `POST /api/v1/factors`
- `POST /api/v1/factor-versions/{id}/compile`
- `GET /api/v1/compile-artifacts/{id}`
- `POST /api/v1/factor-versions/{id}/trial`
- `GET /api/v1/async-tasks/{taskId}`
- `GET /api/v1/calc/batches/{batchId}`
- `GET /api/v1/factor-versions/{id}/trials/{batchId}/results`
- `POST /api/v1/factor-versions/{id}/publish`

说明：

- 页面中的 `F-001`、`F-002` 等因子列表目前仍是前端演示数据
- 后端当前未提供因子列表、因子详情、新建版本接口
- 因子创建、编译、试算、结果查询、发布已经接入后端

### 数据管理

路径：

```text
/data
```

已实现功能：

- 数据域列表
- 创建数据域
- 查询数据域语义字段
- 来源映射同步
- 远程源表绑定数据域
- 开发验证工具：数据资产完整链路验证

后端接入情况：

- `GET /api/v1/meta/data-domains`
- `POST /api/v1/meta/data-domains`
- `GET /api/v1/meta/data-domains/{domainId}/semantic-fields`
- `POST /api/v1/meta/source-mappings/sync`
- `POST /api/v1/meta/source-tables/{tableName}/bind-domain`

### 指标分析

路径：

```text
/analysis
```

已实现功能：

- 指标分析页面
- 支持从下拉框选择已有分析配置
- 支持从指标看板点击指标卡跳转
- 已补充住院死亡率等指标分析页面
- 趋势、科室对比、构成、预警、说明等展示

后端接入情况：

- 指标列表接入：`GET /api/v1/indicators`
- 住院死亡率分析结果接入后端只读链路

说明：

- 后端尚未提供完整的多指标分析查询、下钻、导出接口
- 其他分析内容仍有部分 demo 数据兜底

### 计算任务中心

路径：

```text
/calc
```

已实现功能：

- 创建计算批次
- 查询异步任务状态
- 查询计算批次详情
- 查看计算目标和 DAG 节点
- 取消批次
- 失败节点重试

后端接入情况：

- `POST /api/v1/calc/batches`
- `GET /api/v1/async-tasks/{taskId}`
- `GET /api/v1/calc/batches/{batchId}`
- `POST /api/v1/calc/batches/{batchId}/cancel`
- `POST /api/v1/calc/nodes/{nodeId}/retry`

说明：

- 取消批次和节点重试会修改后端状态，演示时请谨慎操作

### 系统管理

路径：

```text
/system
```

已实现功能：

- 健康检查
- 登录
- 保存 accessToken
- 后续请求自动携带 `Authorization: Bearer <token>`
- 查询用户列表
- 创建角色
- 退出登录

后端接入情况：

- `GET /api/v1/health`
- `POST /api/v1/auth/login`
- `POST /api/v1/auth/logout`
- `GET /api/v1/system/users`
- `POST /api/v1/system/roles`

说明：

- 后端当前未实现 `auth/me`、`auth/refresh`、`logout-all`
- 角色创建会写入后端，重复 roleCode 会返回冲突

### 其他页面

以下页面目前主要为前端 demo 展示，后端接口尚未完整提供：

- 场景管理：`/scene`
- 指标映射：`/mapping`
- 预警中心：`/alerts`

## 当前已接入后端能力汇总

### 数据资产

```text
GET  /api/v1/meta/data-domains
POST /api/v1/meta/data-domains
GET  /api/v1/meta/data-domains/{domainId}/semantic-fields
POST /api/v1/meta/source-mappings/sync
POST /api/v1/meta/source-tables/{tableName}/bind-domain
```

### 因子

```text
POST /api/v1/factors
POST /api/v1/factor-versions/{id}/compile
GET  /api/v1/compile-artifacts/{id}
POST /api/v1/factor-versions/{id}/trial
GET  /api/v1/factor-versions/{id}/trials/{batchId}/results
POST /api/v1/factor-versions/{id}/publish
```

### 指标

```text
GET  /api/v1/indicators
POST /api/v1/indicators
POST /api/v1/indicators/{id}/versions
PUT  /api/v1/indicator-versions/{id}/formula
POST /api/v1/indicator-versions/{id}/formula/compile
POST /api/v1/indicator-versions/{id}/trial
GET  /api/v1/indicator-versions/{id}/trials/{batchId}/results
```

### 计算与异步任务

```text
POST /api/v1/calc/batches
GET  /api/v1/async-tasks/{taskId}
GET  /api/v1/calc/batches/{batchId}
POST /api/v1/calc/batches/{batchId}/cancel
POST /api/v1/calc/nodes/{nodeId}/retry
```

### 系统管理

```text
GET  /api/v1/health
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/system/users
POST /api/v1/system/roles
```

### 分析看板

```text
GET  /api/v1/analysis/dashboards
GET  /api/v1/analysis/dashboards/{code}
POST /api/v1/analysis/dashboards/{code}/query
```

说明：如果后端尚未配置 `quality-overview` 看板模板，前端会出现 404 并使用兜底数据。

## Demo 推荐操作流程

1. 进入“系统管理”
2. 执行健康检查
3. 如后端启用鉴权，先登录并保存 Token
4. 进入“数据管理”，查看数据域和语义字段
5. 进入“因子管理”，通过因子配置工作台创建、校验、试算并发布因子
6. 进入“指标编辑”，保存指标、创建版本、保存公式、校验公式、发起试算、查看结果
7. 进入“指标看板”，编辑看板，选择后端指标添加组件
8. 点击看板中的指标卡进入“指标分析”
9. 进入“计算任务中心”，用 taskId 或 batchId 查看异步任务和 DAG 节点状态

## 服务器部署

构建并上传到远程服务器：

```powershell
cd "F:\document\paperwork\项目\bilin\ruoyivue_goview\IDMP-Frontend\IDMP-Frontend"

pnpm.cmd build:prod

ssh ljh@192.168.123.14 "rm -rf ~/IDMP_UI/*"

scp -r .\dist\* ljh@192.168.123.14:~/IDMP_UI/
```

访问地址：

```text
http://192.168.123.14/
```

说明：

- 服务器 Nginx 当前静态目录为 `~/IDMP_UI`
- 每次上传前建议清空旧 `dist` 文件，避免旧 hash 文件残留

## 当前限制

- 因子列表、因子详情、新版本接口后端暂未实现
- 指标详情、修改、删除、发布接口后端暂未实现
- 看板布局保存后端接口暂未实现，目前保存在浏览器本地
- 场景管理、指标映射、预警、下钻、报表导出等仍以 demo 展示为主
- 部分图表数值仍使用前端兜底数据

## 分支说明

当前主要联调分支：

```text
feature/idmp-dashboard-backend-analysis
```

该分支包含当前 demo 所需的后端接口接入、指标看板编辑、指标分析扩展、数据管理、计算任务中心和系统管理页面。
