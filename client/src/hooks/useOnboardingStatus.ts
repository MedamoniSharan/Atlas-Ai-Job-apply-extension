import { useQuery } from '@tanstack/react-query';
import { loadOnboardingStatus, ONBOARDING_QUERY_KEY } from '../lib/onboarding';
import { useAuthStore } from '../store/authStore';

/** Poll slowly only until the extension connects; then stop. */
export function useOnboardingStatus() {
  const accessToken = useAuthStore((s) => s.accessToken);

  return useQuery({
    queryKey: ONBOARDING_QUERY_KEY,
    queryFn: loadOnboardingStatus,
    enabled: Boolean(accessToken),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    refetchInterval: (q) =>
      q.state.data?.extensionConnected ? false : 20_000,
  });
}
