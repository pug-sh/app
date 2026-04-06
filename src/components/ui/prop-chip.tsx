export const PropChip = ({ k, v }: { k: string; v: string }) => (
  <span className='inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md'>
    <span className='text-muted-foreground'>{k}</span>
    <span className='font-mono'>{v}</span>
  </span>
)
