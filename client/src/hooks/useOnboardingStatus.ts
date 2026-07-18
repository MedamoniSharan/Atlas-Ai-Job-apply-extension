import { useQuery, useQueryClient } from '@tanstack/react-query';
import { loadOnboardingStatus, ONBOARDING_QUERY_KEY } from '../lib/onboarding';
import { useAuthStore } from '../store/authStore';
import { useExtensionSocket } from './useExtensionSocket';

export function useOnboardingStatus() {
  const queryClient = useQueryClient();
  const accessToken = useAuthStore((s) => s.accessToken);

  useExtensionSocket(() => {
    queryClient.invalidateQueries({ queryKey: ONBOARDING_QUERY_KEY });
  });

  return useQuery({
    queryKey: ONBOARDING_QUERY_KEY,
    queryFn: loadOnboardingStatus,
    enabled: Boolean(accessToken),
    refetchInterval: (q) =>
      q.state.data?.extensionConnected ? false : 5000,
  });
}
