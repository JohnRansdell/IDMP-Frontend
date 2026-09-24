import assert from 'node:assert/strict'
import test from 'node:test'
import { BACKGROUND_ASSETS, resolveBackgroundAsset, resolveDashboardSurfaceTone, resolveWidgetSurfaceTone } from '../src/idmp/features/dashboard/backgroundAssets.js'
import { applyCardSurface, applyCardSurfaceToWidgets, isOrdinaryCard } from '../src/idmp/features/dashboard/cardSurface.js'
import { createPersistableDashboardSnapshot, normalizeDashboardSchema } from '../src/idmp/features/dashboard/schema.js'
import { createLayoutTemplateFromDashboard, instantiateLayoutTemplate } from '../src/idmp/features/dashboard/layoutTemplates.js'
import { applyWidgetBackgroundMode, resolveWidgetBackgroundMode, resolveWidgetVisualStyle } from '../src/idmp/features/dashboard/visualStyle.js'
import { readFile } from 'node:fs/promises'

test('built-in dashboard backgrounds use stable deployment-relative asset keys', () => {
  assert.equal(BACKGROUND_ASSETS.length, 8)
  assert.equal(new Set(BACKGROUND_ASSETS.map(asset => asset.key)).size, BACKGROUND_ASSETS.length)
  assert.match(resolveBackgroundAsset('clinical-blue'), /^\/dashboard-backgrounds\/clinical-blue\.svg$/)
  assert.equal(resolveBackgroundAsset('missing'), '')
  assert.ok(BACKGROUND_ASSETS.every(asset => !/^(blob:|data:|file:|https?:\/\/localhost|[A-Z]:\\)/i.test(asset.url)))
})

test('widget surface tone derives from built-in metadata and safely falls back', () => {
  assert.equal(resolveWidgetSurfaceTone({ config: { style: { backgroundAssetKey: 'clinical-blue' } } }), 'light')
  assert.equal(resolveWidgetSurfaceTone({ config: { style: { backgroundAssetKey: 'deep-blue' } } }), 'dark')
  assert.equal(resolveWidgetSurfaceTone({ config: { style: { backgroundAssetKey: 'unknown' } } }), 'light')
  assert.equal(resolveWidgetSurfaceTone({ config: { style: { background: '#101820' } } }), 'dark')
  assert.equal(resolveWidgetSurfaceTone({ config: { style: { background: 'transparent' } } }), 'light')
  assert.equal(resolveDashboardSurfaceTone({ assetKey: 'deep-blue' }), 'dark')
  assert.equal(resolveWidgetSurfaceTone({ config: { style: { background: 'rgba(255,255,255,0.1)' } } }, 'dark'), 'dark')
  assert.equal(resolveWidgetSurfaceTone({ config: { style: { background: '#ffffff' } } }, 'dark'), 'light')
})

test('card surface bulk materializes styles and protects custom backgrounds by default', () => {
  const widgets = [{ id: 'ordinary', config: { style: { background: '#fff' } } }, { id: 'image', config: { style: { backgroundAssetKey: 'deep-blue' } } }, { id: 'gradient', config: { style: { backgroundGradient: 'linear-gradient(#fff,#def)' } } }]
  assert.equal(isOrdinaryCard(widgets[0]), true)
  assert.equal(isOrdinaryCard(widgets[1]), false)
  assert.equal(applyCardSurface({}, 'translucent').background, 'rgba(255,255,255,0.78)')
  assert.equal(applyCardSurface({}, 'glass').backdropBlur, '12px')
  assert.equal(applyCardSurface(applyCardSurface({}, 'glass'), 'transparent').backdropBlur, undefined)
  assert.equal(applyCardSurface({}, 'transparent').background, 'rgba(255,255,255,0.10)')
  const ordinary = applyCardSurfaceToWidgets(widgets, 'translucent')
  assert.equal(ordinary[0].config.style.background, 'rgba(255,255,255,0.78)')
  assert.equal(ordinary[1], widgets[1])
  assert.equal(ordinary[2], widgets[2])
  const all = applyCardSurfaceToWidgets(widgets, 'transparent', 'all')
  assert.equal(all[1].config.style.background, 'rgba(255,255,255,0.10)')
  assert.equal(all[1].config.style.backgroundAssetKey, 'deep-blue')
})

test('dashboard background asset keys persist while legacy image URLs remain compatible', () => {
  const schema = normalizeDashboardSchema({
    version: 1,
    id: 'background-demo',
    appearance: { background: { assetKey: 'medical-teal', image: 'https://cdn.example.test/legacy.png' } },
    widgets: []
  })
  const snapshot = createPersistableDashboardSnapshot(schema)
  assert.equal(snapshot.appearance.background.assetKey, 'medical-teal')
  assert.equal(snapshot.appearance.background.image, 'https://cdn.example.test/legacy.png')
})

test('widget background asset keys survive layout template round-trips', () => {
  const template = createLayoutTemplateFromDashboard({
    widgets: [{ id: 'chart-1', type: 'chart', chartKind: 'line', config: { style: { backgroundAssetKey: 'deep-blue' } }, layout: { x: 0, y: 0, w: 12, h: 6 } }]
  }, { id: 'background-template', name: '背景模板' })
  assert.equal(template.widgets[0].config.style.backgroundAssetKey, 'deep-blue')
  assert.equal(instantiateLayoutTemplate(template, { createWidgetId: () => 'next-chart' })[0].config.style.backgroundAssetKey, 'deep-blue')
})

test('image mode remains selectable until an asset thumbnail is chosen', () => {
  const imageMode = applyWidgetBackgroundMode({ background: '#ffffff' }, 'image')
  assert.equal(imageMode.backgroundMode, 'image')
  assert.equal(resolveWidgetBackgroundMode(imageMode), 'image')
  assert.equal(resolveWidgetBackgroundMode(applyWidgetBackgroundMode(imageMode, 'solid')), 'solid')
  assert.equal(resolveWidgetBackgroundMode(applyWidgetBackgroundMode(imageMode, 'none')), 'none')
})

test('unknown asset keys safely fall back to legacy widget background URLs without changing persisted style', () => {
  const style = { backgroundAssetKey: 'retired-asset', backgroundImage: 'https://cdn.example.test/card.png', backgroundOverlay: 0.25 }
  const schema = normalizeDashboardSchema({ version: 1, id: 'legacy-card', widgets: [{ id: 'group', type: 'metric-group', config: { style, metricGroup: { items: [] } }, layout: { x: 0, y: 0, w: 12, h: 5 } }] })
  const snapshot = createPersistableDashboardSnapshot(schema)
  assert.deepEqual(snapshot.widgets[0].config.style.backgroundAssetKey, 'retired-asset')
  assert.deepEqual(snapshot.widgets[0].config.style.backgroundImage, 'https://cdn.example.test/card.png')
  assert.equal(resolveBackgroundAsset(style.backgroundAssetKey) || style.backgroundImage, style.backgroundImage)
  assert.equal(resolveWidgetVisualStyle(schema.widgets[0]).palettePreset, 'default')
})

test('dashboard background composition is contained within the viewer canvas', async () => {
  const source = await readFile(new URL('../src/idmp/views/Dashboard.vue', import.meta.url), 'utf8')
  assert.match(source, /\.dashboard-page \{ min-height:100%; \}/)
  assert.match(source, /\.dashboard-schema-canvas \{[^}]*background-color:var\(--dashboard-background/)
  assert.doesNotMatch(source, /\.dashboard-surface \{ background-color:var\(--dashboard-background/)
  assert.doesNotMatch(source, /class="dashboard-schema-canvas dashboard-surface"/)
  assert.doesNotMatch(source, /class="dashboard-designer-canvas dashboard-surface"/)
})
