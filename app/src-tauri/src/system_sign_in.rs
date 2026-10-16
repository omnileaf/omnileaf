use omnileaf_engine::ShareAddress;
use tauri::WebviewWindow;

use crate::share_sign_in::SystemSignIn;

#[cfg(target_os = "linux")]
pub(crate) async fn ask(window: &WebviewWindow, address: &ShareAddress) -> SystemSignIn {
    linux::ask(window, address).await
}

#[cfg(windows)]
pub(crate) async fn ask(window: &WebviewWindow, address: &ShareAddress) -> SystemSignIn {
    windows::ask(window, address).await
}

#[cfg(not(any(target_os = "linux", windows)))]
pub(crate) async fn ask(_window: &WebviewWindow, _address: &ShareAddress) -> SystemSignIn {
    SystemSignIn::Failed
}

#[cfg(target_os = "linux")]
mod linux {
    use gtk::{
        gio::{self, Cancellable, MountMountFlags, prelude::FileExt},
        glib,
    };
    use omnileaf_engine::ShareAddress;
    use tauri::WebviewWindow;

    use crate::share_sign_in::SystemSignIn;

    /// GTK's mount operation shows GNOME's own sign-in for the share, so the password goes from that dialog to GNOME's virtual file system without passing through Omnileaf.
    pub(super) async fn ask(window: &WebviewWindow, address: &ShareAddress) -> SystemSignIn {
        let (answer, answered) = tokio::sync::oneshot::channel();
        let asking = window.clone();
        let uri = address.as_str().to_owned();
        let shown = window.run_on_main_thread(move || {
            let parent = asking.gtk_window().ok();
            let operation = gtk::MountOperation::new(parent.as_ref());
            gio::File::for_uri(&uri).mount_enclosing_volume(
                MountMountFlags::NONE,
                Some(&operation),
                Cancellable::NONE,
                move |mounted| {
                    if answer.send(sign_in_of(&mounted)).is_err() {
                        tracing::debug!("nothing waits for the network share sign-in any more");
                    }
                },
            );
        });
        if let Err(error) = shown {
            tracing::warn!(%error, "show the network share sign-in");
            return SystemSignIn::Failed;
        }
        answered.await.unwrap_or(SystemSignIn::Failed)
    }

    pub(super) fn sign_in_of(mounted: &Result<(), glib::Error>) -> SystemSignIn {
        match mounted {
            Ok(()) => SystemSignIn::Mounted,
            Err(error) if error.matches(gio::IOErrorEnum::AlreadyMounted) => SystemSignIn::Mounted,
            Err(error)
                if error.matches(gio::IOErrorEnum::FailedHandled)
                    || error.matches(gio::IOErrorEnum::Cancelled) =>
            {
                SystemSignIn::Cancelled
            }
            Err(error) => {
                tracing::warn!(%error, "sign in to a network share");
                SystemSignIn::Failed
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use gtk::gio::IOErrorEnum;

        use super::*;

        fn failed_with(error: IOErrorEnum) -> Result<(), glib::Error> {
            Err(glib::Error::new(error, "mount the share"))
        }

        #[test]
        fn is_mounted_once_gvfs_mounts_the_share_or_had_it_mounted() {
            assert_eq!(
                [
                    sign_in_of(&Ok(())),
                    sign_in_of(&failed_with(IOErrorEnum::AlreadyMounted))
                ],
                [SystemSignIn::Mounted, SystemSignIn::Mounted]
            );
        }

        #[test]
        fn is_cancelled_when_the_person_closes_the_sign_in() {
            assert_eq!(
                [
                    sign_in_of(&failed_with(IOErrorEnum::FailedHandled)),
                    sign_in_of(&failed_with(IOErrorEnum::Cancelled))
                ],
                [SystemSignIn::Cancelled, SystemSignIn::Cancelled]
            );
        }

        #[test]
        fn fails_when_gvfs_cannot_mount_the_share() {
            assert_eq!(
                [
                    sign_in_of(&failed_with(IOErrorEnum::PermissionDenied)),
                    sign_in_of(&failed_with(IOErrorEnum::HostNotFound))
                ],
                [SystemSignIn::Failed, SystemSignIn::Failed]
            );
        }
    }
}

#[cfg(any(windows, test))]
mod windows_answer {
    use crate::share_sign_in::SystemSignIn;

    const CONNECTED: u32 = 0;
    const CANCELLED_BY_THE_PERSON: u32 = 1223;

    pub(super) fn sign_in_of(answer: u32) -> SystemSignIn {
        match answer {
            CONNECTED => SystemSignIn::Mounted,
            CANCELLED_BY_THE_PERSON => SystemSignIn::Cancelled,
            failure => {
                tracing::warn!(error = failure, "sign in to a network share");
                SystemSignIn::Failed
            }
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        const NO_ERROR: u32 = 0;
        const ERROR_CANCELLED: u32 = 1223;
        const ERROR_LOGON_FAILURE: u32 = 1326;
        const ERROR_BAD_NETPATH: u32 = 53;

        #[test]
        fn is_mounted_once_windows_connects_to_the_share() {
            assert_eq!(sign_in_of(NO_ERROR), SystemSignIn::Mounted);
        }

        #[test]
        fn is_cancelled_when_the_person_closes_windows_security() {
            assert_eq!(sign_in_of(ERROR_CANCELLED), SystemSignIn::Cancelled);
        }

        #[test]
        fn fails_when_windows_cannot_sign_in_or_reach_the_share() {
            assert_eq!(
                [
                    sign_in_of(ERROR_LOGON_FAILURE),
                    sign_in_of(ERROR_BAD_NETPATH)
                ],
                [SystemSignIn::Failed, SystemSignIn::Failed]
            );
        }
    }
}

#[cfg(windows)]
mod windows {
    use omnileaf_engine::ShareAddress;
    use tauri::WebviewWindow;

    use super::windows_answer::sign_in_of;
    use crate::share_sign_in::SystemSignIn;

    /// `WNetAddConnection3W` asks through Windows Security for the share's credentials, so the password goes to Windows without passing through Omnileaf.
    pub(super) async fn ask(window: &WebviewWindow, address: &ShareAddress) -> SystemSignIn {
        let owner = window.hwnd().map_or(0, |owner| owner.0.expose_provenance());
        let share = address.as_str().to_owned();
        tauri::async_runtime::spawn_blocking(move || {
            sign_in_of(omnileaf_windows_probes::connect_share(owner, &share))
        })
        .await
        .unwrap_or(SystemSignIn::Failed)
    }
}
