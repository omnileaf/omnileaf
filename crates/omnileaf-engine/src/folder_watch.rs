mod bursts;
mod heard;
mod roots;
mod watched;

use std::{collections::BTreeMap, future, mem, path::PathBuf, sync::Arc, time::Duration};

use notify::{RecommendedWatcher, RecursiveMode, Watcher};
use tokio::{
    sync::watch,
    task::{JoinError, JoinHandle, spawn_blocking},
    time::{Instant, MissedTickBehavior, interval_at, sleep_until, timeout},
};

use self::{
    bursts::Bursts,
    heard::Heard,
    roots::Roots,
    watched::{Listed, Plan, WatchedFolders},
};
use crate::{FolderId, Library, LibraryError, LibraryFolders, describe_error};

const FOLDER_LIST_CHECK_EVERY: Duration = Duration::from_secs(2);
const ARMING_TIMEOUT: Duration = Duration::from_secs(5);
/// Windows ends a watch without a word once changes overflow its buffer, so each burst's watch is set up again before its rescan.
const IS_WATCH_ENDED_BY_A_BURST: bool = cfg!(windows);

#[derive(Clone, Debug)]
pub struct AppFiles {
    pub library: LibraryFolders,
    pub folders: Vec<PathBuf>,
}

#[derive(Debug)]
pub struct FolderWatchSwitch {
    is_on: watch::Sender<bool>,
}

pub struct FolderWatch<'a> {
    library: &'a Library,
    roots: Arc<Roots>,
    heard: Arc<Heard>,
    folders: WatchedFolders,
    watcher: Option<RecommendedWatcher>,
    arming: Option<Arming>,
    rearm: Vec<FolderId>,
    is_on: watch::Receiver<bool>,
    can_switch: bool,
}

struct Arming {
    planned: Vec<FolderId>,
    is_stale: bool,
    task: JoinHandle<Armed>,
}

struct Armed {
    watcher: Option<RecommendedWatcher>,
    outcomes: Vec<(FolderId, Result<(), String>)>,
}

impl FolderWatchSwitch {
    #[must_use]
    pub fn off() -> Self {
        Self {
            is_on: watch::Sender::new(false),
        }
    }

    pub fn turn(&self, is_on: bool) {
        self.is_on.send_replace(is_on);
    }
}

impl Library {
    pub async fn watch_folders(
        &self,
        app_files: &AppFiles,
        switch: &FolderWatchSwitch,
    ) -> FolderWatch<'_> {
        let mut watch = FolderWatch {
            library: self,
            roots: Arc::new(Roots::new(app_files)),
            heard: Arc::default(),
            folders: WatchedFolders::default(),
            watcher: None,
            arming: None,
            rearm: Vec::new(),
            is_on: switch.is_on.subscribe(),
            can_switch: true,
        };
        if *watch.is_on.borrow() {
            watch.follow_folders().await;
        }
        watch
    }
}

impl FolderWatch<'_> {
    pub async fn rescan_on_change(mut self) {
        let mut bursts = Bursts::default();
        let mut checks = interval_at(
            Instant::now() + FOLDER_LIST_CHECK_EVERY,
            FOLDER_LIST_CHECK_EVERY,
        );
        checks.set_missed_tick_behavior(MissedTickBehavior::Delay);
        loop {
            if !*self.is_on.borrow_and_update() {
                self.stop_watching(&mut bursts).await;
                if self.is_on.wait_for(|is_on| *is_on).await.is_err() {
                    return;
                }
                self.resume(&mut bursts).await;
            }
            self.take_in_heard(&mut bursts);
            let quiet_at = bursts.next_quiet_at();
            tokio::select! {
                biased;
                switched = self.is_on.changed(), if self.can_switch => {
                    self.can_switch = switched.is_ok();
                }
                () = self.heard.told() => {}
                _ = checks.tick() => self.follow_and_note(&mut bursts, &[]).await,
                () = sleep_until_some(quiet_at) => {
                    let quiet = bursts.take_quiet(Instant::now());
                    if IS_WATCH_ENDED_BY_A_BURST {
                        self.rearm.extend(&quiet);
                        self.follow_and_note(&mut bursts, &quiet).await;
                    }
                    for id in quiet {
                        if !*self.is_on.borrow() {
                            break;
                        }
                        self.rescan(id).await;
                    }
                }
            }
        }
    }

    async fn stop_watching(&mut self, bursts: &mut Bursts) {
        if let Some(arming) = self.arming.as_mut() {
            arming.is_stale = true;
        }
        if let Some(watcher) = self.watcher.take() {
            retire(watcher).await;
        }
        self.folders = WatchedFolders::default();
        self.roots.clear();
        self.rearm.clear();
        self.heard.take();
        *bursts = Bursts::default();
    }

    async fn resume(&mut self, bursts: &mut Bursts) {
        self.heard.take();
        self.follow_folders().await;
        let now = Instant::now();
        for id in self.folders.ids() {
            bursts.note(id, now);
        }
    }

    fn take_in_heard(&mut self, bursts: &mut Bursts) {
        let heard = self.heard.take();
        let now = Instant::now();
        for id in heard.changed {
            bursts.note(id, now);
        }
        self.rearm.extend(heard.broken);
    }

    async fn follow_and_note(&mut self, bursts: &mut Bursts, rescanning_anyway: &[FolderId]) {
        for id in self.follow_folders().await {
            if !rescanning_anyway.contains(&id) {
                bursts.note(id, Instant::now());
            }
        }
    }

    async fn follow_folders(&mut self) -> Vec<FolderId> {
        let mut armed = self.finish_arming_if_done().await;
        if self.arming.is_some() {
            return armed;
        }
        let listed = match listed_folders(self.library).await {
            Ok(listed) => listed,
            Err(error) => {
                tracing::warn!(error = %describe_error(&error), "list the library folders to watch");
                return armed;
            }
        };
        let rearm = mem::take(&mut self.rearm).into_iter().collect();
        let plan = self.folders.plan(listed, &rearm, Instant::now());
        if plan.is_empty() {
            return armed;
        }
        for (id, _) in &plan.stop {
            self.roots.remove(*id);
        }
        self.start_arming(plan);
        armed.extend(self.finish_arming_within(ARMING_TIMEOUT).await);
        armed
    }

    fn start_arming(&mut self, plan: Plan) {
        let planned = plan.arm.iter().map(|(id, _)| *id).collect();
        let watcher = self.watcher.take();
        let roots = Arc::clone(&self.roots);
        let heard = Arc::clone(&self.heard);
        self.arming = Some(Arming {
            planned,
            is_stale: false,
            task: spawn_blocking(move || arm(plan, watcher, &roots, &heard)),
        });
    }

    async fn finish_arming_if_done(&mut self) -> Vec<FolderId> {
        match self.arming.take() {
            Some(arming) if arming.task.is_finished() => {
                let armed = arming.task.await;
                self.take_armed(armed, arming.planned, arming.is_stale)
                    .await
            }
            unfinished => {
                self.arming = unfinished;
                Vec::new()
            }
        }
    }

    async fn finish_arming_within(&mut self, limit: Duration) -> Vec<FolderId> {
        let Some(arming) = self.arming.as_mut() else {
            return Vec::new();
        };
        let Ok(armed) = timeout(limit, &mut arming.task).await else {
            tracing::warn!("watch the library folders in time, leaving the watch to finish");
            return Vec::new();
        };
        let (planned, is_stale) = self
            .arming
            .take()
            .map(|arming| (arming.planned, arming.is_stale))
            .unwrap_or_default();
        self.take_armed(armed, planned, is_stale).await
    }

    async fn take_armed(
        &mut self,
        armed: Result<Armed, JoinError>,
        planned: Vec<FolderId>,
        is_stale: bool,
    ) -> Vec<FolderId> {
        let now = Instant::now();
        match armed {
            Ok(Armed { watcher, .. }) if is_stale => {
                if let Some(watcher) = watcher {
                    retire(watcher).await;
                }
                Vec::new()
            }
            Err(error) if is_stale => {
                tracing::debug!(%error, "watch the library folders while watching was turned off");
                Vec::new()
            }
            Ok(Armed { watcher, outcomes }) => {
                self.watcher = watcher;
                self.folders.record(outcomes, now)
            }
            Err(error) => {
                tracing::warn!(%error, "watch the library folders");
                self.folders.forget_watches(now);
                let failed = planned
                    .into_iter()
                    .map(|id| (id, Err(error.to_string())))
                    .collect();
                self.folders.record(failed, now)
            }
        }
    }

    async fn rescan(&self, id: FolderId) {
        match self.library.rescan_folder(id, |_| {}).await {
            Ok(_) | Err(LibraryError::FolderNotFound { .. }) => {}
            Err(error) => {
                tracing::warn!(folder = %id, error = %describe_error(&error), "rescan a folder whose files changed");
            }
        }
    }
}

/// Blocks on the file system, and on a network share for as long as it takes to answer.
fn arm(
    plan: Plan,
    watcher: Option<RecommendedWatcher>,
    roots: &Arc<Roots>,
    heard: &Arc<Heard>,
) -> Armed {
    let mut watcher = match watcher.map_or_else(|| new_watcher(roots, heard), Ok) {
        Ok(watcher) => watcher,
        Err(error) => {
            let outcomes = plan
                .arm
                .into_iter()
                .map(|(id, _)| (id, Err(error.to_string())))
                .collect();
            return Armed {
                watcher: None,
                outcomes,
            };
        }
    };
    for (id, folder) in &plan.stop {
        if let Err(error) = watcher.unwatch(folder) {
            tracing::debug!(folder = %id, %error, "stop watching a folder no longer watched");
        }
    }
    let outcomes = plan
        .arm
        .into_iter()
        .map(|(id, folder)| {
            roots.insert(id, &folder);
            if watcher.unwatch(&folder).is_ok() {
                tracing::debug!(folder = %id, "watch a folder again");
            }
            let armed = watcher
                .watch(&folder, RecursiveMode::Recursive)
                .map_err(|error| error.to_string());
            (id, armed)
        })
        .collect();
    Armed {
        watcher: Some(watcher),
        outcomes,
    }
}

/// Stops the system watch on a thread of its own, since stopping waits on the thread it reports on.
async fn retire(watcher: RecommendedWatcher) {
    match timeout(ARMING_TIMEOUT, spawn_blocking(move || drop(watcher))).await {
        Ok(Ok(())) => {}
        Ok(Err(error)) => tracing::warn!(%error, "stop watching the library folders"),
        Err(_) => tracing::warn!("stop watching the library folders in time, leaving it to stop"),
    }
}

fn new_watcher(roots: &Arc<Roots>, heard: &Arc<Heard>) -> notify::Result<RecommendedWatcher> {
    let roots = Arc::clone(roots);
    let heard = Arc::clone(heard);
    notify::recommended_watcher(move |event| heard.take_in(&roots, event))
}

async fn listed_folders(library: &Library) -> Result<BTreeMap<FolderId, Listed>, LibraryError> {
    let mut folders = BTreeMap::new();
    let mut after = None;
    loop {
        let page = library.folders(after).await?;
        folders.extend(page.folders.into_iter().map(|folder| {
            let listed = Listed {
                path: PathBuf::from(folder.location),
                is_available: folder.is_available,
            };
            (folder.id, listed)
        }));
        match page.next {
            Some(next) => after = Some(next),
            None => return Ok(folders),
        }
    }
}

async fn sleep_until_some(at: Option<Instant>) {
    match at {
        Some(at) => sleep_until(at).await,
        None => future::pending().await,
    }
}
