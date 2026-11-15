use serde::{Deserialize, Serialize};
use specta::Type;

#[cfg(target_os = "android")]
pub(crate) use android::{plugin, read};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum SystemClock {
    FollowsLanguage,
    TwelveHour,
    TwentyFourHour,
}

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "only Android waits for the clock its settings name"
)]
pub(crate) async fn read(
    _app: &tauri::AppHandle,
) -> Result<SystemClock, crate::ipc_error::IpcError> {
    Ok(SystemClock::FollowsLanguage)
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android reads its clock natively")
)]
#[derive(Debug, Deserialize)]
struct ClockReading {
    clock: SystemClock,
}

#[cfg(target_os = "android")]
mod android {
    use std::time::Duration;

    use tauri::{
        AppHandle, Manager, Wry,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use super::{ClockReading, SystemClock};
    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "system-clock";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "SystemClockPlugin";
    const READ: &str = "read";
    const PLUGIN_TIMEOUT: Duration = Duration::from_secs(2);

    struct SystemClockPlugin(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum SystemClockError {
        #[error("the system clock plugin is not registered")]
        NotRegistered,
        #[error("read whether Android's clock is 12-hour or 24-hour")]
        Plugin(#[from] PluginInvokeError),
        #[error("Android took too long to say whether its clock is 12-hour or 24-hour")]
        TimedOut,
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(SystemClockPlugin(handle));
                Ok(())
            })
            .build()
    }

    pub(crate) async fn read(app: &AppHandle) -> Result<SystemClock, IpcError> {
        ask(app)
            .await
            .map(|reading| reading.clock)
            .map_err(|error| IpcError::internal(&error))
    }

    async fn ask(app: &AppHandle) -> Result<ClockReading, SystemClockError> {
        let plugin = app
            .try_state::<SystemClockPlugin>()
            .ok_or(SystemClockError::NotRegistered)?;
        Ok(tokio::time::timeout(
            PLUGIN_TIMEOUT,
            plugin.0.run_mobile_plugin_async::<ClockReading>(READ, ()),
        )
        .await
        .map_err(|_elapsed| SystemClockError::TimedOut)??)
    }
}

#[cfg(test)]
mod tests {
    use super::{ClockReading, SystemClock};

    #[test]
    fn reads_the_24_hour_clock_android_sends() {
        let sent = serde_json::json!({ "clock": "twentyFourHour" });

        let reading: ClockReading = serde_json::from_value(sent).unwrap();

        assert_eq!(reading.clock, SystemClock::TwentyFourHour);
    }

    #[test]
    fn reads_the_12_hour_clock_android_sends() {
        let sent = serde_json::json!({ "clock": "twelveHour" });

        let reading: ClockReading = serde_json::from_value(sent).unwrap();

        assert_eq!(reading.clock, SystemClock::TwelveHour);
    }
}
