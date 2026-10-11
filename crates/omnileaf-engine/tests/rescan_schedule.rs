#![expect(
    clippy::unwrap_used,
    reason = "each test rescans its own generated folder in a scratch library, so a failed set-up should stop the test"
)]

#[expect(dead_code, reason = "these tests write whole books, never loose pages")]
mod books;
#[expect(
    dead_code,
    reason = "these tests move a clock of their own rather than read the fixed one"
)]
mod support;

use std::{
    fs,
    future::{pending, ready},
    path::Path,
    sync::{
        Arc,
        atomic::{AtomicBool, AtomicU64, Ordering},
        mpsc,
    },
    time::Duration,
};

use books::write_book;
use omnileaf_engine::{
    Clock, EXTERNAL_RESCAN_EVERY, FileChanges, FolderId, FolderRescan, Library, PowerMode,
    RESCAN_EVERY, RescanConditions, RescanOutcome, Storage,
};
use support::{NOW_UNIX_MS, ScratchFolder};
use tokio::{
    sync::{mpsc::unbounded_channel, oneshot},
    time::timeout,
};

const SERIES: &str = "Sample Series 01";
const JUST_BEFORE: Duration = Duration::from_millis(1);
const SEVERAL_CHECKS: Duration = Duration::from_mins(10);

/// A clock that stands still until a test moves it on.
#[derive(Clone)]
struct SteppedClock(Arc<AtomicU64>);

impl SteppedClock {
    fn new() -> Self {
        Self(Arc::new(AtomicU64::new(NOW_UNIX_MS)))
    }

    fn advance(&self, by: Duration) {
        let by_ms = u64::try_from(by.as_millis()).unwrap();
        self.0.fetch_add(by_ms, Ordering::SeqCst);
    }
}

impl Clock for SteppedClock {
    fn now_unix_ms(&self) -> u64 {
        self.0.load(Ordering::SeqCst)
    }
}

/// A device whose every folder is on one kind of storage, or whose storage never answers, saving power while a test says so.
struct Device {
    storage: Option<Storage>,
    is_saving_power: AtomicBool,
}

impl Device {
    fn on(storage: Storage) -> Self {
        Self::answering(Some(storage))
    }

    fn answering(storage: Option<Storage>) -> Self {
        Self {
            storage,
            is_saving_power: AtomicBool::new(false),
        }
    }
}

impl RescanConditions for Device {
    async fn storage_of(&self, _folder: &Path) -> Storage {
        match self.storage {
            Some(storage) => storage,
            None => pending().await,
        }
    }

    fn power_mode(&self) -> impl Future<Output = PowerMode> + Send {
        ready(if self.is_saving_power.load(Ordering::SeqCst) {
            PowerMode::Saving
        } else {
            PowerMode::Normal
        })
    }
}

/// A library linked to one folder of one book, with scheduled rescans on and a schedule that has already seen both its folders.
struct Running {
    library: Library,
    device: Device,
    clock: SteppedClock,
    comics: ScratchFolder,
    linked: FolderId,
    _home: ScratchFolder,
}

impl Running {
    async fn new(name: &str) -> Self {
        Self::on(name, Device::on(Storage::Local)).await
    }

    async fn on(name: &str, device: Device) -> Self {
        let comics = ScratchFolder::new(name);
        write_book(&comics.path().join(SERIES).join("v01.cbz"), 1);
        let home = ScratchFolder::new(&format!("{name}-home"));
        let clock = SteppedClock::new();
        let library = Library::open(home.path().to_path_buf(), clock.clone())
            .await
            .unwrap();
        library
            .add_folder(comics.path().to_path_buf(), |_| {})
            .await
            .unwrap();
        let linked = library
            .folders(None)
            .await
            .unwrap()
            .folders
            .last()
            .unwrap()
            .id;
        library.set_scheduled_rescans(true);
        let first_check = library.rescan_due_folders(&device, async {}).await.unwrap();
        assert_eq!(first_check, []);
        Self {
            library,
            device,
            clock,
            comics,
            linked,
            _home: home,
        }
    }

    async fn rescan_due(&self) -> Vec<FolderRescan> {
        self.library
            .rescan_due_folders(&self.device, async {})
            .await
            .unwrap()
    }

    /// Returns once the scheduled check under way lets go of the library, by rescanning a folder by hand, which leaves the schedule as it was.
    async fn wait_for_the_check_under_way(&self) {
        self.library
            .rescan_folder(self.linked, |_| {})
            .await
            .unwrap();
    }

    fn outcome_of_linked(&self, rescans: &[FolderRescan]) -> Option<RescanOutcome> {
        rescans
            .iter()
            .find(|rescan| rescan.id == self.linked)
            .map(|rescan| rescan.outcome.clone())
    }
}

#[tokio::test]
async fn rescans_no_folder_before_its_turn() {
    let running = Running::new("schedule-early").await;
    running
        .clock
        .advance(RESCAN_EVERY.saturating_sub(JUST_BEFORE));

    let rescans = running.rescan_due().await;

    assert_eq!(rescans, []);
}

#[tokio::test]
async fn rescans_every_folder_once_its_turn_comes_and_finds_the_books_added_meanwhile() {
    let running = Running::new("schedule-due").await;
    write_book(&running.comics.path().join(SERIES).join("v02.cbz"), 2);
    running.clock.advance(RESCAN_EVERY);

    let rescans = running.rescan_due().await;

    assert_eq!(rescans.len(), 2);
    assert_eq!(
        running.outcome_of_linked(&rescans),
        Some(RescanOutcome::Rescanned(FileChanges {
            added: 1,
            ..FileChanges::default()
        }))
    );
}

#[tokio::test]
async fn keeps_to_the_schedule_when_a_folder_is_rescanned_by_hand() {
    let running = Running::new("schedule-by-hand").await;
    running
        .clock
        .advance(RESCAN_EVERY.saturating_sub(JUST_BEFORE));
    running
        .library
        .rescan_folder(running.linked, |_| {})
        .await
        .unwrap();
    running.clock.advance(JUST_BEFORE);

    let rescans = running.rescan_due().await;

    assert_eq!(
        running.outcome_of_linked(&rescans),
        Some(RescanOutcome::Rescanned(FileChanges::default()))
    );
}

#[tokio::test]
async fn prepares_for_rescanning_only_once_a_folder_has_its_turn() {
    let running = Running::new("schedule-prepare").await;
    let prepared = AtomicU64::new(0);
    let prepare = || async {
        prepared.fetch_add(1, Ordering::SeqCst);
    };
    running
        .library
        .rescan_due_folders(&running.device, prepare())
        .await
        .unwrap();
    let before_the_turn = prepared.load(Ordering::SeqCst);
    running.clock.advance(RESCAN_EVERY);

    running
        .library
        .rescan_due_folders(&running.device, prepare())
        .await
        .unwrap();

    assert_eq!(before_the_turn, 0);
    assert_eq!(prepared.load(Ordering::SeqCst), 1);
}

#[tokio::test]
async fn waits_the_longer_turn_for_folders_on_external_storage() {
    let running = Running::on("schedule-external", Device::on(Storage::External)).await;
    running.clock.advance(RESCAN_EVERY);
    let at_the_usual_turn = running.rescan_due().await;
    running
        .clock
        .advance(EXTERNAL_RESCAN_EVERY.saturating_sub(RESCAN_EVERY));

    let at_the_longer_turn = running.rescan_due().await;

    assert_eq!(at_the_usual_turn, []);
    assert_eq!(at_the_longer_turn.len(), 2);
}

#[tokio::test]
async fn rescans_no_folder_while_the_device_saves_power_and_catches_up_after() {
    let running = Running::new("schedule-saving-power").await;
    running.clock.advance(RESCAN_EVERY);
    running.device.is_saving_power.store(true, Ordering::SeqCst);
    let while_saving = running.rescan_due().await;
    running
        .device
        .is_saving_power
        .store(false, Ordering::SeqCst);

    let after = running.rescan_due().await;

    assert_eq!(while_saving, []);
    assert_eq!(after.len(), 2);
}

#[tokio::test(start_paused = true)]
async fn counts_a_folder_whose_storage_gives_no_answer_as_local() {
    let running = Running::on("schedule-no-answer", Device::answering(None)).await;
    running.clock.advance(RESCAN_EVERY);

    let rescans = running.rescan_due().await;

    assert_eq!(rescans.len(), 2);
}

#[tokio::test]
async fn waits_twice_as_long_for_a_folder_it_cannot_read() {
    let running = Running::new("schedule-unreadable").await;
    let unplugged = running.comics.path().with_extension("unplugged");
    fs::rename(running.comics.path(), &unplugged).unwrap();
    running.clock.advance(RESCAN_EVERY);
    let missed = running.outcome_of_linked(&running.rescan_due().await);
    running.clock.advance(RESCAN_EVERY);
    let skipped = running.outcome_of_linked(&running.rescan_due().await);
    running.clock.advance(RESCAN_EVERY);

    let retried = running.outcome_of_linked(&running.rescan_due().await);

    fs::rename(&unplugged, running.comics.path()).unwrap();
    assert_eq!(missed, Some(RescanOutcome::Unreachable));
    assert_eq!(skipped, None);
    assert_eq!(retried, Some(RescanOutcome::Unreachable));
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn leaves_the_folders_for_a_later_turn_while_another_scan_runs() {
    let running = Arc::new(Running::new("schedule-busy").await);
    let added = ScratchFolder::new("schedule-busy-added");
    write_book(&added.path().join(SERIES).join("v01.cbz"), 3);
    running.clock.advance(RESCAN_EVERY);
    let (started, has_started) = oneshot::channel();
    let (release, released) = mpsc::channel::<()>();
    let scanning = {
        let running = Arc::clone(&running);
        let folder = added.path().to_path_buf();
        let mut started = Some(started);
        tokio::spawn(async move {
            running
                .library
                .add_folder(folder, move |_| {
                    if let Some(started) = started.take() {
                        started.send(()).unwrap();
                        let _ = released.recv();
                    }
                })
                .await
                .unwrap();
        })
    };
    has_started.await.unwrap();

    let while_scanning = running.rescan_due().await;
    drop(release);
    scanning.await.unwrap();
    let after = running.rescan_due().await;

    assert_eq!(while_scanning, []);
    assert_eq!(after.len(), 2);
}

/// Runs the schedule of `running` in the background, sending on `prepared` each time a folder's turn comes.
fn spawn_schedule(
    running: &Arc<Running>,
    prepared: tokio::sync::mpsc::UnboundedSender<()>,
) -> tokio::task::JoinHandle<()> {
    let running = Arc::clone(running);
    tokio::spawn(async move {
        running
            .library
            .rescan_on_schedule(&running.device, move || {
                let _ = prepared.send(());
                async {}
            })
            .await;
    })
}

#[tokio::test(start_paused = true)]
async fn checks_no_folder_until_scheduled_rescans_are_turned_on() {
    let running = Arc::new(Running::new("schedule-switched-on").await);
    running.library.set_scheduled_rescans(false);
    running.clock.advance(RESCAN_EVERY);
    let (prepared, mut preparations) = unbounded_channel();
    let schedule = spawn_schedule(&running, prepared);
    let while_off = timeout(SEVERAL_CHECKS, preparations.recv()).await;

    running.library.set_scheduled_rescans(true);
    let once_on = preparations.recv().await;

    schedule.abort();
    assert!(while_off.is_err());
    assert_eq!(once_on, Some(()));
}

#[tokio::test(start_paused = true)]
async fn checks_no_folder_once_scheduled_rescans_are_turned_off() {
    let running = Arc::new(Running::new("schedule-switched-off").await);
    running.clock.advance(RESCAN_EVERY);
    let (prepared, mut preparations) = unbounded_channel();
    let schedule = spawn_schedule(&running, prepared);
    preparations.recv().await;

    running.library.set_scheduled_rescans(false);
    running.wait_for_the_check_under_way().await;
    running.clock.advance(RESCAN_EVERY);
    let once_off = timeout(SEVERAL_CHECKS, preparations.recv()).await;

    schedule.abort();
    assert!(once_off.is_err());
}

#[tokio::test]
async fn rescans_no_further_folder_once_scheduled_rescans_are_turned_off() {
    let running = Running::new("schedule-off-midway").await;
    running.clock.advance(RESCAN_EVERY);

    let rescans = running
        .library
        .rescan_due_folders(&running.device, async {
            running.library.set_scheduled_rescans(false);
        })
        .await
        .unwrap();

    assert_eq!(rescans, []);
}
