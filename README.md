# IDMP 医疗质量指标数据管理平台前端

本项目是 IDMP 医疗质量指标数据管理平台的前端 Demo 与后端联调版本，基于 Vue 3、Vite、Element Plus、ECharts 实现。

当前集成分支同时包含两部分进度：

- `Clinical-frontend` 分支的 UI 视觉优化进度。
- 因子管理、指标管理、指标看板、指标分析、计算任务、系统管理等后端接口联调进度。

当前推荐演示分支：

```text
integrate/clinical-factor
```

## 技术栈

- Vue 3
- Vue Router
- Element Plus
- ECharts
- Vite
- pnpm

## 本地运行

```powershell
cd "F:\document\paperwork\项目\bilin\ruoyivue_goview\IDMP-Frontend\IDMP-Frontend"
pnpm install
pnpm dev
```

默认访问：

```text
http://127.0.0.1:5173/
```

生产构建：

```powershell
.\node_modules\.bin\vite.cmd build
```

构建产物目录：

```text
dist
```

## 后端地址配置

前端 API 默认请求：

```text
/api/v1
```

部署到服务器后，需要由 Nginx 把 `/api/v1` 代理到后端服务。

本地直连后端时，可配置：

```text
VITE_API_BASE_URL=http://192.168.123.14:8081/api/v1
```

## 当前已实现页面

### 指标看板

路径：

```text
/dashboard
```

已实现：

- 展示住院死亡率、门诊人次数与出院人次数比等指标卡。
- 支持编辑看板布局。
- 支持拖拽、调整组件尺寸。
- 支持添加、删除组件。
- 添加组件时先选择指标数据，再选择展示形式。
- 支持指标卡、柱状图、折线图、饼图等展示方式。
- 指标卡可点击进入对应的指标分析页面。
- 看板编辑布局当前保存到浏览器 `localStorage`。

后端接入：

```text
GET /api/v1/indicators
住院死亡率只读结果链路
GET /api/v1/analysis/dashboards
GET /api/v1/analysis/dashboards/{code}
POST /api/v1/analysis/dashboards/{code}/query
```

实操验证：

1. 进入 `指标看板`。
2. 点击 `编辑看板`。
3. 点击添加组件。
4. 在指标数据中选择后端返回的指标，例如 `住院死亡率`。
5. 再选择展示类型，例如 `指标卡` 或 `折线图`。
6. 保存后页面出现该组件。
7. 打开浏览器开发者工具 Network，可以看到 `GET /api/v1/indicators`。

能证明：

- 前端已经从后端读取指标列表。
- 看板组件的数据选择来源不是纯前端写死。

说明：

- 如果后端暂未配置 `quality-overview` 看板模板，`analysis/dashboards/quality-overview` 会返回 404，前端会使用兜底展示数据。
- 这不影响住院死亡率等已接入的真实结果链路。

### 指标管理

路径：

```text
/indicator
```

已实现：

- 指标列表展示。
- 表格/卡片视图切换。
- 按指标编码、名称、分类、状态筛选。
- 新增指标入口。
- 编辑指标入口。

后端接入：

```text
GET /api/v1/indicators
```

实操验证：

1. 进入 `指标管理`。
2. 查看列表中的指标编码。
3. 如果后端已有住院死亡率指标，可以看到后端返回的真实编码。
4. 打开 Network，确认出现 `GET /api/v1/indicators`。

能证明：

- 指标管理页的指标列表已经接入后端。

当前限制：

- 后端已提供指标详情、版本查询和版本发布接口。
- 指标修改、删除暂不作为正式能力演示。

### 指标编辑

路径：

```text
/indicator/edit/new
```

已实现：

- 保存指标基本信息。
- 创建指标版本。
- 保存公式。
- 校验公式。
- 发起指标试算。
- 查询异步任务。
- 查询计算批次。
- 查看试算结果。

后端接入：

```text
POST /api/v1/indicators
POST /api/v1/indicators/{id}/versions
PUT  /api/v1/indicator-versions/{id}/formula
POST /api/v1/indicator-versions/{id}/formula/compile
POST /api/v1/indicator-versions/{id}/trial
GET  /api/v1/async-tasks/{taskId}
GET  /api/v1/calc/batches/{batchId}
GET  /api/v1/indicator-versions/{id}/trials/{batchId}/results
```

实操验证：

1. 进入 `指标管理`。
2. 点击 `新增指标`。
3. 在基本信息中输入：
   - 指标名称：`前端演示指标`
   - 指标编码：保持页面自动生成或输入唯一编码。
4. 点击保存基本信息。
5. 创建指标版本。
6. 在公式区使用已发布因子版本配置公式。
7. 点击保存公式。
8. 点击校验公式。
9. 点击发起试算。
10. 等待任务完成后点击查看结果。

能证明：

- 前端可以创建指标。
- 前端可以创建指标版本。
- 前端可以把公式提交给后端。
- 前端可以触发后端公式编译和试算。
- 前端可以读取后端异步任务、批次和试算结果。

当前限制：

- 指标正式发布接口已接入。
- 公式配置依赖后端已有或本次端到端流程中新建并发布的因子版本。

### 因子管理

路径：

```text
/factor
```

当前页面定位：

- `因子管理` 页面只做正式业务入口。
- 页面保留列表、筛选、新增、查看、编辑、发布状态展示。
- 原来的 `因子配置工作台` 和 `开发验证工具（完整流程）` 已从业务页面撤下。

已实现：

- 因子列表展示与筛选。
- 新增因子入口。
- 查看/编辑入口进入因子编辑页面。
- 发布状态展示。

后端接入：

```text
POST /api/v1/factors
POST /api/v1/factor-versions/{id}/compile
GET  /api/v1/compile-artifacts/{id}
POST /api/v1/factor-versions/{id}/trial
GET  /api/v1/async-tasks/{taskId}
GET  /api/v1/calc/batches/{batchId}
GET  /api/v1/factor-versions/{id}/trials/{batchId}/results
POST /api/v1/factor-versions/{id}/publish
GET  /api/v1/meta/data-domains
GET  /api/v1/meta/data-domains/{domainId}/semantic-fields
```

说明：

- `F-001`、`F-002` 等列表数据当前仍是前端演示目录。
- 后端暂未提供完整的因子列表、因子详情查询接口。
- 但是新增因子的保存、校验、试算、查看结果、发布已经接入后端。

### 新增因子完整演示

路径：

```text
/factor/edit/new
```

实操验证：

1. 进入 `因子管理`。
2. 点击右上角 `新增因子`。
3. 在 `基本信息` 中填写：
   - 因子编码：保持默认自动生成即可，例如 `FRONTEND_FACTOR_20260726153000`。
   - 因子名称：`住院死亡记录数`。
   - 说明：`统计住院死亡记录数量，作为住院死亡率分子因子。`
4. 在 `计算口径配置` 中选择：
   - 第一步：点击 `计数类因子`。
   - 第二步：数据来源选择 `INPATIENT_DEATH_RECORD` 或页面展示的住院死亡记录相关数据域。
   - 统计对象：不用选择，计数类默认统计记录数。
   - 第三步：统计周期先选择 `不限定统计周期`。
   - 第四步：分组维度不选择。
   - 结果单位选择 `人次`。
5. 查看顶部 `当前口径`，应出现类似说明：

```text
从【INPATIENT_DEATH_RECORD】中，按【计数】统计【记录数】，并按【不分组，输出一个汇总值】汇总。
```

6. 点击计算口径配置区底部的 `保存并校验口径`。
7. 成功后页面会显示：
   - 因子 ID。
   - 版本 ID。
   - 产物 ID。
   - 校验状态。
8. 往下到 `试算`。
9. 保持默认时间：
   - 开始时间：`2000-01-01T00:00:00`
   - 结束时间：`2030-01-01T00:00:00`
10. 点击 `发起试算`。
11. 试算完成后，到 `试算结果` 点击 `查看试算结果`。
12. 页面显示结果值后，到 `发布` 点击 `发布因子版本`。

能证明：

- 点击 `保存并校验口径` 后：
  - 证明 `POST /api/v1/factors` 已接通。
  - 证明 `POST /api/v1/factor-versions/{id}/compile` 已接通。
  - 证明 `GET /api/v1/compile-artifacts/{id}` 已接通。
- 点击 `发起试算` 后：
  - 证明 `POST /api/v1/factor-versions/{id}/trial` 已接通。
  - 证明 `GET /api/v1/async-tasks/{taskId}` 已接通。
- 点击 `查看试算结果` 后：
  - 证明 `GET /api/v1/calc/batches/{batchId}` 已接通。
  - 证明 `GET /api/v1/factor-versions/{id}/trials/{batchId}/results` 已接通。
- 点击 `发布因子版本` 后：
  - 证明 `POST /api/v1/factor-versions/{id}/publish` 已接通。

注意：

- 创建因子会写入后端数据。
- 因子编码必须唯一，重复编码可能会被后端拒绝。
- 如果选择 `按统计周期限定`，必须选择时间字段，否则前端会阻止保存。

### 数据管理

路径：

```text
/data
```

已实现：

- 数据域列表。
- 创建数据域。
- 查询数据域语义字段。
- 来源映射同步。
- 远程源表绑定数据域。

后端接入：

```text
GET  /api/v1/meta/data-domains
POST /api/v1/meta/data-domains
GET  /api/v1/meta/data-domains/{domainId}/semantic-fields
POST /api/v1/meta/source-mappings/sync
POST /api/v1/meta/source-tables/{tableName}/bind-domain
```

实操验证：

1. 进入 `数据管理`。
2. 查看数据域列表。
3. 点击某个数据域查看语义字段。
4. 打开 Network，确认出现：
   - `GET /api/v1/meta/data-domains`
   - `GET /api/v1/meta/data-domains/{domainId}/semantic-fields`

能证明：

- 前端已经可以从后端读取数据域。
- 新增因子页中的数据来源和字段选择不是纯前端写死。

### 指标分析

路径：

```text
/analysis
```

已实现：

- 指标分析页面。
- 支持通过下拉框选择已有分析配置。
- 支持从指标看板点击指标卡跳转。
- 已补充住院死亡率等指标分析页面。
- 趋势、科室对比、构成、预警、说明等展示。

后端接入：

```text
GET /api/v1/indicators
住院死亡率只读结果链路
```

实操验证：

1. 进入 `指标看板`。
2. 点击 `住院死亡率` 指标卡。
3. 页面跳转到 `指标分析`。
4. 页面标题和分析内容应切换到住院死亡率。
5. 如果后端已有住院死亡率结果，页面会展示真实结果值。

能证明：

- 看板指标卡和分析页已经联动。
- 住院死亡率分析链路已经读取后端结果。

当前限制：

- 后端暂未提供完整的多指标分析查询、下钻、导出接口。
- 非核心指标仍可能使用前端兜底数据。

### 计算任务中心

路径：

```text
/calc
```

已实现：

- 创建计算批次。
- 查询异步任务状态。
- 查询计算批次详情。
- 查看计算目标和 DAG 节点。
- 取消批次。
- 失败节点重试。

后端接入：

```text
POST /api/v1/calc/batches
GET  /api/v1/async-tasks/{taskId}
GET  /api/v1/calc/batches/{batchId}
POST /api/v1/calc/batches/{batchId}/cancel
POST /api/v1/calc/nodes/{nodeId}/retry
```

实操验证：

1. 进入 `计算任务中心`。
2. 输入已有的 `taskId` 或 `batchId`。
3. 点击查询。
4. 页面展示任务状态、批次状态、节点状态。

能证明：

- 前端可以查看后端异步任务和计算批次。
- 因子试算、指标试算产生的 taskId/batchId 可以继续在这里追踪。

注意：

- 取消批次、节点重试会修改后端状态，演示时谨慎操作。

### 系统管理

路径：

```text
/system
```

已实现：

- 健康检查。
- 登录。
- 保存 accessToken。
- 后续请求自动携带 `Authorization: Bearer <token>`。
- 查询用户列表。
- 创建角色。
- 退出登录。

后端接入：

```text
GET  /api/v1/health
POST /api/v1/auth/login
POST /api/v1/auth/logout
GET  /api/v1/system/users
POST /api/v1/system/roles
```

实操验证：

1. 进入 `系统管理`。
2. 点击 `健康检查`。
3. 如果后端正常，页面会返回健康状态。
4. 输入账号密码并点击登录。
5. 登录成功后，页面保存 token。
6. 再进入其他页面，请求会自动携带 `Authorization`。

能证明：

- 前端可以访问后端健康检查。
- 前端可以调用登录接口。
- 前端已经具备后续鉴权接口接入准备。

当前限制：

- 后端当前暂未完整实现 `auth/me`、`auth/refresh`、`logout-all`。
- 创建角色会写入后端，重复 roleCode 可能返回冲突。

## 当前已接入接口总览

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

## 推荐 Demo 演示顺序

1. 进入 `系统管理`，执行健康检查。
2. 如后端启用鉴权，先登录并保存 token。
3. 进入 `数据管理`，查看后端数据域和语义字段。
4. 进入 `因子管理`，点击 `新增因子`。
5. 按“新增因子完整演示”创建、校验、试算、查看结果并发布因子。
6. 进入 `指标管理`，查看后端指标列表。
7. 进入 `指标编辑`，演示指标创建、公式配置、校验和试算。
8. 进入 `指标看板`，编辑看板并添加后端指标组件。
9. 点击看板中的指标卡，跳转到 `指标分析`。
10. 进入 `计算任务中心`，用试算产生的 taskId 或 batchId 查看任务状态。

## 服务器部署

构建并上传到远程服务器：

```powershell
cd "F:\document\paperwork\项目\bilin\ruoyivue_goview\IDMP-Frontend\IDMP-Frontend"

.\node_modules\.bin\vite.cmd build

ssh ljh@192.168.123.14 "find ~/IDMP_UI -mindepth 1 -maxdepth 1 -exec rm -rf {} +"

scp -r .\dist\* ljh@192.168.123.14:/home/ljh/IDMP_UI/

ssh ljh@192.168.123.14 "sudo nginx -t && sudo systemctl reload nginx"
```

访问地址：

```text
http://192.168.123.14/
```

说明：

- 服务器 Nginx 当前静态目录为 `/home/ljh/IDMP_UI`。
- 每次上传前建议清空旧文件，避免旧 hash 文件残留。
- 当前 `dist` 已由 `integrate/clinical-factor` 分支构建生成。

## 当前限制

- 因子列表、因子详情和因子版本查询已接入；新建因子版本、删除接口暂未作为正式能力演示。
- 指标详情、版本查询和发布已接入；指标修改、删除接口暂未作为正式能力演示。
- 看板布局保存后端接口暂未提供，目前保存到浏览器本地。
- 场景管理、指标映射、预警、下钻、报表导出等仍以 Demo 展示为主。
- 部分图表数值仍使用前端兜底数据。

## 分支说明

当前集成分支：

```text
integrate/clinical-factor
```

来源：

- 基于 `origin/Clinical-frontend`。
- 合入因子管理与新增因子后端流程。
- 本地比远程 `origin/Clinical-frontend` 至少 ahead 1 个集成提交。

如需推送到 GitHub：

```powershell
git push origin HEAD:refs/heads/integrate/clinical-factor
```
