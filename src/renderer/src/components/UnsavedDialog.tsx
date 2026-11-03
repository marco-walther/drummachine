import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { answerUnsaved, useUnsavedPrompt } from '@/state/prompts'

/** "Save changes?" before New/Open/Recover replaces the project. */
export function UnsavedDialog() {
  const name = useUnsavedPrompt((s) => s.name)
  return (
    <AlertDialog open={name !== null} onOpenChange={(open) => !open && answerUnsaved('cancel')}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Save changes to “{name}”?</AlertDialogTitle>
          <AlertDialogDescription>Your changes will be lost if you don&apos;t save them.</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <Button variant="ghost" onClick={() => answerUnsaved('cancel')}>
            Cancel
          </Button>
          <Button variant="outline" onClick={() => answerUnsaved('discard')}>
            Don&apos;t save
          </Button>
          <Button autoFocus onClick={() => answerUnsaved('save')}>
            Save
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
