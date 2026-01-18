// app/api/register/route.ts
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

// 🔹 Validar y normalizar RUT chileno (XXXXXXXX-X)
function validarYNormalizarRut(rut: string) {
  const limpio = rut.replace(/\./g, "").replace(/-/g, "").toUpperCase();

  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return null;

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);

  let suma = 0;
  let multiplo = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i], 10) * multiplo;
    multiplo = multiplo < 7 ? multiplo + 1 : 2;
  }

  const resto = 11 - (suma % 11);
  const dvEsperado =
    resto === 11 ? "0" : resto === 10 ? "K" : resto.toString();

  if (dv !== dvEsperado) return null;

  return `${cuerpo}-${dv}`;
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

    // Cliente con SERVICE ROLE (solo backend)
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // 1️⃣ CREAR USUARIO AUTH (FORMA CORRECTA)
    const { data: signUpData, error: signUpError } =
      await supabaseAdmin.auth.signUp({
        email,
        password,
      });

    if (signUpError || !signUpData.user) {
      return NextResponse.json(
        { error: signUpError?.message || "Error creando usuario" },
        { status: 400 }
      );
    }

    const authUserId = signUpData.user.id;

    // 2️⃣ Crear empresa
    const limite =
      companySize === "25"
        ? 25
        : companySize === "50"
        ? 50
        : companySize === "100"
        ? 100
        : 9999;

    const { data: empresa, error: empresaError } = await supabaseAdmin
      .from("empresas")
      .insert({
        nombre: companyName,
        rut: rutNormalizado,
        plan_tipo: plan,
        limite_trabajadores: limite,
        trial_inicio: new Date().toISOString(),
        trial_fin: new Date(
          Date.now() + 7 * 24 * 60 * 60 * 1000
        ).toISOString(),
        estado_plan: "trial",
        onboarding_completado: false,
      })
      .select()
      .single();

    if (empresaError || !empresa) {
      return NextResponse.json(
        { error: "Error creando empresa" },
        { status: 400 }
      );
    }

    // 3️⃣ Crear usuario interno
    const { data: usuario, error: usuarioError } = await supabaseAdmin
      .from("usuarios")
      .insert({
        empresa_id: empresa.id,
        nombre: `${firstName} ${lastName}`,
        email,
        auth_user_id: authUserId,
        activo: true,
      })
      .select()
      .single();

    if (usuarioError || !usuario) {
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
        usuario_id: usuario.id,
        rol_id: rolAdmin.id,
      });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || "Error inesperado" },
      { status: 500 }
    );
  }
}
