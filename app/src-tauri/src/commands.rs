use std::path::PathBuf;

use omnileaf_edge_swipe::{BackSwipe, SwipeEdge};
#[cfg(debug_assertions)]
use omnileaf_engine::BuildProfile;
use omnileaf_engine::{
    AdultContent, AppInfo, AppLanguage, BookCursor, BookId, BookPlace, BookSessions, BooksRemoval,
    CategoryId, Core, CoversPerRow, CreatorSeries, DetailEdits, FolderCursor, FolderId, FolderPage,
    FolderRescan, FolderScan, FoundLibrary, HistoryCursor, HistoryMark, HistoryOf, HistoryPage,
    HistorySeries, HomeChoice, InterfaceError, LabelChanges, Library, LibraryCategory,
    LibraryError, LibraryFilter, LibraryFilterChoices, LibraryListing, LibrarySearch, LibraryTab,
    LibraryTag, LibraryView, LocalDay, MissingFolder, OpenedBook, ProbedFormat,
    ProblemReportPreview, ProjectLink, ReadMark, ReadingSummary, ReadingWeek, ReportCode,
    ResourceRouter, RootLocator, SavedProblemReport, ScanProgress, SeriesBookListing,
    SeriesBookPage, SeriesCursor, SeriesDetails, SeriesId, SeriesLabels, SeriesOverview,
    SeriesPage, SpellingSuggestion, StorageUse, UtcOffset,
};
use omnileaf_icon_actions::IconAction;
use tauri::{AppHandle, Manager, State, WebviewWindow, Window, Wry, ipc::Channel};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;
use tauri_specta::{Builder, Commands, collect_commands, collect_events};

#[cfg(debug_assertions)]
use crate::crash_reporting::developer_crashes;
use crate::{
    back_swipe,
    crash_reporting::{CrashReportOffer, CrashReporting},
    folder_picker::pick_folder,
    folder_share::SystemShares,
    full_screen::{self, FullScreenChange},
    home_folder::{self, ChosenHome},
    icon_actions::{self, IconActionsMenu},
    ipc_error::IpcError,
    library_events::{LibraryChanged, ReadingSaved},
    library_problem::{LibraryAtLaunch, LibraryProblem},
    problem_reporting::{self, ShownProblemReport},
    screen_orientation::{self, ScreenOrientation},
    share_sign_in::{self, SignInOutcome},
    storage::StoragePlaces,
    system_bars::{self, Theme, ThemePreference},
    system_settings, system_sign_in,
    tray::{TrayItemChosen, TrayMenu},
    version_details,
};

macro_rules! app_commands {
    ($($development_only:ident),*) => {
        collect_commands![
            app_info,
            library_problem,
            add_library_folder,
            link_library_folder,
            match_system_bars,
            watch_back_swipes,
            allow_back_swipe,
            library_folders,
            library_series,
            library_series_count,
            library_categories,
            library_filter_choices,
            series_labels,
            label_series,
            keeps_detail_edits,
            series_details,
            edit_series_details,
            library_tags,
            rename_library_tag,
            remove_library_tag,
            category_series,
            category_series_count,
            folder_series,
            folder_series_count,
            library_search,
            library_search_count,
            series_overview,
            series_books,
            creator_series,
            bookmark_pages,
            book_place,
            mark_books,
            mark_series_read,
            open_book,
            reading_restored,
            page_shown,
            close_book,
            reading_history,
            remove_from_history,
            restore_to_history,
            clear_history,
            restore_history,
            reading_week,
            book_sessions,
            history_series,
            reading_time_between,
            book_read_time,
            reading_summary,
            orient_screen,
            change_full_screen,
            library_listing,
            set_library_listing,
            library_view,
            set_library_view,
            library_adult_content,
            set_library_adult_content,
            library_tabs,
            set_library_tabs,
            library_spelling_suggestion,
            missing_library_folders,
            library_hidden_series_count,
            show_missing_library_folder,
            relocate_library_folder,
            sign_in_to_library_folder,
            show_series_in_folder,
            remove_library_folder,
            library_folder_book_count,
            rescan_library_folder,
            rescan_library_folders,
            remove_books_of_emptied_folder,
            found_library,
            choose_home_folder,
            use_found_library,
            first_launch_finished,
            finish_first_launch,
            set_app_language,
            set_scheduled_rescans,
            set_book_open,
            set_learns_reading_speed,
            copy_version_details,
            open_project_link,
            problem_report,
            copy_problem_report,
            send_problem_report,
            copy_problem_report_code,
            open_problem_report_issue,
            save_problem_report,
            show_saved_problem_report,
            offer_saved_crash_report,
            offer_interface_error_report,
            send_crash_report,
            copy_crash_report,
            decline_crash_report,
            check_storage,
            clear_cached_pages,
            clear_covers,
            show_tray_menu,
            show_icon_actions,
            watch_icon_actions,
            open_system_settings,
            $($development_only),*
        ]
    };
}

pub(crate) fn builder() -> Builder<Wry> {
    Builder::new()
        .commands(registered_commands())
        .events(collect_events![
            LibraryChanged,
            ReadingSaved,
            TrayItemChosen
        ])
        .constant("COVERS_PER_ROW", CoversPerRow::RANGES)
        .constant("DEFAULT_LIBRARY_VIEW", LibraryView::default())
        .constant("DEFAULT_LIBRARY_LISTING", LibraryListing::default())
        .constant("SEARCH_MAX_CHARS", LibrarySearch::MAX_CHARS)
}

#[cfg(debug_assertions)]
fn registered_commands() -> Commands<Wry> {
    app_commands![panic_in_core, crash_and_quit]
}

#[cfg(not(debug_assertions))]
fn registered_commands() -> Commands<Wry> {
    app_commands![]
}

#[tauri::command]
#[specta::specta]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri hands command arguments over by value"
)]
fn app_info(core: State<'_, Core>) -> AppInfo {
    core.app_info().clone()
}

#[tauri::command]
#[specta::specta]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri hands command arguments over by value"
)]
fn library_problem(launch: State<'_, LibraryAtLaunch>) -> Option<LibraryProblem> {
    launch.problem
}

#[tauri::command]
#[specta::specta]
async fn add_library_folder(
    window: Window,
    library: State<'_, Library>,
    on_progress: Channel<ScanProgress>,
) -> Result<Option<FolderScan>, IpcError> {
    let picked = off_the_runtime(move || pick_folder(&window)).await?;
    let Some(folder) = picked else {
        return Ok(None);
    };
    let added = library
        .add_folder(folder, reporting_to(on_progress))
        .await?;
    #[cfg(target_os = "macos")]
    crate::folder_share::remember_shares(&library).await;
    Ok(Some(added))
}

#[tauri::command]
#[specta::specta]
async fn link_library_folder(
    library: State<'_, Library>,
    folder: PathBuf,
    on_progress: Channel<ScanProgress>,
) -> Result<FolderScan, IpcError> {
    Ok(library
        .add_folder(folder, reporting_to(on_progress))
        .await?)
}

#[tauri::command]
#[specta::specta]
async fn rescan_library_folder(
    #[cfg_attr(
        not(target_os = "ios"),
        expect(unused_variables, reason = "only iOS reopens picked folders")
    )]
    app: AppHandle,
    library: State<'_, Library>,
    id: FolderId,
    on_progress: Channel<ScanProgress>,
) -> Result<FolderRescan, IpcError> {
    #[cfg(target_os = "ios")]
    crate::folder_access::reopen_picked_folders(&app, &library).await?;
    Ok(library.rescan_folder(id, reporting_to(on_progress)).await?)
}

#[tauri::command]
#[specta::specta]
async fn relocate_library_folder(
    window: Window,
    library: State<'_, Library>,
    id: FolderId,
    on_progress: Channel<ScanProgress>,
) -> Result<Option<FolderRescan>, IpcError> {
    let picked = off_the_runtime(move || pick_folder(&window)).await?;
    let Some(folder) = picked else {
        return Ok(None);
    };
    let relocated = library
        .relocate_folder(id, folder, reporting_to(on_progress))
        .await?;
    #[cfg(target_os = "macos")]
    crate::folder_share::remember_shares(&library).await;
    Ok(Some(relocated))
}

#[tauri::command]
#[specta::specta]
async fn sign_in_to_library_folder(
    window: WebviewWindow,
    library: State<'_, Library>,
    id: FolderId,
) -> Result<SignInOutcome, IpcError> {
    let share = library.unreachable_share(id, &SystemShares).await?;
    Ok(share_sign_in::sign_in(
        share,
        async |address| system_sign_in::ask(&window, address).await,
        async || !matches!(library.unreachable_share(id, &SystemShares).await, Ok(None)),
    )
    .await)
}

#[tauri::command]
#[specta::specta]
async fn missing_library_folders(
    library: State<'_, Library>,
) -> Result<Vec<MissingFolder>, IpcError> {
    Ok(library.missing_folders(&SystemShares).await?)
}

#[tauri::command]
#[specta::specta]
async fn library_hidden_series_count(library: State<'_, Library>) -> Result<u32, IpcError> {
    Ok(library.hidden_series_count().await?)
}

#[tauri::command]
#[specta::specta]
async fn show_missing_library_folder(
    library: State<'_, Library>,
    id: FolderId,
    is_shown: bool,
) -> Result<(), IpcError> {
    Ok(library.show_missing_folder(id, is_shown).await?)
}

#[tauri::command]
#[specta::specta]
async fn rescan_library_folders(
    #[cfg_attr(
        not(target_os = "ios"),
        expect(unused_variables, reason = "only iOS reopens picked folders")
    )]
    app: AppHandle,
    library: State<'_, Library>,
) -> Result<Vec<FolderRescan>, IpcError> {
    #[cfg(target_os = "ios")]
    crate::folder_access::reopen_picked_folders(&app, &library).await?;
    Ok(library.rescan_folders().await?)
}

#[tauri::command]
#[specta::specta]
async fn remove_books_of_emptied_folder(
    #[cfg_attr(
        not(target_os = "ios"),
        expect(unused_variables, reason = "only iOS reopens picked folders")
    )]
    app: AppHandle,
    library: State<'_, Library>,
    id: FolderId,
) -> Result<BooksRemoval, IpcError> {
    #[cfg(target_os = "ios")]
    crate::folder_access::reopen_picked_folders(&app, &library).await?;
    Ok(library.remove_books_of_emptied_folder(id).await?)
}

fn reporting_to(on_progress: Channel<ScanProgress>) -> impl FnMut(ScanProgress) + Send {
    move |progress| {
        if let Err(error) = on_progress.send(progress) {
            tracing::debug!(%error, "the interface stopped listening for scan progress");
        }
    }
}

#[tauri::command]
#[specta::specta]
async fn match_system_bars(
    app: AppHandle,
    theme: Theme,
    preference: ThemePreference,
) -> Result<(), IpcError> {
    system_bars::match_theme(&app, theme, preference).await
}

#[tauri::command]
#[specta::specta]
async fn watch_back_swipes(app: AppHandle, on_swipe: Channel<BackSwipe>) -> Result<(), IpcError> {
    back_swipe::watch(&app, on_swipe).await
}

#[tauri::command]
#[specta::specta]
async fn allow_back_swipe(app: AppHandle, edge: Option<SwipeEdge>) -> Result<(), IpcError> {
    back_swipe::allow(&app, edge).await
}

#[tauri::command]
#[specta::specta]
async fn library_folders(
    library: State<'_, Library>,
    after: Option<FolderCursor>,
) -> Result<FolderPage, IpcError> {
    Ok(library.folders(after).await?)
}

#[tauri::command]
#[specta::specta]
async fn library_series(
    library: State<'_, Library>,
    after: Option<SeriesCursor>,
    listing: LibraryListing,
) -> Result<SeriesPage, IpcError> {
    Ok(library.series(listing, after).await?)
}

#[tauri::command]
#[specta::specta]
async fn library_series_count(
    library: State<'_, Library>,
    filter: LibraryFilter,
) -> Result<u32, IpcError> {
    Ok(library.series_count(filter).await?)
}

#[tauri::command]
#[specta::specta]
async fn library_categories(library: State<'_, Library>) -> Result<Vec<LibraryCategory>, IpcError> {
    Ok(library.categories()?)
}

#[tauri::command]
#[specta::specta]
async fn series_labels(
    library: State<'_, Library>,
    series: Vec<SeriesId>,
) -> Result<SeriesLabels, IpcError> {
    Ok(library.series_labels(series)?)
}

#[tauri::command]
#[specta::specta]
#[expect(
    unused_variables,
    clippy::needless_pass_by_value,
    reason = "the library keeps no categories or tags yet, so the changes have nowhere to go"
)]
fn label_series(series: Vec<SeriesId>, changes: LabelChanges) -> Result<(), IpcError> {
    Err(IpcError::labels_not_kept())
}

#[tauri::command]
#[specta::specta]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri hands command arguments over by value"
)]
fn keeps_detail_edits(library: State<'_, Library>) -> bool {
    library.keeps_detail_edits()
}

#[tauri::command]
#[specta::specta]
async fn series_details(
    library: State<'_, Library>,
    series: SeriesId,
) -> Result<SeriesDetails, IpcError> {
    Ok(library.series_details(series).await?)
}

#[tauri::command]
#[specta::specta]
#[expect(
    unused_variables,
    clippy::needless_pass_by_value,
    reason = "the library keeps no edits to series details yet, so they have nowhere to go"
)]
fn edit_series_details(series: SeriesId, edits: DetailEdits) -> Result<(), IpcError> {
    Err(IpcError::details_not_kept())
}

#[tauri::command]
#[specta::specta]
async fn library_tags(library: State<'_, Library>) -> Result<Vec<LibraryTag>, IpcError> {
    Ok(library.tags()?)
}

#[tauri::command]
#[specta::specta]
#[expect(
    unused_variables,
    clippy::needless_pass_by_value,
    reason = "the library keeps no tags yet, so there's none to rename"
)]
fn rename_library_tag(tag: String, to: String) -> Result<(), IpcError> {
    Err(IpcError::labels_not_kept())
}

#[tauri::command]
#[specta::specta]
#[expect(
    unused_variables,
    clippy::needless_pass_by_value,
    reason = "the library keeps no tags yet, so there's none to remove"
)]
fn remove_library_tag(tag: String) -> Result<Vec<SeriesId>, IpcError> {
    Err(IpcError::labels_not_kept())
}

#[tauri::command]
#[specta::specta]
async fn library_filter_choices(
    library: State<'_, Library>,
) -> Result<LibraryFilterChoices, IpcError> {
    Ok(library.filter_choices()?)
}

#[tauri::command]
#[specta::specta]
async fn category_series(
    library: State<'_, Library>,
    category: CategoryId,
    after: Option<SeriesCursor>,
    listing: LibraryListing,
) -> Result<SeriesPage, IpcError> {
    Ok(library.category_series(category, listing, after)?)
}

#[tauri::command]
#[specta::specta]
async fn category_series_count(
    library: State<'_, Library>,
    category: CategoryId,
    filter: LibraryFilter,
) -> Result<u32, IpcError> {
    Ok(library.category_series_count(category, filter)?)
}

#[tauri::command]
#[specta::specta]
async fn folder_series(
    library: State<'_, Library>,
    folder: FolderId,
    after: Option<SeriesCursor>,
    listing: LibraryListing,
) -> Result<SeriesPage, IpcError> {
    Ok(library.folder_series(folder, listing, after).await?)
}

#[tauri::command]
#[specta::specta]
async fn folder_series_count(
    library: State<'_, Library>,
    folder: FolderId,
    filter: LibraryFilter,
) -> Result<u32, IpcError> {
    Ok(library.folder_series_count(folder, filter).await?)
}

#[tauri::command]
#[specta::specta]
async fn library_search(
    library: State<'_, Library>,
    after: Option<SeriesCursor>,
    search: LibrarySearch,
) -> Result<SeriesPage, IpcError> {
    Ok(library.search(search, after).await?)
}

#[tauri::command]
#[specta::specta]
async fn library_search_count(
    library: State<'_, Library>,
    search: LibrarySearch,
) -> Result<u32, IpcError> {
    Ok(library.search_count(search).await?)
}

#[tauri::command]
#[specta::specta]
async fn series_overview(
    library: State<'_, Library>,
    id: SeriesId,
) -> Result<SeriesOverview, IpcError> {
    Ok(library.series_overview(id).await?)
}

#[tauri::command]
#[specta::specta]
async fn series_books(
    library: State<'_, Library>,
    id: SeriesId,
    listing: SeriesBookListing,
    after: Option<BookCursor>,
) -> Result<SeriesBookPage, IpcError> {
    Ok(library.series_books(id, listing, after).await?)
}

#[tauri::command]
#[specta::specta]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri hands command arguments over by value"
)]
fn creator_series(library: State<'_, Library>, creator: String) -> Vec<CreatorSeries> {
    library.creator_series(&creator)
}

#[tauri::command]
#[specta::specta]
#[expect(
    unused_variables,
    clippy::needless_pass_by_value,
    reason = "the library keeps no bookmarks yet, so the pages have nowhere to go"
)]
fn bookmark_pages(book: BookId, pages: Vec<u32>, is_bookmarked: bool) -> Result<(), IpcError> {
    Err(IpcError::bookmarks_not_kept())
}

#[tauri::command]
#[specta::specta]
async fn book_place(
    library: State<'_, Library>,
    book: BookId,
) -> Result<Option<BookPlace>, IpcError> {
    Ok(library.book_place(book).await?)
}

#[tauri::command]
#[specta::specta]
async fn mark_books(
    library: State<'_, Library>,
    books: Vec<BookId>,
    mark: ReadMark,
) -> Result<(), IpcError> {
    Ok(library.mark_books(books, mark).await?)
}

#[tauri::command]
#[specta::specta]
async fn mark_series_read(
    library: State<'_, Library>,
    series: Vec<SeriesId>,
) -> Result<Vec<BookId>, IpcError> {
    Ok(library.mark_series_read(series).await?)
}

#[tauri::command]
#[specta::specta]
async fn open_book(
    library: State<'_, Library>,
    router: State<'_, ResourceRouter>,
    id: BookId,
    undecodable: Vec<ProbedFormat>,
) -> Result<OpenedBook, IpcError> {
    Ok(router.open_book(&library, id, undecodable).await?)
}

#[tauri::command]
#[specta::specta]
async fn reading_restored(
    library: State<'_, Library>,
    id: BookId,
    page: u32,
    utc_offset: UtcOffset,
) -> Result<(), IpcError> {
    Ok(library.reading_restored(id, page, utc_offset).await?)
}

#[tauri::command]
#[specta::specta]
async fn page_shown(
    library: State<'_, Library>,
    id: BookId,
    page: u32,
    utc_offset: UtcOffset,
) -> Result<(), IpcError> {
    Ok(library.page_shown(id, page, utc_offset).await?)
}

#[tauri::command]
#[specta::specta]
async fn close_book(library: State<'_, Library>, id: BookId) -> Result<(), IpcError> {
    Ok(library.close_book(id).await?)
}

#[tauri::command]
#[specta::specta]
async fn reading_history(
    library: State<'_, Library>,
    after: Option<HistoryCursor>,
    of: HistoryOf,
) -> Result<HistoryPage, IpcError> {
    Ok(library.history(after, of).await?)
}

#[tauri::command]
#[specta::specta]
async fn remove_from_history(
    library: State<'_, Library>,
    book: BookId,
) -> Result<Option<HistoryMark>, IpcError> {
    Ok(library.remove_from_history(book).await?)
}

#[tauri::command]
#[specta::specta]
async fn restore_to_history(
    library: State<'_, Library>,
    book: BookId,
    mark: Option<HistoryMark>,
) -> Result<(), IpcError> {
    Ok(library.restore_to_history(book, mark).await?)
}

#[tauri::command]
#[specta::specta]
async fn clear_history(library: State<'_, Library>) -> Result<Option<HistoryMark>, IpcError> {
    Ok(library.clear_history().await?)
}

#[tauri::command]
#[specta::specta]
async fn restore_history(
    library: State<'_, Library>,
    mark: Option<HistoryMark>,
) -> Result<(), IpcError> {
    Ok(library.restore_history(mark).await?)
}

#[tauri::command]
#[specta::specta]
async fn reading_week(
    library: State<'_, Library>,
    week_start: LocalDay,
    today: LocalDay,
) -> Result<ReadingWeek, IpcError> {
    Ok(library.reading_week(week_start, today).await?)
}

#[tauri::command]
#[specta::specta]
async fn reading_time_between(
    library: State<'_, Library>,
    first_day: LocalDay,
    last_day: LocalDay,
) -> Result<u32, IpcError> {
    Ok(library.reading_time_between(first_day, last_day).await?)
}

#[tauri::command]
#[specta::specta]
async fn book_sessions(
    library: State<'_, Library>,
    id: BookId,
) -> Result<Option<BookSessions>, IpcError> {
    Ok(library.book_sessions(id).await?)
}

#[tauri::command]
#[specta::specta]
async fn history_series(library: State<'_, Library>) -> Result<Vec<HistorySeries>, IpcError> {
    Ok(library.history_series().await?)
}

#[tauri::command]
#[specta::specta]
async fn book_read_time(library: State<'_, Library>, id: BookId) -> Result<u32, IpcError> {
    Ok(library.book_read_time(id).await?)
}

#[tauri::command]
#[specta::specta]
async fn reading_summary(
    library: State<'_, Library>,
    id: BookId,
) -> Result<Option<ReadingSummary>, IpcError> {
    Ok(library.reading_summary(id).await?)
}

#[tauri::command]
#[specta::specta]
async fn orient_screen(app: AppHandle, orientation: ScreenOrientation) -> Result<(), IpcError> {
    screen_orientation::orient(&app, orientation).await
}

#[tauri::command(async)]
#[specta::specta]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri hands command arguments over by value"
)]
fn change_full_screen(window: WebviewWindow, change: FullScreenChange) -> Result<bool, IpcError> {
    full_screen::change(&window, change)
}

#[tauri::command]
#[specta::specta]
async fn library_listing(library: State<'_, Library>) -> Result<LibraryListing, IpcError> {
    Ok(library.listing().await?)
}

#[tauri::command]
#[specta::specta]
async fn set_library_listing(
    library: State<'_, Library>,
    listing: LibraryListing,
) -> Result<(), IpcError> {
    Ok(library.set_listing(listing).await?)
}

#[tauri::command]
#[specta::specta]
async fn library_view(library: State<'_, Library>) -> Result<LibraryView, IpcError> {
    Ok(library.view().await?)
}

#[tauri::command]
#[specta::specta]
async fn set_library_view(library: State<'_, Library>, view: LibraryView) -> Result<(), IpcError> {
    Ok(library.set_view(view).await?)
}

#[tauri::command]
#[specta::specta]
async fn library_adult_content(library: State<'_, Library>) -> Result<AdultContent, IpcError> {
    Ok(library.adult_content().await?)
}

#[tauri::command]
#[specta::specta]
async fn set_library_adult_content(
    library: State<'_, Library>,
    content: AdultContent,
) -> Result<(), IpcError> {
    Ok(library.set_adult_content(content).await?)
}

#[tauri::command]
#[specta::specta]
async fn library_spelling_suggestion(
    library: State<'_, Library>,
    text: String,
) -> Result<Option<SpellingSuggestion>, IpcError> {
    Ok(library.spelling_suggestion(text).await?)
}

#[tauri::command]
#[specta::specta]
async fn library_tabs(library: State<'_, Library>) -> Result<Vec<LibraryTab>, IpcError> {
    Ok(library.tabs().await?)
}

#[tauri::command]
#[specta::specta]
async fn set_library_tabs(
    library: State<'_, Library>,
    tabs: Vec<LibraryTab>,
) -> Result<(), IpcError> {
    Ok(library.set_tabs(tabs).await?)
}

#[tauri::command]
#[specta::specta]
async fn remove_library_folder(library: State<'_, Library>, id: FolderId) -> Result<(), IpcError> {
    Ok(library.remove_folder(id).await?)
}

#[tauri::command]
#[specta::specta]
async fn library_folder_book_count(
    library: State<'_, Library>,
    id: FolderId,
) -> Result<u32, IpcError> {
    Ok(library.folder_book_count(id).await?)
}

#[tauri::command]
#[specta::specta]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri hands command arguments over by value"
)]
fn found_library(library: State<'_, Library>) -> Option<FoundLibrary> {
    library.found_library()
}

#[tauri::command]
#[specta::specta]
async fn choose_home_folder(
    window: Window,
    app: AppHandle,
) -> Result<Option<HomeChoice>, IpcError> {
    let Some(setting) = home_folder::setting(&app) else {
        return Ok(None);
    };
    let picked = off_the_runtime(move || pick_folder(&window)).await?;
    let Some(RootLocator::Path(folder)) = picked else {
        return Ok(None);
    };
    let choice = setting.choose(&folder).await?;
    app.state::<ChosenHome>().remember(folder);
    Ok(Some(choice))
}

#[tauri::command]
#[specta::specta]
async fn use_found_library(app: AppHandle) -> Result<(), IpcError> {
    let (setting, chosen) = home_folder::chosen(&app)?;
    setting.use_library_in(&chosen).await?;
    app.request_restart();
    Ok(())
}

#[tauri::command]
#[specta::specta]
async fn first_launch_finished(library: State<'_, Library>) -> Result<bool, IpcError> {
    Ok(library.first_launch_finished().await?)
}

#[tauri::command]
#[specta::specta]
async fn copy_version_details(app: AppHandle) -> Result<(), IpcError> {
    tauri::async_runtime::spawn_blocking(move || copy_details(&app))
        .await
        .map_err(|error| IpcError::internal(&error))?
}

fn copy_details(app: &AppHandle) -> Result<(), IpcError> {
    let details = version_details::current(app.state::<Core>().app_info().clone());
    app.clipboard()
        .write_text(details.to_string())
        .map_err(|error| IpcError::clipboard_unavailable(&error))
}

#[tauri::command]
#[specta::specta]
async fn finish_first_launch(library: State<'_, Library>) -> Result<(), IpcError> {
    Ok(library.finish_first_launch().await?)
}

#[tauri::command]
#[specta::specta]
async fn set_app_language(
    library: State<'_, Library>,
    language: AppLanguage,
) -> Result<(), IpcError> {
    Ok(library.set_language(language).await?)
}

#[tauri::command]
#[specta::specta]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri hands command arguments over by value"
)]
fn set_scheduled_rescans(
    #[cfg_attr(
        mobile,
        expect(unused_variables, reason = "only the desktop watches folders")
    )]
    app: AppHandle,
    library: State<'_, Library>,
    is_on: bool,
) {
    library.set_scheduled_rescans(is_on);
    #[cfg(desktop)]
    if let Some(watching) = app.try_state::<crate::folder_watch::FolderWatching>() {
        watching.turn(is_on);
    }
}

#[tauri::command]
#[specta::specta]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri hands command arguments over by value"
)]
fn set_book_open(library: State<'_, Library>, is_open: bool) {
    library.set_book_open(is_open);
}

#[tauri::command]
#[specta::specta]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri hands command arguments over by value"
)]
fn set_learns_reading_speed(library: State<'_, Library>, is_on: bool) {
    library.set_learns_reading_speed(is_on);
}

#[tauri::command]
#[specta::specta]
async fn open_project_link(app: AppHandle, link: ProjectLink) -> Result<(), IpcError> {
    app.opener()
        .open_url(link.url(), None::<&str>)
        .map_err(|error| IpcError::browser_unavailable(&error))
}

#[tauri::command]
#[specta::specta]
async fn problem_report(app: AppHandle) -> Result<ProblemReportPreview, IpcError> {
    let report = problem_reporting::gather(&app).await?;
    Ok(app.state::<ShownProblemReport>().show(report))
}

#[tauri::command]
#[specta::specta]
async fn copy_problem_report(app: AppHandle) -> Result<(), IpcError> {
    let report = problem_reporting::shown_or_gathered(&app).await?;
    off_the_runtime(move || {
        app.clipboard()
            .write_text(report.to_string())
            .map_err(|error| IpcError::clipboard_unavailable(&error))
    })
    .await
}

#[tauri::command]
#[specta::specta]
#[expect(
    unused_variables,
    clippy::needless_pass_by_value,
    reason = "problem reports have nowhere to be sent yet, so the address for a reply has nowhere to go"
)]
fn send_problem_report(reply_to: Option<String>) -> Result<(), IpcError> {
    Err(IpcError::reports_not_sent())
}

#[tauri::command]
#[specta::specta]
async fn copy_problem_report_code(app: AppHandle, code: ReportCode) -> Result<(), IpcError> {
    off_the_runtime(move || {
        app.clipboard()
            .write_text(code.to_string())
            .map_err(|error| IpcError::clipboard_unavailable(&error))
    })
    .await
}

#[tauri::command]
#[specta::specta]
async fn save_problem_report(
    app: AppHandle,
    today: LocalDay,
) -> Result<SavedProblemReport, IpcError> {
    let report = problem_reporting::shown_or_gathered(&app).await?;
    off_the_runtime(move || problem_reporting::save(&app, &report, today)).await
}

#[tauri::command]
#[specta::specta]
async fn show_saved_problem_report(app: AppHandle) -> Result<(), IpcError> {
    let saved = app.state::<ShownProblemReport>().last_saved()?;
    app.opener()
        .reveal_item_in_dir(saved)
        .map_err(|error| IpcError::file_manager_unavailable(&error))
}

#[tauri::command]
#[specta::specta]
async fn open_problem_report_issue(app: AppHandle) -> Result<(), IpcError> {
    let report = problem_reporting::shown_or_gathered(&app).await?;
    app.opener()
        .open_url(report.new_issue_url(), None::<&str>)
        .map_err(|error| IpcError::browser_unavailable(&error))
}

#[tauri::command]
#[specta::specta]
#[expect(
    clippy::needless_pass_by_value,
    reason = "Tauri hands command arguments over by value"
)]
#[cfg_attr(
    mobile,
    expect(
        clippy::unnecessary_wraps,
        reason = "only the desktop's tray can fail to show"
    )
)]
fn show_tray_menu(
    #[cfg_attr(
        mobile,
        expect(unused_variables, reason = "only the desktop has a tray")
    )]
    app: AppHandle,
    #[cfg_attr(
        mobile,
        expect(unused_variables, reason = "only the desktop has a tray")
    )]
    menu: TrayMenu,
) -> Result<(), IpcError> {
    #[cfg(desktop)]
    crate::tray::show(&app, &menu).map_err(|error| {
        tracing::warn!(%error, "show the tray menu");
        IpcError::internal(&error)
    })?;
    Ok(())
}

#[tauri::command]
#[specta::specta]
async fn show_icon_actions(app: AppHandle, menu: IconActionsMenu) -> Result<(), IpcError> {
    icon_actions::show(&app, &menu).await
}

#[tauri::command]
#[specta::specta]
async fn watch_icon_actions(
    app: AppHandle,
    on_chosen: Channel<IconAction>,
) -> Result<(), IpcError> {
    icon_actions::watch(&app, on_chosen).await
}

#[tauri::command]
#[specta::specta]
async fn open_system_settings(app: AppHandle) -> Result<(), IpcError> {
    system_settings::open(&app).map_err(|error| IpcError::system_settings_unavailable(&error))
}

#[tauri::command]
#[specta::specta]
async fn show_series_in_folder(
    app: AppHandle,
    library: State<'_, Library>,
    series: SeriesId,
) -> Result<(), IpcError> {
    let Some(file) = library.series_file(series).await? else {
        return Err(LibraryError::SeriesNotFound { id: series }.into());
    };
    app.opener()
        .reveal_item_in_dir(file)
        .map_err(|error| IpcError::file_manager_unavailable(&error))
}

#[tauri::command]
#[specta::specta]
async fn offer_saved_crash_report(app: AppHandle) -> Result<Option<CrashReportOffer>, IpcError> {
    off_the_runtime(move || app.state::<CrashReporting>().offer_saved()).await
}

#[tauri::command]
#[specta::specta]
async fn offer_interface_error_report(
    app: AppHandle,
    error: InterfaceError,
) -> Result<CrashReportOffer, IpcError> {
    off_the_runtime(move || Ok(app.state::<CrashReporting>().offer_interface_error(&error))).await
}

#[tauri::command]
#[specta::specta]
async fn send_crash_report(app: AppHandle) -> Result<(), IpcError> {
    off_the_runtime(move || {
        let reporting = app.state::<CrashReporting>();
        let report = reporting.offered()?;
        app.opener()
            .open_url(report.new_issue_url(), None::<&str>)
            .map_err(|error| IpcError::browser_unavailable(&error))?;
        reporting.settle_sent();
        Ok(())
    })
    .await
}

#[tauri::command]
#[specta::specta]
async fn copy_crash_report(app: AppHandle) -> Result<(), IpcError> {
    off_the_runtime(move || {
        let report = app.state::<CrashReporting>().offered()?;
        app.clipboard()
            .write_text(report.to_string())
            .map_err(|error| IpcError::clipboard_unavailable(&error))
    })
    .await
}

#[tauri::command]
#[specta::specta]
async fn decline_crash_report(app: AppHandle) -> Result<(), IpcError> {
    off_the_runtime(move || app.state::<CrashReporting>().settle()).await
}

#[cfg(debug_assertions)]
#[tauri::command]
#[specta::specta]
async fn panic_in_core() -> Result<(), IpcError> {
    off_the_runtime(|| developer_crashes::panic_in_core(BuildProfile::CURRENT)).await
}

#[cfg(debug_assertions)]
#[tauri::command]
#[specta::specta]
async fn crash_and_quit() -> Result<(), IpcError> {
    off_the_runtime(|| {
        developer_crashes::crash_and_quit(BuildProfile::CURRENT).map(|quit| match quit {})
    })
    .await
}

#[tauri::command]
#[specta::specta]
async fn check_storage(
    resources: State<'_, ResourceRouter>,
    places: State<'_, StoragePlaces>,
) -> Result<StorageUse, IpcError> {
    places
        .use_after_making_room(&resources)
        .await
        .map_err(|error| IpcError::internal(&error))
}

#[tauri::command]
#[specta::specta]
async fn clear_cached_pages(resources: State<'_, ResourceRouter>) -> Result<(), IpcError> {
    resources.clear_cached_pages().await;
    Ok(())
}

#[tauri::command]
#[specta::specta]
async fn clear_covers(resources: State<'_, ResourceRouter>) -> Result<(), IpcError> {
    resources.clear_covers().await;
    Ok(())
}

async fn off_the_runtime<T: Send + 'static>(
    work: impl FnOnce() -> Result<T, IpcError> + Send + 'static,
) -> Result<T, IpcError> {
    tauri::async_runtime::spawn_blocking(work)
        .await
        .map_err(|error| IpcError::internal(&error))?
}

#[cfg(test)]
mod tests {
    use std::{env, fs, process};

    use specta_typescript::Typescript;

    use super::builder;

    const COMMITTED_BINDINGS: &str =
        concat!(env!("CARGO_MANIFEST_DIR"), "/../src/lib/ipc/bindings.ts");
    const UPDATE_REQUEST: &str = "UPDATE_BINDINGS";

    fn generated_bindings() -> String {
        let path = env::temp_dir().join(format!("omnileaf-bindings-{}.ts", process::id()));
        builder().export(Typescript::default(), &path).unwrap();
        let bindings = fs::read_to_string(&path).unwrap();
        fs::remove_file(&path).unwrap();
        bindings
    }

    #[test]
    fn committed_bindings_match_the_commands() {
        let generated = generated_bindings();

        if env::var_os(UPDATE_REQUEST).is_some() {
            fs::write(COMMITTED_BINDINGS, &generated).unwrap();
        }
        let committed = fs::read_to_string(COMMITTED_BINDINGS).unwrap_or_default();

        assert!(
            committed == generated,
            "the TypeScript bindings are out of date; run `cargo xtask bindings`"
        );
    }
}
