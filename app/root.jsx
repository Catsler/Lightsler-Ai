import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useLoaderData,
} from "@remix-run/react";
import { json } from "@remix-run/node";
import { useEffect } from 'react';
import { disableServiceWorkerInDev } from "./utils/use-disable-sw-in-dev";
import "./styles/theme-translation.css";
import "./styles/chat-widget.css";
import { i18nServer, resolveLocale } from "./i18n.server";
import { localeCookie } from "./cookies.server";

export const loader = async ({ request }) => {
  const locale = await resolveLocale(request);
  await i18nServer.getLocale(request);
  const namespaces = ["common"];

  return json(
    { locale, namespaces },
    {
      headers: {
        "Set-Cookie": await localeCookie.serialize(locale),
      },
    }
  );
};

export default function App() {
  const { locale } = useLoaderData();
  useEffect(() => {
    disableServiceWorkerInDev();
  }, []);
  return (
    <html lang={locale}>
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width,initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com" crossOrigin="anonymous" />
        {process.env.NODE_ENV === 'production' && (
          <link
            rel="prefetch"
            href="https://monorail-edge.shopifysvc.com"
            crossOrigin="anonymous"
          />
        )}
        <link rel="preconnect" href="https://admin.shopify.com" />
        <link rel="dns-prefetch" href="https://cdn.shopify.com" />
        <link rel="dns-prefetch" href="https://admin.shopify.com" />
        <link
          rel="preload"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
          as="style"
          onLoad="this.onload=null;this.rel='stylesheet'"
        />
        <noscript>
          <link
            rel="stylesheet"
            href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
          />
        </noscript>
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}
