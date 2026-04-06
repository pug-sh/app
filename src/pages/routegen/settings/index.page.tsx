import { orgsRPCAtom, projectsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { activeOrgAtom, activeProjectAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { useCopyToClipboard } from '@/hooks/use-copy-to-clipboard'
import { toastRPCError } from '@/lib/rpc-error'
import { useAtom, useAtomValue } from 'jotai'
import { Check, Copy, Loader2, Lock, Save } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

const CopyId = ({ value }: { value: string }) => {
  const { copied, copy } = useCopyToClipboard()
  return (
    <button
      onClick={() => copy(value)}
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
  const [savingOrg, setSavingOrg] = useState(false)
  const [savingProject, setSavingProject] = useState(false)
  const [savingFcm, setSavingFcm] = useState(false)
  const [savedOrg, setSavedOrg] = useState(false)
  const [savedProject, setSavedProject] = useState(false)
  const [savedFcm, setSavedFcm] = useState(false)
  const savedOrgTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const savedProjectTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const savedFcmTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => { setOrgName(org?.displayName ?? '') }, [org])
  useEffect(() => { setProjectName(project?.displayName ?? '') }, [project])

  const orgDirty = orgName.trim() !== '' && orgName !== (org?.displayName ?? '')
  const projectDirty = projectName.trim() !== '' && projectName !== (project?.displayName ?? '')

  const handleRenameOrg = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!org || !orgDirty) return
    setSavingOrg(true)
    try {
      await orgsRPC.updateDisplayName({ orgId: org.id, displayName: orgName })
      setOrg({ ...org, displayName: orgName })
      setSavedOrg(true)
      clearTimeout(savedOrgTimer.current)
      savedOrgTimer.current = setTimeout(() => setSavedOrg(false), 2000)
    } catch (err) {
      toastRPCError(err, 'Failed to rename organization')
    } finally {
      setSavingOrg(false)
    }
  }

  const handleRenameProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectHeaders || !projectDirty) return
    setSavingProject(true)
    try {
      await projectsRPC.updateDisplayName({ displayName: projectName }, { headers: projectHeaders })
      setProject({ ...project!, displayName: projectName })
      setSavedProject(true)
      clearTimeout(savedProjectTimer.current)
      savedProjectTimer.current = setTimeout(() => setSavedProject(false), 2000)
    } catch (err) {
      toastRPCError(err, 'Failed to rename project')
    } finally {
      setSavingProject(false)
    }
  }

  const handleFCMUpload = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectHeaders || !fcmJSON.trim()) return
    setSavingFcm(true)
    try {
      await projectsRPC.updateFCMServiceJSON({ fcmServiceJson: fcmJSON }, { headers: projectHeaders })
      setFcmJSON('')
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
    <Page title='Settings' description='Manage project settings'>
      <div className='space-y-8 max-w-2xl'>
        <section>
          <SectionHeader title='API Endpoint' description='Configured via VITE_API_BASE_URL environment variable' />
          <div className='flex items-center gap-2 text-xs text-muted-foreground bg-muted/50 border border-border/50 px-2.5 py-2 rounded-md font-mono'>
            <Lock className='w-3 h-3 shrink-0' />
            <span className='break-all'>{import.meta.env.VITE_API_BASE_URL}</span>
          </div>
        </section>

        {org && (
          <section>
            <SectionHeader title='Organization' description='Rename your organization' />
            <div className='space-y-2'>
              <form onSubmit={handleRenameOrg} className='flex gap-2 items-center'>
                <Input value={orgName} onChange={e => setOrgName(e.target.value)} maxLength={150} />
                <Button type='submit' variant='outline' size='sm' disabled={savingOrg || !orgDirty}>
                  {savingOrg ? <Loader2 className='animate-spin' /> : <Save className='w-4 h-4' />}
                  Save
                </Button>
                {savedOrg && <span className='text-xs text-green-600 animate-in fade-in'>Saved</span>}
              </form>
              <CopyId value={org.id} />
            </div>
          </section>
        )}

        {project && projectHeaders && (
          <>
            <section>
              <SectionHeader title='Project name' description='Rename this project' />
              <form onSubmit={handleRenameProject} className='flex gap-2 items-center'>
                <Input value={projectName} onChange={e => setProjectName(e.target.value)} maxLength={150} />
                <Button type='submit' variant='outline' size='sm' disabled={savingProject || !projectDirty}>
                  {savingProject ? <Loader2 className='animate-spin' /> : <Save className='w-4 h-4' />}
                  Save
                </Button>
                {savedProject && <span className='text-xs text-green-600 animate-in fade-in'>Saved</span>}
              </form>
            </section>

            <section>
              <SectionHeader title='FCM Service Account' description='Paste your Firebase Cloud Messaging service account JSON' />
              <form onSubmit={handleFCMUpload} className='space-y-3'>
                <Textarea
                  className='font-mono min-h-[120px]'
                  placeholder={`{\n  "type": "service_account",\n  "project_id": "your-project-id",\n  "private_key_id": "...",\n  "private_key": "-----BEGIN PRIVATE KEY-----\\n...\\n-----END PRIVATE KEY-----\\n",\n  "client_email": "firebase-adminsdk-...@your-project.iam.gserviceaccount.com"\n}`}
                  value={fcmJSON}
                  onChange={e => setFcmJSON(e.target.value)}
                />
                <div className='flex items-center gap-2'>
                  <Button type='submit' size='sm' disabled={savingFcm || !fcmJSON.trim()}>
                    {savingFcm ? <Loader2 className='animate-spin' /> : <Save className='w-4 h-4' />}
                    Upload
                  </Button>
                  {savedFcm && <span className='text-xs text-green-600 animate-in fade-in'>Uploaded</span>}
                </div>
              </form>
            </section>
          </>
        )}
      </div>
    </Page>
  )
}

export default Settings
