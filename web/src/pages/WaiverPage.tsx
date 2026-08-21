import { useParams } from 'react-router-dom'
import { PagePlaceholder } from './PagePlaceholder'

// Real waiver flow (see mobile/app/waiver/[type].tsx) lands with the
// "App entrance" workflow in a later migration phase.
export function WaiverPage() {
  const { type } = useParams<{ type: string }>()
  return (
    <div className="min-h-svh bg-white">
      <PagePlaceholder title={type === 'liability' ? 'Release of Liability' : 'Membership Waiver'} />
    </div>
  )
}
