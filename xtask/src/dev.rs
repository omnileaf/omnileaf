use std::{
    io,
    net::{TcpStream, ToSocketAddrs},
    path::Path,
    process::Child,
    thread,
    time::{Duration, Instant},
};

use anyhow::Context;
use clap::ValueEnum;

use crate::process::command_for;

const DEV_SERVER: (&str, u16) = ("localhost", 1420);
/// Run through `node` rather than `pnpm`, so stopping the dev server can't leave Vite behind.
const VITE: &str = "node_modules/vite/bin/vite.js";
const PHONE_DEV_HOST: &str = "TAURI_DEV_HOST";
const DEV_SERVER_TIMEOUT: Duration = Duration::from_secs(60);
const DEV_SERVER_POLL: Duration = Duration::from_millis(250);

#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
pub(crate) enum Platform {
    Desktop,
    Ios,
    Android,
}

impl Platform {
    fn is_phone(self) -> bool {
        match self {
            Self::Desktop => false,
            Self::Ios | Self::Android => true,
        }
    }
}

#[derive(Debug, Default)]
pub(crate) struct Devices {
    pub(crate) ios: Option<String>,
    pub(crate) android: Option<String>,
}

const WITHOUT_DEV_SERVER: &str = r#"{"build":{"beforeDevCommand":null}}"#;

pub(crate) fn platforms_for(os: &str) -> Vec<Platform> {
    if os == "macos" {
        vec![Platform::Desktop, Platform::Ios, Platform::Android]
    } else {
        vec![Platform::Desktop, Platform::Android]
    }
}

fn serves_phones(platforms: &[Platform]) -> bool {
    platforms.iter().any(|platform| platform.is_phone())
}

pub(crate) fn tauri_args(platform: Platform, devices: &Devices) -> Vec<String> {
    let (subcommand, device): (&[&str], Option<&String>) = match platform {
        Platform::Desktop => (&["dev"], None),
        Platform::Ios => (&["ios", "dev"], devices.ios.as_ref()),
        Platform::Android => (&["android", "dev"], devices.android.as_ref()),
    };
    ["--dir", "app", "tauri"]
        .iter()
        .chain(subcommand)
        .chain(&["--config", WITHOUT_DEV_SERVER])
        .map(ToString::to_string)
        .chain(device.cloned())
        .collect()
}

pub(crate) fn run(root: &Path, platforms: &[Platform], devices: &Devices) -> anyhow::Result<()> {
    let mut dev_server = start_dev_server(root, platforms)?;
    let outcome = wait_for_dev_server().and_then(|()| run_platforms(root, platforms, devices));
    stop(&mut dev_server).context("stop the Vite dev server")?;
    outcome
}

fn start_dev_server(root: &Path, platforms: &[Platform]) -> anyhow::Result<Child> {
    let mut vite = command_for("node");
    vite.args([VITE, "dev"]).current_dir(root.join("app"));
    if serves_phones(platforms) {
        let address = local_ip_address::local_ip()
            .context("find this computer's network address for the phones")?;
        vite.env(PHONE_DEV_HOST, address.to_string());
    }
    vite.spawn().context("start the Vite dev server")
}

fn wait_for_dev_server() -> anyhow::Result<()> {
    let deadline = Instant::now() + DEV_SERVER_TIMEOUT;
    while !dev_server_answers()? {
        anyhow::ensure!(
            Instant::now() < deadline,
            "the Vite dev server didn't start on {}:{} within {DEV_SERVER_TIMEOUT:?}",
            DEV_SERVER.0,
            DEV_SERVER.1
        );
        thread::sleep(DEV_SERVER_POLL);
    }
    Ok(())
}

/// Tries every address `localhost` resolves to, since Vite may listen on only IPv4 or only IPv6.
fn dev_server_answers() -> anyhow::Result<bool> {
    let addresses = DEV_SERVER
        .to_socket_addrs()
        .context("resolve the dev server's address")?;
    Ok(addresses
        .into_iter()
        .any(|address| TcpStream::connect_timeout(&address, DEV_SERVER_POLL).is_ok()))
}

fn run_platforms(root: &Path, platforms: &[Platform], devices: &Devices) -> anyhow::Result<()> {
    let mut apps = platforms
        .iter()
        .map(|&platform| {
            command_for("pnpm")
                .args(tauri_args(platform, devices))
                .current_dir(root)
                .spawn()
                .with_context(|| format!("start the {platform:?} app"))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    for app in &mut apps {
        app.wait().context("wait for an app to exit")?;
    }
    Ok(())
}

fn stop(child: &mut Child) -> io::Result<()> {
    match child.kill() {
        Err(error) if error.kind() != io::ErrorKind::InvalidInput => return Err(error),
        _ => {}
    }
    child.wait().map(drop)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn runs_every_platform_on_a_mac() {
        assert_eq!(
            platforms_for("macos"),
            [Platform::Desktop, Platform::Ios, Platform::Android]
        );
    }

    #[test]
    fn leaves_out_ios_where_it_cannot_be_built() {
        for os in ["linux", "windows"] {
            assert_eq!(platforms_for(os), [Platform::Desktop, Platform::Android]);
        }
    }

    #[test]
    fn keeps_the_dev_server_on_localhost_for_the_desktop_alone() {
        assert!(!serves_phones(&[Platform::Desktop]));
    }

    #[test]
    fn opens_the_dev_server_to_the_network_when_a_phone_runs_the_app() {
        for platforms in [
            &[Platform::Android][..],
            &[Platform::Ios],
            &[Platform::Desktop, Platform::Android],
        ] {
            assert!(serves_phones(platforms), "{platforms:?}");
        }
    }

    #[test]
    fn starts_each_platform_without_its_own_dev_server() {
        for platform in [Platform::Desktop, Platform::Ios, Platform::Android] {
            let args = tauri_args(platform, &Devices::default());

            let config = args.iter().position(|arg| arg == "--config").unwrap();
            assert_eq!(args[config + 1], WITHOUT_DEV_SERVER);
        }
    }

    #[test]
    fn runs_the_right_tauri_command_for_each_platform() {
        let commands = [Platform::Desktop, Platform::Ios, Platform::Android]
            .map(|platform| tauri_args(platform, &Devices::default()).join(" "));

        assert_eq!(
            commands,
            [
                format!("--dir app tauri dev --config {WITHOUT_DEV_SERVER}"),
                format!("--dir app tauri ios dev --config {WITHOUT_DEV_SERVER}"),
                format!("--dir app tauri android dev --config {WITHOUT_DEV_SERVER}"),
            ]
        );
    }

    #[test]
    fn passes_the_chosen_device_last() {
        let devices = Devices {
            ios: Some("iPhone 16".into()),
            android: Some("Pixel 8".into()),
        };

        assert_eq!(
            tauri_args(Platform::Ios, &devices).last().unwrap(),
            "iPhone 16"
        );
        assert_eq!(
            tauri_args(Platform::Android, &devices).last().unwrap(),
            "Pixel 8"
        );
    }
}
