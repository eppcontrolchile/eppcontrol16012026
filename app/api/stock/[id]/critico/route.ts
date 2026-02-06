//app/api/stock/[id]/critico/route.ts

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: rawId } = await params;
  // id may come URL-encoded from the frontend
  const id = decodeURIComponent(rawId);
  const body = await req.json().catch(() => null);
  const stock_critico = Number(body?.stock_critico);

  if (!Number.isFinite(stock_critico) || stock_critico < 0) {
    return NextResponse.json(
      { error: "stock_critico inválido" },
      { status: 400 }
    );
  }

  // El id viene como:
  // empresa_id|categoria|nombre|talla
  const [empresa_id, categoria, nombre_epp, tallaRaw] = id.split("|");

  const talla = tallaRaw ?? "";

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from("stock_criticos")
    .upsert(
      {
        empresa_id,
        categoria,
        nombre_epp,
        talla,
        stock_critico,
      },
      {
        onConflict: "empresa_id,categoria,nombre_epp,talla",
      }
    );

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
