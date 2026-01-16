// app/dashboard/configuracion/page.tsx
"use client";


import { useEffect, useState } from "react";

function validarRutChileno(rut: string): boolean {
  const limpio = rut.replace(/\./g, "").replace("-", "").toUpperCase();

  if (!/^\d{7,8}[0-9K]$/.test(limpio)) return false;

  const cuerpo = limpio.slice(0, -1);
  const dv = limpio.slice(-1);

  let suma = 0;
  let multiplicador = 2;

  for (let i = cuerpo.length - 1; i >= 0; i--) {
    suma += parseInt(cuerpo[i]) * multiplicador;
    multiplicador = multiplicador === 7 ? 2 : multiplicador + 1;
  }

  const resto = suma % 11;
  const dvEsperado =
    resto === 1 ? "K" : resto === 0 ? "0" : String(11 - resto);

  return dv === dvEsperado;
}

export default function ConfiguracionEmpresaPage() {
  const [companyName, setCompanyName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [stockCritico, setStockCritico] = useState("5");
  const [companyRut, setCompanyRut] = useState("");

  const [adminEmail, setAdminEmail] = useState("");
  const [adminPassword, setAdminPassword] = useState("");
  const [correoGerencia, setCorreoGerencia] = useState("");

  const [error, setError] = useState("");
  const [saved, setSaved] = useState(false);

  const [usarStockCritico, setUsarStockCritico] = useState(true);
  const [alertasCorreo, setAlertasCorreo] = useState(false);
  const [frecuenciaAlertas, setFrecuenciaAlertas] = useState("diaria");
  const [correoAlertas, setCorreoAlertas] = useState("");

  const [plan, setPlan] = useState<string | null>(null);

  useEffect(() => {
    setCompanyName(localStorage.getItem("companyName") || "");
    setCompanyRut(localStorage.getItem("companyRut") || "");
    setLogoUrl(localStorage.getItem("companyLogo") || "");
    setStockCritico(localStorage.getItem("stockCritico") || "5");
    setAdminEmail(localStorage.getItem("adminEmail") || "");
    const admin = localStorage.getItem("adminEmail") || "";
    if (!correoAlertas) {
      setCorreoAlertas(admin);
    }
    setCorreoGerencia(
      localStorage.getItem("companyManagerEmail") || ""
    );

    const companyConfig = localStorage.getItem("companyConfig");
    if (companyConfig) {
      const parsed = JSON.parse(companyConfig);
      setUsarStockCritico(parsed.stockCritico ?? true);
      setAlertasCorreo(parsed.alertasCorreo ?? false);
      setFrecuenciaAlertas(parsed.frecuencia ?? "diaria");
      setCorreoAlertas(parsed.correoAlertas ?? "");
    }

    const savedPlan = localStorage.getItem("plan");
    setPlan(savedPlan);
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!adminEmail.includes("@")) {
      setError("Correo administrador no válido");
      return;
    }

    if (!companyRut.trim()) {
      setError("El RUT de la empresa es obligatorio");
      return;
    }

    if (!validarRutChileno(companyRut)) {
      setError("El RUT ingresado no es válido");
      return;
    }

    if (adminPassword && adminPassword.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres");
      return;
    }

    if (!correoGerencia.includes("@")) {
      setError("Correo de gerencia no válido");
      return;
    }

    if (correoGerencia === adminEmail) {
      setError(
        "El correo de gerencia no puede ser el mismo correo administrador"
      );
      return;
    }

    localStorage.setItem("companyName", companyName);
    localStorage.setItem("companyRut", companyRut);
    localStorage.setItem("companyLogo", logoUrl);
    localStorage.setItem("stockCritico", stockCritico);
    localStorage.setItem("adminEmail", adminEmail);
    localStorage.setItem(
      "companyManagerEmail",
      correoGerencia
    );

    if (adminPassword) {
      localStorage.setItem("adminPassword", adminPassword);
    }

    localStorage.setItem(
      "companyConfig",
      JSON.stringify({
        stockCritico: usarStockCritico,
        alertasCorreo,
        frecuencia: frecuenciaAlertas,
        correoAlertas,
      })
    );

    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-xl space-y-6">
      <h1 className="text-2xl font-semibold">
        Configuración de la empresa
      </h1>

      {plan && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-4 text-sm text-sky-900">
          <strong>Plan contratado:</strong>{" "}
          {plan === "advanced" ? "Plan Avanzado" : "Plan Estándar"} ·{" "}
          <span className="text-sky-700">
            Prueba gratuita activa (7 días)
          </span>
        </div>
      )}

      <form onSubmit={handleSave} className="space-y-4">
        {/* Empresa */}
        <div>
          <label className="mb-1 block text-sm font-medium">
            Nombre de la empresa
          </label>
          <input
            type="text"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            RUT de la empresa
          </label>
          <input
            type="text"
            value={companyRut}
            onChange={(e) => setCompanyRut(e.target.value)}
            className="input"
            placeholder="12.345.678-9"
            required
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Logo de la empresa (URL)
          </label>
          <input
            type="text"
            value={logoUrl}
            onChange={(e) => setLogoUrl(e.target.value)}
            className="input"
            placeholder="/logoepp.png"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Stock crítico por defecto
          </label>
          <input
            type="number"
            min={1}
            value={stockCritico}
            onChange={(e) => setStockCritico(e.target.value)}
            className="input"
          />
        </div>

        <hr className="my-6" />

        <h2 className="text-lg font-medium">
          Stock crítico y alertas
        </h2>

        <div className="space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={usarStockCritico}
              onChange={(e) =>
                setUsarStockCritico(e.target.checked)
              }
            />
            Usar stock crítico
          </label>

          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={alertasCorreo}
              onChange={(e) => {
                const checked = e.target.checked;
                setAlertasCorreo(checked);
                if (checked && !correoAlertas) {
                  setCorreoAlertas(adminEmail);
                }
              }}
            />
            Enviar alertas por correo
          </label>

          {alertasCorreo && (
            <>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  Correo para alertas
                </label>
                <input
                  type="email"
                  value={correoAlertas}
                  onChange={(e) =>
                    setCorreoAlertas(e.target.value)
                  }
                  className="input"
                  placeholder="alertas@empresa.cl"
                />
              </div>

              <div>
                <label className="mb-1 block text-sm font-medium">
                  Frecuencia
                </label>
                <select
                  className="input"
                  value={frecuenciaAlertas}
                  onChange={(e) =>
                    setFrecuenciaAlertas(e.target.value)
                  }
                >
                  <option value="diaria">Diaria</option>
                  <option value="semanal">Semanal</option>
                </select>
              </div>
            </>
          )}
        </div>

        <hr className="my-4" />

        {/* Seguridad */}
        <h2 className="text-lg font-medium">
          Acceso administrador
        </h2>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Correo de gerencia
          </label>
          <input
            type="email"
            value={correoGerencia}
            onChange={(e) =>
              setCorreoGerencia(e.target.value)
            }
            className="input"
            placeholder="gerencia@empresa.cl"
            required
          />
          <p className="mt-1 text-xs text-zinc-500">
            Recibirá reportes mensuales de gestión.
          </p>
          <p className="text-xs text-zinc-500">
            Debe ser distinto al correo del usuario administrador.
          </p>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Correo administrador
          </label>
          <input
            type="email"
            value={adminEmail}
            onChange={(e) => setAdminEmail(e.target.value)}
            className="input"
          />
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium">
            Nueva contraseña
          </label>
          <input
            type="password"
            value={adminPassword}
            onChange={(e) => setAdminPassword(e.target.value)}
            className="input"
            placeholder="••••••"
          />
          <p className="mt-1 text-xs text-zinc-500">
            Dejar en blanco para no cambiarla
          </p>
        </div>

        {error && (
          <p className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex gap-3 pt-4">
          <button
            type="submit"
            className="rounded-lg bg-sky-600 px-4 py-2 text-sm font-medium text-white hover:bg-sky-700"
          >
            Guardar cambios
          </button>

          {saved && (
            <span className="self-center text-sm text-green-600">
              Cambios guardados
            </span>
          )}
        </div>
      </form>
    </div>
  );
}
