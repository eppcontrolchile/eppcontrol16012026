// app/utils/stock.ts

export type StockLote = {
  id: string;
  cantidadDisponible: number;
  valorUnitario: number; // IVA incluido
  fechaIngreso: string;
};

export type StockItem = {
  id: string;
  categoria: string;
  nombre: string;
  talla: string | null;
  stockCritico: number;
  lotes: StockLote[];
};

const STORAGE_KEY = "stockItems";

/**
 * Obtiene todo el stock desde localStorage
 */
export function getStock(): StockItem[] {
  if (typeof window === "undefined") return [];
  const raw = localStorage.getItem(STORAGE_KEY);
  return raw ? JSON.parse(raw) : [];
}

/**
 * Guarda el stock completo en localStorage
 */
export function saveStock(stock: StockItem[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(stock));
}

/**
 * Busca un item de stock por categoria + nombre + talla
 */
export function findStockItem(
  categoria: string,
  nombre: string,
  talla: string | null
): StockItem | undefined {
  const stock = getStock();
  return stock.find(
    (item) =>
      item.categoria === categoria &&
      item.nombre === nombre &&
      item.talla === talla
  );
}

function calcularCantidadTotal(lotes: StockLote[]) {
  return lotes.reduce((sum, l) => sum + l.cantidadDisponible, 0);
}

export function getCantidadTotal(item: StockItem): number {
  return calcularCantidadTotal(item.lotes);
}

/**
 * Agrega stock (Ingreso)
 */
export function addStockItem(data: {
  categoria: string;
  nombre: string;
  talla: string | null;
  cantidad: number;
  valorUnitario: number;
  stockCritico?: number;
}) {
  if (data.valorUnitario <= 0) {
    throw new Error("El valor unitario debe ser mayor a 0");
  }

  const stock = getStock();

  const existente = stock.find(
    (item) =>
      item.categoria === data.categoria &&
      item.nombre === data.nombre &&
      item.talla === data.talla
  );

  const nuevoLote: StockLote = {
    id: crypto.randomUUID(),
    cantidadDisponible: data.cantidad,
    valorUnitario: data.valorUnitario,
    fechaIngreso: new Date().toISOString(),
  };

  if (existente) {
    existente.lotes.push(nuevoLote);
  } else {
    stock.push({
      id: crypto.randomUUID(),
      categoria: data.categoria,
      nombre: data.nombre,
      talla: data.talla,
      stockCritico: data.stockCritico ?? 5,
      lotes: [nuevoLote],
    });
  }

  saveStock(stock);
}

/**
 * Descuenta stock (Egreso)
 */
export function removeStockItem(data: {
  categoria: string;
  nombre: string;
  talla: string | null;
  cantidad: number;
}) {
  const stock = getStock();

  const existente = stock.find(
    (item) =>
      item.categoria === data.categoria &&
      item.nombre === data.nombre &&
      item.talla === data.talla
  );

  if (!existente) {
    throw new Error("El EPP seleccionado no existe en stock");
  }

  let restante = data.cantidad;
  let costoTotal = 0;

  for (const lote of existente.lotes) {
    if (restante <= 0) break;

    const usar = Math.min(lote.cantidadDisponible, restante);
    lote.cantidadDisponible -= usar;
    restante -= usar;

    costoTotal += usar * lote.valorUnitario;
  }

  if (restante > 0) {
    throw new Error("Stock insuficiente para el EPP seleccionado");
  }

  saveStock(stock);

  return {
    costoTotal,
  };
}

/**
 * Obtiene solo stock disponible (> 0)
 */
export function getStockDisponible(): StockItem[] {
  return getStock().filter(
    (item) => calcularCantidadTotal(item.lotes) > 0
  );
}

/**
 * Actualiza stock crítico por ID (alineado con dashboard)
 */
export function updateStockCritico(data: {
  id: string;
  stockCritico: number;
}) {
  if (data.stockCritico < 0) {
    throw new Error("El stock crítico no puede ser negativo");
  }

  const stock = getStock();

  const item = stock.find((s) => s.id === data.id);

  if (!item) {
    throw new Error("El item de stock no existe");
  }

  item.stockCritico = data.stockCritico;

  saveStock(stock);
}

/**
 * Obtiene todos los stock críticos configurados
 */
export function getStockCriticos(): Record<string, number> {
  if (typeof window === "undefined") return {};

  const stock = getStock();
  const result: Record<string, number> = {};

  stock.forEach((item) => {
    const key = `${item.categoria}|${item.nombre}|${item.talla || ""}`;
    result[key] = item.stockCritico;
  });

  return result;
}
