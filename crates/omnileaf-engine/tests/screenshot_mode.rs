#![expect(
    clippy::unwrap_used,
    reason = "each test scans its own generated library in a scratch folder, so a failed set-up should stop the test"
)]

#[expect(
    dead_code,
    reason = "these tests write books with ComicInfo, so the other kinds of book go unused"
)]
mod books;
#[expect(
    dead_code,
    reason = "these tests step their own clock, so the fixed one goes unused"
)]
mod support;

use std::sync::{
    Arc,
    atomic::{AtomicU64, Ordering},
};

use books::write_book_with;
use omnileaf_engine::{
    AdultContent, AdultTreatment, Clock, DetailEdits, FolderId, FolderKind, HistoryOf,
    LabelChanges, Library, LibraryListing, LibrarySearch, ProbedFormat, ReadMark, ResourceRouter,
    SeriesBookListing, UtcOffset,
};
use support::{NOW_UNIX_MS, ScratchFolder};

const SHOWN: &str = "Sample Series 01";
const RATED: &str = "Sample Forbidden Tale";
const MARKED: &str = "Sample Series 03";
const OTHER: &str = "Sample Series 04";
const PLAIN_WRITER: &str = "<ComicInfo><Writer>Pat Writer</Writer><Tags>shared</Tags>
    <LanguageISO>en</LanguageISO></ComicInfo>";
const RATED_18: &str = "<ComicInfo><Writer>Pat Writer</Writer><AgeRating>R18+</AgeRating>
    <Tags>forbidden</Tags><LanguageISO>fr</LanguageISO><Manga>Yes</Manga></ComicInfo>";
const MINUTE_MS: u64 = 60_000;

#[derive(Clone)]
struct SteppedClock(Arc<AtomicU64>);

impl Clock for SteppedClock {
    fn now_unix_ms(&self) -> u64 {
        self.0.load(Ordering::Relaxed)
    }
}

#[derive(Debug, PartialEq, Eq)]
struct Seen {
    listed: Vec<String>,
    series_count: u32,
    found: Vec<String>,
    found_count: u32,
    folder_count: u32,
    group_counts: Vec<(String, u32)>,
    group_series: Vec<(String, u32, usize)>,
    writers: Vec<(String, u32)>,
    writer_series: Vec<(String, u32, usize)>,
    history: Vec<String>,
    continue_reading: Vec<String>,
    books_read: Vec<String>,
    series_read: Vec<String>,
    books_opened: u32,
    read_seconds: u32,
    read_between: u32,
    creator_series: Vec<String>,
    suggestion: Option<String>,
}

struct Scanned {
    library: Library,
    router: ResourceRouter,
    clock: SteppedClock,
    _comics: ScratchFolder,
    _home: ScratchFolder,
    _cache: ScratchFolder,
}

impl Scanned {
    async fn read_in_every_series(name: &str) -> Self {
        let comics = ScratchFolder::new(&format!("{name}-comics"));
        let series = [
            (SHOWN, PLAIN_WRITER, SHOWN.to_owned()),
            (RATED, RATED_18, format!("Hidden/{RATED}")),
            (MARKED, PLAIN_WRITER, MARKED.to_owned()),
            (OTHER, PLAIN_WRITER, format!("Imprint/{OTHER}")),
        ];
        for (seed, (_, comic_info, path)) in (1..).zip(&series) {
            let book = comics.path().join(path).join("v01.cbz");
            write_book_with(&book, seed, Some(comic_info));
        }
        let home = ScratchFolder::new(&format!("{name}-home"));
        let clock = SteppedClock(Arc::new(AtomicU64::new(NOW_UNIX_MS)));
        let library = Library::open(home.path().to_path_buf(), clock.clone())
            .await
            .unwrap();
        library
            .add_folder(comics.path().to_path_buf(), |_| {})
            .await
            .unwrap();
        let cache = ScratchFolder::new(&format!("{name}-cache"));
        let router = ResourceRouter::open(cache.path()).unwrap();
        let scanned = Self {
            library,
            router,
            clock,
            _comics: comics,
            _home: home,
            _cache: cache,
        };
        let marked = scanned.series_named(MARKED).await;
        scanned
            .library
            .edit_series_details(
                marked,
                DetailEdits {
                    title: None,
                    people: None,
                    tags: None,
                    summary: None,
                    is_marked_adult: true,
                },
            )
            .await
            .unwrap();
        for (title, _, _) in &series {
            scanned.read(title).await;
        }
        scanned
    }

    async fn linked_folder(&self) -> FolderId {
        self.library
            .folders(None)
            .await
            .unwrap()
            .folders
            .into_iter()
            .find(|folder| folder.kind == FolderKind::Linked)
            .unwrap()
            .id
    }

    async fn label_shown_rated_and_marked(&self) {
        let shown = self.series_named(SHOWN).await;
        let rated = self.series_named(RATED).await;
        let marked = self.series_named(MARKED).await;
        let changes = |tags: &[&str], category: bool| LabelChanges {
            categories_created: if category {
                vec!["Favourites".to_owned()]
            } else {
                Vec::new()
            },
            tags_added: tags.iter().map(|tag| (*tag).to_owned()).collect(),
            ..LabelChanges::default()
        };
        self.library
            .label_series(vec![shown, rated, marked], changes(&["Harbour"], true))
            .await
            .unwrap();
        self.library
            .label_series(vec![rated], changes(&["Secret"], false))
            .await
            .unwrap();
    }

    async fn series_named(&self, title: &str) -> omnileaf_engine::SeriesId {
        self.library
            .series(LibraryListing::default(), None)
            .await
            .unwrap()
            .series
            .into_iter()
            .find(|series| series.title == title)
            .unwrap()
            .id
    }

    async fn read(&self, title: &str) {
        let series = self.series_named(title).await;
        let books = self
            .library
            .series_books(series, SeriesBookListing::default(), None)
            .await
            .unwrap();
        let opened = self
            .router
            .open_book(
                &self.library,
                books.books.first().unwrap().id,
                Vec::<ProbedFormat>::new(),
            )
            .await
            .unwrap();
        self.library
            .reading_restored(opened.id, opened.start_page, UtcOffset::UTC)
            .await
            .unwrap();
        self.library
            .page_shown(opened.id, 1, UtcOffset::UTC)
            .await
            .unwrap();
        self.clock.0.fetch_add(MINUTE_MS, Ordering::Relaxed);
        self.library.close_book(opened.id).await.unwrap();
        self.library
            .mark_books(vec![opened.id], ReadMark::Unread)
            .await
            .unwrap();
        self.clock.0.fetch_add(MINUTE_MS, Ordering::Relaxed);
    }

    async fn group_reads(&self) -> (Vec<(String, u32)>, Vec<(String, u32, usize)>) {
        let filter = LibraryListing::default().filter;
        let mut group_counts = Vec::new();
        let mut group_series = Vec::new();
        for group in self.library.folder_groups(None).await.unwrap().groups {
            group_counts.push((group.folder_name.clone(), group.series_count));
            let listed = self
                .library
                .folder_group_series(group.id.clone(), LibraryListing::default(), None)
                .await
                .unwrap()
                .series
                .len();
            let counted = self
                .library
                .folder_group_series_count(group.id, filter.clone())
                .await
                .unwrap();
            group_series.push((group.folder_name, counted, listed));
        }
        (group_counts, group_series)
    }

    async fn writer_reads(&self) -> (Vec<(String, u32)>, Vec<(String, u32, usize)>) {
        let filter = LibraryListing::default().filter;
        let writers = self.library.writers(None).await.unwrap().writers;
        let mut writer_series = Vec::new();
        for writer in &writers {
            let listed = self
                .library
                .writer_series(writer.name.clone(), LibraryListing::default(), None)
                .await
                .unwrap()
                .series
                .len();
            let counted = self
                .library
                .writer_series_count(writer.name.clone(), filter.clone())
                .await
                .unwrap();
            writer_series.push((writer.name.clone(), counted, listed));
        }
        let counts = writers
            .into_iter()
            .map(|writer| (writer.name, writer.series_count))
            .collect();
        (counts, writer_series)
    }

    async fn history_titles(&self, of: HistoryOf) -> Vec<String> {
        self.library
            .history(None, of)
            .await
            .unwrap()
            .entries
            .into_iter()
            .map(|entry| entry.series_title)
            .collect()
    }

    async fn seen(&self) -> Seen {
        let library = &self.library;
        let filter = LibraryListing::default().filter;
        let folder = library
            .folders(None)
            .await
            .unwrap()
            .folders
            .into_iter()
            .find(|folder| folder.kind == FolderKind::Linked)
            .unwrap()
            .id;
        let search = LibrarySearch {
            text: "Sample".to_owned(),
            filter: filter.clone(),
        };
        let (group_counts, group_series) = self.group_reads().await;
        let (writers, writer_series) = self.writer_reads().await;
        let week = library
            .reading_week(support_day(), support_day())
            .await
            .unwrap();
        Seen {
            listed: titles(
                library
                    .series(LibraryListing::default(), None)
                    .await
                    .unwrap()
                    .series,
            ),
            series_count: library.series_count(filter.clone()).await.unwrap(),
            found: titles(library.search(search.clone(), None).await.unwrap().series),
            found_count: library.search_count(search).await.unwrap(),
            folder_count: library.folder_series_count(folder, filter).await.unwrap(),
            group_counts,
            group_series,
            writers,
            writer_series,
            history: self.history_titles(HistoryOf::Everything).await,
            continue_reading: self.history_titles(HistoryOf::Unfinished).await,
            books_read: self
                .history_titles(HistoryOf::Books {
                    matching: String::new(),
                })
                .await,
            series_read: library
                .history_series()
                .await
                .unwrap()
                .into_iter()
                .map(|series| series.title)
                .collect(),
            books_opened: week.books_opened,
            read_seconds: week.read_seconds,
            read_between: library
                .reading_time_between(support_day(), support_day())
                .await
                .unwrap(),
            creator_series: library
                .creator_series("Pat Writer".to_owned())
                .await
                .unwrap()
                .into_iter()
                .map(|series| series.title)
                .collect(),
            suggestion: library
                .spelling_suggestion("Forbiden".to_owned())
                .await
                .unwrap()
                .map(|suggestion| suggestion.text),
        }
    }
}

fn support_day() -> omnileaf_engine::LocalDay {
    omnileaf_engine::LocalDay(i64::try_from(NOW_UNIX_MS / 86_400_000).unwrap())
}

fn titles(series: Vec<omnileaf_engine::LibrarySeries>) -> Vec<String> {
    series.into_iter().map(|series| series.title).collect()
}

fn names(titles: &[&str]) -> Vec<String> {
    titles.iter().map(|title| (*title).to_owned()).collect()
}

#[tokio::test]
async fn leaves_18_plus_series_out_of_every_read_while_screenshot_mode_is_on() {
    let scanned = Scanned::read_in_every_series("screenshot-mode-hides").await;
    let before = scanned.seen().await;

    scanned.library.set_screenshot_mode(true);
    let hidden = scanned.seen().await;

    assert_eq!(before.listed, names(&[RATED, SHOWN, MARKED, OTHER]));
    assert_eq!(
        (before.history.len(), before.suggestion.as_deref()),
        (4, Some("forbidden"))
    );
    assert_eq!(hidden.listed, names(&[SHOWN, OTHER]));
    assert_eq!(hidden.found, names(&[SHOWN, OTHER]));
    assert_eq!((hidden.series_count, hidden.found_count), (2, 2));
    assert_eq!((before.folder_count, hidden.folder_count), (4, 2));
    assert_eq!(
        hidden
            .group_counts
            .iter()
            .map(|(_, count)| *count)
            .collect::<Vec<_>>(),
        [1, 1]
    );
    assert!(hidden.group_counts.iter().all(|(name, _)| name != "Hidden"));
    assert_eq!(hidden.writers, [("Pat Writer".to_owned(), 2)]);
    assert_eq!(hidden.history, names(&[OTHER, SHOWN]));
    assert_eq!(hidden.continue_reading, names(&[OTHER, SHOWN]));
    assert_eq!(hidden.books_read, names(&[OTHER, SHOWN]));
    assert_eq!(hidden.series_read, names(&[SHOWN, OTHER]));
    assert_eq!(hidden.books_opened, 2);
    assert_eq!(hidden.creator_series, names(&[SHOWN, OTHER]));
    assert_eq!(hidden.suggestion, None);
}

#[tokio::test]
async fn reads_every_series_again_once_screenshot_mode_is_off() {
    let scanned = Scanned::read_in_every_series("screenshot-mode-off").await;
    let before = scanned.seen().await;

    scanned.library.set_screenshot_mode(true);
    scanned.library.set_screenshot_mode(false);
    let after = scanned.seen().await;

    assert_eq!(after, before);
}

#[tokio::test]
async fn counts_exactly_the_series_each_hidden_list_shows() {
    let scanned = Scanned::read_in_every_series("screenshot-mode-counts").await;

    scanned.library.set_screenshot_mode(true);
    let hidden = scanned.seen().await;

    assert_eq!(hidden.series_count as usize, hidden.listed.len());
    assert_eq!(hidden.found_count as usize, hidden.found.len());
    assert!(
        hidden
            .group_series
            .iter()
            .all(|(_, counted, listed)| *counted as usize == *listed)
    );
    assert!(
        hidden
            .writer_series
            .iter()
            .all(|(_, counted, listed)| *counted as usize == *listed)
    );
    assert_eq!(
        hidden
            .group_counts
            .iter()
            .map(|(_, count)| count)
            .sum::<u32>(),
        hidden.series_count
    );
}

#[tokio::test]
async fn keeps_the_stored_adult_setting_while_screenshot_mode_is_on() {
    let scanned = Scanned::read_in_every_series("screenshot-mode-setting").await;
    let stored = AdultContent {
        treatment: AdultTreatment::Blur,
        counts_age_ratings: false,
    };
    scanned.library.set_adult_content(stored).await.unwrap();

    scanned.library.set_screenshot_mode(true);
    let setting = scanned.library.adult_content().await.unwrap();
    let hidden = scanned.seen().await;

    assert_eq!(setting, stored);
    assert_eq!(hidden.listed, names(&[RATED, SHOWN, OTHER]));
    assert_eq!(hidden.history, names(&[OTHER, RATED, SHOWN]));
}

#[tokio::test]
async fn starts_with_screenshot_mode_off() {
    let scanned = Scanned::read_in_every_series("screenshot-mode-default").await;

    let before = scanned.library.screenshot_mode();
    scanned.library.set_screenshot_mode(true);

    assert_eq!((before, scanned.library.screenshot_mode()), (false, true));
}

#[tokio::test]
async fn counts_exactly_the_series_each_label_choice_and_related_list_shows_while_screenshot_mode_is_on()
 {
    let scanned = Scanned::read_in_every_series("screenshot-mode-labels").await;
    let library = &scanned.library;
    let shown = scanned.series_named(SHOWN).await;
    scanned.label_shown_rated_and_marked().await;
    let category = library.categories().await.unwrap()[0].id.clone();
    let overview_titles = || async {
        library
            .series_overview(shown)
            .await
            .unwrap()
            .related
            .into_iter()
            .map(|series| series.title)
            .collect::<Vec<_>>()
    };
    let before = (
        library.tags().await.unwrap(),
        library.filter_choices().await.unwrap(),
        overview_titles().await,
    );

    library.set_screenshot_mode(true);
    let filter = LibraryListing::default().filter;
    let in_category = library
        .category_series(category.clone(), LibraryListing::default(), None)
        .await
        .unwrap()
        .series
        .len();
    let category_count = library
        .category_series_count(category, filter.clone())
        .await
        .unwrap();
    let tags = library.tags().await.unwrap();
    let linked = scanned.linked_folder().await;
    let folder_counts = library
        .folder_series_counts(vec![linked], filter.clone())
        .await
        .unwrap();
    let writer_counts = library
        .writer_series_counts(vec!["Pat Writer".to_owned()], filter.clone())
        .await
        .unwrap();
    let listed = library
        .series(LibraryListing::default(), None)
        .await
        .unwrap()
        .series
        .len();
    let choices = library.filter_choices().await.unwrap();
    let related = overview_titles().await;

    assert_eq!((in_category, category_count), (1, 1));
    assert_eq!(
        tags.iter()
            .map(|tag| (tag.name.as_str(), tag.series_count))
            .collect::<Vec<_>>(),
        [("Harbour", 1)]
    );
    assert_eq!(
        (folder_counts, writer_counts),
        (vec![u32::try_from(listed).unwrap()], vec![2])
    );
    assert_eq!(
        (
            choices.tags,
            choices.languages,
            choices.formats.len(),
            choices.rates_adult
        ),
        (names(&["shared"]), names(&["en"]), 1, false)
    );
    assert_eq!(related, names(&[OTHER]));
    assert_eq!(
        (
            before.0.len(),
            before.1.tags,
            before.1.languages,
            before.1.formats.len(),
            before.2.len()
        ),
        (
            2,
            names(&["forbidden", "shared"]),
            names(&["en", "fr"]),
            2,
            3
        )
    );
}
