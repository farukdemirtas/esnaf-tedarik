import { db } from "@/lib/db";

export const DUES_SETTING_KEY = "dues.blockOrderingAfterOverdueCount";
/** Varsayılan: vadesi geçmiş 2 ödenmemiş aidatta sipariş verme engellenir (giriş açık kalır). */
export const DEFAULT_DUES_BLOCK_COUNT = 2;

export async function getDuesBlockThreshold(chamberId: string): Promise<number> {
  const s = await db.setting.findUnique({ where: { chamberId_key: { chamberId, key: DUES_SETTING_KEY } } });
  const v = typeof s?.value === "number" ? s.value : DEFAULT_DUES_BLOCK_COUNT;
  return v > 0 ? v : DEFAULT_DUES_BLOCK_COUNT;
}

export interface DuesState {
  overdueCount: number;
  threshold: number;
  orderingBlocked: boolean;
}

export async function getMemberDuesState(memberId: string, chamberId: string, now = new Date()): Promise<DuesState> {
  const [overdueCount, threshold] = await Promise.all([
    db.membershipDue.count({ where: { memberId, status: "UNPAID", dueDate: { lt: now } } }),
    getDuesBlockThreshold(chamberId),
  ]);
  return { overdueCount, threshold, orderingBlocked: overdueCount >= threshold };
}
