use serde::Deserialize;
use specta::Type;

/// The project's pages the app opens in the system browser; the interface names one, never a URL.
#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ProjectLink {
    SourceCode,
    NewIssue,
}

const SCHEME: &str = "https://";
const SOURCE_CODE: &str = env!("CARGO_PKG_REPOSITORY");
const NEW_ISSUE: &str = concat!(
    env!("CARGO_PKG_REPOSITORY"),
    "/issues/new?template=bug_report.yml"
);

impl ProjectLink {
    #[must_use]
    pub fn url(self) -> &'static str {
        match self {
            Self::SourceCode => SOURCE_CODE,
            Self::NewIssue => NEW_ISSUE,
        }
    }

    #[must_use]
    pub fn address(self) -> &'static str {
        self.url().strip_prefix(SCHEME).unwrap_or(self.url())
    }
}
