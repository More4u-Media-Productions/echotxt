// OneSignal Web Push wiring. The SDK is loaded from the CDN in __root.tsx;
// here we tie the subscription to the signed-in Echo user.

interface OneSignalApi {
  init: (config: Record<string, unknown>) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  User: { PushSubscription: { optedIn?: boolean; optIn: () => Promise<void> } };
}

declare global {
  interface Window {
    OneSignalDeferred?: ((os: OneSignalApi) => void | Promise<void>)[];
  }
}

function push(fn: (os: OneSignalApi) => void | Promise<void>) {
  if (typeof window === "undefined") return;
  window.OneSignalDeferred = window.OneSignalDeferred || [];
  window.OneSignalDeferred.push(fn);
}

let linkedUser: string | null = null;

/** Links the browser's push subscription to the signed-in user. */
export function linkPushUser(userId: string) {
  if (linkedUser === userId) return;
  linkedUser = userId;
  push(async (OneSignal) => {
    try {
      await OneSignal.login(userId);
    } catch (error) {
      console.warn("[push] could not link user", error);
    }
  });
}

export function unlinkPushUser() {
  if (!linkedUser) return;
  linkedUser = null;
  push(async (OneSignal) => {
    try {
      await OneSignal.logout();
    } catch {
      /* ignore */
    }
  });
}
