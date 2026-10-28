export function scrollBehavior(to, from) {
  if (to.path.startsWith('/factor/edit/') && to.hash === '#factor-workflow') {
    // 因子草稿保存后由编辑页等待版本加载完成，再定位到后续操作。
    return false
  }
  if (to.path === '/calc' && to.hash === '#batch-overview') {
    // 批次页在首次查询完成、布局稳定后定位，路由不提前滚动。
    return false
  }
  if (to.path === '/analysis' && from.path === '/analysis'
    && String(to.query?.indicator || '') === String(from.query?.indicator || '')
    && String(to.query?.indicatorVersionId || '') === String(from.query?.indicatorVersionId || '')) {
    return false
  }
  return { top: 0 }
}
