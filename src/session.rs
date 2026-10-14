//! US cash-equity session for the 2026 NYSE and Nasdaq calendar.
//!
//! Regular hours are 09:30–16:00 America/New_York, the close instant excluded.
//! Full closes and the two 13:00 early closes are the dates published for 2026.
//! Columbus Day and Veterans Day are open. Any other year is [`Session::Unlisted`]:
//! the pool price is refused rather than guessed. An override covers a halt.

/// What the cash market is doing at one timestamp.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Session {
    /// A regular or early-close day, inside the open window.
    Open,
    /// Weekend, holiday, before the open, or at/after the close.
    Closed,
    /// The date is outside the 2026 calendar this crate will vouch for.
    Unlisted,
}

/// A halt or a one-off open, set by an operator. It wins until `until`.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct Override {
    pub open: bool,
    pub until: i64,
}

const FULL_CLOSE_2026: [i32; 10] = [
    20260101, 20260119, 20260216, 20260403, 20260525, 20260619, 20260703, 20260907, 20261126,
    20261225,
];

const EARLY_CLOSE_2026: [i32; 2] = [20261127, 20261224];

/// Session at `unix_seconds`. `forced` replaces the calendar until it expires.
pub fn session(unix_seconds: i64, forced: Option<Override>) -> Session {
    if let Some(flag) = forced {
        if unix_seconds < flag.until {
            return if flag.open { Session::Open } else { Session::Closed };
        }
    }
    let Some(local) = new_york(unix_seconds) else {
        return Session::Unlisted;
    };
    if local.year != 2026 {
        return Session::Unlisted;
    }
    let ymd = local.year * 10_000 + local.month * 100 + local.day;
    if FULL_CLOSE_2026.binary_search(&ymd).is_ok() || local.weekday >= 5 {
        return Session::Closed;
    }
    let close = if EARLY_CLOSE_2026.binary_search(&ymd).is_ok() {
        13 * 60
    } else {
        16 * 60
    };
    let minute = local.hour * 60 + local.minute;
    if minute >= 9 * 60 + 30 && minute < close {
        Session::Open
    } else {
        Session::Closed
    }
}

struct Civil {
    year: i32,
    month: i32,
    day: i32,
    hour: i32,
    minute: i32,
    weekday: i32,
}

/// America/New_York civil time. US DST: second Sunday in March 07:00 UTC
/// through the first Sunday in November 06:00 UTC.
fn new_york(unix_seconds: i64) -> Option<Civil> {
    let utc = civil_utc(unix_seconds)?;
    let start = nth_sunday(utc.year, 3, 2)? + 7 * 3600;
    let end = nth_sunday(utc.year, 11, 1)? + 6 * 3600;
    let offset = if unix_seconds >= start && unix_seconds < end {
        -4 * 3600
    } else {
        -5 * 3600
    };
    civil_utc(unix_seconds + offset)
}

fn nth_sunday(year: i32, month: u32, nth: u32) -> Option<i64> {
    let first = unix_utc(year, month, 1, 0)?;
    let weekday = civil_utc(first)?.weekday;
    let day = 1 + (7 - weekday) % 7 + (nth as i32 - 1) * 7;
    unix_utc(year, month, day as u32, 0)
}

fn unix_utc(year: i32, month: u32, day: u32, hour: i32) -> Option<i64> {
    if !(1..=12).contains(&month) || !(1..=31).contains(&day) {
        return None;
    }
    let y = if month <= 2 { year - 1 } else { year };
    let era = y.div_euclid(400);
    let yoe = (y - era * 400) as u32;
    let mp = if month > 2 { month - 3 } else { month + 9 };
    let doy = (153 * mp + 2) / 5 + day - 1;
    let doe = yoe * 365 + yoe / 4 - yoe / 100 + doy;
    let days = (era as i64) * 146097 + doe as i64 - 719468;
    Some(days * 86400 + hour as i64 * 3600)
}

fn civil_utc(unix_seconds: i64) -> Option<Civil> {
    let days = unix_seconds.div_euclid(86400);
    let tod = unix_seconds.rem_euclid(86400);
    let z = days + 719468;
    let era = z.div_euclid(146097);
    let doe = (z - era * 146097) as u32;
    let yoe = (doe - doe / 1460 + doe / 36524 - doe / 146096) / 365;
    let y = yoe as i32 + era as i32 * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let day = doy - (153 * mp + 2) / 5 + 1;
    let month = if mp < 10 { mp + 3 } else { mp - 9 };
    let year = if month <= 2 { y + 1 } else { y };
    let weekday = (days + 3).rem_euclid(7) as i32;
    Some(Civil {
        year,
        month: month as i32,
        day: day as i32,
        hour: (tod / 3600) as i32,
        minute: ((tod % 3600) / 60) as i32,
        weekday,
    })
}
