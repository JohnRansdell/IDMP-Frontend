import { requestJson } from '@/idmp/api/request'
import { createDepartmentDictionaryLoader } from '../../features/shared/departmentDictionary.js'

export const fetchDepartmentDictionary = createDepartmentDictionaryLoader(({ page, size }) =>
  requestJson(`/meta/departments?page=${page}&size=${size}`))

export async function fetchDepartmentNames() {
  return new Map((await fetchDepartmentDictionary()).map(entry => [entry.code, entry.name]))
}
