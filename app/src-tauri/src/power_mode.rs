#[cfg(not(target_os = "linux"))]
use std::future::ready;

use omnileaf_engine::PowerMode;
use tauri::AppHandle;

#[cfg(target_os = "android")]
pub(crate) use android::plugin;

#[cfg(target_os = "linux")]
const POWER_PROFILE_DAEMONS: [(&str, &str); 2] = [
    (
        "org.freedesktop.UPower.PowerProfiles",
        "/org/freedesktop/UPower/PowerProfiles",
    ),
    ("net.hadess.PowerProfiles", "/net/hadess/PowerProfiles"),
];

#[cfg(target_os = "linux")]
const SYSTEM_BUS_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);

#[cfg(target_os = "android")]
const PLUGIN_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);

#[cfg(any(target_os = "linux", test))]
const POWER_SAVER_PROFILE: &str = "power-saver";

#[cfg(any(windows, test))]
const BATTERY_SAVER_ON: u8 = 1;

pub(crate) struct PowerModeProbe {
    #[cfg(target_os = "linux")]
    system_bus: Option<zbus::Connection>,
    #[cfg(target_os = "android")]
    app: AppHandle,
}

impl PowerModeProbe {
    #[cfg(target_os = "linux")]
    pub(crate) async fn connect(_app: &AppHandle) -> Self {
        let system_bus = match zbus::connection::Builder::system() {
            Ok(builder) => builder.method_timeout(SYSTEM_BUS_TIMEOUT).build().await,
            Err(error) => Err(error),
        };
        if let Err(error) = &system_bus {
            tracing::debug!(%error, "reach the system bus for the power profile");
        }
        Self {
            system_bus: system_bus.ok(),
        }
    }

    #[cfg(target_os = "android")]
    pub(crate) fn connect(app: &AppHandle) -> impl Future<Output = Self> {
        ready(Self { app: app.clone() })
    }

    #[cfg(not(any(target_os = "linux", target_os = "android")))]
    pub(crate) fn connect(_app: &AppHandle) -> impl Future<Output = Self> {
        ready(Self {})
    }

    #[cfg(any(target_os = "macos", target_os = "ios"))]
    #[expect(
        clippy::unused_self,
        reason = "only Linux and Android keep something to read the power mode through"
    )]
    pub(crate) fn power_mode(&self) -> impl Future<Output = PowerMode> {
        ready(
            if objc2_foundation::NSProcessInfo::processInfo().isLowPowerModeEnabled() {
                PowerMode::Saving
            } else {
                PowerMode::Normal
            },
        )
    }

    #[cfg(target_os = "linux")]
    pub(crate) async fn power_mode(&self) -> PowerMode {
        let Some(bus) = &self.system_bus else {
            return PowerMode::Normal;
        };
        for (daemon, path) in POWER_PROFILE_DAEMONS {
            match active_profile(bus, daemon, path).await {
                Ok(profile) => return power_mode_of_profile(&profile),
                Err(error) => tracing::debug!(%error, daemon, "read the active power profile"),
            }
        }
        PowerMode::Normal
    }

    #[cfg(target_os = "android")]
    pub(crate) async fn power_mode(&self) -> PowerMode {
        let read = tokio::time::timeout(PLUGIN_TIMEOUT, android::power_saving(&self.app)).await;
        match read {
            Ok(Ok(reply)) => reply.power_mode(),
            Ok(Err(error)) => {
                tracing::debug!(error = %omnileaf_engine::describe_error(&error), "read whether Battery Saver is on");
                PowerMode::Normal
            }
            Err(_) => {
                tracing::debug!("read whether Battery Saver is on: no answer in time");
                PowerMode::Normal
            }
        }
    }

    #[cfg(windows)]
    #[expect(
        clippy::unused_self,
        reason = "only Linux and Android keep something to read the power mode through"
    )]
    pub(crate) fn power_mode(&self) -> impl Future<Output = PowerMode> {
        ready(
            omnileaf_windows_probes::system_status_flag()
                .map_or(PowerMode::Normal, power_mode_of_system_status_flag),
        )
    }
}

#[cfg(target_os = "linux")]
async fn active_profile(bus: &zbus::Connection, daemon: &str, path: &str) -> zbus::Result<String> {
    let reply = bus
        .call_method(
            Some(daemon),
            path,
            Some("org.freedesktop.DBus.Properties"),
            "Get",
            &(daemon, "ActiveProfile"),
        )
        .await?;
    let profile: zbus::zvariant::OwnedValue = reply.body().deserialize()?;
    Ok(String::try_from(&*profile)?)
}

#[cfg(any(target_os = "android", test))]
#[derive(Debug, serde::Deserialize)]
struct AndroidPowerSaving {
    saving: bool,
}

#[cfg(any(target_os = "android", test))]
impl AndroidPowerSaving {
    fn power_mode(&self) -> PowerMode {
        if self.saving {
            PowerMode::Saving
        } else {
            PowerMode::Normal
        }
    }
}

#[cfg(any(target_os = "linux", test))]
fn power_mode_of_profile(profile: &str) -> PowerMode {
    if profile == POWER_SAVER_PROFILE {
        PowerMode::Saving
    } else {
        PowerMode::Normal
    }
}

#[cfg(any(windows, test))]
fn power_mode_of_system_status_flag(flag: u8) -> PowerMode {
    if flag == BATTERY_SAVER_ON {
        PowerMode::Saving
    } else {
        PowerMode::Normal
    }
}

#[cfg(target_os = "android")]
mod android {
    use tauri::{
        AppHandle, Manager, Wry,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use super::AndroidPowerSaving;

    const PLUGIN_NAME: &str = "power-saving";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "PowerSavingPlugin";
    const READ_POWER_SAVING: &str = "readPowerSaving";

    struct PowerSavingPlugin(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    pub(super) enum PowerSavingError {
        #[error("the power saving plugin is not registered")]
        NotRegistered,
        #[error("ask Android whether Battery Saver is on")]
        Read(#[from] PluginInvokeError),
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(PowerSavingPlugin(handle));
                Ok(())
            })
            .build()
    }

    pub(super) async fn power_saving(
        app: &AppHandle,
    ) -> Result<AndroidPowerSaving, PowerSavingError> {
        let plugin = app
            .try_state::<PowerSavingPlugin>()
            .ok_or(PowerSavingError::NotRegistered)?;
        Ok(plugin
            .0
            .run_mobile_plugin_async(READ_POWER_SAVING, ())
            .await?)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn saves_power_while_android_reports_battery_saver_on() {
        let reply: AndroidPowerSaving = serde_json::from_str(r#"{"saving":true}"#).unwrap();

        let mode = reply.power_mode();

        assert_eq!(mode, PowerMode::Saving);
    }

    #[test]
    fn runs_normally_while_android_reports_battery_saver_off() {
        let reply: AndroidPowerSaving = serde_json::from_str(r#"{"saving":false}"#).unwrap();

        let mode = reply.power_mode();

        assert_eq!(mode, PowerMode::Normal);
    }

    #[test]
    fn saves_power_under_the_power_saver_profile() {
        assert_eq!(power_mode_of_profile("power-saver"), PowerMode::Saving);
    }

    #[test]
    fn runs_normally_under_the_other_profiles() {
        for profile in ["balanced", "performance", ""] {
            assert_eq!(
                power_mode_of_profile(profile),
                PowerMode::Normal,
                "{profile}"
            );
        }
    }

    #[test]
    fn saves_power_while_windows_battery_saver_is_on() {
        assert_eq!(power_mode_of_system_status_flag(1), PowerMode::Saving);
    }

    #[test]
    fn runs_normally_while_windows_battery_saver_is_off() {
        assert_eq!(power_mode_of_system_status_flag(0), PowerMode::Normal);
    }
}
