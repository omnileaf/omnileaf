mod archive;
#[cfg(feature = "log-capture")]
mod captured_log;
mod cb7;
mod encoded_page;
mod error;
mod generated_library;
mod header_only;
mod in_flight;
mod library;
mod page;
mod rar;
mod rar_checksums;
mod scratch_folder;
mod speed_trial;
mod strip;
mod timing_budget;
mod waiting;

pub use archive::{ArchiveEntry, Compression, cbz, cut_inside_entry};
#[cfg(feature = "log-capture")]
pub use captured_log::{CapturedLog, Capturing};
pub use cb7::{Packing, cb7};
pub use encoded_page::{
    ENCODED_PAGE_HEIGHT, ENCODED_PAGE_INK, ENCODED_PAGE_PAPER, ENCODED_PAGE_WIDTH,
    INK_OVER_CLEAR_JXL, INK_OVER_PAPER_AVIF, INK_OVER_PAPER_JXL,
};
pub use error::FixtureError;
pub use generated_library::{GENERATED_LIBRARY_NAME, GeneratedLibrary, write_generated_library};
pub use header_only::{jxl_header_only, webp_header_only};
pub use in_flight::{Entered, InFlight};
pub use library::{
    SAMPLE_LIBRARY, SAMPLE_LIBRARY_NAME, SeriesLayout, SeriesSpec, write_sample_library,
};
pub use page::{
    DrawnScan, PageShape, full_chroma_scan_jpeg, incompressible_bytes, margined_scan_jpeg,
    page_jpeg, page_png, page_webp, subsampled_scan_jpeg,
};
pub use rar::{RarEncryption, RarFormat, RarMethod, RarOptions, RarVolume, cbr};
pub use rar_checksums::refresh_rar_header_checksums;
pub use scratch_folder::ScratchFolder;
pub use speed_trial::{Pass, Sampling, SpeedTrial, Statistic, TIMED_PASSES, TrialOutcome};
pub use strip::strip_jpeg;
pub use timing_budget::{BUDGET_SLACK_VARIABLE, InvalidBudgetSlack, TimingBudget};
pub use waiting::{GENEROUS_WAIT, wait_until, yield_times};
