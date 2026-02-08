// app/api/stock/ingreso/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export async function POST(req: NextRequest) {
  const cookieStore = await cookies();

  // Clear env-var errors (production hardening)
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    return NextResponse.json(
      { error: "Missing public Supabase env vars" },
      { status: 500 }
    );
  }

  if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
    return NextResponse.json(
      { error: "Missing server env var SUPABASE_SERVICE_ROLE_KEY" },
      { status: 500 }
    );
  }

  // Auth client (reads session cookie)
  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {
            // ignore
          }
        },
      },
    }
  );

  // Admin client (bypasses RLS)
  const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  );

  // 1) Validate session
  const {
    data: { user },
    error: authError,
  } = await supabaseAuth.auth.getUser();

  if (authError || !user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  // 2) Parse body
  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  // 3) Resolve empresa_id from usuario
    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .select("id, empresa_id")
      .eq("auth_user_id", user.id)
      .maybeSingle();

  if (usuarioError) {
    return NextResponse.json({ error: usuarioError.message }, { status: 500 });
  }

  if (!usuario?.empresa_id) {
    return NextResponse.json({ error: "Empresa no encontrada" }, { status: 404 });
  }

  const empresaId = usuario.empresa_id;

  // 4) Normalize payload: accept either { items: [...] } or a single item object
  const items: any[] = Array.isArray(body.items)
    ? body.items
    : [
        {
          categoria: body.categoria,
          nombre_epp: body.nombre_epp ?? body.nombreEpp,
          talla: body.talla,
          cantidad: body.cantidad,
          costo_unitario_iva: body.costo_unitario_iva ?? body.costoUnitarioIVA,
          fecha_ingreso: body.fecha_ingreso,
        },
      ];

  if (!items.length) {
    return NextResponse.json({ error: "Payload incompleto" }, { status: 400 });
  }

  // 5) Validate + build rows
  let rows: any[];
  try {
    rows = items.map((it) => {
      const categoria = String(it?.categoria ?? "").trim();
      const nombre_epp = String(it?.nombre_epp ?? it?.nombreEpp ?? "").trim();

      // Normaliza talla: variantes de "No aplica" se guardan como NULL
      const tallaRaw = it?.talla ? String(it.talla).trim() : "";
      const talla =
        tallaRaw &&
        !["no aplica", "noaplica", "n/a", "na", "-"].includes(
          tallaRaw.toLowerCase()
        )
          ? tallaRaw
          : null;

      const cantidadNum = Number(it?.cantidad);
      const costoNum = Number(it?.costo_unitario_iva ?? it?.costoUnitarioIVA);

      const fecha = it?.fecha_ingreso
        ? String(it.fecha_ingreso)
        : new Date().toISOString().slice(0, 10);

      if (!categoria || !nombre_epp) {
        throw new Error("Payload incompleto");
      }
      if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
        throw new Error("Cantidad inválida");
      }
      if (!Number.isFinite(costoNum) || costoNum <= 0) {
        throw new Error("Costo inválido");
      }

      return {
        empresa_id: empresaId,
        usuario_id: usuario.id,
        categoria,
        nombre_epp,
        talla,
        cantidad_inicial: cantidadNum,
        cantidad_disponible: cantidadNum,
        costo_unitario_iva: costoNum,
        fecha_ingreso: fecha,
      };
    });
  } catch (e: any) {
    const msg = e?.message || "Payload inválido";
    const status =
      msg === "Payload incompleto" ||
      msg === "Cantidad inválida" ||
      msg === "Costo inválido"
        ? 400
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }

  // 6) Insert into lotes_epp (FIFO: each ingreso creates a new lote)
  const { data, error } = await supabaseAdmin
    .from("lotes_epp")
    .insert(rows)
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const res = NextResponse.json(
    {
      ok: true,
      inserted: data?.length || 0,
      lotes: data || [],
    },
    { status: 200 }
  );

  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Inserted", String(data?.length || 0));
  return res;
}
