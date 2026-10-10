use std::{cmp::Reverse, collections::VecDeque, io, num::NonZeroUsize};

use tokio::sync::oneshot;

use crate::{
    PagePath,
    lane::{Job, JobQueue, Lane, LaneStopped, answered},
};

/// Room for every page the reader keeps around the one it shows, so only pages it left well behind are dropped.
pub(crate) const ASKED_PAGES_WAITING: usize = 8;

/// Reads pages on threads of its own, a page someone waits for before any page read ahead.
pub(crate) struct PageLane(Lane<ByUrgency>);

#[derive(Default)]
pub(crate) struct ByUrgency {
    interactive: VecDeque<Job>,
    asked_pages: VecDeque<AskedPage>,
    prefetch: VecDeque<Job>,
}

struct AskedPage {
    path: PagePath,
    answer: Box<dyn FnOnce(Fate) + Send>,
}

enum Fate {
    Read,
    Superseded,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum AskedPageError {
    #[error("wait for a page on the page lane")]
    Stopped(#[from] LaneStopped),
    #[error("read a page that more recently asked for pages pushed out of the queue")]
    Superseded,
}

impl JobQueue for ByUrgency {
    fn next(&mut self) -> Option<Job> {
        self.interactive
            .pop_front()
            .or_else(|| {
                self.asked_pages
                    .pop_front()
                    .map(|asked| -> Job { Box::new(move || (asked.answer)(Fate::Read)) })
            })
            .or_else(|| self.prefetch.pop_front())
    }
}

impl ByUrgency {
    /// Queues the page, handing back the page waiting furthest from it, the oldest of those as far, when it no longer fits.
    fn ask(&mut self, page: AskedPage) -> Option<AskedPage> {
        let newest = page.path;
        self.asked_pages.push_back(page);
        if self.asked_pages.len() <= ASKED_PAGES_WAITING {
            return None;
        }
        let (furthest, _) = self
            .asked_pages
            .iter()
            .enumerate()
            .max_by_key(|(position, asked)| (distance(asked.path, newest), Reverse(*position)))?;
        self.asked_pages.remove(furthest)
    }
}

/// How many pages apart two pages are, a page of another book or revision counting as furthest of all.
fn distance(page: PagePath, from: PagePath) -> u32 {
    if page.book == from.book && page.rev == from.rev {
        page.index.abs_diff(from.index)
    } else {
        u32::MAX
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

    /// Queues the reading of a page behind the pages asked for before it, dropping the one furthest from it once more than [`ASKED_PAGES_WAITING`] wait.
    pub(crate) fn read_page<T, F>(
        &self,
        path: PagePath,
        read: F,
    ) -> impl Future<Output = Result<T, AskedPageError>> + use<T, F>
    where
        T: Send + 'static,
        F: FnOnce() -> T + Send + 'static,
    {
        let (sender, receiver) = oneshot::channel();
        let answer: Box<dyn FnOnce(Fate) + Send> = Box::new(move |fate| {
            if sender.is_closed() {
                return;
            }
            let answer = match fate {
                Fate::Read => Ok(read()),
                Fate::Superseded => Err(AskedPageError::Superseded),
            };
            if sender.send(answer).is_err() {
                tracing::trace!("the caller stopped waiting while its page was read");
            }
        });
        if let Some(superseded) = self.0.queue(|queue| queue.ask(AskedPage { path, answer })) {
            (superseded.answer)(Fate::Superseded);
        }
        async move { receiver.await.map_err(|_| LaneStopped)? }
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

    use omnileaf_sync_proto::{BookId, Fingerprint, ImageEntry};

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

    fn book(crc32: u32) -> BookId {
        BookId::local(&Fingerprint::pmf1([ImageEntry { crc32, size: 1 }]).unwrap())
    }

    fn page_of(book: BookId, index: u32) -> PagePath {
        PagePath {
            book,
            rev: 1,
            index,
        }
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

    /// The reading ahead of `names`, then a job that says it has all run.
    fn prefetching_until_done(ran: &Ran, names: &[&'static str]) -> (Vec<Job>, mpsc::Receiver<()>) {
        let (done, finished) = mpsc::channel();
        let mut jobs = prefetching(ran, names);
        jobs.push(Box::new(move || done.send(()).unwrap()));
        (jobs, finished)
    }

    #[tokio::test]
    async fn reads_a_page_someone_waits_for_before_the_pages_read_ahead() {
        let lane = PageLane::start("page-lane-urgency", ONE_WORKER).unwrap();
        let (release, _occupied) = occupy(&lane);
        let ran = Ran::default();
        let (ahead, finished) = prefetching_until_done(&ran, &["ahead 1", "ahead 2"]);
        lane.prefetch(ahead);
        let first = lane.run(noting(&ran, "asked 1"));
        let second = lane.run(noting(&ran, "asked 2"));

        drop(release);

        first.await.unwrap();
        second.await.unwrap();
        finished.recv_timeout(WAIT).unwrap();
        assert_eq!(
            *ran.lock().unwrap(),
            ["asked 1", "asked 2", "ahead 1", "ahead 2"]
        );
    }

    #[tokio::test]
    async fn reads_only_the_pages_asked_for_last_when_a_burst_of_them_waits() {
        let lane = PageLane::start("page-lane-burst", ONE_WORKER).unwrap();
        let (release, _occupied) = occupy(&lane);
        let read = Arc::new(Mutex::new(Vec::new()));
        let shown = book(1);
        let burst: Vec<_> = (0..50)
            .map(|page| {
                let read = Arc::clone(&read);
                lane.read_page(page_of(shown, page), move || {
                    read.lock().unwrap().push(page);
                })
            })
            .collect();
        let newest = {
            let read = Arc::clone(&read);
            lane.read_page(page_of(shown, 50), move || read.lock().unwrap().push(50))
        };

        drop(release);

        newest.await.unwrap();
        let mut superseded = 0;
        for asked in burst {
            if let Err(AskedPageError::Superseded) = asked.await {
                superseded += 1;
            }
        }
        let kept = 51 - u32::try_from(ASKED_PAGES_WAITING).unwrap();
        assert_eq!(*read.lock().unwrap(), (kept..=50).collect::<Vec<_>>());
        assert_eq!(superseded, usize::try_from(kept).unwrap());
    }

    #[tokio::test]
    async fn drops_the_page_furthest_from_the_one_asked_for_last_when_too_many_wait() {
        let lane = PageLane::start("page-lane-furthest", ONE_WORKER).unwrap();
        let (release, _occupied) = occupy(&lane);
        let shown = book(1);
        let read = Arc::new(Mutex::new(Vec::new()));
        let asked: Vec<_> = [3, 20, 21, 22, 23, 24, 25, 26, 4]
            .into_iter()
            .map(|page| {
                let read = Arc::clone(&read);
                (
                    page,
                    lane.read_page(page_of(shown, page), move || {
                        read.lock().unwrap().push(page);
                    }),
                )
            })
            .collect();

        drop(release);

        let mut superseded = Vec::new();
        for (page, answer) in asked {
            if let Err(AskedPageError::Superseded) = answer.await {
                superseded.push(page);
            }
        }
        assert_eq!(superseded, [26]);
        assert_eq!(*read.lock().unwrap(), [3, 20, 21, 22, 23, 24, 25, 4]);
    }

    #[tokio::test]
    async fn reads_a_page_asked_for_before_the_pages_read_ahead() {
        let lane = PageLane::start("page-lane-asked", ONE_WORKER).unwrap();
        let (release, _occupied) = occupy(&lane);
        let ran = Ran::default();
        let (ahead, finished) = prefetching_until_done(&ran, &["ahead 1"]);
        lane.prefetch(ahead);
        let asked = lane.read_page(page_of(book(1), 0), noting(&ran, "asked"));

        drop(release);

        asked.await.unwrap();
        finished.recv_timeout(WAIT).unwrap();
        assert_eq!(*ran.lock().unwrap(), ["asked", "ahead 1"]);
    }

    #[tokio::test]
    async fn drops_the_reading_ahead_a_later_page_replaced() {
        let lane = PageLane::start("page-lane-replaced", ONE_WORKER).unwrap();
        let (release, _occupied) = occupy(&lane);
        let ran = Ran::default();
        lane.prefetch(prefetching(&ran, &["page 2", "page 3"]));
        let (later, finished) = prefetching_until_done(&ran, &["page 6", "page 7"]);

        lane.prefetch(later);

        drop(release);
        finished.recv_timeout(WAIT).unwrap();
        assert_eq!(*ran.lock().unwrap(), ["page 6", "page 7"]);
    }
}
