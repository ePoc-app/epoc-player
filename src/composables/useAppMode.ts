import { computed, type ComputedRef } from 'vue'

export type AppMode = 'preview' | 'production' | 'development' | string

export interface AppModeInfo {
    mode: ComputedRef<AppMode>
    isPreview: ComputedRef<boolean>
    isEditorPreview: ComputedRef<boolean>
    isStandalone: ComputedRef<boolean>
}

// Set by the epoc-editor preview server, absent from HTML/SCORM exports
const editorPreview = !!(window as Window & { epocEditorPreview?: boolean }).epocEditorPreview

export function useAppMode(): AppModeInfo {
    const mode = computed<AppMode>(() => import.meta.env.VITE_APP_MODE)

    const isPreview = computed<boolean>(() => mode.value === 'preview')

    // Preview build played in the editor, or from an HTML/SCORM export
    const isEditorPreview = computed<boolean>(() => isPreview.value && editorPreview)
    const isStandalone = computed<boolean>(() => isPreview.value && !editorPreview)

    return { mode, isPreview, isEditorPreview, isStandalone }
}