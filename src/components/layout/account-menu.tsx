import { useAtomValue, useSetAtom } from 'jotai'
import { ChevronsUpDown, LogOut } from 'lucide-react'
import { useEffect } from 'react'
import { fetchMeAtom, meAtom, meStatusAtom, signOutAtom } from '@/auth/auth.atoms'
import { isDemoHost, isDemoSessionAtom } from '@/auth/demo'
import { NameChip } from '@/components/name-chip'
import { SOCIAL_LINKS } from '@/components/social-links'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { SidebarMenu, SidebarMenuButton, SidebarMenuItem } from '@/components/ui/sidebar'

export const AccountMenu = () => {
  const email = useAtomValue(meAtom)?.email
  const meStatus = useAtomValue(meStatusAtom)
  const fetchMe = useSetAtom(fetchMeAtom)
  const signOut = useSetAtom(signOutAtom)
  const isDemo = useAtomValue(isDemoSessionAtom)

  useEffect(() => {
    if (meStatus === 'idle') fetchMe()
  }, [meStatus, fetchMe])

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        {/* A failed fetch never returns to idle, so opening the menu is its retry. */}
        <DropdownMenu
          onOpenChange={open => {
            if (open && meStatus === 'error') fetchMe()
          }}
        >
          {/* Outside <main>, so autocapture would otherwise send the address as the click's text. */}
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton size="lg" tooltip="Account" aria-label={email ? `Account, ${email}` : 'Account'} />
            }
            data-pug-no-capture
          >
            <NameChip name={email} fallback="A" className="size-8 rounded-full text-sm" />
            <span className="min-w-0 flex-1 truncate text-left group-data-[collapsible=icon]:hidden">
              {email ?? 'Account'}
            </span>
            <ChevronsUpDown className="ml-auto size-3.5 text-muted-foreground group-data-[collapsible=icon]:hidden" />
          </DropdownMenuTrigger>
          <DropdownMenuContent side="top" sideOffset={6} className="min-w-56 p-1.5" data-pug-no-capture>
            {SOCIAL_LINKS.map(({ label, href, Icon }) => (
              <DropdownMenuItem key={label} render={<a href={href} target="_blank" rel="noreferrer" />}>
                <Icon />
                {label}
              </DropdownMenuItem>
            ))}
            {/* Signing the demo viewer out on its own origin would only start the demo again. */}
            {!(isDemoHost() && isDemo) && (
              <>
                <DropdownMenuSeparator />
                {/* Dropping the /p/:projectId URL is App's job, not this item's: it has to happen for a
                    session that expires too, which has no button to hang off. See App.tsx. */}
                <DropdownMenuItem onClick={() => signOut()}>
                  <LogOut />
                  Sign out
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}
