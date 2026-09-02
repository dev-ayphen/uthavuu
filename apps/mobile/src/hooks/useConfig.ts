import { useQuery } from '@tanstack/react-query';
import {
  CONFIG_QUERY_KEY,
  DEFAULT_PLATFORM_CONFIG,
  getPlatformConfig,
  type PlatformConfig,
} from '@uthavu/libs-mobile/api/config';

// The platform settings the admin console controls, read once per launch.
//
// Lives in apps/mobile rather than libs-mobile because @tanstack/react-query
// is a dependency of this app only — libs-mobile/package.json doesn't declare
// it, and pnpm links strictly, so a hook importing it from there wouldn't
// resolve. libs-mobile/api/config.ts holds the transport and the defaults; this
// is the React binding.
//
// Fails soft by construction: the return type is PlatformConfig, never
// `PlatformConfig | undefined`, so a caller physically cannot forget to handle
// the failure case. While the request is in flight, and forever after if it
// never succeeds, callers see DEFAULT_PLATFORM_CONFIG — the values the client
// hardcoded before /config existed. Nothing here can block a screen from
// rendering or the app from launching.
//
// Only mount this behind auth. /config is an authenticated endpoint, and
// apiRequest treats a 401 on an `auth: true` call as a dead session (clears the
// token, bounces to Login) — which is right for a real expiry, and wrong on a
// pre-login screen that never had a token. Every current call site is a screen
// you can only reach signed in.
export function useConfig(): PlatformConfig {
  const { data } = useQuery({
    queryKey: CONFIG_QUERY_KEY,
    queryFn: getPlatformConfig,
    // Near-static: an admin changing a switch is rare and never urgent enough
    // to justify refetching on every screen mount. Long window, kept in cache
    // for the whole session, and one retry — enough to survive a single flaky
    // request without stalling behind three backoffs on a dead API.
    staleTime: 15 * 60 * 1000,
    gcTime: Infinity,
    retry: 1,
  });

  return data ?? DEFAULT_PLATFORM_CONFIG;
}
