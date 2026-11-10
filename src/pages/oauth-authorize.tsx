import type { MessageInitShape } from '@bufbuild/protobuf'
import { ConnectError } from '@connectrpc/connect'
import { useAtomValue, useSetAtom } from 'jotai'
import { AlertCircle, Loader2, TriangleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useSearch } from 'wouter'
import {
  AuthorizationErrorSchema,
  type AuthorizationRequestSchema,
  type DescribeAuthorizationResponse,
  type Project,
} from '@/api/genproto/dashboard/mcpgrants/v1/mcpgrants_pb'
import { mcpGrantsRPCAtom } from '@/api/rpc'
import { fetchMeAtom, meAtom, meStatusAtom, signOutAtom } from '@/auth/auth.atoms'
import { AuthPending, AuthStatus } from '@/auth/auth-status'
import { Button } from '@/components/ui/button'
import { errorReason } from '@/lib/rpc-error'

type AuthorizationQuery = MessageInitShape<typeof AuthorizationRequestSchema>

// The client's query as it sent it. The server checks every field; its scope is ignored, since every
// connection gets the same access.
const queryFrom = (search: string): AuthorizationQuery => {
  const params = new URLSearchParams(search)
  const param = (name: string) => params.get(name) ?? ''
  return {
    clientId: param('client_id'),
    redirectUri: param('redirect_uri'),
    responseType: param('response_type'),
    state: param('state'),
    codeChallenge: param('code_challenge'),
    codeChallengeMethod: param('code_challenge_method'),
    resource: param('resource'),
  }
}

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

// Every way back to the app is a URL the server built. It is still only followed when https, or http on
// this computer.
const followable = (raw: string) => {
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return null
  }
  const secure = url.protocol === 'https:' || (url.protocol === 'http:' && LOOPBACK_HOSTS.has(url.hostname))
  return secure ? url : null
}

type Refusal = { title: string; description: string; back?: URL; retry?: boolean }

// The refusals the request itself earns. Only MCP_AUTHORIZATION_INVALID has a way back, in its AuthorizationError
// detail: nothing vouches for the others' redirect.
const requestRefusal = (err: unknown): Refusal | null => {
  const authorizationError = err instanceof ConnectError ? err.findDetails(AuthorizationErrorSchema)[0] : undefined
  if (authorizationError) {
    return {
      title: "Can't connect this app",
      description: "The app sent a request Pug can't accept.",
      back: followable(authorizationError.redirectUri) ?? undefined,
    }
  }
  switch (errorReason(err)) {
    case 'MCP_CLIENT_INVALID':
      return {
        title: "Can't connect this app",
        description: "Pug couldn't confirm who this app is: its details are missing or invalid.",
      }
    case 'MCP_REDIRECT_NOT_LISTED':
      return {
        title: "Can't connect this app",
        description: "The app asked to send you somewhere its own details don't list.",
      }
    case 'MCP_OAUTH_DISABLED':
      return { title: 'App connections are off', description: "This Pug server doesn't let apps connect." }
  }
  return null
}

const loadRefusal = (err: unknown): Refusal => {
  const refusal = requestRefusal(err)
  if (refusal) return refusal
  if (errorReason(err) === 'MCP_CLIENT_UNAVAILABLE') {
    return {
      title: "Couldn't check this app",
      description: "Pug couldn't load the app's details to confirm who it is. Try again in a moment.",
      retry: true,
    }
  }
  return { title: "Couldn't load this request", description: 'Something went wrong. Try again.', retry: true }
}

// What a failed Allow says under the form, which stays for another try. UNAUTHENTICATED and SSO_REQUIRED
// get the generic retry: the transport refreshes the session first and signs out if that is refused.
const approvalProblem = (err: unknown) => {
  switch (errorReason(err)) {
    case 'ORG_ROLE_FORBIDDEN':
      return "This account is read-only, so it can't connect apps."
    case 'MCP_NO_ORG':
      return "You aren't in any org anymore."
    case 'MCP_CLIENT_UNAVAILABLE':
      return "Pug couldn't load the app's details to confirm who it is. Try again."
  }
  return "Couldn't connect the app. Try again."
}

const LINK_BUTTON = 'font-medium text-link underline-offset-4 hover:underline disabled:opacity-50'

const byOrg = (projects: Project[]) => {
  const groups = new Map<string, { name: string; projects: Project[] }>()
  for (const project of projects) {
    const group = groups.get(project.orgId) ?? { name: project.orgDisplayName, projects: [] }
    group.projects.push(project)
    groups.set(project.orgId, group)
  }
  return [...groups.entries()]
}

const AccountLine = ({ disabled, onSwitch }: { disabled: boolean; onSwitch: () => void }) => {
  const email = useAtomValue(meAtom)?.email
  const meStatus = useAtomValue(meStatusAtom)
  const fetchMe = useSetAtom(fetchMeAtom)

  useEffect(() => {
    if (meStatus === 'idle') fetchMe()
  }, [meStatus, fetchMe])

  const switchAccount = (
    <button type="button" onClick={onSwitch} disabled={disabled} className={LINK_BUTTON}>
      Switch account
    </button>
  )
  if (email) {
    return (
      <p className="wrap-break-word">
        Signed in as <span className="font-medium text-foreground">{email}</span>. {switchAccount}
      </p>
    )
  }
  if (meStatus === 'error') {
    const retry = (
      <button type="button" onClick={() => fetchMe()} className={LINK_BUTTON}>
        Try again
      </button>
    )
    return (
      <p className="wrap-break-word">
        Couldn't load your email. {retry} <span aria-hidden>·</span> {switchAccount}
      </p>
    )
  }
  return <p className="wrap-break-word">Signed in. {switchAccount}</p>
}

const ConsentForm = ({
  consent,
  query,
  onLeave,
  onRefused,
}: {
  consent: DescribeAuthorizationResponse
  query: AuthorizationQuery
  onLeave: (url: URL) => void
  onRefused: (refusal: Refusal) => void
}) => {
  const mcpGrantsRPC = useAtomValue(mcpGrantsRPCAtom)
  const signOut = useSetAtom(signOutAtom)
  const [pending, setPending] = useState<'allow' | 'switch' | null>(null)
  const [problem, setProblem] = useState('')
  const [noOrg, setNoOrg] = useState(false)

  const cancelUrl = followable(consent.cancelUri)
  const nothingToRead = noOrg || consent.projects.length === 0

  const allow = async () => {
    setPending('allow')
    setProblem('')
    try {
      const { redirectUri } = await mcpGrantsRPC.approveAuthorization({ request: query })
      const url = followable(redirectUri)
      if (url) {
        onLeave(url)
        return
      }
      console.error('ApproveAuthorization returned a redirect that is not safe to follow', redirectUri)
      onRefused({ title: "Can't return to the app", description: "The address to go back to isn't one Pug opens." })
    } catch (err) {
      console.error('ApproveAuthorization failed', err)
      const refusal = requestRefusal(err)
      if (refusal) {
        onRefused(refusal)
        return
      }
      if (errorReason(err) === 'MCP_NO_ORG') setNoOrg(true)
      setProblem(approvalProblem(err))
    } finally {
      setPending(null)
    }
  }

  const switchAccount = async () => {
    setPending('switch')
    await signOut()
  }

  return (
    <>
      <h1 className="text-center text-2xl tracking-tight text-balance wrap-break-word">
        {consent.clientHost} wants to read your data and edit dashboards in Pug
      </h1>
      {consent.clientName && (
        <p className="mt-2 text-center text-xs text-muted-foreground wrap-break-word">
          It calls itself “{consent.clientName}”.
        </p>
      )}

      {nothingToRead ? (
        <p className="mt-6 text-center text-sm text-muted-foreground">
          You have no projects in Pug, so there is nothing to connect.
        </p>
      ) : (
        <div className="mt-6 space-y-2">
          <p className="text-sm font-medium">It can read every project in your orgs</p>
          <ul className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border px-3 py-2 text-sm">
            {byOrg(consent.projects).map(([orgId, group]) => (
              <li key={orgId} className="wrap-break-word">
                <div className="font-medium">{group.name}</div>
                <div className="text-muted-foreground">
                  {group.projects.map(project => project.displayName).join(', ')}
                </div>
              </li>
            ))}
          </ul>
          <p className="text-sm text-muted-foreground">
            It can run insights, browse events and look up user profiles in these projects, and in projects added to
            your orgs later. Where your role allows, it can also create dashboards in them and edit existing ones,
            including removing tiles. It can't delete or share a dashboard, or change anything else.
          </p>
        </div>
      )}

      {consent.loopbackRedirect && (
        <p className="mt-4 flex gap-2 rounded-lg border border-warning/25 bg-warning/10 px-3 py-2 text-sm text-caution">
          <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
          This app runs on your computer. Allow it only if you just started connecting it yourself.
        </p>
      )}

      <div className="mt-6 space-y-1 text-center text-xs text-muted-foreground">
        <AccountLine disabled={pending !== null} onSwitch={switchAccount} />
        <p className="wrap-break-word">After this you go back to {consent.redirectHost}.</p>
      </div>

      {problem && <p className="mt-4 rounded-md bg-destructive/5 px-3 py-2 text-sm text-negative">{problem}</p>}

      <div className="mt-6 grid grid-cols-2 gap-2">
        <Button
          variant="outline"
          className="h-10"
          disabled={!cancelUrl || pending !== null}
          onClick={() => cancelUrl && onLeave(cancelUrl)}
        >
          Cancel
        </Button>
        <Button className="h-10" disabled={nothingToRead || pending !== null} onClick={allow}>
          {pending === 'allow' && <Loader2 className="animate-spin" />}
          Allow
        </Button>
      </div>
    </>
  )
}

type View =
  | { kind: 'loading' }
  | { kind: 'consent'; consent: DescribeAuthorizationResponse; query: AuthorizationQuery }
  | { kind: 'refused'; refusal: Refusal }
  | { kind: 'leaving'; host: string }

const FRAMED_REFUSAL: Refusal = {
  title: 'Open this in its own tab',
  description: "Pug doesn't show this page inside another site, so no site can trick you into approving.",
}

const OAuthAuthorize = () => {
  const search = useSearch()
  const query = useMemo(() => queryFrom(search), [search])
  const mcpGrantsRPC = useAtomValue(mcpGrantsRPCAtom)
  // Backs up the frame headers, which a self-hosted deployment's web server may not send.
  const [view, setView] = useState<View>(() =>
    window.self === window.top ? { kind: 'loading' } : { kind: 'refused', refusal: FRAMED_REFUSAL },
  )

  useEffect(() => {
    if (view.kind !== 'loading') return
    let cancelled = false
    mcpGrantsRPC.describeAuthorization({ request: query }).then(
      consent => {
        if (!cancelled) setView({ kind: 'consent', consent, query })
      },
      err => {
        if (cancelled) return
        console.error('DescribeAuthorization failed', err)
        setView({ kind: 'refused', refusal: loadRefusal(err) })
      },
    )
    return () => {
      cancelled = true
    }
  }, [view.kind, mcpGrantsRPC, query])

  // Replaced, so Back from the app doesn't return to the form for a request already answered.
  const leave = (url: URL) => {
    setView({ kind: 'leaving', host: url.host })
    window.location.replace(url.href)
  }

  const content = () => {
    switch (view.kind) {
      case 'loading':
        return <AuthPending label="Checking the app's request…" />
      case 'leaving':
        return <AuthPending label={`Returning you to ${view.host}…`} />
      // The query it described, not the address's, so Allow approves what was shown.
      case 'consent':
        return (
          <ConsentForm
            consent={view.consent}
            query={view.query}
            onLeave={leave}
            onRefused={refusal => setView({ kind: 'refused', refusal })}
          />
        )
      case 'refused': {
        const { title, description, back, retry } = view.refusal
        return (
          <AuthStatus icon={AlertCircle} tone="negative" title={title} description={description}>
            {retry && (
              <Button variant="outline" className="mt-6 h-10" onClick={() => setView({ kind: 'loading' })}>
                Try again
              </Button>
            )}
            {back && (
              <Button variant="outline" className="mt-6 h-10" onClick={() => leave(back)}>
                Back to {back.host}
              </Button>
            )}
          </AuthStatus>
        )
      }
    }
  }

  // The page names the person, their orgs and projects, and this canvas is outside <main>'s capture marker.
  return <div data-pug-no-capture>{content()}</div>
}

export default OAuthAuthorize
