# Dashboard Query & Filter Model V1

## Audited query boundary

`analysisDashboard.fetchDashboardBootstrap` fetches the definition and POST query.
`Dashboard.buildDashboardQuery` sends year, month and deptCode. No general filter DTO,
multi-organization request, scene/category filter contract or field metadata API was
found in the current frontend consumer. The existing request uses AbortController;
this feature does not add network requests or change its cancellation lifecycle.

Results are independent current summaries, monthly rows and department snapshots,
not one shared fact table. sourceCode still identifies an individual source; some
backend monthly/department datasets are board-level results. The frontend adapters
retain that distinction. There is no manufactured department-month join.

New path:

raw dataset → queryAdapter → global conditions → component conditions → binding
engine grouping/aggregation/series/sort → shared BindingWidget → chart renderer.

Filtering is restricted to the already returned query universe. It cannot recover
records excluded by the existing backend period/department query or filter a preset
ECharts option as though it were raw rows. Legacy widgets retain existing behavior;
the Filter Bar explicitly says they do not participate in field filtering.

## Persistence and runtime

Dashboard.globalFilters holds definitions with id, label, field, dataType, type,
enabled and defaultValue. Types: select, multi-select, date-range.
No schema version bump. The root whitelist, snapshot, normalization and validation
were extended together. Missing globalFilters normalizes to []; read never writes
old localStorage. Snapshots treat missing and empty definitions equivalently.

Widget.config.query holds inheritGlobalFilters (default true) and
ignoredGlobalFilterIds (default []). Widget.config.dataBinding.filters holds
{ field, operator, value } conditions (default [] behavior).

Runtime values live in a separate page ref, initialized with copied default values.
Runtime controls never call updateDashboardWidget, markDashboardDirty or persistence.
Definition changes initialize defaults; reset copies current definition defaults,
not unconditional clearing. Static defaults only; no dynamic expressions or URL state.

## Compatibility and operator semantics

Catalog carries filterable, filterDataType, preferredFilterType and filterTypes.
Global compatibility requires the SAME field id and filter value type in each
widget's bound dataset. Similar labels do not imply a join or matching identifiers.
Options come from the unfiltered rows and do not cascade (no dependent filters).

Month labels such as 1月 are categorical time choices, never fabricated quarter/year
dates. Full ISO date fields can expose inclusive date-range filtering. Scene and
category controls are offered only when the actual rows contain those fields.
Current summary KPIs without department fields cannot be department-filtered;
a KPI bound to department-bearing raw rows can be filtered before its explicit aggregate.

Supported operators by type: string/boolean equals, notEquals, in, notIn;
number equals, gt/gte/lt/lte/between; date equals/before/after/between;
isEmpty/isNotEmpty for all types. Numeric conversion is strict; invalid numbers and
missing values are empty, not zero. Nulls do not match negative comparisons.
Global empty selections are inactive. Component in([]) matches no rows, not all rows.
between includes both endpoints; reversed ranges and invalid dates are diagnosed.
Global and component conditions are ANDed before aggregation.

Invalid persisted shapes are rejected by schema validation. Unknown fields are still
structurally legal (data can change): unavailable globals are shown in the bar;
incompatible widgets skip them. Invalid applicable/component conditions are skipped
with a visible diagnostic, not a renderer exception or a blank dashboard.

## UI and verification

No selection / 看板设置 → add/edit/delete/enable global definitions and static defaults.
The same DashboardFilterBar is outside GridStack in Designer, Viewer and preview.
Widget data tab → 添加条件 → reuse existing field picker → operator/value.
Scope controls opt out of all or selected globals without modifying their definitions.

`pnpm test` includes dashboard-filter.test.js (operators, dates, empty values,
AND-before-aggregation, ignored globals, reset, invalid fields, reactive persistence,
runtime isolation and legacy read-only normalization).

`pnpm run test:e2e:dashboard` runs the existing core/membership/binding paths, then
dashboard-filter-golden-path. Its explicitly isolated HTTP fixture has month,
departmentName, category, value and numerator; this is NOT proof that production
returns department-by-month-by-category facts. Real UI controls configure filters;
tests do not inject schema/runtime or call engines to simulate browser behavior.

The filter path covers KPI/Line/Bar updates, department + time, generic category,
reset to NONEMPTY month default, temporary selections surviving no storage write,
reload restoring defaults, component category AND, ignored department and unchanged
widget geometry. Optional screenshot: DASHBOARD_FILTER_VISUAL_DIR.

Manual acceptance must use real available fields: configure month (not an unsupported
quarter), organization and optional category; bind three widgets to compatible rows;
verify global changes, component AND, reset, save/reload and scope exclusions.
Human production-data acceptance remains distinct from automated fixture coverage.

Linkage, cross-filtering, drill-down, new charts, dynamic defaults, server persistence
and schema V2 are not part of this change.
