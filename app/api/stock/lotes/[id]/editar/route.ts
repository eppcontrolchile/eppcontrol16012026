// app/api/stock/lotes/[id]/editar/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const loteId = String(id ?? "").trim();

    if (!loteId) {
      return NextResponse.json({ error: "ID inválido" }, { status: 400 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Body inválido" }, { status: 400 });
    }

    const nombre_epp = String(body.nombre_epp ?? "").trim();
    const categoria = String(body.categoria ?? "").trim();
    const marca =
      body.marca == null || String(body.marca).trim() === ""
        ? null
        : String(body.marca).trim();
    const modelo =
      body.modelo == null || String(body.modelo).trim() === ""
        ? null
        : String(body.modelo).trim();
    const talla =
      body.talla == null || String(body.talla).trim() === ""
        ? null
        : String(body.talla).trim();

    if (!nombre_epp) {
      return NextResponse.json(
        { error: "El nombre del EPP es obligatorio" },
        { status: 400 }
      );
    }

    if (!categoria) {
      return NextResponse.json(
        { error: "La categoría es obligatoria" },
        { status: 400 }
      );
    }

    const cookieStore = await cookies();

    const supabaseAuth = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll() {
            // no-op
          },
        },
      }
    );

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const {
      data: { user },
      error: authError,
    } = await supabaseAuth.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .select("id, empresa_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    if (usuarioError) {
      console.error("Usuario error:", usuarioError);
      return NextResponse.json({ error: usuarioError.message }, { status: 500 });
    }

    if (!usuario?.empresa_id) {
      return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
    }

    const { data: lote, error: loteError } = await supabaseAdmin
      .from("lotes_epp")
      .select("id, empresa_id, anulado")
      .eq("id", loteId)
      .maybeSingle();

    if (loteError) {
      console.error("Lote lookup error:", loteError);
      return NextResponse.json({ error: loteError.message }, { status: 500 });
    }

    if (!lote) {
      return NextResponse.json({ error: "Lote no encontrado" }, { status: 404 });
    }

    if (lote.empresa_id !== usuario.empresa_id) {
      return NextResponse.json({ error: "Sin permisos sobre este lote" }, { status: 403 });
    }

    if (lote.anulado) {
      return NextResponse.json(
        { error: "No se puede editar un ingreso anulado" },
        { status: 400 }
      );
    }

    const { error: updateError } = await supabaseAdmin
      .from("lotes_epp")
      .update({
        nombre_epp,
        categoria,
        marca,
        modelo,
        talla,
      })
      .eq("id", loteId)
      .eq("empresa_id", usuario.empresa_id);

    if (updateError) {
      console.error("Supabase update error:", updateError);
      return NextResponse.json(
        { error: updateError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("API error:", err);
    return NextResponse.json(
      { error: "Server error" },
      { status: 500 }
    );
  }
}
