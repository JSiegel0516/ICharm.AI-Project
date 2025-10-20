import { headers } from 'next/headers';
import { auth } from '@/lib/auth';
export const userProfile = async () => {
  const userSession = await auth.api.getSession({
    headers: await headers(),
  });
  return userSession;
};