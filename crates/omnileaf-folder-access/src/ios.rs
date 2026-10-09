use omnileaf_engine::{AppleBookmark, ResolvedBookmark, RootLocator};
use serde::Serialize;
use tauri::{
    Manager, Runtime,
    plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
};

use crate::reply::{PickedFolder, ReopenedFolder};

tauri::ios_plugin_binding!(init_plugin_folder_access);

const PLUGIN_NAME: &str = "folder-access";

pub struct FolderAccess<R: Runtime>(PluginHandle<R>);

impl<R: Runtime> Clone for FolderAccess<R> {
    fn clone(&self) -> Self {
        Self(self.0.clone())
    }
}

#[derive(Serialize)]
struct Bookmark<'a> {
    bookmark: &'a [u8],
}

#[must_use]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new(PLUGIN_NAME)
        .setup(|app, api| {
            app.manage(FolderAccess(
                api.register_ios_plugin(init_plugin_folder_access)?,
            ));
            Ok(())
        })
        .build()
}

impl<R: Runtime> FolderAccess<R> {
    /// Waits for the person to pick a folder or cancel, so it must not run on the main thread.
    pub fn pick_folder(&self) -> Result<Option<RootLocator>, PluginInvokeError> {
        let picked: Option<PickedFolder> = self.0.run_mobile_plugin("pickFolder", ())?;
        Ok(picked.map(RootLocator::from))
    }

    pub fn reopen(&self, bookmark: &AppleBookmark) -> Result<ResolvedBookmark, PluginInvokeError> {
        let reopened: ReopenedFolder = self.0.run_mobile_plugin(
            "restoreAccess",
            Bookmark {
                bookmark: bookmark.as_bytes(),
            },
        )?;
        Ok(reopened.into())
    }
}
