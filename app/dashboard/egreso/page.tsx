// app/dashboard/egreso/page.tsx
"use client";

import type React from "react";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "@/lib/supabase/client";

export default function EgresoPage() {
  const router = useRouter();

  const [error, setError] = useState<string>("");

  const [trabajadorId, setTrabajadorId] = useState<string>("");
  const [items, setItems] = useState<any[]>([]);
  const [firmado, setFirmado] = useState<boolean>(false);

  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    // 1️⃣ Validaciones UX mínimas
    if (!trabajadorId) {
      setError("Selecciona un trabajador");
      return;
    }

    if (!firmado) {
      setError("La entrega debe ser firmada");
      return;
    }

    for (const item of items) {
      if (
        !item.categoria ||
        !item.epp ||
        item.cantidad <= 0 ||
        !item.tallaNumero
      ) {
        setError("Completa correctamente todos los EPP");
        return;
      }
    }

    try {
      // 2️⃣ Usuario autenticado
      const { data: authData, error: authError } =
        await supabaseBrowser().auth.getUser();

      if (authError || !authData?.user) {
        setError("No autenticado. Inicia sesión nuevamente.");
        return;
      }

      // 3️⃣ Obtener usuario + empresa
      const { data: usuario, error: usuarioError } = await supabaseBrowser()
        .from("usuarios")
        .select("id, empresa_id, centro_id")
        .eq("auth_user_id", authData.user.id)
        .maybeSingle();

      if (usuarioError || !usuario) {
        setError("No se pudo identificar el usuario.");
        return;
      }

      // 4️⃣ Construir payload limpio (sin lógica FIFO)
      const payload = {
        empresa_id: usuario.empresa_id,
        usuario_id: usuario.id,
        trabajador_id: trabajadorId,
        centro_id: usuario.centro_id,
        firma_url: canvasRef.current?.toDataURL() || null,
        items: items.map((i) => ({
          categoria: i.categoria,
          nombre_epp: i.epp,
          talla:
            i.tallaNumero === "No aplica" || i.tallaNumero === ""
              ? null
              : i.tallaNumero,
          cantidad: Number(i.cantidad),
        })),
      };

      // 5️⃣ Enviar a API de egresos (FIFO backend)
      const resp = await fetch("/api/egresos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await resp.json();

      if (!resp.ok) {
        setError(result.error || "Error al registrar el egreso");
        return;
      }

      // 6️⃣ Éxito FIFO confirmado
      alert(
        `Egreso registrado correctamente\n\n` +
          `Unidades entregadas: ${result.total_unidades}\n` +
          `Costo total: $${Number(result.costo_total_iva).toLocaleString("es-CL")}`
      );

      router.push("/dashboard/entregas");
    } catch (err: any) {
      setError(err?.message || "Error inesperado");
    }
  };

  return (
    <div>
      <form onSubmit={handleSubmit}>
        {error && <p className="text-red-600">{error}</p>}
        <button type="submit">Registrar egreso</button>
      </form>
    </div>
  );
}
