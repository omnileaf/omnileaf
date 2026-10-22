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

pub(crate) fn address(platform: Option<Platform>) -> String {
    platform
        .and_then(|platform| platform.to_possible_value())
        .map_or_else(
            || "/".to_owned(),
            |value| format!("/?platform={}", value.get_name()),
        )
}

pub(crate) fn serve(platform: Option<Platform>) -> anyhow::Result<()> {
    let status = command_for("pnpm")
        .args(["--dir", "app", "dev", "--open", &address(platform)])
        .env("VITE_SAMPLE_LIBRARY", "on")
        .current_dir(workspace::root())
        .status()
        .context("start the interface on the sample library")?;
    anyhow::ensure!(status.success(), "the interface stopped with {status}");
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{Platform, address};

    #[test]
    fn opens_the_library_as_the_default_platform_when_none_is_asked_for() {
        let opened = address(None);

        assert_eq!(opened, "/");
    }

    #[test]
    fn opens_the_library_drawn_as_the_platform_asked_for() {
        let opened = address(Some(Platform::Ios));

        assert_eq!(opened, "/?platform=ios");
    }
}
