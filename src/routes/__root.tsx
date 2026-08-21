import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { Toaster } from "@/components/ui/sonner";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { SessionProvider } from "@/lib/session";
import { CallProvider } from "@/lib/calls";
import { CallLayer } from "@/components/echo/call-overlay";
import { ONESIGNAL_APP_ID, ONESIGNAL_SW_PATH, ONESIGNAL_SW_SCOPE } from "@/config/onesignal";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: "Echo | Connect. Communicate. Together." },
      {
        name: "description",
        content:
          "Echo brings messaging, voice and video calls, groups, media sharing, AI-powered tools, and more together in one modern communication platform. | Made by More4u Productions",
      },
      { name: "application-name", content: "Echo" },
      { name: "apple-mobile-web-app-title", content: "Echo" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "theme-color", content: "#2bc6c0" },
      { property: "og:site_name", content: "Echo" },
      { property: "og:title", content: "Echo | Connect. Communicate. Together." },
      {
        property: "og:description",
        content:
          "Echo brings messaging, voice and video calls, groups, media sharing, AI-powered tools, and more together in one modern communication platform. | Made by More4u Productions",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@Lovable" },
      { name: "twitter:title", content: "Echo | Connect. Communicate. Together." },
      {
        name: "twitter:description",
        content:
          "Echo brings messaging, voice and video calls, groups, media sharing, AI-powered tools, and more together in one modern communication platform. | Made by More4u Productions",
      },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/420853d1-8a05-4305-9f95-2e0f88e21a35/id-preview-a1d5de3d--adcadf4a-6abf-4d24-b20b-1b66a10805c4.lovable.app-1785702836767.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/420853d1-8a05-4305-9f95-2e0f88e21a35/id-preview-a1d5de3d--adcadf4a-6abf-4d24-b20b-1b66a10805c4.lovable.app-1785702836767.png" },
    ],
    scripts: [
      { src: "https://cdn.onesignal.com/sdks/web/v16/OneSignalSDK.page.js", defer: true },
      {
        children: `window.OneSignalDeferred = window.OneSignalDeferred || [];
window.OneSignalDeferred.push(async function(OneSignal) {
  await OneSignal.init({
    appId: "${ONESIGNAL_APP_ID}",
    serviceWorkerPath: "${ONESIGNAL_SW_PATH}",
    serviceWorkerParam: { scope: "${ONESIGNAL_SW_SCOPE}" },
    notifyButton: { enable: true },
    promptOptions: {
      slidedown: {
        prompts: [{ type: "push", autoPrompt: true, delay: { pageViews: 1, timeDelay: 8 } }]
      }
    }
  });
});`,
      },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", href: "/favicon.png" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap",
      },
    ],

  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      <SessionProvider>
        <CallProvider>
          {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
          <Outlet />
          <CallLayer />
          <Toaster position="top-center" />
        </CallProvider>
      </SessionProvider>
    </QueryClientProvider>
  );
}
