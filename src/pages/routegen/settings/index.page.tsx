import { projectsRPCAtom } from '@/api/rpc'
import Page from '@/components/layout/page'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { activeOrgAtom, activeProjectAtom, orgsAtom, projectHeaderAtom } from '@/data/workspace.atoms'
import { useAtom, useAtomValue } from 'jotai'
import { Building2, Check, ChevronsUpDown, Copy, Loader2, Save } from 'lucide-react'
import { useState } from 'react'

const CopyId = ({ value }: { value: string }) => {
  const [copied, setCopied] = useState(false)
  return (
    <button
      onClick={async () => {
        await navigator.clipboard.writeText(value)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
      }}
      className='inline-flex items-center gap-1.5 text-xs text-muted-foreground font-mono hover:text-foreground transition-colors cursor-pointer'
    >
      {value}
      {copied ? <Check className='w-3 h-3 text-green-600' /> : <Copy className='w-3 h-3' />}
    </button>
  )
}

const Settings = () => {
  const project = useAtomValue(activeProjectAtom)
  const [activeOrg, setActiveOrg] = useAtom(activeOrgAtom)
  const [, setActiveProject] = useAtom(activeProjectAtom)
  const orgs = useAtomValue(orgsAtom)
  const org = activeOrg
  const projectHeaders = useAtomValue(projectHeaderAtom)
  const projectsRPC = useAtomValue(projectsRPCAtom)

  const [projectName, setProjectName] = useState(project?.displayName ?? '')
  const [fcmJSON, setFcmJSON] = useState('')
  const [saving, setSaving] = useState(false)

  const handleRenameProject = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!projectHeaders || !projectName.trim()) return
    setSaving(true)
    try {
      await projectsRPC.updateDisplayName({ displayName: projectName }, { headers: projectHeaders })
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
    } finally {
      setSaving(false)
    }
  }

  return (
    <Page title='Settings' description='Manage project settings'>
      <div className='space-y-6 max-w-2xl'>
        <Card>
          <CardHeader>
            <CardTitle className='text-base'>API Endpoint</CardTitle>
            <CardDescription>
              Configured via <code className='text-xs bg-muted px-1.5 py-0.5 rounded'>VITE_API_BASE_URL</code>{' '}
              environment variable
            </CardDescription>
          </CardHeader>
          <CardContent>
            <code className='text-xs bg-muted px-2.5 py-1.5 rounded-md block font-mono'>
              {import.meta.env.VITE_API_BASE_URL}
            </code>
          </CardContent>
        </Card>

        {org && (
          <Card>
            <CardHeader>
              <CardTitle className='text-base'>Organization</CardTitle>
              <CardDescription>Switch between your organizations</CardDescription>
            </CardHeader>
            <CardContent className='space-y-3'>
              <DropdownMenu>
                <DropdownMenuTrigger render={<Button variant='outline' className='w-full justify-between' />}>
                  <span className='flex items-center gap-2'>
                    <Building2 className='size-4' />
                    {org.displayName}
                  </span>
                  <ChevronsUpDown className='size-4 text-muted-foreground' />
                </DropdownMenuTrigger>
                <DropdownMenuContent className='min-w-56 rounded-lg' align='start'>
                  {orgs.map(o => (
                    <DropdownMenuItem
                      key={o.id}
                      onSelect={() => {
                        setActiveOrg(o)
                        setActiveProject(null)
                      }}
                    >
                      <Building2 className='size-4' />
                      {o.displayName}
                      {o.id === org.id && <Check className='ml-auto size-4' />}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
              <CopyId value={org.id} />
            </CardContent>
          </Card>
        )}

        {project && projectHeaders && (
          <>
            <Card>
              <CardHeader>
                <CardTitle className='text-base'>Project name</CardTitle>
                <CardDescription>Rename this project</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleRenameProject} className='flex gap-2'>
                  <Input value={projectName} onChange={e => setProjectName(e.target.value)} maxLength={150} />
                  <Button type='submit' variant='outline' size='sm' disabled={saving || !projectName.trim()}>
                    {saving ? <Loader2 className='animate-spin' /> : <Save className='w-4 h-4' />}
                    Save
                  </Button>
                </form>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className='text-base'>FCM Service Account</CardTitle>
                <CardDescription>Paste your Firebase Cloud Messaging service account JSON</CardDescription>
              </CardHeader>
              <CardContent>
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
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </Page>
  )
}

export default Settings
