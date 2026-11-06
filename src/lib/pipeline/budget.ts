import { dbFirst, dbRun, utcDay } from "./db";

/** Haiku list pricing, converted at a fixed 0.78 GBP per USD. */
const INPUT_USD_PER_TOKEN = 0.1 / 1_000_000;
const OUTPUT_USD_PER_TOKEN = 0.5 / 1_000_000;
const USD_TO_GBP = 0.78;

export function costGbp(inputTokens: number, outputTokens: number): number {
  const usd = inputTokens * INPUT_USD_PER_TOKEN + outputTokens * OUTPUT_USD_PER_TOKEN;
  return usd * USD_TO_GBP;
}

export function dailyCapGbp(): number {
  const raw = process.env["PIPELINE_DAILY_BUDGET_GBP"]?.trim();
  const n = raw ? Number(raw) : 0.1;
  return Number.isFinite(n) && n > 0 ? n : 0.1;
}

export function anthropicModel(): string {
  return process.env["ANTHROPIC_MODEL"]?.trim() || "claude-haiku-5-5";
}

export async function spendTodayGbp(): Promise<number> {
  const row = await dbFirst<{ gbp: number }>(`SELECT gbp FROM pipeline_spend WHERE day = ?`, [utcDay()]);
  return Number(row?.gbp ?? 0);
}

export async function addSpendGbp(gbp: number): Promise<number> {
  if (gbp <= 0) return spendTodayGbp();
  const day = utcDay();
  await dbRun(
    `INSERT INTO pipeline_spend (day, gbp) VALUES (?, ?)
     ON CONFLICT(day) DO UPDATE SET gbp = gbp + excluded.gbp`,
    [day, gbp],
  );
  return spendTodayGbp();
}

export async function budgetRemainingGbp(): Promise<number> {
  return Math.max(0, dailyCapGbp() - (await spendTodayGbp()));
}
