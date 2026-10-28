-- 复杂费用指标真实验收：只在业务源库使用只读账号运行。
-- 主表 vmq_basicinformationba；时间 out_date；人数 COUNT(DISTINCT VISIT_ID)。
-- 下列仅包含 SELECT / WITH，不创建或修改任何资源。
-- 先保存查询1的当日实际结果，再创建测试因子，不把历史参考值硬编码为断言。

-- 查询1：2026年1月总体四因子、数据前置检查、最终值及舍入负例。
WITH base AS (
    SELECT total_cost, drug_cost, material_cost, VISIT_ID
    FROM vmq_basicinformationba
    WHERE out_date >= '2026-01-01 00:00:00'
      AND out_date <  '2026-02-01 00:00:00'
), source_values AS (
    SELECT COUNT(*) AS source_rows,
           COUNT(total_cost) AS total_nonnull_rows,
           COUNT(drug_cost) AS drug_nonnull_rows,
           COUNT(material_cost) AS material_nonnull_rows,
           SUM(CASE WHEN VISIT_ID IS NULL THEN 1 ELSE 0 END) AS missing_visit_id_rows,
           SUM(total_cost) AS T,
           SUM(drug_cost) AS D,
           SUM(material_cost) AS M,
           COUNT(DISTINCT VISIT_ID) AS N
    FROM base
)
SELECT source_rows, total_nonnull_rows, drug_nonnull_rows, material_nonnull_rows,
       missing_visit_id_rows, T, D, M, N,
       D + M AS drug_material_sum,
       T - (D + M) AS net_cost,
       ROUND((T - (D + M)) / NULLIF(N, 0) * 100, 2) AS expected_per_100,
       ROUND((T - (D + M)) / NULLIF(N, 0) * 200, 2) AS expected_per_200,
       ROUND((T - (D + M)) / NULLIF(N, 0), 2) * 100 AS wrong_early_rounding
FROM source_values;

-- 查询2：同周期逐出院科室独立对账。每个科室重新聚合四因子再代入公式。
SELECT out_dept_code,
       SUM(total_cost) AS T, SUM(drug_cost) AS D, SUM(material_cost) AS M,
       COUNT(DISTINCT VISIT_ID) AS N,
       ROUND((SUM(total_cost) - (SUM(drug_cost) + SUM(material_cost)))
             / NULLIF(COUNT(DISTINCT VISIT_ID), 0) * 100, 2) AS expected_per_100
FROM vmq_basicinformationba
WHERE out_date >= '2026-01-01 00:00:00'
  AND out_date <  '2026-02-01 00:00:00'
GROUP BY out_dept_code
ORDER BY out_dept_code;

-- 查询3：科室15内逐医生对账，只输出组织编码及聚合金额，不输出患者明细。
-- 如果实际验收选了其他科室，替换该条件，并在分析、排名、下钻中选择相同科室。
SELECT out_dept_code, attending_doctor,
       SUM(total_cost) AS T, SUM(drug_cost) AS D, SUM(material_cost) AS M,
       COUNT(DISTINCT VISIT_ID) AS N,
       ROUND((SUM(total_cost) - (SUM(drug_cost) + SUM(material_cost)))
             / NULLIF(COUNT(DISTINCT VISIT_ID), 0) * 100, 2) AS expected_per_100
FROM vmq_basicinformationba
WHERE out_date >= '2026-01-01 00:00:00'
  AND out_date <  '2026-02-01 00:00:00'
  AND out_dept_code = '15'
GROUP BY out_dept_code, attending_doctor
ORDER BY attending_doctor;

-- 查询4：1至3月按月对账，用于验证切换月份和趋势；不是季度结果的替代。
SELECT DATE_FORMAT(out_date, '%Y-%m') AS report_month,
       SUM(total_cost) AS T, SUM(drug_cost) AS D, SUM(material_cost) AS M,
       COUNT(DISTINCT VISIT_ID) AS N,
       ROUND((SUM(total_cost) - (SUM(drug_cost) + SUM(material_cost)))
             / NULLIF(COUNT(DISTINCT VISIT_ID), 0) * 100, 2) AS expected_per_100
FROM vmq_basicinformationba
WHERE out_date >= '2026-01-01 00:00:00'
  AND out_date <  '2026-04-01 00:00:00'
GROUP BY DATE_FORMAT(out_date, '%Y-%m')
ORDER BY report_month;

-- 查询5：Q1整体直接重算，用于已有季度正式结果的专项核验。
-- 不能用三个“每百人次费用”直接相加或取普通平均数，也不能假设去重人数可直接相加。
SELECT SUM(total_cost) AS T, SUM(drug_cost) AS D, SUM(material_cost) AS M,
       COUNT(DISTINCT VISIT_ID) AS N,
       ROUND((SUM(total_cost) - (SUM(drug_cost) + SUM(material_cost)))
             / NULLIF(COUNT(DISTINCT VISIT_ID), 0) * 100, 2) AS expected_per_100
FROM vmq_basicinformationba
WHERE out_date >= '2026-01-01 00:00:00'
  AND out_date <  '2026-04-01 00:00:00';

-- 查询6：去重是否必要，只返回重复住院记录分组数量。
SELECT COUNT(*) AS repeated_visit_groups
FROM (
    SELECT VISIT_ID
    FROM vmq_basicinformationba
    WHERE out_date >= '2026-01-01 00:00:00'
      AND out_date <  '2026-02-01 00:00:00'
      AND VISIT_ID IS NOT NULL
    GROUP BY VISIT_ID
    HAVING COUNT(*) > 1
) duplicate_visits;
