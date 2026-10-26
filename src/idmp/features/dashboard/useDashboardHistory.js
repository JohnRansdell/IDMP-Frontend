import { computed, ref, watch } from 'vue'
import { clonePersistableValue } from '../../utils/persistableValue.js'

export function useDashboardHistory({ editing, schema, dirty, saveState, reconcile, limit = 50 }) {
  const history = ref([])
  const index = ref(-1)
  let restoring = false
  let transactionDepth = 0
  let savedSnapshot = ''
  const canUndo = computed(() => editing.value && index.value > 0)
  const canRedo = computed(() => editing.value && index.value >= 0 && index.value < history.value.length - 1)
  function reset(value = null) {
    history.value = value ? [clonePersistableValue(value)] : []
    index.value = value ? 0 : -1
    savedSnapshot = value ? JSON.stringify(value) : ''
  }
  function record() {
    if (!editing.value || restoring || !schema.value || transactionDepth) return
    const snapshot = clonePersistableValue(schema.value)
    if (JSON.stringify(history.value[index.value]) === JSON.stringify(snapshot)) return
    history.value = [...history.value.slice(0, index.value + 1), snapshot].slice(-limit)
    index.value = history.value.length - 1
  }
  async function transaction(operation) {
    transactionDepth++
    try { return await operation() }
    finally { if (--transactionDepth === 0) record() }
  }
  async function apply(nextIndex) {
    const snapshot = history.value[nextIndex]
    if (!snapshot || restoring) return
    restoring = true
    try {
      schema.value = clonePersistableValue(snapshot)
      index.value = nextIndex
      dirty.value = JSON.stringify(snapshot) !== savedSnapshot
      saveState.value = dirty.value ? 'dirty' : 'saved'
      await reconcile()
    } finally { restoring = false }
  }
  watch(() => JSON.stringify(schema.value), record)
  return { history, index, canUndo, canRedo, transaction, apply, reset,
    undo: () => canUndo.value ? apply(index.value - 1) : undefined,
    redo: () => canRedo.value ? apply(index.value + 1) : undefined }
}
