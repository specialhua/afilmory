import { Button, Input, Label, LinearBorderContainer } from '@afilmory/ui'
import { CircleAlert } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'

import { useLogin } from '~/modules/auth/hooks/useLogin'
import { buildRootTenantUrl, getTenantSlugFromHost } from '~/modules/auth/utils/domain'

export function Component() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRedirecting, setIsRedirecting] = useState(false)
  const { login, isLoading, error, clearError } = useLogin()

  useEffect(() => {
    console.error('error', error)
  }, [error])

  const tenantSlug = useMemo(() => {
    return getTenantSlugFromHost(window.location.hostname)
  }, [])
  const rootLoginHref = useMemo(() => {
    try {
      return buildRootTenantUrl('/root-login')
    }
    catch {
      return '/root-login'
    }
  }, [])

  useEffect(() => {
    if (tenantSlug === 'root') {
      setIsRedirecting(false)
      return
    }

    const targetUrl = buildRootTenantUrl('/root-login')
    if (window.location.href === targetUrl) {
      return
    }

    setIsRedirecting(true)
    window.location.replace(targetUrl)
  }, [tenantSlug])

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!email.trim() || !password.trim()) {
      return
    }
    login({ email: email.trim(), password, requireRootDomain: true })
  }

  const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEmail(event.target.value)
    if (error) {
      clearError()
    }
  }

  const handlePasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setPassword(event.target.value)
    if (error) {
      clearError()
    }
  }

  if (tenantSlug !== 'root') {
    return (
      <div className="relative flex min-h-dvh flex-1 flex-col">
        <div className="bg-background flex flex-1 items-center justify-center">
          <LinearBorderContainer>
            <div className="bg-background-tertiary w-[600px] p-10">
              <div className="space-y-5">
                <h1 className="text-text text-2xl font-semibold">Redirecting to the root portal</h1>
                <p className="text-text-secondary text-sm">
                  The root administrator interface is only available on the dedicated
                  {' '}
                  <code>root.</code>
                  {' '}
                  subdomain.
                  We&apos;re sending you there now.
                </p>
                <div className="text-text-tertiary text-xs">
                  {isRedirecting ? 'Redirecting…' : 'If nothing happens, use the button below.'}
                </div>
                <Button
                  type="button"
                  size="md"
                  variant="primary"
                  className="w-full"
                  onClick={() => {
                    window.location.href = rootLoginHref
                  }}
                >
                  Go to root portal
                </Button>
              </div>
            </div>
          </LinearBorderContainer>
        </div>
      </div>
    )
  }

  return (
    <div className="relative flex min-h-dvh flex-1 flex-col">
      <div className="bg-background flex flex-1 items-center justify-center">
        <LinearBorderContainer>
          <form onSubmit={handleSubmit} className="bg-background-tertiary relative w-[600px]">
            <div className="space-y-8 p-10">
              <header className="space-y-2">
                <h1 className="text-text text-3xl font-bold">Root Administrator Login</h1>
                <p className="text-text-secondary text-sm">
                  Use the credentials that were generated during the first deployment to manage global system settings
                  and infrastructure.
                </p>
              </header>

              {error && (
                <div className="border-red/60 bg-red/10 rounded-lg border px-4 py-3.5">
                  <div className="flex items-start gap-3">
                    <CircleAlert className="text-red mt-0.5 size-4" />
                    <p className="text-red flex-1 text-sm">{error}</p>
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="root@example.com"
                  value={email}
                  onChange={handleEmailChange}
                  disabled={isLoading}
                  error={!!error}
                  autoComplete="email"
                  autoFocus
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="Enter your password"
                  value={password}
                  onChange={handlePasswordChange}
                  disabled={isLoading}
                  error={!!error}
                  autoComplete="current-password"
                />
              </div>

              <Button
                type="submit"
                variant="primary"
                size="md"
                className="w-full"
                disabled={!email.trim() || !password.trim()}
                isLoading={isLoading}
                loadingText="Signing in..."
              >
                Sign In
              </Button>

              <p className="text-text-tertiary text-xs">
                Lost access to the root credentials? An operator with server access can re-run
                {' '}
                <code>pnpm --filter @afilmory/core dev:reset-superadmin-password</code>
                {' '}
                to rotate them.
              </p>

              <p className="text-text-tertiary text-xs">
                Tenant administrators should continue to use the regular
                {' '}
                <Link to="/login" className="text-accent underline-offset-4 hover:underline">
                  workspace login page
                </Link>
                .
              </p>
            </div>
          </form>
        </LinearBorderContainer>
      </div>
    </div>
  )
}
