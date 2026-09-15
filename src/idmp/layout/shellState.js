import { ref } from 'vue'
// Explicit layout state avoids DOM/CSS ancestor probing for immersive workspaces.
export const designerImmersive = ref(false)
// Dashboard scene selection is shared with the normal Shell header. It is
// runtime navigation state, never a data-filter value or persisted schema field.
export const dashboardSceneCode = ref('performance')
