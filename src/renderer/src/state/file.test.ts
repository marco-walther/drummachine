import { beforeEach, describe, expect, it } from 'vitest'
import { replaceProject, useProjectFile, withoutTracking } from './file'
import { initialProject, useProject } from './project'

beforeEach(() => replaceProject(initialProject(), { path: null, name: 'Untitled' }))

describe('unsaved-changes tracking', () => {
  it('a fresh/loaded project is clean', () => {
    expect(useProjectFile.getState().dirty).toBe(false)
  })
  it('editing marks dirty', () => {
    useProject.getState().toggleStep(useProject.getState().channels[0].id, 0)
    expect(useProjectFile.getState().dirty).toBe(true)
  })
  it('selection does not mark dirty', () => {
    useProject.getState().selectChannel(useProject.getState().channels[1].id)
    expect(useProjectFile.getState().dirty).toBe(false)
  })
  it('withoutTracking changes stay clean', () => {
    withoutTracking(() => useProject.getState().setBpm(99))
    expect(useProjectFile.getState().dirty).toBe(false)
  })
})
