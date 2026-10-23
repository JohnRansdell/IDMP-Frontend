# 前后端真实场景语义核验（2026-10-23）

## 结论与边界

本轮未通过整体验收：发现 2 类 P2 问题和 2 类 P3 问题。接口成功不代表业务口径和前端展示正确。

使用真实后端、现有正式结果、冻结预警事件及源库聚合查询；浏览器读取实际 ECharts 数据，不使用模拟响应。未修改已发布定义、正式批次、预警规则或患者数据，未重新回补、部署、提交和推送。

环境：

- 前端 `D:/IDMP-Frontend-warning-rules`，`tat-dev`，`28fa4ce93a18431a2455ede0ce862d2b72a3dc1d`。
- 前端地址 `http://127.0.0.1:5177`；看板 ID `1189225114584501123`。
- 后端 `D:/idmp-warning-rules`，`master`，lab-server 部署版本 `64458731ca564e0c939f56ad0fd7bd3b444206c8`。
- 原始证据位于前端 `.tmp/semantic-audit-20261023/`；该目录不进入 Git，交接时需另行保留。

## 发现

### P2：同一看板“48 小时内转科”存在两种已发布口径

上方 KPI 使用精确时长，下方构成图绑定另一个指标，使用整小时截断。

| 位置 | 指标版本 | 分子因子版本 | 条件 |
| --- | --- | --- | --- |
| 上方 KPI | 102027642460514841 | 102027642460514816 | `TIMESTAMPDIFF(MICROSECOND, b.In_Date, t.In_Dept_Date) <= 172800000000` |
| 下方转科构成图 | 102027642461313071 | 102027642461312819 | `TIMESTAMPDIFF(HOUR, b.In_Date, t.In_Dept_Date) <= 48` |

`TIMESTAMPDIFF(HOUR, ...)` 截断小时，48 小时多也可能符合条件。源库独立去重核验：

| 月份 | 整小时截断分子 | 严格 48 小时分子 |
| --- | ---: | ---: |
| 2026-01 | 65 | 63 |
| 2026-02 | 70 | 69 |
| 2026-03 | 78 | 76 |

额外命中病例的最近转科时间为入院后 48 小时 10 分至 48 小时 58 分。一月分母均为 15505，KPI 为 63/15505，构成图使用 65/15505。

定位：已发布因子配置不一致，不是计算引擎随机算错。原始示例 SQL 自身采用整小时条件；若业务要求严格 48 小时，需要统一口径后另行发布、重算，不能只改图表。此次未改历史正式结果。

证据：`clinical-48h-boundary.json`、`clinical-48h-overrun.json`、`transfer-kpi-definition.json`、`factors.json`、`dashboard-Jan.json`。

### P2：非零百分比在看板明细表显示为 0

一月住院死亡率，科室 16（呼吸与危重症医学科）：源库死亡 1 人、出院 429 人。接口返回 `value: 0.002331`、`displayValue: "0.23%"`，元数据单位为 `PERCENT`，浏览器明细表却显示 `0`。

原因：通用表格调用无指标单位上下文的两位小数数字格式化；通用趋势/柱状坐标和默认提示也没有统一使用百分比格式。不能将原始比率 0.002331 直接当普通数字四舍五入，尤其不能据此判断为零事件。

定位：`src/idmp/features/dashboard/components/BindingWidget.vue:79`、`src/idmp/features/dashboard/bindingEngine.js:101`。

证据：`browser-summary.json` 中 `presentation-table-percent-format`、`mortality-table.png`、`browser-Jan.json`。

### P3：科室名称缺失提示与实际画面不一致

一月和 Q1 中药构成图有 53 个科室编码，其中 52 个能从字典显示名称，只有 833 未解析，仍提示“53 个科室未返回名称，暂显示科室编码”。

原因：PROJECTED 行保留原始字段是正确行为；但缺失诊断只检查行内名称，没有采用绘图时使用的字典解析结果。应按最终名称解析结果计数，不应为消除提示去改正式行身份。

另行查证：业务历史记录中 833 对应“新生儿科”，一月有 271 条出院记录；主数据表 `vmq_departments` 中确实没有 833。不是字典分页漏加载，也不能按同名将其猜成其他编码。历史主数据映射需要单独治理。

定位：`src/idmp/features/dashboard/dimensionNames.js:95`。

证据：`browser-summary.json` 中两条 `dictionary-diagnostic`、`browser-Jan.json`、`browser-Q1.json`。

### P3：看板预警卡片仍按单阈值展示嵌套规则

真实事件 `102027642463211133` 包含 AND/OR/NOT 条件树，卡片显示 `THRESHOLD` 和“当前值 0.41924399 / 阈值 -”。单一 `thresholdValue` 为空并不表示没有判定条件；嵌套规则不能用一个标量表示。

预警中心列表/详情本轮核验通过，但看板卡片没有对齐，未解释触发条件、结果范围和结果统计周期。该事件结果周期为 2026-04-01 至 2026-05-01，不能将触发时间当成统计周期。

定位：`src/idmp/features/dashboard/warningWidget.js:49`。

证据：`browser-summary.json` 中 `presentation-nested-warning-card`、`all-events.json`、`warning-results.json`。

## 已验证的真实业务链路

| 核验模式 | 通过检查数 | 主要断言 |
| --- | ---: | --- |
| matrix | 1279 | 月、季度、年及无数据周期，逐科室分子/分母/指标值与源库对账 |
| warnings | 142 | 冻结批次中 MAIN/GROUPED/ALL、嵌套与或非、边界、负例、事件完整性 |
| arithmetic | 178 | 多因子加减乘除、ROUND、历史试算参数、科室过滤与日维度源库对账 |
| adhoc | 19 | 即时查询、跨月、参数交集、无数据及非法参数 |
| drill-oracle | 111 | 一月/Q1、转科/中药、科室至医生层级与源库独立对账 |
| filters | 41 | 两科室筛选、KPI/图表、比较基期与源库对账 |
| grains | 6 | 真实组合、有候选但无数据组合、EXACT 模式缺少维度的正确拒绝 |

以上共 1776 条核验通过，证明所测链路按当前配置计算一致，不证明所有配置的临床口径正确。

具体核验：

- 一月中药费用/药品费用：1324534.51 / 35934177.62；Q1：3795157.32 / 100790436.76，按分子分母汇总后求比例，不取月比率平均。
- Q1 转科分母按住院号去重为 39990，不能把月分母直接相加为 42245。
- 四则公式：`ROUND(((总费用-(药品费用+耗材费用))/COUNT(DISTINCT VISIT_ID))*100,2)`。版本 `102027642463192691` 未发布，正式分析拒绝访问是正确约束；即时查询与两批历史试算分别按原参数核验，未冒充正式结果。
- 预警使用冻结批次 `102027642463210782` 核对，不混入其他历史批次；没有启用或重跑禁用规则。
- Jan-Feb 非完整季度，当前不支持整体汇总时明确拒绝，不拿二月结果冒充两个月结果；趋势仍展示各月。

浏览器回归：

- `dashboard-drill-indicator-value.live.e2e.mjs`：两张图、三类度量、桌面/手机、表格及返回。
- `dashboard-member-identity.live.e2e.mjs`：一至三月、Q1、历史同编码多名称分支。
- `dashboard-single-point.live.e2e.mjs`：三张趋势图单点/多点切换。
- `dashboard-chart-resize.live.e2e.mjs`：展开再收起数据表恢复标签。
- `dashboard-viewer-loading.live.e2e.mjs`：首屏不加载完整分析，多选确认后请求，按需进入指标分析。
- `analysis-independent-grain.live.e2e.mjs`：维度候选独立、真实有数据和无数据组合。
- `warning-event-detail.live.e2e.mjs`：11 个列表/详情/手机场景。
- `semantic-audit-browser.live.mjs`：291 条检查，287 通过，4 失败，归属上述 3 类展示问题；对照实际 ECharts 数据与源库，无数据切换清除旧图，桌面/手机截图，无横向溢出。

首屏性能单次实测：周期控件出现约 2668 ms，点击约 182 ms；10 次看板查询约 101867 bytes，最大长任务约 214 ms。仍存在长任务，单次结果不能代表 P95 或证明已完全不卡顿。

既有行为观察：柱状图在有非零值时主动隐藏零值分类，一月后端 53 科室而图中 23 科室。现有代码和单测明确如此，不是本次新增漏数；如业务要求展示全部科室，应提供显式配置或提示。

## 自动化测试与未覆盖范围

- 前端单测：821 通过、0 失败；见 `frontend-unit.log`。
- 后端 Maven：1115 条，1053 通过、61 跳过、1 环境错误。`IdmpApplicationTests.contextLoads` 因本机 MySQL 认证失败，不能宣称后端全通过。日志为后端 `.tmp/semantic-audit-maven.log`。
- 本轮没有新建并发布正式指标或预警规则，没有执行新的回补、并发重算、发布回滚、上传、SSO 和权限隔离测试。

## 复跑与校验方法

在前端目录，先确保 5177 前端代理可访问 lab-server。脚本依赖本机已配置的 `ssh lab-server` 和只读聚合工具，不包含凭据。

```powershell
node --test test/*.test.js
node test/real-scenario-reconciliation.live.mjs survey
node test/real-scenario-reconciliation.live.mjs factors
node test/real-scenario-reconciliation.live.mjs probe
node test/real-scenario-reconciliation.live.mjs source
node test/real-scenario-reconciliation.live.mjs matrix
node test/real-scenario-reconciliation.live.mjs warnings
node test/real-scenario-reconciliation.live.mjs arithmetic
node test/real-scenario-reconciliation.live.mjs adhoc
node test/real-scenario-reconciliation.live.mjs drill-oracle
node test/real-scenario-reconciliation.live.mjs filters
node test/real-scenario-reconciliation.live.mjs grains
node test/real-scenario-reconciliation.live.mjs clinical-boundaries
node test/semantic-audit-browser.live.mjs
```

后两项当前应报告上述问题并以非零退出码结束，不应以有数据为通过标准。`source` 默认复用已有周期缓存；源数据变化后须使用新的证据目录重新生成，避免混入旧快照。

独立 SQL 要点：转科分子直接关联原始入院行，并在该行执行时间条件；分母单独 `COUNT(DISTINCT In_Hospital_ID)`。按科室校验时同时保留编码与原始名称，不能先用统一名称强行合并不可加的去重结果。核验中曾发现测试辅助 SQL 预先抽取 eligible 住院号会串用同号不同入院行，已纠正年度参考值并重跑 matrix；该测试误差不计作产品缺陷。

## 百分比明细表修复复测

按用户要求，仅修复百分比明细表显示问题。`BindingWidget` 按每个字段的单位格式化，覆盖绑定表格、配置原始列的表格及图表的数据表；`PERCENT` 比率与已缩放的 `%` 数值分别处理，计数不套用百分比，分子分母保留各自单位语义。未改后端数据、数值聚合、图表数值和已发布配置。

- 真实一月看板重新核验：呼吸与危重症医学科实际单元格为 `0.23%`，证据 `mortality-table.png`、`browser-summary.json` 中 `presentation-table-percent-format` 已通过。
- 新增组件回归覆盖混合度量、原始列、图表数据表、零值、空值、已缩放百分比及计数，并断言图表仍保留原始比率。
- 前端单测 826 通过、0 失败，日志 `.tmp/percent-table-unit.log`。
- 最新完整浏览器语义回归仍有 3 条失败，属于初测发现的科室诊断提示和嵌套预警卡片问题，未扩展本次修复范围。上文 4 条展示失败为初测结果。

## 科室名称缺失提示修复复测

随后按用户要求修复科室诊断计数：行内缺少名称时，继续检查绘图使用的字典名称；有效字典名称不计入缺失，重复编码仅计一次，无效占位名称不能消除提示。保留 PROJECTED 原始行、科室编码和历史分支身份，不修改字典主数据。

- 真实一月及 Q1 看板均提示 `1 个科室未返回名称，暂显示科室编码。`，与图中实际未解析的 833 一致。
- 回归覆盖 53 科室中 52 个由字典解析、字典补全后消除提示、冻结行缓存命中、重复编码、无效占位名称和其他诊断的保留。
- 前端单测 829 通过、0 失败，日志 `.tmp/department-name-diagnostic-unit.log`。
- 浏览器语义回归的两条 `dictionary-diagnostic` 和百分比格式检查均通过；仅剩嵌套预警卡片的既有失败，未纳入本次修复。日志 `.tmp/department-name-diagnostic-browser.log`，证据 `browser-summary.json`。
