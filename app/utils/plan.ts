// app/utils/plan.ts
// Tipos compartidos para planes y uso de plan.
// La lógica vive exclusivamente en el backend (/api/plan-usage).

export type PlanType = "standard" | "advanced";

export type PlanUsage = {
  usados: number;
  limite: number;
  porcentaje: number;
  alcanzado: boolean;
  plan: PlanType;
  company_size: string;
};
