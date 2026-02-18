// app/api/admin/impersonate/clear/route.ts
// EPP Control — Admin Impersonate: clear support mode cookies

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ⚠️ Mantén esta lista alineada con los nombres reales que uses en el layout.
// Yo borro varias variantes para cubrir migraciones / nombres antiguos.
const COOKIE_NAMES = [
  // current
  "epp_impersonate",
  "impersonate_empresa_id",
  "impersonate_usuario_id",

  // legacy / migrations
  "impersonate_empresa",
  "impersonate_usuario",
  "impersonate",
  "support_empresa_id",
  "support_usuario_id",
  "support_empresa",
  "support_usuario",
];

export async function POST() {
  // Siempre limpia cookies (aunque el caller esté con sesión rara)
  const res = NextResponse.json({ ok: true }, { status: 200 });

  const isProd = process.env.NODE_ENV === "production";
  const COOKIE_DOMAIN = isProd ? ".eppcontrol.cl" : undefined;
  const deleteOptsBase = {
    path: "/",
    maxAge: 0,
    expires: new Date(0),
    sameSite: "lax" as const,
    secure: isProd,
  };

  // Expirar cookies en el navegador
  for (const name of COOKIE_NAMES) {
    res.cookies.set({
      name,
      value: "",
      ...deleteOptsBase,
      httpOnly: true,
    });

    // Also attempt a non-HttpOnly variant for any client-readable legacy cookies.
    res.cookies.set({
      name,
      value: "",
      ...deleteOptsBase,
      httpOnly: false,
    });

    // If cookies were set with a domain (e.g. ".eppcontrol.cl"), we must also expire them with the same domain.
    if (COOKIE_DOMAIN) {
      res.cookies.set({
        name,
        value: "",
        ...deleteOptsBase,
        httpOnly: true,
        domain: COOKIE_DOMAIN,
      });

      res.cookies.set({
        name,
        value: "",
        ...deleteOptsBase,
        httpOnly: false,
        domain: COOKIE_DOMAIN,
      });
    }
  }

  // Evita cualquier cache raro en PWA/edge
  res.headers.set("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0");
  res.headers.set("Pragma", "no-cache");

  return res;
}
