//app/dashboard/usuarios/page

"use client";

import { useEffect, useMemo, useState } from "react";
import { supabaseBrowser } from "@/lib/supabase/client";

type Rol = { id: string; nombre: string };

type UsuarioRow = {
  id: string;
  nombre: string;
  email: string;
  activo: boolean;
  rol: string | null;
  auth_user_id?: string | null;
  last_login_at?: string | null;
};

function roleLabel(role: string | null | undefined) {
  return (role || "").trim() || "—";
}

function roleChipClass(role: string) {
  switch (role) {
    case "admin":
      return "bg-red-50 text-red-700 border-red-200";
    case "supervisor":
      return "bg-sky-50 text-sky-700 border-sky-200";
    case "bodega":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "solo_entrega":
      return "bg-zinc-50 text-zinc-700 border-zinc-200";
    case "gerencia":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    default:
      return "bg-zinc-50 text-zinc-700 border-zinc-200";
  }
}

function formatLastLogin(s?: string | null) {
  if (!s) return "—";
  const d = new Date(s);
  if (isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("es-CL", {
    timeZone: "America/Santiago",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
}

export default function UsuariosPage() {
  const supabase = supabaseBrowser();

  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [sendingPw, setSendingPw] = useState<string | null>(null);

  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const [empresaId, setEmpresaId] = useState<string | null>(null);
  const [miRol, setMiRol] = useState<string | null>(null);
  const [miUsuarioId, setMiUsuarioId] = useState<string | null>(null);
  const [planTipo, setPlanTipo] = useState<string | null>(null);

  const [roles, setRoles] = useState<Rol[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);

  // 🔎 buscador
  const [q, setQ] = useState("");

  // 🧯 confirmación desactivar
  const [confirmOff, setConfirmOff] = useState<null | { id: string; nombre: string }>(null);

  // Crear usuario: default seguro (sin solo_lectura)
  const [nuevo, setNuevo] = useState({ nombre: "", email: "", rol: "bodega" });

  const rolesByName = useMemo(() => {
    const m = new Map<string, Rol>();
    roles.forEach((r) => m.set(r.nombre, r));
    return m;
  }, [roles]);

  async function loadAll() {
    setLoading(true);
    setError(null);
    setOk(null);

    try {
      const { data: au, error: auErr } = await supabase.auth.getUser();
      if (auErr) throw auErr;
      if (!au?.user) throw new Error("No autenticado");

      // 1) Resolver usuario interno (primario por auth_user_id)
      let me = await supabase
        .from("usuarios")
        .select("id, empresa_id, rol, activo, email")
        .eq("auth_user_id", au.user.id)
        .maybeSingle();

      // Fallback: si no existe por auth_user_id, intenta por email y linkea auth_user_id
      if (!me.data?.id) {
        const byEmail = await supabase
          .from("usuarios")
          .select("id, empresa_id, rol, activo, email")
          .eq("email", (au.user.email || "").toLowerCase())
          .maybeSingle();

        if (byEmail.data?.id) {
          await supabase
            .from("usuarios")
            .update({ auth_user_id: au.user.id })
            .eq("id", byEmail.data.id);

          me = byEmail as any;
        }
      }

      if (!me.data?.empresa_id) throw new Error("No se pudo resolver empresa_id");

      setEmpresaId(me.data.empresa_id);
      setMiRol(me.data.rol ?? null);
      setMiUsuarioId(me.data.id);

      // 2) Plan tipo (habilitar passwords/roles avanzados)
      const { data: emp } = await supabase
        .from("empresas")
        .select("plan_tipo")
        .eq("id", me.data.empresa_id)
        .maybeSingle();

      setPlanTipo((emp as any)?.plan_tipo ?? null);

      // 3) Roles
      const { data: rolesData, error: rolesErr } = await supabase
        .from("roles")
        .select("id,nombre")
        .order("nombre", { ascending: true });

      if (rolesErr) throw rolesErr;

      // 4) Usuarios empresa
      const { data: usuariosData, error: usuariosErr } = await supabase
        .from("usuarios")
        .select("id,nombre,email,activo,rol,auth_user_id,last_login_at")
        .eq("empresa_id", me.data.empresa_id)
        .order("nombre", { ascending: true });

      if (usuariosErr) throw usuariosErr;

      setRoles((rolesData as Rol[]) ?? []);
      setUsuarios((usuariosData as UsuarioRow[]) ?? []);
    } catch (e: any) {
      console.error("USUARIOS PAGE LOAD ERROR", e);
      setError(e?.message ?? "Error cargando usuarios");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function syncUsuarioRol(usuarioId: string, rolNombre: string) {
    // compat: usuarios.rol
    const { error: upErr } = await supabase
      .from("usuarios")
      .update({ rol: rolNombre })
      .eq("id", usuarioId);

    if (upErr) throw upErr;

    // usuarios_roles (1 rol)
    const rol = rolesByName.get(rolNombre);
    if (!rol) return;

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

  async function saveUsuario(u: UsuarioRow) {
    // Reglas: no auto-democión / no auto-desactivación
    if (u.id === miUsuarioId) {
      if (!u.activo) throw new Error("No puedes desactivarte a ti mismo.");
      if (u.rol !== "admin") throw new Error("No puedes quitarte el rol admin.");
    }

    const { error: err } = await supabase
      .from("usuarios")
      .update({
        nombre: u.nombre.trim(),
        email: u.email.trim().toLowerCase(),
        activo: !!u.activo,
      })
      .eq("id", u.id);

    if (err) throw err;

    await syncUsuarioRol(u.id, u.rol ?? "bodega");
  }

  async function crearUsuario() {
    setError(null);
    setOk(null);

    if (!empresaId) return;
    if (!nuevo.nombre.trim() || !nuevo.email.trim()) {
      setError("Completa nombre y email.");
      return;
    }

    try {
      setCreating(true);

      if (planTipo !== "advanced") {
        throw new Error("Usuarios y roles avanzados: disponible solo en plan Advanced.");
      }

      const res = await fetch("/api/admin/usuarios/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          empresa_id: empresaId,
          nombre: nuevo.nombre.trim(),
          email: nuevo.email.trim().toLowerCase(),
          rol: nuevo.rol,
        }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) {
        throw new Error(json?.reason ?? "No se pudo crear el usuario");
      }

      setOk("Usuario creado. Se envió correo para crear contraseña.");
      setNuevo({ nombre: "", email: "", rol: "bodega" });
      await loadAll();
    } catch (e: any) {
      setError(e?.message ?? "Error creando usuario");
    } finally {
      setCreating(false);
    }
  }

  async function enviarLinkClave(email: string, usuarioId: string) {
    setError(null);
    setOk(null);
    if (!empresaId) return;

    try {
      setSendingPw(usuarioId);

      if (planTipo !== "advanced") {
        throw new Error("Cambio/creación de contraseña: disponible solo en plan Advanced.");
      }

      const res = await fetch("/api/admin/usuarios/send-set-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ empresa_id: empresaId, email }),
      });

      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.ok) throw new Error(json?.reason ?? "No se pudo enviar el link");

      setOk("Listo: se envió un correo con enlace para definir contraseña.");
    } catch (e: any) {
      setError(e?.message ?? "Error enviando enlace");
    } finally {
      setSendingPw(null);
    }
  }

  const isAdvanced = planTipo === "advanced";

  const usuariosFiltrados = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return usuarios;
    return usuarios.filter((u) => {
      const n = (u.nombre || "").toLowerCase();
      const e = (u.email || "").toLowerCase();
      return n.includes(needle) || e.includes(needle);
    });
  }, [usuarios, q]);

  if (loading) {
    return (
      <div className="rounded-lg border bg-white p-4 text-sm text-zinc-600">
        Cargando usuarios...
      </div>
    );
  }

  if (error && !usuarios.length) {
    return (
      <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        {error}
      </div>
    );
  }

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
        <p className="text-sm text-zinc-500">Administra los accesos de tu empresa.</p>
      </div>

      <div className="rounded-xl border bg-white p-4">
        <label className="text-sm text-zinc-600">Buscar usuario</label>
        <input
          className="input mt-1"
          placeholder="Buscar por nombre o email…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>

      {/* INFO ROLES */}
      <div className="rounded-xl border bg-white p-4 text-sm">
        <p className="font-medium">¿Qué puede hacer cada rol?</p>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-zinc-600">
          <li>
            <b>admin</b>: opera todo, ve costos, define usuarios, administra todo.
          </li>
          <li>
            <b>supervisor</b>: entrega, ve costos, ve stock, crea trabajadores, crea centros de trabajo.
          </li>
          <li>
            <b>bodega</b>: entrega, ingresa EPP, ve stock.
          </li>
          <li>
            <b>solo_entrega</b>: solo entrega (ideal móvil / celular).
          </li>
          <li>
            <b>gerencia</b>: lectura completa (ideal reportes y control).
          </li>
        </ul>

        {!isAdvanced && (
          <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
            Usuarios/roles avanzados + gestión de contraseñas: solo en <b>Plan Advanced</b>.
          </div>
        )}
      </div>

      {(error || ok) && (
        <div
          className={`rounded-lg border p-3 text-sm ${
            error ? "border-red-200 bg-red-50 text-red-700" : "border-green-200 bg-green-50 text-green-700"
          }`}
        >
          {error ?? ok}
        </div>
      )}

      {/* CREAR USUARIO */}
      <div className="space-y-3 rounded-xl border bg-white p-4">
        <p className="font-medium">Crear usuario</p>

        <div className="grid grid-cols-1 gap-2 sm:grid-cols-4">
          <input
            className="input"
            placeholder="Nombre"
            value={nuevo.nombre}
            onChange={(e) => setNuevo((p) => ({ ...p, nombre: e.target.value }))}
          />
          <input
            className="input"
            placeholder="correo@empresa.cl"
            value={nuevo.email}
            onChange={(e) => setNuevo((p) => ({ ...p, email: e.target.value }))}
          />
          <select
            className="input"
            value={nuevo.rol}
            onChange={(e) => setNuevo((p) => ({ ...p, rol: e.target.value }))}
          >
            {(roles.length
              ? roles
              : [
                  { id: "x", nombre: "admin" },
                  { id: "x", nombre: "supervisor" },
                  { id: "x", nombre: "bodega" },
                  { id: "x", nombre: "solo_entrega" },
                  { id: "x", nombre: "gerencia" },
                ]
            ).map((r) => (
              <option key={r.nombre} value={r.nombre}>
                {r.nombre}
              </option>
            ))}
          </select>

          <button
            onClick={crearUsuario}
            disabled={!isAdvanced || creating}
            className="rounded-lg bg-sky-600 px-3 py-2 text-sm text-white disabled:opacity-50"
          >
            {creating ? "Creando…" : "Crear + Enviar link"}
          </button>
        </div>
      </div>

      {/* TABLA */}
      <div className="overflow-auto rounded-xl border bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-zinc-50">
            <tr>
              <th className="p-2 text-left">Nombre</th>
              <th className="p-2 text-left">Email</th>
              <th className="p-2 text-left">Rol</th>
              <th className="p-2 text-left">Etiqueta</th>
              <th className="p-2 text-left">Última conexión</th>
              <th className="p-2 text-center">Activo</th>
              <th className="p-2 text-right">Acciones</th>
            </tr>
          </thead>

          <tbody>
            {usuariosFiltrados.map((u) => {
              const isMe = u.id === miUsuarioId;
              const r = roleLabel(u.rol);

              return (
                <tr key={u.id} className="border-t">
                  <td className="p-2">
                    <input
                      className="input"
                      value={u.nombre ?? ""}
                      onChange={(e) =>
                        setUsuarios((prev) =>
                          prev.map((x) => (x.id === u.id ? { ...x, nombre: e.target.value } : x))
                        )
                      }
                    />
                  </td>

                  <td className="p-2">
                    <input
                      className="input"
                      value={u.email ?? ""}
                      onChange={(e) =>
                        setUsuarios((prev) =>
                          prev.map((x) => (x.id === u.id ? { ...x, email: e.target.value } : x))
                        )
                      }
                    />
                  </td>

                  <td className="p-2">
                    <select
                      className="input"
                      value={u.rol ?? "bodega"}
                      disabled={isMe}
                      onChange={(e) => {
                        const v = e.target.value;
                        setUsuarios((prev) =>
                          prev.map((x) => (x.id === u.id ? { ...x, rol: v } : x))
                        );
                      }}
                    >
                      {(roles.length
                        ? roles
                        : [
                            { id: "x", nombre: "admin" },
                            { id: "x", nombre: "supervisor" },
                            { id: "x", nombre: "bodega" },
                            { id: "x", nombre: "solo_entrega" },
                            { id: "x", nombre: "gerencia" },
                          ]
                      ).map((rr) => (
                        <option key={rr.nombre} value={rr.nombre}>
                          {rr.nombre}
                        </option>
                      ))}
                    </select>
                    {isMe && (
                      <p className="mt-1 text-xs text-zinc-500">
                        (Protegido) No puedes cambiar tu propio rol.
                      </p>
                    )}
                  </td>

                  <td className="p-2">
                    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs ${roleChipClass(r)}`}>
                      {r}
                    </span>
                  </td>

                  <td className="p-2 text-sm text-zinc-600">{formatLastLogin(u.last_login_at)}</td>

                  <td className="p-2 text-center">
                    <input
                      type="checkbox"
                      checked={!!u.activo}
                      disabled={isMe}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (!checked) {
                          setConfirmOff({ id: u.id, nombre: u.nombre });
                          return;
                        }
                        setUsuarios((prev) =>
                          prev.map((x) => (x.id === u.id ? { ...x, activo: true } : x))
                        );
                      }}
                    />
                  </td>

                  <td className="p-2">
                    <div className="flex justify-end gap-2">
                      <button
                        disabled={savingId === u.id}
                        onClick={async () => {
                          setSavingId(u.id);
                          setError(null);
                          setOk(null);
                          try {
                            await saveUsuario(u);
                            setOk("Cambios guardados.");
                          } catch (e: any) {
                            setError(e?.message ?? "Error guardando cambios");
                          } finally {
                            setSavingId(null);
                          }
                        }}
                        className="rounded-lg border px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
                      >
                        {savingId === u.id ? "Guardando…" : "Guardar"}
                      </button>

                      <button
                        disabled={!isAdvanced || sendingPw === u.id}
                        onClick={() => enviarLinkClave(u.email, u.id)}
                        className="rounded-lg border px-3 py-1.5 text-sm hover:bg-zinc-50 disabled:opacity-50"
                      >
                        {sendingPw === u.id ? "Enviando…" : "Enviar link clave"}
                      </button>
                    </div>

                    {isMe && (
                      <p className="mt-1 text-xs text-zinc-500 text-right">(Protegido) No puedes desactivarte.</p>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {confirmOff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl">
            <p className="text-lg font-semibold">Confirmar desactivación</p>
            <p className="mt-2 text-sm text-zinc-600">
              Vas a desactivar a <b>{confirmOff.nombre}</b>. Esta persona no podrá ingresar.
            </p>

            <div className="mt-4 flex justify-end gap-2">
              <button
                className="rounded-lg border px-3 py-2 text-sm hover:bg-zinc-50"
                onClick={() => setConfirmOff(null)}
              >
                Cancelar
              </button>
              <button
                className="rounded-lg bg-red-600 px-3 py-2 text-sm text-white hover:bg-red-700"
                onClick={() => {
                  const id = confirmOff.id;
                  setUsuarios((prev) => prev.map((x) => (x.id === id ? { ...x, activo: false } : x)));
                  setConfirmOff(null);
                }}
              >
                Desactivar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
