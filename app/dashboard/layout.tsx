// app/dashboard/layout.tsx
import type { ReactNode } from "react";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import DashboardShell from "./DashboardShell";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export type PlanTipo = "standard" | "advanced";
export type UserRole =
  | "admin"
  | "supervisor"
  | "bodega"
  | "solo_entrega"
  | "gerencia"
  | "superadmin";

function normalizePlanTipo(planTipo: unknown): PlanTipo {
  return planTipo === "advanced" ? "advanced" : "standard";
}

function normalizeUserRole(role: unknown): UserRole {
  if (
    role === "admin" ||
    role === "supervisor" ||
    role === "bodega" ||
    role === "solo_entrega" ||
    role === "gerencia" ||
    role === "superadmin"
  ) {
    return role as UserRole;
  }
  return "solo_entrega";
}

function redirectToRegister(reason: string): never {
  const q = new URLSearchParams({ reason }).toString();
  return redirect(`/auth/register?${q}`);
}

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  // cookies() es async en Next 16
  const cookieStore = await cookies();

  // ─────────────────────────────────────────────
  // 🔐 Modo soporte (impersonación)
  // Cookie httpOnly: epp_impersonate = base64url(JSON { empresa_id, usuario_id })
  // ─────────────────────────────────────────────
  let impersonatedEmpresaId: string | null = null;
  let impersonatedUsuarioId: string | null = null;

  const impCookie = cookieStore.get("epp_impersonate")?.value;
  if (impCookie) {
    try {
      const decoded = JSON.parse(Buffer.from(impCookie, "base64url").toString("utf8"));
      if (decoded?.empresa_id && decoded?.usuario_id) {
        impersonatedEmpresaId = String(decoded.empresa_id);
        impersonatedUsuarioId = String(decoded.usuario_id);
      }
    } catch {
      // cookie corrupta → ignorar
    }
  }

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
            // En Server Components, setAll puede fallar si el render ocurre en un contexto
            // donde Next no permite mutar cookies. No bloqueamos el render.
          }
        },
      },
    }
  );

  // 1) Validar sesión
  const {
    data: { user },
    error: authErr,
  } = await supabase.auth.getUser();

  if (authErr || !user) {
    redirect("/auth/login");
  }

  // 2) Resolver usuario interno
  // - Normal: primario por auth_user_id, fallback por email
  // - Soporte: si existe cookie epp_impersonate, resolvemos por usuarios.id (impersonatedUsuarioId)

  let usuario: any = null;
  let usuarioAuthErr: any = null;

  if (impersonatedUsuarioId) {
    // En modo soporte usamos service-role para evitar RLS/mismatch de empresa.
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
      redirectToRegister("missing_service_role");
    }

    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data: impUser, error: impErr } = await admin
      .from("usuarios")
      .select("id, rol, empresa_id, email, auth_user_id, activo")
      .eq("id", impersonatedUsuarioId)
      .maybeSingle();

    usuarioAuthErr = impErr;
    usuario = impUser as any;

    // Si además venía empresa_id en la cookie, forzamos consistencia.
    if (usuario?.empresa_id && impersonatedEmpresaId && String(usuario.empresa_id) !== String(impersonatedEmpresaId)) {
      // Cookie inconsistente: ignora impersonación para no quedar en loop.
      impersonatedEmpresaId = null;
      impersonatedUsuarioId = null;
      usuario = null;
      usuarioAuthErr = null;
    }
  }

  if (!usuario?.id) {
    const { data: usuarioByAuth, error: authErr2 } = await supabase
      .from("usuarios")
      .select("id, rol, empresa_id, email, auth_user_id, activo")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    usuarioAuthErr = authErr2;
    usuario = usuarioByAuth as any;

    // Fallback: invitaciones/recovery pueden tener auth_user_id null en tabla usuarios
    if (!usuario?.id) {
      const email = (user.email || "").trim().toLowerCase();

      if (email) {
        const { data: usuarioByEmail, error: usuarioEmailErr } = await supabase
          .from("usuarios")
          .select("id, rol, empresa_id, email, auth_user_id, activo")
          .eq("email", email)
          .maybeSingle();

        if (usuarioEmailErr) {
          // Usuario autenticado pero sin fila interna resolvible
          redirectToRegister("missing_usuario_by_email");
        }

        if (usuarioByEmail?.id) {
          // Intentamos linkear auth_user_id si falta (si RLS lo permite)
          if (!usuarioByEmail.auth_user_id) {
            const { error: linkErr } = await supabase
              .from("usuarios")
              .update({ auth_user_id: user.id })
              .eq("id", usuarioByEmail.id);

            usuario = linkErr
              ? usuarioByEmail
              : { ...usuarioByEmail, auth_user_id: user.id };
          } else {
            usuario = usuarioByEmail;
          }
        }
      }
    }
  }

  if (usuarioAuthErr || !usuario?.id) {
    // Usuario autenticado pero sin fila interna: deriva a onboarding/registro
    redirectToRegister("missing_usuario");
  }

  if (usuario.activo === false) {
    redirect("/auth/bloqueado");
  }

  if (!usuario.empresa_id) {
    redirectToRegister("missing_empresa_id");
  }

  // 3) Empresa
  // En modo soporte, la sesión del superadmin NO pasa RLS para leer la empresa del usuario impersonado.
  // Por eso, cuando hay impersonación usamos service-role, pero SIEMPRE scopiado por empresa_id.
  const empresaIdForLookup = String(impersonatedEmpresaId ?? usuario.empresa_id);

  if (impersonatedUsuarioId && !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    redirectToRegister("missing_service_role");
  }

  const empresaClient = impersonatedUsuarioId
    ? createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      )
    : supabase;

  const { data: empresa, error: empresaError } = await empresaClient
    .from("empresas")
    .select(
      "nombre, rut, plan_tipo, logo_url, onboarding_completado, onboarding_configuracion_completa"
    )
    .eq("id", empresaIdForLookup)
    .maybeSingle();

  if (empresaError || !empresa) {
    // Usuario autenticado pero empresa no accesible/no existe
    redirectToRegister("missing_empresa");
  }

  // 3.1) Onboarding gate
  if (!empresa.onboarding_configuracion_completa) {
    redirect("/onboarding/configuracion");
  }

  if (!empresa.onboarding_completado) {
    redirect("/onboarding/primeros-datos");
  }

  // 4) Normalización plan + rol
  const plan = normalizePlanTipo((empresa as any).plan_tipo);

  // Rol: usamos `usuarios.rol` como fuente primaria (compat actual).
  // Si viene vacío, resolvemos desde usuarios_roles -> roles.nombre.
  let rawRol: unknown = (usuario as any).rol;

  if (!rawRol) {
    const { data: ur } = await supabase
      .from("usuarios_roles")
      // FK: usuarios_roles.rol_id -> roles.id
      .select("roles:rol_id(nombre)")
      .eq("usuario_id", usuario.id)
      .maybeSingle();

    rawRol = (ur as any)?.roles?.nombre ?? rawRol;
  }

  const rol = normalizeUserRole(rawRol);
  // DashboardShell no debe recibir "superadmin" (ese rol se redirige a /admin).
  // Aun así, tipamos defensivo para que TypeScript no falle.
  type ShellRole = Exclude<UserRole, "superadmin">;
  const rolForShell: ShellRole = (rol === "superadmin" ? "admin" : rol) as ShellRole;

  // Soporte (superadmin) no debe entrar al dashboard normal.
  // Redirigimos al panel /admin para evitar UI/menus incorrectos.
  if (rol === "superadmin" && !impersonatedUsuarioId) {
    redirect("/admin");
  }

  // 5) Render
  return (
    <DashboardShell
      companyName={empresa.nombre}
      companyRut={empresa.rut}
      plan={plan}
      rol={rolForShell}
      companyLogoUrl={empresa.logo_url}
    >
      {children}
    </DashboardShell>
  );
}
