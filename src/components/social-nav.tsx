import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

// Reddit + Discord outline marks, hand-inlined to match the pug-site nav (Hugeicons
// outline logos in the Lucide 24×24 stroke-1.5 style). Lucide ships no brand marks, so
// these live here rather than coming from lucide-react.
const RedditIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15 17C14.1556 17.6293 13.1196 18 12 18C10.8804 18 9.84437 17.6293 8.99998 17" />
    <path d="M18.5 4.5C18.5 5.32843 17.8284 6 17 6C16.1716 6 15.5 5.32843 15.5 4.5C15.5 3.67157 16.1716 3 17 3C17.8284 3 18.5 3.67157 18.5 4.5Z" />
    <path d="M15.5 4.5C14.3333 4.66667 12 5.8 12 9" />
    <path d="M12 21C16.4183 21 20 18.3137 20 15C20 14.6482 19.9573 14.304 19.8799 13.9688C21.0801 13.7856 22 12.7514 22 11.5C22 10.1193 20.8807 9 19.5 9C18.4903 9 17.6221 9.59932 17.2275 10.4609C15.8253 9.55191 13.9989 9 12 9C10.0007 9 8.17381 9.55164 6.77147 10.4609C6.37678 9.59952 5.50951 9 4.49998 9C3.11927 9 1.99998 10.1193 1.99998 11.5C1.99998 12.7511 2.91935 13.7852 4.11913 13.9688C4.04169 14.3039 3.99998 14.6483 3.99998 15C3.99998 18.3137 7.58171 21 12 21Z" />
    <path d="M15.25 13H15M15.5 13C15.5 13.2761 15.2761 13.5 15 13.5C14.7238 13.5 14.5 13.2761 14.5 13C14.5 12.7239 14.7238 12.5 15 12.5C15.2761 12.5 15.5 12.7239 15.5 13Z" />
    <path d="M9.74998 13H9.49998M9.99998 13C9.99998 13.2761 9.77612 13.5 9.49998 13.5C9.22384 13.5 8.99998 13.2761 8.99998 13C8.99998 12.7239 9.22384 12.5 9.49998 12.5C9.77612 12.5 9.99998 12.7239 9.99998 13Z" />
  </svg>
)

const DiscordIcon = () => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={1.5}
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M15.5 17.5C16.5 19 17.3333 19.6667 18 20C19.3333 19.6667 22 18.2 22 15C22 11.8 20.6667 7.33333 20 5.5C18 4.3 15.8333 4 15 4L14.198 5.60393C13.4135 5.28708 12.4058 5.25438 12 5.27763C11.5942 5.25438 10.5865 5.28708 9.80197 5.60393L9 4C8.16667 4 6 4.3 4 5.5C3.33333 7.33333 2 11.8 2 15C2 18.2 4.66667 19.6667 6 20C6.66667 19.6667 7.5 19 8.5 17.5" />
    <path d="M17.3652 11.5C17.3652 12.6046 16.5817 13.5 15.6152 13.5C14.6487 13.5 13.8652 12.6046 13.8652 11.5C13.8652 10.3954 14.6487 9.5 15.6152 9.5C16.5817 9.5 17.3652 10.3954 17.3652 11.5Z" />
    <path d="M10 11.5C10 12.6046 9.2165 13.5 8.25 13.5C7.2835 13.5 6.5 12.6046 6.5 11.5C6.5 10.3954 7.2835 9.5 8.25 9.5C9.2165 9.5 10 10.3954 10 11.5Z" />
    <path d="M17.5 16.5C16.4022 17.3967 14.3502 18 12 18C9.64981 18 7.59785 17.3967 6.5 16.5" />
  </svg>
)

const links = [
  { label: 'Reddit', href: 'https://www.reddit.com/r/pug_sh/', Icon: RedditIcon },
  { label: 'Discord', href: 'https://discord.gg/kDNHDWcBHP', Icon: DiscordIcon },
]

export const SocialNav = ({ className }: { className?: string }) => (
  <nav className={cn('flex items-center gap-0.5', className)}>
    {links.map(({ label, href, Icon }) => (
      <Button
        key={label}
        variant="ghost"
        size="icon-sm"
        className="text-muted-foreground"
        // These render as <a>, not <button>: Base UI defaults nativeButton to true and would
        // otherwise claim native button semantics the anchor doesn't have.
        nativeButton={false}
        render={<a href={href} target="_blank" rel="noreferrer" aria-label={`Pug on ${label}`} title={label} />}
      >
        <Icon />
      </Button>
    ))}
  </nav>
)
