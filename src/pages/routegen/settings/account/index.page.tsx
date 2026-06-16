import { zodResolver } from '@hookform/resolvers/zod'
import { useAtomValue, useSetAtom } from 'jotai'
import { Eye, EyeOff, Loader2, Lock } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { customersRPCAtom } from '@/api/rpc'
import { fetchMeAtom, meAtom } from '@/auth/auth.atoms'
import SectionHeader from '@/components/section-header'
import { Button } from '@/components/ui/button'
import { Field, FieldError, FieldLabel } from '@/components/ui/field'
import { Input } from '@/components/ui/input'
import { toastRPCError } from '@/lib/rpc-error'

// max 72 mirrors the proto string.max_bytes (bcrypt's limit). The protovalidate
// interceptor is the byte-accurate safety net for multi-byte input.
const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(72, 'Password must be at most 72 characters'),
    confirm: z.string().min(1, 'Please confirm your password'),
  })
  .refine(data => data.password === data.confirm, {
    message: 'Passwords do not match',
    path: ['confirm'],
  })

type PasswordFormData = z.infer<typeof passwordSchema>

const Account = () => {
  const me = useAtomValue(meAtom)
  const fetchMe = useSetAtom(fetchMeAtom)
  const customersRPC = useAtomValue(customersRPCAtom)

  const [showPassword, setShowPassword] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const savedTimer = useRef<ReturnType<typeof setTimeout>>(undefined)

  // The Account tab is the first consumer of fetchMeAtom — load the current user's
  // email on mount. fetchMe (a Jotai setter) is stable, so this runs once; we don't
  // depend on `me` (that would make a mount-only fetch reactive to later meAtom
  // writes, e.g. sign-out).
  useEffect(() => {
    fetchMe()
  }, [fetchMe])

  // Clear the pending "saved" flash if the component unmounts first.
  useEffect(() => () => clearTimeout(savedTimer.current), [])

  const passwordForm = useForm<PasswordFormData>({
    resolver: zodResolver(passwordSchema),
    defaultValues: { password: '', confirm: '' },
  })

  const handleSetPassword = async (data: PasswordFormData) => {
    setSaving(true)
    try {
      await customersRPC.setPassword({ password: data.password })
      // Don't leave the plaintext password sitting in controlled inputs/state.
      passwordForm.reset({ password: '', confirm: '' })
      setSaved(true)
      clearTimeout(savedTimer.current)
      savedTimer.current = setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      toastRPCError(err, 'Failed to set password')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-8 max-w-2xl">
      <section>
        <SectionHeader title="Account" description="Your account email" />
        <p className="text-sm font-mono text-muted-foreground">{me?.email ?? '—'}</p>
      </section>

      <section>
        <SectionHeader title="Password" description="Set a password to sign in without a magic link" />
        <form onSubmit={passwordForm.handleSubmit(handleSetPassword)} className="space-y-3">
          <Field data-invalid={!!passwordForm.formState.errors.password}>
            <FieldLabel htmlFor="new-password">New password</FieldLabel>
            <div className="relative">
              <Input
                {...passwordForm.register('password')}
                id="new-password"
                type={showPassword ? 'text' : 'password'}
                className="pr-9"
                placeholder="••••••••"
                aria-invalid={!!passwordForm.formState.errors.password}
                autoComplete="new-password"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                aria-label={showPassword ? 'Hide password' : 'Show password'}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
            {passwordForm.formState.errors.password && <FieldError errors={[passwordForm.formState.errors.password]} />}
          </Field>

          <Field data-invalid={!!passwordForm.formState.errors.confirm}>
            <FieldLabel htmlFor="confirm-password">Confirm password</FieldLabel>
            <Input
              {...passwordForm.register('confirm')}
              id="confirm-password"
              type="password"
              placeholder="••••••••"
              aria-invalid={!!passwordForm.formState.errors.confirm}
              autoComplete="new-password"
            />
            {passwordForm.formState.errors.confirm && <FieldError errors={[passwordForm.formState.errors.confirm]} />}
          </Field>

          <div className="flex items-center gap-2">
            <Button type="submit" variant="outline" size="sm" disabled={saving || !passwordForm.formState.isDirty}>
              {saving ? <Loader2 className="animate-spin" /> : <Lock className="w-4 h-4" />}
              Set password
            </Button>
            {saved && <span className="text-xs text-green-600 animate-in fade-in">Password updated</span>}
          </div>
        </form>
      </section>
    </div>
  )
}

export default Account
