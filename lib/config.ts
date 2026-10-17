/** Export gate stub (Stripe arrives Week2). No real billing. */
export type ExportGate = { paid: boolean; freeLimit: number };

export function getExportGate(): ExportGate {
  const limit = Number(process.env.NEGGUARD_FREE_EXPORT_LIMIT ?? 10);
  return {
    paid: process.env.NEGGUARD_SIMULATE_PAID === "true",
    freeLimit: Number.isFinite(limit) && limit >= 0 ? Math.floor(limit) : 10,
  };
}
