// app/api/suscripcion/route.ts
import { NextResponse } from "next/server";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

function mapPlanTipo(plan: any): "STANDARD" | "ADVANCED" {
  const p = (plan ?? "").toString().trim().toLowerCase();
  // DB puede venir como: advanced | ADVANCED | avanzado | adv
  return p === "advanced" || p === "adv" || p === "avanzado" ? "ADVANCED" : "STANDARD";
}

function mapTramo(limite: number): "25" | "50" | "100" | "+100" {
  if (limite <= 25) return "25";
  if (limite <= 50) return "50";
  if (limite <= 100) return "100";
  return "+100";
}

function valorPlan(plan: "STANDARD" | "ADVANCED", _tramo: string) {
  // Ajusta estos valores cuando definas pricing real
  if (plan === "ADVANCED") return 49990;
  return 29990;
}

export async function GET() {
  const baseHeaders = { "Cache-Control": "no-store", "X-EPP-API": "suscripcion" } as const;

  const cookieStore = await cookies();

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (cookiesToSet) => {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          } catch {}
        },
      },
    }
  );

  const { data: auth } = await supabase.auth.getUser();
  const user = auth?.user;
  if (!user) {
    return NextResponse.json({ error: "No auth" }, { status: 401, headers: baseHeaders });
  }

  // Usuario interno (primario: auth_user_id; fallback: email)
  const { data: uByAuth, error: uAuthErr } = await supabase
    .from("usuarios")
    .select("id, empresa_id, activo")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let u: any = uByAuth;

  if ((!u?.empresa_id || uAuthErr) && user.email) {
    const email = user.email.trim().toLowerCase();
    const { data: uByEmail } = await supabase
      .from("usuarios")
      .select("id, empresa_id, activo")
      .eq("email", email)
      .maybeSingle();
    u = uByEmail;
  }

  if (!u?.empresa_id) {
    return NextResponse.json({ error: "Missing usuario/empresa" }, { status: 400, headers: baseHeaders });
  }

  // Empresa
  const { data: e, error: eErr } = await supabase
    .from("empresas")
    .select("plan_tipo, limite_trabajadores, estado_plan, trial_fin")
    .eq("id", u.empresa_id)
    .single();

  if (eErr || !e) {
    return NextResponse.json(
      { error: eErr?.message || "Missing empresa" },
      { status: 400, headers: baseHeaders }
    );
  }

  // Conteo trabajadores activos (ajusta campo si tu tabla usa otro nombre)
  const { count, error: cErr } = await supabase
    .from("trabajadores")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", u.empresa_id)
    .eq("activo", true);

  if (cErr) {
    return NextResponse.json({ error: cErr.message }, { status: 400, headers: baseHeaders });
  }

  const plan = mapPlanTipo(e.plan_tipo);
  const limite = Number(e.limite_trabajadores || 25);
  const tramo = mapTramo(limite);

  // Estado simple (puedes hacerlo más fino)
  const estadoPlan = (e.estado_plan ?? "").toString().trim().toLowerCase();
  let estado: "Activa" | "Trial" | "Vencida" = estadoPlan === "trial" ? "Trial" : "Activa";
  if (e.trial_fin) {
    const fin = new Date(e.trial_fin);
    if (!Number.isNaN(fin.getTime()) && fin < new Date() && estadoPlan === "trial") {
      estado = "Vencida";
    }
  }

  const payload = {
    plan,
    tramo,
    estado,
    valorPlan: valorPlan(plan, tramo),
    trabajadoresActivos: count ?? 0,
    limiteTrabajadores: limite,
    proximoPago: null,
    pagos: [],
  };

  return NextResponse.json(payload, { headers: baseHeaders });
}
