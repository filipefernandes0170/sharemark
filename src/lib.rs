//! Sharemark tells a program three things about a tokenized stock.
//!
//! It does not control the mint. Issuers keep their own tokens.
//! Other programs read [`Asset`] bytes, or call [`quote`].

mod mark;
mod pack;
mod session;

pub use mark::{live_multiplier, multiplier_from_f64, quote, Dividend, MarkError, Multiplier, Price, Quote};
pub use pack::{pack_asset, unpack_asset, Asset, Issuer, ASSET_LEN};
pub use session::{session, Override, Session};
