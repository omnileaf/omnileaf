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
    android, device_choice,
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

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum DeviceWithoutPlatform {
    Ios,
    Android,
}

impl std::fmt::Display for DeviceWithoutPlatform {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(match self {
            Self::Ios => "--ios-device needs ios in --platform",
            Self::Android => "--android-device needs android in --platform",
        })
    }
}

impl std::error::Error for DeviceWithoutPlatform {}

/// Runs the platforms asked for, or else the ones whose device is named, or else every one this machine builds for.
pub(crate) fn platforms_to_run(
    explicit: &[Platform],
    chosen: &Devices,
    os: &str,
) -> Result<Vec<Platform>, DeviceWithoutPlatform> {
    let named: Vec<Platform> = [
        chosen.ios.as_ref().map(|_| Platform::Ios),
        chosen.android.as_ref().map(|_| Platform::Android),
    ]
    .into_iter()
    .flatten()
    .collect();
    if explicit.is_empty() {
        return Ok(if named.is_empty() {
            platforms_for(os)
        } else {
            named
        });
    }
    match named.iter().find(|platform| !explicit.contains(platform)) {
        Some(Platform::Ios) => Err(DeviceWithoutPlatform::Ios),
        Some(Platform::Android) => Err(DeviceWithoutPlatform::Android),
        Some(Platform::Desktop) | None => Ok(explicit.to_vec()),
    }
}

/// Settles the device for each phone platform that runs, so Tauri gets an exact name and never has to ask.
pub(crate) fn settle_devices(
    platforms: &[Platform],
    chosen: &Devices,
    machine: &impl Machine,
) -> anyhow::Result<Devices> {
    let android = if platforms.contains(&Platform::Android) {
        let listed = android::Toolchain::locate(|key| env::var_os(key), env::consts::OS)
            .map(|toolchain| devices::android_devices(machine, &toolchain))
            .unwrap_or_default();
        Some(device_choice::settle(
            "Android",
            &listed,
            chosen.android.as_deref(),
        )?)
    } else {
        None
    };
    let ios = if platforms.contains(&Platform::Ios) {
        let listed = devices::ios_devices(machine)?;
        Some(device_choice::settle(
            "iOS",
            &listed,
            chosen.ios.as_deref(),
        )?)
    } else {
        None
    };
    Ok(Devices { ios, android })
}

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
    let apps = platforms
        .iter()
        .map(|&platform| {
            command_for("pnpm")
                .args(tauri_args(platform, devices))
                .current_dir(root)
                .spawn()
                .map(|app| (platform, app))
                .with_context(|| format!("start the {platform:?} app"))
        })
        .collect::<anyhow::Result<Vec<_>>>()?;
    wait_for_apps(apps)
}

fn wait_for_apps(apps: Vec<(Platform, Child)>) -> anyhow::Result<()> {
    let mut failed = Vec::new();
    for (platform, mut app) in apps {
        let status = app
            .wait()
            .with_context(|| format!("wait for the {platform:?} app to exit"))?;
        if !status.success() {
            failed.push(platform);
        }
    }
    anyhow::ensure!(failed.is_empty(), "the {failed:?} app failed");
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

    fn app_exiting_with(code: u8) -> Child {
        let (shell, run) = if cfg!(windows) {
            ("cmd", "/C")
        } else {
            ("sh", "-c")
        };
        std::process::Command::new(shell)
            .args([run, &format!("exit {code}")])
            .spawn()
            .unwrap()
    }

    #[test]
    fn fails_when_an_app_exits_with_an_error() {
        let apps = vec![
            (Platform::Desktop, app_exiting_with(0)),
            (Platform::Android, app_exiting_with(3)),
        ];

        let outcome = wait_for_apps(apps);

        assert!(outcome.unwrap_err().to_string().contains("Android"));
    }

    #[test]
    fn succeeds_when_every_app_exits_cleanly() {
        let apps = vec![
            (Platform::Desktop, app_exiting_with(0)),
            (Platform::Ios, app_exiting_with(0)),
        ];

        assert!(wait_for_apps(apps).is_ok());
    }

    fn chosen(ios: Option<&str>, android: Option<&str>) -> Devices {
        Devices {
            ios: ios.map(str::to_owned),
            android: android.map(str::to_owned),
        }
    }

    #[test]
    fn runs_only_the_platforms_whose_device_is_named() {
        let runs = [
            chosen(Some("iphone-18-pro-max"), None),
            chosen(None, Some("pixel-9-pro")),
            chosen(Some("iphone-18-pro-max"), Some("pixel-9-pro")),
        ]
        .map(|devices| platforms_to_run(&[], &devices, "macos"));

        assert_eq!(
            runs,
            [
                Ok(vec![Platform::Ios]),
                Ok(vec![Platform::Android]),
                Ok(vec![Platform::Ios, Platform::Android]),
            ]
        );
    }

    #[test]
    fn runs_every_platform_this_machine_builds_for_when_nothing_is_named() {
        assert_eq!(
            platforms_to_run(&[], &Devices::default(), "macos"),
            Ok(platforms_for("macos"))
        );
    }

    #[test]
    fn keeps_the_platforms_asked_for() {
        let explicit = [Platform::Desktop, Platform::Ios];

        let runs = platforms_to_run(&explicit, &chosen(Some("iphone-18-pro-max"), None), "macos");

        assert_eq!(runs, Ok(explicit.to_vec()));
    }

    #[test]
    fn refuses_a_device_for_a_platform_left_out() {
        let runs = [
            platforms_to_run(
                &[Platform::Android],
                &chosen(Some("iphone-18-pro-max"), None),
                "macos",
            ),
            platforms_to_run(
                &[Platform::Desktop],
                &chosen(None, Some("pixel-9-pro")),
                "linux",
            ),
        ];

        assert_eq!(
            runs,
            [
                Err(DeviceWithoutPlatform::Ios),
                Err(DeviceWithoutPlatform::Android),
            ]
        );
    }
}
