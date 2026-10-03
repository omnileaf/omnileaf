use std::{
    io,
    num::NonZeroUsize,
    panic::{self, AssertUnwindSafe},
    sync::{Arc, Condvar, Mutex, MutexGuard, PoisonError},
    thread::{self, JoinHandle},
};

use tokio::sync::oneshot;

type Job = Box<dyn FnOnce() + Send>;

/// Runs blocking work on its own threads, newest job first, so what was asked for last, such as the covers now on screen, comes first.
pub(crate) struct BackgroundLane {
    shared: Arc<Shared>,
    workers: Vec<JoinHandle<()>>,
}

#[derive(Default)]
struct Shared {
    queue: Mutex<Queue>,
    job_added: Condvar,
}

#[derive(Default)]
struct Queue {
    jobs: Vec<Job>,
    is_closing: bool,
}

/// The lane stopped before the job ran, because the app is closing.
#[derive(Debug, thiserror::Error)]
#[error("run a job on a lane that has stopped")]
pub(crate) struct LaneStopped;

impl BackgroundLane {
    pub(crate) fn start(name: &str, workers: NonZeroUsize) -> io::Result<Self> {
        let shared = Arc::new(Shared::default());
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

    /// Queues the job at once and resolves to its result, never running it if the caller stops waiting before its turn.
    pub(crate) fn run<T, F>(
        &self,
        job: F,
    ) -> impl Future<Output = Result<T, LaneStopped>> + use<T, F>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        let (sender, receiver) = oneshot::channel::<T>();
        self.shared.push(Box::new(move || {
            if sender.is_closed() {
                return;
            }
            if sender.send(job()).is_err() {
                tracing::trace!("the caller stopped waiting while its job ran");
            }
        }));
        async move { receiver.await.map_err(|_| LaneStopped) }
    }
}

impl Drop for BackgroundLane {
    /// Lets each worker finish the job in hand and drops the rest unrun, so their callers hear the lane stopped.
    fn drop(&mut self) {
        self.shared.queue().is_closing = true;
        self.shared.job_added.notify_all();
        for worker in self.workers.drain(..) {
            if worker.join().is_err() {
                tracing::error!("a background worker stopped by panicking");
            }
        }
    }
}

impl Shared {
    fn queue(&self) -> MutexGuard<'_, Queue> {
        self.queue.lock().unwrap_or_else(PoisonError::into_inner)
    }

    fn push(&self, job: Job) {
        self.queue().jobs.push(job);
        self.job_added.notify_one();
    }

    /// The newest job, or nothing once the lane is closing.
    fn next_job(&self) -> Option<Job> {
        let mut queue = self.queue();
        loop {
            if queue.is_closing {
                return None;
            }
            if let Some(job) = queue.jobs.pop() {
                return Some(job);
            }
            queue = self
                .job_added
                .wait(queue)
                .unwrap_or_else(PoisonError::into_inner);
        }
    }

    fn work(&self) {
        while let Some(job) = self.next_job() {
            if panic::catch_unwind(AssertUnwindSafe(job)).is_err() {
                tracing::error!("a background job panicked");
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use std::{sync::mpsc, time::Duration};

    use super::*;

    const ONE_WORKER: NonZeroUsize = NonZeroUsize::MIN;
    const WAIT: Duration = Duration::from_secs(10);

    /// Occupies the lane's only worker until the returned sender is dropped.
    fn occupy(
        lane: &BackgroundLane,
    ) -> (
        mpsc::Sender<()>,
        impl Future<Output = Result<(), LaneStopped>> + use<>,
    ) {
        let (release, released) = mpsc::channel::<()>();
        let (started, has_started) = mpsc::channel();
        let occupied = lane.run(move || {
            started.send(()).unwrap();
            let _ = released.recv();
        });
        has_started.recv_timeout(WAIT).unwrap();
        (release, occupied)
    }

    #[tokio::test]
    async fn runs_the_newest_job_first() {
        let lane = BackgroundLane::start("lane-order", ONE_WORKER).unwrap();
        let (release, _occupied) = occupy(&lane);
        let ran = Arc::new(Mutex::new(Vec::new()));
        let queued: Vec<_> = ["first", "second", "third"]
            .into_iter()
            .map(|name| {
                let ran = Arc::clone(&ran);
                lane.run(move || ran.lock().unwrap().push(name))
            })
            .collect();

        drop(release);

        for job in queued {
            job.await.unwrap();
        }
        assert_eq!(*ran.lock().unwrap(), ["third", "second", "first"]);
    }

    #[tokio::test]
    async fn skips_a_job_nobody_waits_for_any_more() {
        let lane = BackgroundLane::start("lane-skip", ONE_WORKER).unwrap();
        let (release, _occupied) = occupy(&lane);
        let ran = Arc::new(Mutex::new(Vec::new()));
        let kept = {
            let ran = Arc::clone(&ran);
            lane.run(move || ran.lock().unwrap().push("kept"))
        };
        let abandoned = {
            let ran = Arc::clone(&ran);
            lane.run(move || ran.lock().unwrap().push("abandoned"))
        };

        drop(abandoned);
        drop(release);

        kept.await.unwrap();
        assert_eq!(*ran.lock().unwrap(), ["kept"]);
    }

    #[tokio::test]
    async fn hands_back_what_the_job_returns() {
        let lane = BackgroundLane::start("lane-result", ONE_WORKER).unwrap();

        let answer = lane.run(|| 6 * 7).await;

        assert_eq!(answer.unwrap(), 42);
    }
}
