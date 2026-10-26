mod archive;
mod cb7;
mod encoded_page;
mod error;
mod generated_library;
mod header_only;
mod library;
mod page;
mod scratch_folder;
mod speed_trial;
mod strip;
mod timing_budget;

pub use archive::{ArchiveEntry, Compression, cbz, cut_inside_entry};
pub use cb7::{Packing, cb7};
pub use encoded_page::{
    ENCODED_PAGE_HEIGHT, ENCODED_PAGE_INK, ENCODED_PAGE_PAPER, ENCODED_PAGE_WIDTH,
    INK_OVER_CLEAR_JXL, INK_OVER_PAPER_AVIF, INK_OVER_PAPER_JXL,
};
pub use error::FixtureError;
pub use generated_library::{GENERATED_LIBRARY_NAME, GeneratedLibrary, write_generated_library};
pub use header_only::{jxl_header_only, webp_header_only};
pub use library::{
    SAMPLE_LIBRARY, SAMPLE_LIBRARY_NAME, SeriesLayout, SeriesSpec, write_sample_library,
};
pub use page::{
    DrawnScan, PageShape, full_chroma_scan_jpeg, incompressible_bytes, page_jpeg, page_png,
    page_webp, subsampled_scan_jpeg,
};
pub use scratch_folder::ScratchFolder;
pub use speed_trial::{Pass, Sampling, SpeedTrial, Statistic, TIMED_PASSES, TrialOutcome};
pub use strip::strip_jpeg;
pub use timing_budget::{BUDGET_SLACK_VARIABLE, InvalidBudgetSlack, TimingBudget};
