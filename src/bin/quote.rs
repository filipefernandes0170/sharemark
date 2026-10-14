//! `sharemark <unix> <raw> <decimals> <multiplier> <dividend> [pool_micro] [issuer_micro]`
//!
//! dividend is `more`, `price`, or `cash`.
//! A pool price is refused when the 2026 cash session is not open.

use sharemark::{quote, session, Dividend, MarkError, Multiplier, Price, Session};
use std::env;
use std::process::ExitCode;

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    if args.len() < 5 {
        eprintln!("usage: sharemark <unix> <raw> <decimals> <multiplier> <more|price|cash> [pool_micro] [issuer_micro]");
        return ExitCode::from(2);
    }
    match run(&args) {
        Ok(text) => {
            println!("{text}");
            ExitCode::SUCCESS
        }
        Err(err) => {
            eprintln!("{err}");
            ExitCode::from(1)
        }
    }
}

fn run(args: &[String]) -> Result<String, String> {
    let now = parse_i64(&args[0])?;
    let raw = parse_u64(&args[1])?;
    let decimals = parse_u64(&args[2])? as u8;
    let multiplier = sharemark::multiplier_from_f64(parse_f64(&args[3])?).map_err(show)?;
    let dividend = match args[4].as_str() {
        "more" => Dividend::MoreTokens,
        "price" => Dividend::HigherPrice,
        "cash" => Dividend::Cash,
        _ => return Err("dividend must be more, price, or cash".to_string()),
    };
    let mut prices = Vec::new();
    if args.len() > 5 && args[5] != "-" {
        prices.push(Price::PerDisplayedToken {
            micro_usd: parse_u64(&args[5])?,
            observed_at: now,
        });
    }
    if args.len() > 6 && args[6] != "-" {
        prices.push(Price::PerShare {
            micro_usd: parse_u64(&args[6])?,
            observed_at: now,
        });
    }
    let state = session(now, None);
    let mult = Multiplier {
        current_num: multiplier,
        new_num: multiplier,
        effective_at: 0,
        scale: 1_000_000_000,
    };
    let live = sharemark::live_multiplier(mult, now).map_err(show)?;
    let mark = quote(state, dividend, decimals, raw, live, now, 18 * 3600, &prices).map_err(show)?;
    Ok(format!(
        "session={} shares={} value_micro_usd={} diverged={}",
        show_session(mark.session),
        mark.shares,
        mark.value_micro_usd,
        mark.diverged
    ))
}

fn show_session(session: Session) -> &'static str {
    match session {
        Session::Open => "open",
        Session::Closed => "closed",
        Session::Unlisted => "unlisted",
    }
}

fn show(err: MarkError) -> String {
    match err {
        MarkError::PoolRefused => "pool price refused".to_string(),
        MarkError::StalePrice => "issuer price missing or stale".to_string(),
        MarkError::BadMultiplier => "bad multiplier".to_string(),
        MarkError::BadAmount => "bad amount".to_string(),
    }
}

fn parse_i64(value: &str) -> Result<i64, String> {
    value.parse().map_err(|_| format!("not an integer: {value}"))
}

fn parse_u64(value: &str) -> Result<u64, String> {
    value.parse().map_err(|_| format!("not an integer: {value}"))
}

fn parse_f64(value: &str) -> Result<f64, String> {
    value.parse().map_err(|_| format!("not a number: {value}"))
}
