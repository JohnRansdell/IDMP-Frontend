# Dashboard BI Data Binding V1

## Current data audit

`analysisDashboard.fetchDashboardBootstrap` fetches definition and query in parallel.
The definition describes widgets/query codes, not a field metadata contract.
The consumed query contains `summaryCards`, `monthlyTrend`, `departmentRanking`.
`Dashboard.createDashboardSources` creates per-summary sources, but copies the SAME
monthly/department results to every summary source. Binding intentionally does not
reuse these copied arrays as per-indicator facts.

Existing flow: query/mock → source adapter → sourceCode/kpiIndex or preset →
`createDashboardChartOption` → shared WidgetRenderer → theme → IdmpChart.
Legacy line/bar/pie are single-measure options, not a generic row engine. KPI uses
formatted currentValue. Ranking uses independent departmentRanking. Warning keeps
its existing business event list. sourceName is a label; chartKind/visualType are
presentation choices, not data lineage.

New flow: raw dataset → Field Catalog → config.dataBinding → pure binding engine
→ visualization model → BindingWidget → chart option/theme → IdmpChart.
The same provided dataset resolver and renderer serve Designer, preview and Viewer.

## Available datasets and truth boundaries

- current: raw summary value (live), current metric value (demo).
- trend: raw monthlyTrend (live), selected source trendData + existing month labels (demo).
- departments: raw departmentRanking (live), source departmentData (demo).
- distribution: existing demo pieData; never pretend these category counts are a metric's rate.

No joins between monthly trends and department snapshots. No numerator/denominator,
YoY/MoM or department-month combinations invented. Extra scalar fields appear only
when present in raw rows. Backend monthly data is clearly labeled as a board-level
result, NOT the chosen summary indicator. Missing saved source shows a recoverable
binding error; no silent substitution. Current month labels support raw grain only;
no synthetic year/day or label-only time aggregation. Date classification is reserved
in Catalog; this release does not expose time rollups.

## Contract and semantics

```
config.dataBinding = {
  dataset: 'trend',
  dimensions: [{ field: 'month', label: '统计月份', granularity: 'raw' }],
  measures: [{ field: 'value', label: '指标值', aggregation: 'avg' }],
  series: [{ field: 'departmentName', label: '科室' }],
  sort: [{ field: 'month', direction: 'asc' }]
}
```

Only the binding is persisted, not rows, catalogs or compiled models. Existing config
and style are preserved by updateDashboardWidget; no schema version/whitelist change.
Selecting a dataset before first binding is UI-only. First field configuration enters
binding mode. Reset to preset removes dataBinding, explicitly marking the schema dirty.
Changing the dataset in binding mode clears incompatible slots. No automatic legacy migration.

KPI: one measure, no dimensions/series. Line/Bar: one dimension, 1+ measures,
0..1 series. Pie/Ranking: one dimension/measure, no series. Warning remains legacy.
All chart measures share one Y axis. Series and X must be different fields.

Rows with missing group keys are skipped. Measures accept finite numbers and strict
numeric strings; null/empty/invalid values are excluded, not coerced to zero. count
means valid numeric values, not row count. All-null groups remain empty even for count.
direct is the default and rejects multiple contributing rows, even equal values:
users must explicitly choose sum/avg/max/min/count. No medical trend semantics inferred.
Empty groups yield null gaps. Dimension sorting is numeric-aware; measure sort occurs
after aggregation. With split series, measure sorting uses the FIRST series (shown in UI).
Grouping/splitting identity uses structured keys, not delimiter concatenation.

## Verification

`pnpm test`: includes catalog/grouping/all aggregations/multi-measure/series/sort/
validation/empty states/reactive persistence/legacy boundaries.

`pnpm run test:e2e:dashboard`: existing core path followed by Binding Golden Path.
Binding test intercepts only dashboard HTTP reads with an explicit isolated fixture
containing month × department rows and numerator. It configures real Inspector slots
and uses the actual Save button, localStorage, document reload, Viewer, and Designer.
It does NOT call the engine to simulate browser interaction, and does NOT claim the
production backend returns this joint dataset. Original core layout checks still use
GridStack update API (not physical drag gestures).

Optional screenshots: set DASHBOARD_BINDING_VISUAL_DIR to a test artifact directory.

## Manual acceptance

1. Add Line, select its data tab, choose monthly dataset. Click X slot then month;
   click Y then value. If raw rows have department, add it to Series; otherwise no
   multi-department line can honestly be configured. Use avg only when intended.
2. Add Bar with department dataset, dimension = department, measure = value;
   select value descending sort. Add Pie with the same fields to inspect donut.
3. Add KPI with current dataset, measure = value, direct. Check displayed main value.
4. Save, reload into Viewer, re-enter Designer and compare every slot/aggregation/sort
   plus widget layout. Remove a required field and verify a configuration prompt.
5. Check legacy widgets and Warning still render, then explicitly restore preset on
   a bound widget. Never use real patient-identifying rows as demo data.

Human acceptance is separate from automated Chrome checks. Filters, linkage,
dual axes, formulas, new charts, schema V2 and server persistence remain out of scope.
