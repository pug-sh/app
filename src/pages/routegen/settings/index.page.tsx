import { orgsRPCAtom, projectsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { activeOrgAtom, activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { useAtom, useAtomValue } from 'jotai'
import { Check, Copy, Loader2, Save } from 'lucide-react'
import { useEffect, useState } from 'react'
import { toast } from 'sonner'

const SectionHeader = ({ title, description }: { title: string; description: string }) => (
  <div className='mb-4'>
    <div className='flex items-center gap-2 mb-1'>
      <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>{title}</span>
      <div className='flex-1 h-px bg-border' />
    </div>
    <p className='text-xs text-muted-foreground'>{description}</p>
  </div>
)

const CopyId = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch {
          // clipboard unavailable (insecure context, no focus, etc.)
        }
      }}
      className='inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono hover:text-foreground transition-colors cursor-pointer'
    >
      {value}
      {copied ? <Check className='w-3 h-3 text-green-600' /> : <Copy className='w-3 h-3' />}
    </button>
  )
}

const Settings = () => {
  const [org, setOrg] = useAtom(activeOrgAtom)
  const [project, setProject] = useAtom(activeProjectAtom)
  const projectHeaders = useAtomValue(projectHeaderAtom)
  const orgsRPC = useAtomValue(orgsRPCAtom)
  const projectsRPC = useAtomValue(projectsRPCAtom)

  const [orgName, setOrgName] = useState(org?.displayName ?? '')
  const [projectName, setProjectName] = useState(project?.displayName ?? '')
  const [fcmJSON, setFcmJSON] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { setOrgName(org?.displayName ?? '') }, [org])
  useEffect(() => { setProjectName(project?.displayName ?? '') }, [project])

  const handleRenameOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!org || !orgName.trim()) return
    setSaving(true)
    try {
      await orgsRPC.updateDisplayName({ orgId: org.id, displayName: orgName })
      setOrg({ ...org, displayName: orgName })
    } catch {
      toast.error('Failed to rename organization')
    } finally {
      setSaving(false)
    }
  }

  const handleRenameProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectHeaders || !projectName.trim()) return
    setSaving(true)
    try {
      await projectsRPC.updateDisplayName({ displayName: projectName }, { headers: projectHeaders })
      setProject({ ...project!, displayName: projectName })
    } catch {
      toast.error('Failed to rename project')
    } finally {
      setSaving(false)
    }
  }

  const handleFCMUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectHeaders || !fcmJSON.trim()) return
    setSaving(true)
    try {
      await projectsRPC.updateFCMServiceJSON({ fcmServiceJson: fcmJSON }, { headers: projectHeaders })
      setFcmJSON('')
    } catch {
      toast.error('Failed to upload FCM config')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page title='Settings' description='Manage project settings'>
      <div className='space-y-8 max-w-2xl'>
        <section>
          <SectionHeader title='API Endpoint' description='Configured via VITE_API_BASE_URL environment variable' />
          <code className='text-xs bg-muted px-2.5 py-1.5 rounded-md block font-mono'>
            {import.meta.env.VITE_API_BASE_URL}
          </code>
        </section>

        {org && (
          <section>
            <SectionHeader title='Organization' description='Rename your organization' />
            <div className='space-y-2'>
              <form onSubmit={handleRenameOrg} className='flex gap-2'>
                <Input value={orgName} onChange={e => setOrgName(e.target.value)} maxLength={150} />
                <Button type='submit' variant='outline' size='sm' disabled={saving || !orgName.trim()}>
                  {saving ? <Loader2 className='animate-spin' /> : <Save className='w-4 h-4' />}
                  Save
                </Button>
              </form>
              <CopyId value={org.id} />
            </div>
          </section>
        )}

        {project && projectHeaders && (
          <>
            <section>
              <SectionHeader title='Project name' description='Rename this project' />
              <form onSubmit={handleRenameProject} className='flex gap-2'>
                <Input value={projectName} onChange={e => setProjectName(e.target.value)} maxLength={150} />
                <Button type='submit' variant='outline' size='sm' disabled={saving || !projectName.trim()}>
                  {saving ? <Loader2 className='animate-spin' /> : <Save className='w-4 h-4' />}
                  Save
                </Button>
              </form>
            </section>

            <section>
              <SectionHeader title='FCM Service Account' description='Paste your Firebase Cloud Messaging service account JSON' />
              <form onSubmit={handleFCMUpload} className='space-y-3'>
                <Textarea
                  className='font-mono min-h-[120px]'
                  placeholder='{"type": "service_account", ...}'
                  value={fcmJSON}
                  onChange={e => setFcmJSON(e.target.value)}
                />
                <Button type='submit' size='sm' disabled={saving || !fcmJSON.trim()}>
                  {saving ? <Loader2 className='animate-spin' /> : <Save className='w-4 h-4' />}
                  Upload
                </Button>
              </form>
            </section>
          </>
        )}
      </div>
    </Page>
  )
}

export default Settings
