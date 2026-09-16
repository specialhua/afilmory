import { ScrollArea } from '@afilmory/ui'
import { clsxm } from '@afilmory/utils'
import { useTranslation } from 'react-i18next'
import { Navigate, NavLink, Outlet } from 'react-router'

import { useAuthUserValue, useIsSuperAdmin } from '~/atoms/auth'
import { SuperAdminUserMenu } from '~/components/common/SuperAdminUserMenu'

export function Component() {
  const { t } = useTranslation()
  const user = useAuthUserValue()
  const isSuperAdmin = useIsSuperAdmin()
  const navItems = [
    { to: '/superadmin/settings', labelKey: 'superadmin.nav.settings', end: true },
    { to: '/superadmin/plans', labelKey: 'superadmin.nav.plans', end: true },
    { to: '/superadmin/tenants', labelKey: 'superadmin.nav.tenants', end: true },
    { to: '/superadmin/users', labelKey: 'superadmin.nav.users', end: false },
    { to: '/superadmin/audit', labelKey: 'superadmin.nav.audit', end: true },
    {
      labelKey: 'superadmin.nav.builder',
      to: '/superadmin/builder',
      end: true,
    },
    { to: '/superadmin/debug', labelKey: 'superadmin.nav.builder-debug', end: false },
  ] as const

  if (user && !isSuperAdmin) {
    return <Navigate to="/" replace />
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="bg-background relative shrink-0 border-b border-fill-tertiary/50">
        <div className="flex h-14 items-center px-3 sm:px-6">
          {/* Logo/Brand */}
          <div className="text-text mr-2 sm:mr-8 text-sm sm:text-base font-semibold tracking-tight">
            {t('superadmin.brand')}
          </div>

          {/* Navigation Tabs */}
          <nav className="flex flex-1 items-center gap-0.5 sm:gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            {navItems.map(tab => (
              <NavLink key={tab.to} to={tab.to} end={tab.end}>
                {({ isActive }) => (
                  <div
                    className={clsxm(
                      'relative rounded-lg px-2 sm:px-4 py-1.5 sm:py-2 text-xs sm:text-sm font-medium transition-all duration-200 whitespace-nowrap',
                      'hover:bg-fill/30',
                      isActive ? 'bg-accent/10 text-accent' : 'text-text-secondary hover:text-text',
                    )}
                  >
                    {t(tab.labelKey)}
                  </div>
                )}
              </NavLink>
            ))}
          </nav>

          {/* Right side - User Menu */}
          {user && (
            <div className="border-fill-tertiary/50 ml-2 sm:ml-auto flex items-center gap-3 border-l pl-2 sm:pl-4">
              <SuperAdminUserMenu user={user} />
            </div>
          )}
        </div>
      </header>

      <main className="bg-background flex-1 overflow-hidden">
        <ScrollArea rootClassName="h-full" viewportClassName="h-full">
          <div className="mx-auto max-w-5xl px-6 py-6">
            <Outlet />
          </div>
        </ScrollArea>
      </main>
    </div>
  )
}
