import { zodResolver } from '@hookform/resolvers/zod'
import { Loader2 } from 'lucide-react'
import { Controller, useForm } from 'react-hook-form'
import { z } from 'zod'
import { DomainStatus, type OrgDomain, type SSOConnection } from '@/api/genproto/dashboard/orgs/v1/orgs_pb'
import { connectionRedirectURI } from '@/auth/oidc'
import CopyableCode from '@/components/copyable-code'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'

// The server's rule: HTTPS, or HTTP on localhost, with no credentials, query or fragment.
const isIssuerURL = (raw: string) => {
  try {
    const url = new URL(raw)
    const localhost = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
    const secure = url.protocol === 'https:' || (url.protocol === 'http:' && localhost)
    return secure && !url.username && !url.password && !url.search && !url.hash
  } catch {
    return false
  }
}

const connectionSchema = (saved?: SSOConnection) =>
  z
    .object({
      label: z.string().trim().min(1, 'Enter a button label').max(64, 'Use at most 64 characters'),
      issuerUrl: z
        .string()
        .trim()
        .max(2048, 'Use at most 2048 characters')
        .refine(isIssuerURL, 'Enter an HTTPS URL such as https://acme.okta.com'),
      clientId: z.string().trim().min(1, 'Enter the client ID').max(255, 'Use at most 255 characters'),
      clientSecret: z.string().trim().max(4096, 'Use at most 4096 characters'),
      domainIds: z.array(z.string()).min(1, 'Pick at least one domain').max(10, 'Pick at most 10 domains'),
    })
    .superRefine((data, ctx) => {
      if (data.clientSecret) return
      // A secret belongs to one client at one issuer, so the server won't reuse it for another.
      let message = ''
      if (!saved) message = 'Enter the client secret'
      else if (data.issuerUrl !== saved.issuerUrl) message = 'Enter the client secret again for the new issuer'
      else if (data.clientId !== saved.clientId) message = 'Enter the client secret again for the new client ID'
      if (message) ctx.addIssue({ code: 'custom', path: ['clientSecret'], message })
    })

export type ConnectionFormData = z.infer<ReturnType<typeof connectionSchema>>

// Why a verified domain can't be picked: one connection signs a domain in, across every org.
const takenBy = (domain: OrgDomain, connection: SSOConnection | undefined, connections: SSOConnection[]) => {
  if (domain.ssoConnectionElsewhere) return "Another organization's connection signs it in."
  if (!domain.ssoConnectionId || domain.ssoConnectionId === connection?.id) return ''
  const other = connections.find(c => c.id === domain.ssoConnectionId)
  return `${other?.label ?? 'Another connection'} signs it in.`
}

export const ConnectionForm = ({
  connection,
  connections,
  domains,
  onSave,
  onCancel,
}: {
  connection?: SSOConnection
  connections: SSOConnection[]
  domains: OrgDomain[]
  onSave: (data: ConnectionFormData) => Promise<void>
  onCancel: () => void
}) => {
  const form = useForm<ConnectionFormData>({
    resolver: zodResolver(connectionSchema(connection)),
    defaultValues: {
      label: connection?.label ?? '',
      issuerUrl: connection?.issuerUrl ?? '',
      clientId: connection?.clientId ?? '',
      clientSecret: '',
      domainIds: connection?.domains.map(d => d.id) ?? [],
    },
  })
  const { errors, isSubmitting: saving } = form.formState
  const verified = domains.filter(d => d.status === DomainStatus.VERIFIED)
  const issuerChanged = !!connection && form.watch('issuerUrl').trim() !== connection.issuerUrl
  // A domain removed above while this was open has no checkbox left to untick.
  const save = (data: ConnectionFormData) =>
    onSave({ ...data, domainIds: data.domainIds.filter(id => verified.some(d => d.id === id)) })

  return (
    <form
      noValidate
      onSubmit={form.handleSubmit(save)}
      onKeyDown={e => {
        if (e.key === 'Escape' && !saving) onCancel()
      }}
      className="space-y-4 border-b border-border/50 py-3"
    >
      <Field data-invalid={!!errors.label}>
        <FieldLabel htmlFor="sso-label">Button label</FieldLabel>
        <Input
          {...form.register('label')}
          id="sso-label"
          placeholder="Acme SSO"
          autoFocus
          maxLength={64}
          disabled={saving}
          aria-invalid={!!errors.label}
        />
        <p className="text-xs text-muted-foreground">People see it on the sign-in button.</p>
        {errors.label && <FieldError errors={[errors.label]} />}
      </Field>

      <Field data-invalid={!!errors.issuerUrl}>
        <FieldLabel htmlFor="sso-issuer">Issuer URL</FieldLabel>
        <Input
          {...form.register('issuerUrl')}
          id="sso-issuer"
          placeholder="https://acme.okta.com"
          inputMode="url"
          autoComplete="off"
          maxLength={2048}
          disabled={saving}
          aria-invalid={!!errors.issuerUrl}
        />
        {issuerChanged && (
          <p className="text-xs text-muted-foreground">
            A new issuer unlinks the people who signed in through this connection. They link again by email at their
            next sign-in.
          </p>
        )}
        {errors.issuerUrl && <FieldError errors={[errors.issuerUrl]} />}
      </Field>

      <Field data-invalid={!!errors.clientId}>
        <FieldLabel htmlFor="sso-client-id">Client ID</FieldLabel>
        <Input
          {...form.register('clientId')}
          id="sso-client-id"
          autoComplete="off"
          maxLength={255}
          disabled={saving}
          aria-invalid={!!errors.clientId}
        />
        {errors.clientId && <FieldError errors={[errors.clientId]} />}
      </Field>

      <Field data-invalid={!!errors.clientSecret}>
        <FieldLabel htmlFor="sso-client-secret">Client secret</FieldLabel>
        <Input
          {...form.register('clientSecret')}
          id="sso-client-secret"
          type="password"
          placeholder={connection ? 'Unchanged' : undefined}
          autoComplete="new-password"
          maxLength={4096}
          disabled={saving}
          aria-invalid={!!errors.clientSecret}
        />
        {connection && (
          <p className="text-xs text-muted-foreground">
            Leave it blank to keep the current secret, unless the issuer or client ID changes.
          </p>
        )}
        {errors.clientSecret && <FieldError errors={[errors.clientSecret]} />}
      </Field>

      <Field data-invalid={!!errors.domainIds}>
        <span id="sso-domains" className="text-sm font-medium">
          Domains
        </span>
        <Controller
          control={form.control}
          name="domainIds"
          render={({ field }) => (
            <div role="group" aria-labelledby="sso-domains" className="space-y-2">
              {verified.map(domain => {
                const reason = takenBy(domain, connection, connections)
                return (
                  <div key={domain.id} className="flex items-center gap-2">
                    <Checkbox
                      id={`sso-domain-${domain.id}`}
                      checked={field.value.includes(domain.id)}
                      disabled={saving || (!!reason && !field.value.includes(domain.id))}
                      onCheckedChange={on =>
                        field.onChange(on ? [...field.value, domain.id] : field.value.filter(id => id !== domain.id))
                      }
                    />
                    <label htmlFor={`sso-domain-${domain.id}`} className="font-mono text-sm">
                      {domain.domain}
                    </label>
                    {reason && <span className="text-xs text-muted-foreground">{reason}</span>}
                  </div>
                )
              })}
            </div>
          )}
        />
        <p className="text-xs text-muted-foreground">
          People with an email on these domains sign in through this connection.
        </p>
        {errors.domainIds && <FieldError>{errors.domainIds.message}</FieldError>}
      </Field>

      <div className="space-y-1">
        {connection ? (
          <>
            <p className="text-xs text-muted-foreground">Add this redirect URL in your identity provider.</p>
            <CopyableCode label="Redirect URL" value={connectionRedirectURI(connection.id)} />
          </>
        ) : (
          <p className="text-xs text-muted-foreground">
            Save to get the redirect URL to add in your identity provider.
          </p>
        )}
        <p className="text-xs text-muted-foreground">
          Pug asks for the openid, profile and email scopes, and your provider must send the email claim.
        </p>
      </div>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} disabled={saving}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={saving}>
          {saving && <Loader2 className="animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  )
}
