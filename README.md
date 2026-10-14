# sharemark

A mark other Solana programs can read for a tokenized stock. It does not control the mint.

Three questions:

1. Is the US cash market open? The 2026 NYSE and Nasdaq calendar, including the two 1:00pm closes. Any other year is `unlisted`.
2. Which claim is this mint? Issuer (`xStocks`, `Ondo`, `Backpack`, `other`) and dividend (`more` tokens, a `higher` price, or `cash`).
3. What is the position worth in shares? Raw tokens times the live multiplier only for the `more` rule. A pool price is refused unless the session is open and the price is under a minute old.

```
cargo test
cargo run -- 1791986400 100000000 8 1.0033 more - 180000000
cargo run -- 1795708800 100000000 8 1.0033 more 180000000 180000000
```

The second command is Thanksgiving. It must print `pool price refused`.

The 128-byte account layout is in `src/pack.rs`. Nothing here is deployed.

The desk in `web/` uses the same rules: live New York session, a refused pool price when the market is shut, and a share count that moves only for the "more tokens" dividend.
