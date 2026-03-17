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
  producto_id: string;
  categoria: string;
  nombre: string;
  marca?: string | null;
  modelo?: string | null;
  talla: string | null;
  stock: number;
  origen_tipo: "global" | "centro";
  origen_centro_id: string | null;
  origen_label: string;
};

type EgresoItemUI = {
  categoria: string;
  producto_id: string;
  eppKey: string;
  eppLabel: string;
  nombre_epp: string;
  marca?: string | null;
  modelo?: string | null;
  tallaNumero: string;
  cantidad: number;
};

function formatMarcaModelo(marca?: string | null, modelo?: string | null) {
  return [marca, modelo].filter(Boolean).join(" - ");
}

function buildEppKey(
  nombre: string,
  marca?: string | null,
  modelo?: string | null
) {
  return [nombre ?? "", marca ?? "", modelo ?? ""].join("||");
}

function parseEppKey(key: string) {
  const [nombre, marca, modelo] = String(key ?? "").split("||");
  return {
    nombre: (nombre ?? "").trim(),
    marca: (marca ?? "").trim() || null,
    modelo: (modelo ?? "").trim() || null,
  };
}

function splitNombreMarcaModelo(
  rawNombre: string,
  rawMarca?: any,
  rawModelo?: any
) {
  const nombre0 = String(rawNombre ?? "").trim();

  const marca0 =
    rawMarca == null || String(rawMarca).trim() === ""
      ? null
      : String(rawMarca).trim();
  const modelo0 =
    rawModelo == null || String(rawModelo).trim() === ""
      ? null
      : String(rawModelo).trim();

  if (marca0 || modelo0) {
    return { nombre: nombre0, marca: marca0, modelo: modelo0 };
  }

  const m = /^(.+?)\s*\((.+?)\)\s*$/.exec(nombre0);
  if (m) {
    const nombre = String(m[1] ?? "").trim();
    const inner = String(m[2] ?? "").trim();
    const parts = inner
      .split("-")
      .map((p) => p.trim())
      .filter(Boolean);
    const marca = parts[0] ?? null;
    const modelo = parts.length > 1 ? parts.slice(1).join(" - ") : null;
    return { nombre, marca, modelo };
  }

  return { nombre: nombre0, marca: null, modelo: null };
}

export default function EgresoPage() {
  const router = useRouter();

  const [error, setError] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [trabajadorId, setTrabajadorId] = useState<string>("");

  const [stock, setStock] = useState<StockRow[]>([]);
  const [centrosFuente, setCentrosFuente] = useState<Array<{ id: string; nombre: string }>>([]);
  const [sourceMode, setSourceMode] = useState<"global" | "centro">("global");
  const [sourceCentroId, setSourceCentroId] = useState<string>("");

  const [myRole, setMyRole] = useState<string>("");
  const [myCentroId, setMyCentroId] = useState<string | null>(null);

  const [items, setItems] = useState<EgresoItemUI[]>([
    {
      categoria: "",
      producto_id: "",
      eppKey: "",
      eppLabel: "",
      nombre_epp: "",
      marca: null,
      modelo: null,
      tallaNumero: "",
      cantidad: 1,
    },
  ]);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const [firmado, setFirmado] = useState<boolean>(false);
  const itemRefs = useRef<Array<HTMLDivElement | null>>([]);
  const shouldScrollToNewItemRef = useRef(false);

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
          .select("empresa_id, rol, centro_id")
          .eq("auth_user_id", authData.user.id)
          .maybeSingle();

        if (usuarioError || !usuario?.empresa_id) {
          setError("No se pudo identificar empresa.");
          setLoading(false);
          return;
        }

        const rol = String((usuario as any)?.rol ?? "")
          .trim()
          .toLowerCase();
        const myCentro = (usuario as any)?.centro_id
          ? String((usuario as any).centro_id)
          : null;

        setMyRole(rol);
        setMyCentroId(myCentro);

        if (rol === "admin" || rol === "jefe_area") {
          const { data: centrosData, error: centrosErr } = await supabaseBrowser()
            .from("centros_trabajo")
            .select("id,nombre")
            .eq("empresa_id", usuario.empresa_id)
            .order("nombre", { ascending: true });

          if (centrosErr) {
            setError(centrosErr.message);
            setLoading(false);
            return;
          }

          setCentrosFuente(
            ((centrosData as any[]) ?? []).map((c) => ({
              id: String(c.id),
              nombre: String(c.nombre ?? ""),
            }))
          );
        } else {
          setCentrosFuente([]);
          setSourceMode("global");
          setSourceCentroId("");
        }

        let trabQuery = supabaseBrowser()
          .from("trabajadores")
          .select("id,nombre,rut,activo,centro_id")
          .eq("empresa_id", usuario.empresa_id)
          .eq("activo", true)
          .order("nombre", { ascending: true });

        if (rol === "supervisor_terreno") {
          if (!myCentro) {
            setError("Supervisor sin centro asignado.");
            setLoading(false);
            return;
          }
          trabQuery = trabQuery.eq("centro_id", myCentro);
        }

        const { data: trabs, error: trabErr } = await trabQuery;

        if (trabErr) {
          setError(trabErr.message);
          setLoading(false);
          return;
        }

        setTrabajadores(
          (trabs as any[])?.map((t) => ({
            id: t.id,
            nombre: t.nombre,
            rut: t.rut,
            activo: t.activo,
            centro_id: t.centro_id ?? null,
          })) ?? []
        );

        let mapped: StockRow[] = [];

        if (rol === "supervisor_terreno") {
          if (!myCentro) {
            setError("Supervisor sin centro asignado.");
            setLoading(false);
            return;
          }

          const { data: lotes, error: lotesErr } = await supabaseBrowser()
            .from("lotes_epp")
            .select(
              "producto_id,categoria,nombre_epp,talla,marca,modelo,cantidad_disponible,ubicacion_tipo,centro_id"
            )
            .eq("empresa_id", usuario.empresa_id)
            .eq("anulado", false)
            .eq("ubicacion_tipo", "centro")
            .eq("centro_id", myCentro)
            .gt("cantidad_disponible", 0);

          if (lotesErr) {
            setError(lotesErr.message);
            setLoading(false);
            return;
          }

          const agg = new Map<string, StockRow>();
          for (const r of (lotes as any[]) ?? []) {
            const categoria = String(r?.categoria ?? "");
            const nombre = String(r?.nombre_epp ?? "");
            const marca =
              r?.marca == null || String(r.marca).trim() === ""
                ? null
                : String(r.marca).trim();
            const modelo =
              r?.modelo == null || String(r.modelo).trim() === ""
                ? null
                : String(r.modelo).trim();
            const talla =
              r?.talla == null || String(r.talla).trim() === ""
                ? null
                : String(r.talla).trim();
            const qty = Number(r?.cantidad_disponible ?? 0);
            if (!Number.isFinite(qty) || qty <= 0) continue;

            const key = `${categoria}||${nombre}||${marca ?? ""}||${modelo ?? ""}||${talla ?? ""}`;
            const prev = agg.get(key);
            if (!prev) {
              agg.set(key, {
                producto_id: String(r?.producto_id ?? ""),
                categoria,
                nombre,
                marca,
                modelo,
                talla,
                stock: qty,
                origen_tipo: "centro",
                origen_centro_id: myCentro,
                origen_label: "Centro de trabajo",
              });
            } else {
              prev.stock += qty;
            }
          }

          mapped = Array.from(agg.values());
        } else {
          const scope =
            sourceMode === "centro" && sourceCentroId
              ? `centros&centro_id=${encodeURIComponent(sourceCentroId)}`
              : "global";

          const stockResp = await fetch(`/api/stock?scope=${scope}`, {
            cache: "no-store",
          });
          if (!stockResp.ok) {
            setError("No se pudo cargar el stock.");
            setLoading(false);
            return;
          }

          const stockRaw = await stockResp.json().catch(() => []);
          mapped = (Array.isArray(stockRaw) ? stockRaw : []).map((r: any) => {
            const marca =
              r?.marca ??
              r?.marca_epp ??
              r?.epp_marca ??
              r?.brand ??
              r?.Brand ??
              null;

            const modelo =
              r?.modelo ??
              r?.modelo_epp ??
              r?.epp_modelo ??
              r?.model ??
              r?.Model ??
              null;

            const nombreRaw = String(
              r?.nombre ?? r?.nombre_epp ?? r?.nombreEpp ?? ""
            );
            const parsed = splitNombreMarcaModelo(nombreRaw, marca, modelo);

            return {
              producto_id: String(r?.producto_id ?? ""),
              categoria: String(r?.categoria ?? ""),
              nombre: parsed.nombre,
              marca: parsed.marca,
              modelo: parsed.modelo,
              talla:
                r?.talla == null || String(r.talla).trim() === ""
                  ? null
                  : String(r.talla),
              stock: Number(r?.stock_total ?? r?.stock ?? 0),
              origen_tipo:
                r?.centro_id != null && String(r.centro_id).trim() !== ""
                  ? "centro"
                  : "global",
              origen_centro_id:
                r?.centro_id != null && String(r.centro_id).trim() !== ""
                  ? String(r.centro_id)
                  : null,
              origen_label:
                r?.centro_nombre != null && String(r.centro_nombre).trim() !== ""
                  ? String(r.centro_nombre)
                  : "Bodega empresa",
            } as StockRow;
          });
        }

        setStock(mapped.filter((s) => s.stock > 0));
        setError("");
        setLoading(false);
      } catch (e: any) {
        setError(e?.message || "Error cargando datos");
        setLoading(false);
      }
    };

    load();
  }, [sourceMode, sourceCentroId]);

  const categorias = useMemo(() => {
    return Array.from(new Set(stock.map((s) => s.categoria))).sort((a, b) =>
      a.localeCompare(b)
    );
  }, [stock]);

  const eppsPorCategoria = useMemo(() => {
    const map = new Map<
      string,
      {
        key: string;
        producto_id: string;
        nombre: string;
        marca: string | null;
        modelo: string | null;
        label: string;
      }[]
    >();

    for (const s of stock) {
      if (!map.has(s.categoria)) map.set(s.categoria, []);
      const arr = map.get(s.categoria)!;

      const mm = formatMarcaModelo(s.marca, s.modelo);
      const label = mm ? `${s.nombre} (${mm})` : s.nombre;
      const key = buildEppKey(s.nombre, s.marca ?? null, s.modelo ?? null);

      if (!arr.some((x) => x.key === key)) {
        arr.push({
          key,
          producto_id: s.producto_id,
          nombre: s.nombre,
          marca: s.marca ?? null,
          modelo: s.modelo ?? null,
          label,
        });
      }
    }

    for (const [k, arr] of map.entries()) {
      map.set(
        k,
        arr.sort((a, b) =>
          a.label.localeCompare(b.label, undefined, { sensitivity: "base" })
        )
      );
    }

    return map;
  }, [stock]);

  const tallasPara = (categoria: string, eppKey: string) => {
    const { nombre, marca, modelo } = parseEppKey(eppKey);
    const rows = stock.filter(
      (s) =>
        s.categoria === categoria &&
        s.nombre === nombre &&
        (s.marca ?? null) === (marca ?? null) &&
        (s.modelo ?? null) === (modelo ?? null)
    );
    const tallas = rows.map((r) => r.talla ?? "No aplica");
    return Array.from(new Set(tallas)).sort((a, b) => a.localeCompare(b));
  };

  const stockDisponiblePara = (
    categoria: string,
    eppKey: string,
    tallaNumero: string
  ) => {
    const { nombre, marca, modelo } = parseEppKey(eppKey);
    const tallaKey = !tallaNumero || tallaNumero === "No aplica" ? null : tallaNumero;
    const row = stock.find(
      (s) =>
        s.categoria === categoria &&
        s.nombre === nombre &&
        (s.marca ?? null) === (marca ?? null) &&
        (s.modelo ?? null) === (modelo ?? null) &&
        (s.talla ?? null) === tallaKey
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
    if (submitting) return;

    shouldScrollToNewItemRef.current = true;

    setItems((prev) => [
      ...prev,
      {
        categoria: "",
        producto_id: "",
        eppKey: "",
        eppLabel: "",
        nombre_epp: "",
        marca: null,
        modelo: null,
        tallaNumero: "",
        cantidad: 1,
      },
    ]);
  };

  const removeItem = (index: number) => {
    if (submitting) return;
    setItems((prev) => prev.filter((_, i) => i !== index));
  };

  useEffect(() => {
    if (!shouldScrollToNewItemRef.current) return;
    if (!items.length) return;

    const lastIndex = items.length - 1;
    const node = itemRefs.current[lastIndex];
    if (!node) return;

    shouldScrollToNewItemRef.current = false;

    requestAnimationFrame(() => {
      node.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    });
  }, [items]);

  useEffect(() => {
    const resizeCanvas = () => {
      const canvas = canvasRef.current;
      if (!canvas) return;

      const rect = canvas.getBoundingClientRect();
      const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;

      const nextW = Math.max(1, Math.round(rect.width * dpr));
      const nextH = Math.max(1, Math.round(rect.height * dpr));

      if (canvas.width !== nextW || canvas.height !== nextH) {
        canvas.width = nextW;
        canvas.height = nextH;
      }
    };

    resizeCanvas();
    window.addEventListener("resize", resizeCanvas);
    return () => window.removeEventListener("resize", resizeCanvas);
  }, []);

  const getCanvasPos = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };

    const rect = canvas.getBoundingClientRect();
    const clientX = e.touches?.[0]?.clientX ?? e.clientX;
    const clientY = e.touches?.[0]?.clientY ?? e.clientY;

    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;

    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top) * scaleY,
    };
  };

  const startDraw = (e: any) => {
    const canvas = canvasRef.current;
    if (!canvas || submitting) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    drawingRef.current = true;
    const { x, y } = getCanvasPos(e);
    ctx.beginPath();
    ctx.moveTo(x, y);

    if (!firmado) setFirmado(true);
  };

  const draw = (e: any) => {
    if (!drawingRef.current || submitting) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    e.preventDefault?.();

    const { x, y } = getCanvasPos(e);
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width ? canvas.width / rect.width : 1;
    ctx.lineWidth = 2 * scale;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#111";
    ctx.lineTo(x, y);
    ctx.stroke();
  };

  const endDraw = () => {
    drawingRef.current = false;
  };

  const clearFirma = () => {
    if (submitting) return;

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

    if (myRole === "supervisor_terreno") {
      if (!myCentroId) {
        setError("Supervisor sin centro asignado");
        return;
      }
      if (String(trabajadorSeleccionado.centro_id) !== String(myCentroId)) {
        setError("Como supervisor, solo puedes entregar a trabajadores de tu centro de trabajo.");
        return;
      }
    }

    if ((myRole === "admin" || myRole === "jefe_area") && sourceMode === "centro") {
      if (!sourceCentroId) {
        setError("Debes seleccionar el centro desde donde se descontará el stock.");
        return;
      }

      if (String(trabajadorSeleccionado.centro_id) !== String(sourceCentroId)) {
        setError("El trabajador debe pertenecer al centro desde donde se descontará el stock.");
        return;
      }
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
      if (
        !item.categoria ||
        !item.producto_id ||
        !item.eppKey ||
        !item.tallaNumero ||
        item.cantidad <= 0
      ) {
        setError("Completa correctamente todos los EPP");
        return;
      }

      const disp = stockDisponiblePara(item.categoria, item.eppKey, item.tallaNumero);
      if (item.cantidad > disp) {
        const show = item.eppLabel || item.nombre_epp || "EPP";
        setError(
          `Cantidad supera stock disponible (${disp}) para ${show} (${item.tallaNumero}).`
        );
        return;
      }
    }

    try {
      setSubmitting(true);

      const { data: authData, error: authError } =
        await supabaseBrowser().auth.getUser();

      if (authError || !authData?.user) {
        setError("No autenticado. Inicia sesión nuevamente.");
        return;
      }

      const { data: usuario, error: usuarioError } = await supabaseBrowser()
        .from("usuarios")
        .select("id, empresa_id, rol, centro_id")
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
        from_centro_id:
          myRole === "admin" || myRole === "jefe_area"
            ? sourceMode === "centro"
              ? sourceCentroId
              : null
            : null,
        firma_url: canvasRef.current?.toDataURL() || null,
        items: items.map((i) => ({
          producto_id: i.producto_id,
          cantidad: Number(i.cantidad),
          categoria: i.categoria,
          nombre_epp: i.nombre_epp,
          marca: i.marca ?? null,
          modelo: i.modelo ?? null,
          talla:
            i.tallaNumero === "No aplica" || i.tallaNumero === ""
              ? null
              : i.tallaNumero,
        })),
      };

      const resp = await fetch("/api/egresos", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
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
    } finally {
      setSubmitting(false);
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
            disabled={submitting}
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

        {(myRole === "admin" || myRole === "jefe_area") && (
          <div className="rounded-lg border bg-white p-4 space-y-3">
            <h2 className="font-medium">2) Origen del stock</h2>

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                disabled={submitting}
                onClick={() => {
                  setSourceMode("global");
                  setSourceCentroId("");
                }}
                className={
                  sourceMode === "global"
                    ? "rounded border border-sky-600 bg-sky-50 px-3 py-2 text-left text-sm font-medium text-sky-700"
                    : "rounded border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                }
              >
                Bodega empresa (stock global)
              </button>

              <button
                type="button"
                disabled={submitting}
                onClick={() => setSourceMode("centro")}
                className={
                  sourceMode === "centro"
                    ? "rounded border border-sky-600 bg-sky-50 px-3 py-2 text-left text-sm font-medium text-sky-700"
                    : "rounded border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50 disabled:cursor-not-allowed disabled:opacity-60"
                }
              >
                Stock asignado a un centro
              </button>
            </div>

            {sourceMode === "centro" && (
              <div>
                <label className="mb-1 block text-xs text-zinc-500">
                  Centro desde donde se descontará el stock
                </label>
                <select
                  className="input"
                  value={sourceCentroId}
                  disabled={submitting}
                  onChange={(e) => setSourceCentroId(e.target.value)}
                >
                  <option value="">Selecciona centro…</option>
                  {centrosFuente.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nombre}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        )}

        <div className="rounded-lg border bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="font-medium">
              {(myRole === "admin" || myRole === "jefe_area") ? "3) EPP a entregar" : "2) EPP a entregar"}
            </h2>
            <button
              type="button"
              onClick={addItem}
              disabled={submitting}
              className="rounded border px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              + Agregar EPP
            </button>
          </div>

          {items.map((it, idx) => {
            const epps = it.categoria ? eppsPorCategoria.get(it.categoria) ?? [] : [];
            const tallas =
              it.categoria && it.eppKey ? tallasPara(it.categoria, it.eppKey) : [];
            const disp =
              it.categoria && it.eppKey && it.tallaNumero
                ? stockDisponiblePara(it.categoria, it.eppKey, it.tallaNumero)
                : 0;

            return (
              <div
                key={idx}
                ref={(el) => {
                  itemRefs.current[idx] = el;
                }}
                className="rounded border p-3 space-y-2"
              >
                <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
                  <select
                    className="input"
                    value={it.categoria}
                    disabled={submitting}
                    onChange={(e) => {
                      updateItem(idx, {
                        categoria: e.target.value,
                        producto_id: "",
                        eppKey: "",
                        eppLabel: "",
                        nombre_epp: "",
                        marca: null,
                        modelo: null,
                        tallaNumero: "",
                      });
                    }}
                  >
                    <option value="">Categoría…</option>
                    {categorias.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>

                  <select
                    className="input"
                    value={it.eppKey}
                    disabled={!it.categoria || submitting}
                    onChange={(e) => {
                      const nextKey = e.target.value;
                      const meta = parseEppKey(nextKey);
                      const opt = epps.find((o) => o.key === nextKey);

                      updateItem(idx, {
                        producto_id: opt?.producto_id ?? "",
                        eppKey: nextKey,
                        eppLabel: opt?.label ?? meta.nombre,
                        nombre_epp: meta.nombre,
                        marca: meta.marca,
                        modelo: meta.modelo,
                        tallaNumero: "",
                      });
                    }}
                  >
                    <option value="">EPP…</option>
                    {epps.map((opt) => (
                      <option key={opt.key} value={opt.key}>
                        {opt.label}
                      </option>
                    ))}
                  </select>

                  <select
                    className="input"
                    value={it.tallaNumero}
                    disabled={!it.categoria || !it.eppKey || submitting}
                    onChange={(e) => updateItem(idx, { tallaNumero: e.target.value })}
                  >
                    <option value="">Talla/Número…</option>
                    {tallas.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>

                  <input
                    className="input"
                    type="number"
                    min={1}
                    value={it.cantidad}
                    disabled={submitting}
                    onChange={(e) => updateItem(idx, { cantidad: Number(e.target.value) })}
                    placeholder="Cantidad"
                  />
                </div>

                {(it.marca || it.modelo) && (
                  <div className="text-xs text-zinc-600">
                    Marca/Modelo: <b>{formatMarcaModelo(it.marca, it.modelo)}</b>
                  </div>
                )}

                <div className="flex items-center justify-between text-xs text-zinc-600">
                  <span>
                    Stock disponible: <b>{disp}</b>
                    {it.producto_id
                      ? (() => {
                          const stockRow = stock.find(
                            (s) => s.producto_id === it.producto_id && (s.talla ?? "No aplica") === (it.tallaNumero || "No aplica")
                          );
                          return stockRow ? ` · Origen: ${stockRow.origen_label}` : "";
                        })()
                      : ""}
                  </span>
                  {items.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeItem(idx)}
                      disabled={submitting}
                      className="text-red-600 underline disabled:cursor-not-allowed disabled:opacity-60"
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
            <h2 className="font-medium">
              {(myRole === "admin" || myRole === "jefe_area") ? "4) Firma del trabajador" : "3) Firma del trabajador"}
            </h2>
            <button
              type="button"
              onClick={clearFirma}
              disabled={submitting}
              className="rounded border px-3 py-1 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              Limpiar
            </button>
          </div>

          <div className="rounded border bg-zinc-50 p-2">
            <canvas
              ref={canvasRef}
              width={640}
              height={200}
              className="w-full h-[200px] bg-white rounded"
              style={{ touchAction: "none" }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={endDraw}
              onMouseLeave={endDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={endDraw}
              onTouchCancel={endDraw}
            />
          </div>

          <p className="text-xs text-zinc-500">
            {firmado ? "Firma capturada." : "Debe firmar antes de registrar el egreso."}
          </p>
        </div>

        <button
          type="submit"
          disabled={stock.length === 0 || submitting}
          className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-700 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {submitting ? "Registrando egreso..." : "Registrar egreso"}
        </button>
      </form>
    </div>
  );
}
