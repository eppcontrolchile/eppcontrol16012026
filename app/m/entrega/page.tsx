// app/m/entrega/page.tsx
"use client";

import type React from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Trabajador = {
  id: string;
  nombre: string;
  rut: string;
  activo: boolean;
  centro_id: string | null;
};

type CentroTrabajo = {
  id: string;
  nombre: string;
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

export default function EntregaPage() {

  const [error, setError] = useState<string>("");
  const [successOpen, setSuccessOpen] = useState(false);
  const [successText, setSuccessText] = useState("");
  const [loading, setLoading] = useState(true);

  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [trabajadorId, setTrabajadorId] = useState<string>("");

  const [stock, setStock] = useState<StockRow[]>([]);

  const [items, setItems] = useState<EgresoItemUI[]>([
    { categoria: "", epp: "", tallaNumero: "", cantidad: 1 },
  ]);

  const [submitting, setSubmitting] = useState(false);
  const [usuarioId, setUsuarioId] = useState<string | null>(null);
  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [rol, setRol] = useState<string | null>(null);
  const [centros, setCentros] = useState<CentroTrabajo[]>([]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [firmado, setFirmado] = useState<boolean>(false);
  const lastPosRef = useRef<{ x: number; y: number } | null>(null);
  const pointerIdRef = useRef<number | null>(null);

  const fetchStockSafe = useCallback(async () => {
    const stockResp = await fetch("/api/stock", { cache: "no-store" });
    if (!stockResp.ok) {
      setError("No se pudo cargar el stock.");
      return;
    }

    const stockRaw = await stockResp.json().catch(() => []);
    const mapped: StockRow[] = (Array.isArray(stockRaw) ? stockRaw : []).map((r: any) => ({
      categoria: String(r?.categoria ?? ""),
      nombre: String(r?.nombre ?? ""),
      talla:
        r?.talla == null || String(r.talla).trim() === "" ? null : String(r.talla),
      stock: Number(r?.stock_total ?? r?.stock ?? 0),
    }));

    // Solo lo disponible
    setStock(mapped.filter((s) => s.stock > 0));
  }, []);

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
          .select("id, empresa_id, rol, activo")
          .eq("auth_user_id", authData.user.id)
          .maybeSingle();

        if (usuarioError || !usuario?.empresa_id) {
          setError("No se pudo identificar empresa.");
          setLoading(false);
          return;
        }

        if (!usuario?.activo) {
          setError("Tu usuario está inactivo. Contacta al administrador.");
          setLoading(false);
          return;
        }

        // Roles permitidos para usar la PWA de entregas
        const allowedRoles = new Set(["admin", "supervisor", "entregas"]);
        const userRole = String(usuario?.rol ?? "").toLowerCase();
        if (!allowedRoles.has(userRole)) {
          setError("No tienes permisos para registrar entregas desde esta app.");
          setLoading(false);
          return;
        }

        setUsuarioId(String(usuario.id));
        setEmpresaId(String(usuario.empresa_id));
        setRol(userRole);

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

        // Centros de trabajo activos
        const { data: centrosDB, error: centrosErr } = await supabaseBrowser()
          .from("centros_trabajo")
          .select("id,nombre")
          .eq("empresa_id", usuario.empresa_id)
          .eq("activo", true)
          .order("nombre", { ascending: true });

        if (centrosErr) {
          setError(centrosErr.message);
          setLoading(false);
          return;
        }

        setCentros((centrosDB as any[])?.map((c) => ({ id: c.id, nombre: c.nombre })) ?? []);

        // Stock (desde API server)
        await fetchStockSafe();

        setError("");
        setLoading(false);
      } catch (e: any) {
        setError(e?.message || "Error cargando datos");
        setLoading(false);
      }
    };

    load();
  }, []);

  useEffect(() => {
    const onVis = () => {
      if (document.visibilityState === "visible") {
        fetchStockSafe().catch(() => {});
      }
    };

    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
  }, [fetchStockSafe]);

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

  const centroNombre = useMemo(() => {
    const cid = trabajadorSeleccionado?.centro_id;
    if (!cid) return "—";
    return centros.find((c) => c.id === cid)?.nombre ?? "—";
  }, [centros, trabajadorSeleccionado]);

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
  // Firma: canvas responsive (full area usable) + DPR-safe
  // ─────────────────────────────────────────────
  const resizeCanvasToDisplaySize = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

    const nextW = Math.max(1, Math.round(rect.width * dpr));
    const nextH = Math.max(1, Math.round(rect.height * dpr));

    if (canvas.width !== nextW || canvas.height !== nextH) {
      const ctx = canvas.getContext("2d");
      const prev = ctx ? ctx.getImageData(0, 0, canvas.width, canvas.height) : null;

      canvas.width = nextW;
      canvas.height = nextH;

      if (ctx) {
        // reset + scale to CSS pixels
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.scale(dpr, dpr);
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#111";

        // best-effort restore
        if (prev && prev.width > 0 && prev.height > 0) {
          const tmp = document.createElement("canvas");
          tmp.width = prev.width;
          tmp.height = prev.height;
          const tctx = tmp.getContext("2d");
          if (tctx) {
            tctx.putImageData(prev, 0, 0);
            ctx.drawImage(tmp, 0, 0, rect.width, rect.height);
          }
        }
      }
    } else {
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.lineWidth = 2;
        ctx.lineCap = "round";
        ctx.strokeStyle = "#111";
      }
    }
  };

  useEffect(() => {
    resizeCanvasToDisplaySize();

    const onResize = () => resizeCanvasToDisplaySize();
    window.addEventListener("resize", onResize);

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined" && canvasRef.current) {
      ro = new ResizeObserver(() => resizeCanvasToDisplaySize());
      ro.observe(canvasRef.current);
    }

    return () => {
      window.removeEventListener("resize", onResize);
      if (ro) ro.disconnect();
    };
  }, []);

  const getCanvasPos = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const startDraw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    e.preventDefault();
    resizeCanvasToDisplaySize();

    pointerIdRef.current = e.pointerId;
    try {
      canvas.setPointerCapture(e.pointerId);
    } catch {}

    drawingRef.current = true;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCanvasPos(e);
    lastPosRef.current = { x, y };

    ctx.beginPath();
    ctx.moveTo(x, y);

    if (!firmado) setFirmado(true);
  };

  const draw = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawingRef.current) return;
    if (pointerIdRef.current !== null && e.pointerId !== pointerIdRef.current) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    e.preventDefault();

    const { x, y } = getCanvasPos(e);

    if (!lastPosRef.current) {
      lastPosRef.current = { x, y };
      ctx.beginPath();
      ctx.moveTo(x, y);
    }

    ctx.lineTo(x, y);
    ctx.stroke();

    lastPosRef.current = { x, y };
  };

  const endDraw = () => {
    const canvas = canvasRef.current;
    try {
      if (canvas && pointerIdRef.current !== null) {
        canvas.releasePointerCapture(pointerIdRef.current);
      }
    } catch {}

    drawingRef.current = false;
    lastPosRef.current = null;
    pointerIdRef.current = null;
  };

  const clearFirma = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.clearRect(0, 0, rect.width, rect.height);

    setFirmado(false);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessOpen(false);
    setSuccessText("");
    setError("");

    if (submitting) return;

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
      if (!usuarioId || !empresaId) {
        setError("No se pudo identificar tu empresa/usuario.");
        return;
      }

      setSubmitting(true);
      const payload = {
        empresa_id: empresaId,
        usuario_id: usuarioId,
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

      // PWA: no navegar a dashboard. Limpiar formulario y mostrar confirmación.
      const totalUnidades = Number(result.total_unidades ?? 0);
      const costoTotal = Number(result.costo_total_iva ?? 0);
      setSuccessText(
        `Entrega registrada ✅\n\nUnidades: ${totalUnidades.toLocaleString("es-CL")}\nTotal: $${costoTotal.toLocaleString("es-CL")}`
      );
      setSuccessOpen(true);

      await fetchStockSafe();

      setTrabajadorId("");
      setItems([{ categoria: "", epp: "", tallaNumero: "", cantidad: 1 }]);
      clearFirma();
    } catch (err: any) {
      setError(err?.message || "Error inesperado");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <div className="text-zinc-500">Cargando entrega…</div>;
  }

  return (
    <div className="mx-auto max-w-md space-y-6 px-4 py-4">
      <div>
        <h1 className="text-2xl font-semibold">Entrega de EPP</h1>
        <p className="text-sm text-zinc-500">
          Selecciona trabajador, confirma EPP desde stock, firma y registra.
        </p>
      </div>

      <SuccessModal
        open={successOpen}
        text={successText}
        onClose={() => setSuccessOpen(false)}
      />

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="rounded-lg border bg-white p-4 space-y-2">
          <h2 className="font-medium">1) Trabajador</h2>
          <select
            className="input h-12 text-base"
            value={trabajadorId}
            onChange={(e) => { setTrabajadorId(e.target.value); setSuccessOpen(false); setSuccessText(""); }}
          >
            <option value="">Selecciona trabajador activo…</option>
            {trabajadores.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nombre} ({t.rut})
              </option>
            ))}
          </select>
          <div className="mt-2 text-sm text-zinc-600">
            <span className="text-zinc-500">Centro:</span> <span className="font-medium text-zinc-900">{centroNombre}</span>
          </div>
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
                    className="input h-12 text-base"
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
                    className="input h-12 text-base"
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
                    className="input h-12 text-base"
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
                    className="input h-12 text-base text-center"
                    type="number"
                    min={1}
                    max={Math.max(1, disp)}
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
            <p className="text-sm text-zinc-600">
              No hay stock disponible para registrar entregas.
              <span className="block text-xs text-zinc-500">Debes ingresar EPP primero.</span>
            </p>
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
              className="w-full h-[200px] bg-white rounded"
              style={{ touchAction: "none" }}
              onPointerDown={startDraw}
              onPointerMove={draw}
              onPointerUp={endDraw}
              onPointerCancel={endDraw}
              onPointerLeave={endDraw}
            />
          </div>

          <p className="text-xs text-zinc-500">
            {firmado ? "Firma capturada." : "Falta la firma: sin firma no se puede registrar la entrega."}
          </p>
        </div>

        <div className="sticky bottom-0 -mx-4 bg-zinc-50/90 px-4 py-4 backdrop-blur">
          <button
            type="submit"
            className="w-full rounded-xl bg-sky-600 py-4 text-base font-semibold text-white shadow hover:bg-sky-700 disabled:opacity-50"
            disabled={submitting || stock.length === 0 || !trabajadorId || !firmado || !items.length}
          >
            {submitting ? "Registrando…" : "Registrar entrega"}
          </button>
        </div>
      </form>
    </div>
  );
}



function SuccessModal({
  open,
  text,
  onClose,
}: {
  open: boolean;
  text: string;
  onClose: () => void;
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-md rounded-xl bg-white p-4 shadow-xl">
        <h3 className="text-lg font-semibold">Entrega registrada</h3>
        <pre className="mt-2 whitespace-pre-wrap text-sm text-zinc-700">{text}</pre>

        <div className="mt-4 flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}
