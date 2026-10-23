# Indicator Names, Creation Codes and Department Drill Acceptance

Branch: `feature/warning-nested-group-rules`. Backend deployed from pushed commit
`be7509d11c05d15332aa8928eca8323ac7991979`; API and worker health verified.

## Automated Verification

- Frontend: 768 unit tests passed; production build passed.
- Backend: 1,107 tests, zero failures/errors, 61 intentional skips. Excluded
  `IdmpApplicationTests`, which requires external runtime credentials. Local
  packaging skipped executable repackaging due to D: disk capacity; remote
  deployment built both executable archives successfully.
- `test/indicator-name-code.live.e2e.mjs`: 21 checks passed against the deployed
  API and real source database, without response mocking.
- `test/dashboard-department-drill.live.e2e.mjs`: real ECharts mouse clicks passed
  at 1600 x 1000 and 390 x 844, with no browser runtime errors.

## Real Hospital Scenario

Acceptance tag: `NAME_CODE_1792616189518`. Two ordinary indicator records
`102027642463211571` and `102027642463211572` shared the exact same display name
but had different generated codes. Renaming into the occupied name and restoring
one from the recycle bin succeeded. Duplicate indicator code still returned
409 / `COMMON-40900`. Factor-name duplication still returned
409 / `FACTOR-40901`.

Ordinary factor/indicator editors, template instantiation and SQL import showed
automatically generated editable codes. A manually edited template-instance code
was persisted, compiled and trialled. SQL import generated independent factor and
indicator codes, retained edited codes in saved metadata, and resumed after reload.
Its third indicator reused the same display name and trialled successfully.

Business SQL: third-level surgeries in `vmq_surgeryinfo`, with emergency surgeries
identified by `surgery_classfy='2'`. A separate read-only source query returned
13,170 total surgeries and 995 emergency surgeries. The platform trial returned
the same numerator and denominator, raw ratio `0.07555049`, display `7.56%`.
Trial batch: `102027642463211619`; indicator version: `102027642463211613`.
All acceptance factors and indicators were soft-deleted after checks; original
production definitions and dashboard configuration were untouched. The published
acceptance template remains reusable at version `102027642463211493`.

## Existing Quality Dashboard Regression

Dashboard: `1189225114584501123`; widget: `dashboard-widget-1791875881995-2`.
The department dictionary calls code `9012` `骨科（东院）`, while the frozen
calculation snapshot stores `骨科(东院)`. The old frontend added the newer display
name to drill parent keys, requiring both code and changed name to match. The
backend correctly returned no rows for that inconsistent filter.

Projected drill navigation now adds only the configured member identity, retaining
server-provided parent context and explicit filters. It does not add dictionary
labels as identity predicates or modify historical snapshots. Clicking the real
pie sector now sends `parentKeys: {"科室":"9012"}`, `filters: {}` with snapshot
`102027642462389880` and returns four doctors, including 刘湘 (14.56%) and
李天鹏 (2.64%). Both desktop and mobile chart/table checks passed.

## Repeat

```powershell
$env:IDMP_LIVE_WRITE='1'
$env:IDMP_TEMPLATE_VERSION_ID='102027642463211493'
D:/nodejs/node.exe test/indicator-name-code.live.e2e.mjs
D:/nodejs/node.exe test/dashboard-department-drill.live.e2e.mjs
```

Live-write acceptance requires an isolated resource namespace and a running API
and worker. It records evidence under ignored `.tmp` and recycles only its own
resources; it must never be pointed at unrelated IDs for cleanup.
