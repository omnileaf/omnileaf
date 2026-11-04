use std::io;

use serde::Serialize;
use specta::Type;

const COMIC_MIME_TYPES: [&str; 3] = [
    "application/vnd.comicbook+zip",
    "application/x-cb7",
    "application/vnd.comicbook-rar",
];
const DESKTOP_ENTRY: &str = "Omnileaf.desktop";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum DefaultViewer {
    Omnileaf,
    SomethingElse,
}

#[cfg_attr(
    not(any(target_os = "linux", test)),
    expect(dead_code, reason = "only Linux reads the default from xdg-mime")
)]
pub(crate) fn read_default(
    mut query: impl FnMut(&str) -> io::Result<String>,
) -> io::Result<DefaultViewer> {
    for mime in COMIC_MIME_TYPES {
        if query(mime)?.trim() != DESKTOP_ENTRY {
            return Ok(DefaultViewer::SomethingElse);
        }
    }
    Ok(DefaultViewer::Omnileaf)
}

#[cfg_attr(
    not(any(target_os = "linux", test)),
    expect(dead_code, reason = "only Linux sets the default through xdg-mime")
)]
pub(crate) fn default_arguments() -> Vec<&'static str> {
    ["default", DESKTOP_ENTRY]
        .into_iter()
        .chain(COMIC_MIME_TYPES)
        .collect()
}

#[cfg(target_os = "linux")]
mod xdg {
    use std::{io, process::Command};

    use super::{DefaultViewer, default_arguments, read_default};

    const XDG_MIME: &str = "xdg-mime";

    pub(super) fn read() -> io::Result<DefaultViewer> {
        read_default(|mime| {
            let output = Command::new(XDG_MIME)
                .args(["query", "default", mime])
                .output()?;
            Ok(String::from_utf8_lossy(&output.stdout).into_owned())
        })
    }

    pub(super) fn make() -> io::Result<()> {
        let status = Command::new(XDG_MIME).args(default_arguments()).status()?;
        if status.success() {
            Ok(())
        } else {
            Err(io::Error::other(format!("{XDG_MIME} exited with {status}")))
        }
    }
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum DefaultViewerError {
    #[cfg_attr(
        any(target_os = "linux", windows),
        expect(dead_code, reason = "Linux and Windows can both change the default")
    )]
    #[error("this system cannot make Omnileaf the default for comic files from the app")]
    Unsupported,
    #[cfg(target_os = "linux")]
    #[error("run xdg-mime")]
    Xdg(#[from] io::Error),
    #[cfg(windows)]
    #[error("open the Default apps settings")]
    Opener(#[from] tauri_plugin_opener::Error),
}

#[cfg(target_os = "linux")]
pub(crate) async fn current() -> Result<DefaultViewer, DefaultViewerError> {
    Ok(run_blocking(xdg::read).await?)
}

#[cfg(target_os = "linux")]
pub(crate) async fn make_default<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
) -> Result<(), DefaultViewerError> {
    Ok(run_blocking(xdg::make).await?)
}

#[cfg(target_os = "linux")]
async fn run_blocking<T: Send + 'static>(
    work: impl FnOnce() -> io::Result<T> + Send + 'static,
) -> io::Result<T> {
    tokio::task::spawn_blocking(work)
        .await
        .map_err(io::Error::other)?
}

#[cfg(windows)]
const DEFAULT_APPS_URL: &str = "ms-settings:defaultapps";

#[cfg(windows)]
#[expect(
    clippy::unused_async,
    reason = "Windows keeps the choice in its own settings"
)]
pub(crate) async fn current() -> Result<DefaultViewer, DefaultViewerError> {
    Ok(DefaultViewer::SomethingElse)
}

#[cfg(windows)]
#[expect(clippy::unused_async, reason = "opening a page does not wait")]
pub(crate) async fn make_default<R: tauri::Runtime>(
    app: &tauri::AppHandle<R>,
) -> Result<(), DefaultViewerError> {
    use tauri_plugin_opener::OpenerExt;
    Ok(app.opener().open_url(DEFAULT_APPS_URL, None::<&str>)?)
}

#[cfg(not(any(target_os = "linux", windows)))]
#[expect(clippy::unused_async, reason = "nothing to wait for")]
pub(crate) async fn current() -> Result<DefaultViewer, DefaultViewerError> {
    Ok(DefaultViewer::SomethingElse)
}

#[cfg(not(any(target_os = "linux", windows)))]
#[expect(clippy::unused_async, reason = "nothing to wait for")]
pub(crate) async fn make_default<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
) -> Result<(), DefaultViewerError> {
    Err(DefaultViewerError::Unsupported)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn answering(entry: &'static str) -> impl FnMut(&str) -> io::Result<String> {
        move |_| Ok(format!("{entry}\n"))
    }

    #[test]
    fn reads_omnileaf_as_the_default_when_it_opens_every_comic_type() {
        let viewer = read_default(answering(DESKTOP_ENTRY)).unwrap();

        assert_eq!(viewer, DefaultViewer::Omnileaf);
    }

    #[test]
    fn reads_something_else_when_one_comic_type_opens_elsewhere() {
        let viewer = read_default(|mime| {
            Ok(if mime == "application/x-cb7" {
                "other.desktop\n".to_owned()
            } else {
                format!("{DESKTOP_ENTRY}\n")
            })
        })
        .unwrap();

        assert_eq!(viewer, DefaultViewer::SomethingElse);
    }

    #[test]
    fn reads_something_else_when_a_type_has_no_default() {
        let viewer = read_default(answering("")).unwrap();

        assert_eq!(viewer, DefaultViewer::SomethingElse);
    }

    #[test]
    fn passes_a_failed_query_on() {
        let result = read_default(|_| Err(io::Error::other("no xdg-mime")));

        assert!(result.is_err());
    }

    #[test]
    fn sets_the_entry_for_every_comic_type_in_one_call() {
        assert_eq!(
            default_arguments(),
            [
                "default",
                DESKTOP_ENTRY,
                "application/vnd.comicbook+zip",
                "application/x-cb7",
                "application/vnd.comicbook-rar"
            ]
        );
    }
}
