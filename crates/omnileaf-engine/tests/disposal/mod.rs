#![expect(
    clippy::unwrap_used,
    reason = "the fakes only lock their own lists and the vanishing one removes a file its test just wrote, so a panic here means the test is broken"
)]

use std::{
    collections::{BTreeMap, BTreeSet},
    ffi::OsString,
    fs,
    future::ready,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    time::Duration,
};

use omnileaf_engine::{Disposal, DisposalFailure, FileDisposal};
use tokio::{sync::Notify, time::sleep};

const HANGS_FOR: Duration = Duration::from_secs(3_600);

type Reply = Result<Disposal, DisposalFailure>;

#[derive(Clone, Default)]
pub(crate) struct Pause {
    pub(crate) entered: Arc<Notify>,
    pub(crate) release: Arc<Notify>,
}

#[derive(Default)]
pub(crate) struct FakeDisposal {
    replies: Mutex<BTreeMap<OsString, Reply>>,
    calls: Mutex<Vec<PathBuf>>,
    hanging: Mutex<BTreeSet<OsString>>,
    pause: Mutex<Option<Pause>>,
}

impl FakeDisposal {
    pub(crate) fn replying(self, name: &str, reply: Reply) -> Self {
        self.replies.lock().unwrap().insert(name.into(), reply);
        self
    }

    pub(crate) fn hanging_on(self, name: &str) -> Self {
        self.hanging.lock().unwrap().insert(name.into());
        self
    }

    pub(crate) fn pausing_on_the_first_file(self, pause: &Pause) -> Self {
        *self.pause.lock().unwrap() = Some(pause.clone());
        self
    }

    pub(crate) fn calls(&self) -> Vec<PathBuf> {
        let mut calls = self.calls.lock().unwrap().clone();
        calls.sort();
        calls
    }
}

impl FileDisposal for FakeDisposal {
    async fn dispose(&self, file: &Path) -> Reply {
        self.calls.lock().unwrap().push(file.to_path_buf());
        let hangs = file
            .file_name()
            .is_some_and(|name| self.hanging.lock().unwrap().contains(name));
        if hangs {
            sleep(HANGS_FOR).await;
        }
        let pause = self.pause.lock().unwrap().take();
        if let Some(pause) = pause {
            pause.entered.notify_one();
            pause.release.notified().await;
        }
        let reply = file
            .file_name()
            .and_then(|name| self.replies.lock().unwrap().get(name).copied());
        reply.unwrap_or(Ok(Disposal::Trashed))
    }
}

pub(crate) struct DiskDisposal;

impl FileDisposal for DiskDisposal {
    fn dispose(&self, file: &Path) -> impl Future<Output = Reply> + Send {
        ready(
            fs::remove_file(file)
                .map(|()| Disposal::Deleted)
                .map_err(|error| DisposalFailure::from(error.kind())),
        )
    }
}

pub(crate) struct VanishingDisposal;

impl FileDisposal for VanishingDisposal {
    fn dispose(&self, file: &Path) -> impl Future<Output = Reply> + Send {
        fs::remove_file(file).unwrap();
        ready(Err(DisposalFailure::NotFound))
    }
}
