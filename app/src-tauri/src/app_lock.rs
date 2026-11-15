use serde::{Deserialize, Serialize};
use specta::Type;

#[cfg(target_os = "android")]
pub(crate) use android::{
    choose_lock_after, hide_content_in_recents, plugin, read, remember_words, turn_off, turn_on,
};

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
    hides_content_in_recents: bool,
    can_hide_content_in_recents: bool,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct LockWords {
    title: String,
    body: String,
    unlock: String,
    prompt: String,
    no_screen_lock: String,
    no_screen_lock_body: String,
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android shows a lock screen")
)]
impl LockWords {
    fn is_complete(&self) -> bool {
        [
            &self.title,
            &self.body,
            &self.unlock,
            &self.prompt,
            &self.no_screen_lock,
            &self.no_screen_lock_body,
        ]
        .iter()
        .all(|line| !line.trim().is_empty())
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum AppLockTurning {
    TurnedOn,
    NotConfirmed,
    NoScreenLock,
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android asks its app lock natively")
)]
#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
struct ConfirmingPrompt<'a> {
    title: &'a str,
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android asks its app lock natively")
)]
impl<'a> ConfirmingPrompt<'a> {
    fn titled(title: &'a str) -> Option<Self> {
        (!title.trim().is_empty()).then_some(Self { title })
    }
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android asks its app lock natively")
)]
#[derive(Debug, Deserialize)]
struct Turned {
    turning: AppLockTurning,
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android asks its app lock natively")
)]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ChosenDelay {
    lock_after: LockAfter,
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android asks its app lock natively")
)]
#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct HiddenInRecents {
    is_hidden: bool,
}

#[cfg(not(target_os = "android"))]
#[expect(clippy::unused_async, reason = "only Android waits for its app lock")]
pub(crate) async fn read(_app: &tauri::AppHandle) -> Result<AppLock, crate::ipc_error::IpcError> {
    Err(crate::ipc_error::IpcError::app_lock_unavailable())
}

#[cfg(not(target_os = "android"))]
#[expect(clippy::unused_async, reason = "only Android waits for its app lock")]
pub(crate) async fn turn_on(
    _app: &tauri::AppHandle,
    _prompt_title: &str,
) -> Result<AppLockTurning, crate::ipc_error::IpcError> {
    Err(crate::ipc_error::IpcError::app_lock_unavailable())
}

#[cfg(not(target_os = "android"))]
#[expect(clippy::unused_async, reason = "only Android waits for its app lock")]
pub(crate) async fn remember_words(
    _app: &tauri::AppHandle,
    _words: LockWords,
) -> Result<(), crate::ipc_error::IpcError> {
    Err(crate::ipc_error::IpcError::app_lock_unavailable())
}

#[cfg(not(target_os = "android"))]
#[expect(clippy::unused_async, reason = "only Android waits for its app lock")]
pub(crate) async fn turn_off(_app: &tauri::AppHandle) -> Result<(), crate::ipc_error::IpcError> {
    Err(crate::ipc_error::IpcError::app_lock_unavailable())
}

#[cfg(not(target_os = "android"))]
#[expect(clippy::unused_async, reason = "only Android waits for its app lock")]
pub(crate) async fn choose_lock_after(
    _app: &tauri::AppHandle,
    _lock_after: LockAfter,
) -> Result<(), crate::ipc_error::IpcError> {
    Err(crate::ipc_error::IpcError::app_lock_unavailable())
}

#[cfg(not(target_os = "android"))]
#[expect(clippy::unused_async, reason = "only Android waits for its app lock")]
pub(crate) async fn hide_content_in_recents(
    _app: &tauri::AppHandle,
    _is_hidden: bool,
) -> Result<(), crate::ipc_error::IpcError> {
    Err(crate::ipc_error::IpcError::app_lock_unavailable())
}

#[cfg(target_os = "android")]
mod android {
    use std::time::Duration;

    use serde::{Serialize, de::DeserializeOwned};
    use tauri::{
        AppHandle, Manager, Wry,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use super::{
        AppLock, AppLockTurning, ChosenDelay, ConfirmingPrompt, HiddenInRecents, LockAfter,
        LockWords, Turned,
    };
    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "app-lock";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "AppLockPlugin";
    const READ: &str = "read";
    const TURN_ON: &str = "turnOn";
    const TURN_OFF: &str = "turnOff";
    const REMEMBER_WORDS: &str = "rememberWords";
    const CHOOSE_LOCK_AFTER: &str = "chooseLockAfter";
    const HIDE_CONTENT_IN_RECENTS: &str = "hideContentInRecents";
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
        #[error("the prompt to turn the app lock on needs a title")]
        UntitledPrompt,
        #[error("the lock screen needs all of its words")]
        IncompleteWords,
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
        ask_soon(app, READ, ()).await
    }

    pub(crate) async fn turn_on(
        app: &AppHandle,
        prompt_title: &str,
    ) -> Result<AppLockTurning, IpcError> {
        let prompt = ConfirmingPrompt::titled(prompt_title)
            .ok_or_else(|| IpcError::internal(&AppLockError::UntitledPrompt))?;
        ask::<Turned>(app, TURN_ON, prompt)
            .await
            .map(|turned| turned.turning)
    }

    pub(crate) async fn remember_words(app: &AppHandle, words: LockWords) -> Result<(), IpcError> {
        if !words.is_complete() {
            return Err(IpcError::internal(&AppLockError::IncompleteWords));
        }
        ask_soon(app, REMEMBER_WORDS, words).await
    }

    pub(crate) async fn turn_off(app: &AppHandle) -> Result<(), IpcError> {
        ask_soon(app, TURN_OFF, ()).await
    }

    pub(crate) async fn choose_lock_after(
        app: &AppHandle,
        lock_after: LockAfter,
    ) -> Result<(), IpcError> {
        ask_soon(app, CHOOSE_LOCK_AFTER, ChosenDelay { lock_after }).await
    }

    pub(crate) async fn hide_content_in_recents(
        app: &AppHandle,
        is_hidden: bool,
    ) -> Result<(), IpcError> {
        ask_soon(app, HIDE_CONTENT_IN_RECENTS, HiddenInRecents { is_hidden }).await
    }

    async fn ask<T: DeserializeOwned>(
        app: &AppHandle,
        command: &str,
        args: impl Serialize,
    ) -> Result<T, IpcError> {
        asked(app, command, args)
            .await
            .map_err(|error| IpcError::internal(&error))
    }

    async fn ask_soon<T: DeserializeOwned>(
        app: &AppHandle,
        command: &str,
        args: impl Serialize,
    ) -> Result<T, IpcError> {
        tokio::time::timeout(PLUGIN_TIMEOUT, asked(app, command, args))
            .await
            .map_err(|_elapsed| AppLockError::TimedOut)
            .flatten()
            .map_err(|error| IpcError::internal(&error))
    }

    async fn asked<T: DeserializeOwned>(
        app: &AppHandle,
        command: &str,
        args: impl Serialize,
    ) -> Result<T, AppLockError> {
        let plugin = app
            .try_state::<AppLockPlugin>()
            .ok_or(AppLockError::NotRegistered)?;
        Ok(plugin.0.run_mobile_plugin_async::<T>(command, args).await?)
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
            "hidesContentInRecents": false,
            "canHideContentInRecents": true,
        });

        let lock: AppLock = serde_json::from_value(written).unwrap();

        assert_eq!(
            lock,
            AppLock {
                is_on: true,
                lock_after: LockAfter::FiveMinutes,
                hides_content_in_recents: false,
                can_hide_content_in_recents: true,
            }
        );
    }

    #[test]
    fn reads_each_answer_the_android_side_gives_to_turning_on() {
        let answers = ["turnedOn", "notConfirmed", "noScreenLock"]
            .map(|turning| serde_json::json!({ "turning": turning }))
            .map(|sent| serde_json::from_value::<Turned>(sent).unwrap().turning);

        assert_eq!(
            answers,
            [
                AppLockTurning::TurnedOn,
                AppLockTurning::NotConfirmed,
                AppLockTurning::NoScreenLock
            ]
        );
    }

    #[test]
    fn sends_the_keys_the_android_side_reads() {
        let sent = [
            serde_json::to_value(ConfirmingPrompt::titled("Turn on app lock")).unwrap(),
            serde_json::to_value(ChosenDelay {
                lock_after: LockAfter::OneHour,
            })
            .unwrap(),
            serde_json::to_value(HiddenInRecents { is_hidden: true }).unwrap(),
            serde_json::to_value(words()).unwrap(),
        ];

        assert_eq!(
            sent,
            [
                serde_json::json!({ "title": "Turn on app lock" }),
                serde_json::json!({ "lockAfter": "oneHour" }),
                serde_json::json!({ "isHidden": true }),
                serde_json::json!({
                    "title": "Omnileaf is locked",
                    "body": "Unlock to open your library.",
                    "unlock": "Unlock",
                    "prompt": "Unlock Omnileaf",
                    "noScreenLock": "Set a screen lock on this phone first",
                    "noScreenLockBody": "Android needs a PIN, pattern or password before Omnileaf can lock.",
                }),
            ]
        );
    }

    fn words() -> LockWords {
        LockWords {
            title: "Omnileaf is locked".into(),
            body: "Unlock to open your library.".into(),
            unlock: "Unlock".into(),
            prompt: "Unlock Omnileaf".into(),
            no_screen_lock: "Set a screen lock on this phone first".into(),
            no_screen_lock_body:
                "Android needs a PIN, pattern or password before Omnileaf can lock.".into(),
        }
    }

    #[test]
    fn takes_lock_words_only_when_every_line_has_text() {
        let blank_prompt = LockWords {
            prompt: "  ".into(),
            ..words()
        };

        assert_eq!(
            [words().is_complete(), blank_prompt.is_complete()],
            [true, false]
        );
    }

    #[test]
    fn refuses_a_prompt_without_a_title() {
        let prompts = ["", "   "].map(ConfirmingPrompt::titled);

        assert_eq!(prompts, [None, None]);
    }
}
