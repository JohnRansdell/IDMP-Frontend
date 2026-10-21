# Warning Nested Conditions: Real Acceptance

## Environment

- Frontend branch: `feature/warning-nested-group-rules`, local Vite port 5177.
- Backend branch: `feature/warning-nested-group-rules`, lab-server deployment `8e1fc2f`.
- No API interception, mock responses, fabricated result rows, or direct database writes.
- Indicator: `102027642463201862`; published version: `102027642463201863`.
- Real formula and factor/source configuration copied from published version `102027642463173253`.
- This isolated indicator does not replace existing dashboard result sets.
- Period: April 2026, `[2026-04-01, 2026-05-01)`.
- Combination grain: `OUT_DEPT_CODE` (24 results).
- Custom drill: hospital total (1 result), then `OUT_DEPT_CODE + OUT_DEPT_NAME` (24 results).

## Workflow

Create and compile the isolated indicator, run a real trial, then publish it.
Use the actual warning page to create, publish, and enable seven rules.
Submit a formal calculation through the calculation API and wait for Worker completion.
Read every formula result and independently derive the expected matching result IDs.
Compare event IDs, exact target/member scope, raw values, dimension snapshots, and frozen conditions.
Check a successful IN_APP delivery, notification content, and the browser event detail.
Recalculate the same period and verify that event counts do not increase.

The common expression is `(value > 0.4 AND NOT(value >= 1)) OR value = 0.25`.
Thresholds compare raw ratios, not percentage display strings.

| Rule | Expected | Actual |
| --- | ---: | ---: |
| Combination departments | 10 | 10 |
| Custom drill departments | 10 | 10 |
| Drill members 22, 21, 14 | 1 | 1 |
| Ungrouped hospital total | 1 | 1 |
| All stored grains | 21 | 21 |
| Exact 25% boundary | 2 | 2 |
| NOT(value >= 0), negative control | 0 | 0 |

Boundary rules also exercise LT, LTE, and NE; all six comparison operators and AND/OR/NOT are covered.
Member 22 is urology: 23 / 35 = 0.65714286 and triggers. Member 21 has value 0.2 and does not;
member 14 has value 1 and is excluded by NOT. Hospital total is 122 / 291 = 0.41924399.

Final formal batch: `102027642463210076`; repeated calculation: `102027642463210474`.
Event counts remained `[10, 10, 1, 1, 21, 2, 0]` after recalculation.
Sample event: `102027642463210386`; notification: `102027642463210453`.
The notification contains the full nested condition and department code/name.
Browser assertions report no page exceptions or failed API responses.

## Bugs Found And Retested

1. MAIN omitted the already-calculated hospital total when its target was a custom drill root.
   Fixed in backend `f5bcc27`, with unit and disposable MySQL regression tests; deployed before retesting.
2. Nested notifications used the old single-threshold template, leaving the threshold blank and omitting the group.
   Fixed in backend `8e1fc2f`, with three formatter regressions; deployed before final real retesting.

Both fixes were committed and pushed before deployment. No master merge was performed.
All acceptance rules are disabled afterward; the isolated indicator's automatic schedules are disabled.
Published definitions, formal results, and events are retained for inspection.

## Reproduction

```powershell
$env:IDMP_WARNING_LIVE_WRITE='1'
$env:IDMP_WARNING_LIVE_ITERATION='4'
node test/warning-nested-rules.live.e2e.mjs
```

This explicitly creates test data and real station notifications. Use an isolated acceptance environment.
Local state, raw evidence and screenshots are in ignored `.tmp/warning-real/`.
Advance the iteration when retesting after a fix to avoid reusing old idempotency keys and events.
