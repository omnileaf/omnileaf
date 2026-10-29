#![expect(
    clippy::unwrap_used,
    reason = "the fake disposal only locks its own lists, so a poisoned lock means a test already failed"
)]

use std::{
    collections::BTreeMap,
    ffi::OsString,
    fs,
    future::ready,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
};

use omnileaf_engine::{Disposal, DisposalFailure, FileDisposal};
use tokio::sync::Notify;

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
    pause: Mutex<Option<Pause>>,
}

impl FakeDisposal {
    pub(crate) fn replying(self, name: &str, reply: Reply) -> Self {
        self.replies.lock().unwrap().insert(name.into(), reply);
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
