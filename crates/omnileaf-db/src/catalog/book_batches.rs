pub(crate) const BOOKS_PER_QUERY: usize = 32;

pub(crate) fn book_placeholders(count: usize) -> String {
    vec!["?"; count].join(", ")
}
