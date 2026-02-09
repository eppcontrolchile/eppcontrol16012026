// app/dashboard/usuarios/page.tsx


"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Rol = { id: string; nombre: string };

type UsuarioRow = {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  rol: string | null; // compat con tu app actual
};

export default function UsuariosPage() {
  const supabase = supabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [miRol, setMiRol] = useState<string | null>(null);

  const [roles, setRoles] = useState<Rol[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);

  const rolesByName = useMemo(() => {
    const m = new Map<string, Rol>();
    roles.forEach((r) => m.set(r.nombre, r));
    return m;
  }, [roles]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const {
          data: { user },
          error: userErr,
        } = await supabase.auth.getUser();
        if (userErr) throw userErr;
        if (!user) throw new Error("No autenticado");

        // 1) Resolver usuario interno (empresa + rol)
        const { data: me, error: meErr } = await supabase
          .from("usuarios")
          .select("empresa_id, rol")
          .eq("auth_user_id", user.id)
          .maybeSingle();

        if (meErr) throw meErr;
        if (!me?.empresa_id) throw new Error("No se pudo resolver empresa_id");

        if (cancelled) return;
        setEmpresaId(me.empresa_id);
        setMiRol(me.rol ?? null);

        // 2) Roles disponibles
        const { data: rolesData, error: rolesErr } = await supabase
          .from("roles")
          .select("id,nombre")
          .order("nombre", { ascending: true });

        if (rolesErr) throw rolesErr;

        // 3) Usuarios de la empresa
        const { data: usuariosData, error: usuariosErr } = await supabase
          .from("usuarios")
          .select("id,nombre,email,activo,rol")
          .eq("empresa_id", me.empresa_id)
          .order("nombre", { ascending: true });

        if (usuariosErr) throw usuariosErr;

        if (cancelled) return;
        setRoles((rolesData as Rol[]) ?? []);
        setUsuarios((usuariosData as UsuarioRow[]) ?? []);
      } catch (e: any) {
        console.error("USUARIOS PAGE LOAD ERROR", e);
        if (!cancelled) setError(e?.message ?? "Error cargando usuarios");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [supabase]);

  async function syncUsuarioRol(usuarioId: string, rolNombre: string) {
    // Mantener compatibilidad con app actual: usuarios.rol
    const { error: upErr } = await supabase
      .from("usuarios")
      .update({ rol: rolNombre })
      .eq("id", usuarioId);

    if (upErr) throw upErr;

    // Sincronizar usuarios_roles (1 rol por usuario)
    const rol = rolesByName.get(rolNombre);
    if (!rol) return; // si no existe por data, no rompe

    // borrar roles previos y setear el nuevo
    const { error: delErr } = await supabase
      .from("usuarios_roles")
      .delete()
      .eq("usuario_id", usuarioId);

    if (delErr) throw delErr;

    const { error: insErr } = await supabase.from("usuarios_roles").insert({
      usuario_id: usuarioId,
      rol_id: rol.id,
    });

    if (insErr) throw insErr;
  }

  async function toggleActivo(usuarioId: string, activo: boolean) {
    const { error: err } = await supabase
      .from("usuarios")
      .update({ activo })
      .eq("id", usuarioId);

    if (err) throw err;
  }

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-4 text-sm text-zinc-600">
        Cargando usuarios...
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

  // Gate: solo admin
  if (miRol !== "admin") {
    return (
      <div className="rounded-lg border bg-white p-4 text-sm text-zinc-700">
        No tienes permisos para administrar usuarios y roles.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold">Usuarios y roles</h1>
        <p className="text-sm text-zinc-500">
          Administra los accesos de tu empresa.
        </p>
      </div>

      <div className="overflow-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50">
            <tr>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Rol</th>
              <th className="p-2 text-center">Activo</th>
              <th className="p-2 text-right">Acción</th>
            </tr>
          </thead>
          <tbody>
            {usuarios.map((u) => (
              <tr key={u.id} className="border-t">
                <td className="p-2">{u.nombre}</td>
                <td className="p-2">{u.email}</td>
                <td className="p-2">
                  <select
                    className="input"
                    value={u.rol ?? "solo_lectura"}
                    onChange={(e) => {
                      const v = e.target.value;
                      setUsuarios((prev) =>
                        prev.map((x) => (x.id === u.id ? { ...x, rol: v } : x))
                      );
                    }}
                  >
                    {(roles.length ? roles : [
                      { id: "x", nombre: "admin" },
                      { id: "x", nombre: "supervisor" },
                      { id: "x", nombre: "bodega" },
                      { id: "x", nombre: "solo_lectura" },
                    ]).map((r) => (
                      <option key={r.nombre} value={r.nombre}>
                        {r.nombre}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="p-2 text-center">
                  <input
                    type="checkbox"
                    checked={!!u.activo}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUsuarios((prev) =>
                        prev.map((x) =>
                          x.id === u.id ? { ...x, activo: checked } : x
                        )
                      );
                    }}
                  />
                </td>
                <td className="p-2 text-right">
                  <button
                    disabled={savingId === u.id}
                    onClick={async () => {
                      setSavingId(u.id);
                      setError(null);
                      try {
                        await toggleActivo(u.id, !!u.activo);
                        await syncUsuarioRol(u.id, u.rol ?? "solo_lectura");
                      } catch (e: any) {
                        console.error("SAVE USER ERROR", e);
                        setError(e?.message ?? "Error guardando cambios");
                      } finally {
                        setSavingId(null);
                      }
                    }}
                    className="rounded-lg border px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
                  >
                    Guardar
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {!empresaId && (
          <div className="p-3 text-xs text-zinc-500">
            (Aviso) No se pudo resolver empresa_id.
          </div>
        )}
      </div>
    </div>
  );
}
