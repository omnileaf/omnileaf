use serde::Serialize;
use tauri::{
    Manager, Runtime,
    plugin::{Builder, PluginHandle, TauriPlugin, mobile::PluginInvokeError},
};

use crate::InterfaceStyle;

tauri::ios_plugin_binding!(init_plugin_system_bars);

const PLUGIN_NAME: &str = "system-bars";

pub struct SystemBars<R: Runtime>(PluginHandle<R>);

#[derive(Serialize)]
struct ShownStyle {
    style: InterfaceStyle,
}

#[must_use]
pub fn init<R: Runtime>() -> TauriPlugin<R> {
    Builder::new(PLUGIN_NAME)
        .setup(|app, api| {
            app.manage(SystemBars(
                api.register_ios_plugin(init_plugin_system_bars)?,
            ));
            Ok(())
        })
        .build()
}

impl<R: Runtime> SystemBars<R> {
    /// Shows `style` now and keeps it for the next launch, which starts in it before the page loads.
    pub async fn show_style(&self, style: InterfaceStyle) -> Result<(), PluginInvokeError> {
        self.0
            .run_mobile_plugin_async("showStyle", ShownStyle { style })
            .await
    }
}
