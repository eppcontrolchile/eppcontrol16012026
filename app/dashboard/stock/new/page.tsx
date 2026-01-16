// app/dashboard/stock/new/page.tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function NewStockItemPage() {
  const router = useRouter();

  const [form, setForm] = useState({
    categoria: "",
    nombre: "",
    talla: "",
    stock: "",
    stockCritico: "",
  });

  const handleChange = (
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>
  ) => {
    setForm({
      ...form,
      [e.target.name]: e.target.value,
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    // Validaciones básicas
    if (!form.categoria || !form.nombre || !form.stock || !form.stockCritico) {
      alert("Completa los campos obligatorios");
      return;
    }

    // Mock: luego irá a backend / estado global
    const newItem = {
      ...form,
      stock: Number(form.stock),
      stockCritico: Number(form.stockCritico),
    };

    console.log("Nuevo EPP:", newItem);

    // Volver a Stock
    router.push("/dashboard/stock");
  };

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">Agregar EPP</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium">
            Categoría *
          </label>
          <select
            name="categoria"
            value={form.categoria}
            onChange={handleChange}
            className="input"
          >
            <option value="">Selecciona categoría</option>
            <option value="Cabeza">Cabeza</option>
            <option value="Manos">Manos</option>
            <option value="Pies">Pies</option>
            <option value="Ojos">Ojos</option>
            <option value="Auditiva">Protección auditiva</option>
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Nombre del EPP *
          </label>
          <input
            type="text"
            name="nombre"
            value={form.nombre}
            onChange={handleChange}
            className="input"
            placeholder="Ej: Casco de seguridad"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Talla (opcional)
          </label>
          <input
            type="text"
            name="talla"
            value={form.talla}
            onChange={handleChange}
            className="input"
            placeholder="Ej: M, L, 42"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Stock inicial *
          </label>
          <input
            type="number"
            name="stock"
            value={form.stock}
            onChange={handleChange}
            className="input"
            min={0}
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Stock crítico *
          </label>
          <input
            type="number"
            name="stockCritico"
            value={form.stockCritico}
            onChange={handleChange}
            className="input"
            min={0}
          />
        </div>

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Guardar
          </button>

          <button
            type="button"
            onClick={() => router.push("/dashboard/stock")}
            className="rounded-lg border px-4 py-2 text-sm"
          >
            Cancelar
          </button>
        </div>
      </form>
    </div>
  );
}
