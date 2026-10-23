# Department Dictionary Acceptance

## Source and Deployment

- Backend: `feature/warning-nested-group-rules`, deployed `2c53584` to lab-server.
- Frontend: same branch, runtime at `http://127.0.0.1:5177`.
- Source: configured source database, `vmq_departments`, all rows without status filtering.
- Independent read-only export: 1,045 rows and unique department codes. Every code/name
  returned by the paginated dictionary API exactly matched the independent source export.
- `0101` remains a string and resolves to 测试门诊; `22` resolves to 泌尿外科.
- API and Worker both logged initial count=1045 and successful refresh count=1045
  five minutes later on their dedicated department dictionary scheduler.
- No production master-table, clinical data or calculation-result records were changed.
- No extra master table, configuration JSON copy or hard-coded department member list.

## Regression Coverage

- Frontend: all 766 unit/component tests pass; production build passes.
- Backend: all-module packaging passes; 1,106 tests discovered, zero failures/errors,
  61 optional tests skipped, using `mvn test -Dtest=!IdmpApplicationTests
  -Dsurefire.failIfNoSpecifiedTests=false`.
- The unconfigured local `IdmpApplicationTests` smoke test was separately attempted
  and failed because the default local MySQL root account rejected the connection.
  It was not silently counted as passing. Actual deployed API/Worker startup and
  health checks passed with the configured source/platform connections.
- Dictionary unit/adapter tests verify full source reads, leading zeros, paging,
  code/name search, complete snapshot replacement, rejected conflicting names,
  failed-refresh retention and independence from calculated member/result tables.

## Real Browser Checks

`node test/warning-members.live.e2e.mjs`:

- All 1,045 master codes are returned by bounded cursor pages.
- Actual UI loads 50 candidates then another 50; search resolves code or name.
- Actual options for 22, 21 and 14 are selected; labels are names plus codes,
  while values remain codes. Switching target clears previous selections.
- Custom drill name candidates and desktop/390px mobile layouts pass.
- All code/name selectors share three dictionary page requests, not per-code
  previews or drill requests. No browser errors and no rule saves.
- Evidence: ignored `.tmp/warning-members/`.

`node test/dashboard-department-live.e2e.mjs`:

- Existing real `test` dashboard, April 2026, KPI and PIE backed by different
  indicator field contracts (`OUT_DEPT_CODE` and `科室`).
- Candidate names come from the same master dictionary, including non-result codes.
- API and browser single selection (5) and multiple selection (5,22) pass.
- Selections are confirmed through the real filter command. Requests carry codes;
  reset restores the initial KPI. No persistent dashboard changes or browser errors.
- Evidence: ignored `.tmp/dashboard-department-live/`.

`node test/department-dictionary-quality.live.e2e.mjs`:

- Actual 质量安全看板真实指标验收 (`1189225114584501123`), 12 total widgets:
  all 11 indicator-backed widgets render ready, plus the warning-event widget.
- Full 1,045-option master list, names and leading-zero code verified in the UI.
- Selecting 5 and 22 does not issue individual data refreshes before confirmation.
  Confirmation sends both codes to compatible indicator queries. After query loading
  finishes, all 11 indicator widgets render ready again and the mortality table
  contains exactly two rows, 产科 and 泌尿外科, rather than stale all-department data.
  Widgets without a compatible department field retain their original query scope.
- Exactly three shared dictionary pages, no per-code result lookup and no browser errors.
- Evidence: ignored `.tmp/department-quality/`.

## Known Source-Master Gap

The isolated acceptance indicator `102027642463201863` has 24 April department
results. Twenty-three codes exist in the source master; code `833` does not.
This was checked against all 1,045 source rows, not a truncated candidate page.
The dictionary intentionally does not invent a name or supplement itself from
calculation results. Existing results and saved codes remain intact. Maintaining
the missing department in the authoritative source master will make it available
after the next successful refresh (and frontend cache renewal).
