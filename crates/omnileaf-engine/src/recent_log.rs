use std::{
    collections::VecDeque,
    fmt,
    sync::{Arc, Mutex, MutexGuard, PoisonError},
};

use tracing::{
    Event, Level, Subscriber,
    field::{Field, Visit},
};
use tracing_subscriber::{Layer, filter::LevelFilter, layer::Context};

const LINE_LIMIT: usize = 200;
const LINE_BYTE_LIMIT: usize = 1_000;
const FINEST_KEPT: Level = Level::INFO;
const MESSAGE_FIELD: &str = "message";
const CUT_MARK: char = '…';

#[derive(Clone, Debug, Default)]
pub struct RecentLog(Arc<Mutex<VecDeque<String>>>);

impl RecentLog {
    #[must_use]
    pub fn lines(&self) -> Vec<String> {
        self.kept().iter().cloned().collect()
    }

    fn keep(&self, line: String) {
        let mut kept = self.kept();
        if kept.len() == LINE_LIMIT {
            kept.pop_front();
        }
        kept.push_back(line);
    }

    fn kept(&self) -> MutexGuard<'_, VecDeque<String>> {
        self.0.lock().unwrap_or_else(PoisonError::into_inner)
    }
}

impl<S: Subscriber> Layer<S> for RecentLog {
    fn max_level_hint(&self) -> Option<LevelFilter> {
        Some(LevelFilter::from_level(FINEST_KEPT))
    }

    fn on_event(&self, event: &Event<'_>, _context: Context<'_, S>) {
        let metadata = event.metadata();
        if *metadata.level() > FINEST_KEPT {
            return;
        }
        let mut line = LogLine(format!("{} {}:", metadata.level(), metadata.target()));
        event.record(&mut line);
        self.keep(line.into_bounded());
    }
}

struct LogLine(String);

impl LogLine {
    fn into_bounded(self) -> String {
        let escaped: String = self.0.chars().flat_map(escape_control).collect();
        if escaped.len() <= LINE_BYTE_LIMIT {
            return escaped;
        }
        let budget = LINE_BYTE_LIMIT - CUT_MARK.len_utf8();
        let cut = (0..=budget)
            .rev()
            .find(|end| escaped.is_char_boundary(*end))
            .unwrap_or(0);
        let mut bounded = escaped.get(..cut).unwrap_or_default().to_owned();
        bounded.push(CUT_MARK);
        bounded
    }
}

fn escape_control(next: char) -> Vec<char> {
    if next.is_control() {
        next.escape_default().collect()
    } else {
        vec![next]
    }
}

impl Visit for LogLine {
    fn record_debug(&mut self, field: &Field, value: &dyn fmt::Debug) {
        let recorded = if field.name() == MESSAGE_FIELD {
            format!(" {value:?}")
        } else {
            format!(" {}={value:?}", field.name())
        };
        self.0.push_str(&recorded);
    }
}
