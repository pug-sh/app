import SectionHeader from '@/components/section-header'
import SettingsLayout from '../settings-layout'

const Email = () => {
  return (
    <SettingsLayout>
      <div className="space-y-8 max-w-2xl">
        <section>
          <SectionHeader title="Email Provider" description="Configure how this organization sends outbound email" />
          <p className="text-sm text-muted-foreground">Coming soon.</p>
        </section>
      </div>
    </SettingsLayout>
  )
}

export default Email
