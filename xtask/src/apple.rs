//! Reads the iOS Simulators and devices Xcode's tools report.

use std::collections::BTreeMap;

use serde::Deserialize;

pub(crate) const LIST_SIMULATORS: &[&str] = &["simctl", "list", "devices", "available", "--json"];

const IOS_RUNTIME_PREFIX: &str = "com.apple.CoreSimulator.SimRuntime.iOS-";
const BOOTED: &str = "Booted";

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct Simulator {
    pub(crate) name: String,
    pub(crate) udid: String,
    pub(crate) ios_version: String,
    pub(crate) is_booted: bool,
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
}
