export const PENCE_PER_SOLER = 12;
export const SOLERS_PER_POUND = 20;
export const PENCE_PER_POUND = PENCE_PER_SOLER * SOLERS_PER_POUND;
export const MAX_STARTING_MONEY_PENCE = 3 * PENCE_PER_POUND;

export function moneyFromPence(totalPence = 0) {
  const safePence = Math.max(0, Math.floor(Number(totalPence) || 0));
  const pounds = Math.floor(safePence / PENCE_PER_POUND);
  const remainder = safePence % PENCE_PER_POUND;
  const solers = Math.floor(remainder / PENCE_PER_SOLER);
  return { pounds, solers, pence: remainder % PENCE_PER_SOLER };
}

export function moneyToPence(money = {}) {
  return Math.max(0, Math.floor(Number(money.pounds) || 0) * PENCE_PER_POUND
    + Math.floor(Number(money.solers) || 0) * PENCE_PER_SOLER
    + Math.floor(Number(money.pence) || 0));
}

export function normalizeMoney(money = {}) {
  return moneyFromPence(moneyToPence(money));
}

export function amountToPence(amount) {
  if (Number.isInteger(amount)) return amount;
  if (!amount || typeof amount !== "object") return NaN;
  const values = [amount.pounds, amount.solers, amount.pence];
  if (values.some((value) => value !== undefined && (!Number.isInteger(Number(value)) || Number(value) < 0))) return NaN;
  if (values.every((value) => value === undefined)) return NaN;
  return moneyToPence(amount);
}

export function formatMoney(money = {}) {
  const normalized = normalizeMoney(money);
  return `£${normalized.pounds} · ${normalized.solers}苏勒 · ${normalized.pence}便士`;
}

export function formatSignedMoney(pence = 0) {
  const numeric = Number(pence) || 0;
  return `${numeric >= 0 ? "+" : "−"}${formatMoney(moneyFromPence(Math.abs(numeric)))}`;
}
