#[cfg(not(target_os = "linux"))]
use std::future::ready;

use omnileaf_engine::PowerMode;

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

#[cfg(any(target_os = "linux", test))]
const POWER_SAVER_PROFILE: &str = "power-saver";

/// Reads whether the device saves power, where the platform reports it without a plugin.
pub(crate) struct PowerModeProbe {
    #[cfg(target_os = "linux")]
    system_bus: Option<zbus::Connection>,
}

impl PowerModeProbe {
    #[cfg(target_os = "linux")]
    pub(crate) async fn connect() -> Self {
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

    #[cfg(not(target_os = "linux"))]
    pub(crate) fn connect() -> impl Future<Output = Self> {
        ready(Self {})
    }

    #[cfg(any(target_os = "macos", target_os = "ios"))]
    #[expect(
        clippy::unused_self,
        reason = "only Linux keeps a connection to read the power mode through"
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

    #[cfg(any(windows, target_os = "android"))]
    #[expect(
        clippy::unused_self,
        reason = "only Linux keeps a connection to read the power mode through"
    )]
    pub(crate) fn power_mode(&self) -> impl Future<Output = PowerMode> {
        ready(PowerMode::Normal)
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

#[cfg(any(target_os = "linux", test))]
fn power_mode_of_profile(profile: &str) -> PowerMode {
    if profile == POWER_SAVER_PROFILE {
        PowerMode::Saving
    } else {
        PowerMode::Normal
    }
}

#[cfg(test)]
mod tests {
    use super::*;

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
}
