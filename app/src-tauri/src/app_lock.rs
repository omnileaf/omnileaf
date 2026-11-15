use serde::{Deserialize, Serialize};
use specta::Type;

#[cfg(target_os = "android")]
pub(crate) use android::{choose_lock_after, hide_content, plugin, read, turn_off, turn_on};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum LockAfter {
    Immediately,
    OneMinute,
    FiveMinutes,
    FifteenMinutes,
    ThirtyMinutes,
    OneHour,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AppLock {
    is_on: bool,
    lock_after: LockAfter,
    hides_content: bool,
    can_hide_content: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AppLockTurning {
    TurnedOn,
    NotConfirmed,
    NoScreenLock,
}

#[cfg(not(target_os = "android"))]
pub(crate) use elsewhere::{choose_lock_after, hide_content, read, turn_off, turn_on};

#[cfg(not(target_os = "android"))]
mod elsewhere {
    use super::{AppLock, AppLockTurning, LockAfter};
    use crate::ipc_error::IpcError;

    pub(crate) async fn read(_app: &tauri::AppHandle) -> Result<AppLock, IpcError> {
        Err(IpcError::app_lock_unavailable())
    }

    pub(crate) async fn turn_on(
        _app: &tauri::AppHandle,
        _prompt_title: &str,
    ) -> Result<AppLockTurning, IpcError> {
        Err(IpcError::app_lock_unavailable())
    }

    pub(crate) async fn turn_off(_app: &tauri::AppHandle) -> Result<(), IpcError> {
        Err(IpcError::app_lock_unavailable())
    }

    pub(crate) async fn choose_lock_after(
        _app: &tauri::AppHandle,
        _lock_after: LockAfter,
    ) -> Result<(), IpcError> {
        Err(IpcError::app_lock_unavailable())
    }

    pub(crate) async fn hide_content(
        _app: &tauri::AppHandle,
        _is_hidden: bool,
    ) -> Result<(), IpcError> {
        Err(IpcError::app_lock_unavailable())
    }
}

#[cfg(target_os = "android")]
mod android {
    use std::time::Duration;

    use serde::{Deserialize, Serialize};
    use tauri::{
        AppHandle, Manager, Wry,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use super::{AppLock, AppLockTurning, LockAfter};
    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "app-lock";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "AppLockPlugin";
    const READ: &str = "read";
    const TURN_ON: &str = "turnOn";
    const TURN_OFF: &str = "turnOff";
    const CHOOSE_LOCK_AFTER: &str = "chooseLockAfter";
    const HIDE_CONTENT: &str = "hideContent";
    const PLUGIN_TIMEOUT: Duration = Duration::from_secs(2);

    struct AppLockPlugin(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum AppLockError {
        #[error("the app lock plugin is not registered")]
        NotRegistered,
        #[error("ask Android's app lock")]
        Plugin(#[from] PluginInvokeError),
        #[error("Android took too long to answer for the app lock")]
        TimedOut,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ChosenDelay {
        lock_after: LockAfter,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct ConfirmingPrompt<'a> {
        title: &'a str,
    }

    #[derive(Deserialize)]
    #[serde(rename_all = "camelCase")]
    struct Turned {
        turning: AppLockTurning,
    }

    #[derive(Serialize)]
    #[serde(rename_all = "camelCase")]
    struct HiddenContent {
        is_hidden: bool,
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(AppLockPlugin(handle));
                Ok(())
            })
            .build()
    }

    pub(crate) async fn read(app: &AppHandle) -> Result<AppLock, IpcError> {
        ask_soon(app, READ, ())
            .await
            .map_err(|error| IpcError::internal(&error))
    }

    pub(crate) async fn turn_on(
        app: &AppHandle,
        prompt_title: &str,
    ) -> Result<AppLockTurning, IpcError> {
        ask::<Turned>(
            app,
            TURN_ON,
            ConfirmingPrompt {
                title: prompt_title,
            },
        )
        .await
        .map(|turned| turned.turning)
        .map_err(|error| IpcError::internal(&error))
    }

    pub(crate) async fn turn_off(app: &AppHandle) -> Result<(), IpcError> {
        ask_soon(app, TURN_OFF, ())
            .await
            .map_err(|error| IpcError::internal(&error))
    }

    pub(crate) async fn choose_lock_after(
        app: &AppHandle,
        lock_after: LockAfter,
    ) -> Result<(), IpcError> {
        ask_soon(app, CHOOSE_LOCK_AFTER, ChosenDelay { lock_after })
            .await
            .map_err(|error| IpcError::internal(&error))
    }

    pub(crate) async fn hide_content(app: &AppHandle, is_hidden: bool) -> Result<(), IpcError> {
        ask_soon(app, HIDE_CONTENT, HiddenContent { is_hidden })
            .await
            .map_err(|error| IpcError::internal(&error))
    }

    async fn ask<T: serde::de::DeserializeOwned>(
        app: &AppHandle,
        command: &str,
        args: impl Serialize,
    ) -> Result<T, AppLockError> {
        let plugin = app
            .try_state::<AppLockPlugin>()
            .ok_or(AppLockError::NotRegistered)?;
        Ok(plugin.0.run_mobile_plugin_async::<T>(command, args).await?)
    }

    async fn ask_soon<T: serde::de::DeserializeOwned>(
        app: &AppHandle,
        command: &str,
        args: impl Serialize,
    ) -> Result<T, AppLockError> {
        tokio::time::timeout(PLUGIN_TIMEOUT, ask(app, command, args))
            .await
            .map_err(|_elapsed| AppLockError::TimedOut)?
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn names_each_delay_as_the_android_side_reads_it() {
        let names = [
            LockAfter::Immediately,
            LockAfter::OneMinute,
            LockAfter::FiveMinutes,
            LockAfter::FifteenMinutes,
            LockAfter::ThirtyMinutes,
            LockAfter::OneHour,
        ]
        .map(|delay| serde_json::to_value(delay).unwrap());

        assert_eq!(
            names,
            [
                "immediately",
                "oneMinute",
                "fiveMinutes",
                "fifteenMinutes",
                "thirtyMinutes",
                "oneHour"
            ]
            .map(serde_json::Value::from)
        );
    }

    #[test]
    fn reads_the_lock_as_the_android_side_writes_it() {
        let written = serde_json::json!({
            "isOn": true,
            "lockAfter": "fiveMinutes",
            "hidesContent": false,
            "canHideContent": true,
        });

        let lock: AppLock = serde_json::from_value(written).unwrap();

        assert_eq!(
            lock,
            AppLock {
                is_on: true,
                lock_after: LockAfter::FiveMinutes,
                hides_content: false,
                can_hide_content: true,
            }
        );
    }
}
