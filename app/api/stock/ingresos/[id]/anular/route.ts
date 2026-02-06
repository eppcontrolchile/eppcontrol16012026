//app/api/stock/ingresos/[id]/anular/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const cookieStore = await cookies();

  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: () => {},
      },
    }
  );

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const {
    data: { user },
  } = await supabaseAuth.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await req.json().catch(() => null);
  const motivo = body?.motivo;

  if (!motivo) {
    return NextResponse.json(
      { error: "Debe indicar motivo de anulación" },
      { status: 400 }
    );
  }

  const { data: usuario } = await supabaseAdmin
    .from("usuarios")
    .select("id, empresa_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!usuario?.empresa_id) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  const { data, error } = await supabaseAdmin
    .from("lotes_epp")
    .update({
      anulado: true,
      anulado_at: new Date().toISOString(),
      anulado_por: usuario.id,
      anulado_motivo: motivo,
    })
    .eq("id", id)
    .eq("empresa_id", usuario.empresa_id)
    .select()
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const res = NextResponse.json({ ok: true, lote: data });
  res.headers.set("Cache-Control", "no-store");
  return res;
}
