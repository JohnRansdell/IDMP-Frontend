import { requestJson } from '@/idmp/api/request'

export const mortalityChainConfig = {
  deathSourceTable: 'vmq_deathpatientdetail',
  dischargeSourceTable: 'vmq_basicinformationba',
  deathDomainCode: 'INPATIENT_DEATH_RECORD',
  dischargeDomainCode: 'INPATIENT_DISCHARGE_RECORD',
  deathFactorVersionId: '101996817981379181',
  deathFactorBatchId: '101996817981379186',
  dischargeFactorVersionId: '101996817981379184',
  dischargeFactorBatchId: '101996817981379196',
  indicatorId: '101996817981379208',
  indicatorVersionId: '101996817981379209',
  indicatorBatchId: '101996817981379215',
  periodStart: '2000-01-01T00:00:00',
  periodEnd: '2030-01-01T00:00:00'
}

export function bindSourceTableDomain(tableName, payload) {
  return postJson(`/meta/source-tables/${encodeURIComponent(tableName)}/bind-domain`, payload)
}

export function createFactor(payload) {
  return postJson('/factors', payload)
}

export function compileFactorVersion(versionId, payload = {}) {
  return postJson(`/factor-versions/${versionId}/compile`, payload)
}

export function trialFactorVersion(versionId, payload, idempotencyKey) {
  return postJson(`/factor-versions/${versionId}/trial`, payload, createIdempotencyHeaders(idempotencyKey))
}

export function publishFactorVersion(versionId) {
  return postJson(`/factor-versions/${versionId}/publish`, {})
}

export function createIndicator(payload) {
  return postJson('/indicators', payload)
}

export function createIndicatorVersion(indicatorId, payload = {}) {
  return postJson(`/indicators/${indicatorId}/versions`, payload)
}

export function saveIndicatorFormula(versionId, payload) {
  return requestJson(`/indicator-versions/${versionId}/formula`, {
    method: 'PUT',
    body: JSON.stringify(payload)
  })
}

export function compileIndicatorFormula(versionId, payload) {
  return postJson(`/indicator-versions/${versionId}/formula/compile`, payload)
}

export function trialIndicatorVersion(versionId, payload, idempotencyKey) {
  return postJson(`/indicator-versions/${versionId}/trial`, payload, createIdempotencyHeaders(idempotencyKey))
}

export function fetchAsyncTask(taskId) {
  return requestJson(`/async-tasks/${taskId}`)
}

export function fetchCalcBatch(batchId) {
  return requestJson(`/calc/batches/${batchId}`)
}

export function fetchFactorTrialResults(versionId, batchId, page = 1, size = 100) {
  return requestJson(`/factor-versions/${versionId}/trials/${batchId}/results?page=${page}&size=${size}`)
}

export function fetchIndicatorTrialResults(versionId, batchId, page = 1, size = 100) {
  return requestJson(`/indicator-versions/${versionId}/trials/${batchId}/results?page=${page}&size=${size}`)
}

export function createMortalityDomainPayloads() {
  return {
    death: {
      tableName: mortalityChainConfig.deathSourceTable,
      payload: {
        domainCode: mortalityChainConfig.deathDomainCode,
        domainName: '住院死亡患者记录',
        domainDescription: 'vmq_deathpatientdetail 独立语义域，用于统计住院死亡患者数'
      }
    },
    discharge: {
      tableName: mortalityChainConfig.dischargeSourceTable,
      payload: {
        domainCode: mortalityChainConfig.dischargeDomainCode,
        domainName: '住院出院病案记录',
        domainDescription: 'vmq_basicinformationba 独立语义域，用于统计住院出院人次'
      }
    }
  }
}

export function createMortalityFactorPayloads(suffix = createBusinessSuffix()) {
  return {
    death: createCountFactorPayload({
      code: `INPATIENT_DEATH_RECORD_COUNT_${suffix}`,
      name: '住院死亡患者记录数',
      description: '统计 vmq_deathpatientdetail 中的死亡患者记录数',
      domainCode: mortalityChainConfig.deathDomainCode
    }),
    discharge: createCountFactorPayload({
      code: `INPATIENT_DISCHARGE_RECORD_COUNT_${suffix}`,
      name: '住院出院病案记录数',
      description: '统计 vmq_basicinformationba 中的出院病案记录数',
      domainCode: mortalityChainConfig.dischargeDomainCode
    })
  }
}

export function createMortalityIndicatorPayload(suffix = createBusinessSuffix()) {
  return {
    code: `INPATIENT_MORTALITY_RATE_${suffix}`,
    name: '住院死亡率',
    description: '住院死亡患者记录数除以住院出院病案记录数，按百分比展示'
  }
}

export function createMortalityFormulaPayload({
  deathFactorVersionId = mortalityChainConfig.deathFactorVersionId,
  dischargeFactorVersionId = mortalityChainConfig.dischargeFactorVersionId,
  resourceVersion = 0
} = {}) {
  return {
    resourceVersion,
    formula: {
      schemaVersion: '1.0',
      astType: 'INDICATOR_FORMULA',
      root: {
        nodeId: 'mortality_div',
        nodeType: 'BINARY',
        operator: 'DIV',
        left: {
          nodeId: 'death_factor',
          nodeType: 'FACTOR_REF',
          factorVersionId: Number(deathFactorVersionId)
        },
        right: {
          nodeId: 'discharge_factor',
          nodeType: 'FACTOR_REF',
          factorVersionId: Number(dischargeFactorVersionId)
        },
        zeroDenominatorPolicy: 'RETURN_NULL'
      },
      display: {
        format: 'PERCENT',
        multiplier: '100',
        scale: 2,
        roundingMode: 'HALF_UP'
      }
    }
  }
}

export function createMortalityTrialPayload({
  periodStart = mortalityChainConfig.periodStart,
  periodEnd = mortalityChainConfig.periodEnd
} = {}) {
  return { periodStart, periodEnd }
}

export async function runMortalityDomainBinding() {
  const domains = createMortalityDomainPayloads()
  const [death, discharge] = await Promise.all([
    bindSourceTableDomain(domains.death.tableName, domains.death.payload),
    bindSourceTableDomain(domains.discharge.tableName, domains.discharge.payload)
  ])
  return { death, discharge }
}

export async function runMortalityFactorCreation(suffix = createBusinessSuffix()) {
  const factors = createMortalityFactorPayloads(suffix)
  const [death, discharge] = await Promise.all([
    createFactor(factors.death),
    createFactor(factors.discharge)
  ])
  return { death, discharge }
}

export async function fetchMortalityReadonlyChain() {
  const config = mortalityChainConfig
  const [deathFactor, dischargeFactor, indicatorResult, asyncTask, calcBatch] = await Promise.allSettled([
    fetchFactorTrialResults(config.deathFactorVersionId, config.deathFactorBatchId),
    fetchFactorTrialResults(config.dischargeFactorVersionId, config.dischargeFactorBatchId),
    fetchIndicatorTrialResults(config.indicatorVersionId, config.indicatorBatchId),
    fetchAsyncTask(config.indicatorBatchId),
    fetchCalcBatch(config.indicatorBatchId)
  ])

  return {
    config,
    deathFactor: unwrapSettled(deathFactor),
    dischargeFactor: unwrapSettled(dischargeFactor),
    indicatorResult: unwrapSettled(indicatorResult),
    asyncTask: unwrapSettled(asyncTask),
    calcBatch: unwrapSettled(calcBatch)
  }
}

function createCountFactorPayload({ code, name, description, domainCode }) {
  return {
    code,
    name,
    description,
    dsl: {
      schemaVersion: '1.0',
      dslType: 'FACTOR',
      primaryDomain: { domainCode },
      filters: { nodeType: 'TRUE' },
      aggregation: { function: 'COUNT' },
      groupBy: [],
      parameters: [],
      output: {
        valueType: 'DECIMAL',
        semanticKind: 'MEASURE',
        dimension: 'COUNT',
        unit: 'PERSON_TIME',
        nullable: false,
        precision: 30,
        scale: 10,
        grain: []
      }
    }
  }
}

function postJson(path, payload, headers) {
  return requestJson(path, {
    method: 'POST',
    headers,
    body: JSON.stringify(payload)
  })
}

function createIdempotencyHeaders(idempotencyKey) {
  return idempotencyKey ? { 'X-Idempotency-Key': idempotencyKey } : undefined
}

function createBusinessSuffix() {
  const value = new Date().toISOString().replace(/\D/g, '').slice(0, 14)
  return `${value}_${Math.random().toString(16).slice(2, 8).toUpperCase()}`
}

function unwrapSettled(result) {
  return result.status === 'fulfilled' ? result.value : null
}
