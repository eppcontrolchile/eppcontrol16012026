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
  created_at?: string | null;

  categoria: string;
  nombre: string;
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

export default function IngresoPage() {
const router = useRouter();
const [fileKey, setFileKey] = useState<number>(Date.now());
const [mensajeCarga, setMensajeCarga] = useState<string | null>(null);

// Documento de compra (cabecera)
const [docTipo, setDocTipo] = useState<"factura" | "guia" | "oc" | "otro">("factura");
const [docNumero, setDocNumero] = useState<string>("");
const [docFecha, setDocFecha] = useState<string>(todayYMD());
const [provRut, setProvRut] = useState<string>("");
const [provNombre, setProvNombre] = useState<string>("");
const [docMore, setDocMore] = useState(false);

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
const [qHist, setQHist] = useState<string>("");

// Orden por defecto: fecha DESC (más recientes arriba)
const [ordenCampo, setOrdenCampo] = useState<keyof IngresoHistorialRow>("fecha");
const [ordenDireccion, setOrdenDireccion] = useState<"asc" | "desc">("desc");

const ITEMS_POR_HOJA = 20;
const [pagina, setPagina] = useState(1);
const [openMenuId, setOpenMenuId] = useState<string | null>(null);

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
          created_at: r?.created_at ?? null,
          compra: r?.compra ?? null,
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

    if (provRut && !isRutLike(provRut)) {
      alert("RUT proveedor inválido");
      return;
    }

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
      // --- Cabecera opcional de documento (aplica a TODO el archivo) ---
      const tipoDocKey = ["Tipo doc", "Tipo documento", "Tipo", "Documento"];
      const numDocKey = ["N° documento", "N° Doc", "Numero documento", "Número documento", "Nro documento", "Nro doc"];
      const fechaDocKey = ["Fecha doc", "Fecha documento", "Fecha"];
      const rutProvKey = ["RUT proveedor", "Rut proveedor", "RUT Proveedor", "Rut Proveedor"];
      const provKey = ["Proveedor", "Proveedor (nombre)", "Razón social", "Razon social", "Nombre proveedor"];

      const normalizeTipoDoc = (v: any) => {
        const s = String(v ?? "")
          .trim()
          .toLowerCase()
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "");
        if (!s) return "";
        if (s.includes("fact")) return "factura";
        if (s.includes("guia")) return "guia";
        if (s === "oc" || s.includes("orden") || s.includes("compra")) return "oc";
        if (s.includes("otro")) return "otro";
        // fallback conservador
        return "factura";
      };

      const normalizeExcelDate = (v: any) => {
        const s = String(v ?? "").trim();
        if (!s) return "";
        // Si el Excel trae fecha como Date, XLSX suele entregarlo como string o número.
        // Aceptamos YYYY-MM-DD o intentamos parsear y formatear.
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
        const dt = parseDateFlexible(s);
        if (Number.isNaN(dt.getTime())) return "";
        const y = dt.getFullYear();
        const m = String(dt.getMonth() + 1).padStart(2, "0");
        const d = String(dt.getDate()).padStart(2, "0");
        return `${y}-${m}-${d}`;
      };

      const firstNonEmpty = (cur: string, next: any) => {
        const s = String(next ?? "").trim();
        return cur || s;
      };

      let excelDocTipo = "";
      let excelDocNumero = "";
      let excelDocFecha = "";
      let excelProvRut = "";
      let excelProvNombre = "";

      const ingresosMasivos: any[] = [];
      rows.forEach((row, index) => {
        // Usar getCell para tolerar variantes de encabezado
        // Cabecera opcional por fila (si viene repetida en cada fila, validamos consistencia)
        const tipoDocRaw = getCell(row, tipoDocKey);
        const numDocRaw = getCell(row, numDocKey);
        const fechaDocRaw = getCell(row, fechaDocKey);
        const rutProvRaw = getCell(row, rutProvKey);
        const provRaw = getCell(row, provKey);

        const tipoDocNorm = normalizeTipoDoc(tipoDocRaw);
        const numDocNorm = String(numDocRaw ?? "").trim();
        const fechaDocNorm = normalizeExcelDate(fechaDocRaw);
        const rutProvNorm = rutProvRaw ? normalizeRut(String(rutProvRaw)) : "";
        const provNorm = String(provRaw ?? "").trim();

        // Tomar el primer valor no vacío y luego exigir consistencia si aparece otro valor distinto
        const nextTipo = tipoDocRaw ? tipoDocNorm : "";
        if (!excelDocTipo) excelDocTipo = nextTipo;
        else if (nextTipo && nextTipo !== excelDocTipo) {
          throw new Error(`Fila ${index + 2}: Tipo doc inconsistente ("${tipoDocRaw}")`);
        }

        if (!excelDocNumero) excelDocNumero = firstNonEmpty(excelDocNumero, numDocNorm);
        else if (numDocNorm && numDocNorm !== excelDocNumero) {
          throw new Error(`Fila ${index + 2}: N° documento inconsistente ("${numDocNorm}")`);
        }

        if (!excelDocFecha) excelDocFecha = firstNonEmpty(excelDocFecha, fechaDocNorm);
        else if (fechaDocNorm && fechaDocNorm !== excelDocFecha) {
          throw new Error(`Fila ${index + 2}: Fecha doc inconsistente ("${fechaDocNorm}")`);
        }

        if (!excelProvRut) excelProvRut = firstNonEmpty(excelProvRut, rutProvNorm);
        else if (rutProvNorm && rutProvNorm !== excelProvRut) {
          throw new Error(`Fila ${index + 2}: RUT proveedor inconsistente ("${rutProvNorm}")`);
        }

        if (!excelProvNombre) excelProvNombre = firstNonEmpty(excelProvNombre, provNorm);
        else if (provNorm && provNorm !== excelProvNombre) {
          throw new Error(`Fila ${index + 2}: Proveedor inconsistente ("${provNorm}")`);
        }
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

      // Validación cabecera opcional
      if (excelProvRut && !isRutLike(excelProvRut)) {
        throw new Error(`RUT proveedor inválido en cabecera: ${excelProvRut}`);
      }
      if (excelDocFecha && !/^\d{4}-\d{2}-\d{2}$/.test(excelDocFecha)) {
        throw new Error(`Fecha doc inválida en cabecera (usa YYYY-MM-DD): ${excelDocFecha}`);
      }

      // Enviar a API
      const resp = await fetch("/api/stock/ingreso-masivo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          compra:
            excelDocTipo || excelDocNumero || excelDocFecha || excelProvRut || excelProvNombre
              ? {
                  tipo: excelDocTipo || "factura",
                  numero: excelDocNumero || null,
                  fecha: excelDocFecha || null,
                  proveedor_rut: excelProvRut || null,
                  proveedor_nombre: excelProvNombre || null,
                }
              : null,
          items: ingresosMasivos,
        }),
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
        created_at: r?.created_at ?? null,
        compra: r?.compra ?? null,
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
  <div className="max-w-2xl space-y-6">
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
        Columnas esperadas (Excel): Categoría | Nombre EPP | Talla/Número | Cantidad | Monto unitario | Tipo IVA
        <span className="block mt-1">
          Opcionales (documento de compra, se aplican a todo el archivo): Tipo doc | N° documento | Fecha doc (YYYY-MM-DD) | RUT proveedor | Proveedor
        </span>
      </p>
    </div>

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
      <table className="w-full border-collapse border border-slate-300 text-sm">
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
                {row.nombre}
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
