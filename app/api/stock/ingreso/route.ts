// app/api/stock/ingreso/route.ts

import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function normalizeRut(input: unknown) {
  const s = String(input ?? "").trim().toUpperCase();
  const clean = s.replace(/[^0-9K]/g, "");
  if (clean.length < 2) return "";
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body}-${dv}`;
}

function isRutLike(input: string) {
  return !input || /^[0-9]{7,8}-[0-9K]$/.test(input);
}

type CompraPayload = {
  tipo?: "factura" | "guia" | "oc" | "otro" | string | null;
  numero?: string | null;
  fecha?: string | null; // YYYY-MM-DD
  proveedor_rut?: string | null;
  proveedor_nombre?: string | null;
};

function sanitizeCompra(raw: any): CompraPayload | null {
  if (!raw || typeof raw !== "object") return null;

  const tipo = String(raw.tipo ?? "").trim().toLowerCase();
  const allowed = new Set(["factura", "guia", "oc", "otro"]);
  const safeTipo = allowed.has(tipo) ? (tipo as any) : "factura";

  const numero = String(raw.numero ?? "").trim();
  const fecha = String(raw.fecha ?? "").trim();

  const proveedorRutNorm = raw.proveedor_rut ? normalizeRut(raw.proveedor_rut) : "";
  const proveedorNombre = String(raw.proveedor_nombre ?? "").trim();

  // fecha soft-validated (YYYY-MM-DD)
  const safeFecha = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : null;

  return {
    tipo: safeTipo,
    numero: numero || null,
    fecha: safeFecha,
    proveedor_rut: proveedorRutNorm || null,
    proveedor_nombre: proveedorNombre || null,
  };
}

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

  const compra = sanitizeCompra(body.compra);

  // Minimalista: auto-crear/actualizar proveedor por empresa (best-effort).
  async function ensureProveedor(params: {
    empresaId: string;
    rut: string;
    nombre?: string | null;
  }) {
    const rut = (params.rut || "").trim();
    if (!rut) return { nombreFinal: params.nombre ?? null };

    const incomingNombre = (params.nombre ?? "").trim();

    // Leer nombre existente si no viene nombre entrante
    const { data: existing } = await supabaseAdmin
      .from("proveedores")
      .select("rut, nombre")
      .eq("empresa_id", params.empresaId)
      .eq("rut", rut)
      .maybeSingle();

    const nombreFinal = incomingNombre || (existing?.nombre ? String(existing.nombre) : "");

    // Upsert (requiere UNIQUE (empresa_id, rut))
    await supabaseAdmin
      .from("proveedores")
      .upsert(
        {
          empresa_id: params.empresaId,
          rut,
          nombre: nombreFinal || null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "empresa_id,rut" }
      );

    return { nombreFinal: nombreFinal || null };
  }

  // If proveedor_rut provided but invalid, reject (avoid bad data)
  if (compra?.proveedor_rut && !isRutLike(compra.proveedor_rut)) {
    return NextResponse.json({ error: "RUT proveedor inválido" }, { status: 400 });
  }

  // 3) Resolve empresa_id from usuario (schema confirmado: usuarios.auth_user_id)
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

  // 7) Best-effort traceability: persist purchase header + detail if tables exist.
  // This is optional and will NOT fail the ingreso if the trace tables are not present yet.
  let compra_id: string | null = null;
  let trace_warning: string | null = null;

  if (compra) {
    try {
      // Header table name (proposed): ingresos_compra
      const headerQB: any = supabaseAdmin.from("ingresos_compra");
      const { data: compraRow, error: compraErr } = await headerQB
        .insert({
          empresa_id: empresaId,
          usuario_id: usuario.id,
          tipo_documento: compra.tipo,
          numero_documento: compra.numero,
          fecha_documento: compra.fecha,
          proveedor_rut: compra.proveedor_rut,
          proveedor_nombre: (
            compra.proveedor_rut
              ? (await ensureProveedor({
                  empresaId,
                  rut: compra.proveedor_rut,
                  nombre: compra.proveedor_nombre,
                })).nombreFinal
              : compra.proveedor_nombre
          ),
        })
        .select("id")
        .maybeSingle();

      if (compraErr || !compraRow?.id) {
        throw new Error(compraErr?.message || "No se pudo crear cabecera de compra");
      }

      compra_id = String(compraRow.id);

      // Detail table name (proposed): ingresos_compra_detalle
      const detalleQB: any = supabaseAdmin.from("ingresos_compra_detalle");

      const lotesInserted: any[] = Array.isArray(data) ? data : [];
      const detalleRows = rows.map((r, idx) => ({
        compra_id,
        lote_id: lotesInserted[idx]?.id ?? null,
        categoria: r.categoria,
        nombre_epp: r.nombre_epp,
        talla: r.talla,
        cantidad: r.cantidad_inicial,
        costo_unitario_iva: r.costo_unitario_iva,
      }));

      const { error: detErr } = await detalleQB.insert(detalleRows);
      if (detErr) {
        throw new Error(detErr.message || "No se pudo crear detalle de compra");
      }
    } catch (e: any) {
      trace_warning = e?.message || "No se pudo guardar trazabilidad de compra";
      compra_id = null;
    }
  }

  const res = NextResponse.json(
    {
      ok: true,
      inserted: data?.length || 0,
      lotes: data || [],
      compra_id,
      trace_warning,
    },
    { status: 200 }
  );

  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Inserted", String(data?.length || 0));
  return res;
}
