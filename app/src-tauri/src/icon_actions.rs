use omnileaf_icon_actions::IconAction;
#[cfg(any(mobile, test))]
use omnileaf_icon_actions::IconShortcut;
use serde::Deserialize;
use specta::Type;
use tauri::{AppHandle, ipc::Channel};

#[cfg(target_os = "android")]
use android as platform;
#[cfg(target_os = "android")]
pub(crate) use android::plugin;
#[cfg(target_os = "ios")]
use ios as platform;

use crate::ipc_error::IpcError;

#[derive(Clone, Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    all(desktop, not(test)),
    expect(dead_code, reason = "only phones have an icon to long-press")
)]
pub(crate) struct IconActionsMenu {
    screenshot_mode: String,
    screenshot_mode_state: String,
    screenshot_mode_with_state: String,
    continue_reading: String,
    search_library: String,
}

#[cfg(any(mobile, test))]
fn shortcuts(menu: &IconActionsMenu) -> Vec<IconShortcut> {
    vec![
        IconShortcut {
            action: IconAction::ScreenshotMode,
            title: menu.screenshot_mode.clone(),
            state: Some(menu.screenshot_mode_state.clone()),
            title_with_state: menu.screenshot_mode_with_state.clone(),
        },
        stateless(IconAction::ContinueReading, &menu.continue_reading),
        stateless(IconAction::SearchLibrary, &menu.search_library),
    ]
}

#[cfg(any(mobile, test))]
fn stateless(action: IconAction, title: &str) -> IconShortcut {
    IconShortcut {
        action,
        title: title.to_owned(),
        state: None,
        title_with_state: title.to_owned(),
    }
}

#[cfg(mobile)]
pub(crate) async fn show(app: &AppHandle, menu: &IconActionsMenu) -> Result<(), IpcError> {
    platform::show(app, &shortcuts(menu))
        .await
        .map_err(|error| IpcError::internal(&error))
}

#[cfg(mobile)]
pub(crate) async fn watch(app: &AppHandle, on_chosen: Channel<IconAction>) -> Result<(), IpcError> {
    platform::watch(app, on_chosen)
        .await
        .map_err(|error| IpcError::internal(&error))
}

#[cfg(desktop)]
#[expect(
    clippy::unused_async,
    reason = "only phones wait for the icon's shortcuts to be shown"
)]
pub(crate) async fn show(_app: &AppHandle, _menu: &IconActionsMenu) -> Result<(), IpcError> {
    Ok(())
}

#[cfg(desktop)]
#[expect(
    clippy::unused_async,
    reason = "only phones wait for the icon's shortcuts to be watched"
)]
pub(crate) async fn watch(
    _app: &AppHandle,
    _on_chosen: Channel<IconAction>,
) -> Result<(), IpcError> {
    Ok(())
}

#[cfg(target_os = "android")]
mod android {
    use omnileaf_icon_actions::{IconAction, IconShortcut};
    use serde::Serialize;
    use tauri::{
        AppHandle, Manager, State, Wry,
        ipc::Channel,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    const PLUGIN_NAME: &str = "icon-actions";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "IconActionsPlugin";
    const SHOW: &str = "show";
    const WATCH: &str = "watch";

    struct AppShortcuts(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    pub(super) enum AppShortcutsError {
        #[error("the icon actions plugin is not registered")]
        NotRegistered,
        #[error("hand the icon's shortcuts to Android")]
        Plugin(#[from] PluginInvokeError),
    }

    #[derive(Serialize)]
    struct Shown<'a> {
        shortcuts: &'a [IconShortcut],
    }

    #[derive(Serialize)]
    struct Watching {
        channel: Channel<IconAction>,
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(AppShortcuts(handle));
                Ok(())
            })
            .build()
    }

    fn registered(app: &AppHandle) -> Result<State<'_, AppShortcuts>, AppShortcutsError> {
        app.try_state::<AppShortcuts>()
            .ok_or(AppShortcutsError::NotRegistered)
    }

    pub(super) async fn show(
        app: &AppHandle,
        shortcuts: &[IconShortcut],
    ) -> Result<(), AppShortcutsError> {
        registered(app)?
            .0
            .run_mobile_plugin_async::<()>(SHOW, Shown { shortcuts })
            .await?;
        Ok(())
    }

    pub(super) async fn watch(
        app: &AppHandle,
        channel: Channel<IconAction>,
    ) -> Result<(), AppShortcutsError> {
        registered(app)?
            .0
            .run_mobile_plugin_async::<()>(WATCH, Watching { channel })
            .await?;
        Ok(())
    }
}

#[cfg(target_os = "ios")]
mod ios {
    use omnileaf_icon_actions::{IconAction, IconActions, IconShortcut};
    use tauri::{AppHandle, Manager, Wry, ipc::Channel, plugin::mobile::PluginInvokeError};

    #[derive(Debug, thiserror::Error)]
    pub(super) enum QuickActionsError {
        #[error("the icon actions plugin is not registered")]
        NotRegistered,
        #[error("hand the icon's quick actions to iOS")]
        Plugin(#[from] PluginInvokeError),
    }

    fn registered(
        app: &AppHandle,
    ) -> Result<tauri::State<'_, IconActions<Wry>>, QuickActionsError> {
        app.try_state::<IconActions<Wry>>()
            .ok_or(QuickActionsError::NotRegistered)
    }

    pub(super) async fn show(
        app: &AppHandle,
        shortcuts: &[IconShortcut],
    ) -> Result<(), QuickActionsError> {
        registered(app)?.show(shortcuts).await?;
        Ok(())
    }

    pub(super) async fn watch(
        app: &AppHandle,
        channel: Channel<IconAction>,
    ) -> Result<(), QuickActionsError> {
        registered(app)?.watch(channel).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn menu() -> IconActionsMenu {
        IconActionsMenu {
            screenshot_mode: "Screenshot mode".to_owned(),
            screenshot_mode_state: "Off".to_owned(),
            screenshot_mode_with_state: "Screenshot mode · Off".to_owned(),
            continue_reading: "Continue reading".to_owned(),
            search_library: "Search the library".to_owned(),
        }
    }

    #[test]
    fn lists_screenshot_mode_with_its_state_then_continue_reading_and_search() {
        let listed = shortcuts(&menu());

        assert_eq!(
            listed,
            vec![
                IconShortcut {
                    action: IconAction::ScreenshotMode,
                    title: "Screenshot mode".to_owned(),
                    state: Some("Off".to_owned()),
                    title_with_state: "Screenshot mode · Off".to_owned(),
                },
                IconShortcut {
                    action: IconAction::ContinueReading,
                    title: "Continue reading".to_owned(),
                    state: None,
                    title_with_state: "Continue reading".to_owned(),
                },
                IconShortcut {
                    action: IconAction::SearchLibrary,
                    title: "Search the library".to_owned(),
                    state: None,
                    title_with_state: "Search the library".to_owned(),
                },
            ]
        );
    }
}
