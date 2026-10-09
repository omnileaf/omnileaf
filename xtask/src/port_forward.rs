//! Keeps the dev server's port forwarded to every attached Android device while a dev session runs.

use std::{
    collections::HashMap,
    path::PathBuf,
    sync::mpsc::{self, RecvTimeoutError, Sender},
    thread,
    time::Duration,
};

use crate::{
    android::{self, AdbState},
    devices::adb_on,
    process::Machine,
};

const CHECK_EVERY: Duration = Duration::from_secs(2);
const LIST_FORWARDS: &[&str] = &["reverse", "--list"];

/// The connection each device was last forwarded on, by serial.
pub(crate) type Seen = HashMap<String, Option<String>>;

pub(crate) struct PortForward {
    adb: PathBuf,
    port: String,
}

impl PortForward {
    pub(crate) fn new(adb: PathBuf, port: u16) -> Self {
        Self {
            adb,
            port: format!("tcp:{port}"),
        }
    }

    /// Replaces the forward on each ready device that is new or has connected again since `seen`, since adb can still list a forward that no longer works and Tauri keeps any it finds, and adds back any forward missing from the rest.
    pub(crate) fn follow(&self, machine: &impl Machine, seen: &mut Seen) {
        let Some(listing) = machine.stdout_of(self.adb.as_os_str(), android::LIST_ATTACHED) else {
            return;
        };
        for attached in android::attached_devices(&listing) {
            if attached.state != AdbState::Ready {
                continue;
            }
            let serial = attached.serial.as_str();
            if seen.get(serial) != Some(&attached.transport) {
                if self.replace(machine, serial) {
                    seen.insert(attached.serial, attached.transport);
                }
            } else if !self.is_forwarded(machine, serial) {
                self.add(machine, serial);
            }
        }
    }

    fn replace(&self, machine: &impl Machine, serial: &str) -> bool {
        adb_on(
            machine,
            &self.adb,
            serial,
            &["reverse", "--remove", &self.port],
        );
        self.add(machine, serial)
    }

    fn add(&self, machine: &impl Machine, serial: &str) -> bool {
        adb_on(
            machine,
            &self.adb,
            serial,
            &["reverse", &self.port, &self.port],
        )
        .is_some()
    }

    /// Reads `adb reverse --list`, where each line names the connection, then the device's port and the computer's.
    fn is_forwarded(&self, machine: &impl Machine, serial: &str) -> bool {
        adb_on(machine, &self.adb, serial, LIST_FORWARDS).is_some_and(|listing| {
            listing.lines().any(|line| {
                let mut ports = line.split_whitespace().skip(1);
                ports.next() == Some(self.port.as_str()) && ports.next() == Some(self.port.as_str())
            })
        })
    }
}

/// Forwards to the attached devices, then follows them as they connect again until the returned sender is dropped, all off the caller's thread so a stuck adb can't hold up the session.
pub(crate) fn keep(forward: PortForward, machine: impl Machine + Send + 'static) -> Sender<()> {
    let (stop, stopped) = mpsc::channel();
    thread::spawn(move || {
        let mut seen = Seen::new();
        loop {
            forward.follow(&machine, &mut seen);
            if stopped.recv_timeout(CHECK_EVERY) != Err(RecvTimeoutError::Timeout) {
                break;
            }
        }
    });
    stop
}

#[cfg(test)]
mod tests {
    use std::{
        collections::HashSet,
        ffi::OsStr,
        path::Path,
        sync::{Arc, Mutex},
        time::Instant,
    };

    use super::*;

    const ADB: &str = "/sdk/platform-tools/adb";
    const PHONE: &str = "adb-46181FDAP00204-1lELGu._adb-tls-connect._tcp";
    const EMULATOR: &str = "emulator-5554";
    const ATTACHED: &str = "List of devices attached\n\
        adb-46181FDAP00204-1lELGu._adb-tls-connect._tcp device product:caiman model:Pixel_9_Pro transport_id:983\n\
        emulator-5554 device model:sdk_gphone64_arm64 transport_id:4\n\
        R5CT10ABCDE unauthorized usb:1-1 transport_id:3\n";
    const PHONE_RECONNECTED: &str = "List of devices attached\n\
        adb-46181FDAP00204-1lELGu._adb-tls-connect._tcp device product:caiman model:Pixel_9_Pro transport_id:991\n\
        emulator-5554 device model:sdk_gphone64_arm64 transport_id:4\n";
    const WITHOUT_CONNECTIONS: &str = "List of devices attached\n\
        adb-46181FDAP00204-1lELGu._adb-tls-connect._tcp device product:caiman model:Pixel_9_Pro\n";

    #[derive(Default)]
    struct Adb {
        attached: Option<&'static str>,
        forwarded: HashSet<String>,
        refusing: HashSet<String>,
        changes: Vec<String>,
    }

    #[derive(Clone, Default)]
    struct FakeAdb(Arc<Mutex<Adb>>);

    impl FakeAdb {
        fn listing(attached: Option<&'static str>) -> Self {
            let adb = Self::default();
            adb.with(|adb| adb.attached = attached);
            adb
        }

        fn with<T>(&self, change: impl FnOnce(&mut Adb) -> T) -> T {
            change(&mut self.0.lock().unwrap())
        }

        fn changes(&self) -> Vec<String> {
            self.with(|adb| adb.changes.clone())
        }

        fn forget_changes(&self) {
            self.with(|adb| adb.changes.clear());
        }
    }

    impl Machine for FakeAdb {
        fn stdout_of(&self, program: &OsStr, args: &[&str]) -> Option<String> {
            assert_eq!(Path::new(program), Path::new(ADB));
            self.with(|adb| match args {
                ["devices", "-l"] => adb.attached.map(str::to_owned),
                ["-s", serial, "reverse", "--list"] => Some(if adb.forwarded.contains(*serial) {
                    "host-43 tcp:1420 tcp:1420\n".to_owned()
                } else {
                    String::new()
                }),
                ["-s", serial, "reverse", "--remove", "tcp:1420"] => {
                    adb.changes.push(args.join(" "));
                    adb.forwarded.remove(*serial).then(String::new)
                }
                ["-s", serial, "reverse", "tcp:1420", "tcp:1420"] => {
                    adb.changes.push(args.join(" "));
                    (!adb.refusing.contains(*serial)).then(|| {
                        adb.forwarded.insert((*serial).to_owned());
                        "1420\n".to_owned()
                    })
                }
                _ => panic!("unexpected adb call: {args:?}"),
            })
        }
    }

    fn replaced(serial: &str) -> Vec<String> {
        vec![
            format!("-s {serial} reverse --remove tcp:1420"),
            added(serial),
        ]
    }

    fn added(serial: &str) -> String {
        format!("-s {serial} reverse tcp:1420 tcp:1420")
    }

    fn forward() -> PortForward {
        PortForward::new(PathBuf::from(ADB), 1420)
    }

    fn followed_once(attached: &'static str) -> (FakeAdb, Seen) {
        let adb = FakeAdb::listing(Some(attached));
        let mut seen = Seen::new();
        forward().follow(&adb, &mut seen);
        adb.forget_changes();
        (adb, seen)
    }

    #[test]
    fn replaces_the_forward_on_every_ready_device_it_has_not_seen() {
        let adb = FakeAdb::listing(Some(ATTACHED));

        forward().follow(&adb, &mut Seen::new());

        assert_eq!(
            adb.changes(),
            [replaced(PHONE), replaced(EMULATOR)].concat()
        );
    }

    #[test]
    fn leaves_the_forwards_alone_while_the_devices_stay_connected() {
        let (adb, mut seen) = followed_once(ATTACHED);

        forward().follow(&adb, &mut seen);

        assert!(adb.changes().is_empty());
    }

    #[test]
    fn replaces_the_forward_on_a_device_that_connected_again() {
        let (adb, mut seen) = followed_once(ATTACHED);
        adb.with(|adb| adb.attached = Some(PHONE_RECONNECTED));

        forward().follow(&adb, &mut seen);

        assert_eq!(adb.changes(), replaced(PHONE));
    }

    #[test]
    fn adds_back_a_forward_that_went_missing_on_the_same_connection() {
        let (adb, mut seen) = followed_once(ATTACHED);
        adb.with(|adb| adb.forwarded.remove(PHONE));

        forward().follow(&adb, &mut seen);

        assert_eq!(adb.changes(), [added(PHONE)]);
    }

    #[test]
    fn adds_back_a_missing_forward_when_adb_shows_no_connections() {
        let (adb, mut seen) = followed_once(WITHOUT_CONNECTIONS);
        adb.with(|adb| adb.forwarded.clear());

        forward().follow(&adb, &mut seen);

        assert_eq!(adb.changes(), [added(PHONE)]);
    }

    #[test]
    fn tries_again_where_the_forward_could_not_be_added() {
        let adb = FakeAdb::listing(Some(ATTACHED));
        let mut seen = Seen::new();
        adb.with(|adb| adb.refusing.insert(PHONE.to_owned()));
        forward().follow(&adb, &mut seen);
        adb.with(|adb| adb.refusing.clear());
        adb.forget_changes();

        forward().follow(&adb, &mut seen);

        assert_eq!(adb.changes(), replaced(PHONE));
    }

    #[test]
    fn does_nothing_when_adb_cannot_list_the_devices() {
        let adb = FakeAdb::listing(None);

        forward().follow(&adb, &mut Seen::new());

        assert!(adb.changes().is_empty());
    }

    #[test]
    fn forwards_to_the_attached_devices_without_waiting_for_the_first_check() {
        let adb = FakeAdb::listing(Some(ATTACHED));
        let deadline = Instant::now() + CHECK_EVERY / 2;

        let stop = keep(forward(), adb.clone());

        while adb.changes().len() < 4 && Instant::now() < deadline {
            thread::yield_now();
        }
        assert_eq!(
            adb.changes(),
            [replaced(PHONE), replaced(EMULATOR)].concat()
        );
        drop(stop);
    }
}
