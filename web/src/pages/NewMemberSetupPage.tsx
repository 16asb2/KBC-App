import { PagePlaceholder } from './PagePlaceholder'

// Real form (legal name, emergency contact, etc. — see mobile/app/new-member-setup.tsx)
// lands with the "App entrance" workflow in a later migration phase.
export function NewMemberSetupPage() {
  return (
    <div className="min-h-svh bg-white">
      <PagePlaceholder title="Welcome to KBC" />
    </div>
  )
}
