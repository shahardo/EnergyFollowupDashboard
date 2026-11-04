import { z } from 'zod';

// ---------- ביקוש ----------
export const SectorDemandSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  baseTWh: z.number().nonnegative(),
  growthPct: z.number(),
  curve: z.enum(['linear', 'exp', 's']),
  sMidYear: z.number().int().optional(),
  efficiencyPct: z.number().min(0).max(100),
  loadFactor: z.number().gt(0).max(1),
});

export const DemandScenarioSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    baseYear: z.number().int(),
    horizonYear: z.number().int(),
    sectors: z.array(SectorDemandSchema),
  })
  .refine((s) => s.horizonYear > s.baseYear, {
    message: 'שנת האופק חייבת להיות אחרי שנת הבסיס',
  });

// ---------- היצע ----------
export const CapacityPointSchema = z.object({
  year: z.number().int(),
  gw: z.number().nonnegative(),
});

export const SupplySourceSchema = z.object({
  key: z.string().min(1),
  label: z.string(),
  enabled: z.boolean(),
  renewable: z.boolean(),
  capacityGW: z.array(CapacityPointSchema).min(1),
  capacityFactor: z.number().min(0).max(1),
  capacityCredit: z.number().min(0).max(1),
  retireYear: z.number().int().optional(),
});

export const SupplyScenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  demandScenarioRef: z.string().optional(),
  sources: z.array(SupplySourceSchema),
  fillPriority: z.array(z.string()),
});

// ---------- מעטפת הקובץ השמור ----------
export const SCHEMA_VERSION = 'energy-dashboard/v1' as const;

export const scenarioFileSchema = <T extends z.ZodTypeAny>(kind: 'demand' | 'supply', data: T) =>
  z.object({
    schema: z.literal(SCHEMA_VERSION),
    kind: z.literal(kind),
    savedAt: z.string(),
    data,
  });

export const DemandFileSchema = scenarioFileSchema('demand', DemandScenarioSchema);
export const SupplyFileSchema = scenarioFileSchema('supply', SupplyScenarioSchema);

export type SectorDemand = z.infer<typeof SectorDemandSchema>;
export type DemandScenario = z.infer<typeof DemandScenarioSchema>;
export type CapacityPoint = z.infer<typeof CapacityPointSchema>;
export type SupplySource = z.infer<typeof SupplySourceSchema>;
export type SupplyScenario = z.infer<typeof SupplyScenarioSchema>;
export type ScenarioKind = 'demand' | 'supply';
