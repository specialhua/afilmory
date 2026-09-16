import { Navigate, useParams } from 'react-router'

import { SuperAdminUserDetail } from '~/modules/super-admin'

export function Component() {
  const { userId } = useParams<{ userId: string }>()
  return userId ? <SuperAdminUserDetail userId={userId} /> : <Navigate to="/superadmin/users" replace />
}
