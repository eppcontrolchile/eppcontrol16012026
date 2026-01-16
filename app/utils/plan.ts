// app/utils/plan.ts

export type PlanType = "standard" | "advanced";

export type PlanUsage = {
  usados: number;
  limite: number;
  porcentaje: number;
  alcanzado: boolean;
};

/**
 * Devuelve el límite de trabajadores según plan contratado
 * y tamaño de empresa elegido en registro
 */
export function getPlanLimit(
  plan: PlanType,
  companySize: string
): number {
  // +100 = ilimitado por ahora
  if (companySize === "100+") {
    return Infinity;
  }

  const parsed = Number(companySize);

  if ([25, 50, 100].includes(parsed)) {
    return parsed;
  }

  // fallback seguro
  return 25;
}

/**
 * Cuenta trabajadores activos
 */
export function getActiveWorkersCount(): number {
  if (typeof window === "undefined") return 0;

  const trabajadores = JSON.parse(
    localStorage.getItem("trabajadores") || "[]"
  );

  return trabajadores.filter(
    (t: any) => t.activo !== false
  ).length;
}

/**
 * Calcula el uso real del plan
 */
export function getPlanUsage(): PlanUsage {
  if (typeof window === "undefined") {
    return {
      usados: 0,
      limite: 0,
      porcentaje: 0,
      alcanzado: false,
    };
  }

  const plan = (localStorage.getItem("plan") ||
    "standard") as PlanType;

  const companySize =
    localStorage.getItem("companySize") || "25";

  const usados = getActiveWorkersCount();
  const limite = getPlanLimit(plan, companySize);

  const porcentaje =
    limite === Infinity
      ? 0
      : Math.round((usados / limite) * 100);

  return {
    usados,
    limite,
    porcentaje,
    alcanzado:
      limite !== Infinity && usados >= limite,
  };
}
