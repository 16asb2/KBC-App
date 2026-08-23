import { NavLink, Outlet } from 'react-router-dom'
import { InstallPrompt } from '@/components/InstallPrompt'
import { NavIcon } from '@/components/NavIcon'
import { useAuth } from '@/context/AuthContext'
import { useProfile } from '@/context/ProfileContext'
import { isPrivileged } from '@/domain/roles'
import { KBC } from '@/constants/theme'
import { NAV_ITEMS } from './nav'

function Header() {
  const { user, signOut } = useAuth()

  return (
    <header
      className="flex h-16 shrink-0 items-center justify-between px-4"
      style={{ backgroundColor: KBC.black }}
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <img src="/kbc-logo.png" alt="" className="size-10 rounded-lg" />
        <div className="min-w-0">
          <p className="truncate text-[17px] font-bold text-white">KBC App</p>
          <p className="truncate text-[11px] text-neutral-400">Kingston Boulder Cooperative</p>
        </div>
      </div>
      <button
        type="button"
        onClick={() => void signOut()}
        className="shrink-0 rounded-lg border px-3 py-1.5 text-[13px] font-semibold"
        style={{ borderColor: KBC.pink, color: KBC.pink }}
        title={user?.email ?? undefined}
      >
        Sign Out
      </button>
    </header>
  )
}

function NavItems({ orientation }: { orientation: 'row' | 'col' }) {
  const { user } = useAuth()
  const { profile } = useProfile()
  const privileged = isPrivileged(user?.email ?? null, profile)
  const items = NAV_ITEMS.filter((item) => !item.privilegedOnly || privileged)

  return (
    <>
      {items.map((item) => (
        <NavLink
          key={item.path}
          to={item.path}
          className={({ isActive }) =>
            [
              'flex items-center gap-3 rounded-lg font-semibold transition-colors',
              orientation === 'row'
                ? 'flex-1 flex-col justify-center gap-1 py-1.5 text-[11px]'
                : 'px-3 py-2 text-sm',
              isActive ? 'text-current' : 'text-neutral-500',
            ].join(' ')
          }
          style={({ isActive }) => (isActive ? { color: item.color } : undefined)}
        >
          <NavIcon name={item.icon} size={orientation === 'row' ? 22 : 20} />
          <span className={orientation === 'row' ? 'leading-none' : ''}>{item.label}</span>
        </NavLink>
      ))}
    </>
  )
}

export function AppShell() {
  return (
    // h-svh (an exact height), not min-h-svh. With a min-height the shell grows
    // past the viewport on long pages, which meant <main>'s overflow-y-auto never
    // became a scroll region and the mobile tab bar sat at the bottom of the
    // *document* instead of the screen — you had to scroll a long list to its end
    // just to reach the tabs. Pinning the shell to the viewport makes <main> the
    // only scroller. svh (not vh/dvh) is deliberate: it's the *small* viewport
    // height, so nothing hides behind mobile browser chrome as it expands.
    <div className="flex h-svh flex-col overflow-hidden" style={{ backgroundColor: KBC.black }}>
      <Header />
      <InstallPrompt />
      <div className="flex min-h-0 flex-1">
        <nav
          className="hidden w-52 shrink-0 flex-col gap-1 border-r border-neutral-800 p-3 md:flex"
          style={{ backgroundColor: KBC.black }}
        >
          <NavItems orientation="col" />
        </nav>
        <main className="min-h-0 flex-1 overflow-y-auto bg-white">
          <Outlet />
        </main>
      </div>
      <nav
        className="flex shrink-0 border-t border-neutral-800 px-1 pb-[env(safe-area-inset-bottom)] md:hidden"
        style={{ backgroundColor: KBC.black }}
      >
        <NavItems orientation="row" />
      </nav>
    </div>
  )
}
