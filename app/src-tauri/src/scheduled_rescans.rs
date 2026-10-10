use omnileaf_engine::Library;
use tauri::{AppHandle, Manager, async_runtime::JoinHandle};

/// Rescans the library's folders as their turns come, for as long as the app runs.
pub(crate) struct ScheduledRescans {
    _task: JoinHandle<()>,
}

impl ScheduledRescans {
    pub(crate) fn start(app: AppHandle) -> Self {
        Self {
            _task: tauri::async_runtime::spawn(async move {
                let library = app.state::<Library>();
                #[cfg(target_os = "ios")]
                library
                    .rescan_on_schedule(|| {
                        crate::folder_access::reopen_picked_folders_or_warn(&app, &library)
                    })
                    .await;
                #[cfg(not(target_os = "ios"))]
                library.rescan_on_schedule(|| async {}).await;
            }),
        }
    }
}
