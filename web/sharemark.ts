/** Same rules as the sharemark program. Pool prices die when the cash market is not open. */

export type Session = "open" | "closed" | "unlisted";

export type Dividend = "more" | "price" | "cash";

export type MarkError = "pool" | "stale" | "multiplier" | "amount";

export type Quote = {
  session: Session;
  shares: bigint;
  valueMicroUsd: bigint;
  diverged: boolean;
};

const SCALE = 1_000_000_000n;
const FULL_CLOSE = [
  20260101, 20260119, 20260216, 20260403, 20260525, 20260619, 20260703, 20260907, 20261126, 20261225,
];
const EARLY_CLOSE = [20261127, 20261224];

export type Civil = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  weekday: number;
};

export function session(unixSeconds: number, forced?: { open: boolean; until: number }): Session {
  if (forced && unixSeconds < forced.until) return forced.open ? "open" : "closed";
  const local = newYork(unixSeconds);
  if (!local || local.year !== 2026) return "unlisted";
  const ymd = local.year * 10_000 + local.month * 100 + local.day;
  if (FULL_CLOSE.includes(ymd) || local.weekday >= 5) return "closed";
  const close = EARLY_CLOSE.includes(ymd) ? 13 * 60 : 16 * 60;
  const minute = local.hour * 60 + local.minute;
  return minute >= 9 * 60 + 30 && minute < close ? "open" : "closed";
}

export function newYork(unixSeconds: number): Civil | null {
  const utc = civilUtc(unixSeconds);
  if (!utc) return null;
  const start = nthSunday(utc.year, 3, 2);
  const end = nthSunday(utc.year, 11, 1);
  if (start === null || end === null) return null;
  const offset = unixSeconds >= start + 7 * 3600 && unixSeconds < end + 6 * 3600 ? -4 * 3600 : -5 * 3600;
  return civilUtc(unixSeconds + offset);
}

function nthSunday(year: number, month: number, nth: number): number | null {
  const first = unixUtc(year, month, 1, 0);
  if (first === null) return null;
  const weekday = civilUtc(first)?.weekday;
  if (weekday === undefined) return null;
  const day = 1 + ((7 - weekday) % 7) + (nth - 1) * 7;
  return unixUtc(year, month, day, 0);
}

function unixUtc(year: number, month: number, day: number, hour: number): number | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const y = month <= 2 ? year - 1 : year;
  const era = Math.floor(y / 400);
  const yoe = y - era * 400;
  const mp = month > 2 ? month - 3 : month + 9;
  const doy = Math.floor((153 * mp + 2) / 5) + day - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  const days = era * 146097 + doe - 719468;
  return days * 86400 + hour * 3600;
}

function civilUtc(unixSeconds: number): Civil | null {
  const days = Math.floor(unixSeconds / 86400);
  const tod = ((unixSeconds % 86400) + 86400) % 86400;
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const y = yoe + era * 400;
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const day = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const month = mp < 10 ? mp + 3 : mp - 9;
  const year = month <= 2 ? y + 1 : y;
  const weekday = ((days + 3) % 7 + 7) % 7;
  return { year, month, day, hour: Math.floor(tod / 3600), minute: Math.floor((tod % 3600) / 60), weekday };
}

export function multiplierFromNumber(value: number): bigint | null {
  if (!Number.isFinite(value) || value <= 0 || value > 1000) return null;
  const num = Math.round(value * 1e9);
  if (num < 1 || num > 1e9 * 1000) return null;
  return BigInt(num);
}

export function liveMultiplier(current: bigint, next: bigint, effectiveAt: number, now: number): bigint | null {
  if (current <= 0n || next <= 0n || current > SCALE * 1000n || next > SCALE * 1000n) return null;
  return now >= effectiveAt ? next : current;
}

export function quote(input: {
  session: Session;
  dividend: Dividend;
  decimals: number;
  rawAmount: bigint;
  multiplierNum: bigint;
  now: number;
  issuerMaxAge: number;
  poolMicro?: bigint;
  poolAt?: number;
  issuerMicro?: bigint;
  issuerAt?: number;
}): Quote | MarkError {
  const { decimals, rawAmount, multiplierNum, now, issuerMaxAge } = input;
  if (decimals < 0 || decimals > 18 || multiplierNum <= 0n || issuerMaxAge < 0 || rawAmount < 0n) return "amount";
  const unit = 10n ** BigInt(decimals);
  let shares: bigint;
  if (input.dividend === "more") {
    shares = (rawAmount * multiplierNum) / SCALE;
  } else {
    shares = rawAmount;
  }
  if (shares > (1n << 120n)) return "amount";

  const issuerFresh =
    input.issuerMicro !== undefined &&
    input.issuerAt !== undefined &&
    input.issuerMicro > 0n &&
    input.issuerAt <= now &&
    now - input.issuerAt <= issuerMaxAge;

  if (input.poolMicro !== undefined && input.poolAt !== undefined && input.poolMicro > 0n) {
    if (input.session !== "open" || input.poolAt > now || now - input.poolAt > 60) return "pool";
    const value = (shares * input.poolMicro) / unit;
    const diverged = issuerFresh && bps(input.poolMicro, input.issuerMicro as bigint) > 50n;
    return { session: input.session, shares, valueMicroUsd: value, diverged };
  }
  if (!issuerFresh || input.issuerMicro === undefined) return "stale";
  return {
    session: input.session,
    shares,
    valueMicroUsd: (shares * input.issuerMicro) / unit,
    diverged: false,
  };
}

function bps(left: bigint, right: bigint): bigint {
  const gap = left > right ? left - right : right - left;
  return (gap * 10_000n) / right;
}

export function dollarsToMicro(text: string): bigint | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  if (!/^\d+(\.\d{0,6})?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  const micro = BigInt(whole) * 1_000_000n + BigInt((frac + "000000").slice(0, 6));
  return micro > 0n ? micro : null;
}

export function tokensToRaw(text: string, decimals: number): bigint | null {
  const trimmed = text.trim();
  if (!/^\d+(\.\d+)?$/.test(trimmed)) return null;
  const [whole, frac = ""] = trimmed.split(".");
  if (frac.length > decimals) return null;
  const padded = (frac + "0".repeat(decimals)).slice(0, decimals);
  return BigInt(whole) * 10n ** BigInt(decimals) + BigInt(padded || "0");
}

export function formatUnits(amount: bigint, decimals: number): string {
  const unit = 10n ** BigInt(decimals);
  const whole = amount / unit;
  const frac = (amount % unit).toString().padStart(decimals, "0").replace(/0+$/, "");
  return frac ? `${whole.toLocaleString("en-US")}.${frac}` : whole.toLocaleString("en-US");
}

export function formatDollars(micro: bigint): string {
  const sign = micro < 0n ? "-" : "";
  const abs = micro < 0n ? -micro : micro;
  const whole = abs / 1_000_000n;
  const frac = (abs % 1_000_000n).toString().padStart(6, "0").replace(/0+$/, "");
  const shown = frac ? frac.slice(0, 2).padEnd(2, "0") : "00";
  return `${sign}$${whole.toLocaleString("en-US")}.${shown}`;
}

export function clockLabel(civil: Civil): string {
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const hh = String(civil.hour).padStart(2, "0");
  const mm = String(civil.minute).padStart(2, "0");
  return `${months[civil.month - 1]} ${civil.day}, ${hh}:${mm} New York`;
}
