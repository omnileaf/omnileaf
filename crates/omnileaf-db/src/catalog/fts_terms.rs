pub(super) fn quoted(text: &str) -> String {
    format!("\"{}\"", text.replace('"', "\"\""))
}

pub(super) fn any_of(texts: &[String]) -> String {
    texts
        .iter()
        .map(|text| quoted(text))
        .collect::<Vec<_>>()
        .join(" OR ")
}
