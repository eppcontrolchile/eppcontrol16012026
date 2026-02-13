// app/dashboard/ingreso/page.tsx
"use client";

import * as XLSX from "xlsx";
import { useEffect, useState } from "react";

import { useRouter } from "next/navigation";

// Helpers para parsear fechas correctamente como LOCAL (YYYY-MM-DD)
function parseDateFlexible(input: string): Date {
  const s = (input || "").toString().trim();
  // Si viene como YYYY-MM-DD, parsear como fecha LOCAL para evitar desfase por UTC
  const m = /^([0-9]{4})-([0-9]{2})-([0-9]{2})$/.exec(s);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    return new Date(y, mo - 1, d);
  }
  // Fallback: Date() estándar (para timestamps u otros formatos)
  return new Date(s);
}

function formatFechaCL(input?: string | null): string {
  if (!input) return "—";
  const dt = parseDateFlexible(input);
  if (Number.isNaN(dt.getTime())) return "—";
  return dt.toLocaleDateString("es-CL");
}


type IngresoItem = {
categoria: string;
categoriaOtro?: string;
epp: string;
tallaNumero: string;
cantidad: number;
valorUnitario?: number;
tipoIVA?: "IVA_INCLUIDO" | "MAS_IVA";
};

type IngresoHistorialRow = {
  id: string;
  fecha: string;
  categoria: string;
  nombre: string;
  talla: string | null;
  cantidad: number;
  valorUnitario: number;
  total: number;

  // control/auditoría
  anulado: boolean;
  anulado_motivo: string | null;
  cantidad_inicial: number;
  cantidad_disponible: number;
};

export default function IngresoPage() {
const router = useRouter();
const [fileKey, setFileKey] = useState<number>(Date.now());
const [mensajeCarga, setMensajeCarga] = useState<string | null>(null);
    
const [items, setItems] = useState<IngresoItem[]>([
  {
    categoria: "",
    epp: "",
    tallaNumero: "No aplica",
    cantidad: 1,
    tipoIVA: "IVA_INCLUIDO",
  },
]);

const [historial, setHistorial] = useState<IngresoHistorialRow[]>([]);

const [ordenCampo, setOrdenCampo] = useState<
  keyof IngresoHistorialRow | null
>(null);
const [ordenDireccion, setOrdenDireccion] = useState<
  "asc" | "desc"
>("desc");

const ITEMS_POR_HOJA = 20;
const [pagina, setPagina] = useState(1);

useEffect(() => {
  // Cargar historial desde API
  const fetchHistorial = async () => {
    try {
      const resp = await fetch("/api/stock/ingresos?limit=200&offset=0", {
        cache: "no-store",
      });
      if (!resp.ok) throw new Error("Error al cargar historial");

      const raw = await resp.json().catch(() => null);
      const arr: any[] = Array.isArray(raw) ? raw : raw?.rows ?? [];

      // API devuelve filas de `lotes_epp`; adaptamos a la shape del UI
      const data: IngresoHistorialRow[] = arr.map((r: any) => {
        const fecha = String(r?.fecha_ingreso ?? r?.fecha ?? "");
        const categoria = String(r?.categoria ?? "");
        const nombre = String(r?.nombre_epp ?? r?.nombre ?? "");
        const talla = r?.talla == null || String(r.talla).trim() === "" ? null : String(r.talla);

        const cantidad = Number(r?.cantidad_inicial ?? r?.cantidad ?? 0);
        const valorUnitario = Number(r?.costo_unitario_iva ?? r?.valorUnitario ?? 0);
        const total = Number.isFinite(cantidad) && Number.isFinite(valorUnitario)
          ? cantidad * valorUnitario
          : 0;

        return {
          id: String(r?.id ?? ""),
          fecha,
          categoria,
          nombre,
          talla,
          cantidad: Number.isFinite(cantidad) ? cantidad : 0,
          valorUnitario: Number.isFinite(valorUnitario) ? valorUnitario : 0,
          total,
          anulado: Boolean(r?.anulado ?? false),
          anulado_motivo: r?.anulado_motivo ?? null,
          cantidad_inicial: Number(r?.cantidad_inicial ?? 0),
          cantidad_disponible: Number(r?.cantidad_disponible ?? 0),
        };
      });

      // Ordenar por fecha descendente (parse local para YYYY-MM-DD)
      data.sort((a, b) => parseDateFlexible(b.fecha).getTime() - parseDateFlexible(a.fecha).getTime());
      setPagina(1);
      setHistorial(data);
    } catch (err) {
      setHistorial([]);
    }
  };
  fetchHistorial();
}, []);

const totalPaginas = Math.ceil(
  historial.length / ITEMS_POR_HOJA
);

const historialOrdenado = [...historial].sort((a, b) => {
  if (!ordenCampo) return 0;

  const aVal = a[ordenCampo];
  const bVal = b[ordenCampo];

  if (typeof aVal === "number" && typeof bVal === "number") {
    return ordenDireccion === "asc"
      ? aVal - bVal
      : bVal - aVal;
  }

  return ordenDireccion === "asc"
    ? String(aVal).localeCompare(String(bVal))
    : String(bVal).localeCompare(String(aVal));
});

const historialPaginado = historialOrdenado.slice(
  (pagina - 1) * ITEMS_POR_HOJA,
  pagina * ITEMS_POR_HOJA
);

const categorias = [
  "Cabeza",
  "Ojos",
  "Oídos",
  "Vías respiratorias",
  "Manos",
  "Pies",
  "Cuerpo",
  "Altura",
  "Otro",
];

const updateItem = (
  index: number,
  field: keyof IngresoItem,
  value: any
) => {
  const updated = [...items];
  updated[index] = { ...updated[index], [field]: value };
  setItems(updated);
};

const addItem = () => {
  setItems([
    ...items,
    {
      categoria: "",
      epp: "",
      tallaNumero: "No aplica",
      cantidad: 1,
      tipoIVA: "IVA_INCLUIDO",
    },
  ]);
};

const removeItem = (index: number) => {
  setItems(items.filter((_, i) => i !== index));
};

const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const fila = i + 1;

      if (!item.categoria) {
        alert(`Fila ${fila}: falta Categoría`);
        return;
      }

      if (item.categoria === "Otro" && !(item.categoriaOtro || "").trim()) {
        alert(`Fila ${fila}: falta especificar la Categoría (Otro)`);
        return;
      }

      if (!item.epp || !item.epp.trim()) {
        alert(`Fila ${fila}: falta Nombre del EPP`);
        return;
      }

      if (!item.tallaNumero || !item.tallaNumero.trim()) {
        alert(`Fila ${fila}: falta Talla / Número (puedes escribir "No aplica")`);
        return;
      }

      if (!Number.isFinite(item.cantidad) || item.cantidad <= 0) {
        alert(`Fila ${fila}: Cantidad inválida`);
        return;
      }

      if (!Number.isFinite(item.valorUnitario) || (item.valorUnitario ?? 0) <= 0) {
        alert(`Fila ${fila}: falta Monto unitario`);
        return;
      }

      if (!item.tipoIVA) {
        alert(`Fila ${fila}: falta Tipo IVA`);
        return;
      }
    }

  try {
    // Validaciones y conversión de items
    const itemsToSend = items.map((item) => {
      if (!item.valorUnitario || !item.tipoIVA) {
        throw new Error(
          "Debes ingresar monto unitario y tipo de IVA"
        );
      }
      let costoIVA = item.valorUnitario;
      if (item.tipoIVA === "MAS_IVA") {
        costoIVA = Math.round(item.valorUnitario * 1.19);
      }
      return {
        categoria:
          item.categoria === "Otro"
            ? item.categoriaOtro || "Otro"
            : item.categoria,
        nombre_epp: item.epp,
        talla:
          item.tallaNumero.toLowerCase() === "no aplica"
            ? null
            : item.tallaNumero,
        cantidad: item.cantidad,
        costo_unitario_iva: costoIVA,
      };
    });

    const resp = await fetch("/api/stock/ingreso", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ items: itemsToSend }),
    });
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(error || "Error al registrar ingreso");
    }
    alert("Ingreso registrado correctamente");
    router.push("/dashboard/stock");
  } catch (err: any) {
    alert(err.message || "Error al registrar ingreso");
  }
};

// Helper para obtener el valor de la columna con tolerancia a variantes de encabezado
const getCell = (row: any, keys: string[]) => {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== "") {
      return row[k];
    }
  }
  return "";
};

/* CARGA MASIVA (real) */
const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
  const file = e.target.files?.[0];
  if (!file) return;
  setMensajeCarga(null);

  const reader = new FileReader();

  reader.onload = async (evt) => {
    const data = evt.target?.result;
    if (!data) return;

    const workbook = XLSX.read(data, { type: "binary" });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const rows = XLSX.utils.sheet_to_json<any>(sheet, {
      defval: "",
    });

    if (rows.length === 0) {
      alert("El archivo no contiene datos.");
      return;
    }

    try {
      const ingresosMasivos: any[] = [];
      rows.forEach((row, index) => {
        // Usar getCell para tolerar variantes de encabezado
        const categoriaRaw = getCell(row, ["Categoría", "Categoria"]);
        const categoria = categoriaRaw
          ? categoriaRaw
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase()
          : "";
        const nombreEpp = getCell(row, ["Nombre EPP", "EPP", "Nombre"]);
        const tallaNumeroRaw = getCell(row, ["Talla/Número", "Talla / Número", "Talla"]);
        const tallaNumero =
          tallaNumeroRaw && tallaNumeroRaw.length > 0
            ? tallaNumeroRaw
            : "No aplica";
        const cantidad = Number(
          String(getCell(row, ["Cantidad"]))
            .replace(/\./g, "")
            .replace(",", ".")
        );
        const montoUnitario = Number(
          String(getCell(row, ["Monto unitario", "Monto Unitario", "Monto unitario ($)", "Monto"]))
            .replace(/\./g, "")
            .replace(",", ".")
        );
        const tipoIVARaw = getCell(row, ["Tipo IVA", "Tipo de IVA", "IVA"]);
        const tipoIVA = tipoIVARaw ? tipoIVARaw.toUpperCase() : "";

        if (
          !categoria ||
          !nombreEpp || // EPP libre, solo no vacío
          isNaN(cantidad) ||
          cantidad <= 0 ||
          isNaN(montoUnitario) ||
          montoUnitario <= 0 ||
          !["IVAINCLUIDO", "+IVA", "MASIVA"].some((v) =>
            tipoIVA.replace(/\s/g, "").includes(v)
          )
        ) {
          throw new Error(
            `Fila ${index + 2}: Revisa cantidad, monto unitario o tipo de IVA`
          );
        }

        const categoriasNormalizadas = categorias.map((c) =>
          c
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
        );

        if (!categoriasNormalizadas.includes(categoria)) {
          throw new Error(
            `Fila ${index + 2}: categoría inválida (${categoriaRaw})`
          );
        }

        let valorIVAIncluido = montoUnitario;

        if (tipoIVA.includes("MAS") || tipoIVA.includes("+")) {
          valorIVAIncluido = Math.round(
            montoUnitario * 1.19
          );
        }

        ingresosMasivos.push({
          categoria: categoriaRaw,
          nombre_epp: nombreEpp,
          talla:
            String(tallaNumero).toLowerCase() ===
            "no aplica"
              ? null
              : String(tallaNumero),
          cantidad,
          costo_unitario_iva: valorIVAIncluido,
        });
      });

      // Enviar a API
      const resp = await fetch("/api/stock/ingreso-masivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ items: ingresosMasivos }),
      });
      if (!resp.ok) {
        const error = await resp.text();
        throw new Error(error || "Error en carga masiva");
      }

      setMensajeCarga(
        "✔️ Ingreso masivo realizado correctamente. El stock fue actualizado."
      );
      setFileKey(Date.now());
    } catch (err: any) {
      alert(err.message || "Error en carga masiva");
    }
  };

  reader.readAsBinaryString(file);
};

const handleOrden = (
  campo: keyof IngresoHistorialRow
) => {
  if (ordenCampo === campo) {
    setOrdenDireccion(
      ordenDireccion === "asc" ? "desc" : "asc"
    );
  } else {
    setOrdenCampo(campo);
    setOrdenDireccion("asc");
  }
};

const esEditable = (row: IngresoHistorialRow) => {
  return !row.anulado && row.cantidad_disponible === row.cantidad_inicial;
};

const refrescarHistorial = async () => {
  try {
    const resp = await fetch("/api/stock/ingresos?limit=200&offset=0", {
      cache: "no-store",
    });
    if (!resp.ok) throw new Error("Error al cargar historial");

    const raw = await resp.json().catch(() => null);
    const arr: any[] = Array.isArray(raw) ? raw : raw?.rows ?? [];

    const data: IngresoHistorialRow[] = arr.map((r: any) => {
      const fecha = String(r?.fecha_ingreso ?? r?.fecha ?? "");
      const categoria = String(r?.categoria ?? "");
      const nombre = String(r?.nombre_epp ?? r?.nombre ?? "");
      const talla = r?.talla == null || String(r.talla).trim() === "" ? null : String(r.talla);

      const cantidad = Number(r?.cantidad_inicial ?? r?.cantidad ?? 0);
      const valorUnitario = Number(r?.costo_unitario_iva ?? r?.valorUnitario ?? 0);
      const total = Number.isFinite(cantidad) && Number.isFinite(valorUnitario)
        ? cantidad * valorUnitario
        : 0;

      return {
        id: String(r?.id ?? ""),
        fecha,
        categoria,
        nombre,
        talla,
        cantidad: Number.isFinite(cantidad) ? cantidad : 0,
        valorUnitario: Number.isFinite(valorUnitario) ? valorUnitario : 0,
        total,
        anulado: Boolean(r?.anulado ?? false),
        anulado_motivo: r?.anulado_motivo ?? null,
        cantidad_inicial: Number(r?.cantidad_inicial ?? 0),
        cantidad_disponible: Number(r?.cantidad_disponible ?? 0),
      };
    });

    data.sort((a, b) => parseDateFlexible(b.fecha).getTime() - parseDateFlexible(a.fecha).getTime());
    setPagina(1);
    setHistorial(data);
  } catch {
    setHistorial([]);
  }
};

const anularIngreso = async (row: IngresoHistorialRow) => {
  if (!esEditable(row)) {
    alert("No se puede anular: este ingreso ya fue consumido (tiene egresos o consumo). ");
    return;
  }

  const motivo = prompt("Motivo de anulación (obligatorio):");
  if (!motivo || !motivo.trim()) {
    alert("Debes indicar un motivo.");
    return;
  }

  const confirmar = confirm(
    `¿Anular este ingreso?\n\n${row.categoria} - ${row.nombre} (${row.talla ?? "No aplica"})\nCantidad: ${row.cantidad}\n\nEsta acción dejará el registro para auditoría, pero no contará en stock.`
  );
  if (!confirmar) return;

  const resp = await fetch(`/api/stock/ingresos/${row.id}/anular`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ motivo }),
  });

  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    alert(result?.error || "Error al anular ingreso");
    return;
  }

  await refrescarHistorial();
};

const modificarIngreso = async (row: IngresoHistorialRow) => {
  if (!esEditable(row)) {
    alert("No se puede modificar: este ingreso ya fue consumido (tiene egresos o consumo). ");
    return;
  }

  const nuevaFecha = prompt("Fecha de ingreso (YYYY-MM-DD):", row.fecha);
  if (!nuevaFecha || !/^\d{4}-\d{2}-\d{2}$/.test(nuevaFecha.trim())) {
    alert("Fecha inválida. Usa formato YYYY-MM-DD.");
    return;
  }

  const nuevoCosto = prompt("Costo unitario IVA incluido:", String(row.valorUnitario));
  const costoNum = Number(nuevoCosto);
  if (!Number.isFinite(costoNum) || costoNum < 0) {
    alert("Costo inválido.");
    return;
  }

  const nuevaCantidad = prompt("Cantidad (solo permitido si el lote no tiene consumo):", String(row.cantidad));
  const cantidadNum = Number(nuevaCantidad);
  if (!Number.isFinite(cantidadNum) || cantidadNum <= 0) {
    alert("Cantidad inválida.");
    return;
  }

  const confirmar = confirm(
    `¿Guardar cambios?\n\nFecha: ${row.fecha} → ${nuevaFecha}\nCosto: ${row.valorUnitario} → ${costoNum}\nCantidad: ${row.cantidad} → ${cantidadNum}`
  );
  if (!confirmar) return;

  const resp = await fetch(`/api/stock/ingresos/${row.id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      fecha_ingreso: nuevaFecha.trim(),
      costo_unitario_iva: costoNum,
      cantidad_inicial: cantidadNum,
    }),
  });

  const result = await resp.json().catch(() => ({}));
  if (!resp.ok) {
    alert(result?.error || "Error al modificar ingreso");
    return;
  }

  await refrescarHistorial();
};

return (
  <div className="max-w-2xl space-y-6">
    <h1 className="text-2xl font-semibold">Ingreso de EPP</h1>

    {/* INGRESO MANUAL */}
    <form onSubmit={handleSubmit} className="space-y-4">
      {items.map((item, index) => {
        const eppsDisponibles: string[] = [];

        const tallasDisponibles: { id: string; tallaNumero: string }[] = [];

        return (
          <div key={index} className="rounded border p-3 space-y-2">
            <select
              value={item.categoria}
              onChange={(e) => updateItem(index, "categoria", e.target.value)}
              className="input"
            >
              <option value="">Categoría</option>
              {categorias.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            {item.categoria === "Otro" && (
              <input
                type="text"
                className="input"
                placeholder="Especificar categoría"
                value={item.categoriaOtro || ""}
                onChange={(e) =>
                  updateItem(index, "categoriaOtro", e.target.value)
                }
              />
            )}

            <input
              type="text"
              value={item.epp}
              onChange={(e) => updateItem(index, "epp", e.target.value)}
              className="input"
              placeholder="Nombre del EPP"
            />

            <input
              type="text"
              value={item.tallaNumero}
              onChange={(e) => updateItem(index, "tallaNumero", e.target.value)}
              className="input"
              placeholder="Talla / Número (obligatorio, puedes usar No aplica)"
            />

            <input
              type="number"
              min={1}
              value={item.cantidad}
              onChange={(e) =>
                updateItem(index, "cantidad", Number(e.target.value))
              }
              className="input"
              placeholder="Ingrese cantidad de EPP"
            />

            <input
              type="number"
              min={1}
              value={item.valorUnitario}
              onChange={(e) =>
                updateItem(index, "valorUnitario", Number(e.target.value))
              }
              className="input"
              placeholder="Monto unitario"
            />

            <select
              value={item.tipoIVA}
              onChange={(e) =>
                updateItem(index, "tipoIVA", e.target.value as any)
              }
              className="input"
            >
              <option value="IVA_INCLUIDO">IVA incluido</option>
              <option value="MAS_IVA">+ IVA</option>
            </select>

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

      <button
        type="submit"
        className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-700"
      >
        Registrar ingreso
      </button>
    </form>

    <hr />

    {/* CARGA MASIVA */}
    <div className="space-y-2">
      <h2 className="text-lg font-medium">Carga masiva</h2>
        {mensajeCarga && (
          <div className="rounded border border-green-300 bg-green-50 p-2 text-sm text-green-800">
            {mensajeCarga}
          </div>
        )}

      <a
        href="/plantilla_ingreso_epp.xlsx"
        download
        className="text-sm underline text-sky-600"
      >
        📥 Descargar plantilla
      </a>

        <div className="space-y-1">
          <input
            key={fileKey}
            type="file"
            accept=".xlsx,.csv"
            onChange={handleFileUpload}
            className="input"
          />

          <button
            type="button"
            onClick={() => setFileKey(Date.now())}
            className="text-xs text-zinc-500 underline"
          >
            Borrar archivo cargado
          </button>
        </div>

      <p className="text-xs text-zinc-500">
        Columnas esperadas (Excel): Categoría | Nombre EPP |{" "}
        Talla/Número | Cantidad | Monto unitario |{" "}
        Tipo IVA (IVA incluido / + IVA)
      </p>
    </div>

    <h2 className="text-xl font-semibold">
      Historial de ingresos de EPP
    </h2>

    <div className="overflow-x-auto rounded border">
      <table className="w-full border-collapse border border-slate-300 text-sm">
        <thead>
          <tr>
            <th
              onClick={() => handleOrden("fecha")}
              className="cursor-pointer border border-slate-300 p-2 text-left"
            >
              Fecha {ordenCampo === "fecha" && (ordenDireccion === "asc" ? "▲" : "▼")}
            </th>
            <th
              onClick={() => handleOrden("categoria")}
              className="cursor-pointer border border-slate-300 p-2 text-left"
            >
              Categoría {ordenCampo === "categoria" && (ordenDireccion === "asc" ? "▲" : "▼")}
            </th>
            <th
              onClick={() => handleOrden("nombre")}
              className="cursor-pointer border border-slate-300 p-2 text-left"
            >
              EPP {ordenCampo === "nombre" && (ordenDireccion === "asc" ? "▲" : "▼")}
            </th>
            <th
              onClick={() => handleOrden("talla")}
              className="cursor-pointer border border-slate-300 p-2 text-left"
            >
              Talla / Número {ordenCampo === "talla" && (ordenDireccion === "asc" ? "▲" : "▼")}
            </th>
            <th
              onClick={() => handleOrden("cantidad")}
              className="cursor-pointer border border-slate-300 p-2 text-right"
            >
              Cantidad {ordenCampo === "cantidad" && (ordenDireccion === "asc" ? "▲" : "▼")}
            </th>
            <th
              onClick={() => handleOrden("valorUnitario")}
              className="cursor-pointer border border-slate-300 p-2 text-right"
            >
              Valor unitario ($ IVA incl.) {ordenCampo === "valorUnitario" && (ordenDireccion === "asc" ? "▲" : "▼")}
            </th>
            <th
              onClick={() => handleOrden("total")}
              className="cursor-pointer border border-slate-300 p-2 text-right"
            >
              Total {ordenCampo === "total" && (ordenDireccion === "asc" ? "▲" : "▼")}
            </th>
            <th className="border border-slate-300 p-2 text-left">Estado</th>
            <th className="border border-slate-300 p-2 text-left">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {historial.length === 0 && (
            <tr>
              <td
                colSpan={9}
                className="border border-slate-300 p-4 text-center text-zinc-500"
              >
                No hay ingresos registrados
              </td>
            </tr>
          )}

          {historialPaginado.map((row, idx) => (
            <tr
              key={row.id || idx}
              className="border border-slate-300 hover:bg-zinc-50"
            >
              <td className="p-2 border border-slate-300">
                {formatFechaCL(row.fecha)}
              </td>
              <td className="p-2 border border-slate-300">
                {row.categoria}
              </td>
              <td className="p-2 border border-slate-300">
                {row.nombre}
              </td>
              <td className="p-2 border border-slate-300">
                {row.talla ?? "No aplica"}
              </td>
              <td className="p-2 border border-slate-300 text-right">
                {row.cantidad}
              </td>
              <td className="p-2 border border-slate-300 text-right">
                {row.valorUnitario.toLocaleString("es-CL")}
              </td>
              <td className="p-2 border border-slate-300 text-right">
                {row.total.toLocaleString("es-CL")}
              </td>
              <td className="p-2 border border-slate-300">
                {row.anulado ? (
                  <span className="text-zinc-500">Anulado</span>
                ) : (
                  <span className="text-green-700">Activo</span>
                )}
                {row.anulado && row.anulado_motivo ? (
                  <div className="mt-1 text-xs text-zinc-500">
                    Motivo: {row.anulado_motivo}
                  </div>
                ) : null}
              </td>

              <td className="p-2 border border-slate-300">
                <div className="flex flex-col gap-2">
                  <button
                    type="button"
                    onClick={() => modificarIngreso(row)}
                    disabled={!esEditable(row)}
                    className="rounded border px-2 py-1 text-left disabled:opacity-40"
                    title={!esEditable(row) ? "Bloqueado: ya fue consumido" : "Modificar"}
                  >
                    ✏️ Modificar
                  </button>

                  <button
                    type="button"
                    onClick={() => anularIngreso(row)}
                    disabled={!esEditable(row)}
                    className="rounded border px-2 py-1 text-left text-red-700 disabled:opacity-40"
                    title={!esEditable(row) ? "Bloqueado: ya fue consumido" : "Anular"}
                  >
                    🧾 Anular
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="flex items-center justify-between p-2 text-sm">
        <span>
          Hoja {pagina} de {totalPaginas || 1}
        </span>

        <div className="space-x-2">
          <button
            disabled={pagina === 1}
            onClick={() => setPagina((p) => p - 1)}
            className="rounded border px-2 py-1 disabled:opacity-40"
          >
            ← Anterior
          </button>

          <button
            disabled={pagina === totalPaginas}
            onClick={() => setPagina((p) => p + 1)}
            className="rounded border px-2 py-1 disabled:opacity-40"
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  </div>
);
}
