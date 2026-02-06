// app/dashboard/egreso/page.tsx
"use client";

import type React from "react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Trabajador = {
  id: string;
  nombre: string;
  rut: string;
  activo: boolean;
  centro_id: string | null;
};

type StockRow = {
  categoria: string;
  nombre: string;
  talla: string | null;
  stock: number;
};

type EgresoItemUI = {
  categoria: string;
  epp: string;
  tallaNumero: string;
  cantidad: number;
};

export default function EgresoPage() {
  const router = useRouter();

  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);

  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [trabajadorId, setTrabajadorId] = useState<string>("");

  const [stock, setStock] = useState<StockRow[]>([]);

  const [items, setItems] = useState<EgresoItemUI[]>([
    { categoria: "", epp: "", tallaNumero: "", cantidad: 1 },
  ]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [firmado, setFirmado] = useState<boolean>(false);

  // ─────────────────────────────────────────────
  // Load trabajadores activos + stock
  // ─────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const { data: authData, error: authError } =
          await supabaseBrowser().auth.getUser();

        if (authError || !authData?.user) {
          setError("No autenticado. Inicia sesión nuevamente.");
          setLoading(false);
          return;
        }

        const { data: usuario, error: usuarioError } = await supabaseBrowser()
          .from("usuarios")
          .select("empresa_id")
          .eq("auth_user_id", authData.user.id)
          .maybeSingle();

        if (usuarioError || !usuario?.empresa_id) {
          setError("No se pudo identificar empresa.");
          setLoading(false);
          return;
        }

        // Trabajadores activos
        const { data: trabs, error: trabErr } = await supabaseBrowser()
          .from("trabajadores")
          .select("id,nombre,rut,activo,centro_id")
          .eq("empresa_id", usuario.empresa_id)
          .eq("activo", true)
          .order("nombre", { ascending: true });

        if (trabErr) {
          setError(trabErr.message);
          setLoading(false);
          return;
        }

        setTrabajadores((trabs as any[])?.map((t) => ({
          id: t.id,
          nombre: t.nombre,
          rut: t.rut,
          activo: t.activo,
          centro_id: t.centro_id ?? null,
        })) ?? []);

        // Stock (desde API server)
        const stockResp = await fetch("/api/stock", { cache: "no-store" });
        if (!stockResp.ok) {
          setError("No se pudo cargar el stock.");
          setLoading(false);
          return;
        }

        const stockRaw = await stockResp.json().catch(() => []);
        const mapped: StockRow[] = (Array.isArray(stockRaw) ? stockRaw : []).map((r: any) => ({
          categoria: String(r?.categoria ?? ""),
          nombre: String(r?.nombre ?? ""),
          talla: r?.talla == null || String(r.talla).trim() === "" ? null : String(r.talla),
          stock: Number(r?.stock_total ?? r?.stock ?? 0),
        }));

        // Solo lo disponible
        setStock(mapped.filter((s) => s.stock > 0));
        setError("");
        setLoading(false);
      } catch (e: any) {
        setError(e?.message || "Error cargando datos");
        setLoading(false);
      }
    };

    load();
  }, []);

  const categorias = useMemo(() => {
    return Array.from(new Set(stock.map((s) => s.categoria))).sort((a, b) => a.localeCompare(b));
  }, [stock]);

  const eppsPorCategoria = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const s of stock) {
      if (!map.has(s.categoria)) map.set(s.categoria, []);
      const arr = map.get(s.categoria)!;
      if (!arr.includes(s.nombre)) arr.push(s.nombre);
    }
    for (const [k, arr] of map.entries()) {
      map.set(k, arr.sort((a, b) => a.localeCompare(b)));
    }
    return map;
  }, [stock]);

  const tallasPara = (categoria: string, epp: string) => {
    const rows = stock.filter((s) => s.categoria === categoria && s.nombre === epp);
    const tallas = rows.map((r) => r.talla ?? "No aplica");
    return Array.from(new Set(tallas)).sort((a, b) => a.localeCompare(b));
  };

  const stockDisponiblePara = (categoria: string, epp: string, tallaNumero: string) => {
    const tallaKey = !tallaNumero || tallaNumero === "No aplica" ? null : tallaNumero;
    const row = stock.find(
      (s) => s.categoria === categoria && s.nombre === epp && (s.talla ?? null) === tallaKey
    );
    return row?.stock ?? 0;
  };

  const trabajadorSeleccionado = useMemo(() => {
    return trabajadores.find((t) => t.id === trabajadorId) ?? null;
  }, [trabajadores, trabajadorId]);

  const updateItem = (index: number, patch: Partial<EgresoItemUI>) => {
    setItems((prev) => prev.map((it, i) => (i === index ? { ...it, ...patch } : it)));
  };

  const addItem = () => {
    setItems((prev) => [...prev, { categoria: "", epp: "", tallaNumero: "", cantidad: 1 }]);
  };

  const removeItem = (index: number) => {
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  // ─────────────────────────────────────────────
  // Firma: canvas simple
  // ─────────────────────────────────────────────
  const getCanvasPos = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const startDraw = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawingRef.current = true;
    const { x, y } = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  };

  const draw = (e: any) => {
    if (!drawingRef.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    e.preventDefault?.();

    const { x, y } = getCanvasPos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.lineTo(x, y);
    ctx.stroke();
    setFirmado(true);
  };

  const endDraw = () => {
    drawingRef.current = false;
  };

  const clearFirma = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setFirmado(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!trabajadorId) {
      setError("Selecciona un trabajador");
      return;
    }

    if (!trabajadorSeleccionado) {
      setError("Selecciona un trabajador válido");
      return;
    }

    if (!trabajadorSeleccionado.centro_id) {
      setError("El trabajador seleccionado no tiene centro de trabajo asignado");
      return;
    }

    if (!firmado) {
      setError("La entrega debe ser firmada");
      return;
    }

    if (!items.length) {
      setError("Agrega al menos 1 EPP");
      return;
    }

    for (const item of items) {
      if (!item.categoria || !item.epp || !item.tallaNumero || item.cantidad <= 0) {
        setError("Completa correctamente todos los EPP");
        return;
      }
      const disp = stockDisponiblePara(item.categoria, item.epp, item.tallaNumero);
      if (item.cantidad > disp) {
        setError(`Cantidad supera stock disponible (${disp}) para ${item.epp} (${item.tallaNumero}).`);
        return;
      }
    }

    try {
      const { data: authData, error: authError } =
        await supabaseBrowser().auth.getUser();

      if (authError || !authData?.user) {
        setError("No autenticado. Inicia sesión nuevamente.");
        return;
      }

      const { data: usuario, error: usuarioError } = await supabaseBrowser()
        .from("usuarios")
        .select("id, empresa_id")
        .eq("auth_user_id", authData.user.id)
        .maybeSingle();

      if (usuarioError || !usuario) {
        setError("No se pudo identificar el usuario.");
        return;
      }

      const payload = {
        empresa_id: usuario.empresa_id,
        usuario_id: usuario.id,
        trabajador_id: trabajadorId,
        centro_id: trabajadorSeleccionado.centro_id,
        firma_url: canvasRef.current?.toDataURL() || null,
        items: items.map((i) => ({
          categoria: i.categoria,
          nombre_epp: i.epp,
          talla: i.tallaNumero === "No aplica" || i.tallaNumero === "" ? null : i.tallaNumero,
          cantidad: Number(i.cantidad),
        })),
      };

      const resp = await fetch("/api/egresos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // idempotencia simple
          "Idempotency-Key": crypto.randomUUID(),
        },
        body: JSON.stringify(payload),
      });

      const result = await resp.json().catch(() => ({}));

      if (!resp.ok) {
        setError(result.error || "Error al registrar el egreso");
        return;
      }

      alert(
        `Egreso registrado correctamente\n\n` +
          `Unidades entregadas: ${result.total_unidades}\n` +
          `Costo total: $${Number(result.costo_total_iva).toLocaleString("es-CL")}`
      );

      router.push("/dashboard/entregas");
    } catch (err: any) {
      setError(err?.message || "Error inesperado");
    }
  };

  if (loading) {
    return <div className="text-zinc-500">Cargando egreso…</div>;
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Egreso / Entrega de EPP</h1>
        <p className="text-sm text-zinc-500">
          Selecciona un trabajador, agrega uno o más EPP desde el stock y solicita la firma.
        </p>
      </div>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg border bg-white p-4 space-y-2">
          <h2 className="font-medium">1) Trabajador</h2>
          <select
            className="input"
            value={trabajadorId}
            onChange={(e) => setTrabajadorId(e.target.value)}
          >
            <option value="">Selecciona trabajador activo…</option>
            {trabajadores.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre} ({t.rut})
              </option>
            ))}
          </select>
          {trabajadores.length === 0 && (
            <p className="text-xs text-zinc-500">No hay trabajadores activos.</p>
          )}
        </div>

        <div className="rounded-lg border bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">2) EPP a entregar</h2>
            <button
              type="button"
              onClick={addItem}
              className="rounded border px-3 py-1 text-sm"
            >
              + Agregar EPP
            </button>
          </div>

          {items.map((it, idx) => {
            const epps = it.categoria ? (eppsPorCategoria.get(it.categoria) ?? []) : [];
            const tallas = it.categoria && it.epp ? tallasPara(it.categoria, it.epp) : [];
            const disp = it.categoria && it.epp && it.tallaNumero ? stockDisponiblePara(it.categoria, it.epp, it.tallaNumero) : 0;

            return (
              <div key={idx} className="rounded border p-3 space-y-2">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <select
                    className="input"
                    value={it.categoria}
                    onChange={(e) => {
                      updateItem(idx, { categoria: e.target.value, epp: "", tallaNumero: "" });
                    }}
                  >
                    <option value="">Categoría…</option>
                    {categorias.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>

                  <select
                    className="input"
                    value={it.epp}
                    disabled={!it.categoria}
                    onChange={(e) => {
                      updateItem(idx, { epp: e.target.value, tallaNumero: "" });
                    }}
                  >
                    <option value="">EPP…</option>
                    {epps.map((n) => (
                      <option key={n} value={n}>{n}</option>
                    ))}
                  </select>

                  <select
                    className="input"
                    value={it.tallaNumero}
                    disabled={!it.categoria || !it.epp}
                    onChange={(e) => updateItem(idx, { tallaNumero: e.target.value })}
                  >
                    <option value="">Talla/Número…</option>
                    {tallas.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>

                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={it.cantidad}
                    onChange={(e) => updateItem(idx, { cantidad: Number(e.target.value) })}
                    placeholder="Cantidad"
                  />
                </div>

                <div className="flex items-center justify-between text-xs text-zinc-600">
                  <span>Stock disponible: <b>{disp}</b></span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      className="text-red-600 underline"
                    >
                      Quitar
                    </button>
                  )}
                </div>
              </div>
            );
          })}

          {stock.length === 0 && (
            <p className="text-sm text-zinc-500">No hay stock disponible para egresar.</p>
          )}
        </div>

        <div className="rounded-lg border bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">3) Firma del trabajador</h2>
            <button type="button" onClick={clearFirma} className="rounded border px-3 py-1 text-sm">
              Limpiar
            </button>
          </div>

          <div className="rounded border bg-zinc-50 p-2">
            <canvas
              ref={canvasRef}
              width={640}
              height={200}
              className="w-full h-[200px] bg-white rounded"
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
            />
          </div>

          <p className="text-xs text-zinc-500">
            {firmado ? "Firma capturada." : "Debe firmar antes de registrar el egreso."}
          </p>
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-700"
          disabled={stock.length === 0}
        >
          Registrar egreso
        </button>
      </form>
    </div>
  );
}
