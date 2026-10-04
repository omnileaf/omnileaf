use std::{
    env, io,
    net::{TcpStream, ToSocketAddrs},
    path::Path,
    process::Child,
    thread,
    time::{Duration, Instant},
};

use anyhow::Context;
use clap::ValueEnum;

use crate::{
    android,
    devices::{self, Device, State},
    process::{Machine, Process, command_for},
};

const DEV_SERVER: (&str, u16) = ("localhost", 1420);
/// Run through `node` rather than `pnpm`, so stopping the dev server can't leave Vite behind.
const VITE: &str = "node_modules/vite/bin/vite.js";
const PHONE_DEV_HOST: &str = "TAURI_DEV_HOST";
const DEV_SERVER_TIMEOUT: Duration = Duration::from_secs(60);
const DEV_SERVER_POLL: Duration = Duration::from_millis(250);
const WINDOWS: &str = "windows";

#[derive(Clone, Copy, Debug, PartialEq, Eq, ValueEnum)]
pub(crate) enum Platform {
    Desktop,
    Ios,
    Android,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Reach {
    Localhost,
    Network,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Target {
    Virtual,
    Physical,
}

/// Where each phone platform runs, or `None` for a platform left out.
#[derive(Debug, Default)]
struct Targets {
    android: Option<Target>,
    ios: Option<Target>,
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

/// Tauri points a physical phone at this computer's network address and an emulator or Simulator at `localhost`, except on Windows, where Android always gets the network address.
fn reach(targets: &Targets, os: &str) -> Reach {
    let runs_on_a_phone = [targets.android, targets.ios].contains(&Some(Target::Physical));
    let android_on_windows = os == WINDOWS && targets.android.is_some();
    if runs_on_a_phone || android_on_windows {
        Reach::Network
    } else {
        Reach::Localhost
    }
}

/// Treats a name that isn't a known emulator or Simulator as a phone, since a phone needs the dev server on the network.
fn target(chosen: Option<&str>, devices: &[Device]) -> Target {
    let is_physical = match chosen {
        Some(chosen) => !devices
            .iter()
            .any(|device| device.kind.is_virtual() && device.answers_to(chosen)),
        None => devices
            .iter()
            .any(|device| !device.kind.is_virtual() && device.state == State::Ready),
    };
    if is_physical {
        Target::Physical
    } else {
        Target::Virtual
    }
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
    let targets = chosen_targets(platforms, devices, &Process::in_workspace())?;
    let mut dev_server = start_dev_server(root, reach(&targets, env::consts::OS))?;
    let outcome = wait_for_dev_server().and_then(|()| run_platforms(root, platforms, devices));
    stop(&mut dev_server).context("stop the Vite dev server")?;
    outcome
}

fn chosen_targets(
    platforms: &[Platform],
    chosen: &Devices,
    machine: &impl Machine,
) -> anyhow::Result<Targets> {
    let android = platforms.contains(&Platform::Android).then(|| {
        let listed = android::Toolchain::locate(|key| env::var_os(key), env::consts::OS)
            .map(|toolchain| devices::android_devices(machine, &toolchain))
            .unwrap_or_default();
        target(chosen.android.as_deref(), &listed)
    });
    let ios = if platforms.contains(&Platform::Ios) {
        let listed = devices::ios_devices(machine)?;
        Some(target(chosen.ios.as_deref(), &listed))
    } else {
        None
    };
    Ok(Targets { android, ios })
}

fn start_dev_server(root: &Path, reach: Reach) -> anyhow::Result<Child> {
    let mut vite = command_for("node");
    vite.args([VITE, "dev"]).current_dir(root.join("app"));
    if reach == Reach::Network {
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
    use crate::devices::Kind;

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

    fn targets(android: Option<Target>, ios: Option<Target>) -> Targets {
        Targets { android, ios }
    }

    #[test]
    fn keeps_the_dev_server_on_localhost_for_the_desktop_emulators_and_simulators() {
        for (android, ios) in [
            (None, None),
            (Some(Target::Virtual), None),
            (None, Some(Target::Virtual)),
            (Some(Target::Virtual), Some(Target::Virtual)),
        ] {
            let reached = reach(&targets(android, ios), "macos");

            assert_eq!(reached, Reach::Localhost, "{android:?} {ios:?}");
        }
    }

    #[test]
    fn opens_the_dev_server_to_the_network_for_a_physical_phone() {
        for (android, ios) in [
            (Some(Target::Physical), None),
            (None, Some(Target::Physical)),
            (Some(Target::Virtual), Some(Target::Physical)),
        ] {
            let reached = reach(&targets(android, ios), "macos");

            assert_eq!(reached, Reach::Network, "{android:?} {ios:?}");
        }
    }

    #[test]
    fn opens_the_dev_server_to_the_network_for_android_on_windows() {
        assert_eq!(
            reach(&targets(Some(Target::Virtual), None), "windows"),
            Reach::Network
        );
        assert_eq!(reach(&targets(None, None), "windows"), Reach::Localhost);
    }

    fn listed(kind: Kind, state: State, name: &str, id: Option<&str>) -> Device {
        Device {
            kind,
            state,
            name: name.to_owned(),
            id: id.map(str::to_owned),
        }
    }

    fn android_listing() -> Vec<Device> {
        vec![
            listed(
                Kind::AndroidDevice,
                State::Off,
                "Test Pixel",
                Some("46181FDAP00204"),
            ),
            listed(
                Kind::AndroidEmulator,
                State::Ready,
                "Pixel_10_Pro",
                Some("emulator-5554"),
            ),
            listed(Kind::AndroidEmulator, State::Off, "Pixel_10_Pro_XL", None),
        ]
    }

    fn ios_listing() -> Vec<Device> {
        vec![
            listed(
                Kind::IosDevice,
                State::Off,
                "Test iPhone",
                Some("00008140-000A1B2C3D4E5F60"),
            ),
            listed(
                Kind::IosSimulator,
                State::Off,
                "iPhone 18 Pro",
                Some("75BD17D7-0A6C-48A1-9768-568ACF690500"),
            ),
        ]
    }

    #[test]
    fn targets_an_emulator_or_simulator_chosen_by_name_or_id() {
        for (chosen, listing) in [
            ("pixel_10_pro_xl", android_listing()),
            ("emulator-5554", android_listing()),
            ("iPhone 18 Pro", ios_listing()),
            ("75BD17D7-0A6C-48A1-9768-568ACF690500", ios_listing()),
        ] {
            assert_eq!(target(Some(chosen), &listing), Target::Virtual, "{chosen}");
        }
    }

    #[test]
    fn targets_a_phone_for_any_other_name() {
        for (chosen, listing) in [
            ("Test Pixel", android_listing()),
            ("Someone's Pixel", android_listing()),
            ("Test iPhone", ios_listing()),
        ] {
            assert_eq!(target(Some(chosen), &listing), Target::Physical, "{chosen}");
        }
    }

    #[test]
    fn targets_an_emulator_or_simulator_unless_a_phone_is_ready() {
        for mut listing in [android_listing(), ios_listing()] {
            let without_one = target(None, &listing);
            if let Some(phone) = listing.first_mut() {
                phone.state = State::Ready;
            }
            let with_one = target(None, &listing);

            assert_eq!((without_one, with_one), (Target::Virtual, Target::Physical));
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
