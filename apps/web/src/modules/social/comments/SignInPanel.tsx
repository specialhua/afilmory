import { clsxm as cn } from '@afilmory/utils'
import { useQuery } from '@tanstack/react-query'
import { useTranslation } from 'react-i18next'

import { authApi } from '~/lib/api/auth'

export const SignInPanel = () => {
  const { t } = useTranslation()

  const { data: socialProviders } = useQuery({
    queryKey: ['socialProviders'],
    queryFn: authApi.getSocialProviders,
  })

  const handleSignIn = async (provider: string) => {
    try {
      const { url } = await authApi.signInSocial(provider)
      window.location.href = url
    } catch (error) {
      console.error('Sign in failed:', error)
    }
  }

  return (
    <div className="border-accent/10 flex items-center justify-between gap-3 border-t p-4">
      <span className="shrink-0 text-xs text-white/50">{t('comments.chooseProvider')}</span>
      <div className="flex items-center gap-2">
        {socialProviders?.providers.map((provider) => (
          <button
            type="button"
            key={provider.id}
            onClick={() => handleSignIn(provider.id)}
            className="bg-material-medium hover:bg-material-light flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-white transition"
            aria-label={t('comments.signInWith', { provider: provider.name })}
          >
            <LoginPlatfoIcon provider={provider.id} className="text-base" />
            <span className="sr-only">{provider.name}</span>
          </button>
        ))}
      </div>
    </div>
  )
}

const LoginPlatfoIcon = ({ provider, className }: { provider: string; className?: string }) => {
  switch (provider) {
    case 'apple': {
      return <i className={cn('i-simple-icons-apple', className)} />
    }
    case 'github': {
      return <i className={cn('i-simple-icons-github text-black dark:text-white', className)} />
    }
    case 'google': {
      return (
        <svg className={className} xmlns="http://www.w3.org/2000/svg" width="0.98em" height="1em" viewBox="0 0 256 262">
          <path
            fill="#4285F4"
            d="M255.878 133.451c0-10.734-.871-18.567-2.756-26.69H130.55v48.448h71.947c-1.45 12.04-9.283 30.172-26.69 42.356l-.244 1.622l38.755 30.023l2.685.268c24.659-22.774 38.875-56.282 38.875-96.027"
          />
          <path
            fill="#34A853"
            d="M130.55 261.1c35.248 0 64.839-11.605 86.453-31.622l-41.196-31.913c-11.024 7.688-25.82 13.055-45.257 13.055c-34.523 0-63.824-22.773-74.269-54.25l-1.531.13l-40.298 31.187l-.527 1.465C35.393 231.798 79.49 261.1 130.55 261.1"
          />
          <path
            fill="#FBBC05"
            d="M56.281 156.37c-2.756-8.123-4.351-16.827-4.351-25.82c0-8.994 1.595-17.697 4.206-25.82l-.073-1.73L15.26 71.312l-1.335.635C5.077 89.644 0 109.517 0 130.55s5.077 40.905 13.925 58.602z"
          />
          <path
            fill="#EB4335"
            d="M130.55 50.479c24.514 0 41.05 10.589 50.479 19.438l36.844-35.974C195.245 12.91 165.798 0 130.55 0C79.49 0 35.393 29.301 13.925 71.947l42.211 32.783c10.59-31.477 39.891-54.251 74.414-54.251"
          />
        </svg>
      )
    }
    default: {
      return null
    }
  }
}
