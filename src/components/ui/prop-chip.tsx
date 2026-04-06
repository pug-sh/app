export const PropChip = ({ label, value }: { label: string; value: string }) => (
  <span className='inline-flex items-center gap-1 text-xs bg-muted px-2 py-0.5 rounded-md'>
    <span className='text-muted-foreground'>{label}</span>
    <span className='font-mono'>{value}</span>
  </span>
)
