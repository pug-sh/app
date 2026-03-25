import type { ReactNode } from 'react'

const Page = ({
  title,
  description,
  actions,
  children,
}: {
  title: string
  description?: string
  actions?: ReactNode
  children: ReactNode
}) => {
  return (
    <div className='flex-1 p-8'>
      <div className='flex items-start justify-between mb-8'>
        <div>
          <h1 className='text-2xl font-semibold tracking-tight'>{title}</h1>
          {description && <p className='text-sm text-muted-foreground mt-1'>{description}</p>}
        </div>
        {actions && <div className='flex items-center gap-2'>{actions}</div>}
      </div>
      {children}
    </div>
  )
}

export default Page
