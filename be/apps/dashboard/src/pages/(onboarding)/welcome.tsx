import { useLoaderData } from 'react-router'

import { fetchSession } from '~/modules/auth/api/session'
import { RegistrationWizard } from '~/modules/auth/components/RegistrationWizard'
import { RegistrationBlockedNotice } from '~/modules/welcome/components/RegistrationBlockedNotice'

type WelcomeLoaderData = {
  isTenantRegistered: boolean
  tenantSlug: string | null
}

export function Component() {
  const { isTenantRegistered, tenantSlug } = useLoaderData<WelcomeLoaderData>()

  if (isTenantRegistered) {
    return <RegistrationBlockedNotice tenantSlug={tenantSlug} />
  }

  return <RegistrationWizard />
}

// React Router requires route loaders to be exported from the route module.
// eslint-disable-next-line react-refresh/only-export-components
export async function loader() {
  try {
    const session = await fetchSession()
    if (session?.requestedWorkspace && !session.requestedWorkspace.isPlaceholder) {
      return {
        isTenantRegistered: true,
        tenantSlug: session.requestedWorkspace.slug ?? null,
      }
    }
  }
  catch {
    // Ignore session fetch failures and allow onboarding flow to continue; page logic handles unauthenticated cases.
  }

  return {
    isTenantRegistered: false,
    tenantSlug: null,
  }
}
