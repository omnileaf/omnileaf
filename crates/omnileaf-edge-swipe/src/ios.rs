use serde::Serialize;
use tauri::{
    Manager, Runtime,
    ipc::Channel,
    plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
};

use crate::{BackSwipe, SwipeEdge};

tauri::ios_plugin_binding!(init_plugin_edge_swipe);

const PLUGIN_NAME: &str = "edge-swipe";

pub struct EdgeSwipe<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct Watching {
    channel: Channel<BackSwipe>,
}

#[derive(Serialize)]
struct AllowedEdge {
    edge: Option<SwipeEdge>,
}

#[must_use]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new(PLUGIN_NAME)
        .setup(|app, api| {
            app.manage(EdgeSwipe(api.register_ios_plugin(init_plugin_edge_swipe)?));
            Ok(())
        })
        .build()
}

impl<R: Runtime> EdgeSwipe<R> {
    pub async fn watch(&self, channel: Channel<BackSwipe>) -> Result<(), PluginInvokeError> {
        self.0
            .run_mobile_plugin_async("watch", Watching { channel })
            .await
    }

    pub async fn allow(&self, edge: Option<SwipeEdge>) -> Result<(), PluginInvokeError> {
        self.0
            .run_mobile_plugin_async("allow", AllowedEdge { edge })
            .await
    }
}
