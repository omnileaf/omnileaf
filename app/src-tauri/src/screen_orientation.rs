use serde::{Deserialize, Serialize};
use specta::Type;

#[cfg(target_os = "android")]
pub(crate) use android::{orient, plugin};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
pub(crate) enum ScreenOrientation {
    FollowDevice,
    /// Upright on phones and turning with the device on tablets, as the rest of the app is laid out.
    PortraitOnPhones,
}

#[derive(Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android turns its screen at runtime")
)]
struct Turning {
    follows_device: bool,
}

#[cfg_attr(
    not(any(target_os = "android", test)),
    expect(dead_code, reason = "only Android turns its screen at runtime")
)]
impl Turning {
    fn for_orientation(orientation: ScreenOrientation) -> Self {
        Self {
            follows_device: orientation == ScreenOrientation::FollowDevice,
        }
    }
}

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "only Android waits for its activity to turn the screen"
)]
pub(crate) async fn orient(
    _app: &tauri::AppHandle,
    _orientation: ScreenOrientation,
) -> Result<(), crate::ipc_error::IpcError> {
    Ok(())
}

#[cfg(target_os = "android")]
mod android {
    use tauri::{
        AppHandle, Manager, Wry,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use super::{ScreenOrientation, Turning};
    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "screen-orientation";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "ScreenOrientationPlugin";
    const TURN: &str = "turn";

    struct Screen(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum ScreenOrientationError {
        #[error("the screen orientation plugin is not registered")]
        NotRegistered,
        #[error("turn the screen")]
        Turn(#[from] PluginInvokeError),
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(Screen(handle));
                Ok(())
            })
            .build()
    }

    pub(crate) async fn orient(
        app: &AppHandle,
        orientation: ScreenOrientation,
    ) -> Result<(), IpcError> {
        turn(app, Turning::for_orientation(orientation))
            .await
            .map_err(|error| IpcError::internal(&error))
    }

    async fn turn(app: &AppHandle, turning: Turning) -> Result<(), ScreenOrientationError> {
        let screen = app
            .try_state::<Screen>()
            .ok_or(ScreenOrientationError::NotRegistered)?;
        screen
            .0
            .run_mobile_plugin_async::<()>(TURN, turning)
            .await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::{ScreenOrientation, Turning};

    #[test]
    fn the_reader_asks_the_screen_to_follow_the_device() {
        let turning = Turning::for_orientation(ScreenOrientation::FollowDevice);

        assert_eq!(
            turning,
            Turning {
                follows_device: true
            }
        );
    }

    #[test]
    fn the_rest_of_the_app_keeps_phones_upright() {
        let turning = Turning::for_orientation(ScreenOrientation::PortraitOnPhones);

        assert_eq!(
            turning,
            Turning {
                follows_device: false
            }
        );
    }
}
