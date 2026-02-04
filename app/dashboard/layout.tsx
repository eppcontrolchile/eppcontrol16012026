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
    redirect("/auth/login");
  }

  // 3️⃣ Empresa
  const { data: empresa, error: empresaError } = await supabase
    .from("empresas")
    .select("nombre, rut, plan_tipo, logo_url")
    .eq("id", usuario.empresa_id)
    .single();


  if (empresaError || !empresa) {
    redirect("/auth/login");
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
