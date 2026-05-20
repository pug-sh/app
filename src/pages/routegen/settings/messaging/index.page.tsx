import { zodResolver } from '@hookform/resolvers/zod'
import { useAtomValue } from 'jotai'
import { Loader2, Save } from 'lucide-react'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { projectsRPCAtom } from '@/api/rpc'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Textarea } from '@/components/ui/textarea'
import { projectHeaderAtom } from '@/data/workspace.atoms'
import { toastRPCError } from '@/lib/rpc-error'
import SettingsLayout from '../settings-layout'

const fcmSchema = z.object({
  fcmJSON: z
    .string()
    .min(1, 'FCM JSON is required')
    .refine(val => {
      try {
        JSON.parse(val)
        return true
      } catch {
        return false
      }
    }, 'Invalid JSON'),
})
type FcmFormData = z.infer<typeof fcmSchema>

const Messaging = () => {
  const projectHeaders = useAtomValue(projectHeaderAtom)
  const projectsRPC = useAtomValue(projectsRPCAtom)

  const [savingFcm, setSavingFcm] = useState(false)
  const [savedFcm, setSavedFcm] = useState(false)
  const savedFcmTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  const fcmForm = useForm<FcmFormData>({
    resolver: zodResolver(fcmSchema),
    defaultValues: { fcmJSON: '' },
  })

  const handleFCMUpload = async (data: FcmFormData) => {
    if (!projectHeaders) {
      console.warn('handleFCMUpload called without project headers')
      return
    }
    setSavingFcm(true)
    try {
      await projectsRPC.updateFCMServiceJSON({ fcmServiceJson: data.fcmJSON }, { headers: projectHeaders })
      fcmForm.reset({ fcmJSON: '' })
      setSavedFcm(true)
      clearTimeout(savedFcmTimer.current)
      savedFcmTimer.current = setTimeout(() => setSavedFcm(false), 2000)
    } catch (err) {
      toastRPCError(err, 'Failed to upload FCM config')
    } finally {
      setSavingFcm(false)
    }
  }

  return (
    <SettingsLayout>
      <div className="space-y-8 max-w-2xl">
        {projectHeaders && (
          <section>
            <SectionHeader
              title="FCM Service Account"
              description="Paste your Firebase Cloud Messaging service account JSON"
            />
            <form onSubmit={fcmForm.handleSubmit(handleFCMUpload)} className="space-y-3">
              <Field data-invalid={!!fcmForm.formState.errors.fcmJSON}>
                <FieldLabel htmlFor="fcm-json">Service Account JSON</FieldLabel>
                <Textarea
                  {...fcmForm.register('fcmJSON')}
                  id="fcm-json"
                  className="font-mono min-h-30"
                  placeholder={`{\n  "type": "service_account",\n  "project_id": "your-project-id",\n  "private_key_id": "...",\n  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",\n  "client_email": "firebase-adminsdk-...@your-project.iam.gserviceaccount.com"\n}`}
                  aria-invalid={!!fcmForm.formState.errors.fcmJSON}
                />
                {fcmForm.formState.errors.fcmJSON && <FieldError errors={[fcmForm.formState.errors.fcmJSON]} />}
              </Field>
              <div className="flex items-center gap-2">
                <Button type="submit" size="sm" disabled={savingFcm || !fcmForm.formState.isDirty}>
                  {savingFcm ? <Loader2 className="animate-spin" /> : <Save className="w-4 h-4" />}
                  Upload
                </Button>
                {savedFcm && <span className="text-xs text-green-600 animate-in fade-in">Uploaded</span>}
              </div>
            </form>
          </section>
        )}
      </div>
    </SettingsLayout>
  )
}

export default Messaging
