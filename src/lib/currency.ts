import { Money } from "./types";

export interface ExchangeRate {
  from: string;
  to: string;
  rate: number;
  asOf: string;
  source: string;
}

/** Convert a money value only when the caller supplies an explicit, dated rate. */
export function convertMoney(value: Money, rate: ExchangeRate): Money {
  if (value.currency.toUpperCase() !== rate.from.toUpperCase()) {
    throw new Error(`Exchange rate starts in ${rate.from}, not ${value.currency}`);
  }
  if (!Number.isFinite(rate.rate) || rate.rate <= 0) throw new Error("Exchange rate must be positive");
  return {
    ...value,
    amount: Math.round(value.amount * rate.rate * 1_000_000) / 1_000_000,
    currency: rate.to.toUpperCase(),
  };
}

export function convertAmount(amount: number, from: string, to: string, rate: ExchangeRate): number {
  return convertMoney({ amount, currency: from, kind: "estimated" }, { ...rate, from, to }).amount;
}
