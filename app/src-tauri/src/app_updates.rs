use std::time::Duration;

use serde::{Deserialize, Serialize};
use specta::Type;

#[cfg(not(target_os = "android"))]
pub(crate) use elsewhere::{
    check, check_if_due, open_release_page, set_automatic, skip, snooze, status,
};

#[cfg(target_os = "android")]
pub(crate) use android::{
    check, check_if_due, open_release_page, plugin, set_automatic, skip, snooze, status,
};

#[cfg_attr(
    not(target_os = "android"),
    expect(dead_code, reason = "only Android checks for updates")
)]
const ANSWER_TIMEOUT: Duration = Duration::from_secs(2);

const LONGEST_RELEASE_FETCH: Duration = Duration::from_secs(30);

const CHECKS_QUEUED_AT_MOST: u32 = 2;

const CHECK_MARGIN: Duration = Duration::from_secs(10);

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android checks for updates")
)]
const CHECK_TIMEOUT: Duration = LONGEST_RELEASE_FETCH
    .saturating_mul(CHECKS_QUEUED_AT_MOST)
    .saturating_add(CHECK_MARGIN);

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum UpdateNotice {
    Shown,
    Snoozed,
    Skipped,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct NewerRelease {
    version: String,
    headline: Option<String>,
    release_page: Option<String>,
    notice: UpdateNotice,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub(crate) enum KnownRelease {
    Unchecked,
    UpToDate,
    Newer(NewerRelease),
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct UpdateStatus {
    is_automatic: bool,
    release: KnownRelease,
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android checks for updates")
)]
impl UpdateStatus {
    fn release_page(&self) -> Option<&str> {
        match &self.release {
            KnownRelease::Newer(newer) => newer.release_page.as_deref(),
            KnownRelease::Unchecked | KnownRelease::UpToDate => None,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum CheckOutcome {
    UpToDate,
    Available,
    Offline,
    RateLimited,
    Failed,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) struct CheckedForUpdates {
    outcome: Option<CheckOutcome>,
    status: UpdateStatus,
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android checks for updates")
)]
#[derive(Debug, Serialize)]
struct AutomaticCheck {
    automatic: bool,
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android checks for updates")
)]
#[derive(Debug, Serialize)]
struct ChosenVersion<'a> {
    version: &'a str,
}

#[cfg(not(target_os = "android"))]
mod elsewhere {
    use tauri::{AppHandle, Runtime};

    use super::{CheckedForUpdates, UpdateStatus};
    use crate::ipc_error::IpcError;

    pub(crate) async fn status<R: Runtime>(_app: &AppHandle<R>) -> Result<UpdateStatus, IpcError> {
        Err(IpcError::update_check_unavailable())
    }

    pub(crate) async fn check<R: Runtime>(
        _app: &AppHandle<R>,
    ) -> Result<CheckedForUpdates, IpcError> {
        Err(IpcError::update_check_unavailable())
    }

    pub(crate) async fn check_if_due<R: Runtime>(
        _app: &AppHandle<R>,
    ) -> Result<CheckedForUpdates, IpcError> {
        Err(IpcError::update_check_unavailable())
    }

    pub(crate) async fn set_automatic<R: Runtime>(
        _app: &AppHandle<R>,
        _is_on: bool,
    ) -> Result<UpdateStatus, IpcError> {
        Err(IpcError::update_check_unavailable())
    }

    pub(crate) async fn snooze<R: Runtime>(
        _app: &AppHandle<R>,
        _version: &str,
    ) -> Result<UpdateStatus, IpcError> {
        Err(IpcError::update_check_unavailable())
    }

    pub(crate) async fn skip<R: Runtime>(
        _app: &AppHandle<R>,
        _version: &str,
    ) -> Result<UpdateStatus, IpcError> {
        Err(IpcError::update_check_unavailable())
    }

    pub(crate) async fn open_release_page<R: Runtime>(_app: &AppHandle<R>) -> Result<(), IpcError> {
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
    use tauri_plugin_opener::OpenerExt;

    use super::{
        ANSWER_TIMEOUT, AutomaticCheck, CHECK_TIMEOUT, CheckedForUpdates, ChosenVersion,
        UpdateStatus,
    };
    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "updates";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "UpdatesPlugin";
    const STATUS: &str = "status";
    const CHECK: &str = "check";
    const CHECK_IF_DUE: &str = "checkIfDue";
    const SET_AUTOMATIC: &str = "setAutomatic";
    const SNOOZE: &str = "snooze";
    const SKIP: &str = "skip";

    struct UpdatesPlugin(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum UpdatesError {
        #[error("ask Android's update check")]
        Plugin(#[from] PluginInvokeError),
        #[error("Android's update check took too long to answer")]
        TimedOut,
        #[error("no newer release has a page to open")]
        NoReleasePage,
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(UpdatesPlugin(handle));
                Ok(())
            })
            .build()
    }

    pub(crate) async fn status(app: &AppHandle) -> Result<UpdateStatus, IpcError> {
        ask(app, STATUS, (), ANSWER_TIMEOUT).await
    }

    pub(crate) async fn check(app: &AppHandle) -> Result<CheckedForUpdates, IpcError> {
        ask(app, CHECK, (), CHECK_TIMEOUT).await
    }

    pub(crate) async fn check_if_due(app: &AppHandle) -> Result<CheckedForUpdates, IpcError> {
        ask(app, CHECK_IF_DUE, (), CHECK_TIMEOUT).await
    }

    pub(crate) async fn set_automatic(
        app: &AppHandle,
        is_on: bool,
    ) -> Result<UpdateStatus, IpcError> {
        let choice = AutomaticCheck { automatic: is_on };
        ask(app, SET_AUTOMATIC, choice, ANSWER_TIMEOUT).await
    }

    pub(crate) async fn snooze(app: &AppHandle, version: &str) -> Result<UpdateStatus, IpcError> {
        ask(app, SNOOZE, ChosenVersion { version }, ANSWER_TIMEOUT).await
    }

    pub(crate) async fn skip(app: &AppHandle, version: &str) -> Result<UpdateStatus, IpcError> {
        ask(app, SKIP, ChosenVersion { version }, ANSWER_TIMEOUT).await
    }

    pub(crate) async fn open_release_page(app: &AppHandle) -> Result<(), IpcError> {
        let status = status(app).await?;
        let page = status
            .release_page()
            .ok_or_else(|| IpcError::internal(&UpdatesError::NoReleasePage))?;
        app.opener()
            .open_url(page, None::<&str>)
            .map_err(|error| IpcError::browser_unavailable(&error))
    }

    async fn ask<T: DeserializeOwned>(
        app: &AppHandle,
        command: &str,
        args: impl Serialize,
        timeout: Duration,
    ) -> Result<T, IpcError> {
        let plugin = app
            .try_state::<UpdatesPlugin>()
            .ok_or_else(IpcError::update_check_unavailable)?;
        tokio::time::timeout(
            timeout,
            plugin.0.run_mobile_plugin_async::<T>(command, args),
        )
        .await
        .map_err(|_elapsed| UpdatesError::TimedOut)
        .and_then(|answer| answer.map_err(UpdatesError::from))
        .map_err(|error| IpcError::internal(&error))
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn newer(release_page: Option<&str>) -> UpdateStatus {
        UpdateStatus {
            is_automatic: true,
            release: KnownRelease::Newer(NewerRelease {
                version: "0.3.0".into(),
                headline: Some("Smoother pages".into()),
                release_page: release_page.map(Into::into),
                notice: UpdateNotice::Snoozed,
            }),
        }
    }

    #[test]
    fn reads_each_status_android_sends() {
        let sent = [
            serde_json::json!({ "isAutomatic": false, "release": { "kind": "unchecked" } }),
            serde_json::json!({ "isAutomatic": true, "release": { "kind": "upToDate" } }),
            serde_json::json!({
                "isAutomatic": true,
                "release": {
                    "kind": "newer",
                    "version": "0.3.0",
                    "headline": "Smoother pages",
                    "releasePage": "https://github.com/omnileaf/omnileaf/releases/tag/v0.3.0",
                    "notice": "snoozed",
                },
            }),
        ];

        let read = sent.map(|status| serde_json::from_value::<UpdateStatus>(status).unwrap());

        assert_eq!(
            read,
            [
                UpdateStatus {
                    is_automatic: false,
                    release: KnownRelease::Unchecked,
                },
                UpdateStatus {
                    is_automatic: true,
                    release: KnownRelease::UpToDate,
                },
                newer(Some(
                    "https://github.com/omnileaf/omnileaf/releases/tag/v0.3.0"
                )),
            ]
        );
    }

    #[test]
    fn reads_a_newer_release_without_a_headline_or_a_page() {
        let sent = serde_json::json!({
            "kind": "newer",
            "version": "0.3.0-beta.1",
            "headline": null,
            "releasePage": null,
            "notice": "shown",
        });

        let read: KnownRelease = serde_json::from_value(sent).unwrap();

        assert_eq!(
            read,
            KnownRelease::Newer(NewerRelease {
                version: "0.3.0-beta.1".into(),
                headline: None,
                release_page: None,
                notice: UpdateNotice::Shown,
            })
        );
    }

    #[test]
    fn reads_each_outcome_android_sends_after_a_check() {
        let outcomes = ["upToDate", "available", "offline", "rateLimited", "failed"]
            .map(|outcome| {
                serde_json::json!({
                    "outcome": outcome,
                    "status": { "isAutomatic": false, "release": { "kind": "upToDate" } },
                })
            })
            .map(|sent| {
                serde_json::from_value::<CheckedForUpdates>(sent)
                    .unwrap()
                    .outcome
            });

        assert_eq!(
            outcomes,
            [
                Some(CheckOutcome::UpToDate),
                Some(CheckOutcome::Available),
                Some(CheckOutcome::Offline),
                Some(CheckOutcome::RateLimited),
                Some(CheckOutcome::Failed),
            ]
        );
    }

    #[test]
    fn reads_a_check_that_was_not_due() {
        let sent = serde_json::json!({
            "outcome": null,
            "status": { "isAutomatic": true, "release": { "kind": "unchecked" } },
        });

        let read: CheckedForUpdates = serde_json::from_value(sent).unwrap();

        assert_eq!(read.outcome, None);
    }

    #[test]
    fn sends_the_keys_android_reads() {
        let sent = [
            serde_json::to_value(AutomaticCheck { automatic: true }).unwrap(),
            serde_json::to_value(ChosenVersion { version: "0.3.0" }).unwrap(),
        ];

        assert_eq!(
            sent,
            [
                serde_json::json!({ "automatic": true }),
                serde_json::json!({ "version": "0.3.0" }),
            ]
        );
    }

    #[test]
    fn waits_out_a_check_queued_behind_a_due_check() {
        let two_fetches_in_a_row = LONGEST_RELEASE_FETCH * 2;

        assert!(
            CHECK_TIMEOUT > two_fetches_in_a_row,
            "{CHECK_TIMEOUT:?} gives up before {two_fetches_in_a_row:?}"
        );
    }

    #[test]
    fn opens_the_page_of_a_newer_release_only() {
        let page = "https://github.com/omnileaf/omnileaf/releases/tag/v0.3.0";
        let statuses = [
            newer(Some(page)),
            newer(None),
            UpdateStatus {
                is_automatic: true,
                release: KnownRelease::UpToDate,
            },
        ];

        let pages = statuses.each_ref().map(UpdateStatus::release_page);

        assert_eq!(pages, [Some(page), None, None]);
    }
}

#[cfg(all(test, not(target_os = "android")))]
mod elsewhere_tests {
    use crate::ipc_error::IpcError;

    #[test]
    fn refuses_every_update_command_off_android() {
        let app = tauri::test::mock_app();
        let app = app.handle();

        let answers = tauri::async_runtime::block_on(async {
            [
                super::status(app).await.err(),
                super::check(app).await.err(),
                super::check_if_due(app).await.err(),
                super::set_automatic(app, true).await.err(),
                super::snooze(app, "0.3.0").await.err(),
                super::skip(app, "0.3.0").await.err(),
                super::open_release_page(app).await.err(),
            ]
        });

        assert_eq!(
            answers,
            [(); 7].map(|()| Some(IpcError::update_check_unavailable()))
        );
    }
}
