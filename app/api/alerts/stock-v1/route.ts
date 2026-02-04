// app/api/alerts/stock-v1/route.ts

/**
 * ALERTAS DE STOCK — V1 (pendiente)
 *
 * Este endpoint reemplazará:
 *   app/api/alerts/stock/route.ts (legacy, localStorage)
 *
 * Fuente de verdad:
 * - lotes_epp
 * - entrega_items
 * - egresos
 *
 * Reglas:
 * - Multiempresa (empresa_id obligatorio)
 * - Respeta configuración:
 *   - empresas.email_gerencia
 *   - empresas.email_alertas
 *   - empresas.stock_critico_activo
 *   - empresas.frecuencia_alertas
 * - Evita duplicados (persistencia en BD)
 *
 * Se implementa DESPUÉS de:
 * ✔ cierre dashboard
 * ✔ cierre stock real
 * ✔ pruebas post-deploy
 */

import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json({
    ok: false,
    reason: "alerts-stock-v1-not-implemented-yet",
  });
}
