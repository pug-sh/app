import { Loader2 } from 'lucide-react'

const LoadingSpinner = () => (
  <div className='flex items-center justify-center py-24'>
    <Loader2 className='w-5 h-5 animate-spin text-muted-foreground' />
  </div>
)

export default LoadingSpinner
