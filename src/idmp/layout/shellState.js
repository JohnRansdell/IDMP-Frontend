import { ref } from 'vue'
// Explicit layout state avoids DOM/CSS ancestor probing for immersive workspaces.
export const designerImmersive = ref(false)
