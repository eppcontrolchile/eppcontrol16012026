//app/api/stock/[id]/critico/route.ts

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function PATCH(
  req: Request,
  { params }: { params: { id: string } }
) {
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
  const [empresa_id, categoria, nombre_epp, tallaRaw] = params.id.split("|");

  const talla = tallaRaw || null;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const { error } = await supabase
    .from("stock_criticos")
    .upsert({
      empresa_id,
      categoria,
      nombre_epp,
      talla,
      stock_critico,
    });

  if (error) {
    return NextResponse.json(
      { error: error.message },
      { status: 400 }
    );
  }

  return NextResponse.json({ ok: true });
}
