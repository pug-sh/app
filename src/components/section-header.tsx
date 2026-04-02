const SectionHeader = ({ title, count }: { title: string; count?: string | number }) => (
  <div className='flex items-center gap-2 mb-2'>
    <span className='text-xs font-semibold text-muted-foreground uppercase tracking-wider'>{title}</span>
    <div className='flex-1 h-px bg-border' />
    {count !== undefined && <span className='text-[10px] text-muted-foreground'>{count}</span>}
  </div>
)

export default SectionHeader
