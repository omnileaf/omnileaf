use anyhow::Context;
use clap::ValueEnum;

use crate::{process::command_for, workspace};

#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
pub(crate) enum Platform {
    Android,
    Ios,
    Linux,
    Macos,
    Windows,
}

pub(crate) const LIBRARY: &str = "/";
pub(crate) const KIT_PAGE: &str = "/kit";

pub(crate) fn page(is_kit: bool) -> &'static str {
    if is_kit { KIT_PAGE } else { LIBRARY }
}

pub(crate) fn address(page: &str, platform: Option<Platform>) -> String {
    platform
        .and_then(|platform| platform.to_possible_value())
        .map_or_else(
            || page.to_owned(),
            |value| format!("{page}?platform={}", value.get_name()),
        )
}

pub(crate) fn serve(page: &str, platform: Option<Platform>) -> anyhow::Result<()> {
    let status = command_for("pnpm")
        .args(["--dir", "app", "dev", "--open", &address(page, platform)])
        .env("VITE_SAMPLE_LIBRARY", "on")
        .env("VITE_KIT_PAGE", "on")
        .current_dir(workspace::root())
        .status()
        .context("start the interface on the sample library")?;
    anyhow::ensure!(status.success(), "the interface stopped with {status}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{KIT_PAGE, LIBRARY, Platform, address};

    #[test]
    fn opens_the_library_as_the_default_platform_when_none_is_asked_for() {
        let opened = address(LIBRARY, None);

        assert_eq!(opened, "/");
    }

    #[test]
    fn opens_the_library_drawn_as_the_platform_asked_for() {
        let opened = address(LIBRARY, Some(Platform::Ios));

        assert_eq!(opened, "/?platform=ios");
    }

    #[test]
    fn opens_the_kit_page_drawn_as_the_platform_asked_for() {
        let opened = address(KIT_PAGE, Some(Platform::Android));

        assert_eq!(opened, "/kit?platform=android");
    }
}
