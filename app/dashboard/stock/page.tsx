// app/dashboard/stock/page.tsx
"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getStockDesdeFIFO } from "@/app/utils/fifo";
import { updateStockCritico, getStockCriticos } from "@/app/utils/stock";

type StockItem = {
  id: string;
  categoria: string;
  nombre: string;
  talla?: string | null;
  stock: number;
  stockCritico: number;
};

export default function StockPage() {
  const [items, setItems] = useState<StockItem[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);

  useEffect(() => {
    const fifoStock = getStockDesdeFIFO();
    const criticos = getStockCriticos();

    const itemsFormateados: StockItem[] = fifoStock.map((item) => {
      const key = `${item.categoria}|${item.nombreEpp}|${item.talla || ""}`;

      return {
        id: key,
        categoria: item.categoria,
        nombre: item.nombreEpp,
        talla: item.talla,
        stock: item.cantidad,
        stockCritico: criticos[key] ?? 0,
      };
    });

    setItems(itemsFormateados);
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
                            onClick={() => {
                              try {
                                updateStockCritico({
                                  id: item.id,
                                  stockCritico: editValue,
                                });
                                setItems((prev) =>
                                  prev.map((i) =>
                                    i.id === item.id
                                      ? { ...i, stockCritico: editValue }
                                      : i
                                  )
                                );
                                setEditingId(null);
                                alert("Stock crítico actualizado correctamente");
                              } catch (err) {
                                console.error(err);
                              }
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
