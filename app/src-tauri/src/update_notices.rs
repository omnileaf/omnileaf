use serde::{Deserialize, Serialize};
use specta::Type;

#[cfg(not(target_os = "android"))]
pub(crate) use elsewhere::{read, remember_words, turn_off, turn_on};

#[cfg(target_os = "android")]
pub(crate) use android::{plugin, read, remember_words, turn_off, turn_on};

const VERSION_PLACEHOLDER: &str = "{version}";

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateNotices {
    is_on: bool,
    can_show: bool,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum UpdateNoticeTurning {
    TurnedOn,
    Refused,
    Blocked,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateNoticeWords {
    channel: String,
    title: String,
    view_release: String,
    skip: String,
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android posts update notices")
)]
impl UpdateNoticeWords {
    fn complete(self) -> Option<Self> {
        let lines = [&self.channel, &self.title, &self.view_release, &self.skip];
        let has_every_line = lines.iter().all(|line| !line.trim().is_empty());
        (has_every_line && self.title.contains(VERSION_PLACEHOLDER)).then_some(self)
    }
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android posts update notices")
)]
#[derive(Debug, Deserialize)]
struct Turned {
    turning: UpdateNoticeTurning,
}

#[cfg(not(target_os = "android"))]
mod elsewhere {
    use tauri::{AppHandle, Runtime};

    use super::{UpdateNoticeTurning, UpdateNoticeWords, UpdateNotices};
    use crate::ipc_error::IpcError;

    pub(crate) async fn read<R: Runtime>(_app: &AppHandle<R>) -> Result<UpdateNotices, IpcError> {
        Err(IpcError::update_check_unavailable())
    }

    pub(crate) async fn turn_on<R: Runtime>(
        _app: &AppHandle<R>,
    ) -> Result<UpdateNoticeTurning, IpcError> {
        Err(IpcError::update_check_unavailable())
    }

    pub(crate) async fn turn_off<R: Runtime>(_app: &AppHandle<R>) -> Result<(), IpcError> {
        Err(IpcError::update_check_unavailable())
    }

    pub(crate) async fn remember_words<R: Runtime>(
        _app: &AppHandle<R>,
        _words: UpdateNoticeWords,
    ) -> Result<(), IpcError> {
        Err(IpcError::update_check_unavailable())
    }
}

#[cfg(target_os = "android")]
mod android {
    use std::time::Duration;

    use serde::{Serialize, de::DeserializeOwned};
    use tauri::{
        AppHandle, Manager, Wry,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use super::{Turned, UpdateNoticeTurning, UpdateNoticeWords, UpdateNotices};
    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "update-notices";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "UpdateNoticesPlugin";
    const READ: &str = "read";
    const TURN_ON: &str = "turnOn";
    const TURN_OFF: &str = "turnOff";
    const REMEMBER_WORDS: &str = "rememberWords";
    const ANSWER_TIMEOUT: Duration = Duration::from_secs(2);

    struct UpdateNoticesPlugin(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum UpdateNoticesError {
        #[error("ask Android's update notices")]
        Plugin(#[from] PluginInvokeError),
        #[error("Android's update notices took too long to answer")]
        TimedOut,
        #[error("the update notice needs all of its words and a place for the version")]
        IncompleteWords,
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(UpdateNoticesPlugin(handle));
                Ok(())
            })
            .build()
    }

    pub(crate) async fn read(app: &AppHandle) -> Result<UpdateNotices, IpcError> {
        ask_soon(app, READ, ()).await
    }

    pub(crate) async fn turn_on(app: &AppHandle) -> Result<UpdateNoticeTurning, IpcError> {
        let plugin = registered(app)?;
        plugin
            .0
            .run_mobile_plugin_async::<Turned>(TURN_ON, ())
            .await
            .map(|turned| turned.turning)
            .map_err(|error| IpcError::internal(&UpdateNoticesError::from(error)))
    }

    pub(crate) async fn turn_off(app: &AppHandle) -> Result<(), IpcError> {
        ask_soon(app, TURN_OFF, ()).await
    }

    pub(crate) async fn remember_words(
        app: &AppHandle,
        words: UpdateNoticeWords,
    ) -> Result<(), IpcError> {
        let words = words
            .complete()
            .ok_or_else(|| IpcError::internal(&UpdateNoticesError::IncompleteWords))?;
        ask_soon(app, REMEMBER_WORDS, words).await
    }

    fn registered(app: &AppHandle) -> Result<tauri::State<'_, UpdateNoticesPlugin>, IpcError> {
        app.try_state::<UpdateNoticesPlugin>()
            .ok_or_else(IpcError::update_check_unavailable)
    }

    async fn ask_soon<T: DeserializeOwned>(
        app: &AppHandle,
        command: &str,
        args: impl Serialize,
    ) -> Result<T, IpcError> {
        let plugin = registered(app)?;
        tokio::time::timeout(
            ANSWER_TIMEOUT,
            plugin.0.run_mobile_plugin_async::<T>(command, args),
        )
        .await
        .map_err(|_elapsed| UpdateNoticesError::TimedOut)
        .and_then(|answer| answer.map_err(UpdateNoticesError::from))
        .map_err(|error| IpcError::internal(&error))
    }
}

#[cfg(test)]
fn sample_words() -> UpdateNoticeWords {
    UpdateNoticeWords {
        channel: "Updates".into(),
        title: "Omnileaf {version} is available".into(),
        view_release: "View release".into(),
        skip: "Skip this version".into(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_whether_notices_are_on_and_can_show() {
        let sent = serde_json::json!({ "isOn": true, "canShow": false });

        let read: UpdateNotices = serde_json::from_value(sent).unwrap();

        assert_eq!(
            read,
            UpdateNotices {
                is_on: true,
                can_show: false,
            }
        );
    }

    #[test]
    fn reads_each_answer_android_gives_to_turning_on() {
        let answers = ["turnedOn", "refused", "blocked"]
            .map(|turning| serde_json::json!({ "turning": turning }))
            .map(|sent| serde_json::from_value::<Turned>(sent).unwrap().turning);

        assert_eq!(
            answers,
            [
                UpdateNoticeTurning::TurnedOn,
                UpdateNoticeTurning::Refused,
                UpdateNoticeTurning::Blocked,
            ]
        );
    }

    #[test]
    fn sends_the_words_under_the_keys_android_reads() {
        let sent = serde_json::to_value(sample_words()).unwrap();

        assert_eq!(
            sent,
            serde_json::json!({
                "channel": "Updates",
                "title": "Omnileaf {version} is available",
                "viewRelease": "View release",
                "skip": "Skip this version",
            })
        );
    }

    #[test]
    fn takes_words_only_when_every_line_has_text_and_the_title_names_the_version() {
        let blank_skip = UpdateNoticeWords {
            skip: " ".into(),
            ..sample_words()
        };
        let unnamed_version = UpdateNoticeWords {
            title: "A new Omnileaf is available".into(),
            ..sample_words()
        };

        assert_eq!(
            [
                sample_words().complete(),
                blank_skip.complete(),
                unnamed_version.complete()
            ],
            [Some(sample_words()), None, None]
        );
    }
}

#[cfg(all(test, not(target_os = "android")))]
mod elsewhere_tests {
    use crate::ipc_error::IpcError;

    #[test]
    fn refuses_every_update_notice_command_off_android() {
        let app = tauri::test::mock_app();
        let app = app.handle();
        let words = super::sample_words();

        let answers = tauri::async_runtime::block_on(async {
            [
                super::read(app).await.err(),
                super::turn_on(app).await.err(),
                super::turn_off(app).await.err(),
                super::remember_words(app, words).await.err(),
            ]
        });

        assert_eq!(
            answers,
            [(); 4].map(|()| Some(IpcError::update_check_unavailable()))
        );
    }
}
