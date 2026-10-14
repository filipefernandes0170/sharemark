import assert from "node:assert/strict";
import test from "node:test";
import { multiplierFromNumber, quote, session } from "./sharemark.ts";

test("calendar matches the 2026 NYSE clock", () => {
  const cases: Array<[number, string]> = [
    [1783087200, "closed"],
    [1791986400, "open"],
    [1791984600, "open"],
    [1791984540, "closed"],
    [1792008000, "closed"],
    [1791817200, "open"],
    [1794412800, "open"],
    [1795708800, "closed"],
    [1795802340, "open"],
    [1795802400, "closed"],
    [1798133400, "open"],
    [1798135200, "closed"],
    [1798214400, "closed"],
    [1792249200, "closed"],
    [1799078400, "unlisted"],
  ];
  for (const [unix, expected] of cases) {
    assert.equal(session(unix), expected, String(unix));
  }
});

test("pool price is refused when the market is shut", () => {
  assert.equal(
    quote({
      session: "closed",
      dividend: "more",
      decimals: 8,
      rawAmount: 100_000_000n,
      multiplierNum: 1_000_000_000n,
      now: 1_700_000_000,
      issuerMaxAge: 86_400,
      poolMicro: 100_000_000n,
      poolAt: 1_700_000_000,
    }),
    "pool",
  );
});

test("more tokens uses the multiplier and a higher price does not", () => {
  const num = multiplierFromNumber(1.0033);
  assert.ok(num);
  const more = quote({
    session: "closed",
    dividend: "more",
    decimals: 8,
    rawAmount: 100_000_000n,
    multiplierNum: num,
    now: 100,
    issuerMaxAge: 86_400,
    issuerMicro: 200_000_000n,
    issuerAt: 90,
  });
  const higher = quote({
    session: "closed",
    dividend: "price",
    decimals: 8,
    rawAmount: 100_000_000n,
    multiplierNum: num,
    now: 100,
    issuerMaxAge: 86_400,
    issuerMicro: 200_000_000n,
    issuerAt: 90,
  });
  assert.equal(typeof more === "string" ? "" : more.shares, 100_330_000n);
  assert.equal(typeof higher === "string" ? "" : higher.shares, 100_000_000n);
});
