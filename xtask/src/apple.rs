//! Reads the iOS Simulators and devices Xcode's tools report.

use std::collections::BTreeMap;

use serde::Deserialize;

pub(crate) const LIST_SIMULATORS: &[&str] = &["simctl", "list", "devices", "available", "--json"];
pub(crate) const LIST_DEVICES: &[&str] = &[
    "devicectl",
    "list",
    "devices",
    "--json-output",
    "-",
    "--quiet",
];

const IOS_RUNTIME_PREFIX: &str = "com.apple.CoreSimulator.SimRuntime.iOS-";
const BOOTED: &str = "Booted";
const PHYSICAL: &str = "physical";
const IOS: &str = "iOS";

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Simulator {
    pub(crate) name: String,
    pub(crate) udid: String,
    pub(crate) ios_version: String,
    pub(crate) is_booted: bool,
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct PhysicalDevice {
    pub(crate) name: String,
    pub(crate) udid: String,
    pub(crate) is_reachable: bool,
}

#[derive(Deserialize)]
struct DevicectlListing {
    result: DevicectlResult,
}

#[derive(Deserialize)]
struct DevicectlResult {
    devices: Vec<DevicectlDevice>,
}

#[derive(Deserialize)]
struct DevicectlDevice {
    #[serde(rename = "deviceProperties")]
    device: DeviceProperties,
    #[serde(rename = "hardwareProperties")]
    hardware: HardwareProperties,
    #[serde(rename = "connectionProperties")]
    connection: ConnectionProperties,
}

#[derive(Deserialize)]
struct DeviceProperties {
    name: String,
}

#[derive(Deserialize)]
struct HardwareProperties {
    platform: String,
    reality: String,
    udid: String,
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct ConnectionProperties {
    transport_type: Option<String>,
}

#[derive(Deserialize)]
struct SimctlListing {
    devices: BTreeMap<String, Vec<SimctlDevice>>,
}

#[derive(Deserialize)]
struct SimctlDevice {
    name: String,
    udid: String,
    state: String,
}

/// Reads `xcrun simctl list devices available --json`, keeping the iOS Simulators.
pub(crate) fn ios_simulators(listing: &str) -> serde_json::Result<Vec<Simulator>> {
    let listing: SimctlListing = serde_json::from_str(listing)?;
    Ok(listing
        .devices
        .into_iter()
        .filter_map(|(runtime, devices)| {
            let version = runtime.strip_prefix(IOS_RUNTIME_PREFIX)?.replace('-', ".");
            Some(devices.into_iter().map(move |device| Simulator {
                is_booted: device.state == BOOTED,
                name: device.name,
                udid: device.udid,
                ios_version: version.clone(),
            }))
        })
        .flatten()
        .collect())
}

/// Reads `xcrun devicectl list devices`, keeping the physical iOS devices, which are reachable while they have a transport.
pub(crate) fn physical_ios_devices(listing: &str) -> serde_json::Result<Vec<PhysicalDevice>> {
    let listing: DevicectlListing = serde_json::from_str(listing)?;
    Ok(listing
        .result
        .devices
        .into_iter()
        .filter(|device| device.hardware.reality == PHYSICAL && device.hardware.platform == IOS)
        .map(|device| PhysicalDevice {
            name: device.device.name,
            udid: device.hardware.udid,
            is_reachable: device.connection.transport_type.is_some(),
        })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    const LISTING: &str = r#"{
      "devices" : {
        "com.apple.CoreSimulator.SimRuntime.watchOS-12-0" : [
          { "udid" : "0D3C4E5F-0000-0000-0000-000000000001", "isAvailable" : true, "state" : "Shutdown", "name" : "Apple Watch Ultra 4" }
        ],
        "com.apple.CoreSimulator.SimRuntime.iOS-27-0" : [
          { "udid" : "75BD17D7-0A6C-48A1-9768-568ACF690500", "isAvailable" : true, "state" : "Shutdown", "name" : "iPhone 18 Pro" },
          { "udid" : "2AD917AF-392E-4478-8CF1-D866F1DDDCE6", "isAvailable" : true, "state" : "Booted", "name" : "iPhone 18 Pro Max" }
        ]
      }
    }"#;

    #[test]
    fn keeps_the_ios_simulators_with_their_version_and_state() {
        let simulators = ios_simulators(LISTING).unwrap();

        assert_eq!(
            simulators,
            [
                Simulator {
                    name: "iPhone 18 Pro".to_owned(),
                    udid: "75BD17D7-0A6C-48A1-9768-568ACF690500".to_owned(),
                    ios_version: "27.0".to_owned(),
                    is_booted: false,
                },
                Simulator {
                    name: "iPhone 18 Pro Max".to_owned(),
                    udid: "2AD917AF-392E-4478-8CF1-D866F1DDDCE6".to_owned(),
                    ios_version: "27.0".to_owned(),
                    is_booted: true,
                },
            ]
        );
    }

    #[test]
    fn rejects_a_listing_that_is_not_simctl_json() {
        assert!(ios_simulators("== Devices ==").is_err());
    }

    const DEVICE_LISTING: &str = r#"{
      "info" : { "outcome" : "success", "jsonVersion" : 5 },
      "result" : {
        "devices" : [
          {
            "connectionProperties" : { "pairingState" : "paired", "transportType" : "sameMachine", "tunnelState" : "disconnected" },
            "deviceProperties" : { "name" : "iPhone 18 Pro", "bootState" : "shutdown" },
            "hardwareProperties" : { "platform" : "iOS", "reality" : "simulated", "udid" : "75BD17D7-0A6C-48A1-9768-568ACF690500" }
          },
          {
            "connectionProperties" : { "pairingState" : "paired", "transportType" : "wired", "tunnelState" : "connected" },
            "deviceProperties" : { "name" : "Test iPhone" },
            "hardwareProperties" : { "platform" : "iOS", "reality" : "physical", "udid" : "00008140-000A1B2C3D4E5F60" }
          },
          {
            "connectionProperties" : { "pairingState" : "paired", "tunnelState" : "unavailable" },
            "deviceProperties" : { "name" : "Test iPad" },
            "hardwareProperties" : { "platform" : "iOS", "reality" : "physical", "udid" : "00008140-000A1B2C3D4E5F61" }
          },
          {
            "connectionProperties" : { "pairingState" : "paired", "transportType" : "localNetwork" },
            "deviceProperties" : { "name" : "Test Watch" },
            "hardwareProperties" : { "platform" : "watchOS", "reality" : "physical", "udid" : "00008140-000A1B2C3D4E5F62" }
          }
        ]
      }
    }"#;

    #[test]
    fn keeps_the_physical_ios_devices_and_whether_they_are_reachable() {
        let devices = physical_ios_devices(DEVICE_LISTING).unwrap();

        assert_eq!(
            devices,
            [
                PhysicalDevice {
                    name: "Test iPhone".to_owned(),
                    udid: "00008140-000A1B2C3D4E5F60".to_owned(),
                    is_reachable: true,
                },
                PhysicalDevice {
                    name: "Test iPad".to_owned(),
                    udid: "00008140-000A1B2C3D4E5F61".to_owned(),
                    is_reachable: false,
                },
            ]
        );
    }
}
