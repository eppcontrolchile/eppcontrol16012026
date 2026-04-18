//app/m/mover-stock/page.tsx

"use client";

import { useEffect, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Centro = {
  id: string;
  nombre: string;
};

export default function MoverStockMobile() {
  const [centros, setCentros] = useState<Centro[]>([]);
  const [fromCentro, setFromCentro] = useState<string | null>(null);
  const [toCentro, setToCentro] = useState<string | null>(null);

  const [categoria, setCategoria] = useState("");
  const [nombre, setNombre] = useState("");
  const [talla, setTalla] = useState<string | null>(null);
  const [cantidad, setCantidad] = useState(1);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  useEffect(() => {
    const load = async () => {
      const { data } = await supabaseBrowser()
        .from("centros_trabajo")
        .select("id,nombre")
        .eq("activo", true)
        .order("nombre", { ascending: true });

      setCentros(
        (data ?? []).map((c: any) => ({
          id: c.id,
          nombre: c.nombre,
        }))
      );
    };

    load();
  }, []);

  const handleSubmit = async () => {
    setError(null);
    setOk(null);

    if (!categoria || !nombre || cantidad <= 0) {
      setError("Completa los campos obligatorios");
      return;
    }

    if ((fromCentro ?? null) === (toCentro ?? null)) {
      setError("Origen y destino no pueden ser iguales");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch("/api/stock/traspaso", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          from_centro_id: fromCentro,
          to_centro_id: toCentro,
          categoria,
          nombre_epp: nombre,
          talla,
          cantidad,
        }),
      });

      const j = await res.json();

      if (!res.ok || !j?.ok) {
        throw new Error(j?.reason || "Error moviendo stock");
      }

      setOk("Movimiento realizado correctamente");

      // reset
      setCategoria("");
      setNombre("");
      setTalla(null);
      setCantidad(1);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Mover stock</h1>

      {error && (
        <div className="text-red-600 text-sm">{error}</div>
      )}

      {ok && (
        <div className="text-green-600 text-sm">{ok}</div>
      )}

      <div className="space-y-2">
        <label className="text-sm">Desde</label>
        <select
          className="input"
          value={fromCentro ?? ""}
          onChange={(e) => setFromCentro(e.target.value || null)}
        >
          <option value="">Inventario Empresa</option>
          {centros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <label className="text-sm">Hacia</label>
        <select
          className="input"
          value={toCentro ?? ""}
          onChange={(e) => setToCentro(e.target.value || null)}
        >
          <option value="">Inventario Empresa</option>
          {centros.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nombre}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-2">
        <input
          className="input"
          placeholder="Categoría"
          value={categoria}
          onChange={(e) => setCategoria(e.target.value)}
        />

        <input
          className="input"
          placeholder="Nombre EPP"
          value={nombre}
          onChange={(e) => setNombre(e.target.value)}
        />

        <input
          className="input"
          placeholder="Talla (opcional)"
          value={talla ?? ""}
          onChange={(e) => setTalla(e.target.value || null)}
        />

        <input
          type="number"
          min={1}
          className="input"
          value={cantidad}
          onChange={(e) => setCantidad(Number(e.target.value))}
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={loading}
        className="w-full bg-black text-white rounded py-2"
      >
        {loading ? "Moviendo..." : "Mover stock"}
      </button>
    </div>
  );
}
