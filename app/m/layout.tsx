// app/m/layout.tsx
import type { ReactNode } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import PWARegister from "../PWARegister";

export const dynamic = "force-dynamic";
export const revalidate = 0;
export const runtime = "nodejs";

export default async function MobileLayout({ children }: { children: ReactNode }) {
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

  const { data: { user }, error: authErr } = await supabase.auth.getUser();
  if (authErr || !user) redirect("/auth/login?next=/m/entrega");

  // Resolver usuario interno
  const { data: usuarioByAuth } = await supabase
    .from("usuarios")
    .select("id, empresa_id, email, auth_user_id, activo, rol")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  let usuario = usuarioByAuth as any;

  // (Opcional) fallback por email si tienes invitaciones con auth_user_id null
  if (!usuario?.id) {
    const email = (user.email || "").trim().toLowerCase();
    if (email) {
      const { data: usuarioByEmail } = await supabase
        .from("usuarios")
        .select("id, empresa_id, email, auth_user_id, activo, rol")
        .eq("email", email)
        .maybeSingle();

      usuario = usuarioByEmail as any;
    }
  }

  if (!usuario?.id) redirect("/auth/login?next=/m/entrega&reason=missing_usuario");

  if (usuario.activo === false) {
    redirect("/auth/login?next=/m/entrega&reason=inactive");
  }

  if (!usuario.empresa_id) {
    redirect("/auth/login?next=/m/entrega&reason=missing_empresa_id");
  }

  // Layout ultra simple
  return (
    <div className="min-h-dvh bg-zinc-50">
      <PWARegister />
      <div className="mx-auto max-w-md p-4">
        {children}
      </div>
    </div>
  );
}
