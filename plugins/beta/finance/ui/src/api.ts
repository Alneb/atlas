// The engine's answers (engine/src/main.rs) as types, and the arithmetic the pane and blocks share: one place.
import type { PluginApi } from "../../../../../ui/src/lib/plugin-api";
export type { PluginApi };

/** Decimal strings per commodity, as the engine writes them (exact; parsed only to draw). */
export type Amounts = Record<string, string>;
export interface Account { account: string; note: string; closed: string | null; balances: Amounts }
export interface Month { month: string; categories: { account: string; amounts: Amounts }[] }
export interface WealthMonth { month: string; total: string; by: Amounts; unpriced: string[] }
/** A unit wealth can be measured in; `money` when it is a currency (drawn with its symbol). */
export interface Unit { unit: string; name: string; money: boolean }
export interface BudgetLine { account: string; spent: string; usual: string; target: string | null; target_note: string | null; history: string[] }
export interface MonthTotals { month: string; income: string; spent: string; unknown_out: string; unknown_in: string; rate: string | null; rate_all: string | null }
export interface Recurring { payee: string; account: string; period: string; amount: string; per_month: string; count: number; last: string; next: string; path: string; line: number }
export interface Budget { currency: string; month: string; elapsed: string; unpriced: string[]; lines: BudgetLine[]; months: MonthTotals[]; recurring: Recurring[] }
export interface Summary {
  accounts: Account[]; review: number; transactions: number; errors: number; warnings: number;
  months: Month[]; income: Month[]; net_worth: WealthMonth[]; unit: string; units: Unit[]; known: string[];
  first_use: { account: string; path: string; line: number }[]; budget: Budget; sources: Source[];
}
/** A bank connected through Enable Banking (its note in finance/sources/). */
export interface Source { path: string; bank: string; country: string; until: string | null; synced: string | null; accounts: { iban: string; name: string }[]; error: string | null }
export interface Lot { date: string; units: string; cost: string | null }
export interface Holding { account: string; commodity: string; name: string | null; note: string | null; units: string; cost: string | null; value: string | null; gain: string | null; price: { date: string; price: string } | null; lots: Lot[] }
export interface CurrencyHolding { currency: string; amount: string; value: string | null; rate: string | null; fx_gain: string | null; history: [string, string][] }
export interface Quote { base: string; quote: string; date: string; price: string }
export interface Invest { currency: string; xirr: number | null; holdings: Holding[]; realised: { year: number; gain: string }[]; allocation: Amounts; currencies: CurrencyHolding[]; prices: Quote[] }
export interface Guess { to: string; why: string; sure: boolean }
export interface Posting { account: string; amount: string | null }
export interface Txn {
  date: string; status: "*" | "!"; text: string; payee: string; narration: string | null; tags: string[]; id: string | null;
  meta: [string, string][]; path: string; line: number; last: number; postings: Posting[];
  /** For one still in Unknown: what the classifier makes of it (rules, history, vocabulary) and why. */
  guess?: Guess | null;
}
export interface RegisterRow { date: string; status: string; payee: string; narration: string | null; account: string; amount: string; running: string; path: string; line: number }
export interface Diagnostic { path: string; line: number; message: string; severity: "error" | "warning" }

/** A helper call with the plugin's settings (the folder), its error stripped of the transport's prefix. */
export async function call<T>(atlas: PluginApi, method: string, params: Record<string, unknown> = {}): Promise<T> {
  try {
    return (await atlas.helper.call(method, { ...params, settings: atlas.plugin.settings }, { timeout: 60 })) as T;
  } catch (e) {
    // "POST …/helper: 500 command failed: plugin finance: txn_save: <why>" → "<why>"
    throw new Error(String((e as Error)?.message ?? e).replace(/^.*?plugin [\w-]+: \w+: /, "").replace(/^.*?(method|error): /i, ""));
  }
}

export const currency = (atlas: PluginApi) => String(atlas.plugin.settings.currency ?? "EUR");
export const folder = (atlas: PluginApi) => String(atlas.plugin.settings.folder ?? "finance").replace(/^\/+|\/+$/g, "");


export function money(n: number, cur: string, opts: { sign?: boolean; whole?: boolean } = {}): string {
  const f = new Intl.NumberFormat(undefined, { style: "currency", currency: /^[A-Z]{3}$/.test(cur) ? cur : "EUR", maximumFractionDigits: opts.whole ? 0 : 2, minimumFractionDigits: opts.whole ? 0 : 2, signDisplay: opts.sign ? "exceptZero" : "auto" });
  return /^[A-Z]{3}$/.test(cur) ? f.format(n) : `${n.toFixed(2)} ${cur}`;
}

/** "Expenses:Food:Groceries" → "Food · Groceries". */
export const label = (account: string) => account.split(":").slice(1).join(" · ") || account;

/** A decimal string as a number, for drawing only (sums are the engine's). */
export const num = (s: string | null | undefined) => Number(s ?? 0) || 0;

/** A wealth unit's amount: money with its symbol, anything else (gold, BTC) with its units. */
export function measure(n: number, unit: Unit, opts: { sign?: boolean; whole?: boolean } = {}): string {
  if (unit.money) return money(n, unit.unit, opts);
  const digits = Math.abs(n) >= 100 ? 1 : Math.abs(n) >= 1 ? 3 : 5;
  return `${opts.sign && n > 0 ? "+" : ""}${n.toLocaleString(undefined, { maximumFractionDigits: digits })} ${unit.unit}`;
}

export const monthName = (ym: string) => new Date(`${ym}-01T12:00:00`).toLocaleDateString(undefined, { month: "long", year: "numeric" });
