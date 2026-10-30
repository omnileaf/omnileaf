use omnileaf_engine::WindowBackdrop;

/// Windows 11 builds before 22523 lack `DWMWA_SYSTEMBACKDROP_TYPE`, and Tauri falls back to an undocumented attribute there.
const FIRST_SYSTEM_BACKDROP_BUILD: u32 = 22_523;

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
    /// `UISettings.AdvancedEffectsEnabled` reports transparency effects off while `EnableTransparency` is missing.
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
    let has_system_backdrop = windows_build >= FIRST_SYSTEM_BACKDROP_BUILD;
    match transparency {
        TransparencyEffects::On if has_system_backdrop => WindowBackdrop::Mica,
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

pub(crate) fn confirmed(chosen: WindowBackdrop, drawn: WindowBackdrop) -> WindowBackdrop {
    match (chosen, drawn) {
        (WindowBackdrop::Mica, WindowBackdrop::Mica) => WindowBackdrop::Mica,
        (WindowBackdrop::Mica | WindowBackdrop::None, _) => WindowBackdrop::None,
    }
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

    use super::{TransparencyEffects, backdrop_for, confirmed};

    const WINDOWS_10_22H2: u32 = 19_045;
    const WINDOWS_11_21H2: u32 = 22_000;
    const LAST_BUILD_WITHOUT_SYSTEM_BACKDROP: u32 = 22_522;
    const FIRST_BUILD_WITH_SYSTEM_BACKDROP: u32 = 22_523;
    const WINDOWS_11_24H2: u32 = 26_100;

    #[test]
    fn draws_mica_where_windows_11_has_a_system_backdrop_and_transparency_effects_are_on() {
        let backdrops = [FIRST_BUILD_WITH_SYSTEM_BACKDROP, WINDOWS_11_24H2]
            .map(|build| backdrop_for(build, TransparencyEffects::On));

        assert_eq!(backdrops, [WindowBackdrop::Mica, WindowBackdrop::Mica]);
    }

    #[test]
    fn keeps_the_window_solid_on_windows_11_builds_without_a_system_backdrop() {
        let backdrops = [WINDOWS_11_21H2, LAST_BUILD_WITHOUT_SYSTEM_BACKDROP]
            .map(|build| backdrop_for(build, TransparencyEffects::On));

        assert_eq!(backdrops, [WindowBackdrop::None, WindowBackdrop::None]);
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

    #[test]
    fn reports_mica_once_windows_draws_it() {
        let backdrop = confirmed(WindowBackdrop::Mica, WindowBackdrop::Mica);

        assert_eq!(backdrop, WindowBackdrop::Mica);
    }

    #[test]
    fn reports_a_solid_window_where_windows_drew_no_mica_it_was_asked_for() {
        let backdrop = confirmed(WindowBackdrop::Mica, WindowBackdrop::None);

        assert_eq!(backdrop, WindowBackdrop::None);
    }

    #[test]
    fn reports_a_solid_window_where_none_was_asked_for() {
        let backdrop = confirmed(WindowBackdrop::None, WindowBackdrop::None);

        assert_eq!(backdrop, WindowBackdrop::None);
    }
}
