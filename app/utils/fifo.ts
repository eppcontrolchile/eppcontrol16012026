// app/utils/fifo.ts

export type LoteFIFO = {
  id: string;
  categoria: string;
  nombreEpp: string;
  talla: string | null;

  cantidadInicial: number;     // cantidad ingresada originalmente
  cantidadDisponible: number;  // stock restante

  costoUnitarioIVA: number;
  fechaIngreso: string; // ISO
};

const STORAGE_KEY = "fifoLotes";

/* =========================
   Helpers internos
========================= */

function getAllLotes(): LoteFIFO[] {
  const lotes = JSON.parse(
    localStorage.getItem(STORAGE_KEY) || "[]"
  );

  // compatibilidad con lotes antiguos (sin cantidadInicial)
  return lotes.map((l: any) => ({
    ...l,
    cantidadInicial:
      l.cantidadInicial ?? l.cantidadDisponible,
  }));
}

function saveAllLotes(lotes: LoteFIFO[]) {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(lotes)
  );
}

/* =========================
   Ingreso → crear lote FIFO
========================= */

export function addLoteFIFO(params: {
  categoria: string;
  nombreEpp: string;
  talla: string | null;
  cantidad: number;
  costoUnitarioIVA: number;
}) {
  const lotes = getAllLotes();

  const nuevo: LoteFIFO = {
    id: crypto.randomUUID(),
    categoria: params.categoria,
    nombreEpp: params.nombreEpp,
    talla: params.talla,

    cantidadInicial: params.cantidad,
    cantidadDisponible: params.cantidad,

    costoUnitarioIVA: params.costoUnitarioIVA,
    fechaIngreso: new Date().toISOString(),
  };

  saveAllLotes([...lotes, nuevo]);
}

/* =========================
   Stock → lectura desde FIFO
========================= */

export function getStockDesdeFIFO() {
  const lotes = getAllLotes();

  const stockMap = new Map<
    string,
    {
      categoria: string;
      nombreEpp: string;
      talla: string | null;
      cantidad: number;
    }
  >();

  lotes.forEach((l) => {
    if (l.cantidadDisponible <= 0) return;

    const key = `${l.categoria}|${l.nombreEpp}|${
      l.talla || ""
    }`;

    const actual = stockMap.get(key);

    if (actual) {
      actual.cantidad += l.cantidadDisponible;
    } else {
      stockMap.set(key, {
        categoria: l.categoria,
        nombreEpp: l.nombreEpp,
        talla: l.talla,
        cantidad: l.cantidadDisponible,
      });
    }
  });

  return Array.from(stockMap.values());
}

/* =========================
   Egreso → consumir FIFO
========================= */

export function consumirFIFO(params: {
  categoria: string;
  nombreEpp: string;
  talla: string | null;
  cantidad: number;
}) {
  let restante = params.cantidad;
  const lotes = getAllLotes()
    .filter(
      (l) =>
        l.categoria === params.categoria &&
        l.nombreEpp === params.nombreEpp &&
        l.talla === params.talla &&
        l.cantidadDisponible > 0
    )
    .sort(
      (a, b) =>
        new Date(a.fechaIngreso).getTime() -
        new Date(b.fechaIngreso).getTime()
    );

  const consumos: {
    loteId: string;
    cantidad: number;
    costoUnitarioIVA: number;
  }[] = [];

  for (const lote of lotes) {
    if (restante <= 0) break;

    const usar = Math.min(
      lote.cantidadDisponible,
      restante
    );

    lote.cantidadDisponible -= usar;
    restante -= usar;

    consumos.push({
      loteId: lote.id,
      cantidad: usar,
      costoUnitarioIVA: lote.costoUnitarioIVA,
    });
  }

  if (restante > 0) {
    throw new Error(
      "Stock insuficiente para realizar el egreso"
    );
  }

  saveAllLotes(getAllLotes().map((l) => {
    const mod = lotes.find((x) => x.id === l.id);
    return mod ? mod : l;
  }));

  return {
    consumos,
    costoTotal: consumos.reduce(
      (acc, c) =>
        acc + c.cantidad * c.costoUnitarioIVA,
      0
    ),
  };
}

/* =========================
   Utilidades
========================= */

export function clearFIFO() {
  localStorage.removeItem(STORAGE_KEY);
}
