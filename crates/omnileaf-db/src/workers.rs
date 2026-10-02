use std::{
    sync::{
        Arc, Mutex,
        mpsc::{self, Receiver, Sender},
    },
    thread::{self, JoinHandle},
};

use rusqlite::Connection;
use tokio::sync::oneshot;

use crate::Error;

type Job = Box<dyn FnOnce(&mut Connection) + Send>;

/// Threads that each own one connection and take jobs from a shared queue in the order they were submitted.
pub(crate) struct ConnectionWorkers {
    jobs: Option<Sender<Job>>,
    threads: Vec<JoinHandle<()>>,
}

impl ConnectionWorkers {
    pub(crate) fn spawn(name: &str, connections: Vec<Connection>) -> Result<Self, Error> {
        let (jobs, queue) = mpsc::channel();
        let queue = Arc::new(Mutex::new(queue));
        let mut workers = Self {
            jobs: Some(jobs),
            threads: Vec::with_capacity(connections.len()),
        };
        for connection in connections {
            let queue = Arc::clone(&queue);
            let thread = thread::Builder::new()
                .name(name.to_owned())
                .spawn(move || serve(connection, &queue))
                .map_err(Error::Spawn)?;
            workers.threads.push(thread);
        }
        Ok(workers)
    }

    pub(crate) fn submit<T, F>(&self, job: F) -> impl Future<Output = Result<T, Error>> + use<T, F>
    where
        T: Send + 'static,
        F: FnOnce(&mut Connection) -> Result<T, Error> + Send + 'static,
    {
        let (reply, outcome) = oneshot::channel();
        let queued = self.jobs.as_ref().ok_or(Error::Closed).and_then(|jobs| {
            jobs.send(Box::new(move |connection: &mut Connection| {
                if reply.send(job(connection)).is_err() {
                    tracing::debug!("a database job finished after its caller stopped waiting");
                }
            }))
            .map_err(|_| Error::Closed)
        });
        async move {
            queued?;
            outcome.await.map_err(|_| Error::Closed)?
        }
    }
}

impl Drop for ConnectionWorkers {
    fn drop(&mut self) {
        drop(self.jobs.take());
        for thread in self.threads.drain(..) {
            if thread.join().is_err() {
                tracing::error!("a database thread panicked");
            }
        }
    }
}

fn serve(mut connection: Connection, queue: &Mutex<Receiver<Job>>) {
    while let Some(job) = next_job(queue) {
        job(&mut connection);
    }
}

fn next_job(queue: &Mutex<Receiver<Job>>) -> Option<Job> {
    queue.lock().ok()?.recv().ok()
}
