import { requestJson, requestFile } from '../request.js'
import { sha256 } from '@noble/hashes/sha256'
import { bytesToHex } from '@noble/hashes/utils'

function query(path, params) {
  const values = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => { if (value !== '' && value != null) values.set(key, value) })
  return `${path}?${values}`
}
const write = (path, body, method = 'POST') => requestJson(path, { method, body: JSON.stringify(body) })
export const fetchPolicies = (params = {}) => requestJson(query('/meta/policy-files', params), { cache: 'no-store' })
export const fetchPolicy = id => requestJson(`/meta/policy-files/${encodeURIComponent(id)}`, { cache: 'no-store' })
export const fetchPolicyVersion = id => requestJson(`/meta/policy-file-versions/${encodeURIComponent(id)}`, { cache: 'no-store' })
export const fetchPublishedPolicyVersions = (params = {}) => requestJson(query('/meta/policy-file-versions/published', params), { cache: 'no-store' })
export const createPolicy = body => write('/meta/policy-files', body)
export const updatePolicy = (id, body) => write(`/meta/policy-files/${encodeURIComponent(id)}`, body, 'PATCH')
export const createPolicyVersion = (id, body) => write(`/meta/policy-files/${encodeURIComponent(id)}/versions`, body)
export const updatePolicyVersion = (id, body) => write(`/meta/policy-file-versions/${encodeURIComponent(id)}`, body, 'PATCH')
export const publishPolicyVersion = (id, version) => write(`/meta/policy-files/${encodeURIComponent(id)}/versions/${encodeURIComponent(version.id)}/publish`, { resourceVersion: version.resourceVersion })
export const archivePolicyVersion = version => write(`/meta/policy-file-versions/${encodeURIComponent(version.id)}/archive`, { resourceVersion: version.resourceVersion })
export const fetchPolicyRelations = id => requestJson(`/meta/policy-file-versions/${encodeURIComponent(id)}/relations`, { cache: 'no-store' })
export const createPolicyRelation = (id, body) => write(`/meta/policy-file-versions/${encodeURIComponent(id)}/relations`, body)
export const fetchPolicyUploadOptions = () => requestJson('/meta/file-objects/upload-options')
export const fetchPolicyFile = id => requestJson(`/meta/file-objects/${encodeURIComponent(id)}`)
export const fetchPolicyContent = (id, options) => requestFile(`/meta/file-objects/${encodeURIComponent(id)}/content`, options)

export async function hashPolicyFile(file, onProgress = () => {}) {
  const hash = sha256.create()
  const chunkSize = 2 * 1024 * 1024
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    hash.update(new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer()))
    onProgress(Math.min(100, Math.round((offset + chunkSize) / file.size * 100)))
    await new Promise(resolve => setTimeout(resolve, 0))
  }
  return bytesToHex(hash.digest())
}

export async function uploadPolicyFile(file, onState = () => {}) {
  const limits = await fetchPolicyUploadOptions()
  const extension = file.name.split('.').pop().toLowerCase()
  if (!limits.extensions.includes(extension)) throw new Error(`请选择 ${limits.extensions.join('、').toUpperCase()} 文件`)
  if (!file.size || file.size > limits.maxBytes) throw new Error(`文件不能为空，且不能超过 ${(limits.maxBytes / 1024 / 1024).toFixed(1)} MB`)
  const hash = await hashPolicyFile(file, value => onState(`正在校验文件 ${value}%`))
  onState('正在检查已有文件')
  const checked = await write('/meta/file-objects/check', { sha256: hash, originalName: file.name, fileSizeBytes: file.size })
  if (checked.instantUpload) return checked
  onState('正在上传文件')
  const form = new FormData()
  form.append('file', file)
  form.append('sha256', hash)
  return requestJson('/meta/file-objects/upload', { method: 'POST', body: form, timeoutMs: 120000 })
}
