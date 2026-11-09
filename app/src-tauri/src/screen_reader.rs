#[cfg(target_os = "linux")]
mod atspi {
    use zbus::connection;

    const STATUS_INTERFACE: &str = "org.a11y.Status";
    const STATUS_PATH: &str = "/org/a11y/bus";
    const STATUS_SERVICE: &str = "org.a11y.Bus";
    const SCREEN_READER_PROPERTY: &str = "ScreenReaderEnabled";
    const BUS_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(2);

    pub(super) async fn is_running() -> bool {
        let bus = match connection::Builder::session() {
            Ok(builder) => builder.method_timeout(BUS_TIMEOUT).build().await,
            Err(error) => Err(error),
        };
        screen_reader_enabled(bus, Some(STATUS_SERVICE)).await
    }

    async fn screen_reader_enabled(
        bus: zbus::Result<zbus::Connection>,
        service: Option<&str>,
    ) -> bool {
        let bus = match bus {
            Ok(bus) => bus,
            Err(error) => {
                tracing::debug!(%error, "reach the session bus for the screen reader");
                return false;
            }
        };
        match read_flag(&bus, service).await {
            Ok(enabled) => enabled,
            Err(error) => {
                tracing::debug!(%error, "read whether a screen reader is on");
                false
            }
        }
    }

    async fn read_flag(bus: &zbus::Connection, service: Option<&str>) -> zbus::Result<bool> {
        let reply = bus
            .call_method(
                service,
                STATUS_PATH,
                Some("org.freedesktop.DBus.Properties"),
                "Get",
                &(STATUS_INTERFACE, SCREEN_READER_PROPERTY),
            )
            .await?;
        let value: zbus::zvariant::OwnedValue = reply.body().deserialize()?;
        Ok(bool::try_from(&*value)?)
    }

    #[cfg(test)]
    mod tests {
        use std::os::unix::net::UnixStream;

        use zbus::{Guid, interface};

        use super::*;

        struct Status(bool);

        #[interface(name = "org.a11y.Status")]
        impl Status {
            #[zbus(property, name = "ScreenReaderEnabled")]
            fn screen_reader_enabled(&self) -> bool {
                self.0
            }
        }

        fn asked_of_bus(status: Status) -> bool {
            let (service_end, app_end) = UnixStream::pair().expect("a socket pair");
            let service = connection::Builder::async_io_unix_stream(service_end)
                .server(Guid::generate())
                .and_then(|service| service.p2p().serve_at(STATUS_PATH, status))
                .expect("a bus to serve");
            let app = connection::Builder::async_io_unix_stream(app_end).p2p();

            tauri::async_runtime::block_on(async move {
                let service = tauri::async_runtime::spawn(service.build());
                let running = screen_reader_enabled(app.build().await, None).await;
                let _service_connection = service
                    .await
                    .expect("the bus task")
                    .expect("a bus connection");
                running
            })
        }

        #[test]
        fn finds_a_screen_reader_when_the_desktop_says_one_is_on() {
            assert!(asked_of_bus(Status(true)));
        }

        #[test]
        fn finds_no_screen_reader_when_the_desktop_says_none_is_on() {
            assert!(!asked_of_bus(Status(false)));
        }

        #[test]
        fn finds_no_screen_reader_on_a_bus_it_cannot_reach() {
            let unreachable = connection::Builder::address("unix:path=/nonexistent/omnileaf-bus");
            let bus = tauri::async_runtime::block_on(async { unreachable?.build().await });

            let running =
                tauri::async_runtime::block_on(screen_reader_enabled(bus, Some(STATUS_SERVICE)));

            assert!(!running);
        }
    }
}

#[cfg(target_os = "linux")]
pub(crate) async fn is_running() -> bool {
    atspi::is_running().await
}

#[cfg(windows)]
#[expect(clippy::unused_async, reason = "Windows answers at once")]
pub(crate) async fn is_running() -> bool {
    omnileaf_windows_probes::screen_reader_is_running()
}

#[cfg(target_os = "macos")]
#[expect(clippy::unused_async, reason = "AppKit answers at once")]
pub(crate) async fn is_running() -> bool {
    objc2_app_kit::NSWorkspace::sharedWorkspace().isVoiceOverEnabled()
}

#[cfg(target_os = "ios")]
#[expect(clippy::unused_async, reason = "UIKit answers at once")]
pub(crate) async fn is_running() -> bool {
    objc2_ui_kit::UIAccessibilityIsVoiceOverRunning()
}

#[cfg(not(any(target_os = "linux", windows, target_os = "macos", target_os = "ios")))]
#[expect(
    clippy::unused_async,
    reason = "Android does not report a screen reader to Rust yet"
)]
pub(crate) async fn is_running() -> bool {
    false
}

#[cfg(all(test, target_os = "macos"))]
mod macos_tests {
    #[test]
    fn asks_the_workspace_whether_voiceover_is_on() {
        let asked = tauri::async_runtime::block_on(super::is_running());
        let workspace = objc2_app_kit::NSWorkspace::sharedWorkspace().isVoiceOverEnabled();

        assert_eq!(asked, workspace);
    }
}
