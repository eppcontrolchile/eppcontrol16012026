//app/admin/page.tsx

"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

type Empresa = {
  id: string;
  nombre: string;
  rut: string;
};

type Usuario = {
  id: string;
  nombre: string;
  email: string;
  rol: string;
  activo: boolean;
};

export default function AdminPage() {
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>("");

  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [empresaId, setEmpresaId] = useState<string>("");

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [usuarioId, setUsuarioId] = useState<string>("");

  const [isSuperAdmin, setIsSuperAdmin] = useState(false);

  // ─────────────────────────────────────────────
  // Validar sesión y rol superadmin
  // ─────────────────────────────────────────────
  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const { data: authData, error: authError } =
          await supabaseBrowser().auth.getUser();

        if (authError || !authData?.user) {
          router.push("/login");
          return;
        }

        const { data: usuario, error: usuarioError } =
          await supabaseBrowser()
            .from("usuarios")
            .select("rol, activo")
            .eq("auth_user_id", authData.user.id)
            .maybeSingle();

        if (usuarioError || !usuario) {
          setError("No se pudo validar el usuario.");
          setLoading(false);
          return;
        }

        if (!usuario.activo || usuario.rol !== "superadmin") {
          setError("Acceso restringido. Se requiere rol superadmin.");
          setLoading(false);
          return;
        }

        setIsSuperAdmin(true);

        // Cargar empresas
        const resp = await fetch("/api/admin/empresas/list", {
          cache: "no-store",
        });

        if (!resp.ok) {
          const errJson = await resp.json().catch(() => null);
          setError(errJson?.reason ? `No se pudieron cargar las empresas: ${errJson.reason}` : "No se pudieron cargar las empresas.");
          setLoading(false);
          return;
        }

        const data = await resp.json().catch(() => null);

        // Soporta ambos formatos:
        // A) API devuelve array directo: [...]
        // B) API devuelve wrapper: { ok: true, empresas: [...] }
        const empresasArr = Array.isArray(data) ? data : (data?.empresas ?? []);

        if (!Array.isArray(empresasArr)) {
          setEmpresas([]);
          setError("Respuesta inválida al listar empresas.");
          setLoading(false);
          return;
        }

        setEmpresas(empresasArr as Empresa[]);
        setError("");
        setLoading(false);
      } catch (e: any) {
        setError(e?.message || "Error cargando admin");
        setLoading(false);
      }
    };

    load();
  }, [router]);

  // ─────────────────────────────────────────────
  // Cargar usuarios al seleccionar empresa
  // ─────────────────────────────────────────────
  useEffect(() => {
    const loadUsuarios = async () => {
      if (!empresaId) {
        setUsuarios([]);
        setUsuarioId("");
        return;
      }

      const resp = await fetch("/api/admin/usuarios/list", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        cache: "no-store",
        body: JSON.stringify({ empresa_id: empresaId }),
      });

      if (!resp.ok) {
        const errJson = await resp.json().catch(() => null);
        setUsuarios([]);
        setUsuarioId("");
        setError(errJson?.reason ? `No se pudieron cargar usuarios: ${errJson.reason}` : "No se pudieron cargar usuarios.");
        return;
      }

      const data = await resp.json().catch(() => null);

      // Soporta array directo o wrapper { ok:true, usuarios:[...] }
      const usuariosArr = Array.isArray(data) ? data : (data?.usuarios ?? []);
      if (!Array.isArray(usuariosArr)) {
        setUsuarios([]);
        setUsuarioId("");
        setError("Respuesta inválida al listar usuarios.");
        return;
      }

      setUsuarios(usuariosArr as Usuario[]);
      setUsuarioId("");
      setError("");
    };

    loadUsuarios();
  }, [empresaId]);

  const handleImpersonar = async () => {
    if (!empresaId || !usuarioId) {
      setError("Selecciona empresa y usuario.");
      return;
    }

    const resp = await fetch("/api/admin/impersonate/set", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ empresa_id: empresaId, usuario_id: usuarioId }),
    });

    if (!resp.ok) {
      setError("No se pudo activar modo soporte.");
      return;
    }

    alert("Modo soporte activado.");
    router.push("/dashboard");
  };

  const handleSalir = async () => {
    await fetch("/api/admin/impersonate/clear", { method: "POST" });
    alert("Modo soporte desactivado.");
    router.refresh();
  };

  if (loading) {
    return <div className="p-6 text-zinc-500">Cargando panel admin…</div>;
  }

  if (!isSuperAdmin) {
    return (
      <div className="p-6">
        <div className="rounded border border-red-200 bg-red-50 p-4 text-red-700">
          {error || "Acceso no autorizado"}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl p-6 space-y-6">
      <h1 className="text-2xl font-semibold">Panel Soporte / Superadmin</h1>

      {error && (
        <div className="rounded border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="rounded-lg border bg-white p-4 space-y-4">
        <h2 className="font-medium">Entrar como usuario</h2>

        <div className="space-y-3">
          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              Empresa
            </label>
            <select
              className="input"
              value={empresaId}
              onChange={(e) => setEmpresaId(e.target.value)}
            >
              <option value="">Selecciona empresa…</option>
              {empresas.map((emp) => (
                <option key={emp.id} value={emp.id}>
                  {emp.nombre} ({emp.rut})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs text-zinc-500 mb-1">
              Usuario
            </label>
            <select
              className="input"
              value={usuarioId}
              onChange={(e) => setUsuarioId(e.target.value)}
              disabled={!empresaId}
            >
              <option value="">Selecciona usuario…</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} ({u.email}) – {u.rol}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleImpersonar}
            className="w-full rounded-lg bg-sky-600 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Entrar como usuario
          </button>
        </div>
      </div>

      <div className="rounded-lg border bg-white p-4 space-y-3">
        <h2 className="font-medium">Modo soporte</h2>
        <button
          type="button"
          onClick={handleSalir}
          className="w-full rounded-lg border py-2 text-sm"
        >
          Salir del modo soporte
        </button>
      </div>
    </div>
  );
}
