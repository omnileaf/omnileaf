use std::fmt::Write;

/// Bound beside a value as `char(31) || value || char(31)`, so `instr` finds whole values only.
pub(crate) const SEPARATOR: char = '\u{1f}';

/// The values each closed by the separator and the whole opened by one, or `None` when there are none; a value holding the separator itself is left out, since it could match across two others.
pub(crate) fn delimited_list(values: &[String]) -> Option<String> {
    let kept: Vec<&str> = values
        .iter()
        .map(String::as_str)
        .filter(|value| !value.contains(SEPARATOR))
        .collect();
    if values.is_empty() {
        return None;
    }
    let mut list = String::from(SEPARATOR);
    for value in kept {
        list.push_str(value);
        list.push(SEPARATOR);
    }
    Some(list)
}

/// The values as a JSON array of strings for `json_each`, or `None` when there are none.
pub(crate) fn json_list(values: &[String]) -> Option<String> {
    if values.is_empty() {
        return None;
    }
    let mut json = String::from("[");
    for (index, value) in values.iter().enumerate() {
        if index > 0 {
            json.push(',');
        }
        push_json_string(&mut json, value);
    }
    json.push(']');
    Some(json)
}

fn push_json_string(json: &mut String, value: &str) {
    json.push('"');
    for character in value.chars() {
        match character {
            '"' => json.push_str("\\\""),
            '\\' => json.push_str("\\\\"),
            control if u32::from(control) < 0x20 => {
                let _ = write!(json, "\\u{:04x}", u32::from(control));
            }
            other => json.push(other),
        }
    }
    json.push('"');
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use super::*;

    fn read_back_as_json(values: &[&str]) -> Vec<String> {
        let owned: Vec<String> = values.iter().map(|&value| value.to_owned()).collect();
        let connection = Connection::open_in_memory().unwrap();
        let mut statement = connection
            .prepare("SELECT value FROM json_each(?1) ORDER BY key")
            .unwrap();
        statement
            .query_map([json_list(&owned)], |row| row.get(0))
            .unwrap()
            .collect::<Result<_, _>>()
            .unwrap()
    }

    #[test]
    fn binds_no_json_list_for_no_values() {
        assert_eq!(json_list(&[]), None);
    }

    #[test]
    fn reads_every_value_back_through_json_each_unchanged() {
        let values = [
            "ja",
            "say \"hi\"",
            "back\\slash",
            "tab\tand\nline",
            "\u{1}",
            "日本語",
        ];

        assert_eq!(read_back_as_json(&values), values);
    }

    fn lists(values: &[&str], value: &str) -> bool {
        let owned: Vec<String> = values.iter().map(|&value| value.to_owned()).collect();
        Connection::open_in_memory()
            .unwrap()
            .query_row(
                "SELECT instr(?1, char(31) || ?2 || char(31)) > 0",
                (delimited_list(&owned), value),
                |row| row.get(0),
            )
            .unwrap()
    }

    #[test]
    fn binds_no_list_for_no_values() {
        assert_eq!(delimited_list(&[]), None);
    }

    #[test]
    fn finds_each_listed_value_whole() {
        let listed = ["ja", "pt-BR", "日本語"];

        let found: Vec<bool> = ["ja", "pt-BR", "日本語", "j", "pt", "BR"]
            .map(|value| lists(&listed, value))
            .into();

        assert_eq!(found, [true, true, true, false, false, false]);
    }

    #[test]
    fn leaves_out_a_value_holding_the_separator_so_it_matches_nothing() {
        let found = lists(&["ja\u{1f}en"], "ja");

        assert!(!found);
    }
}
