import type { ReactNode } from 'react'

const Page = ({
  title,
  description,
  actions,
  header,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  header?: ReactNode
  children: ReactNode
}) => {
  return (
    <div className="flex-1 py-8 px-page-gutter">
      {header ? (
        <div className="mb-8">{header}</div>
      ) : (
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-2xl tracking-tight">{title}</h1>
            {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </div>
  )
}

export default Page
