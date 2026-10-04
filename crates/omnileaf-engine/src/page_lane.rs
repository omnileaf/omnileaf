use std::{collections::VecDeque, io, num::NonZeroUsize};

use crate::lane::{Job, JobQueue, Lane, LaneStopped, answered};

/// Reads pages on threads of its own, a page someone waits for before any page read ahead.
pub(crate) struct PageLane(Lane<ByUrgency>);

#[derive(Default)]
pub(crate) struct ByUrgency {
    interactive: VecDeque<Job>,
    prefetch: VecDeque<Job>,
}

impl JobQueue for ByUrgency {
    fn next(&mut self) -> Option<Job> {
        self.interactive
            .pop_front()
            .or_else(|| self.prefetch.pop_front())
    }
}

impl PageLane {
    pub(crate) fn start(name: &str, workers: NonZeroUsize) -> io::Result<Self> {
        Lane::start(name, workers).map(Self)
    }

    /// Queues the job behind every other job someone waits for, never running it if the caller stops waiting before its turn.
    pub(crate) fn run<T, F>(
        &self,
        job: F,
    ) -> impl Future<Output = Result<T, LaneStopped>> + use<T, F>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        let (job, answer) = answered(job);
        self.0.queue(|queue| queue.interactive.push_back(job));
        answer
    }

    /// Replaces the reading ahead still waiting with `jobs`, so it always follows the page read last.
    pub(crate) fn prefetch(&self, jobs: Vec<Job>) {
        self.0.queue(|queue| queue.prefetch = jobs.into());
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

    type Ran = Arc<Mutex<Vec<&'static str>>>;

    /// Occupies the lane's only worker until the returned sender is dropped.
    fn occupy(
        lane: &PageLane,
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

    fn noting(ran: &Ran, name: &'static str) -> impl FnOnce() + Send + 'static {
        let ran = Arc::clone(ran);
        move || ran.lock().unwrap().push(name)
    }

    fn prefetching(ran: &Ran, names: &[&'static str]) -> Vec<Job> {
        names
            .iter()
            .map(|name| -> Job { Box::new(noting(ran, name)) })
            .collect()
    }

    #[tokio::test]
    async fn reads_a_page_someone_waits_for_before_the_pages_read_ahead() {
        let lane = PageLane::start("page-lane-urgency", ONE_WORKER).unwrap();
        let (release, _occupied) = occupy(&lane);
        let ran = Ran::default();
        lane.prefetch(prefetching(&ran, &["ahead 1", "ahead 2"]));
        let first = lane.run(noting(&ran, "asked 1"));
        let second = lane.run(noting(&ran, "asked 2"));

        drop(release);

        first.await.unwrap();
        second.await.unwrap();
        let last = lane.run(|| ()).await;
        last.unwrap();
        assert_eq!(
            *ran.lock().unwrap(),
            ["asked 1", "asked 2", "ahead 1", "ahead 2"]
        );
    }

    #[tokio::test]
    async fn drops_the_reading_ahead_a_later_page_replaced() {
        let lane = PageLane::start("page-lane-replaced", ONE_WORKER).unwrap();
        let (release, _occupied) = occupy(&lane);
        let ran = Ran::default();
        lane.prefetch(prefetching(&ran, &["page 2", "page 3"]));
        let (done, finished) = mpsc::channel();
        let mut later = prefetching(&ran, &["page 6", "page 7"]);
        later.push(Box::new(move || done.send(()).unwrap()));

        lane.prefetch(later);

        drop(release);
        finished.recv_timeout(WAIT).unwrap();
        assert_eq!(*ran.lock().unwrap(), ["page 6", "page 7"]);
    }
}
