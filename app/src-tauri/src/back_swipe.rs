use omnileaf_edge_swipe::{BackSwipe, SwipeEdge};
use tauri::{AppHandle, ipc::Channel};

use crate::ipc_error::IpcError;

#[cfg(target_os = "ios")]
pub(crate) async fn watch(app: &AppHandle, on_swipe: Channel<BackSwipe>) -> Result<(), IpcError> {
    edge_swipe(app)
        .watch(on_swipe)
        .await
        .map_err(|error| IpcError::internal(&error))
}

#[cfg(target_os = "ios")]
pub(crate) async fn allow(app: &AppHandle, edge: Option<SwipeEdge>) -> Result<(), IpcError> {
    edge_swipe(app)
        .allow(edge)
        .await
        .map_err(|error| IpcError::internal(&error))
}

#[cfg(target_os = "ios")]
fn edge_swipe(app: &AppHandle) -> tauri::State<'_, omnileaf_edge_swipe::EdgeSwipe<tauri::Wry>> {
    use tauri::Manager;

    app.state()
}

#[cfg(not(target_os = "ios"))]
#[expect(
    clippy::unused_async,
    reason = "only iOS waits for its swipe from the edge to be watched"
)]
pub(crate) async fn watch(_app: &AppHandle, _on_swipe: Channel<BackSwipe>) -> Result<(), IpcError> {
    Ok(())
}

#[cfg(not(target_os = "ios"))]
#[expect(
    clippy::unused_async,
    reason = "only iOS waits for its swipe from the edge to be allowed"
)]
pub(crate) async fn allow(_app: &AppHandle, _edge: Option<SwipeEdge>) -> Result<(), IpcError> {
    Ok(())
}
