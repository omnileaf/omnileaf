use std::{collections::VecDeque, path::PathBuf, sync::Mutex};

use serde::{Deserialize, Serialize};
use specta::Type;
use tauri::{AppHandle, Manager};
use tauri_specta::Event;

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Type, Event)]
pub(crate) struct FileOpenRequested;

#[derive(Default)]
pub(crate) struct FilesToOpen(Mutex<VecDeque<PathBuf>>);

impl FilesToOpen {
    pub(crate) fn queue(&self, arguments: impl IntoIterator<Item = String>) -> bool {
        let files: Vec<PathBuf> = arguments
            .into_iter()
            .map(PathBuf::from)
            .filter(|path| path.is_file())
            .collect();
        let queued = !files.is_empty();
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .extend(files);
        queued
    }

    pub(crate) fn next(&self) -> Option<PathBuf> {
        self.0
            .lock()
            .unwrap_or_else(std::sync::PoisonError::into_inner)
            .pop_front()
    }
}

pub(crate) fn in_directory(
    directory: &str,
    arguments: impl IntoIterator<Item = String>,
) -> impl Iterator<Item = String> {
    let directory = PathBuf::from(directory);
    arguments.into_iter().map(move |argument| {
        let path = PathBuf::from(&argument);
        if path.is_relative() {
            directory.join(path).display().to_string()
        } else {
            argument
        }
    })
}

pub(crate) fn request(app: &AppHandle, arguments: impl IntoIterator<Item = String>) {
    let files = app.state::<FilesToOpen>();
    if files.queue(arguments)
        && let Err(error) = FileOpenRequested.emit(app)
    {
        tracing::warn!(%error, "tell the interface a file was handed to the app");
    }
}

/// Finder hands a double-clicked file to a running or starting app as an Apple event rather than as an argument.
#[cfg(target_os = "macos")]
pub(crate) fn request_when_opened(app: &AppHandle, event: &tauri::RunEvent) {
    if let tauri::RunEvent::Opened { urls } = event {
        request(
            app,
            urls.iter()
                .filter_map(|url| url.to_file_path().ok())
                .map(|path| path.display().to_string()),
        );
    }
}

#[cfg(desktop)]
pub(crate) fn single_instance() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri_plugin_single_instance::init(|app, arguments, directory| {
        request(app, in_directory(&directory, arguments.into_iter().skip(1)));
        show_main_window(app);
    })
}

#[cfg(desktop)]
pub(crate) fn show_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if let Err(error) = window
        .unminimize()
        .and_then(|()| window.show())
        .and_then(|()| window.set_focus())
    {
        tracing::warn!(%error, "bring the window forward for a file handed to the app");
    }
}

#[cfg(test)]
mod tests {
    use std::fs;

    use super::*;

    #[test]
    fn queues_the_existing_files_among_the_launch_arguments_in_order() {
        let folder =
            std::env::temp_dir().join(format!("omnileaf-files-to-open-{}", std::process::id()));
        fs::create_dir_all(&folder).unwrap();
        let first = folder.join("one.cbz");
        let second = folder.join("two.cb7");
        fs::write(&first, b"x").unwrap();
        fs::write(&second, b"x").unwrap();
        let files = FilesToOpen::default();

        let queued = files.queue([
            "--flag".to_owned(),
            first.display().to_string(),
            folder.join("missing.cbz").display().to_string(),
            second.display().to_string(),
        ]);

        let order = [files.next(), files.next(), files.next()];
        fs::remove_dir_all(&folder).unwrap();
        assert_eq!((queued, order), (true, [Some(first), Some(second), None]));
    }

    #[test]
    fn finds_the_files_of_a_second_launch_from_the_directory_it_ran_in() {
        let folder =
            std::env::temp_dir().join(format!("omnileaf-second-launch-{}", std::process::id()));
        fs::create_dir_all(&folder).unwrap();
        fs::write(folder.join("one.cbz"), b"x").unwrap();
        let files = FilesToOpen::default();

        let queued = files.queue(in_directory(
            &folder.display().to_string(),
            ["one.cbz".to_owned(), "missing.cbz".to_owned()],
        ));

        let next = files.next();
        fs::remove_dir_all(&folder).unwrap();
        assert_eq!((queued, next), (true, Some(folder.join("one.cbz"))));
    }

    #[test]
    fn queues_nothing_for_arguments_that_name_no_file() {
        let files = FilesToOpen::default();

        let queued = files.queue(["--flag".to_owned(), "nowhere.cbz".to_owned()]);

        assert_eq!((queued, files.next()), (false, None));
    }
}
