// app/dashboard/layout.tsx
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

  console.log("DASHBOARD USER:", user);

  if (!user) {
    redirect("/auth/login");
  }

  // 2️⃣ Usuario interno
  const { data: usuario, error: usuarioError } = await supabase
    .from("usuarios")
    .select("rol, empresa_id")
    .eq("auth_user_id", user.id)
    .single();

  console.log("USUARIO DB:", usuario, usuarioError);

  if (usuarioError || !usuario) {
    redirect("/auth/login");
  }

  // 3️⃣ Empresa
  const { data: empresa, error: empresaError } = await supabase
    .from("empresas")
    .select("nombre, rut, plan_tipo, logo_url")
    .eq("id", usuario.empresa_id)
    .single();

  console.log("EMPRESA DB:", empresa, empresaError);

  if (empresaError || !empresa) {
    redirect("/auth/login");
  }

  // 4️⃣ Render con contexto completo
  return (
    <DashboardShell
      companyName={empresa.nombre}
      companyRut={empresa.rut}
      plan={empresa.plan_tipo}
      rol={usuario.rol}
      companyLogoUrl={empresa.logo_url}
    >
      {children}
    </DashboardShell>
  );
}
