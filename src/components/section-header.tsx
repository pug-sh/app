const SectionHeader = ({
  title,
  count,
  description,
}: {
  title: string
  count?: string | number
  description?: string
}) => (
  <div className={description ? 'mb-4' : 'mb-2'}>
    <div className='flex items-center gap-2 mb-1'>
      <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>{title}</span>
      <div className='flex-1 h-px bg-border' />
      {count !== undefined && <span className='text-[10px] text-muted-foreground'>{count}</span>}
    </div>
    {description && <p className='text-xs text-muted-foreground'>{description}</p>}
  </div>
)

export default SectionHeader
