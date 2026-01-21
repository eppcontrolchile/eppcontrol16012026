//app/api/register/route

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/* ============================
   RUT: flexible, sin rechazar
   ============================ */
function normalizarRut(rut: string) {
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

function toDateOnly(date: Date) {
  return date.toISOString().split("T")[0];
}

export async function POST(req: Request) {
  try {
    const formData = await req.formData();

    const companyName = formData.get("companyName") as string;
    const companyRut = formData.get("companyRut") as string;
    const companySize = formData.get("companySize") as string;
    const plan = formData.get("plan") as string;
    const firstName = formData.get("firstName") as string;
    const lastName = formData.get("lastName") as string;
    const email = formData.get("email") as string;
    const password = formData.get("password") as string;
    const logoFile = formData.get("companyLogo") as File | null;

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

    const rutNormalizado = normalizarRut(companyRut);
    if (!rutNormalizado) {
      return NextResponse.json(
        { error: "RUT de empresa inválido" },
        { status: 400 }
      );
    }

    const planNormalizado =
      plan === "standard" || plan === "advanced" ? plan : null;

    if (!planNormalizado) {
      return NextResponse.json(
        { error: "Plan inválido" },
        { status: 400 }
      );
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    /* ============================
       1️⃣ CREAR USUARIO AUTH (ADMIN)
       ============================ */
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (authError || !authData.user) {
      return NextResponse.json(
        { error: authError?.message || "Error creando usuario" },
        { status: 400 }
      );
    }

    const authUserId = authData.user.id;

    /* ============================
       2️⃣ EMPRESA
       ============================ */
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
      return NextResponse.json(
        { error: "Error creando empresa" },
        { status: 400 }
      );
    }

    /* ============================
       2️⃣🖼️ LOGO EMPRESA (OPCIONAL)
       ============================ */
    if (logoFile && logoFile.size > 0) {
      const arrayBuffer = await logoFile.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      const filePath = `${empresa.id}/logo.png`;

      const { error: uploadError } = await supabaseAdmin.storage
        .from("company-logos")
        .upload(filePath, buffer, {
          contentType: logoFile.type,
          upsert: true,
        });

      if (!uploadError) {
        const { data: publicUrlData } = supabaseAdmin.storage
          .from("company-logos")
          .getPublicUrl(filePath);

        if (publicUrlData?.publicUrl) {
          await supabaseAdmin
            .from("empresas")
            .update({ logo_url: publicUrlData.publicUrl })
            .eq("id", empresa.id);
        }
      }
    }

    /* ============================
       3️⃣ USUARIO INTERNO
       ============================ */
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

    /* ============================
       4️⃣ ROL ADMIN
       ============================ */
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
    console.error("REGISTER ERROR:", err);
    return NextResponse.json(
      { error: "Error inesperado" },
      { status: 500 }
    );
  }
}
