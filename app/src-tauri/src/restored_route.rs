#[cfg(target_os = "android")]
pub(crate) use android::{plugin, take};

#[cfg(any(target_os = "android", test))]
#[derive(Debug, serde::Deserialize)]
struct TakenRoute {
    route: Option<String>,
}

#[cfg(any(target_os = "android", test))]
impl TakenRoute {
    fn into_route(self) -> Option<String> {
        self.route
    }
}

#[cfg(not(target_os = "android"))]
#[expect(
    clippy::unused_async,
    reason = "only Android rebuilds the page on a route it saved"
)]
pub(crate) async fn take(
    _app: &tauri::AppHandle,
) -> Result<Option<String>, crate::ipc_error::IpcError> {
    Ok(None)
}

#[cfg(target_os = "android")]
mod android {
    use std::time::Duration;

    use tauri::{
        AppHandle, Manager, Wry,
        plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
    };

    use super::TakenRoute;
    use crate::ipc_error::IpcError;

    const PLUGIN_NAME: &str = "restored-route";
    const ANDROID_PACKAGE: &str = "app.omnileaf";
    const ANDROID_PLUGIN_CLASS: &str = "RestoredRoutePlugin";
    const TAKE: &str = "take";
    const PLUGIN_TIMEOUT: Duration = Duration::from_secs(2);

    struct RestoredRoutePlugin(PluginHandle<Wry>);

    #[derive(Debug, thiserror::Error)]
    enum RestoredRouteError {
        #[error("the restored route plugin is not registered")]
        NotRegistered,
        #[error("take the route Android saved for the rebuilt screen")]
        Plugin(#[from] PluginInvokeError),
        #[error("Android took too long to hand over the route it saved for the rebuilt screen")]
        TimedOut,
    }

    pub(crate) fn plugin() -> TauriPlugin<Wry> {
        Builder::new(PLUGIN_NAME)
            .setup(|app, api| {
                let handle = api.register_android_plugin(ANDROID_PACKAGE, ANDROID_PLUGIN_CLASS)?;
                app.manage(RestoredRoutePlugin(handle));
                Ok(())
            })
            .build()
    }

    pub(crate) async fn take(app: &AppHandle) -> Result<Option<String>, IpcError> {
        ask(app)
            .await
            .map(TakenRoute::into_route)
            .map_err(|error| IpcError::internal(&error))
    }

    async fn ask(app: &AppHandle) -> Result<TakenRoute, RestoredRouteError> {
        let plugin = app
            .try_state::<RestoredRoutePlugin>()
            .ok_or(RestoredRouteError::NotRegistered)?;
        Ok(tokio::time::timeout(
            PLUGIN_TIMEOUT,
            plugin.0.run_mobile_plugin_async::<TakenRoute>(TAKE, ()),
        )
        .await
        .map_err(|_elapsed| RestoredRouteError::TimedOut)??)
    }
}

#[cfg(test)]
mod tests {
    use super::TakenRoute;

    #[test]
    fn reads_the_route_android_hands_over() {
        let sent = serde_json::json!({ "route": "/series/42?tab=books" });

        let taken: TakenRoute = serde_json::from_value(sent).unwrap();

        assert_eq!(taken.into_route().as_deref(), Some("/series/42?tab=books"));
    }

    #[test]
    fn reads_no_route_when_android_saved_none() {
        let sent = serde_json::json!({ "route": null });

        let taken: TakenRoute = serde_json::from_value(sent).unwrap();

        assert_eq!(taken.into_route(), None);
    }
}
