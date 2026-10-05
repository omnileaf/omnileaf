use icu_casemap::CaseMapper;
use unicode_normalization::UnicodeNormalization;

/// Applies NFKC, full case folding, then NFKC again to recompose marks folding split apart (keeping `norm` idempotent), and collapses whitespace.
#[must_use]
pub fn norm(text: &str) -> String {
    let compatible: String = text.nfkc().collect();
    let folded = CaseMapper::new().fold_string(&compatible);
    let recomposed: String = folded.nfkc().collect();
    recomposed.split_whitespace().collect::<Vec<_>>().join(" ")
}
