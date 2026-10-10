use std::path::Path;

use omnileaf_engine::{Library, RescanConditions, Storage};
use tauri::{AppHandle, Manager, async_runtime::JoinHandle};

use crate::folder_storage;

/// Rescans the library's folders as their turns come, for as long as the app runs.
pub(crate) struct ScheduledRescans {
    _task: JoinHandle<()>,
}

struct ThisDevice;

impl RescanConditions for ThisDevice {
    fn storage_of(&self, folder: &Path) -> Storage {
        folder_storage::storage_of(folder)
    }
}

impl ScheduledRescans {
    pub(crate) fn start(app: AppHandle) -> Self {
        Self {
            _task: tauri::async_runtime::spawn(async move {
                let library = app.state::<Library>();
                #[cfg(target_os = "ios")]
                library
                    .rescan_on_schedule(&ThisDevice, || {
                        crate::folder_access::reopen_picked_folders_or_warn(&app, &library)
                    })
                    .await;
                #[cfg(not(target_os = "ios"))]
                library.rescan_on_schedule(&ThisDevice, || async {}).await;
            }),
        }
    }
}
