use std::{io, num::NonZeroUsize};

use crate::lane::{Job, JobQueue, Lane, LaneStopped, answered};

pub(crate) struct BackgroundLane(Lane<NewestFirst>);

#[derive(Default)]
pub(crate) struct NewestFirst(Vec<Job>);

impl JobQueue for NewestFirst {
    fn next(&mut self) -> Option<Job> {
        self.0.pop()
    }
}

impl BackgroundLane {
    pub(crate) fn start(name: &str, workers: NonZeroUsize) -> io::Result<Self> {
        Lane::start(name, workers).map(Self)
    }

    pub(crate) fn run<T, F>(
        &self,
        job: F,
    ) -> impl Future<Output = Result<T, LaneStopped>> + use<T, F>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        let (job, answer) = answered(job);
        self.0.queue(|queue| queue.0.push(job));
        answer
    }
}

#[cfg(test)]
mod tests {
    use std::{
        sync::{Arc, Mutex, mpsc},
        time::Duration,
    };

    use super::*;

    const ONE_WORKER: NonZeroUsize = NonZeroUsize::MIN;
    const WAIT: Duration = Duration::from_secs(10);

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
