// app/m/page.tsx
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import Link from "next/link";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function MRoot() {
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

  const {
    data: { user },
  } = await supabase.auth.getUser();

  let rol = "";

  if (user) {
    const { data: usuario } = await supabase
      .from("usuarios")
      .select("rol")
      .eq("auth_user_id", user.id)
      .maybeSingle();

    rol = String(usuario?.rol ?? "").toLowerCase();
  }

  const canMoveStock =
    rol === "admin" ||
    rol === "jefe_area" ||
    rol === "bodega" ||
    rol === "superadmin";

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Operaciones</h1>

      <Link
        href="/m/entrega"
        className="block rounded-lg border bg-white p-4 text-center text-sm font-medium hover:bg-zinc-50"
      >
        Registrar entrega
      </Link>

      {canMoveStock && (
        <Link
          href="/m/mover-stock"
          className="block rounded-lg border bg-white p-4 text-center text-sm font-medium hover:bg-zinc-50"
        >
          Mover stock
        </Link>
      )}
    </div>
  );
}
