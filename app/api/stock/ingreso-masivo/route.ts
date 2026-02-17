// app/api/stock/ingreso-masivo/route.ts

export const dynamic = "force-dynamic";
export const revalidate = 0;
// app/api/stock/ingreso-masivo/route.ts

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

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

function sanitizeCompra(raw: any) {
  if (!raw || typeof raw !== "object") return null;

  const tipo = String(raw.tipo ?? "").trim().toLowerCase();
  const allowed = new Set(["factura", "guia", "oc", "otro"]);
  const safeTipo = allowed.has(tipo) ? tipo : "factura";

  const numero = String(raw.numero ?? "").trim();
  const fecha = String(raw.fecha ?? "").trim();

  const proveedorRutInput = raw.proveedor_rut;
  const proveedorRutNorm = proveedorRutInput != null && String(proveedorRutInput).trim() !== ""
    ? normalizeRut(proveedorRutInput)
    : "";
  const proveedorNombre = String(raw.proveedor_nombre ?? "").trim();

  // fecha soft-validated (YYYY-MM-DD)
  const safeFecha = /^\d{4}-\d{2}-\d{2}$/.test(fecha) ? fecha : "";

  return {
    tipo: safeTipo,
    numero: numero || null,
    // keep as string (or null) but do not silently accept invalid user input; validations happen in POST
    fecha: safeFecha || null,
    proveedor_rut: proveedorRutNorm || null,
    proveedor_nombre: proveedorNombre || null,
    // meta flags for validation
    _had_proveedor_rut: proveedorRutInput != null && String(proveedorRutInput).trim() !== "",
    _had_fecha: fecha.length > 0,
    _fecha_valid: safeFecha.length > 0,
    _rut_valid: (proveedorRutNorm && isRutLike(proveedorRutNorm)) || !proveedorRutNorm,
  };
}

export async function POST(req: Request) {
  const cookieStore = await cookies();

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

  const supabaseAuth = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
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

  const body = await req.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: "Body inválido" }, { status: 400 });
  }

  const items = body?.items;
  if (!Array.isArray(items) || items.length === 0) {
    return NextResponse.json({ error: "items inválido" }, { status: 400 });
  }

  if (items.length > 500) {
    return NextResponse.json(
      { error: "Demasiados items (máx 500)" },
      { status: 400 }
    );
  }

  const compra = sanitizeCompra(body.compra);

  // Validaciones estrictas: si el usuario envió rut/fecha, deben ser válidos (evita perder datos silenciosamente)
  if (compra?._had_proveedor_rut && !compra.proveedor_rut) {
    return NextResponse.json(
      { error: "RUT proveedor inválido" },
      { status: 400 }
    );
  }

  if (compra?._had_fecha && !compra._fecha_valid) {
    return NextResponse.json(
      { error: "Fecha doc inválida (usa YYYY-MM-DD)" },
      { status: 400 }
    );
  }

  if (compra?.proveedor_rut && !isRutLike(compra.proveedor_rut)) {
    return NextResponse.json(
      { error: "RUT proveedor inválido" },
      { status: 400 }
    );
  }

  const { data: usuario, error: usuarioError } = await supabaseAdmin
    .from("usuarios")
    .select("id, empresa_id")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (usuarioError) {
    return NextResponse.json({ error: usuarioError.message }, { status: 500 });
  }

  if (!usuario?.empresa_id || !usuario?.id) {
    return NextResponse.json(
      { error: "Usuario o empresa no encontrado" },
      { status: 404 }
    );
  }

  const today = new Date().toISOString().slice(0, 10);

  const rows = items.map((it: any) => {
    const cantidad = Number(it.cantidad);
    const costo = Number(it.costo_unitario_iva ?? it.costoUnitarioIVA);

    const marcaRaw = it?.marca != null ? String(it.marca).trim() : "";
    const modeloRaw = it?.modelo != null ? String(it.modelo).trim() : "";
    const marca = marcaRaw ? marcaRaw : null;
    const modelo = modeloRaw ? modeloRaw : null;

    const tallaRaw = it?.talla ? String(it.talla).trim() : "";
    const talla =
      tallaRaw &&
      !["no aplica", "noaplica", "n/a", "na", "-"].includes(
        tallaRaw.toLowerCase()
      )
        ? tallaRaw
        : null;

    return {
      empresa_id: usuario.empresa_id,
      usuario_id: usuario.id,
      categoria: String(it.categoria || "").trim(),
      nombre_epp: String((it.nombre_epp ?? it.nombreEpp) || "").trim(),
      marca,
      modelo,
      talla,
      cantidad_inicial: cantidad,
      cantidad_disponible: cantidad,
      costo_unitario_iva: costo,
      fecha_ingreso: it.fecha_ingreso
        ? String(it.fecha_ingreso)
        : today,
    };
  });

  for (const r of rows) {
    const cantidadOk =
      Number.isFinite(r.cantidad_inicial) && r.cantidad_inicial > 0;
    const costoOk =
      Number.isFinite(r.costo_unitario_iva) && r.costo_unitario_iva > 0;

    if (!r.categoria || !r.nombre_epp || !cantidadOk || !costoOk) {
      return NextResponse.json(
        { error: "Item inválido en items" },
        { status: 400 }
      );
    }
  }

  const { data, error } = await supabaseAdmin
    .from("lotes_epp")
    .insert(rows)
    .select("*");

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let compra_id: string | null = null;
  let trace_warning: string | null = null;

  if (compra) {
      // Auto-create / upsert proveedor (versión minimalista)
      if (compra.proveedor_rut) {
        try {
          const { data: existingProv } = await supabaseAdmin
            .from("proveedores")
            .select("id, nombre")
            .eq("empresa_id", usuario.empresa_id)
            .eq("rut", compra.proveedor_rut)
            .maybeSingle();

          let proveedorNombreFinal = compra.proveedor_nombre;

          if (!existingProv) {
            const { error: provErr } = await supabaseAdmin
              .from("proveedores")
              .insert({
                empresa_id: usuario.empresa_id,
                rut: compra.proveedor_rut,
                nombre: compra.proveedor_nombre,
              });

            if (provErr) {
              throw new Error(
                provErr.message || "No se pudo crear proveedor"
              );
            }
          } else {
            // Si no viene nombre pero ya existe proveedor, usar el existente
            if (!proveedorNombreFinal && existingProv.nombre) {
              proveedorNombreFinal = existingProv.nombre;
            }
          }

          // Asegurar que la compra use el nombre final
          compra.proveedor_nombre = proveedorNombreFinal || null;
        } catch (provError: any) {
          throw new Error(
            provError?.message || "Error gestionando proveedor"
          );
        }
      }
    try {
      const { data: compraRow, error: compraErr } = await supabaseAdmin
        .from("ingresos_compra")
        .insert({
          empresa_id: usuario.empresa_id,
          usuario_id: usuario.id,
          tipo_documento: compra.tipo,
          numero_documento: compra.numero,
          fecha_documento: compra.fecha,
          proveedor_rut: compra.proveedor_rut,
          proveedor_nombre: compra.proveedor_nombre,
        })
        .select("id")
        .maybeSingle();

      if (compraErr || !compraRow?.id) {
        throw new Error(
          compraErr?.message || "No se pudo crear cabecera de compra"
        );
      }

      compra_id = String(compraRow.id);

      const detalleRows = (data || []).map((lote: any) => ({
        compra_id,
        lote_id: lote.id,
        categoria: lote.categoria,
        nombre_epp: lote.nombre_epp,
        marca: lote.marca ?? null,
        modelo: lote.modelo ?? null,
        talla: lote.talla,
        cantidad: lote.cantidad_inicial,
        costo_unitario_iva: lote.costo_unitario_iva,
      }));

      const { error: detErr } = await supabaseAdmin
        .from("ingresos_compra_detalle")
        .insert(detalleRows);

      if (detErr) {
        throw new Error(
          detErr.message || "No se pudo crear detalle de compra"
        );
      }
    } catch (e: any) {
      trace_warning =
        e?.message || "No se pudo guardar trazabilidad de compra";
      compra_id = null;
    }
  }

  const res = NextResponse.json(
    {
      ok: true,
      inserted: data?.length || 0,
      rows: data,
      compra_id,
      trace_warning,
    },
    { status: 200 }
  );

  res.headers.set("Cache-Control", "no-store");
  res.headers.set("X-Inserted", String(data?.length || 0));
  return res;
}
