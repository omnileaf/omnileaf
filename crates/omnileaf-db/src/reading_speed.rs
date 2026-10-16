use rusqlite::Connection;

use crate::Error;

const SESSIONS_LEARNED_FROM: u32 = 30;
const FEWEST_SESSIONS: usize = 3;
const MS_IN_A_SECOND: u64 = 1_000;
const LATEST_PAGE_TIMES: &str = "SELECT (ended_at_ms - started_at_ms) / (page - first_page)
    FROM reading_session
    WHERE page > first_page
    ORDER BY started_at_ms DESC, id DESC
    LIMIT ?1";

/// Learns how long a page takes to read, none until enough sessions turned pages forward.
pub fn seconds_per_page(connection: &Connection) -> Result<Option<u32>, Error> {
    let mut page_times = connection
        .prepare(LATEST_PAGE_TIMES)?
        .query_map([SESSIONS_LEARNED_FROM], |row| row.get::<_, u64>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    if page_times.len() < FEWEST_SESSIONS {
        return Ok(None);
    }
    page_times.sort_unstable();
    let middle = page_times.len() / 2;
    let middle_ms = match (
        page_times.get(middle.wrapping_sub(1)),
        page_times.get(middle),
    ) {
        (Some(below), Some(above)) if page_times.len() % 2 == 0 => below.midpoint(*above),
        (_, Some(middle)) => *middle,
        _ => return Ok(None),
    };
    let seconds = middle_ms.div_ceil(MS_IN_A_SECOND).max(1);
    Ok(u32::try_from(seconds).ok())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::scratch::ScratchLibrary;

    #[test]
    fn reads_the_latest_sessions_backwards_along_their_start_with_no_sort() {
        let scratch = ScratchLibrary::new("reading-speed-plan");

        let plan = scratch.query_plan(LATEST_PAGE_TIMES);

        assert_eq!(
            plan,
            ["SCAN reading_session USING INDEX reading_session_by_start"]
        );
    }
}
