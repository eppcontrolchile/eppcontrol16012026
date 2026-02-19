// app/api/stock/traspaso/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function isUuid(v: unknown) {
  const s = String(v ?? "").trim();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
}

function decodeBase64UrlJson(v: string): any | null {
  try {
    const json = Buffer.from(String(v || ""), "base64url").toString("utf8");
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function getImpersonatedEmpresaId(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  const compat = cookieStore.get("impersonate_empresa_id")?.value;
  if (compat && isUuid(compat)) return compat;

  const packed = cookieStore.get("epp_impersonate")?.value;
  if (packed) {
    const obj = decodeBase64UrlJson(packed);
    const eid = obj?.empresa_id;
    if (eid && isUuid(eid)) return String(eid);
  }
  return null;
}

export async function POST(req: Request) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json({ ok: false, reason: "Missing SUPABASE URL/ANON" }, { status: 500 });
  }
  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json({ ok: false, reason: "Missing SUPABASE_SERVICE_ROLE_KEY" }, { status: 500 });
  }

  const cookieStore = await cookies();

  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {}
        },
      },
    }
  );

  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  try {
    const { data: au, error: auErr } = await supabaseAuth.auth.getUser();
    if (auErr || !au?.user) {
      return NextResponse.json({ ok: false, reason: "No autenticado" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const {
      from_centro_id, // uuid | null
      to_centro_id,   // uuid | null
      categoria,
      nombre_epp,
      talla,
      cantidad,
      motivo,
      referencia,
    } = body ?? {};

    const qty = Number(cantidad);
    if (!Number.isInteger(qty) || qty <= 0) {
      return NextResponse.json({ ok: false, reason: "cantidad inválida" }, { status: 400 });
    }

    const fromCentro = from_centro_id == null || from_centro_id === "" ? null : String(from_centro_id);
    const toCentro = to_centro_id == null || to_centro_id === "" ? null : String(to_centro_id);

    if (fromCentro && !isUuid(fromCentro)) return NextResponse.json({ ok: false, reason: "from_centro_id inválido" }, { status: 400 });
    if (toCentro && !isUuid(toCentro)) return NextResponse.json({ ok: false, reason: "to_centro_id inválido" }, { status: 400 });
    if ((fromCentro ?? null) === (toCentro ?? null)) {
      return NextResponse.json({ ok: false, reason: "Origen y destino no pueden ser iguales" }, { status: 400 });
    }

    const cat = String(categoria ?? "").trim();
    const nom = String(nombre_epp ?? "").trim();
    const tal = talla == null ? null : String(talla).trim();
    if (!cat || !nom) return NextResponse.json({ ok: false, reason: "Falta categoria/nombre_epp" }, { status: 400 });

    // Resolver usuario interno (auth_user_id → usuarios)
    const { data: me, error: meErr } = await supabaseAuth
      .from("usuarios")
      .select("id, empresa_id, rol, activo")
      .eq("auth_user_id", au.user.id)
      .maybeSingle();

    if (meErr || !me?.id) return NextResponse.json({ ok: false, reason: "Usuario interno no resolvible" }, { status: 403 });
    if (me.activo === false) return NextResponse.json({ ok: false, reason: "Usuario inactivo" }, { status: 403 });

    const myRole = String(me.rol ?? "").trim().toLowerCase();

    // Permisos: ajustable, pero para traspasos de stock normalmente:
    const canTransfer =
      myRole === "admin" ||
      myRole === "jefe_area" ||
      myRole === "bodega" ||
      myRole === "superadmin";

    if (!canTransfer) {
      return NextResponse.json({ ok: false, reason: "Sin permisos para traspasar stock" }, { status: 403 });
    }

    // Empresa efectiva (soporte)
    const impersonEmpresa = getImpersonatedEmpresaId(cookieStore);
    const empresaId = (myRole === "superadmin" && impersonEmpresa) ? impersonEmpresa : String(me.empresa_id);

    // Ejecutar RPC transaccional
    const { data, error } = await supabaseAdmin.rpc("transfer_stock_fifo", {
      p_empresa_id: empresaId,
      p_usuario_id: String(me.id),
      p_auth_user_id: String(au.user.id),
      p_from_centro_id: fromCentro,
      p_to_centro_id: toCentro,
      p_categoria: cat,
      p_nombre_epp: nom,
      p_talla: tal,
      p_cantidad: qty,
      p_motivo: motivo ? String(motivo) : null,
      p_referencia: referencia ? String(referencia) : null,
    });

    if (error) throw new Error(error.message);

    return NextResponse.json({ ok: true, result: data }, { status: 200 });
  } catch (e: any) {
    console.error("TRASPASO STOCK ERROR", e);
    return NextResponse.json({ ok: false, reason: e?.message ?? "Error traspasando stock" }, { status: 500 });
  }
}
