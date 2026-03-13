// app/dashboard/ingreso/page.tsx
"use client";

import { useEffect, useState } from "react";


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

function normalizeRut(input: string) {
  const s = (input || "").toString().trim().toUpperCase();
  const clean = s.replace(/[^0-9K]/g, "");
  if (clean.length < 2) return s.trim();
  const body = clean.slice(0, -1);
  const dv = clean.slice(-1);
  return `${body}-${dv}`;
}

function isRutLike(input: string) {
  const r = normalizeRut(input);
  return !r || /^[0-9]{7,8}-[0-9K]$/.test(r);
}

function todayYMD() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function formatDocCompra(compra: any): string {
  if (!compra) return "—";
  const tipo = String(compra?.tipo_documento ?? "").trim();
  const num = String(compra?.numero_documento ?? "").trim();
  const label = tipo ? tipo.charAt(0).toUpperCase() + tipo.slice(1) : "Doc";
  return num ? `${label} ${num}` : label;
}

function formatProveedorCompra(compra: any): string {
  if (!compra) return "—";
  const nombre = String(compra?.proveedor_nombre ?? "").trim();
  const rut = String(compra?.proveedor_rut ?? "").trim();
  if (nombre && rut) return `${nombre} (${rut})`;
  return nombre || rut || "—";
}

function normSearch(v: any) {
  return String(v ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}


type IngresoItem = {
  modoIngreso: "nuevo" | "existente";
  productoId?: string;
  categoria: string;
  categoriaOtro?: string;
  epp: string;
  marca?: string;
  modelo?: string;
  tallaNumero: string;
  cantidad: number;
  valorUnitario?: number;
  tipoIVA?: "IVA_INCLUIDO" | "MAS_IVA";
};

type IngresoHistorialRow = {
  id: string;
  fecha: string;
  created_at?: string | null;

  categoria: string;
  nombre: string;
  marca?: string | null;
  modelo?: string | null;
  talla: string | null;
  cantidad: number;
  valorUnitario: number;
  total: number;

  // compra (opcional)
  compra?: {
    id?: string;
    tipo_documento?: string | null;
    numero_documento?: string | null;
    fecha_documento?: string | null;
    proveedor_rut?: string | null;
    proveedor_nombre?: string | null;
  } | null;

  // control/auditoría
  anulado: boolean;
  anulado_motivo: string | null;
  cantidad_inicial: number;
  cantidad_disponible: number;
};

type CatalogoEppRow = {
  id: string;
  categoria: string;
  nombre_epp: string;
  marca: string | null;
  modelo: string | null;
  talla: string | null;
};

export default function IngresoPage() {

// Documento de compra (cabecera)
const [docTipo, setDocTipo] = useState<"factura" | "guia" | "oc" | "otro">("factura");
const [docNumero, setDocNumero] = useState<string>("");
const [docFecha, setDocFecha] = useState<string>(todayYMD());
const [provRut, setProvRut] = useState<string>("");
const [provNombre, setProvNombre] = useState<string>("");
const [docMore, setDocMore] = useState(false);

const [items, setItems] = useState<IngresoItem[]>([
  {
    modoIngreso: "nuevo",
    productoId: "",
    categoria: "",
    epp: "",
    marca: "",
    modelo: "",
    tallaNumero: "No aplica",
    cantidad: 1,
    tipoIVA: "IVA_INCLUIDO",
  },
]);

const [historial, setHistorial] = useState<IngresoHistorialRow[]>([]);
const [qHist, setQHist] = useState<string>("");

// Orden por defecto: fecha DESC (más recientes arriba)
const [ordenCampo, setOrdenCampo] = useState<keyof IngresoHistorialRow>("fecha");
const [ordenDireccion, setOrdenDireccion] = useState<"asc" | "desc">("desc");

const ITEMS_POR_HOJA = 20;
const [pagina, setPagina] = useState(1);
const [openMenuId, setOpenMenuId] = useState<string | null>(null);
const [catalogo, setCatalogo] = useState<CatalogoEppRow[]>([]);
const [catalogoLoading, setCatalogoLoading] = useState(false);
const [catalogoError, setCatalogoError] = useState<string>("");

    /* =========================
    NUEVA FUNCION
    ========================= */

    const editarNombre = async (row: IngresoHistorialRow) => {
      if (row.anulado) {
        alert("No se puede editar el nombre de un ingreso anulado.");
        return;
      }

      const nuevoNombre = prompt("Nuevo nombre del EPP:", row.nombre);
      if (nuevoNombre == null) return;

      const nombreLimpio = nuevoNombre.trim();
      if (!nombreLimpio) {
        alert("Debes ingresar un nombre válido.");
        return;
      }

      if (nombreLimpio === row.nombre.trim()) {
        return;
      }

      try {
        const resp = await fetch(`/api/stock/lotes/${row.id}/editar`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            nombre_epp: nombreLimpio,
            categoria: row.categoria,
            marca: row.marca,
            modelo: row.modelo,
            talla: row.talla,
          }),
        });

        const result = await resp.json().catch(() => null);

        if (!resp.ok) {
          alert(result?.error || "Error al actualizar nombre");
          return;
        }

        await refrescarHistorial();
        alert("Nombre actualizado correctamente");
      } catch {
        alert("Error de red al actualizar nombre");
      }
    };
    
    
const formatCatalogoLabel = (row: CatalogoEppRow) => {
  const base = [row.categoria, row.nombre_epp].filter(Boolean).join(" | ");
  const extra = [row.marca, row.modelo, row.talla ?? "No aplica"]
    .filter((v) => v != null && String(v).trim() !== "")
    .join(" | ");
  return extra ? `${base} | ${extra}` : base;
};

const applyCatalogoToItem = (index: number, productoId: string) => {
  const selected = catalogo.find((r) => r.id === productoId);
  if (!selected) return;

  const updated = [...items];
  updated[index] = {
    ...updated[index],
    modoIngreso: "existente",
    productoId,
    categoria: selected.categoria,
    categoriaOtro: "",
    epp: selected.nombre_epp,
    marca: selected.marca ?? "",
    modelo: selected.modelo ?? "",
    tallaNumero: selected.talla ?? "No aplica",
  };
  setItems(updated);
};

useEffect(() => {
  const fetchCatalogo = async () => {
    try {
      setCatalogoLoading(true);
      setCatalogoError("");

      const resp = await fetch("/api/stock/catalogo", {
        cache: "no-store",
      });

      const raw = await resp.json().catch(() => null);

      if (!resp.ok) {
        throw new Error(raw?.error || "Error al cargar catálogo");
      }

      const rows: CatalogoEppRow[] = Array.isArray(raw?.rows)
        ? raw.rows.map((r: any) => ({
            id: String(r?.id ?? ""),
            categoria: String(r?.categoria ?? ""),
            nombre_epp: String(r?.nombre_epp ?? ""),
            marca: r?.marca ?? null,
            modelo: r?.modelo ?? null,
            talla: r?.talla ?? null,
          }))
        : [];

      setCatalogo(rows);
    } catch (err: any) {
      setCatalogo([]);
      setCatalogoError(err?.message || "Error al cargar catálogo");
    } finally {
      setCatalogoLoading(false);
    }
  };

  fetchCatalogo();
}, []);
    
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
        const marca = r?.marca ?? null;
        const modelo = r?.modelo ?? null;
        const talla = r?.talla == null || String(r.talla).trim() === "" ? null : String(r.talla);

        const cantidad = Number(r?.cantidad_inicial ?? r?.cantidad ?? 0);
        const valorUnitario = Number(r?.costo_unitario_iva ?? r?.valorUnitario ?? 0);
        const total = Number.isFinite(cantidad) && Number.isFinite(valorUnitario)
          ? cantidad * valorUnitario
          : 0;

        return {
          id: String(r?.id ?? ""),
          fecha,
          created_at: r?.created_at ?? null,
          compra: r?.compra ?? null,
          categoria,
          nombre,
          marca,
          modelo,
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

      // No ordenamos acá: el orden lo controla `historialOrdenado` (soporta flechas)
      setPagina(1);
      setHistorial(data);
    } catch (err) {
      setHistorial([]);
    }
  };
  fetchHistorial();
}, []);

const qNorm = normSearch(qHist);

const historialFiltrado = qNorm
  ? historial.filter((row) => {
      const parts = [
        row.fecha,
        row.created_at,
        row.categoria,
        row.nombre,
        row.marca,
        row.modelo,
        row.talla,
        row.cantidad,
        row.valorUnitario,
        row.total,
        row.anulado ? "anulado" : "activo",
        row.anulado_motivo,
        // compra
        row.compra?.tipo_documento,
        row.compra?.numero_documento,
        row.compra?.fecha_documento,
        row.compra?.proveedor_rut,
        row.compra?.proveedor_nombre,
      ];

      const hay = normSearch(parts.join(" "));
      return hay.includes(qNorm);
    })
  : historial;

const totalPaginas = Math.ceil(
  (historialFiltrado.length || 0) / ITEMS_POR_HOJA
);

const historialOrdenado = [...historialFiltrado].sort((a, b) => {
  const campo = ordenCampo;
  if (!campo) return 0;

  const aVal = a[campo] as any;
  const bVal = b[campo] as any;

  // Fecha: usar parser local para evitar desfases por zona horaria
  if (campo === "fecha") {
    const at = parseDateFlexible(String(aVal ?? "")).getTime();
    const bt = parseDateFlexible(String(bVal ?? "")).getTime();

    if (at !== bt) {
      const diff = at - bt;
      return ordenDireccion === "asc" ? diff : -diff;
    }

    const aTs = a.created_at ? Date.parse(String(a.created_at)) : 0;
    const bTs = b.created_at ? Date.parse(String(b.created_at)) : 0;
    const diff2 = aTs - bTs;
    return ordenDireccion === "asc" ? diff2 : -diff2;
  }

  // Números
  if (typeof aVal === "number" && typeof bVal === "number") {
    const diff = aVal - bVal;
    return ordenDireccion === "asc" ? diff : -diff;
  }

  // Strings (incluye null/undefined)
  const as = (aVal ?? "").toString();
  const bs = (bVal ?? "").toString();
  const diff = as.localeCompare(bs, "es", { sensitivity: "base" });
  return ordenDireccion === "asc" ? diff : -diff;
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

const setModoIngreso = (index: number, modo: "nuevo" | "existente") => {
  setItems((prev) =>
    prev.map((item, i) => {
      if (i !== index) return item;

      if (modo === "existente") {
        return {
          ...item,
          modoIngreso: "existente",
          productoId: item.productoId || "",
          categoria: "",
          categoriaOtro: "",
          epp: "",
          marca: "",
          modelo: "",
          tallaNumero: "No aplica",
        };
      }

      return {
        ...item,
        modoIngreso: "nuevo",
        productoId: "",
        categoria: "",
        categoriaOtro: "",
        epp: "",
        marca: "",
        modelo: "",
        tallaNumero: "No aplica",
      };
    })
  );
};

const addItem = () => {
  setItems([
    ...items,
    {
      modoIngreso: "nuevo",
      productoId: "",
      categoria: "",
      epp: "",
      marca: "",
      modelo: "",
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

  if (provRut && !isRutLike(provRut)) {
    alert("RUT proveedor inválido");
    return;
  }

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const fila = i + 1;

    if (item.modoIngreso === "existente" && !item.productoId) {
      alert(`Fila ${fila}: debes seleccionar un EPP existente para reponer stock`);
      return;
    }

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
        marca: (item.marca || "").trim() || null,
        modelo: (item.modelo || "").trim() || null,
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
      body: JSON.stringify({
        compra: {
          tipo: docTipo,
          numero: docNumero.trim() || null,
          fecha: docFecha || null,
          proveedor_rut: provRut ? normalizeRut(provRut) : null,
          proveedor_nombre: provNombre.trim() || null,
        },
        items: itemsToSend,
      }),
    });
    if (!resp.ok) {
      const error = await resp.text();
      throw new Error(error || "Error al registrar ingreso");
    }
    alert("Ingreso registrado correctamente");
    setDocTipo("factura");
    setDocNumero("");
    setProvRut("");
    setProvNombre("");
    setDocFecha(todayYMD());
    setDocMore(false);
    await refrescarHistorial();
  } catch (err: any) {
    alert(err.message || "Error al registrar ingreso");
  }
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
      const marca = r?.marca ?? null;
      const modelo = r?.modelo ?? null;
      const talla = r?.talla == null || String(r.talla).trim() === "" ? null : String(r.talla);

      const cantidad = Number(r?.cantidad_inicial ?? r?.cantidad ?? 0);
      const valorUnitario = Number(r?.costo_unitario_iva ?? r?.valorUnitario ?? 0);
      const total = Number.isFinite(cantidad) && Number.isFinite(valorUnitario)
        ? cantidad * valorUnitario
        : 0;

      return {
        id: String(r?.id ?? ""),
        fecha,
        created_at: r?.created_at ?? null,
        compra: r?.compra ?? null,
        categoria,
        nombre,
        marca,
        modelo,
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

    // No ordenamos acá: el orden lo controla `historialOrdenado` (soporta flechas)
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

// Close dropdown when clicking outside
useEffect(() => {
  const onDocClick = (e: MouseEvent) => {
    const target = e.target as HTMLElement | null;
    if (!target) return;
    if (target.closest("[data-actions-menu='1']")) return;
    setOpenMenuId(null);
  };
  document.addEventListener("click", onDocClick);
  return () => document.removeEventListener("click", onDocClick);
}, []);

return (
  <div className="w-full space-y-6">
    <h1 className="text-2xl font-semibold">Ingreso de EPP</h1>

    {/* INGRESO MANUAL */}
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Documento de compra */}
      <div className="rounded-lg border bg-white p-4 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="font-medium">Documento de compra</h2>
            <p className="text-xs text-zinc-500">
              Se aplicará a todos los EPP que agregues en este ingreso.
            </p>
          </div>
          <button
            type="button"
            className="text-sm text-zinc-600 underline"
            onClick={() => {
              setDocTipo("factura");
              setDocNumero("");
              setProvRut("");
              setProvNombre("");
              setDocFecha(todayYMD());
              setDocMore(false);
            }}
          >
            Limpiar
          </button>
        </div>

        <div className="flex flex-wrap gap-3">
          {([
            { id: "factura", label: "Factura" },
            { id: "guia", label: "Guía" },
            { id: "oc", label: "OC" },
            { id: "otro", label: "Otro" },
          ] as const).map((opt) => (
            <label key={opt.id} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="docTipo"
                checked={docTipo === opt.id}
                onChange={() => setDocTipo(opt.id)}
              />
              {opt.label}
            </label>
          ))}
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">N° documento (recomendado)</label>
            <input
              value={docNumero}
              onChange={(e) => setDocNumero(e.target.value)}
              className="input"
              placeholder="Ej: 12345"
            />
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">RUT proveedor (recomendado)</label>
            <input
              value={provRut}
              onChange={(e) => setProvRut(e.target.value)}
              onBlur={() => setProvRut(normalizeRut(provRut))}
              className="input"
              placeholder="12.345.678-9"
            />
            {!isRutLike(provRut) && (
              <div className="mt-1 text-xs text-red-600">RUT inválido</div>
            )}
          </div>
        </div>

        <button
          type="button"
          className="text-sm text-zinc-600 underline"
          onClick={() => setDocMore((v) => !v)}
        >
          {docMore ? "Ocultar" : "Más datos…"}
        </button>

        {docMore && (
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-xs text-zinc-500 mb-1">Fecha documento</label>
              <input
                type="date"
                value={docFecha}
                onChange={(e) => setDocFecha(e.target.value)}
                className="input"
              />
            </div>

            <div>
              <label className="block text-xs text-zinc-500 mb-1">Proveedor (nombre / razón social)</label>
              <input
                value={provNombre}
                onChange={(e) => setProvNombre(e.target.value)}
                className="input"
                placeholder="Opcional"
              />
            </div>
          </div>
        )}

        {(docNumero || provRut) && items.length > 1 && (
          <div className="rounded border border-sky-200 bg-sky-50 p-2 text-xs text-sky-900">
            Estos datos se aplicarán a <b>{items.length}</b> ítems de EPP.
          </div>
        )}
      </div>
      {items.map((item, index) => {
        const eppsDisponibles: string[] = [];
        const tallasDisponibles: { id: string; tallaNumero: string }[] = [];
        return (
          <div key={index} className="rounded border p-3 space-y-2">
            <div className="rounded border bg-zinc-50 p-3 space-y-2">
              <div className="text-sm font-medium">Tipo de ingreso</div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setModoIngreso(index, "nuevo")}
                  className={
                    item.modoIngreso === "nuevo"
                      ? "rounded border border-sky-600 bg-sky-50 px-3 py-2 text-left text-sm font-medium text-sky-700"
                      : "rounded border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                  }
                >
                  Nuevo EPP
                </button>

                <button
                  type="button"
                  onClick={() => setModoIngreso(index, "existente")}
                  className={
                    item.modoIngreso === "existente"
                      ? "rounded border border-sky-600 bg-sky-50 px-3 py-2 text-left text-sm font-medium text-sky-700"
                      : "rounded border border-zinc-300 bg-white px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-50"
                  }
                >
                  Reponer stock existente
                </button>
              </div>

              {item.modoIngreso === "existente" && (
                <div className="space-y-2">
                  <label className="block text-xs text-zinc-500">
                    Selecciona el EPP existente
                  </label>
                  <select
                    value={item.productoId || ""}
                    onChange={(e) => applyCatalogoToItem(index, e.target.value)}
                    className="input"
                    disabled={catalogoLoading}
                  >
                    <option value="">
                      {catalogoLoading
                        ? "Cargando catálogo..."
                        : "Selecciona un EPP existente"}
                    </option>
                    {catalogo.map((row) => (
                      <option key={row.id} value={row.id}>
                        {formatCatalogoLabel(row)}
                      </option>
                    ))}
                  </select>
                  {catalogoError ? (
                    <div className="text-xs text-red-600">{catalogoError}</div>
                  ) : null}
                </div>
              )}
            </div>
            <select
              value={item.categoria}
              onChange={(e) => updateItem(index, "categoria", e.target.value)}
              className="input"
              disabled={item.modoIngreso === "existente"}
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
                disabled={item.modoIngreso === "existente"}
              />
            )}

            <input
              type="text"
              value={item.epp}
              onChange={(e) => updateItem(index, "epp", e.target.value)}
              className="input"
              placeholder="Nombre del EPP"
              disabled={item.modoIngreso === "existente"}
            />

            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <input
                type="text"
                value={item.marca || ""}
                onChange={(e) => updateItem(index, "marca", e.target.value)}
                className="input"
                placeholder="Marca (opcional)"
                disabled={item.modoIngreso === "existente"}
              />
              <input
                type="text"
                value={item.modelo || ""}
                onChange={(e) => updateItem(index, "modelo", e.target.value)}
                className="input"
                placeholder="Modelo (opcional)"
                disabled={item.modoIngreso === "existente"}
              />
            </div>

            <input
              type="text"
              value={item.tallaNumero}
              onChange={(e) => updateItem(index, "tallaNumero", e.target.value)}
              className="input"
              placeholder="Talla / Número (obligatorio, puedes usar No aplica)"
              disabled={item.modoIngreso === "existente"}
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

    {/* CARGA MASIVA section removed */}

    <h2 className="text-xl font-semibold">
      Historial de ingresos de EPP
    </h2>

    <div className="rounded border bg-white p-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full">
          <label className="block text-xs text-zinc-500 mb-1">Buscar en historial</label>
          <input
            className="input"
            value={qHist}
            onChange={(e) => {
              setQHist(e.target.value);
              setPagina(1);
            }}
            placeholder="Buscar por fecha, EPP, categoría, proveedor, documento…"
          />
        </div>

        <button
          type="button"
          className="sm:mt-5 rounded border px-3 py-2 text-sm disabled:opacity-40"
          disabled={!qHist}
          onClick={() => {
            setQHist("");
            setPagina(1);
          }}
        >
          Limpiar
        </button>
      </div>

      <div className="mt-2 text-xs text-zinc-500">
        Mostrando {historialFiltrado.length} de {historial.length}
      </div>
    </div>

    <div className="overflow-x-auto rounded border">
      <table className="w-full min-w-full border-collapse border border-slate-300 text-sm">
        <thead>
          <tr>
            <th
              onClick={() => handleOrden("fecha")}
              className="cursor-pointer border border-slate-300 p-2 text-left"
            >
              Fecha {ordenCampo === "fecha" && (ordenDireccion === "asc" ? "▲" : "▼")}
            </th>
            <th className="border border-slate-300 p-2 text-left">Documento</th>
            <th className="border border-slate-300 p-2 text-left">Proveedor</th>
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
              className="cursor-pointer border border-slate-300 p-2 text-right hidden md:table-cell"
            >
              Valor unitario ($ IVA incl.) {ordenCampo === "valorUnitario" && (ordenDireccion === "asc" ? "▲" : "▼")}
            </th>
            <th
              onClick={() => handleOrden("total")}
              className="cursor-pointer border border-slate-300 p-2 text-right hidden md:table-cell"
            >
              Total {ordenCampo === "total" && (ordenDireccion === "asc" ? "▲" : "▼")}
            </th>
            <th className="border border-slate-300 p-2 text-left">Estado</th>
            <th className="border border-slate-300 p-2 text-left whitespace-nowrap">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {historialFiltrado.length === 0 && (
            <tr>
              <td
                colSpan={11}
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
                <div className="font-medium">{formatDocCompra(row.compra)}</div>
                {row.compra?.fecha_documento ? (
                  <div className="text-xs text-zinc-500">Doc: {formatFechaCL(row.compra.fecha_documento)}</div>
                ) : null}
              </td>
              <td className="p-2 border border-slate-300">
                <div className="truncate max-w-[260px]" title={formatProveedorCompra(row.compra)}>
                  {formatProveedorCompra(row.compra)}
                </div>
              </td>
              <td className="p-2 border border-slate-300">
                {row.categoria}
              </td>
              <td className="p-2 border border-slate-300">
                <div className="font-medium">{row.nombre}</div>
                {(row.marca || row.modelo) && (
                  <div className="text-xs text-zinc-500">
                    {[row.marca, row.modelo].filter(Boolean).join(" - ")}
                  </div>
                )}
              </td>
              <td className="p-2 border border-slate-300">
                {row.talla ?? "No aplica"}
              </td>
              <td className="p-2 border border-slate-300 text-right">
                {row.cantidad}
              </td>
              <td className="p-2 border border-slate-300 text-right hidden md:table-cell">
                {row.valorUnitario.toLocaleString("es-CL")}
              </td>
              <td className="p-2 border border-slate-300 text-right hidden md:table-cell">
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
                <div className="relative inline-flex" data-actions-menu="1">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenMenuId((cur) => (cur === row.id ? null : row.id));
                    }}
                    className="rounded border px-2 py-1 text-sm hover:bg-zinc-50"
                    aria-haspopup="menu"
                    aria-expanded={openMenuId === row.id}
                    title="Acciones"
                  >
                    ⋯
                  </button>

                  {openMenuId === row.id && (
                    <div
                      className="absolute right-0 top-full z-10 mt-1 w-44 overflow-hidden rounded border bg-white shadow"
                      role="menu"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          modificarIngreso(row);
                        }}
                        disabled={!esEditable(row)}
                        className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-40"
                        role="menuitem"
                        title={!esEditable(row) ? "Bloqueado: ya fue consumido" : "Modificar"}
                      >
                        ✏️ Modificar
                      </button>
                                             
                    <button
                      type="button"
                      onClick={() => {
                        setOpenMenuId(null);
                        editarNombre(row);
                      }}
                      disabled={row.anulado}
                      className="w-full px-3 py-2 text-left text-sm hover:bg-zinc-50 disabled:opacity-40"
                      role="menuitem"
                      title={row.anulado ? "Bloqueado: ingreso anulado" : "Editar nombre"}
                    >
                      📝 Editar nombre
                    </button>

                      <button
                        type="button"
                        onClick={() => {
                          setOpenMenuId(null);
                          anularIngreso(row);
                        }}
                        disabled={!esEditable(row)}
                        className="w-full px-3 py-2 text-left text-sm text-red-700 hover:bg-zinc-50 disabled:opacity-40"
                        role="menuitem"
                        title={!esEditable(row) ? "Bloqueado: ya fue consumido" : "Anular"}
                      >
                        🧾 Anular
                      </button>
                    </div>
                  )}
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
            disabled={pagina === (totalPaginas || 1)}
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
