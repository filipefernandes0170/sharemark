use sharemark::{
    live_multiplier, multiplier_from_f64, pack_asset, quote, session, unpack_asset, Asset, Dividend,
    Issuer, MarkError, Multiplier, Override, Price, Session, ASSET_LEN,
};

const SCALE: u128 = 1_000_000_000;

#[test]
fn calendar_matches_the_2026_nyse_clock() {
    let cases = [
        (1783087200, Session::Closed),  // Jul 3 holiday, 10:00 ET
        (1791986400, Session::Open),    // Oct 14 10:00
        (1791984600, Session::Open),    // Oct 14 09:30
        (1791984540, Session::Closed),  // Oct 14 09:29
        (1792008000, Session::Closed),  // Oct 14 16:00
        (1791817200, Session::Open),    // Columbus Day
        (1794412800, Session::Open),    // Veterans Day
        (1795708800, Session::Closed),  // Thanksgiving
        (1795802340, Session::Open),    // Black Friday 12:59
        (1795802400, Session::Closed),  // Black Friday 13:00
        (1798133400, Session::Open),    // Christmas Eve 12:30
        (1798135200, Session::Closed),  // Christmas Eve 13:00
        (1798214400, Session::Closed),  // Christmas
        (1792249200, Session::Closed),  // Saturday
        (1799078400, Session::Unlisted), // 2027
    ];
    for (unix, expected) in cases {
        assert_eq!(session(unix, None), expected, "{unix}");
    }
}

#[test]
fn an_override_halts_an_open_day_until_it_expires() {
    let open = 1791986400;
    let halt = Override { open: false, until: open + 60 };
    assert_eq!(session(open, Some(halt)), Session::Closed);
    assert_eq!(session(open + 60, Some(halt)), Session::Open);
}

#[test]
fn pool_price_is_refused_when_the_market_is_shut() {
    let err = quote(
        Session::Closed,
        Dividend::MoreTokens,
        8,
        100_000_000,
        SCALE,
        1_700_000_000,
        86_400,
        &[Price::PerDisplayedToken {
            micro_usd: 100_000_000,
            observed_at: 1_700_000_000,
        }],
    );
    assert_eq!(err, Err(MarkError::PoolRefused));
}

#[test]
fn more_tokens_uses_the_multiplier_and_higher_price_does_not() {
    let num = multiplier_from_f64(1.0033).unwrap();
    let raw = 100_000_000u64;
    let more = quote(
        Session::Closed,
        Dividend::MoreTokens,
        8,
        raw,
        num,
        100,
        86_400,
        &[Price::PerShare {
            micro_usd: 200_000_000,
            observed_at: 90,
        }],
    )
    .unwrap();
    let price = quote(
        Session::Closed,
        Dividend::HigherPrice,
        8,
        raw,
        num,
        100,
        86_400,
        &[Price::PerShare {
            micro_usd: 200_000_000,
            observed_at: 90,
        }],
    )
    .unwrap();
    assert_eq!(more.shares, 100_330_000);
    assert_eq!(price.shares, 100_000_000);
    assert_eq!(more.value_micro_usd, 200_660_000);
    assert_eq!(price.value_micro_usd, 200_000_000);
}

#[test]
fn a_future_multiplier_does_not_apply_early() {
    let mult = Multiplier {
        current_num: SCALE,
        new_num: SCALE + SCALE / 100,
        effective_at: 500,
        scale: SCALE,
    };
    assert_eq!(live_multiplier(mult, 499).unwrap(), SCALE);
    assert_eq!(live_multiplier(mult, 500).unwrap(), SCALE + SCALE / 100);
}

#[test]
fn open_pool_marks_one_displayed_token_and_flags_a_wide_gap() {
    let mark = quote(
        Session::Open,
        Dividend::MoreTokens,
        8,
        100_000_000,
        SCALE,
        100,
        86_400,
        &[
            Price::PerDisplayedToken {
                micro_usd: 110_000_000,
                observed_at: 100,
            },
            Price::PerShare {
                micro_usd: 100_000_000,
                observed_at: 100,
            },
        ],
    )
    .unwrap();
    assert!(mark.diverged);
    assert_eq!(mark.value_micro_usd, 110_000_000);
}

#[test]
fn asset_bytes_round_trip() {
    let asset = Asset {
        dividend: Dividend::MoreTokens,
        issuer: Issuer::Xstocks,
        decimals: 8,
        mint: [7u8; 32],
        symbol: *b"NVDA    ",
        multiplier: Multiplier {
            current_num: SCALE,
            new_num: SCALE,
            effective_at: 10,
            scale: SCALE,
        },
        issuer_price_micro: 180_000_000,
        issuer_price_at: 10,
    };
    let bytes = pack_asset(&asset).unwrap();
    assert_eq!(bytes.len(), ASSET_LEN);
    assert_eq!(unpack_asset(&bytes).unwrap(), asset);
    assert!(unpack_asset(&[0u8; ASSET_LEN]).is_err());
}
