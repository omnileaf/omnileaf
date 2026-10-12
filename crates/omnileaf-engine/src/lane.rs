use std::{
    io,
    num::NonZeroUsize,
    panic::{self, AssertUnwindSafe},
    sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError},
    thread::{self, JoinHandle},
};

use tokio::sync::oneshot;

pub(crate) type Job = Box<dyn FnOnce() + Send>;

pub(crate) trait JobQueue: Default + Send + 'static {
    fn next(&mut self) -> Option<Job>;
}

pub(crate) struct Lane<Q: JobQueue> {
    shared: Arc<Shared<Q>>,
    workers: Vec<JoinHandle<()>>,
}

struct Shared<Q> {
    state: Mutex<State<Q>>,
    job_added: Condvar,
}

struct State<Q> {
    queue: Q,
    is_closing: bool,
}

/// The lane stopped before the job ran, because the app is closing.
#[derive(Debug, thiserror::Error)]
#[error("run a job on a lane that has stopped")]
pub struct LaneStopped;

impl<Q: JobQueue> Lane<Q> {
    pub(crate) fn start(name: &str, workers: NonZeroUsize) -> io::Result<Self> {
        let shared = Arc::new(Shared {
            state: Mutex::new(State {
                queue: Q::default(),
                is_closing: false,
            }),
            job_added: Condvar::new(),
        });
        let workers = (0..workers.get())
            .map(|_| {
                let shared = Arc::clone(&shared);
                thread::Builder::new()
                    .name(name.to_owned())
                    .spawn(move || shared.work())
            })
            .collect::<io::Result<_>>()?;
        Ok(Self { shared, workers })
    }

    /// Changes what is queued, waking the workers to take it.
    pub(crate) fn queue<R>(&self, change: impl FnOnce(&mut Q) -> R) -> R {
        let changed = change(&mut self.shared.state().queue);
        self.shared.job_added.notify_all();
        changed
    }
}

impl<Q: JobQueue> Drop for Lane<Q> {
    /// Lets each worker finish the job in hand and drops the rest unrun, so their callers hear the lane stopped.
    fn drop(&mut self) {
        self.shared.state().is_closing = true;
        self.shared.job_added.notify_all();
        for worker in self.workers.drain(..) {
            if worker.join().is_err() {
                tracing::error!("a lane worker stopped by panicking");
            }
        }
    }
}

impl<Q: JobQueue> Shared<Q> {
    fn state(&self) -> MutexGuard<'_, State<Q>> {
        self.state.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn next_job(&self) -> Option<Job> {
        let mut state = self.state();
        loop {
            if state.is_closing {
                return None;
            }
            if let Some(job) = state.queue.next() {
                return Some(job);
            }
            state = self
                .job_added
                .wait(state)
                .unwrap_or_else(PoisonError::into_inner);
        }
    }

    fn work(&self) {
        while let Some(job) = self.next_job() {
            if panic::catch_unwind(AssertUnwindSafe(job)).is_err() {
                tracing::error!("a job on a lane panicked");
            }
        }
    }
}

/// A job that hands its result to the returned future, and never runs once nobody waits for it.
pub(crate) fn answered<T, F>(
    job: F,
) -> (
    Job,
    impl Future<Output = Result<T, LaneStopped>> + use<T, F>,
)
where
    T: Send + 'static,
    F: FnOnce() -> T + Send + 'static,
{
    let (sender, receiver) = oneshot::channel::<T>();
    let job: Job = Box::new(move || {
        if sender.is_closed() {
            return;
        }
        if sender.send(job()).is_err() {
            tracing::trace!("the caller stopped waiting while its job ran");
        }
    });
    (job, async move { receiver.await.map_err(|_| LaneStopped) })
}
