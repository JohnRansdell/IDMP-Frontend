import { ref } from 'vue'
// Explicit layout state avoids DOM/CSS ancestor probing for immersive workspaces.
export const designerImmersive = ref(false)
// Dashboard scene selection is shared with the normal Shell header. It is
// runtime navigation state, never a data-filter value or persisted schema field.
export const dashboardSceneCode = ref('')
// Canonical Dashboard identity shared by the Shell selector and Dashboard page.
export const dashboardActiveId = ref('')
// Selector intent is deliberately separate from the committed active identity.
// Dashboard.vue resolves it through one switch transaction, then commits both.
export const dashboardRequestedId = ref('')
// Catalog writes bump this value so the Shell can refresh local options without reload.
export const dashboardCatalogRevision = ref(0)
export function notifyDashboardCatalogChanged() { dashboardCatalogRevision.value += 1 }
