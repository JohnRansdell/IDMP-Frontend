# 全模块真实场景扩展测试（2026-10-23）

## 结论

**整体验收未通过。** 本轮扩展到全部主要业务模块，不再只测试质量看板；新增确认 5 类缺陷，前轮的 2 类配置/展示问题仍成立。模块有覆盖不等于其所有分支均通过，下文明确区分真实闭环、只读检查、未实现功能与环境限制。

- 前端：`D:/IDMP-Frontend-warning-rules`，`tat-dev`，HEAD `28fa4ce93a18431a2455ede0ce862d2b72a3dc1d`，地址 `http://127.0.0.1:5177`。
- 后端：`D:/idmp-warning-rules`，`master`，lab-server 部署 HEAD `64458731ca564e0c939f56ad0fd7bd3b444206c8`；后端工作区无修改。
- 保留用户之前要求的百分比明细表及科室名称缺失计数修复。本次新增内容为测试脚本和报告，未修复新发现的产品问题，未提交、推送或部署。
- 未编辑 `D:/idmp` 中其他认证工作；未替换已有正式结果、修改已有发布定义、改动患者数据或重跑真实预警。
- 隔离资源统一前缀 `QA_ALL_1792729132110`。注册表、请求响应、源库聚合及截图：`.tmp/full-system-audit-20261023/`。该目录不入 Git，证据需单独保留。

## 新确认的问题

### P2-1：取消批次后，节点执行记录未取消，无法重试

真实隔离批次 `102027642463617953`，一月复杂条件因子试算。提交后立即取消，经过后续复查：

| 层次 | 实际状态 |
| --- | --- |
| 批次 | CANCELLED |
| 计算目标 | CANCELLED |
| `job_calc_node.node_execution_status` | CANCELLED |
| `job_calc_node_execution.node_execution_status` | PENDING |
| 批次详情返回的两个节点 | PENDING |

对因子节点 `102027642463617956` 调用重试，返回 409：“只有失败、跳过或取消的节点可以重试”。不是完成与取消抢跑导致的临时显示差异，数据库只读核验也证实两层持久化状态不一致。

定位：[取消更新](/D:/idmp-warning-rules/idmp-infrastructure/src/main/java/com/idmp/infrastructure/calculation/JdbcCalculationTaskRepositoryAdapter.java:264)只更新逻辑节点；[重试](/D:/idmp-warning-rules/idmp-infrastructure/src/main/java/com/idmp/infrastructure/calculation/JdbcCalculationTaskRepositoryAdapter.java:283)与详情优先使用执行记录。

建议：取消动作同步最新执行记录及逻辑节点；重试时复查批次取消标记、执行轮次和下游状态，避免只修复界面显示。此次未修改数据库。

证据：`recovery-confirmed.json`、`cancellation-database-confirmed.json`、`recovery-review-summary.json`。同幂等键不同周期正确返回 409；已成功批次的迟到取消为无副作用操作，已成功节点重试被正确拒绝，均独立验证通过。

### P2-2：SQL 转页面配置不支持应支持的 COUNT(*)

真实请求：`POST /api/v1/sql-imports`，`definitionType: DSL`，显式绑定 `vmq_surgeryinfo` 的物理表映射：

```sql
WITH total AS (
  SELECT COUNT(*) n FROM vmq_surgeryinfo b
)
SELECT n FROM total
```

返回 HTTP 400：“聚合函数必须引用一个字段”。这份 SQL 有合法 CTE 和聚合列别名，不能归因于未使用 WITH。复杂 CTE 改用 `COUNT(b.id)` 后已完成真实试算，说明阻断发生在解析/转换阶段。

定位：[聚合函数转换](/D:/idmp-warning-rules/idmp-application/src/main/java/com/idmp/application/sqlimport/SqlIndicatorImportApplicationService.java:1584)使用 `function.isAllColumns()` 区分星号参数，需与实际解析器表示对齐，并补充 CTE COUNT(*) 回归。

不可普遍用 `COUNT(字段)` 绕过：可空字段会排除空值行，可能改变业务分母。必须保留 COUNT(*) 的计数语义。

证据：`sql-count-star-confirmed.json`、`contract-review-summary.json`。

### P2-3：指标分析和导出趋势未沿用百分比展示规范

真实指标“住院死亡率（质量安全看板）”，指标 `102027642460761108`，版本 `102027642460761114`。版本返回 `displaySpec: {format: PERCENT, multiplier: 100, scale: 2}`，旧指标基本单位为空。

- 一月真实值为 `55 / 14187 = 0.0038767886...`。
- 页面概览及 PDF 概览正确显示 `0.39%`。
- 页面趋势、PDF 趋势表显示 `0.0038767886`，纵轴没有百分比单位。
- 不是后端算错，也不是应给旧指标强制写入默认单位；前端已取得展示规范，却只按基本资料里的 `unit === '%'` 处理趋势。

定位：[分析展示资料](/D:/IDMP-Frontend-warning-rules/src/idmp/views/IndicatorAnalysis.vue:479)、[趋势转换](/D:/IDMP-Frontend-warning-rules/src/idmp/views/IndicatorAnalysis.vue:1053)、[PDF 趋势表](/D:/IDMP-Frontend-warning-rules/src/idmp/features/analysis/pdfReport.js:14)。这与此前已经修复的看板明细表是不同入口。

建议：概览、趋势、提示、表格和导出共享版本展示规范，明确原始比率与已缩放值，不改写原始值或基本资料单位。

证据：`analysis-presentation-confirmed.json`、`browser-presentation-summary.json`、`real-mortality-analysis-payload.json`、`mortality-pdf-1.png`、`mortality-pdf-2.png`。

### P2-4：分析页忽略真实目标值，同时绘制虚构的零目标线

同一真实死亡率版本的目标接口返回：`targetValue: 0.003`、`targetDisplayValue: 0.30%`、`LOWER_IS_BETTER`、`resourceVersion: 5`。看板及科室结果使用该目标，但分析页通用资料固定为“目标值未配置”、`markLineValue: null`。

此外，`Number.isFinite(Number(null))` 为真，趋势图将 null 画为 `yAxis: 0` 的红色虚线，标签却是“目标值未配置”；该线也进入 PDF。

定位：[固定通用资料](/D:/IDMP-Frontend-warning-rules/src/idmp/views/IndicatorAnalysis.vue:1393)、[目标线判定](/D:/IDMP-Frontend-warning-rules/src/idmp/views/IndicatorAnalysis.vue:855)。需要同时接入真实目标和修复空值判断，不能仅隐藏错误文案。

证据：`analysis-presentation-confirmed.json` 中接口目标、实际 Vue/ECharts 配置；`mortality-pdf-1.png`。

### P3-1：手机端长指标标题与操作按钮重叠

390 × 844 视口打开真实复杂公式指标详情，长标题与“更多关联”“返回指标目录”“编辑指标”三个按钮相交。页面没有横向滚动，但这并不代表布局合格。

已同时核验截图和元素边界交集，未用单纯 `scrollWidth` 代替视觉检查。

定位：[公共标题布局](/D:/IDMP-Frontend-warning-rules/src/idmp/styles/index.scss:437)、[PageHeader](/D:/IDMP-Frontend-warning-rules/src/idmp/components/PageHeader.vue:1)。建议窄屏动作行下移，标题允许完整换行。

证据：`mobile-heading-overlap.png`、`browser-review-summary.json`、`browser-presentation-summary.json`。

## 前轮问题与风险复核

### 仍成立的两类问题

1. **P2：同一看板转科 KPI 与构成图临床口径不同。** KPI 使用精确 48 小时，构成图使用整小时截断。源库一至三月分别为严格 `63/69/76` 与截断 `65/70/78`；额外命中发生在 48 小时 10 分至 48 小时 58 分。属于已发布定义不一致，不应仅修改前端或默默重算。
2. **P3：看板嵌套预警卡片仍用单阈值展示。** 真实事件 `102027642463211133` 有 AND/OR/NOT 条件树，却显示 `THRESHOLD` 与“当前值 / 阈值 -”，缺少完整条件、结果范围和结果周期。[定位](/D:/IDMP-Frontend-warning-rules/src/idmp/features/dashboard/warningWidget.js:49)。预警中心列表/详情与该看板卡片不是同一实现。

完整前轮源库对账和证据见 [真实场景语义核验](/D:/IDMP-Frontend-warning-rules/docs/testing/real-scenario-audit-20261023.md)。该报告中的百分比明细表和科室缺名计数缺陷已按用户要求修复、复测，不计为当前未修复问题。

### 不应误报为产品缺陷的情况

- 常量默认量纲为 ONE，直接用于比率的 CLAMP/比较会被后端拒绝，但页面确实提供“常量量纲/单位”。实际页面将上下限改为 RATIO 后，保存、校验和试算完整通过，结果 `CLAMP(14187/14187,0,1)=1`。这是易错的交互/类型配置要求，不能说前端不支持函数或无法配置常量类型。
- 科室主字典真实有 1045 个编码，完整分页与预警成员游标分页逐个一致，无重复或遗漏。初次辅助脚本只读字典默认 100 条、成员只遍历前 700 条的失败已纠正，不是接口漏数。
- 历史科室 833 不在当前主字典。仍需主数据治理，不猜测其等于另一个同名科室编码。
- 未授权场景覆盖不能发布、没有政策依据不能提交指标映射、发布版本不可直接改定义，均为正确业务约束。
- 源库比率和格式化百分比不是同一个数值。例如急诊三级手术 `995/13170 = 0.07555049...`，显示 `7.56%`；不能拿先四舍五入后的百分比除以 100 反过来要求原始比率完全相等。
- 参考脚本也修正了 JSON 键顺序、返回分页位置、EXACT 值集枚举、参数大写、PENDING_REVIEW 状态等契约假设。保留原日志，不把这些旧失败混入最终缺陷数。

## 模块覆盖矩阵

| 模块 | 本轮已实际核验的内容 | 边界 |
| --- | --- | --- |
| 原子因子 | 物理表创建、嵌套 AND/OR/NOT、草稿修改、过期版本拒绝、编译、即时查询、试算幂等、发布锁定 | 一月复杂条件源库 6416，非仅接口成功 |
| 复合因子 | 两个真实费用因子求比、冻结依赖图、精确叶子版本、源因子删除保护 | 与独立费用聚合后相除一致 |
| 因子模板 | 参数 schema、默认值、两个不同参数实例、发布锁定、复制、反向实例、真实页面实例化 | 3/4 级手术 COUNT 分别对源库；模板仍要求域 |
| 指标公式 | 四因子加减乘除 ROUND、元数据和公式往返、发布锁定、正式结果及试算 | `(233421237.38-(35934177.62+64081892.74))/14187*100` 舍入后 `940333.88` |
| 函数/边界 | MIN/MAX/AVG/MEDIAN/PERCENTILE/CLAMP/ABS/IF/COALESCE、除零 NULL/ZERO/ERROR、IF 未选分支短路 | 按实际后端量纲约束；页面 CLAMP 完整闭环通过 |
| SQL 导入 | CTE 解析、表映射、元数据恢复、幂等、两因子试算、比例与百分比、放弃清理 | COUNT(*) 缺陷未通过；未伪装为导入全部通过 |
| 数据域/字段 | 隔离域、物理表绑定、语义字段、默认时间字段、错误类型拒绝、值集真实关联 | 语义字段查询与源库物理字段查询一致 |
| 物理表关联 | 关系创建、真实键校验、发布、基于关系配置 JOIN 因子、即时查询、停用 | 独立 JOIN 源库聚合核对；未改原有关系 |
| 值集 | EXACT/RANGE/CONTINUOUS、重叠/重复/边界、复制、发布、乐观锁 | 无效数据按保存或验证契约拒绝 |
| 来源标准化 | 全源值画像、全部性别桶计数、转换预览守恒、TRIM 后重复拒绝、发布锁定 | 仅隔离字段映射使用测试规则 |
| 下钻路径 | 可复用路径创建、有序字段身份、验证、发布锁定、版本复制、最少两级 | 另有前轮科室至医生源库核对 |
| 场景 | 关联指标、月/季度策略、预览、未授权覆盖拦截、发布、复制、反向关联 | 实际页面保存再刷新，隐藏参数与 QUARTERLY 策略未丢失 |
| 政策文件 | TXT 真上传、SHA256、并发去重、错误哈希/扩展名拒绝、逐字节下载、发布和指标真实引用 | 211 字节完整验证；不是 100 MiB 极限压测 |
| 指标映射 | 源/目标真实政策约束、提交、驳回理由、修改、重提、审批、发布、失效、过期版本拒绝 | 完成整个审核流程，最终 INVALIDATED |
| 看板管理 | 隔离看板保存、乐观锁、复制、两次发布、历史恢复 | 四组件与原查询逐行一致，53 科室死亡率逐行源库对账 |
| 看板分析 | 月/季/年、自定义区间、空周期、多科室筛选、单点、数据表、下钻、成员身份、按需加载 | 前轮 1776 项语义核验继续作为对应链路证据 |
| 指标分析/导出 | 正式/即时概览、趋势、科室排名、复杂公式详情、真实页面 PDF 下载与三页渲染 | PDF 概览数值正确；趋势格式和目标线未通过 |
| 计算/DAG/血缘 | 正式任务、幂等冲突、5 个节点摘要与分页值、同批次/同快照的四个精确因子结果身份 | 取消与重试未通过；未替换业务正式结果 |
| 调度 | 非法 cron/时区拒绝、隔离禁用计划持久化、重复暂停 | 未启用，不冒充计划到点执行验证 |
| 预警规则/事件 | 禁用规则嵌套条件往返、非法 NOT、过期保存、发布锁定、真实组合与下钻范围、全科室成员分页 | 事件 MAIN/GROUPED/ALL 和条件语义使用前轮冻结批次 142 项对账 |
| 目标值 | 隔离指标设置、精度/原始值、方向配对、乐观锁、清空保留 null | 分析页读取展示缺陷另列，不能由写入通过推断读取通过 |
| 回收站 | 因子/指标删除影响、过期删除/恢复拒绝、软删除后查询拒绝、精确身份和 DSL 恢复 | 没有永久清除；仅操作本轮自建资源 |
| 目录分页/导航 | 9 类分页连续性、总数、越界空页、35 个页面、生成编码可修改 | 不将打开页面等同该页所有操作通过 |
| 登录/系统/通知 | 健康和用户列表读取、匿名 me 拒绝、未知账号登录拒绝、无 CSRF 刷新拒绝 | 正向登录、授权隔离与外部消息未验收，见下文 |

## 浏览器与自动化结果

- 35 个真实页面路由无前端运行时异常。最初两个失败是标题断言不正确（指标目录/表单 input 中的模板名），已通过只读复核纠正。
- 复杂公式详情包含四个真实因子和常量；已发布版本不能覆盖保存。因子和指标编码自动生成且允许手动修改，模板页面也真实创建了因子草稿。
- 场景页面真实保存并刷新，未丢失后端默认参数和指标季度策略。
- 手机页宽度检查通过不等于视觉通过：本轮增补元素交集和截图，发现长标题遮挡。
- 前端最终 `npm test`：**829 通过，0 失败**。日志 `frontend-unit-final.log`；`git diff --check` 和新增脚本语法检查通过。
- 前轮同版本后端 Maven：1115 项，1053 通过、61 跳过、1 环境错误。本机 MySQL 认证导致 `IdmpApplicationTests.contextLoads` 失败，不报告为后端全通过。
- 前轮 1776 项真实语义检查与本轮 CRUD/生命周期/浏览器检查不是同一统计口径，不简单相加。
- 原始 `*-summary.json` 留有辅助脚本纠错历史，不直接相加失败数或通过数。最终判断以本报告注明的复核证据为准。

## 未覆盖或当前不可验收

1. 没有可用测试账号凭据和启用权限隔离的完整环境，不能验收正向登录、刷新轮换、全端退出、RBAC、SSO、公钥/第三方 token、科室行级权限。匿名业务接口当前可访问是部署模式事实，不是权限测试通过。
2. 未向真实用户发送消息，未修改真实事件的确认/关闭或真实通知已读状态；无隔离收件测试账号，外部飞书/邮件/OAuth 链路未验收。
3. 本轮没有新启用周期调度，也没有重新发布时序指标触发全历史自动回补，未覆盖调度到点、故障注入、断电恢复与跨实例 Worker 竞争。既有历史结果和源库核验不能替代这些运行态测试。
4. 政策文件下载 Range 请求返回 200 全文件，字节正确但不是 206 断点续传；没有宣称具备分块上传或断点续传。100 MiB 大文件、网络中断和极限并发未压测。
5. 指标目录“批量导出”明确禁用，因子“批量导入”提示接口尚未接入，这些功能尚未实现，不能列为已验收通过。
6. 不是全量组合穷举、所有浏览器或长期性能压测。每个模块已列实际覆盖深度，不能承诺系统没有其他缺陷。

## 测试资源及安全收尾

为保留复现，隔离指标/因子、场景、模板、值集、政策、下钻路径和看板仍在测试服务器，均带上述 QA 前缀。不要作为正式临床指标或政策使用，也不要依赖其作为生产数据。

- 测试预警规则 `7637683467584424157` 始终 DISABLED，没有为真实用户生成通知。
- 测试调度 `102027642463617893` 始终 PAUSED，`nextTriggerAt: null`。
- 测试物理关系 `resources.json` 中的 relation 已停用，其临时 JOIN 因子仅软删除，可从回收站恢复。
- SQL 导入会话 `3cc0eccb-e9f7-4247-a754-22fd6b0b3cf8` 已 ABANDONED，半成品清理完成。
- 取消缺陷复现批次被保留；其他辅助试算已结束，没有留下正在执行的本轮测试任务。
- 回收站验收资源已恢复，无永久删除。`closure.json` 保存禁用状态与收尾证据。
- 本轮没有修改新产品代码或部署；前端 dev server 继续运行于 5177。

## 脚本入口与复核

测试脚本：

- `test/full-system-audit.live.mjs`：真实 API 生命周期、源库聚合、数据身份、边界与恢复核验。
- `test/full-system-browser.live.mjs`：35 路由、模板创建、场景往返、公式详情、编码与窄屏检查。
- `test/full-system-browser-review.live.mjs`：真实页面常量类型修改、保存校验试算、PDF、分析语义与标题几何检查。

**创建型 mode 不完全幂等，不要针对同一注册表重跑创建流程。** 保留注册表用于定位；新的全量运行应使用独立证据目录和新前缀，并控制发布及计划副作用。可以复核：

```powershell
node test/full-system-audit.live.mjs factor-review
node test/full-system-audit.live.mjs template-review
node test/full-system-audit.live.mjs arithmetic-review
node test/full-system-audit.live.mjs warning-review
node test/full-system-browser-review.live.mjs presentation
npm test
```

`presentation` 目前应报告已确认的分析展示和手机布局问题，不应为了得到绿色结果删掉断言。`recovery-review` 会对本轮隔离取消节点执行重试探测，修复后可能真实开始试算，须按注册表确认测试资源后再运行。
