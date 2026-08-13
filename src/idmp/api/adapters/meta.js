import {
  normalizeDataDomain,
  normalizeList,
  normalizeSemanticField,
  normalizeSemanticTable,
  normalizeSourceField,
  normalizeSourceTable,
  toOpaqueId
} from '../../features/meta/model.js'

export function adaptSourceTableList(payload) {
  return normalizeList(payload).map(normalizeSourceTable)
}

export function adaptSourceFieldList(payload) {
  return normalizeList(payload).map(normalizeSourceField)
}

export function adaptDataDomainList(payload) {
  return normalizeList(payload).map(normalizeDataDomain)
}

export function adaptSemanticTableList(payload) {
  return normalizeList(payload).map(normalizeSemanticTable)
}

export function adaptSemanticFieldList(payload) {
  return normalizeList(payload).map(normalizeSemanticField)
}

export {
  normalizeDataDomain,
  normalizeList,
  normalizeSemanticField,
  normalizeSemanticTable,
  normalizeSourceField,
  normalizeSourceTable,
  toOpaqueId
}
