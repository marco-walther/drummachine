import { create } from 'zustand'

export type UnsavedChoice = 'save' | 'discard' | 'cancel'

/** Promise-based "save changes?" prompt, rendered by <UnsavedDialog />. */
export const useUnsavedPrompt = create<{ name: string | null; resolve: ((c: UnsavedChoice) => void) | null }>(
  () => ({ name: null, resolve: null })
)

export function askUnsaved(name: string): Promise<UnsavedChoice> {
  return new Promise((resolve) => useUnsavedPrompt.setState({ name, resolve }))
}

export function answerUnsaved(choice: UnsavedChoice) {
  const { resolve } = useUnsavedPrompt.getState()
  useUnsavedPrompt.setState({ name: null, resolve: null })
  resolve?.(choice)
}
