import type { MessageInitShape } from '@bufbuild/protobuf'
import { Code, ConnectError } from '@connectrpc/connect'
import { zodResolver } from '@hookform/resolvers/zod'
import { useAtomValue } from 'jotai'
import { Eye, EyeOff, Loader2, Mail, Pencil, Save, Send, Trash2 } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import type { GetResponse } from '@/api/genproto/dashboard/orgemailproviders/v1/orgemailproviders_pb'
import {
  OrgEmailProviderKind,
  SetRequestSchema,
} from '@/api/genproto/dashboard/orgemailproviders/v1/orgemailproviders_pb'
import { orgEmailProvidersRPCAtom } from '@/api/rpc'
import HoverSwap from '@/components/hover-swap'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { Field, FieldDescription, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { activeOrgAtom } from '@/data/workspace.atoms'
import { formatRelative } from '@/hooks/use-relative-time'
import { toastRPCError } from '@/lib/rpc-error'
import { formatDateTime, tsToDate } from '@/lib/timestamp'

type Mode = 'loading' | 'empty' | 'summary' | 'edit'

const PROVIDER_KINDS = ['smtp', 'resend'] as const
type ProviderKind = (typeof PROVIDER_KINDS)[number]

// Conditional validation mirroring the proto buf.validate constraints. A flat object
// (RHF-friendly) + superRefine: shared from/reply-to, then per-kind required fields.
const emailFormSchema = z
  .object({
    kind: z.enum(PROVIDER_KINDS),
    fromAddress: z.email('Enter a valid from address'),
    replyTo: z.union([z.literal(''), z.email('Enter a valid email')]),
    host: z.string(),
    port: z.number(),
    smtpUsername: z.string(),
    smtpPassword: z.string(),
    useTls: z.boolean(),
    apiKey: z.string(),
  })
  .superRefine((val, ctx) => {
    if (val.kind === 'smtp') {
      if (!val.host) ctx.addIssue({ code: 'custom', path: ['host'], message: 'Host is required' })
      if (!Number.isInteger(val.port) || val.port < 1 || val.port > 65535)
        ctx.addIssue({ code: 'custom', path: ['port'], message: 'Port must be between 1 and 65535' })
      if (!val.smtpUsername) ctx.addIssue({ code: 'custom', path: ['smtpUsername'], message: 'Username is required' })
      if (!val.smtpPassword) ctx.addIssue({ code: 'custom', path: ['smtpPassword'], message: 'Password is required' })
    }
    if (val.kind === 'resend' && !val.apiKey) {
      ctx.addIssue({ code: 'custom', path: ['apiKey'], message: 'API key is required' })
    }
  })
type EmailForm = z.infer<typeof emailFormSchema>

const EMPTY_FORM: EmailForm = {
  kind: 'resend',
  fromAddress: '',
  replyTo: '',
  host: '',
  port: 587,
  smtpUsername: '',
  smtpPassword: '',
  useTls: true,
  apiKey: '',
}

const kindLabel = (kind: OrgEmailProviderKind) => {
  if (kind === OrgEmailProviderKind.RESEND) return 'Resend'
  if (kind === OrgEmailProviderKind.SMTP) return 'SMTP'
  return 'Unknown'
}

// Hint to browsers + password managers that these are provider-config fields, not the
// dashboard's own login — so they don't autofill the user's account email/password and
// don't offer to save the API key / SMTP password as the site login. `data-*-ignore`
// covers the popular extensions, which ignore `autocomplete`.
const NO_AUTOFILL = {
  autoComplete: 'off',
  'data-1p-ignore': 'true',
  'data-lpignore': 'true',
  'data-bwignore': 'true',
} as const

// `autocomplete="new-password"` is the reliable way to stop autofill on secret inputs —
// Chrome ignores `off` on type=password fields, but won't fill a saved login here.
const NO_AUTOFILL_SECRET = { ...NO_AUTOFILL, autoComplete: 'new-password' } as const

const EmailProviderSection = () => {
  const org = useAtomValue(activeOrgAtom)
  const rpc = useAtomValue(orgEmailProvidersRPCAtom)

  const [mode, setMode] = useState<Mode>('loading')
  const [current, setCurrent] = useState<GetResponse | null>(null)
  const [saving, setSaving] = useState(false)
  const [showSecret, setShowSecret] = useState(false)

  const [showTest, setShowTest] = useState(false)
  const [testRecipient, setTestRecipient] = useState('')
  const [testing, setTesting] = useState(false)
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null)

  const [confirmingRemove, setConfirmingRemove] = useState(false)
  const [removing, setRemoving] = useState(false)

  const form = useForm<EmailForm>({
    resolver: zodResolver(emailFormSchema),
    defaultValues: EMPTY_FORM,
  })
  const kind = form.watch('kind')
  const useTls = form.watch('useTls')

  // Load current config. "Not configured" arrives as kind=UNSPECIFIED or NotFound.
  const loadConfig = useCallback(async () => {
    if (!org) return
    setMode('loading')
    try {
      const res = await rpc.get({ orgId: org.id })
      if (res.kind === OrgEmailProviderKind.UNSPECIFIED) {
        setCurrent(null)
        setMode('empty')
      } else {
        setCurrent(res)
        setMode('summary')
      }
    } catch (err) {
      if (err instanceof ConnectError && err.code === Code.NotFound) {
        setCurrent(null)
        setMode('empty')
        return
      }
      toastRPCError(err, 'Failed to load email provider')
      setCurrent(null)
      setMode('empty')
    }
  }, [org, rpc])

  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Editing always re-enters the full config (the backend has no partial update and
  // never returns secrets). Only from/reply-to can be prefilled from the summary.
  const startEdit = () => {
    setShowTest(false)
    setConfirmingRemove(false)
    setShowSecret(false)
    form.reset({
      ...EMPTY_FORM,
      kind: current?.kind === OrgEmailProviderKind.RESEND ? 'resend' : 'smtp',
      fromAddress: current?.fromAddress ?? '',
      replyTo: current?.replyTo ?? '',
    })
    setMode('edit')
  }

  const onSave = form.handleSubmit(async data => {
    if (!org) return
    setSaving(true)
    try {
      let config: MessageInitShape<typeof SetRequestSchema>['config']
      if (data.kind === 'smtp') {
        config = {
          case: 'smtp',
          value: {
            host: data.host,
            port: data.port,
            username: data.smtpUsername,
            password: data.smtpPassword,
            useTls: data.useTls,
          },
        }
      } else {
        config = { case: 'resend', value: { apiKey: data.apiKey } }
      }
      await rpc.set({ orgId: org.id, fromAddress: data.fromAddress, replyTo: data.replyTo, config })
      await loadConfig() // refresh summary (redacted secret + update time)
    } catch (err) {
      toastRPCError(err, 'Failed to save email provider')
    } finally {
      setSaving(false)
    }
  })

  // SendTest can resolve with success=false — a failed test is data, not an error.
  const onSendTest = async () => {
    if (!org || !testRecipient) return
    setTesting(true)
    setTestResult(null)
    try {
      const res = await rpc.sendTest({ orgId: org.id, recipient: testRecipient })
      setTestResult({ ok: res.success, message: res.errorMessage })
    } catch (err) {
      toastRPCError(err, 'Failed to send test email')
    } finally {
      setTesting(false)
    }
  }

  const onRemove = async () => {
    if (!org) return
    setRemoving(true)
    try {
      await rpc.remove({ orgId: org.id })
      setConfirmingRemove(false)
      setShowTest(false)
      setCurrent(null)
      setMode('empty')
    } catch (err) {
      toastRPCError(err, 'Failed to remove email provider')
    } finally {
      setRemoving(false)
    }
  }

  if (!org) return null

  const updatedDate = current ? tsToDate(current.updateTime) : null

  return (
    <section>
      <SectionHeader title="Email Provider" description="Configure how this organization sends outbound email" />

      {mode === 'loading' && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" />
          Loading…
        </div>
      )}

      {mode === 'summary' && current && (
        <div className="space-y-4">
          <dl className="grid grid-cols-[120px_1fr] gap-y-2 text-sm">
            <dt className="text-muted-foreground">Provider</dt>
            <dd>{kindLabel(current.kind)}</dd>
            <dt className="text-muted-foreground">From</dt>
            <dd className="font-mono">{current.fromAddress}</dd>
            {current.replyTo && (
              <>
                <dt className="text-muted-foreground">Reply-to</dt>
                <dd className="font-mono">{current.replyTo}</dd>
              </>
            )}
            <dt className="text-muted-foreground">Secret</dt>
            <dd className="font-mono">{current.redactedSecret || '—'}</dd>
            {updatedDate && (
              <>
                <dt className="text-muted-foreground">Updated</dt>
                <dd>
                  <HoverSwap primary={formatRelative(updatedDate)} secondary={formatDateTime(updatedDate)} />
                </dd>
              </>
            )}
          </dl>

          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" onClick={startEdit}>
              <Pencil className="size-4" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTestResult(null)
                setShowTest(s => !s)
              }}
            >
              <Send className="size-4" />
              Send test
            </Button>
            {confirmingRemove ? (
              <span className="flex items-center gap-2 text-sm">
                <span className="text-muted-foreground">Remove provider?</span>
                <button
                  type="button"
                  onClick={onRemove}
                  disabled={removing}
                  className="text-destructive hover:underline cursor-pointer disabled:opacity-50"
                >
                  {removing ? 'Removing…' : 'Confirm'}
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmingRemove(false)}
                  disabled={removing}
                  className="text-muted-foreground hover:underline cursor-pointer"
                >
                  Cancel
                </button>
              </span>
            ) : (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setConfirmingRemove(true)}
                className="text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="size-4" />
                Remove
              </Button>
            )}
          </div>

          {showTest && (
            <div className="flex flex-col gap-2 rounded-md border border-border/50 p-3">
              <FieldLabel htmlFor="test-recipient">Send a test email to</FieldLabel>
              <div className="flex items-center gap-2">
                <Input
                  id="test-recipient"
                  type="email"
                  placeholder="you@example.com"
                  value={testRecipient}
                  onChange={e => setTestRecipient(e.target.value)}
                  className="h-8 max-w-xs"
                />
                <Button size="sm" onClick={onSendTest} disabled={testing || !testRecipient}>
                  {testing ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                  Send
                </Button>
              </div>
              {testResult?.ok && <span className="text-xs text-green-600">Test email sent</span>}
              {testResult && !testResult.ok && (
                <span className="text-xs text-destructive">{testResult.message || 'Test failed'}</span>
              )}
            </div>
          )}
        </div>
      )}

      {(mode === 'empty' || mode === 'edit') && (
        <form onSubmit={onSave} className="space-y-4">
          {mode === 'empty' && (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="size-4" />
              No email provider configured yet.
            </div>
          )}

          <Field>
            <FieldLabel>Provider</FieldLabel>
            <Select
              value={kind}
              onValueChange={v => v && form.setValue('kind', v as ProviderKind, { shouldValidate: true })}
            >
              <SelectTrigger className="max-w-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="smtp">SMTP</SelectItem>
                <SelectItem value="resend">Resend</SelectItem>
              </SelectContent>
            </Select>
          </Field>

          <Field data-invalid={!!form.formState.errors.fromAddress}>
            <FieldLabel htmlFor="from-address">From address</FieldLabel>
            <Input
              {...form.register('fromAddress')}
              {...NO_AUTOFILL}
              id="from-address"
              type="email"
              placeholder="notifications@acme.com"
              className="max-w-sm"
              aria-invalid={!!form.formState.errors.fromAddress}
            />
            {form.formState.errors.fromAddress && <FieldError errors={[form.formState.errors.fromAddress]} />}
          </Field>

          <Field data-invalid={!!form.formState.errors.replyTo}>
            <FieldLabel htmlFor="reply-to">
              Reply-to <span className="text-muted-foreground">(optional)</span>
            </FieldLabel>
            <Input
              {...form.register('replyTo')}
              {...NO_AUTOFILL}
              id="reply-to"
              type="email"
              placeholder="support@acme.com"
              className="max-w-sm"
              aria-invalid={!!form.formState.errors.replyTo}
            />
            {form.formState.errors.replyTo && <FieldError errors={[form.formState.errors.replyTo]} />}
          </Field>

          {kind === 'smtp' && (
            <div className="space-y-4">
              <Field data-invalid={!!form.formState.errors.host}>
                <FieldLabel htmlFor="smtp-host">Host</FieldLabel>
                <Input
                  {...form.register('host')}
                  id="smtp-host"
                  placeholder="smtp.acme.com"
                  className="max-w-sm"
                  aria-invalid={!!form.formState.errors.host}
                />
                {form.formState.errors.host && <FieldError errors={[form.formState.errors.host]} />}
              </Field>
              <Field data-invalid={!!form.formState.errors.port}>
                <FieldLabel htmlFor="smtp-port">Port</FieldLabel>
                <Input
                  {...form.register('port', { valueAsNumber: true })}
                  id="smtp-port"
                  type="number"
                  className="w-28"
                  aria-invalid={!!form.formState.errors.port}
                />
                {form.formState.errors.port && <FieldError errors={[form.formState.errors.port]} />}
              </Field>
              <Field data-invalid={!!form.formState.errors.smtpUsername}>
                <FieldLabel htmlFor="smtp-username">Username</FieldLabel>
                <Input
                  {...form.register('smtpUsername')}
                  {...NO_AUTOFILL}
                  id="smtp-username"
                  className="max-w-sm"
                  aria-invalid={!!form.formState.errors.smtpUsername}
                />
                {form.formState.errors.smtpUsername && <FieldError errors={[form.formState.errors.smtpUsername]} />}
              </Field>
              <Field data-invalid={!!form.formState.errors.smtpPassword}>
                <FieldLabel htmlFor="smtp-password">Password</FieldLabel>
                <div className="relative max-w-sm">
                  <Input
                    {...form.register('smtpPassword')}
                    {...NO_AUTOFILL_SECRET}
                    id="smtp-password"
                    type={showSecret ? 'text' : 'password'}
                    className="pr-9"
                    aria-invalid={!!form.formState.errors.smtpPassword}
                  />
                  <button
                    type="button"
                    onClick={() => setShowSecret(s => !s)}
                    aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                    tabIndex={-1}
                  >
                    {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
                {form.formState.errors.smtpPassword && <FieldError errors={[form.formState.errors.smtpPassword]} />}
              </Field>
              <label htmlFor="smtp-tls" className="flex items-center gap-2 text-sm cursor-pointer">
                <Switch id="smtp-tls" checked={useTls} onCheckedChange={c => form.setValue('useTls', c)} />
                Use TLS
              </label>
            </div>
          )}

          {kind === 'resend' && (
            <Field data-invalid={!!form.formState.errors.apiKey}>
              <FieldLabel htmlFor="resend-key">API key</FieldLabel>
              <div className="relative max-w-sm">
                <Input
                  {...form.register('apiKey')}
                  {...NO_AUTOFILL_SECRET}
                  id="resend-key"
                  type={showSecret ? 'text' : 'password'}
                  placeholder="re_..."
                  className="pr-9 font-mono"
                  aria-invalid={!!form.formState.errors.apiKey}
                />
                <button
                  type="button"
                  onClick={() => setShowSecret(s => !s)}
                  aria-label={showSecret ? 'Hide secret' : 'Show secret'}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  tabIndex={-1}
                >
                  {showSecret ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <FieldDescription>Find this in your Resend dashboard under API Keys.</FieldDescription>
              {form.formState.errors.apiKey && <FieldError errors={[form.formState.errors.apiKey]} />}
            </Field>
          )}

          {current && (
            <FieldDescription>
              For security, re-enter the full {kind === 'smtp' ? 'password' : 'API key'} to save changes.
            </FieldDescription>
          )}

          <div className="flex items-center gap-2">
            <Button type="submit" size="sm" disabled={saving}>
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
              Save
            </Button>
            {mode === 'edit' && (
              <Button type="button" size="sm" variant="ghost" onClick={() => setMode('summary')} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
        </form>
      )}
    </section>
  )
}

export default EmailProviderSection
