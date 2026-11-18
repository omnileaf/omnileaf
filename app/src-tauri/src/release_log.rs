use std::io::Write;

use tracing::{
    Event, Level, Subscriber,
    field::{Field, Visit},
};
use tracing_subscriber::{Layer, fmt::MakeWriter, layer::Context};

const EVENT_FIELD: &str = "event";
const LONGEST_EVENT_NAME: usize = 64;

pub(crate) struct ReleaseLog<W> {
    make_writer: W,
}

impl<W> ReleaseLog<W> {
    pub(crate) const fn new(make_writer: W) -> Self {
        Self { make_writer }
    }
}

impl<S, W> Layer<S> for ReleaseLog<W>
where
    S: Subscriber,
    W: for<'writer> MakeWriter<'writer> + 'static,
{
    fn on_event(&self, event: &Event<'_>, _context: Context<'_, S>) {
        let metadata = event.metadata();
        if *metadata.level() > Level::WARN {
            return;
        }
        let mut name = EventName::default();
        event.record(&mut name);
        let line = match name.0 {
            Some(name) => format!("{} {} event={name}", metadata.level(), metadata.target()),
            None => format!("{} {}", metadata.level(), metadata.target()),
        };
        write_line(self.make_writer.make_writer_for(metadata), &line);
    }
}

#[derive(Default)]
struct EventName(Option<String>);

impl Visit for EventName {
    fn record_str(&mut self, field: &Field, value: &str) {
        if field.name() == EVENT_FIELD && is_event_name(value) {
            self.0 = Some(value.to_owned());
        }
    }

    fn record_debug(&mut self, _field: &Field, _value: &dyn std::fmt::Debug) {}
}

fn is_event_name(name: &str) -> bool {
    name.len() <= LONGEST_EVENT_NAME
        && name.starts_with(|first: char| first.is_ascii_lowercase())
        && name
            .chars()
            .all(|character| character.is_ascii_lowercase() || character == '_')
}

fn write_line(mut writer: impl Write, line: &str) {
    let _ = writeln!(writer, "{line}");
}

#[cfg(test)]
mod tests {
    use std::{
        io,
        sync::{Arc, Mutex},
    };

    use tracing_subscriber::{fmt::MakeWriter, layer::SubscriberExt};

    use super::ReleaseLog;

    const PRIVATE_PATH: &str = "/storage/emulated/0/Comics/Diary of a Secret";
    const PRIVATE_URI: &str =
        "content://com.android.externalstorage.documents/tree/primary%3AComics";

    #[derive(Clone, Default)]
    struct Written(Arc<Mutex<Vec<u8>>>);

    impl Written {
        fn text(&self) -> String {
            String::from_utf8(self.0.lock().unwrap().clone()).unwrap()
        }
    }

    impl io::Write for Written {
        fn write(&mut self, bytes: &[u8]) -> io::Result<usize> {
            self.0.lock().unwrap().extend_from_slice(bytes);
            Ok(bytes.len())
        }

        fn flush(&mut self) -> io::Result<()> {
            Ok(())
        }
    }

    impl<'writer> MakeWriter<'writer> for Written {
        type Writer = Self;

        fn make_writer(&'writer self) -> Self::Writer {
            self.clone()
        }
    }

    fn logged(emit: impl FnOnce()) -> String {
        let written = Written::default();
        let subscriber = tracing_subscriber::registry().with(ReleaseLog::new(written.clone()));
        tracing::subscriber::with_default(subscriber, emit);
        written.text()
    }

    #[test]
    fn writes_a_warning_as_its_level_and_target_only() {
        let text = logged(|| {
            tracing::warn!(
                path = PRIVATE_PATH,
                uri = PRIVATE_URI,
                "read {PRIVATE_PATH}"
            );
        });

        assert_eq!(text, "WARN omnileaf_app::release_log::tests\n");
    }

    #[test]
    fn writes_an_error_with_its_fixed_event_name() {
        let text = logged(|| {
            tracing::error!(
                event = "folder_unreadable",
                path = PRIVATE_PATH,
                "read {PRIVATE_URI}"
            );
        });

        assert_eq!(
            text,
            "ERROR omnileaf_app::release_log::tests event=folder_unreadable\n"
        );
    }

    #[test]
    fn leaves_out_an_event_name_that_could_carry_data() {
        let text = logged(|| {
            tracing::error!(event = PRIVATE_PATH, "failed");
            tracing::error!(event = PRIVATE_URI, "failed");
        });

        assert_eq!(text, "ERROR omnileaf_app::release_log::tests\n".repeat(2));
    }

    #[test]
    fn writes_nothing_below_warnings() {
        let text = logged(|| {
            tracing::info!(path = PRIVATE_PATH, "opened {PRIVATE_PATH}");
            tracing::debug!(uri = PRIVATE_URI, "listed");
        });

        assert_eq!(text, "");
    }
}
