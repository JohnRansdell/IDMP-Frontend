import assert from 'node:assert/strict'
import test from 'node:test'
import { JSDOM } from 'jsdom'
import { queryEnterDirective } from '../src/idmp/utils/queryEnter.js'

function fixture(html = '<input><button type="button" data-query-submit>查询</button>') {
  const dom = new JSDOM(`<div id="query">${html}</div>`)
  const element = dom.window.document.querySelector('#query')
  let calls = 0
  element.querySelector('button').addEventListener('click', () => calls++)
  queryEnterDirective.mounted(element)
  const press = (options = {}, target = element.querySelector('input')) => {
    const event = new dom.window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true, ...options })
    target.dispatchEvent(event)
    return event
  }
  return { element, press, calls: () => calls }
}

test('query enter invokes the same button once and prevents native duplicate submission', () => {
  for (const type of ['text', 'search', 'number']) {
    const form = fixture(`<input type="${type}"><button type="submit">查询</button>`)
    assert.equal(form.press().defaultPrevented, true)
    assert.equal(form.calls(), 1)
    form.press({ repeat: true })
    assert.equal(form.calls(), 1)
    queryEnterDirective.beforeUnmount(form.element)
    form.press()
    assert.equal(form.calls(), 1)
  }
})

test('IME confirmation and modified keys never query', () => {
  const form = fixture()
  for (const event of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { shiftKey: true }, { altKey: true }, { metaKey: true }, { key: 'Escape' }]) form.press(event)
  assert.equal(form.calls(), 0)
})

test('dropdown search, date confirmation and multiline editing retain their own keyboard behavior', () => {
  for (const html of ['<div class="el-select"><input></div>', '<div class="el-select-v2"><input></div>',
    '<div class="el-date-editor"><input></div>', '<input role="combobox">', '<input readonly>', '<input disabled>',
    '<textarea></textarea>', '<div contenteditable="true">SQL</div>']) {
    const form = fixture(`${html}<button type="button" data-query-submit>查询</button>`)
    form.press({}, form.element.querySelector('input,textarea,[contenteditable]'))
    assert.equal(form.calls(), 0, html)
  }
})

test('loading and disabled buttons cannot be bypassed by keyboard', () => {
  for (const attrs of ['disabled', 'aria-disabled="true"', 'class="is-loading"']) {
    const form = fixture(`<input><button type="button" data-query-submit ${attrs}>查询</button>`)
    assert.equal(form.press().defaultPrevented, true)
    assert.equal(form.calls(), 0)
  }
})

test('existing input handlers can consume Enter and unrelated areas never trigger a query', () => {
  const form = fixture('<input><button type="button">保存</button>')
  assert.equal(form.press().defaultPrevented, false)
  assert.equal(form.calls(), 0)
  const query = fixture()
  query.element.querySelector('input').addEventListener('keydown', event => event.preventDefault())
  query.press()
  assert.equal(query.calls(), 0)
})
