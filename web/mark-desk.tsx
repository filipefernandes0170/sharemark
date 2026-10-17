import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Ban, Clock3, RefreshCw } from "lucide-react";
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
} from "@/lib/sharemark";

export const Route = createFileRoute("/")({ component: Desk });

type Stock = {
  symbol: string;
  name: string;
  issuer: string;
  dividend: Dividend;
  mint: string;
};

const STOCKS: Stock[] = [
  { symbol: "TSLAx", name: "Tesla", issuer: "xStocks", dividend: "more", mint: "XsDoVfqeBukxuZHWhdvWHBhgEHjGNst4MLodqsJHzoB" },
  { symbol: "NVDAx", name: "NVIDIA", issuer: "xStocks", dividend: "more", mint: "Xsc9qvGR1efVDFGLrVsmkzv3qi45LTBjeUKSPmx9qEh" },
  { symbol: "AAPLx", name: "Apple", issuer: "xStocks", dividend: "more", mint: "XsbEhLAtcf6HdfpFZ5xEMdqW8nfAvcsP5bdudRLJzJp" },
  { symbol: "SPYx", name: "S&P 500", issuer: "xStocks", dividend: "more", mint: "XsoCS1TfEyfFhfvj8EtZ528L3CaKBDBRqRapnBbDF2W" },
  { symbol: "QQQx", name: "Nasdaq 100", issuer: "xStocks", dividend: "more", mint: "Xs8S1uUs1zvS2p7iwtsG3b6fkhpvmwz4GYU3gWAmWHZ" },
];

const SAMPLES = [
  { id: "live", label: "Live clock", unix: null },
  { id: "open", label: "Wednesday open", unix: 1791986400 },
  { id: "shut", label: "Thanksgiving", unix: 1795708800 },
] as const;

function label(state: Session) {
  if (state === "open") return "Cash market open";
  if (state === "closed") return "Cash market closed";
  return "Calendar unlisted";
}

function Desk() {
  const [now, setNow] = useState<number | null>(null);
  const [sample, setSample] = useState<(typeof SAMPLES)[number]["id"]>("live");
  const [picked, setPicked] = useState(0);
  const [tokens, setTokens] = useState("1");
  const [multiplier, setMultiplier] = useState("1");
  const [pool, setPool] = useState("");
  const [issuer, setIssuer] = useState("");
  const [loading, setLoading] = useState(false);
  const [priceNote, setPriceNote] = useState("");

  useEffect(() => {
    const tick = () => setNow(Math.floor(Date.now() / 1000));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, []);

  const stock = STOCKS[picked];
  const unix = sample === "live" ? now : SAMPLES.find((item) => item.id === sample)?.unix ?? now;
  const state: Session | null = unix === null || unix === undefined ? null : session(unix);
  const local = unix === null || unix === undefined ? null : newYork(unix);

  async function loadPrice() {
    setLoading(true);
    setPriceNote("");
    try {
      const res = await fetch(`https://api.dexscreener.com/latest/dex/tokens/${stock.mint}`);
      if (!res.ok) throw new Error("price");
      const data = await res.json();
      const pair = data.pairs?.find((p: { priceUsd?: string }) => p.priceUsd);
      if (!pair?.priceUsd) throw new Error("none");
      setPool(Number(pair.priceUsd).toFixed(2));
      setPriceNote(`Pool ${Number(pair.priceUsd).toFixed(2)} from DexScreener`);
    } catch {
      setPriceNote("No pool price returned");
    } finally {
      setLoading(false);
    }
  }

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
      dividend: stock.dividend,
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
  }, [issuer, multiplier, pool, state, stock.dividend, tokens, unix]);

  const refused = result === "pool";
  const stale = result === "stale";
  const quoteOk = result && typeof result === "object";

  return (
    <main className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-8 px-4 py-10">
      <header className="flex flex-col gap-2">
        <p className="text-xs tracking-[0.2em] text-brass uppercase">Sharemark</p>
        <h1 className="text-3xl text-fg sm:text-4xl">What is this token worth in shares?</h1>
        <p className="max-w-xl text-base leading-relaxed text-muted">
          The cash market decides whether a pool price is allowed. A dividend either adds tokens, raises the price, or pays cash. It is never counted twice.
        </p>
      </header>

      <section className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <Clock3 className="text-brass" aria-hidden />
          <div>
            <p className="text-2xl text-fg">{state ? label(state) : "Reading the clock"}</p>
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

      <section className="grid gap-6 sm:grid-cols-2">
        <div className="flex flex-col gap-4 rounded-2xl border border-line bg-surface p-5">
          <label className="flex flex-col gap-2 text-sm text-muted">
            Token
            <select
              value={picked}
              onChange={(e) => setPicked(Number(e.target.value))}
              className="min-h-11 rounded-lg border border-line bg-bg px-3 text-fg"
            >
              {STOCKS.map((s, i) => (
                <option key={s.symbol} value={i}>
                  {s.symbol} · {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-2 text-sm text-muted">
            Tokens held
            <input
              value={tokens}
              onChange={(e) => setTokens(e.target.value)}
              inputMode="decimal"
              className="min-h-11 rounded-lg border border-line bg-bg px-3 text-fg"
            />
          </label>
          <label className="flex flex-col gap-2 text-sm text-muted">
            Multiplier
            <input
              value={multiplier}
              onChange={(e) => setMultiplier(e.target.value)}
              inputMode="decimal"
              className="min-h-11 rounded-lg border border-line bg-bg px-3 text-fg"
            />
          </label>
          <div className="flex items-end gap-2">
            <label className="flex flex-1 flex-col gap-2 text-sm text-muted">
              Pool price (USD)
              <input
                value={pool}
                onChange={(e) => setPool(e.target.value)}
                inputMode="decimal"
                placeholder="0.00"
                className="min-h-11 rounded-lg border border-line bg-bg px-3 text-fg"
              />
            </label>
            <button
              type="button"
              onClick={loadPrice}
              disabled={loading}
              className="flex min-h-11 items-center gap-2 rounded-lg border border-line bg-bg px-3 text-sm text-fg"
            >
              <RefreshCw className={loading ? "animate-spin" : ""} size={16} />
              Fetch
            </button>
          </div>
          <label className="flex flex-col gap-2 text-sm text-muted">
            Issuer price (USD)
            <input
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              inputMode="decimal"
              placeholder="optional"
              className="min-h-11 rounded-lg border border-line bg-bg px-3 text-fg"
            />
          </label>
          {priceNote && <p className="text-xs text-muted">{priceNote}</p>}
          <p className="text-xs text-muted">
            {stock.issuer} · {stock.dividend === "more" ? "more tokens" : stock.dividend} · {stock.mint.slice(0, 6)}…{stock.mint.slice(-4)}
          </p>
        </div>

        <div className="flex flex-col justify-center gap-4 rounded-2xl border border-line bg-surface p-5">
          {refused && (
            <div className="flex items-start gap-3">
              <Ban className="mt-1 text-clay" />
              <div>
                <p className="text-xl text-fg">Pool price refused</p>
                <p className="text-sm text-muted">The cash market is not open. An issuer price is required.</p>
              </div>
            </div>
          )}
          {stale && (
            <div>
              <p className="text-xl text-fg">No fresh price</p>
              <p className="text-sm text-muted">Enter an issuer price, or wait for the market to open.</p>
            </div>
          )}
          {quoteOk && (
            <div className="flex flex-col gap-1">
              <p className="text-sm text-muted">Displayed shares</p>
              <p className="text-3xl text-fg">{formatUnits(result.shares, 8)}</p>
              <p className="mt-3 text-sm text-muted">Value</p>
              <p className="text-3xl text-brass">{formatDollars(result.valueMicroUsd)}</p>
              {result.diverged && <p className="mt-2 text-sm text-clay">Pool and issuer differ by more than 50 bps.</p>}
            </div>
          )}
          {result === "amount" && <p className="text-sm text-muted">Check the token amount and multiplier.</p>}
          {!result && <p className="text-sm text-muted">Waiting for the clock.</p>}
        </div>
      </section>
    </main>
  );
}
