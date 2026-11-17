import type { Prisma, PrismaClient } from "@prisma/client";
import { db } from "./db";

type Tx = PrismaClient | Prisma.TransactionClient;

const SENSITIVE_KEYS = /pass|token|hash|secret|taxid/i;

/** Hassas alanları kayda geçirmeden önce maskeler */
export function redact(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(redact);
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = SENSITIVE_KEYS.test(k) ? "[gizli]" : redact(v);
    return out;
  }
  return value;
}

export interface AuditEntry {
  userId?: string | null;
  action: string;
  entityType?: string;
  entityId?: string;
  data?: unknown;
  ip?: string | null;
}

/** Denetim kaydı ekler. Transaction içinde çağrılırsa aynı işlemle birlikte kalıcı olur. */
export async function audit(entry: AuditEntry, tx: Tx = db): Promise<void> {
  await tx.auditLog.create({
    data: {
      userId: entry.userId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      data: entry.data === undefined ? undefined : (redact(entry.data) as Prisma.InputJsonValue),
      ip: entry.ip ?? null,
    },
  });
}
