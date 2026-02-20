// app/dashboard/stock/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

type UserRole =
  | "admin"
  | "jefe_area"
  | "bodega"
  | "solo_entrega"
  | "supervisor_terreno"
  | "gerencia"
  | "superadmin";

type ApiStockItem = {
  id: string;
  categoria: string;
  nombre: string;
  talla: string | null;
  stock_total: number;
  stock_critico: number;
  marca?: string | null;
  modelo?: string | null;
};

type StockItem = {
  // id legacy para /api/stock/[id]/critico
  id: string;
  categoria: string;
  nombre: string;
  talla: string | null;
  marca: string | null;
  modelo: string | null;
  stock: number;
  stockCritico: number;
};

type Centro = {
  id: string;
  nombre: string;
};

type StockCentroRow = {
  centro_id: string;
  centro_nombre: string;
  categoria: string;
  nombre: string;
  talla: string | null;
  marca: string | null;
  modelo: string | null;
  stock: number;
  // se deriva desde /api/stock (umbral por producto+talla)
  stockCritico: number;
  // id legacy (si existe) para poder editar crítico desde aquí también
  idLegacy: string | null;
};

type TransferForm = {
  from_centro_id: string | null;
  to_centro_id: string | null;
  categoria: string;
  nombre_epp: string;
  talla: string | null;
  cantidad: number;
  motivo: string;
  referencia: string;
};

function normalizeNullableText(v: any): string | null {
  if (v == null) return null;
  const s = String(v).trim();
  return s === "" ? null : s;
}

function keyProducto(categoria: string, nombre: string, talla: string | null) {
  return `${categoria}||${nombre}||${talla ?? ""}`;
}

function keyVariante(
  categoria: string,
  nombre: string,
  talla: string | null,
  marca: string | null,
  modelo: string | null
) {
  return `${categoria}||${nombre}||${talla ?? ""}||${marca ?? ""}||${modelo ?? ""}`;
}

function buildTotalEmpresaRows(globalRows: StockCentroRow[], centroRows: StockCentroRow[]): StockItem[] {
  const agg = new Map<
    string,
    {
      categoria: string;
      nombre: string;
      talla: string | null;
      marca: string | null;
      modelo: string | null;
      stock: number;
      stockCritico: number;
      idLegacy: string | null;
    }
  >();

  const add = (r: StockCentroRow) => {
    const k = keyVariante(r.categoria, r.nombre, r.talla, r.marca, r.modelo);
    const prev = agg.get(k);
    if (!prev) {
      agg.set(k, {
        categoria: r.categoria,
        nombre: r.nombre,
        talla: r.talla,
        marca: r.marca,
        modelo: r.modelo,
        stock: r.stock,
        stockCritico: r.stockCritico,
        idLegacy: r.idLegacy,
      });
    } else {
      prev.stock += r.stock;
      // stockCritico debe ser el mismo por producto+talla; mantenemos el primero
      if (!prev.idLegacy && r.idLegacy) prev.idLegacy = r.idLegacy;
    }
  };

  (globalRows ?? []).forEach(add);
  (centroRows ?? []).forEach(add);

  return Array.from(agg.values()).map((x) => ({
    id: x.idLegacy ?? `__noid__|${x.categoria}|${x.nombre}|${x.talla ?? ""}`,
    categoria: x.categoria,
    nombre: x.nombre,
    talla: x.talla,
    marca: x.marca,
    modelo: x.modelo,
    stock: x.stock,
    stockCritico: x.stockCritico,
  }));
}

export default function StockPage() {
  // Stock “Total Empresa” (agregado, viene desde backend /api/stock)
  const [items, setItems] = useState<StockItem[]>([]);

  // Centros y stock por centro / inventario empresa
  const [centros, setCentros] = useState<Centro[]>([]);
  const [globalRows, setGlobalRows] = useState<StockCentroRow[]>([]);
  const [centroRows, setCentroRows] = useState<StockCentroRow[]>([]);

  // Permisos
  const [rol, setRol] = useState<UserRole | null>(null);

  // UI stock crítico
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const [ordenCampo, setOrdenCampo] = useState<keyof StockItem | null>(null);
  const [ordenDireccion, setOrdenDireccion] = useState<"asc" | "desc">("asc");

  // Filtro global
  const [filtro, setFiltro] = useState<string>("");

  // UI Transfer
  const [transferOpen, setTransferOpen] = useState(false);
  const [transferBusy, setTransferBusy] = useState(false);
  const [transferError, setTransferError] = useState<string | null>(null);
  const [transferOk, setTransferOk] = useState<string | null>(null);
  const [transfer, setTransfer] = useState<TransferForm | null>(null);

  const canMoveStock = useMemo(() => {
    // Premisa acordada: Movimiento de stock SOLO admin y bodega.
    return rol === "admin" || rol === "bodega" || rol === "superadmin";
  }, [rol]);

  // ─────────────────────────────────────────────
  // Load helpers
  // ─────────────────────────────────────────────
  const loadRole = async () => {
    try {
      // Intentamos /api/user (si existe en tu app). Si falla, no bloquea.
      const r = await fetch("/api/user", { cache: "no-store" });
      if (!r.ok) return;
      const j = await r.json();
      const role = String(j?.rol ?? j?.role ?? "").trim().toLowerCase();
      if (
        role === "admin" ||
        role === "jefe_area" ||
        role === "bodega" ||
        role === "solo_entrega" ||
        role === "supervisor_terreno" ||
        role === "gerencia" ||
        role === "superadmin"
      ) {
        setRol(role as UserRole);
      }
    } catch {
      // ignore
    }
  };

  const loadStockApi = async () => {
    const res = await fetch("/api/stock", { cache: "no-store" });
    if (!res.ok) return;

    const data: ApiStockItem[] = await res.json();
    const mapped: StockItem[] = (data ?? []).map((item: any) => ({
      id: String(item.id),
      categoria: String(item.categoria ?? ""),
      nombre: String(item.nombre ?? ""),
      talla: normalizeNullableText(item.talla),
      marca: normalizeNullableText(item.marca),
      modelo: normalizeNullableText(item.modelo),
      stock: Number(item.stock_total ?? 0) || 0,
      stockCritico: Number(item.stock_critico ?? 0) || 0,
    }));

    setItems(mapped);
  };

  const loadCentros = async () => {
    // Leemos centros usando Supabase desde el navegador.
    // Nota: evitamos depender de un endpoint extra; RLS debe permitir leer centros de la empresa.
    try {
      const mod = await import("../../lib/supabase/client");
      const supabase = mod.supabaseBrowser();
      const { data, error } = await supabase
        .from("centros_trabajo")
        .select("id,nombre")
        .eq("activo", true)
        .order("nombre", { ascending: true });

      if (error) return;
      const rows = (data ?? []).map((c: any) => ({
        id: String(c.id),
        nombre: String(c.nombre ?? ""),
      }));
      setCentros(rows);
    } catch {
      // ignore
    }
  };

  const loadLotesAndAggregate = async (stockCriticoByKey: Map<string, { crit: number; id: string | null }>) => {
    try {
      const mod = await import("../../lib/supabase/client");
      const supabase = mod.supabaseBrowser();

      const { data, error } = await supabase
        .from("lotes_epp")
        .select("categoria,nombre_epp,talla,marca,modelo,cantidad_disponible,ubicacion_tipo,centro_id,anulado")
        .eq("anulado", false)
        .gt("cantidad_disponible", 0);

      if (error) return;

      // Global: ubicacion_tipo='global' and centro_id null
      // Centro: ubicacion_tipo='centro' and centro_id not null
      const globalAgg = new Map<string, Omit<StockCentroRow, "centro_id" | "centro_nombre" | "stockCritico" | "idLegacy"> & { stock: number }>();
      const centroAgg = new Map<string, Omit<StockCentroRow, "stockCritico" | "idLegacy"> & { stock: number }>();

      for (const r of data ?? []) {
        const categoria = String((r as any).categoria ?? "");
        const nombre = String((r as any).nombre_epp ?? "");
        const talla = normalizeNullableText((r as any).talla);
        const marca = normalizeNullableText((r as any).marca);
        const modelo = normalizeNullableText((r as any).modelo);
        const qty = Number((r as any).cantidad_disponible ?? 0);
        if (!Number.isFinite(qty) || qty <= 0) continue;

        const ubic = String((r as any).ubicacion_tipo ?? "").toLowerCase();
        const centroId = (r as any).centro_id ? String((r as any).centro_id) : null;

        if (ubic === "global" && !centroId) {
          const k = `${categoria}||${nombre}||${talla ?? ""}||${marca ?? ""}||${modelo ?? ""}`;
          const prev = globalAgg.get(k);
          if (!prev) {
            globalAgg.set(k, { categoria, nombre, talla, marca, modelo, stock: qty });
          } else {
            prev.stock += qty;
          }
        } else if (ubic === "centro" && centroId) {
          const k = `${centroId}||${categoria}||${nombre}||${talla ?? ""}||${marca ?? ""}||${modelo ?? ""}`;
          const prev = centroAgg.get(k);
          if (!prev) {
            centroAgg.set(k, {
              centro_id: centroId,
              centro_nombre: "",
              categoria,
              nombre,
              talla,
              marca,
              modelo,
              stock: qty,
            });
          } else {
            prev.stock += qty;
          }
        }
      }

      // materializa con nombres de centros + stock crítico
      const centrosMap = new Map<string, string>();
      for (const c of centros) centrosMap.set(c.id, c.nombre);

      const globals: StockCentroRow[] = Array.from(globalAgg.values()).map((x) => {
        const k = keyProducto(x.categoria, x.nombre, x.talla);
        const meta = stockCriticoByKey.get(k);
        return {
          centro_id: "__global__",
          centro_nombre: "Inventario Empresa",
          categoria: x.categoria,
          nombre: x.nombre,
          talla: x.talla,
          marca: x.marca,
          modelo: x.modelo,
          stock: x.stock,
          stockCritico: meta?.crit ?? 0,
          idLegacy: meta?.id ?? null,
        };
      });

      const centrosRows: StockCentroRow[] = Array.from(centroAgg.values()).map((x) => {
        const k = keyProducto(x.categoria, x.nombre, x.talla);
        const meta = stockCriticoByKey.get(k);
        return {
          ...x,
          centro_nombre: centrosMap.get(x.centro_id) ?? x.centro_id,
          stockCritico: meta?.crit ?? 0,
          idLegacy: meta?.id ?? null,
        };
      });

      globals.sort(
        (a, b) =>
          a.categoria.localeCompare(b.categoria) ||
          a.nombre.localeCompare(b.nombre) ||
          String(a.talla ?? "").localeCompare(String(b.talla ?? ""))
      );

      centrosRows.sort(
        (a, b) =>
          a.centro_nombre.localeCompare(b.centro_nombre) ||
          a.categoria.localeCompare(b.categoria) ||
          a.nombre.localeCompare(b.nombre) ||
          String(a.talla ?? "").localeCompare(String(b.talla ?? ""))
      );

      setGlobalRows(globals);
      setCentroRows(centrosRows);
    } catch {
      // ignore
    }
  };

  const reloadAll = async () => {
    // 1) stock base (incluye stockCritico)
    await loadStockApi();

    // 2) centros
    await loadCentros();

    // 3) armar un map de stockCritico y id legacy desde `items`
    const byKey = new Map<string, { crit: number; id: string | null }>();
    for (const it of items) {
      byKey.set(keyProducto(it.categoria, it.nombre, it.talla), {
        crit: it.stockCritico,
        id: it.id,
      });
    }

    // 4) lotes -> global + por centro
    await loadLotesAndAggregate(byKey);
  };

  useEffect(() => {
    // carga inicial
    (async () => {
      await loadRole();
      await loadCentros();
      await loadStockApi();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cada vez que cambie items o centros, refrescamos la agregación por lotes
  useEffect(() => {
    const byKey = new Map<string, { crit: number; id: string | null }>();
    for (const it of items) {
      byKey.set(keyProducto(it.categoria, it.nombre, it.talla), {
        crit: it.stockCritico,
        id: it.id,
      });
    }
    loadLotesAndAggregate(byKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, centros]);

  const getEstado = (stock: number, crit: number) => {
    if (stock <= crit) {
      return {
        label: "Crítico",
        className: "text-red-600 font-semibold",
      };
    }
    return {
      label: "OK",
      className: "text-green-600 font-semibold",
    };
  };

  const handleOrden = (campo: keyof StockItem) => {
    if (ordenCampo === campo) {
      setOrdenDireccion((prev) => (prev === "asc" ? "desc" : "asc"));
    } else {
      setOrdenCampo(campo);
      setOrdenDireccion("asc");
    }
  };

  const itemsOrdenados = useMemo(() => {
    const arr = [...items];
    arr.sort((a, b) => {
      if (!ordenCampo) return 0;
      const aVal: any = (a as any)[ordenCampo];
      const bVal: any = (b as any)[ordenCampo];

      if (typeof aVal === "number" && typeof bVal === "number") {
        return ordenDireccion === "asc" ? aVal - bVal : bVal - aVal;
      }

      return ordenDireccion === "asc"
        ? String(aVal ?? "").localeCompare(String(bVal ?? ""))
        : String(bVal ?? "").localeCompare(String(aVal ?? ""));
    });
    return arr;
  }, [items, ordenCampo, ordenDireccion]);

  const totalEmpresaRows = useMemo(() => {
    const rows = buildTotalEmpresaRows(globalRows, centroRows);
    rows.sort(
      (a, b) =>
        a.categoria.localeCompare(b.categoria) ||
        a.nombre.localeCompare(b.nombre) ||
        String(a.talla ?? "").localeCompare(String(b.talla ?? ""))
    );
    return rows;
  }, [globalRows, centroRows]);

  const totalEmpresaOrdenados = useMemo(() => {
    const arr = [...totalEmpresaRows];
    arr.sort((a, b) => {
      if (!ordenCampo) return 0;
      const aVal: any = (a as any)[ordenCampo];
      const bVal: any = (b as any)[ordenCampo];

      if (typeof aVal === "number" && typeof bVal === "number") {
        return ordenDireccion === "asc" ? aVal - bVal : bVal - aVal;
      }

      return ordenDireccion === "asc"
        ? String(aVal ?? "").localeCompare(String(bVal ?? ""))
        : String(bVal ?? "").localeCompare(String(aVal ?? ""));
    });
    return arr;
  }, [totalEmpresaRows, ordenCampo, ordenDireccion]);

  // Filtro global
  const textoFiltro = filtro.trim().toLowerCase();

  const matchFiltro = (values: (string | null | number)[]) => {
    if (!textoFiltro) return true;
    return values.some((v) =>
      String(v ?? "").toLowerCase().includes(textoFiltro)
    );
  };

  const globalFiltrados = useMemo(() => {
    return globalRows.filter((r) =>
      matchFiltro([r.categoria, r.nombre, r.talla, r.marca, r.modelo])
    );
  }, [globalRows, textoFiltro]);

  const centroFiltrados = useMemo(() => {
    return centroRows.filter((r) =>
      matchFiltro([
        r.centro_nombre,
        r.categoria,
        r.nombre,
        r.talla,
        r.marca,
        r.modelo,
      ])
    );
  }, [centroRows, textoFiltro]);

  const totalEmpresaFiltrados = useMemo(() => {
    return totalEmpresaOrdenados.filter((r) =>
      matchFiltro([r.categoria, r.nombre, r.talla, r.marca, r.modelo])
    );
  }, [totalEmpresaOrdenados, textoFiltro]);

  const openTransfer = (p: {
    from: string | null;
    to: string | null;
    categoria: string;
    nombre: string;
    talla: string | null;
  }) => {
    setTransferError(null);
    setTransferOk(null);
    setTransfer({
      from_centro_id: p.from,
      to_centro_id: p.to,
      categoria: p.categoria,
      nombre_epp: p.nombre,
      talla: p.talla,
      cantidad: 1,
      motivo: "",
      referencia: "",
    });
    setTransferOpen(true);
  };

  const submitTransfer = async () => {
    if (!transfer) return;
    setTransferBusy(true);
    setTransferError(null);
    setTransferOk(null);

    try {
      const payload = {
        from_centro_id: transfer.from_centro_id,
        to_centro_id: transfer.to_centro_id,
        categoria: transfer.categoria,
        nombre_epp: transfer.nombre_epp,
        talla: transfer.talla,
        cantidad: Number(transfer.cantidad),
        motivo: transfer.motivo || null,
        referencia: transfer.referencia || null,
      };

      const r = await fetch("/api/stock/traspaso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const j = await r.json().catch(() => null);

      if (!r.ok || !j?.ok) {
        const reason = j?.reason || j?.error || "No se pudo mover stock";
        setTransferError(String(reason));
        return;
      }

      setTransferOk("Movimiento registrado");
      setTransferOpen(false);
      setTransfer(null);

      // refrescar datos
      await loadStockApi();
      // la agregación por lotes se recalcula por el effect al cambiar items
    } catch (e: any) {
      setTransferError(e?.message ?? "Error moviendo stock");
    } finally {
      setTransferBusy(false);
    }
  };

  const renderProductoLabel = (nombre: string, marca: string | null, modelo: string | null) => {
    const mm = [marca, modelo].filter(Boolean).join(" - ");
    return mm ? `${nombre} (${mm})` : nombre;
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">Stock de EPP</h1>
          <p className="text-sm text-zinc-500">
            Inventario Empresa (global) y stock asignado por centro de trabajo.
          </p>
          <div className="mt-3">
            <input
              type="text"
              value={filtro}
              onChange={(e) => setFiltro(e.target.value)}
              placeholder="Filtrar por categoría, EPP, talla o marca..."
              className="w-full max-w-md rounded border px-3 py-2 text-sm"
            />
          </div>
        </div>
        <button
          className="rounded border px-3 py-2 text-sm hover:bg-zinc-50"
          onClick={() => {
            setTransferError(null);
            setTransferOk(null);
            loadRole();
            loadCentros();
            loadStockApi();
          }}
          type="button"
        >
          Refrescar
        </button>
      </div>

      {/* MODAL movimiento */}
      {transferOpen && transfer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-lg rounded-lg bg-white p-4 shadow">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold">Mover stock</h2>
              <button
                className="rounded px-2 py-1 text-sm hover:bg-zinc-100"
                onClick={() => {
                  if (transferBusy) return;
                  setTransferOpen(false);
                  setTransfer(null);
                }}
                type="button"
              >
                ✕
              </button>
            </div>

            <div className="mt-3 space-y-3 text-sm">
              <div className="rounded border bg-zinc-50 p-3">
                <div className="font-medium">Producto</div>
                <div>
                  {transfer.categoria} — {transfer.nombre_epp}{" "}
                  <span className="text-zinc-500">(talla: {transfer.talla ?? "-"})</span>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <div className="text-zinc-600">Desde</div>
                  <select
                    className="w-full rounded border px-2 py-2"
                    value={transfer.from_centro_id ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTransfer((prev) =>
                        prev
                          ? {
                              ...prev,
                              from_centro_id: v === "" ? null : v,
                            }
                          : prev
                      );
                    }}
                  >
                    <option value="">Inventario Empresa</option>
                    {centros.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="space-y-1">
                  <div className="text-zinc-600">Hacia</div>
                  <select
                    className="w-full rounded border px-2 py-2"
                    value={transfer.to_centro_id ?? ""}
                    onChange={(e) => {
                      const v = e.target.value;
                      setTransfer((prev) =>
                        prev
                          ? {
                              ...prev,
                              to_centro_id: v === "" ? null : v,
                            }
                          : prev
                      );
                    }}
                  >
                    <option value="">Inventario Empresa</option>
                    {centros.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <label className="space-y-1">
                  <div className="text-zinc-600">Cantidad</div>
                  <input
                    type="number"
                    min={1}
                    className="w-full rounded border px-2 py-2"
                    value={transfer.cantidad}
                    onChange={(e) => {
                      const n = Number(e.target.value);
                      setTransfer((prev) =>
                        prev
                          ? {
                              ...prev,
                              cantidad: Number.isFinite(n) && n > 0 ? n : 1,
                            }
                          : prev
                      );
                    }}
                  />
                </label>

                <label className="space-y-1">
                  <div className="text-zinc-600">Referencia</div>
                  <input
                    className="w-full rounded border px-2 py-2"
                    value={transfer.referencia}
                    onChange={(e) =>
                      setTransfer((prev) =>
                        prev ? { ...prev, referencia: e.target.value } : prev
                      )
                    }
                    placeholder="opcional"
                  />
                </label>
              </div>

              <label className="space-y-1">
                <div className="text-zinc-600">Motivo</div>
                <input
                  className="w-full rounded border px-2 py-2"
                  value={transfer.motivo}
                  onChange={(e) =>
                    setTransfer((prev) =>
                      prev ? { ...prev, motivo: e.target.value } : prev
                    )
                  }
                  placeholder="opcional"
                />
              </label>

              {transferError && (
                <div className="rounded border border-red-200 bg-red-50 p-2 text-red-700">
                  {transferError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  className="rounded border px-3 py-2 text-sm hover:bg-zinc-50"
                  onClick={() => {
                    if (transferBusy) return;
                    setTransferOpen(false);
                    setTransfer(null);
                  }}
                  type="button"
                >
                  Cancelar
                </button>
                <button
                  disabled={transferBusy || !canMoveStock}
                  className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-40"
                  onClick={submitTransfer}
                  type="button"
                  title={!canMoveStock ? "Solo admin o bodega pueden mover stock" : ""}
                >
                  {transferBusy ? "Moviendo…" : "Confirmar"}
                </button>
              </div>

              {!canMoveStock && (
                <div className="text-xs text-zinc-500">
                  Movimiento de stock: solo <b>admin</b> o <b>bodega</b>.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Inventario Empresa (global) */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Inventario Bodega Empresa</h2>
          {transferOk && (
            <span className="text-sm text-green-700">{transferOk}</span>
          )}
        </div>

        {globalFiltrados.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-zinc-500">
            Sin stock en Inventario Bodega Empresa.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th onClick={() => handleOrden("categoria")} className="px-4 py-3 cursor-pointer">
                    Categoría {ordenCampo === "categoria" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleOrden("nombre")} className="px-4 py-3 cursor-pointer">
                    EPP {ordenCampo === "nombre" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleOrden("talla")} className="px-4 py-3 cursor-pointer">
                    Talla {ordenCampo === "talla" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleOrden("stock")} className="px-4 py-3 cursor-pointer">
                    Stock {ordenCampo === "stock" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleOrden("stockCritico")} className="px-4 py-3 cursor-pointer">
                    Stock crítico {ordenCampo === "stockCritico" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {globalFiltrados.map((row, idx) => {
                  const estado = getEstado(row.stock, row.stockCritico);
                  return (
                    <tr key={`${row.categoria}-${row.nombre}-${row.talla ?? ""}-${idx}`} className="border-t">
                      <td className="px-4 py-3">{row.categoria}</td>
                      <td className="px-4 py-3">
                        {renderProductoLabel(row.nombre, row.marca, row.modelo)}
                      </td>
                      <td className="px-4 py-3">{row.talla ?? "-"}</td>
                      <td className="px-4 py-3">{row.stock}</td>
                      <td className="px-4 py-3">{row.stockCritico}</td>
                      <td className={`px-4 py-3 ${estado.className}`}>{estado.label}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="rounded border px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-40"
                          disabled={!canMoveStock}
                          onClick={() =>
                            openTransfer({
                              from: null,
                              to: centros[0]?.id ?? null,
                              categoria: row.categoria,
                              nombre: row.nombre,
                              talla: row.talla,
                            })
                          }
                          type="button"
                          title={!canMoveStock ? "Solo admin o bodega" : ""}
                        >
                          Mover…
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Stock por centro */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Stock por centro de trabajo</h2>

        {centroFiltrados.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-zinc-500">
            Sin stock asignado a centros.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th className="px-4 py-3">Centro</th>
                  <th onClick={() => handleOrden("categoria")} className="px-4 py-3 cursor-pointer">
                    Categoría {ordenCampo === "categoria" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleOrden("nombre")} className="px-4 py-3 cursor-pointer">
                    EPP {ordenCampo === "nombre" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleOrden("talla")} className="px-4 py-3 cursor-pointer">
                    Talla {ordenCampo === "talla" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleOrden("stock")} className="px-4 py-3 cursor-pointer">
                    Stock {ordenCampo === "stock" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleOrden("stockCritico")} className="px-4 py-3 cursor-pointer">
                    Stock crítico {ordenCampo === "stockCritico" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {centroFiltrados.map((row, idx) => {
                  const estado = getEstado(row.stock, row.stockCritico);
                  return (
                    <tr key={`${row.centro_id}-${row.categoria}-${row.nombre}-${row.talla ?? ""}-${idx}`} className="border-t">
                      <td className="px-4 py-3">{row.centro_nombre}</td>
                      <td className="px-4 py-3">{row.categoria}</td>
                      <td className="px-4 py-3">
                        {renderProductoLabel(row.nombre, row.marca, row.modelo)}
                      </td>
                      <td className="px-4 py-3">{row.talla ?? "-"}</td>
                      <td className="px-4 py-3">{row.stock}</td>
                      <td className="px-4 py-3">{row.stockCritico}</td>
                      <td className={`px-4 py-3 ${estado.className}`}>{estado.label}</td>
                      <td className="px-4 py-3 text-right">
                        <button
                          className="rounded border px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-40"
                          disabled={!canMoveStock}
                          onClick={() =>
                            openTransfer({
                              from: row.centro_id,
                              to: null,
                              categoria: row.categoria,
                              nombre: row.nombre,
                              talla: row.talla,
                            })
                          }
                          type="button"
                          title={!canMoveStock ? "Solo admin o bodega" : ""}
                        >
                          Mover…
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Stock total empresa (backend) + editor stock crítico */}
      <section className="space-y-3">
        <h2 className="text-lg font-semibold">Total Empresa (referencial)</h2>
        <p className="text-sm text-zinc-500">
          Agregado de stock (inventario bodega + centros). Mantiene el editor de stock crítico.
        </p>

        {totalEmpresaFiltrados.length === 0 ? (
          <div className="rounded-lg border border-dashed p-6 text-center text-sm text-zinc-500">
            Aún no tienes EPP registrados.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-zinc-50 text-left">
                <tr>
                  <th onClick={() => handleOrden("categoria")} className="px-4 py-3 cursor-pointer">
                    Categoría {ordenCampo === "categoria" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleOrden("nombre")} className="px-4 py-3 cursor-pointer">
                    EPP {ordenCampo === "nombre" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleOrden("talla")} className="px-4 py-3 cursor-pointer">
                    Talla {ordenCampo === "talla" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleOrden("stock")} className="px-4 py-3 cursor-pointer">
                    Stock {ordenCampo === "stock" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th onClick={() => handleOrden("stockCritico")} className="px-4 py-3 cursor-pointer">
                    Stock crítico {ordenCampo === "stockCritico" && (ordenDireccion === "asc" ? "▲" : "▼")}
                  </th>
                  <th className="px-4 py-3">Estado</th>
                </tr>
              </thead>
              <tbody>
                {totalEmpresaFiltrados.map((item) => {
                  const estado = getEstado(item.stock, item.stockCritico);
                  return (
                    <tr key={item.id} className="border-t">
                      <td className="px-4 py-3">{item.categoria}</td>
                      <td className="px-4 py-3">
                        {renderProductoLabel(item.nombre, item.marca, item.modelo)}
                      </td>
                      <td className="px-4 py-3">{item.talla ?? "-"}</td>
                      <td className="px-4 py-3">{item.stock}</td>
                      <td className="px-4 py-3">
                        {editingId === item.id ? (
                          <div className="flex items-center space-x-2">
                            <input
                              type="number"
                              min={0}
                              className="w-20 rounded border px-2 py-1 text-sm"
                              value={editValue}
                              onChange={(e) => {
                                const value = Number(e.target.value);
                                if (value < 0) return;
                                setEditValue(value);
                              }}
                            />
                            <button
                              className="text-green-600 text-sm font-semibold"
                              onClick={async () => {
                                const res = await fetch(`/api/stock/${item.id}/critico`, {
                                  method: "PATCH",
                                  headers: { "Content-Type": "application/json" },
                                  body: JSON.stringify({ stock_critico: editValue }),
                                });

                                if (!res.ok) {
                                  alert("Error al actualizar stock crítico");
                                  return;
                                }

                                setItems((prev) =>
                                  prev.map((i) => (i.id === item.id ? { ...i, stockCritico: editValue } : i))
                                );
                                setEditingId(null);
                              }}
                            >
                              Guardar
                            </button>
                            <button
                              className="text-red-600 text-sm font-semibold"
                              onClick={() => {
                                setEditingId(null);
                              }}
                            >
                              Cancelar
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center space-x-2">
                            <span>{item.stockCritico}</span>
                            <button
                              className="text-blue-600 text-sm font-semibold disabled:opacity-40"
                              disabled={String(item.id).startsWith("__noid__|")}
                              title={String(item.id).startsWith("__noid__|") ? "No editable (id legacy no disponible)" : ""}
                              onClick={() => {
                                setEditingId(item.id);
                                setEditValue(item.stockCritico);
                              }}
                            >
                              Editar
                            </button>
                          </div>
                        )}
                      </td>
                      <td className={`px-4 py-3 ${estado.className}`}>{estado.label}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
