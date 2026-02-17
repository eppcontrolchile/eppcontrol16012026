//app/api/admin/impersonate/clear

import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const COOKIE_NAME = "epp_impersonate";

export async function POST() {
  const res = NextResponse.json({ ok: true }, { status: 200 });

  // borrar cookie
  res.cookies.set({
    name: COOKIE_NAME,
    value: "",
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });

  res.headers.set("Cache-Control", "no-store");
  return res;
}
