const status = document.querySelector('#status')
const buttons = [...document.querySelectorAll('button[data-mode]')]
let config
let selected
function showIdentity() {
  document.querySelector('#doctor').textContent = selected.doctorNo
  document.querySelector('#department').textContent = selected.deptCode
}
async function launch(mode) {
  if (!selected) return
  const input = document.querySelector('#base-url')
  if (mode !== 'catalog' && !input.reportValidity()) return
  const popup = window.open('about:blank', '_blank')
  if (!popup) { status.textContent = '浏览器阻止了新窗口，请允许本站弹出窗口后重试'; status.className = 'error'; return }
  popup.opener = null
  buttons.forEach(button => { button.disabled = true })
  status.className = ''
  status.textContent = '正在签发测试凭证'
  try {
    const response = await fetch('/test/launch', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ user: selected.id, mode, baseUrl: input.value.trim() }) })
    if (!response.ok) throw Error(response.status === 400 ? '请使用当前已开放看板的基础地址，不要填入医师、科室或签名' : '测试凭证签发失败，请检查联调服务')
    const result = await response.json()
    const target = new URL(result.url)
    if (target.origin !== config.frontendOrigin || target.pathname !== '/auto-login') throw Error('联调跳转地址不正确')
    popup.location.replace(target.href)
    status.textContent = `已打开指标平台 · 凭证有效至 ${new Date(result.expiresAt).toLocaleTimeString('zh-CN')}`
  } catch (error) { popup.close(); status.className = 'error'; status.textContent = error.message }
  finally { buttons.forEach(button => { button.disabled = false }) }
}
buttons.forEach(button => { button.disabled = true; button.addEventListener('click', () => launch(button.dataset.mode)) })
async function initialize() {
  try {
    const response = await fetch('/test/config')
    if (!response.ok) throw Error('联调服务暂不可用')
    config = await response.json()
    document.querySelector('#dashboard').textContent = config.dashboardName
    document.querySelector('#base-url').value = config.integrationBaseUrl
    const users = document.querySelector('#users')
    config.users.forEach((user, index) => {
      const label = document.createElement('label')
      label.className = 'user'
      const radio = document.createElement('input')
      radio.type = 'radio'; radio.name = 'identity'; radio.value = user.id; radio.checked = index === 0
      const text = document.createElement('span'), name = document.createElement('strong'), dept = document.createElement('small')
      name.textContent = user.displayName; dept.textContent = user.deptName
      text.append(name, dept); label.append(radio, text); users.append(label)
      radio.addEventListener('change', () => { selected = user; showIdentity() })
    })
    selected = config.users[0]
    if (!selected) throw Error('尚未配置测试身份')
    showIdentity()
    status.textContent = '联调服务已就绪'
    buttons.forEach(button => { button.disabled = false })
  } catch (error) { status.className = 'error'; status.textContent = error.message }
}
initialize()
