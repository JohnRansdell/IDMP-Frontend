import assert from 'node:assert/strict'
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

export async function runDrawPlacementGoldenPath(cdp, { click, value, waitFor, delay, gridNode }) {
  await cdp.send('Emulation.setDeviceMetricsOverride', { width: 1920, height: 1080, deviceScaleFactor: 1, mobile: false })
  const canvas = '[data-testid="dashboard-canvas"]'
  const ids = await value(cdp, `Array.from(document.querySelectorAll('${canvas} .grid-stack-item')).map(el => el.dataset.widgetId)`)
  assert.ok(ids.length >= 2, 'placement acceptance needs two components for collision checks')
  for (const id of ids.slice(2)) {
    await click(cdp, `[data-widget-id="${id}"]`)
    await click(cdp, '[data-testid="dashboard-delete-widget"]')
  }
  const selector = `[data-widget-id="${ids[0]}"]`
  const secondSelector = `[data-widget-id="${ids[1]}"]`
  const initial = await gridNode(cdp, selector)
  const second = await gridNode(cdp, secondSelector)
  const target = { x: 14, y: Math.max(initial.y + initial.h, second.y + second.h) + 1, w: 8, h: 4 }
  const count = () => value(cdp, `document.querySelectorAll('${canvas} .grid-stack-item').length`)
  const settled = () => waitFor(cdp, `document.querySelector('${canvas}').__vueParentComponent.exposed.getMembershipDiagnostic().valid`)
  const draw = async (rectangle, { reverse = false, selection = false } = {}) => {
    const points = await value(cdp, `(() => {
      const el = document.querySelector('${canvas}');
      const g = el.__vueParentComponent.exposed.getGridGeometry();
      const scroller = el.closest('.studio-canvas-scroll');
      scroller.scrollTop = Math.max(0, ${rectangle.y} * g.cellHeight - 100);
      scroller.scrollLeft = 0;
      const r = el.getBoundingClientRect();
      return { start: { x: r.left + (${rectangle.x} + .15) * g.cellWidth, y: r.top + (${rectangle.y} + .15) * g.cellHeight },
        end: { x: r.left + (${rectangle.x + rectangle.w} - .15) * g.cellWidth, y: r.top + (${rectangle.y + rectangle.h} - .15) * g.cellHeight } };
    })()`)
    const start = reverse ? points.end : points.start
    const end = reverse ? points.start : points.end
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...start })
    await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...start, button: 'left', buttons: 1, clickCount: 1 })
    await delay(50)
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...end, button: 'left', buttons: 1 })
    await waitFor(cdp, selection ? `document.querySelector('.dashboard-marquee')` : `document.querySelector('[data-testid="dashboard-placement-preview"]')`)
    return end
  }
  const release = async point => {
    await cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 })
    await delay(200)
  }
  const escape = async () => {
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await cdp.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape', code: 'Escape', windowsVirtualKeyCode: 27 })
    await waitFor(cdp, `!document.querySelector('[data-testid="dashboard-draw-surface"], [data-testid="dashboard-placement-preview"]')`)
  }
  const screenshot = async name => {
    if (!process.env.DASHBOARD_VISUAL_DIR) return
    await mkdir(process.env.DASHBOARD_VISUAL_DIR, { recursive: true })
    const shot = await cdp.send('Page.captureScreenshot', { format: 'png' })
    await writeFile(join(process.env.DASHBOARD_VISUAL_DIR, name), Buffer.from(shot.data, 'base64'))
  }

  // Existing selection must only marquee-select, never enable placement or alter geometry.
  await click(cdp, selector)
  assert.equal(await value(cdp, `!!document.querySelector('[data-testid="dashboard-draw-placement"], [data-testid="dashboard-draw-surface"]')`), false)
  const selectionEnd = await draw(target, { reverse: true, selection: true })
  assert.equal(await value(cdp, `!!document.querySelector('[data-testid="dashboard-placement-preview"]')`), false)
  await release(selectionEnd)
  assert.deepEqual(await gridNode(cdp, selector), initial)
  assert.deepEqual(await gridNode(cdp, secondSelector), second)
  assert.equal(await count(), 2)

  await click(cdp, selector)
  const union = { x: 0, y: 0, w: Math.max(initial.x + initial.w, second.x + second.w) + 1, h: Math.max(initial.y + initial.h, second.y + second.h) }
  const unionEnd = await draw(union, { reverse: true, selection: true })
  await release(unionEnd)
  await waitFor(cdp, `document.querySelectorAll('${canvas} .grid-stack-item.is-selected').length === 2`)
  assert.deepEqual(await gridNode(cdp, selector), initial)
  assert.deepEqual(await gridNode(cdp, secondSelector), second)

  // Library selection creates a pending widget, not a persisted canvas item.
  await click(cdp, '[data-testid="dashboard-library-kpi"]')
  await waitFor(cdp, `document.querySelector('[data-testid="dashboard-draw-surface"]')`)
  const pendingId = await value(cdp, `document.querySelector('${canvas}').__vueParentComponent.props.pendingWidget.id`)
  assert.equal(await count(), 2)
  const end = await draw(target, { reverse: true })
  assert.equal(await value(cdp, `document.querySelector('[data-testid="dashboard-placement-preview"]').classList.contains('is-invalid')`), false)
  await screenshot('draw-placement-preview.png')
  assert.equal(await count(), 2)
  await release(end)
  const createdSelector = `[data-widget-id="${pendingId}"]`
  await waitFor(cdp, `document.querySelector(${JSON.stringify(createdSelector)})?.gridstackNode`)
  assert.deepEqual(await gridNode(cdp, createdSelector), target)
  assert.equal(await count(), 3)
  assert.deepEqual(await gridNode(cdp, selector), initial)
  assert.deepEqual(await gridNode(cdp, secondSelector), second)
  const diagnostic = await value(cdp, `document.querySelector('${canvas}').__vueParentComponent.exposed.collectWidgetLayoutDiagnostic(${JSON.stringify(pendingId)})`)
  assert.deepEqual(diagnostic.schema, target)
  await screenshot('library-placement-created.png')
  await click(cdp, '[data-testid="dashboard-undo"]')
  await waitFor(cdp, `!document.querySelector(${JSON.stringify(createdSelector)})`)
  await click(cdp, '[data-testid="dashboard-redo"]')
  await waitFor(cdp, `document.querySelector(${JSON.stringify(createdSelector)})?.gridstackNode`)
  assert.deepEqual(await gridNode(cdp, createdSelector), target)

  await click(cdp, createdSelector)
  await click(cdp, '#tab-advanced')
  await click(cdp, '[data-testid="dashboard-widget-locked"]')
  assert.equal(await value(cdp, `!!document.querySelector('[data-testid="dashboard-draw-surface"]')`), false)
  assert.deepEqual(await gridNode(cdp, createdSelector), target)
  await click(cdp, '[data-testid="dashboard-widget-locked"]')
  await click(cdp, '[data-testid="dashboard-preview"]')
  await waitFor(cdp, `document.querySelector('.el-dialog ${createdSelector}')?.gridstackNode`)
  assert.deepEqual(await gridNode(cdp, `.el-dialog ${createdSelector}`), target)
  await click(cdp, '.el-dialog__headerbtn')
  await delay(300)

  // Original drag handlers remain usable after library placement and preview.
  const dragPoint = await value(cdp, `(() => { const el = document.querySelector(${JSON.stringify(createdSelector)}); el.scrollIntoView({ block:'center' }); const r = el.querySelector('.grid-stack-item-content').getBoundingClientRect(); return { x:r.left + 30, y:r.top + 30 }; })()`)
  await cdp.send('Input.dispatchMouseEvent', { type: 'mouseMoved', ...dragPoint })
  await cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', ...dragPoint, button:'left', buttons:1, clickCount:1 })
  for (let step = 1; step <= 8; step++) {
    await cdp.send('Input.dispatchMouseEvent', { type:'mouseMoved', x:dragPoint.x, y:dragPoint.y + step * 15, button:'left', buttons:1 })
    await delay(40)
  }
  await release({ x:dragPoint.x, y:dragPoint.y + 120 })
  await waitFor(cdp, `document.querySelector(${JSON.stringify(createdSelector)}).gridstackNode.y !== ${target.y}`)
  await click(cdp, '[data-testid="dashboard-undo"]')
  await waitFor(cdp, `document.querySelector(${JSON.stringify(createdSelector)}).gridstackNode.y === ${target.y}`)
  await settled()

  await click(cdp, '[data-testid="dashboard-library-text"]')
  await waitFor(cdp, `document.querySelector('[data-testid="dashboard-draw-surface"]')`)
  const textId = await value(cdp, `document.querySelector('${canvas}').__vueParentComponent.props.pendingWidget.id`)
  await click(cdp, '[data-testid="dashboard-draw-surface"]')
  assert.equal(await count(), 3, 'a click without drawing must not create a widget')
  const collisionEnd = await draw(target)
  assert.equal(await value(cdp, `document.querySelector('[data-testid="dashboard-placement-preview"]').classList.contains('is-invalid')`), true)
  await release(collisionEnd)
  assert.equal(await value(cdp, `!!document.querySelector('[data-widget-id="${textId}"]')`), false)
  await escape()
  assert.equal(await count(), 3)
  assert.equal(await value(cdp, `!!document.querySelector(${JSON.stringify(createdSelector)}).gridstackNode.noMove`), false)
  assert.equal(await value(cdp, `!!document.querySelector(${JSON.stringify(createdSelector)}).gridstackNode.noResize`), false)

  for (const id of [...ids.slice(0, 2), pendingId]) {
    await click(cdp, `[data-widget-id="${id}"]`)
    await waitFor(cdp, `document.querySelector('[data-widget-id="${id}"]').classList.contains('is-selected')`)
    await click(cdp, '[data-testid="dashboard-delete-widget"]')
    await waitFor(cdp, `!document.querySelector('[data-widget-id="${id}"]')`)
  }
  await click(cdp, '[data-testid="dashboard-library-text"]')
  await waitFor(cdp, `document.querySelector('[data-testid="dashboard-draw-surface"]')`)
  assert.equal(await value(cdp, `!!document.querySelector('.studio-empty')`), false)
  const emptyTarget = { x:3, y:2, w:8, h:4 }
  await release(await draw(emptyTarget))
  await waitFor(cdp, `document.querySelector('${canvas} .grid-stack-item')?.gridstackNode`)
  assert.deepEqual(await gridNode(cdp, `${canvas} .grid-stack-item`), emptyTarget)
  await click(cdp, '[data-testid="dashboard-library-text"]')
  await waitFor(cdp, `document.querySelector('[data-testid="dashboard-draw-surface"]')`)
  await click(cdp, '[data-testid="dashboard-add-widget"]')
  await waitFor(cdp, `document.querySelectorAll('${canvas} .grid-stack-item').length === 2 && !document.querySelector('[data-testid="dashboard-draw-surface"]')`)
  await settled()
  process.stdout.write('dashboard-draw-placement: PASS existing-selection-only library-create reverse-drag collision cancel click undo redo lock preview normal-drag empty-canvas add-button membership\n')
}
