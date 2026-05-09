import type { LucideIcon } from 'lucide-react'
import Page from '@/components/layout/page'

const NoProject = ({ title, icon: Icon }: { title: string; icon: LucideIcon }) => (
  <Page title={title}>
    <div className="flex flex-col items-center justify-center py-24 text-muted-foreground">
      <Icon className="w-8 h-8 mb-3 opacity-20" />
      <p className="text-sm">Select a project first</p>
    </div>
  </Page>
)

export default NoProject
