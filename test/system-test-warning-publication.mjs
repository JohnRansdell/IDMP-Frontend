import { api, check, checks, finish, run, save } from './system-test-client.mjs'

await run('warning publication list and filters', async () => {
  const all = await api('GET', '/analysis/warning-rules?page=1&size=100')
  await save('all-rules', all)
  check('rule list returns version definitions', all.records.length > 0 && all.records.every(rule => rule.version?.id && rule.version?.publicationStatus))
  const drafts = await api('GET', '/analysis/warning-rules?publicationStatus=DRAFT&page=1&size=100')
  await save('draft-filter', drafts)
  check('DRAFT filter returns unpublished versions', drafts.records.length > 0 && drafts.records.every(rule => rule.version?.publicationStatus === 'DRAFT' && rule.currentPublishedVersionId === null))
  const draft = drafts.records[0]
  if (!draft) throw new Error('A draft rule is required for read-only acceptance')
  const detail = await api('GET', `/analysis/warning-rules/${draft.id}`)
  await save('draft-detail', detail)
  check('draft list metadata matches detail', JSON.stringify(draft.version) === JSON.stringify(detail.version))
  check('unfiltered list includes the draft', all.records.some(rule => rule.id === draft.id && rule.version?.publicationStatus === 'DRAFT'))
  const published = await api('GET', '/analysis/warning-rules?publicationStatus=PUBLISHED&page=1&size=100')
  await save('published-filter', published)
  check('published rules retain published versions', published.records.length > 0 && published.records.every(rule => String(rule.version?.id) === String(rule.currentPublishedVersionId) && rule.version?.publicationStatus === 'PUBLISHED'))
  const combined = await api('GET', `/analysis/warning-rules?publicationStatus=DRAFT&enableStatus=${draft.enableStatus}&page=1&size=100`)
  check('publication and enablement filters combine', combined.records.some(rule => rule.id === draft.id) && combined.records.every(rule => rule.enableStatus === draft.enableStatus && rule.version?.publicationStatus === 'DRAFT'))
  const first = await api('GET', '/analysis/warning-rules?publicationStatus=DRAFT&page=1&size=1')
  const second = await api('GET', '/analysis/warning-rules?publicationStatus=DRAFT&page=2&size=1')
  await save('pagination', { first, second })
  const expectedSecondCount = Number(drafts.total) > 1 ? 1 : 0
  check('pagination preserves total and expected page sizes', first.total === drafts.total && second.total === drafts.total && first.records.length === 1 && second.records.length === expectedSecondCount)
  check('pagination does not duplicate records', !second.records.length || first.records[0].id !== second.records[0].id)
  check('rule list has no duplicate records', new Set(all.records.map(rule => rule.id)).size === all.records.length)
  const named = await api('GET', `/analysis/warning-rules?name=${encodeURIComponent(draft.name)}&publicationStatus=DRAFT&page=1&size=20`)
  check('name and publication filters combine', named.records.some(rule => rule.id === draft.id))
})
await finish()
if (checks.some(item => !item.passed)) process.exitCode = 1
