use icu_casemap::CaseMapper;
use unicode_normalization::UnicodeNormalization;

/// Applies NFKC again after full case folding, which can split apart marks that NFKC composed.
#[must_use]
pub fn norm(text: &str) -> String {
    let compatible: String = text.nfkc().collect();
    let folded = CaseMapper::new().fold_string(&compatible);
    let recomposed: String = folded.nfkc().collect();
    recomposed.split_whitespace().collect::<Vec<_>>().join(" ")
}
