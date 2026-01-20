import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 🔹 Normalizar RUT chileno (XXXXXXXX-X)
function validarYNormalizarRut(rut: string) {
  if (!rut) return null;

  const limpio = rut
    .replace(/\./g, "")
    .replace(/-/g, "")
    .trim()
    .toUpperCase();

  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return null;

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);

  return `${cuerpo}-${dv}`;
}

// 🔹 Date → YYYY-MM-DD (Postgres date)
function toDateOnly(date: Date) {
  return date.toISOString().split("T")[0];
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      companyName,
      companyRut,
      companySize,
      plan,
      firstName,
      lastName,
      email,
      password,
    } = body;

    if (
      !companyName ||
      !companyRut ||
      !companySize ||
      !plan ||
      !firstName ||
      !lastName ||
      !email ||
      !password
    ) {
      return NextResponse.json(
        { error: "Datos incompletos" },
        { status: 400 }
      );
    }

    const rutNormalizado = validarYNormalizarRut(companyRut);
    if (!rutNormalizado) {
      return NextResponse.json(
        { error: "RUT de empresa inválido" },
        { status: 400 }
      );
    }

    const planNormalizado =
      plan === "advanced" ? "advanced" :
      plan === "standard" ? "standard" :
      null;

    if (!planNormalizado) {
      return NextResponse.json(
        { error: "Plan inválido" },
        { status: 400 }
      );
    }

    // 🔐 Cliente ADMIN (bypass RLS)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1️⃣ CREAR USUARIO AUTH (FORMA CORRECTA)
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || "Error creando usuario auth" },
        { status: 400 }
      );
    }

    const authUserId = authData.user.id;

    // 2️⃣ Crear empresa
    const limite =
      companySize === "25" ? 25 :
      companySize === "50" ? 50 :
      companySize === "100" ? 100 :
      9999;

    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from("empresas")
      .insert({
        nombre: companyName,
        rut: rutNormalizado,
        plan_tipo: planNormalizado,
        limite_trabajadores: limite,
        trial_inicio: toDateOnly(new Date()),
        trial_fin: toDateOnly(
          new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
        ),
        estado_plan: "trial",
        onboarding_completado: false,
      })
      .select()
      .single();

    if (empresaError || !empresa) {
      console.error("❌ EMPRESA ERROR:", empresaError);
      return NextResponse.json(
        { error: "Error creando empresa" },
        { status: 400 }
      );
    }

    // 3️⃣ Usuario interno
    const { error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .insert({
        empresa_id: empresa.id,
        nombre: `${firstName} ${lastName}`,
        email,
        auth_user_id: authUserId,
        activo: true,
      });

    if (usuarioError) {
      return NextResponse.json(
        { error: "Error creando usuario interno" },
        { status: 400 }
      );
    }

    // 4️⃣ Rol admin
    const { data: rolAdmin } = await supabaseAdmin
      .from("roles")
      .select("id")
      .eq("nombre", "admin")
      .single();

    if (rolAdmin) {
      await supabaseAdmin.from("usuarios_roles").insert({
        usuario_id: authUserId,
        rol_id: rolAdmin.id,
      });
    }

    return NextResponse.json({ ok: true });

  } catch (err: any) {
    console.error("❌ REGISTER ERROR:", err);
    return NextResponse.json(
      { error: err.message || "Error inesperado" },
      { status: 500 }
    );
  }
}
