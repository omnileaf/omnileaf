//! Whether a Linux desktop can show a folder chooser, so a missing one isn't taken for a cancelled pick.

use crate::ipc_error::IpcError;

/// Asks the desktop portal only when zenity, the dialog plugin's fallback, is missing.
pub(crate) fn require_folder_chooser(
    has_zenity: bool,
    portal_offers_chooser: impl FnOnce() -> bool,
) -> Result<(), IpcError> {
    if has_zenity || portal_offers_chooser() {
        Ok(())
    } else {
        Err(IpcError::folder_chooser_missing())
    }
}

#[cfg(target_os = "linux")]
pub(crate) fn require_installed_folder_chooser() -> Result<(), IpcError> {
    require_folder_chooser(linux::zenity_on_path(), linux::portal_offers_file_chooser)
}

#[cfg(target_os = "linux")]
mod linux {
    use std::{env, fs, os::unix::fs::PermissionsExt, path::Path, time::Duration};

    use omnileaf_engine::describe_error;
    use zbus::connection;

    const PORTAL: &str = "org.freedesktop.portal.Desktop";
    const PORTAL_PATH: &str = "/org/freedesktop/portal/desktop";
    const FILE_CHOOSER: &str = "org.freedesktop.portal.FileChooser";
    const PROPERTIES: &str = "org.freedesktop.DBus.Properties";
    const ZENITY: &str = "zenity";
    const ANYONE_MAY_RUN: u32 = 0o111;
    /// Long enough for the session bus to start the portal on first use, as libdbus allows.
    const PORTAL_ANSWER_TIMEOUT: Duration = Duration::from_secs(25);

    pub(super) fn portal_offers_file_chooser() -> bool {
        tauri::async_runtime::block_on(bus_offers_file_chooser(connection::Builder::session()))
    }

    async fn bus_offers_file_chooser(bus: zbus::Result<connection::Builder<'_>>) -> bool {
        let answer = async {
            let bus = bus?.method_timeout(PORTAL_ANSWER_TIMEOUT).build().await?;
            bus.call_method(
                Some(PORTAL),
                PORTAL_PATH,
                Some(PROPERTIES),
                "Get",
                &(FILE_CHOOSER, "version"),
            )
            .await
        };
        answer
            .await
            .inspect_err(|error| {
                tracing::warn!(error = %describe_error(error), "ask the desktop portal for its file chooser");
            })
            .is_ok()
    }

    pub(super) fn zenity_on_path() -> bool {
        env::var_os("PATH").is_some_and(|paths| {
            env::split_paths(&paths).any(|folder| is_runnable(&folder.join(ZENITY)))
        })
    }

    fn is_runnable(file: &Path) -> bool {
        fs::metadata(file).is_ok_and(|metadata| {
            metadata.is_file() && metadata.permissions().mode() & ANYONE_MAY_RUN != 0
        })
    }

    #[cfg(test)]
    mod tests {
        use std::os::unix::net::UnixStream;

        use zbus::{Guid, interface};

        use super::*;

        struct FileChooser(u32);

        #[interface(name = "org.freedesktop.portal.FileChooser")]
        impl FileChooser {
            #[zbus(property, name = "version")]
            fn version(&self) -> u32 {
                self.0
            }
        }

        struct Settings(u32);

        #[interface(name = "org.freedesktop.portal.Settings")]
        impl Settings {
            #[zbus(property, name = "version")]
            fn version(&self) -> u32 {
                self.0
            }
        }

        fn offered_by_portal(
            serve: impl FnOnce(
                connection::Builder<'static>,
            ) -> zbus::Result<connection::Builder<'static>>,
        ) -> bool {
            let (portal_end, app_end) = UnixStream::pair().expect("a socket pair");
            let portal = connection::Builder::async_io_unix_stream(portal_end)
                .server(Guid::generate())
                .and_then(|portal| serve(portal.p2p()))
                .expect("a portal to serve");
            let app = connection::Builder::async_io_unix_stream(app_end).p2p();

            tauri::async_runtime::block_on(async move {
                let portal = tauri::async_runtime::spawn(portal.build());
                let offered = bus_offers_file_chooser(Ok(app)).await;
                let _portal_connection = portal
                    .await
                    .expect("the portal task")
                    .expect("a portal connection");
                offered
            })
        }

        #[test]
        fn finds_the_file_chooser_the_portal_offers() {
            let offered = offered_by_portal(|portal| portal.serve_at(PORTAL_PATH, FileChooser(4)));

            assert!(offered);
        }

        #[test]
        fn finds_no_file_chooser_on_a_portal_without_one() {
            let offered = offered_by_portal(|portal| portal.serve_at(PORTAL_PATH, Settings(2)));

            assert!(!offered);
        }

        #[test]
        fn finds_no_file_chooser_on_a_bus_it_cannot_reach() {
            let unreachable = connection::Builder::address("unix:path=/nonexistent/omnileaf-bus");

            let offered = tauri::async_runtime::block_on(bus_offers_file_chooser(unreachable));

            assert!(!offered);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reports_a_missing_chooser_when_neither_zenity_nor_the_portal_can_show_one() {
        let checked = require_folder_chooser(false, || false);

        assert_eq!(checked, Err(IpcError::folder_chooser_missing()));
    }

    #[test]
    fn opens_the_chooser_through_the_portal_without_zenity() {
        let checked = require_folder_chooser(false, || true);

        assert_eq!(checked, Ok(()));
    }

    #[test]
    fn opens_the_chooser_through_zenity_without_asking_the_portal() {
        let checked = require_folder_chooser(true, || panic!("asked the portal"));

        assert_eq!(checked, Ok(()));
    }
}
