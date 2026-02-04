// app/dashboard/layout.tsx
import type React from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import DashboardShell from "./DashboardShell";

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  // cookies() es async en Next 16
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
          } catch {
            // no-op
          }
        },
      },
    }
  );

  // 1️⃣ Validar sesión
  const {
    data: { user },
  } = await supabase.auth.getUser();


  if (!user) {
    redirect("/auth/login");
  }

  // 2️⃣ Usuario interno
  const { data: usuario, error: usuarioError } = await supabase
    .from("usuarios")
    .select("rol, empresa_id")
    .eq("auth_user_id", user.id)
    .single();


  if (usuarioError || !usuario) {
    // Usuario autenticado pero sin fila interna: deriva a onboarding/registro
    redirect("/auth/register");
  }

  // 3️⃣ Empresa
  const { data: empresa, error: empresaError } = await supabase
    .from("empresas")
    .select(
      "nombre, rut, plan_tipo, logo_url, onboarding_completado, onboarding_configuracion_completa"
    )
    .eq("id", usuario.empresa_id)
    .single();


  if (empresaError || !empresa) {
    // Usuario autenticado pero empresa no accesible/no existe: envía a onboarding
    redirect("/onboarding/configuracion");
  }

  // Normalizar valores a los unions esperados por DashboardShell
  const plan = empresa.plan_tipo === "advanced" ? "advanced" : "standard";
  const rol =
    usuario.rol === "admin" ||
    usuario.rol === "supervisor" ||
    usuario.rol === "bodega" ||
    usuario.rol === "solo_lectura"
      ? usuario.rol
      : "solo_lectura";

  // 3️⃣.1 Onboarding gate: si no está completado, deriva al paso correcto
  if (!empresa.onboarding_configuracion_completa) {
    redirect("/onboarding/configuracion");
  }

  if (!empresa.onboarding_completado) {
    redirect("/onboarding/primeros-datos");
  }

  // 4️⃣ Render con contexto completo
  return (
    <DashboardShell
      companyName={empresa.nombre}
      companyRut={empresa.rut}
      plan={plan}
      rol={rol}
      companyLogoUrl={empresa.logo_url}
    >
      {children}
    </DashboardShell>
  );
}
