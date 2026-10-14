import { useEffect, useMemo, useState } from "react";
import { Ban, Clock3, Scale } from "lucide-react";
import {
  clockLabel,
  dollarsToMicro,
  formatDollars,
  formatUnits,
  multiplierFromNumber,
  newYork,
  quote,
  session,
  tokensToRaw,
  type Dividend,
  type Session,
} from "./sharemark";

const NAMES = [
  { symbol: "NVDAx", name: "NVIDIA", issuer: "xStocks", dividend: "more" as Dividend },
  { symbol: "AAPLx", name: "Apple", issuer: "xStocks", dividend: "more" as Dividend },
  { symbol: "TSLAx", name: "Tesla", issuer: "xStocks", dividend: "more" as Dividend },
  { symbol: "SPYx", name: "S&P 500", issuer: "xStocks", dividend: "more" as Dividend },
  { symbol: "QQQx", name: "Nasdaq 100", issuer: "xStocks", dividend: "more" as Dividend },
  { symbol: "GLDx", name: "Gold", issuer: "xStocks", dividend: "more" as Dividend },
  { symbol: "Sample", name: "Total-return note", issuer: "Ondo", dividend: "price" as Dividend },
  { symbol: "Cash", name: "Cash dividend", issuer: "Other", dividend: "cash" as Dividend },
];

const SAMPLES = [
  { id: "live", label: "Live clock", unix: null },
  { id: "open", label: "A Wednesday morning", unix: 1791986400 },
  { id: "shut", label: "Thanksgiving", unix: 1795708800 },
] as const;

export function MarkDesk() {
  const [now, setNow] = useState<number | null>(null);
  const [sample, setSample] = useState<(typeof SAMPLES)[number]["id"]>("live");
  const [picked, setPicked] = useState(0);
  const [tokens, setTokens] = useState("1");
  const [multiplier, setMultiplier] = useState("1");
  const [pool, setPool] = useState("");
  const [issuer, setIssuer] = useState("");

  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const name = NAMES[picked];
  const unix = sample === "live" ? now : SAMPLES.find((item) => item.id === sample)?.unix ?? now;
  const state: Session | null = unix === null || unix === undefined ? null : session(unix);
  const local = unix === null || unix === undefined ? null : newYork(unix);

  const result = useMemo(() => {
    if (unix === null || unix === undefined || !state) return null;
    const raw = tokensToRaw(tokens, 8);
    const mult = multiplierFromNumber(Number(multiplier));
    if (raw === null || mult === null) return "amount" as const;
    const poolMicro = dollarsToMicro(pool);
    const issuerMicro = dollarsToMicro(issuer);
    if (pool.trim() && poolMicro === null) return "amount" as const;
    if (issuer.trim() && issuerMicro === null) return "amount" as const;
    return quote({
      session: state,
      dividend: name.dividend,
      decimals: 8,
      rawAmount: raw,
      multiplierNum: mult,
      now: unix,
      issuerMaxAge: 18 * 3600,
      poolMicro: poolMicro ?? undefined,
      poolAt: poolMicro ? unix : undefined,
      issuerMicro: issuerMicro ?? undefined,
      issuerAt: issuerMicro ? unix : undefined,
    });
  }, [issuer, multiplier, name.dividend, pool, state, tokens, unix]);

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-5xl flex-col gap-8 px-4 py-8 sm:px-8">
      <header className="flex flex-col gap-3">
        <p className="text-sm tracking-widest text-brass uppercase">Sharemark</p>
        <h1 className="font-serif text-4xl text-fg sm:text-5xl">What is this token worth in shares?</h1>
        <p className="max-w-2xl text-base leading-relaxed text-muted">
          The cash market decides whether a pool price is allowed. A dividend either adds tokens, raises the
          price, or pays cash. It is never counted twice.
        </p>
      </header>

      <section className="grid gap-4 rounded-2xl border border-line bg-surface p-5 sm:grid-cols-[auto_1fr] sm:items-center">
        <div className="flex items-center gap-3">
          <Clock3 className="text-brass" aria-hidden />
          <div>
            <p className="font-serif text-3xl text-fg">{state ? label(state) : "Reading the clock"}</p>
            <p className="text-sm text-muted">{local ? clockLabel(local) : "New York session"}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {SAMPLES.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setSample(item.id)}
              className={`min-h-11 rounded-full border px-4 text-sm ${
                sample === item.id ? "border-brass bg-brass text-bg" : "border-line bg-bg text-fg"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-2">
        <form className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5" onSubmit={(event) => event.preventDefault()}>
          <label className="flex flex-col gap-2 text-sm text-muted">
            Token
            <select
              value={picked}
              onChange={(event) => setPicked(Number(event.target.value))}
              className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base text-fg"
            >
              {NAMES.map((item, index) => (
                <option key={item.symbol} value={index}>
                  {item.symbol} · {item.name}
                </option>
              ))}
            </select>
          </label>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Issuer</dt>
              <dd className="text-fg">{name.issuer}</dd>
            </div>
            <div>
              <dt className="text-muted">Dividend</dt>
              <dd className="text-fg">{dividendLabel(name.dividend)}</dd>
            </div>
          </dl>
          <Field label="Tokens held" value={tokens} onChange={setTokens} />
          <Field label="Multiplier" value={multiplier} onChange={setMultiplier} />
          <button
            type="button"
            className="self-start text-sm text-brass underline-offset-4 hover:underline"
            onClick={() => setMultiplier("1.0033")}
          >
            Use 1.0033 as an example
          </button>
          <Field label="Pool price, dollars per token" value={pool} onChange={setPool} />
          <Field label="Share price, dollars" value={issuer} onChange={setIssuer} />
        </form>

        <Result state={state} dividend={name.dividend} result={result} decimals={8} />
      </section>
    </main>
  );
}

function Field({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) {
  return (
    <label className="flex flex-col gap-2 text-sm text-muted">
      {label}
      <input
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode="decimal"
        className="min-h-11 rounded-xl border border-line bg-bg px-3 text-base text-fg"
      />
    </label>
  );
}

function Result({
  state,
  dividend,
  result,
  decimals,
}: {
  state: Session | null;
  dividend: Dividend;
  result: ReturnType<typeof quote> | "amount" | null;
  decimals: number;
}) {
  if (!state || result === null) {
    return <aside className="rounded-2xl border border-line bg-surface p-5 text-muted">Waiting for the clock.</aside>;
  }
  if (result === "pool") {
    return (
      <aside className="flex flex-col gap-3 rounded-2xl border border-clay bg-surface p-5">
        <Ban className="text-clay" aria-hidden />
        <h2 className="font-serif text-3xl text-fg">Pool price refused</h2>
        <p className="leading-relaxed text-muted">
          The cash market is {label(state).toLowerCase()}. Clear the pool price and enter the share price. That is the mark.
        </p>
      </aside>
    );
  }
  if (result === "stale" || result === "amount" || result === "multiplier") {
    return (
      <aside className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-5">
        <Scale className="text-brass" aria-hidden />
        <h2 className="font-serif text-3xl text-fg">No mark yet</h2>
        <p className="leading-relaxed text-muted">
          {result === "stale"
            ? "Enter a share price. A pool price is not enough while the market is shut."
            : "Check the token count, the multiplier, and the prices. Use numbers only."}
        </p>
      </aside>
    );
  }
  return (
    <aside className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
      <Scale className="text-brass" aria-hidden />
      <div>
        <p className="text-sm text-muted">Shares</p>
        <p className="font-serif text-4xl text-fg">{formatUnits(result.shares, decimals)}</p>
      </div>
      <div>
        <p className="text-sm text-muted">Value</p>
        <p className="font-serif text-4xl text-fg">{formatDollars(result.valueMicroUsd)}</p>
      </div>
      <p className="text-sm leading-relaxed text-muted">
        {dividend === "more"
          ? "The multiplier changes the share count."
          : "The multiplier is ignored. This dividend does not add tokens."}
        {result.diverged ? " The pool and the share price disagree by more than 0.50%." : ""}
      </p>
    </aside>
  );
}

function label(state: Session): string {
  if (state === "open") return "Open";
  if (state === "closed") return "Closed";
  return "Unlisted";
}

function dividendLabel(dividend: Dividend): string {
  if (dividend === "more") return "More tokens";
  if (dividend === "price") return "Higher price";
  return "Cash";
}
