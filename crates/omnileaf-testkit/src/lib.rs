//! Deterministic test fixtures (page images, comic archives and a sample library) and the timing budgets speed tests enforce.

mod archive;
mod error;
mod generated_library;
mod library;
mod page;
mod speed_trial;
mod timing_budget;

pub use archive::{ArchiveEntry, Compression, cbz};
pub use error::FixtureError;
pub use generated_library::{GENERATED_LIBRARY_NAME, GeneratedLibrary, write_generated_library};
pub use library::{
    SAMPLE_LIBRARY, SAMPLE_LIBRARY_NAME, SeriesLayout, SeriesSpec, write_sample_library,
};
pub use page::{
    PageShape, full_chroma_scan_jpeg, page_jpeg, page_png, page_webp, subsampled_scan_jpeg,
};
pub use speed_trial::{Pass, Sampling, SpeedTrial, Statistic, TIMED_PASSES, TrialOutcome};
pub use timing_budget::{BUDGET_SLACK_VARIABLE, InvalidBudgetSlack, TimingBudget};
