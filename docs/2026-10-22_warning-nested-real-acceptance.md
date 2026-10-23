# Warning Nested Conditions: Real Acceptance

The formal calculation/rule evidence below records the earlier result-derived
member catalog. Department candidates now use the source master dictionary;
see `2026-10-22_department-dictionary-acceptance.md` for the new 1,045-member
regression and the separately verified missing source-master code `833`.

## Environment

- Frontend branch: `feature/warning-nested-group-rules`, local Vite port 5177.
- Backend branch: `feature/warning-nested-group-rules`, lab-server deployment `f0187e1`.
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

Final formal batch: `102027642463210782`; repeated calculation: `102027642463211180`.
Event counts remained `[10, 10, 1, 1, 21, 2, 0]` after recalculation.
Sample event: `102027642463211088`; notification: `102027642463211157`.
The notification contains the full nested condition and department code/name.
Browser assertions report no page exceptions or failed API responses.

## Bugs Found And Retested

1. MAIN omitted the already-calculated hospital total when its target was a custom drill root.
   Fixed in backend `f5bcc27`, with unit and disposable MySQL regression tests; deployed before retesting.
2. Nested notifications used the old single-threshold template, leaving the threshold blank and omitting the group.
   Fixed in backend `8e1fc2f`, with three formatter regressions; deployed before final real retesting.

3. The member selector used selected values as its only options. Earlier browser
   acceptance manually entered member codes and therefore did NOT cover candidate
   loading. The previous end-to-end claim was incomplete for this workflow.
   Backend `f0187e1` and frontend `bc06882` add active-result candidate discovery,
   literal search, cursor paging, error/retry state, and stale-response protection.
   The real nested acceptance script now clicks loaded options instead of typing
   member codes. All seven rules and 45 events were verified again in iteration 4.

All backend fixes were committed and pushed before deployment. No master merge was performed.
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

## Member Candidate Regression

`node test/warning-members.live.e2e.mjs` is a read-only real API/browser regression
for this exact indicator. It does not intercept APIs or save rules.

- BASE returns 54 distinct department codes across active formal periods, including
  every one of the 24 April departments. Candidates are not restricted to April.
- Five-item API cursor pages concatenate exactly to the complete candidate list.
- The page loads 50 options, then the remaining four through "加载更多成员".
- Codes 22, 21 and 14 are selected by clicking actual options, without manual entry.
- Remote search for 22 returns that code; switching targets clears prior selections.
- The custom drill target loads both code and name candidates; 泌尿外科 is selectable.
- Desktop and 390px mobile screenshots checked; no horizontal overflow or page errors.
- Evidence: ignored `.tmp/warning-members/{checks.json,candidates.json,*.png}`.
- Frontend: 16 targeted unit/component tests, mocked browser workflow and build pass.
- Backend: 2 application, 4 controller and 2 real MySQL member-query tests pass.
- After the final run, all 27 current/historical acceptance rules were verified
  DISABLED, and the four indicator schedules remain PAUSED.
