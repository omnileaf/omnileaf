use omnileaf_engine::WindowBackdrop;
use tauri::{App, WebviewWindowBuilder, Wry};

const FIRST_WINDOWS_11_BUILD: u32 = 22_000;

type MainWindowBuilder<'a> = WebviewWindowBuilder<'a, Wry, App>;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
#[cfg_attr(
    not(any(windows, test)),
    expect(dead_code, reason = "only Windows draws a backdrop behind its windows")
)]
enum TransparencyEffects {
    On,
    Off,
}

#[cfg_attr(
    not(any(windows, test)),
    expect(dead_code, reason = "only Windows draws a backdrop behind its windows")
)]
impl TransparencyEffects {
    fn from_setting(enable_transparency: Option<u32>) -> Self {
        match enable_transparency {
            Some(0) | None => Self::Off,
            Some(_) => Self::On,
        }
    }
}

#[cfg_attr(
    not(any(windows, test)),
    expect(dead_code, reason = "only Windows draws a backdrop behind its windows")
)]
fn backdrop_for(windows_build: u32, transparency: TransparencyEffects) -> WindowBackdrop {
    let is_windows_11 = windows_build >= FIRST_WINDOWS_11_BUILD;
    match transparency {
        TransparencyEffects::On if is_windows_11 => WindowBackdrop::Mica,
        TransparencyEffects::On | TransparencyEffects::Off => WindowBackdrop::None,
    }
}

#[cfg(windows)]
pub(crate) fn of_this_system() -> WindowBackdrop {
    windows::build().map_or(WindowBackdrop::None, |build| {
        backdrop_for(build, windows::transparency_effects())
    })
}

#[cfg(not(windows))]
pub(crate) fn of_this_system() -> WindowBackdrop {
    WindowBackdrop::None
}

pub(crate) fn open_windows(app: &App, backdrop: WindowBackdrop) -> tauri::Result<()> {
    for config in &app.config().app.windows {
        with_backdrop(WebviewWindowBuilder::from_config(app, config)?, backdrop).build()?;
    }
    Ok(())
}

fn with_backdrop(window: MainWindowBuilder<'_>, backdrop: WindowBackdrop) -> MainWindowBuilder<'_> {
    match backdrop {
        WindowBackdrop::Mica => with_mica(window),
        WindowBackdrop::None => window,
    }
}

#[cfg(windows)]
fn with_mica(window: MainWindowBuilder<'_>) -> MainWindowBuilder<'_> {
    use tauri::window::{Effect, EffectsBuilder};

    window
        .transparent(true)
        .effects(EffectsBuilder::new().effect(Effect::Mica).build())
}

#[cfg(not(windows))]
fn with_mica(window: MainWindowBuilder<'_>) -> MainWindowBuilder<'_> {
    window
}

#[cfg(windows)]
mod windows {
    use os_info::Version;

    use super::TransparencyEffects;

    const PERSONALIZE_KEY: &str = r"Software\Microsoft\Windows\CurrentVersion\Themes\Personalize";
    const ENABLE_TRANSPARENCY: &str = "EnableTransparency";

    pub(super) fn build() -> Option<u32> {
        match os_info::get().version() {
            Version::Semantic(_, _, build) => u32::try_from(*build).ok(),
            _ => None,
        }
    }

    pub(super) fn transparency_effects() -> TransparencyEffects {
        TransparencyEffects::from_setting(omnileaf_windows_probes::current_user_dword(
            PERSONALIZE_KEY,
            ENABLE_TRANSPARENCY,
        ))
    }
}

#[cfg(test)]
mod tests {
    use omnileaf_engine::WindowBackdrop;

    use super::{TransparencyEffects, backdrop_for};

    const WINDOWS_10_22H2: u32 = 19_045;
    const WINDOWS_11_21H2: u32 = 22_000;
    const WINDOWS_11_24H2: u32 = 26_100;

    #[test]
    fn draws_mica_on_windows_11_with_transparency_effects_on() {
        let backdrops = [WINDOWS_11_21H2, WINDOWS_11_24H2]
            .map(|build| backdrop_for(build, TransparencyEffects::On));

        assert_eq!(backdrops, [WindowBackdrop::Mica, WindowBackdrop::Mica]);
    }

    #[test]
    fn keeps_the_window_solid_on_windows_10() {
        let backdrop = backdrop_for(WINDOWS_10_22H2, TransparencyEffects::On);

        assert_eq!(backdrop, WindowBackdrop::None);
    }

    #[test]
    fn keeps_the_window_solid_with_transparency_effects_off() {
        let backdrop = backdrop_for(WINDOWS_11_24H2, TransparencyEffects::Off);

        assert_eq!(backdrop, WindowBackdrop::None);
    }

    #[test]
    fn reads_transparency_effects_as_on_only_where_the_setting_says_so() {
        let readings = [Some(1), Some(0), None].map(TransparencyEffects::from_setting);

        assert_eq!(
            readings,
            [
                TransparencyEffects::On,
                TransparencyEffects::Off,
                TransparencyEffects::Off
            ]
        );
    }
}
