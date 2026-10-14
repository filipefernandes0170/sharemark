//! Turn a raw token balance into shares and a dollar value.
//!
//! A pool price is the price of one displayed token. It is accepted only while
//! [`Session::Open`]. A shut or unlisted market must be marked with the issuer
//! price of one share. The dividend rule decides whether the multiplier changes
//! the share count.

use crate::session::Session;

/// How a dividend shows up for this issuer.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Dividend {
    /// xStocks on Solana. The multiplier raises the displayed share count.
    MoreTokens,
    /// Ondo-style total return. The dividend is inside the price, not the count.
    HigherPrice,
    /// A separate cash payment. The token count and the share price stay put.
    Cash,
}

/// A price the caller already fetched. Times are unix seconds.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Price {
    /// One share of the underlying, in millionths of a dollar.
    PerShare { micro_usd: u64, observed_at: i64 },
    /// One displayed token, in millionths of a dollar. Refused unless the session is open.
    PerDisplayedToken { micro_usd: u64, observed_at: i64 },
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum MarkError {
    /// The pool price was offered while the cash market was not open.
    PoolRefused,
    /// The issuer price is missing, or older than the allowed age.
    StalePrice,
    /// Multiplier was not a positive finite number inside the allowed range.
    BadMultiplier,
    /// Decimals, amount, or price could not be multiplied without overflow.
    BadAmount,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Quote {
    pub session: Session,
    /// Displayed shares, in the token's base units (10^decimals per share).
    pub shares: u128,
    /// Position value in millionths of a dollar.
    pub value_micro_usd: u128,
    /// The pool and the issuer price disagree by more than 50 basis points.
    pub diverged: bool,
}

/// Multiplier from a Token-2022 scaled-UI config, already checked.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Multiplier {
    pub current_num: u128,
    pub new_num: u128,
    pub effective_at: i64,
    pub scale: u128,
}

const SCALE: u128 = 1_000_000_000;

/// Active multiplier as `num / scale`. A future effective time keeps `current`.
pub fn live_multiplier(mult: Multiplier, now: i64) -> Result<u128, MarkError> {
    if mult.scale != SCALE || mult.current_num == 0 || mult.new_num == 0 {
        return Err(MarkError::BadMultiplier);
    }
    let num = if now >= mult.effective_at {
        mult.new_num
    } else {
        mult.current_num
    };
    if num > SCALE * 1_000 {
        return Err(MarkError::BadMultiplier);
    }
    Ok(num)
}

/// Convert the on-chain f64 multiplier into `num / 1e9`.
/// Rejects NaN, infinity, zero, negatives, and anything above 1,000.
pub fn multiplier_from_f64(value: f64) -> Result<u128, MarkError> {
    if !value.is_finite() || value <= 0.0 || value > 1_000.0 {
        return Err(MarkError::BadMultiplier);
    }
    let scaled = value * (SCALE as f64);
    if !scaled.is_finite() {
        return Err(MarkError::BadMultiplier);
    }
    let num = scaled.round();
    if num < 1.0 || num > (SCALE as f64) * 1_000.0 {
        return Err(MarkError::BadMultiplier);
    }
    Ok(num as u128)
}

pub fn quote(
    session: Session,
    dividend: Dividend,
    decimals: u8,
    raw_amount: u64,
    multiplier_num: u128,
    now: i64,
    issuer_max_age: i64,
    prices: &[Price],
) -> Result<Quote, MarkError> {
    if decimals > 18 || multiplier_num == 0 || issuer_max_age < 0 {
        return Err(MarkError::BadAmount);
    }
    let shares = shares(dividend, decimals, raw_amount, multiplier_num)?;
    let issuer = prices.iter().find_map(|price| match *price {
        Price::PerShare { micro_usd, observed_at }
            if micro_usd > 0 && now.saturating_sub(observed_at) <= issuer_max_age && observed_at <= now =>
        {
            Some(micro_usd)
        }
        _ => None,
    });
    let pool = prices.iter().find_map(|price| match *price {
        Price::PerDisplayedToken { micro_usd, observed_at } if micro_usd > 0 && observed_at <= now => {
            Some((micro_usd, observed_at))
        }
        _ => None,
    });

    if let Some((pool_price, observed_at)) = pool {
        if session != Session::Open || now.saturating_sub(observed_at) > 60 {
            return Err(MarkError::PoolRefused);
        }
        let value = value_from_shares(shares, decimals, pool_price)?;
        let diverged = match issuer {
            Some(mark) => divergence_bps(pool_price, mark)? > 50,
            None => false,
        };
        return Ok(Quote {
            session,
            shares,
            value_micro_usd: value,
            diverged,
        });
    }

    let Some(mark) = issuer else {
        return Err(MarkError::StalePrice);
    };
    Ok(Quote {
        session,
        shares,
        value_micro_usd: value_from_shares(shares, decimals, mark)?,
        diverged: false,
    })
}

fn shares(dividend: Dividend, decimals: u8, raw_amount: u64, multiplier_num: u128) -> Result<u128, MarkError> {
    let raw = raw_amount as u128;
    match dividend {
        Dividend::MoreTokens => raw.checked_mul(multiplier_num).map(|product| product / SCALE),
        Dividend::HigherPrice | Dividend::Cash => Some(raw),
    }
    .ok_or(MarkError::BadAmount)
    .and_then(|shares| {
        let _ = decimals;
        if shares > u128::MAX / 1_000_000 {
            Err(MarkError::BadAmount)
        } else {
            Ok(shares)
        }
    })
}

fn value_from_shares(shares: u128, decimals: u8, price_micro: u64) -> Result<u128, MarkError> {
    let unit = 10u128.checked_pow(decimals as u32).ok_or(MarkError::BadAmount)?;
    shares
        .checked_mul(price_micro as u128)
        .and_then(|product| product.checked_div(unit))
        .ok_or(MarkError::BadAmount)
}

fn divergence_bps(left: u64, right: u64) -> Result<u128, MarkError> {
    let left = left as u128;
    let right = right as u128;
    let gap = left.abs_diff(right);
    gap.checked_mul(10_000)
        .and_then(|scaled| scaled.checked_div(right))
        .ok_or(MarkError::BadAmount)
}
