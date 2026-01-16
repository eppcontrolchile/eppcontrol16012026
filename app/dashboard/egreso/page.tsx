// app/dashboard/egreso/page.tsx
"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { getStockDesdeFIFO, consumirFIFO } from "@/app/utils/fifo";

type Trabajador = {
  id: string;
  nombre: string;
  rut: string;
  centro: string;
  activo: boolean;
};

type EgresoItem = {
  categoria: string;
  epp: string;
  tallaNumero: string;
  cantidad: number;
  costoTotal: number; // IVA incluido (FIFO)
};

export default function EgresoPage() {
  const router = useRouter();

  const [trabajadores, setTrabajadores] = useState<Trabajador[]>([]);
  const [stock, setStock] = useState<any[]>([]);
  const [items, setItems] = useState<EgresoItem[]>([
    { categoria: "", epp: "", tallaNumero: "", cantidad: 1, costoTotal: 0 },
  ]);

  const [trabajadorId, setTrabajadorId] = useState("");
  const [error, setError] = useState("");

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [firmado, setFirmado] = useState(false);

  /* MOCK DATA */
  useEffect(() => {
    setTrabajadores([
      { id: "1", nombre: "Juan Pérez", rut: "12.345.678-9", centro: "Planta Norte", activo: true },
      { id: "2", nombre: "Ana Soto", rut: "9.876.543-2", centro: "Sucursal Sur", activo: false },
    ]);
  }, []);

  useEffect(() => {
    setStock(getStockDesdeFIFO());
  }, []);

  /* FIRMA */
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    let drawing = false;

    const start = (e: MouseEvent) => {
      drawing = true;
      ctx.beginPath();
      ctx.moveTo(e.offsetX, e.offsetY);
    };

    const draw = (e: MouseEvent) => {
      if (!drawing) return;
      ctx.lineTo(e.offsetX, e.offsetY);
      ctx.stroke();
      setFirmado(true);
    };

    const end = () => (drawing = false);

    canvas.addEventListener("mousedown", start);
    canvas.addEventListener("mousemove", draw);
    canvas.addEventListener("mouseup", end);

    return () => {
      canvas.removeEventListener("mousedown", start);
      canvas.removeEventListener("mousemove", draw);
      canvas.removeEventListener("mouseup", end);
    };
  }, []);

  const limpiarFirma = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setFirmado(false);
    }
  };

  const updateItem = (index: number, field: keyof EgresoItem, value: any) => {
    const updated = [...items];
    updated[index] = { ...updated[index], [field]: value };
    setItems(updated);
  };

  const addItem = () => {
    setItems([...items, { categoria: "", epp: "", tallaNumero: "", cantidad: 1, costoTotal: 0 }]);
  };

  const removeItem = (index: number) => {
    setItems(items.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const companyRut = localStorage.getItem("companyRut");

    if (!companyRut) {
      setError(
        "Debes completar el RUT de la empresa en Configuración antes de registrar un egreso"
      );
      return;
    }

    if (!trabajadorId) {
      setError("Selecciona un trabajador");
      return;
    }

    if (!firmado) {
      setError("La entrega debe ser firmada");
      return;
    }

    const itemResultados: EgresoItem[] = [];

    for (const item of items) {
      if (!item.categoria || !item.epp || !item.tallaNumero || item.cantidad <= 0) {
        setError("Completa correctamente todos los EPP");
        return;
      }

      try {
        const resultado = consumirFIFO({
          categoria: item.categoria,
          nombreEpp: item.epp,
          talla:
            item.tallaNumero === "No aplica"
              ? null
              : item.tallaNumero,
          cantidad: item.cantidad,
        });

        itemResultados.push({
          ...item,
          costoTotal: resultado.costoTotal,
        });
      } catch (err: any) {
        setError(err.message);
        return;
      }
    }

    const costoTotalEgreso = itemResultados.reduce(
      (sum, i) => sum + i.costoTotal,
      0
    );

    const firmaBase64 = canvasRef.current?.toDataURL();

    const trabajador = trabajadores.find(t => t.id === trabajadorId);

    const nuevoEgreso = {
      id: crypto.randomUUID(),
      fecha: new Date().toISOString(),
      trabajador,
      items: itemResultados,
      costoTotalEgreso,
      firmaBase64,
    };

    const egresosPrevios = JSON.parse(
      localStorage.getItem("egresos") || "[]"
    );

    localStorage.setItem(
      "egresos",
      JSON.stringify([...egresosPrevios, nuevoEgreso])
    );

    setStock(getStockDesdeFIFO());

    alert("Egreso registrado correctamente");

    router.push("/dashboard/entregas");
  };

  const categoriasDisponibles = Array.from(
    new Set(
      stock
        .filter((s) => s.cantidad > 0)
        .map((s) => s.categoria)
    )
  );

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">Egreso de EPP</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <select
          value={trabajadorId}
          onChange={(e) => setTrabajadorId(e.target.value)}
          className="input"
        >
          <option value="">Trabajador</option>
          {trabajadores.filter(t => t.activo !== false).map(t => (
            <option key={t.id} value={t.id}>
              {t.nombre} · {t.rut}
            </option>
          ))}
        </select>

        {items.map((item, index) => {
          const eppsDisponibles = stock
            .filter(
              (s) =>
                s.categoria === item.categoria &&
                s.cantidad > 0
            )
            .map((s) => s.nombreEpp)
            .filter((v, i, a) => a.indexOf(v) === i);

          const tallasDisponibles = stock.filter(
            (s) =>
              s.categoria === item.categoria &&
              s.nombreEpp === item.epp &&
              s.cantidad > 0
          );

          const stockVariante =
            stock.find(
              (s) =>
                s.categoria === item.categoria &&
                s.nombreEpp === item.epp &&
                s.talla === (item.tallaNumero === "No aplica" ? null : item.tallaNumero)
            )?.cantidad ?? 0;

          return (
            <div key={index} className="rounded border p-3 space-y-2">
              <select
                value={item.categoria || ""}
                onChange={(e) => {
                  const nuevaCategoria = e.target.value;

                  setItems((prev) =>
                    prev.map((it, i) =>
                      i === index
                        ? {
                            ...it,
                            categoria: nuevaCategoria,
                            epp: "",
                            tallaNumero: "",
                          }
                        : it
                    )
                  );
                }}
                className="input"
              >
                <option value="">Categoría de protección</option>
                {categoriasDisponibles.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>

              <select
                value={item.epp || ""}
                onChange={(e) => {
                  const nuevoEpp = e.target.value;

                  setItems((prev) =>
                    prev.map((it, i) =>
                      i === index
                        ? {
                            ...it,
                            epp: nuevoEpp,
                            tallaNumero: "",
                          }
                        : it
                    )
                  );
                }}
                className="input"
                disabled={!item.categoria}
              >
                <option value="">EPP</option>
                {eppsDisponibles.map((epp) => (
                  <option key={epp} value={epp}>
                    {epp}
                  </option>
                ))}
              </select>

              <select
                value={item.tallaNumero}
                onChange={(e) => updateItem(index, "tallaNumero", e.target.value)}
                className="input"
                disabled={!item.epp}
              >
                <option value="">Talla / Número</option>
                {tallasDisponibles.map((t) => (
                  <option
                    key={t.id}
                    value={t.talla ?? "No aplica"}
                  >
                    {t.talla ?? "No aplica"} (stock {t.cantidad})
                  </option>
                ))}
              </select>

              {item.epp && tallasDisponibles.length === 0 && (
                <p className="text-xs text-red-600">
                  No hay stock disponible para este EPP
                </p>
              )}

              <input
                type="number"
                min={1}
                max={stockVariante}
                value={item.cantidad}
                onChange={(e) =>
                  updateItem(index, "cantidad", Number(e.target.value))
                }
                className="input"
                placeholder="Cantidad"
                disabled={!item.tallaNumero}
              />

              {items.length > 1 && (
                <button
                  type="button"
                  onClick={() => removeItem(index)}
                  className="text-sm text-red-600 underline"
                >
                  Quitar EPP
                </button>
              )}
            </div>
          );
        })}

        <button
          type="button"
          onClick={addItem}
          className="text-sm underline"
        >
          ➕ Agregar otro EPP
        </button>

        <div>
          <p className="text-sm font-medium mb-1">Firma del trabajador</p>
          <canvas
            ref={canvasRef}
            width={450}
            height={160}
            className="border rounded bg-white"
          />
          <button
            type="button"
            onClick={limpiarFirma}
            className="mt-2 text-sm underline"
          >
            Limpiar firma
          </button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-700"
        >
          Registrar egreso
        </button>
      </form>
    </div>
  );
}
