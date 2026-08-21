// OneSignal Web Push wiring. The SDK is loaded from the CDN in __root.tsx;
// here we tie the browser's push subscription to the signed-in Echo user.

interface OneSignalApi {
  init: (config: Record<string, unknown>) => Promise<void>;
  login: (externalId: string) => Promise<void>;
  logout: () => Promise<void>;
  Notifications: {
    permission: boolean;
    permissionNative?: NotificationPermission;
    requestPermission: () => Promise<void>;
  };
  User: {
    PushSubscription: {
      id?: string | null;
      optedIn?: boolean;
      optIn: () => Promise<void>;
    };
  };
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

/**
 * Links this browser's push subscription to the signed-in user and makes sure
 * the subscription actually exists — without opt-in there is no external_id
 * for the server to target, which is why pushes silently went nowhere.
 */
export function linkPushUser(userId: string) {
  if (linkedUser === userId) return;
  linkedUser = userId;
  push(async (OneSignal) => {
    try {
      await OneSignal.login(userId);
      if (OneSignal.User.PushSubscription.optedIn !== true) {
        // Only opts in when the browser already granted permission; otherwise
        // the user opts in from the OneSignal bell / a later gesture.
        if (OneSignal.Notifications.permission) {
          await OneSignal.User.PushSubscription.optIn();
        }
      }
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

/** Explicit user gesture: ask for notification permission, then subscribe. */
export async function requestPushPermission(): Promise<void> {
  return new Promise((resolve) => {
    push(async (OneSignal) => {
      try {
        if (!OneSignal.Notifications.permission) {
          await OneSignal.Notifications.requestPermission();
        }
        if (OneSignal.Notifications.permission) {
          await OneSignal.User.PushSubscription.optIn();
          if (linkedUser) await OneSignal.login(linkedUser);
        }
      } catch (error) {
        console.warn("[push] permission request failed", error);
      }
      resolve();
    });
  });
}
