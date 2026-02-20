// app/api/user/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    return NextResponse.json({ error: "Missing env" }, { status: 500 });
  }

  const cookieStore = await cookies();

  const supabaseAuth = createServerClient(supabaseUrl, anonKey, {
    cookies: {
      getAll: () => cookieStore.getAll(),
      setAll: (cookiesToSet) => {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
        } catch {}
      },
    },
  });

  const { data: au } = await supabaseAuth.auth.getUser();
  if (!au?.user) return NextResponse.json({ error: "No auth" }, { status: 401 });

  const admin = createClient(supabaseUrl, serviceKey);
  const { data: me, error } = await admin
    .from("usuarios")
    .select("id, empresa_id, rol, centro_id, activo")
    .eq("auth_user_id", au.user.id)
    .maybeSingle();

  if (error || !me?.id) {
    return NextResponse.json({ error: "Usuario no resolvible" }, { status: 403 });
  }
  if (me.activo === false) {
    return NextResponse.json({ error: "Usuario inactivo" }, { status: 403 });
  }

  const res = NextResponse.json({
    id: me.id,
    empresa_id: me.empresa_id,
    rol: me.rol,
    centro_id: me.centro_id,
  });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
