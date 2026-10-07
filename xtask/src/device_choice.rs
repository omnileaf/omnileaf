//! Settles which phone, emulator or Simulator `dev` runs on, asking when it isn't obvious.

use std::io::{self, BufRead, IsTerminal, Write};

use crate::devices::{self, Device, State, normalized};

const ATTEMPTS: usize = 3;

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Reason {
    NotNamed,
    Ambiguous { chosen: String },
    NoMatch { chosen: String },
}

#[derive(Debug, PartialEq, Eq)]
pub(crate) enum Choice<'a> {
    Use(&'a Device),
    Ask {
        reason: Reason,
        options: Vec<&'a Device>,
    },
    Unusable(&'a Device),
    NoneAvailable,
}

/// Picks from one platform's devices: the one the name finds, or else the only ready one, and otherwise says what to ask.
pub(crate) fn resolve<'a>(devices: &'a [Device], chosen: Option<&str>) -> Choice<'a> {
    let usable: Vec<&Device> = devices.iter().filter(|device| is_usable(device)).collect();
    let Some(chosen) = chosen else {
        return not_named(usable);
    };
    let answering: Vec<&Device> = devices
        .iter()
        .filter(|device| device.answers_to(chosen))
        .collect();
    match answering.as_slice() {
        [only] if is_usable(only) => Choice::Use(only),
        [only] => Choice::Unusable(only),
        [] => no_match(usable, chosen),
        several => Choice::Ask {
            reason: Reason::Ambiguous {
                chosen: chosen.to_owned(),
            },
            options: several
                .iter()
                .copied()
                .filter(|device| is_usable(device))
                .collect(),
        },
    }
}

fn is_usable(device: &Device) -> bool {
    match device.state {
        State::Ready => true,
        State::Off => device.kind.is_virtual(),
        State::Unauthorized | State::Offline => false,
    }
}

fn not_named(usable: Vec<&Device>) -> Choice<'_> {
    let (ready, waiting): (Vec<&Device>, Vec<&Device>) = usable
        .into_iter()
        .partition(|device| device.state == State::Ready);
    match (ready.as_slice(), waiting.is_empty()) {
        ([], true) => Choice::NoneAvailable,
        ([only], _) => Choice::Use(only),
        _ => Choice::Ask {
            reason: Reason::NotNamed,
            options: ready.into_iter().chain(waiting).collect(),
        },
    }
}

fn no_match<'a>(usable: Vec<&'a Device>, chosen: &str) -> Choice<'a> {
    if usable.is_empty() {
        return Choice::NoneAvailable;
    }
    let wanted = normalized(chosen);
    let close: Vec<&Device> = usable
        .iter()
        .copied()
        .filter(|device| {
            let name = normalized(&device.name);
            !wanted.is_empty() && (name.contains(&wanted) || wanted.contains(&name))
        })
        .collect();
    Choice::Ask {
        reason: Reason::NoMatch {
            chosen: chosen.to_owned(),
        },
        options: if close.is_empty() { usable } else { close },
    }
}

/// Settles one platform's device into the name Tauri matches, asking in a terminal when the choice isn't obvious.
pub(crate) fn settle(
    platform: &str,
    devices: &[Device],
    chosen: Option<&str>,
) -> anyhow::Result<String> {
    match resolve(devices, chosen) {
        Choice::Use(device) => Ok(device.name.clone()),
        Choice::Ask { reason, options } => {
            ask(&heading(platform, &reason), &options).map(|device| device.name.clone())
        }
        Choice::Unusable(device) => anyhow::bail!(
            "{} is {}, so it can't run the app; connect and unlock it, and accept any prompt to trust this computer",
            device.name,
            device.state
        ),
        Choice::NoneAvailable => anyhow::bail!(
            "no {platform} device found to run on; cargo xtask doctor shows what's missing"
        ),
    }
}

fn heading(platform: &str, reason: &Reason) -> String {
    match reason {
        Reason::NotNamed => format!("Which {platform} device?"),
        Reason::Ambiguous { chosen } => {
            format!("Several {platform} devices answer to {chosen}. Which one?")
        }
        Reason::NoMatch { chosen } => {
            format!("No {platform} device is called {chosen}. Did you mean one of these?")
        }
    }
}

/// What to print instead of asking when no one can answer, ending in a command to copy.
fn unanswerable(heading: &str, options: &[&Device]) -> String {
    let example = options.first().map(|device| {
        format!(
            "name one, for example: {}",
            devices::example_command(device)
        )
    });
    [heading.to_owned()]
        .into_iter()
        .chain(menu_lines(options))
        .chain(example)
        .collect::<Vec<_>>()
        .join("\n")
}

#[expect(clippy::print_stdout, reason = "the menu is the command's output")]
fn ask<'a>(heading: &str, options: &[&'a Device]) -> anyhow::Result<&'a Device> {
    let stdin = io::stdin();
    anyhow::ensure!(stdin.is_terminal(), "{}", unanswerable(heading, options));
    println!("{heading}");
    for line in menu_lines(options) {
        println!("{line}");
    }
    let mut lines = stdin.lock().lines();
    for _ in 0..ATTEMPTS {
        print!("> ");
        io::stdout().flush()?;
        let Some(line) = lines.next().transpose()? else {
            break;
        };
        if let Some(device) = parse_pick(&line, options.len()).and_then(|index| options.get(index))
        {
            return Ok(device);
        }
        println!("pick a number from 1 to {}", options.len());
    }
    anyhow::bail!("{}", unanswerable(heading, options))
}

/// Numbers the options, showing each one's kind and state so a phone and an emulator with similar names stay apart.
pub(crate) fn menu_lines(options: &[&Device]) -> Vec<String> {
    let name_width = options
        .iter()
        .map(|device| device.name.len())
        .max()
        .unwrap_or_default();
    let kind_width = options
        .iter()
        .map(|device| device.kind.short_name().len())
        .max()
        .unwrap_or_default();
    options
        .iter()
        .enumerate()
        .map(|(index, device)| {
            format!(
                "  {number}) {name:<name_width$}  {kind:<kind_width$}  {state}",
                number = index + 1,
                name = device.name,
                kind = device.kind.short_name(),
                state = device.state,
            )
        })
        .collect()
}

/// Reads a 1-based pick from the menu, returning its 0-based index.
pub(crate) fn parse_pick(input: &str, count: usize) -> Option<usize> {
    let number: usize = input.trim().parse().ok()?;
    (1..=count).contains(&number).then(|| number - 1)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::devices::Kind;

    fn device(kind: Kind, state: State, name: &str) -> Device {
        Device {
            kind,
            state,
            name: name.to_owned(),
            id: Some(format!("{name}-id")),
        }
    }

    fn ios() -> Vec<Device> {
        vec![
            device(Kind::IosDevice, State::Off, "Test iPhone"),
            device(Kind::IosSimulator, State::Off, "iPhone 18 Pro"),
            device(Kind::IosSimulator, State::Off, "iPhone 18 Pro Max"),
            device(Kind::IosSimulator, State::Off, "iPad Air 11-inch (M4)"),
        ]
    }

    fn android() -> Vec<Device> {
        vec![
            device(Kind::AndroidDevice, State::Ready, "Pixel 9 Pro"),
            device(Kind::AndroidDevice, State::Unauthorized, "R5CT10ABCDE"),
            device(Kind::AndroidEmulator, State::Ready, "Pixel_10_Pro"),
            device(Kind::AndroidEmulator, State::Off, "Pixel_10_Pro_XL"),
        ]
    }

    #[test]
    fn uses_the_device_a_forgiving_name_finds() {
        let (ios, android) = (ios(), android());

        let choices = [
            resolve(&ios, Some("iphone-18-pro-max")),
            resolve(&android, Some("pixel-9-pro")),
            resolve(&android, Some("pixel_10_pro_xl")),
        ];

        assert_eq!(
            choices,
            [
                Choice::Use(&ios[2]),
                Choice::Use(&android[0]),
                Choice::Use(&android[3])
            ]
        );
    }

    #[test]
    fn offers_the_close_matches_for_a_name_that_finds_nothing() {
        let devices = ios();

        let choice = resolve(&devices, Some("iphone-18"));

        assert_eq!(
            choice,
            Choice::Ask {
                reason: Reason::NoMatch {
                    chosen: "iphone-18".to_owned()
                },
                options: vec![&devices[1], &devices[2]],
            }
        );
    }

    #[test]
    fn offers_every_usable_device_when_nothing_is_close() {
        let devices = android();

        let choice = resolve(&devices, Some("nexus"));

        assert_eq!(
            choice,
            Choice::Ask {
                reason: Reason::NoMatch {
                    chosen: "nexus".to_owned()
                },
                options: vec![&devices[0], &devices[2], &devices[3]],
            }
        );
    }

    #[test]
    fn asks_which_when_a_name_finds_several() {
        let devices = vec![
            device(Kind::AndroidEmulator, State::Off, "Pixel 10 Pro"),
            device(Kind::AndroidEmulator, State::Off, "Pixel_10_Pro"),
        ];

        let choice = resolve(&devices, Some("pixel-10-pro"));

        assert_eq!(
            choice,
            Choice::Ask {
                reason: Reason::Ambiguous {
                    chosen: "pixel-10-pro".to_owned()
                },
                options: vec![&devices[0], &devices[1]],
            }
        );
    }

    #[test]
    fn refuses_a_named_phone_that_needs_unlocking_or_is_unreachable() {
        let (android, ios) = (android(), ios());

        let choices = [
            resolve(&android, Some("R5CT10ABCDE")),
            resolve(&ios, Some("test-iphone")),
        ];

        assert_eq!(
            choices,
            [Choice::Unusable(&android[1]), Choice::Unusable(&ios[0])]
        );
    }

    #[test]
    fn uses_the_only_ready_device_when_none_is_named() {
        let devices = vec![
            device(Kind::IosSimulator, State::Off, "iPhone 18 Pro"),
            device(Kind::IosDevice, State::Ready, "Test iPhone"),
        ];

        assert_eq!(resolve(&devices, None), Choice::Use(&devices[1]));
    }

    #[test]
    fn asks_which_when_several_are_ready_or_none_is() {
        let (android, ios) = (android(), ios());

        let choices = [resolve(&android, None), resolve(&ios, None)];

        assert_eq!(
            choices,
            [
                Choice::Ask {
                    reason: Reason::NotNamed,
                    options: vec![&android[0], &android[2], &android[3]],
                },
                Choice::Ask {
                    reason: Reason::NotNamed,
                    options: vec![&ios[1], &ios[2], &ios[3]],
                },
            ]
        );
    }

    #[test]
    fn finds_nothing_without_a_usable_device() {
        let devices = vec![device(
            Kind::AndroidDevice,
            State::Unauthorized,
            "R5CT10ABCDE",
        )];

        assert_eq!(resolve(&devices, None), Choice::NoneAvailable);
    }

    #[test]
    fn numbers_the_options_with_their_kind_and_state() {
        let devices = android();

        let lines = menu_lines(&[&devices[0], &devices[3]]);

        assert_eq!(
            lines,
            [
                "  1) Pixel 9 Pro      device    ready",
                "  2) Pixel_10_Pro_XL  emulator  off",
            ]
        );
    }

    #[test]
    fn reads_a_pick_within_the_menu() {
        let picks = ["1", " 3\n", "0", "4", "two", ""].map(|input| parse_pick(input, 3));

        assert_eq!(picks, [Some(0), Some(2), None, None, None, None]);
    }

    #[test]
    fn says_why_it_asks() {
        let headings = [
            Reason::NotNamed,
            Reason::Ambiguous {
                chosen: "pixel-10-pro".to_owned(),
            },
            Reason::NoMatch {
                chosen: "iphone-18".to_owned(),
            },
        ]
        .map(|reason| heading("iOS", &reason));

        assert_eq!(
            headings,
            [
                "Which iOS device?",
                "Several iOS devices answer to pixel-10-pro. Which one?",
                "No iOS device is called iphone-18. Did you mean one of these?",
            ]
        );
    }

    #[test]
    fn lists_the_choices_and_a_command_to_copy_when_no_one_can_answer() {
        let devices = ios();

        let message = unanswerable("Which iOS device?", &[&devices[1], &devices[2]]);

        assert_eq!(
            message,
            "Which iOS device?\n  1) iPhone 18 Pro      simulator  off\n  2) iPhone 18 Pro Max  simulator  off\nname one, for example: cargo xtask dev --ios-device \"iPhone 18 Pro\""
        );
    }
}
