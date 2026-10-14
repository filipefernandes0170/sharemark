//! Fixed 128-byte account. Any program can read it without this crate's version.
//!
//! ```text
//! 0   magic            4   b"SMRK"
//! 4   version          1   1
//! 5   dividend         1   1 more tokens, 2 higher price, 3 cash
//! 6   issuer           1   1 xStocks, 2 Ondo, 3 Backpack, 4 other
//! 7   decimals         1
//! 8   mint            32
//! 40  symbol           8   ASCII, space padded
//! 48  multiplier_num  16   little-endian, divide by 1e9
//! 64  new_num         16
//! 80  effective_at     8   i64 unix seconds
//! 88  issuer_price     8   u64 micro-USD per share
//! 96  issuer_price_at  8   i64
//! 104 reserved        24
//! ```

use crate::mark::{Dividend, MarkError, Multiplier};

pub const ASSET_LEN: usize = 128;
const SCALE: u128 = 1_000_000_000;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Issuer {
    Xstocks,
    Ondo,
    Backpack,
    Other,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Asset {
    pub dividend: Dividend,
    pub issuer: Issuer,
    pub decimals: u8,
    pub mint: [u8; 32],
    pub symbol: [u8; 8],
    pub multiplier: Multiplier,
    pub issuer_price_micro: u64,
    pub issuer_price_at: i64,
}

pub fn pack_asset(asset: &Asset) -> Result<[u8; ASSET_LEN], MarkError> {
    if asset.decimals > 18 {
        return Err(MarkError::BadAmount);
    }
    let mut out = [0u8; ASSET_LEN];
    out[0..4].copy_from_slice(b"SMRK");
    out[4] = 1;
    out[5] = match asset.dividend {
        Dividend::MoreTokens => 1,
        Dividend::HigherPrice => 2,
        Dividend::Cash => 3,
    };
    out[6] = match asset.issuer {
        Issuer::Xstocks => 1,
        Issuer::Ondo => 2,
        Issuer::Backpack => 3,
        Issuer::Other => 4,
    };
    out[7] = asset.decimals;
    out[8..40].copy_from_slice(&asset.mint);
    out[40..48].copy_from_slice(&asset.symbol);
    out[48..64].copy_from_slice(&asset.multiplier.current_num.to_le_bytes());
    out[64..80].copy_from_slice(&asset.multiplier.new_num.to_le_bytes());
    out[80..88].copy_from_slice(&asset.multiplier.effective_at.to_le_bytes());
    out[88..96].copy_from_slice(&asset.issuer_price_micro.to_le_bytes());
    out[96..104].copy_from_slice(&asset.issuer_price_at.to_le_bytes());
    Ok(out)
}

pub fn unpack_asset(bytes: &[u8]) -> Result<Asset, MarkError> {
    if bytes.len() != ASSET_LEN || &bytes[0..4] != b"SMRK" || bytes[4] != 1 {
        return Err(MarkError::BadAmount);
    }
    let dividend = match bytes[5] {
        1 => Dividend::MoreTokens,
        2 => Dividend::HigherPrice,
        3 => Dividend::Cash,
        _ => return Err(MarkError::BadAmount),
    };
    let issuer = match bytes[6] {
        1 => Issuer::Xstocks,
        2 => Issuer::Ondo,
        3 => Issuer::Backpack,
        4 => Issuer::Other,
        _ => return Err(MarkError::BadAmount),
    };
    let mut mint = [0u8; 32];
    mint.copy_from_slice(&bytes[8..40]);
    let mut symbol = [0u8; 8];
    symbol.copy_from_slice(&bytes[40..48]);
    let multiplier = Multiplier {
        current_num: u128::from_le_bytes(bytes[48..64].try_into().unwrap()),
        new_num: u128::from_le_bytes(bytes[64..80].try_into().unwrap()),
        effective_at: i64::from_le_bytes(bytes[80..88].try_into().unwrap()),
        scale: SCALE,
    };
    Ok(Asset {
        dividend,
        issuer,
        decimals: bytes[7],
        mint,
        symbol,
        multiplier,
        issuer_price_micro: u64::from_le_bytes(bytes[88..96].try_into().unwrap()),
        issuer_price_at: i64::from_le_bytes(bytes[96..104].try_into().unwrap()),
    })
}
