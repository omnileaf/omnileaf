use std::path::Path;

use omnileaf_engine::{Library, PowerMode, RescanConditions, Storage};
use tauri::{AppHandle, Manager, async_runtime::JoinHandle};

use crate::{folder_storage, power_mode::PowerModeProbe};

/// Rescans the library's folders as their turns come, for as long as the app runs.
pub(crate) struct ScheduledRescans {
    _task: JoinHandle<()>,
}

struct ThisDevice {
    power: PowerModeProbe,
}

impl RescanConditions for ThisDevice {
    async fn storage_of(&self, folder: &Path) -> Storage {
        let folder = folder.to_path_buf();
        tauri::async_runtime::spawn_blocking(move || folder_storage::storage_of(&folder))
            .await
            .unwrap_or(Storage::Local)
    }

    async fn power_mode(&self) -> PowerMode {
        self.power.power_mode().await
    }
}

impl ScheduledRescans {
    pub(crate) fn start(app: AppHandle) -> Self {
        Self {
            _task: tauri::async_runtime::spawn(async move {
                let library = app.state::<Library>();
                let device = ThisDevice {
                    power: PowerModeProbe::connect().await,
                };
                #[cfg(target_os = "ios")]
                library
                    .rescan_on_schedule(&device, || {
                        crate::folder_access::reopen_picked_folders_or_warn(&app, &library)
                    })
                    .await;
                #[cfg(not(target_os = "ios"))]
                library.rescan_on_schedule(&device, || async {}).await;
            }),
        }
    }
}
