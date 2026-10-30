use rusqlite::{Connection, ToSql};

use super::spelling_trigrams::quoted;
use crate::{Error, adult_content::AdultHiding};

const MOST_TRIGRAMS: usize = 4;
const COMMON_AT: usize = 50;
pub(super) const WINDOW: usize = MOST_TRIGRAMS * COMMON_AT;

pub(super) fn rarest_trigrams(
    connection: &Connection,
    matches_up_to_common: &str,
    typed: &[String],
    hiding: AdultHiding,
) -> Result<Vec<String>, Error> {
    let mut probe = connection.prepare(matches_up_to_common)?;
    let [leaves_out, counts] = hiding.params();
    let mut found = Vec::new();
    for trigram in typed {
        let matches: usize = probe.query_row(
            &[
                (":query", &quoted(trigram) as &dyn ToSql),
                (":limit", &COMMON_AT),
                leaves_out,
                counts,
            ][..],
            |row| row.get(0),
        )?;
        if matches > 0 {
            found.push((matches, trigram));
        }
    }
    let (mut rare, common): (Vec<_>, Vec<_>) = found
        .into_iter()
        .partition(|(matches, _)| *matches < COMMON_AT);
    rare.sort_by_key(|(matches, _)| *matches);
    let wanted = if rare.is_empty() { common } else { rare };
    Ok(wanted
        .into_iter()
        .take(MOST_TRIGRAMS)
        .map(|(_, trigram)| trigram.clone())
        .collect())
}
