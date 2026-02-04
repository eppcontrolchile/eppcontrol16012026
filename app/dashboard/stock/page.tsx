// app/dashboard/stock/page.tsx
"use client";

import type React from "react";
import { useEffect, useState } from "react";

type StockItem = {
  id: string;
  categoria: string;
  nombre: string;
  talla: string | null;
  stock: number;
  stockCritico: number;
};

export default function StockPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);

  useEffect(() => {
    const loadStock = async () => {
      const res = await fetch("/api/stock");
      if (!res.ok) return;

      const data = await res.json();
      setItems(
        data.map((item: any) => ({
          id: item.id,
          categoria: item.categoria,
          nombre: item.nombre,
          talla: item.talla,
          stock: item.stock_total,
          stockCritico: item.stock_critico,
        }))
      );
    };

    loadStock();
  }, []);

  const getEstado = (item: StockItem) => {
    if (item.stock <= item.stockCritico) {
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

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Stock de EPP</h1>
      </div>

      {items.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center text-sm text-zinc-500">
          Aún no tienes EPP registrados.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border">
          <table className="w-full text-sm">
            <thead className="bg-zinc-50 text-left">
              <tr>
                <th className="px-4 py-3">Categoría</th>
                <th className="px-4 py-3">EPP</th>
                <th className="px-4 py-3">Talla</th>
                <th className="px-4 py-3">Stock</th>
                <th className="px-4 py-3">Stock crítico</th>
                <th className="px-4 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const estado = getEstado(item);

                return (
                  <tr key={item.id} className="border-t">
                    <td className="px-4 py-3">{item.categoria}</td>
                    <td className="px-4 py-3">{item.nombre}</td>
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
                                prev.map((i) =>
                                  i.id === item.id ? { ...i, stockCritico: editValue } : i
                                )
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
                            className="text-blue-600 text-sm font-semibold"
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
                    <td className={`px-4 py-3 ${estado.className}`}>
                      {estado.label}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
