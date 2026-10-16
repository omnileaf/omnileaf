use serde::{Deserialize, Serialize};
use specta::Type;
use tauri_specta::Event;

#[cfg(desktop)]
pub(crate) use desktop::show;

#[derive(Clone, Debug, Deserialize, Type)]
#[serde(rename_all = "camelCase")]
#[cfg_attr(
    all(mobile, not(test)),
    expect(dead_code, reason = "only the desktop has a tray to read it into")
)]
pub(crate) struct TrayMenu {
    open: String,
    screenshot_mode: String,
    screenshot_mode_state: String,
    is_screenshot_mode_on: bool,
    screenshot_mode_shortcut: TrayShortcut,
    continue_reading: String,
    has_book_to_continue: bool,
    quit: String,
}

#[derive(Clone, Copy, Debug, Deserialize, Type)]
#[cfg_attr(
    all(mobile, not(test)),
    expect(dead_code, reason = "only the desktop has a tray to read it into")
)]
pub(crate) struct TrayShortcut {
    letter: char,
    shift: bool,
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, Type, Event)]
#[serde(rename_all = "camelCase")]
pub(crate) enum TrayItemChosen {
    ScreenshotMode,
    ContinueReading,
}

#[cfg(any(desktop, test))]
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum TrayItem {
    Open,
    ScreenshotMode,
    ScreenshotModeState,
    ContinueReading,
    Quit,
}

#[cfg(any(desktop, test))]
#[derive(Debug, PartialEq, Eq)]
enum TrayEntry {
    Item {
        item: TrayItem,
        text: String,
        is_enabled: bool,
    },
    Check {
        item: TrayItem,
        text: String,
        is_checked: bool,
        accelerator: Option<String>,
    },
    Separator,
}

#[cfg(any(desktop, test))]
impl TrayItem {
    const ALL: [Self; 5] = [
        Self::Open,
        Self::ScreenshotMode,
        Self::ScreenshotModeState,
        Self::ContinueReading,
        Self::Quit,
    ];

    const fn id(self) -> &'static str {
        match self {
            Self::Open => "open",
            Self::ScreenshotMode => "screenshot-mode",
            Self::ScreenshotModeState => "screenshot-mode-state",
            Self::ContinueReading => "continue-reading",
            Self::Quit => "quit",
        }
    }

    fn with_id(id: &str) -> Option<Self> {
        Self::ALL.into_iter().find(|item| item.id() == id)
    }
}

#[cfg(any(desktop, test))]
const MNEMONIC_MARK: &str = "&";
#[cfg(any(desktop, test))]
const SHOWN_AMPERSAND: &str = "&&";

#[cfg(any(desktop, test))]
impl TrayShortcut {
    fn accelerator(self) -> Option<String> {
        if !self.letter.is_ascii_uppercase() {
            return None;
        }
        let shift = if self.shift { "Shift+" } else { "" };
        Some(format!("CmdOrCtrl+{shift}{}", self.letter))
    }
}

#[cfg(any(desktop, test))]
fn shown(text: &str) -> String {
    text.replace(MNEMONIC_MARK, SHOWN_AMPERSAND)
}

#[cfg(any(desktop, test))]
fn item(item: TrayItem, text: &str, is_enabled: bool) -> TrayEntry {
    TrayEntry::Item {
        item,
        text: shown(text),
        is_enabled,
    }
}

#[cfg(any(desktop, test))]
fn entries(menu: &TrayMenu) -> Vec<TrayEntry> {
    vec![
        item(TrayItem::Open, &menu.open, true),
        TrayEntry::Check {
            item: TrayItem::ScreenshotMode,
            text: shown(&menu.screenshot_mode),
            is_checked: menu.is_screenshot_mode_on,
            accelerator: menu.screenshot_mode_shortcut.accelerator(),
        },
        item(
            TrayItem::ScreenshotModeState,
            &menu.screenshot_mode_state,
            false,
        ),
        item(
            TrayItem::ContinueReading,
            &menu.continue_reading,
            menu.has_book_to_continue,
        ),
        TrayEntry::Separator,
        item(TrayItem::Quit, &menu.quit, true),
    ]
}

#[cfg(desktop)]
mod desktop {
    use tauri::{
        AppHandle, Manager, Wry,
        image::Image,
        menu::{CheckMenuItem, IsMenuItem, Menu, MenuEvent, MenuItem, PredefinedMenuItem},
        tray::TrayIconBuilder,
    };
    use tauri_specta::Event;

    use super::{TrayEntry, TrayItem, TrayItemChosen, TrayMenu, entries};

    const TRAY_ID: &str = "omnileaf";
    const MAIN_WINDOW: &str = "main";
    #[cfg(not(target_os = "macos"))]
    const TRAY_ICON: &[u8] = include_bytes!("../icons/tray.png");
    #[cfg(target_os = "macos")]
    const TRAY_ICON: &[u8] = include_bytes!("../icons/tray-macos.png");

    pub(crate) fn show(app: &AppHandle, menu: &TrayMenu) -> tauri::Result<()> {
        #[cfg(target_os = "linux")]
        if !super::linux::has_app_indicator() {
            return Ok(());
        }
        let built = build_menu(app, menu)?;
        if let Some(tray) = app.tray_by_id(TRAY_ID) {
            return tray.set_menu(Some(built));
        }
        TrayIconBuilder::with_id(TRAY_ID)
            .icon(Image::from_bytes(TRAY_ICON)?)
            .icon_as_template(cfg!(target_os = "macos"))
            .tooltip(app.package_info().name.clone())
            .menu(&built)
            .show_menu_on_left_click(true)
            .on_menu_event(|app, event| choose(app, &event))
            .build(app)
            .map(drop)
    }

    fn build_menu(app: &AppHandle, menu: &TrayMenu) -> tauri::Result<Menu<Wry>> {
        let items = entries(menu)
            .into_iter()
            .map(|entry| menu_item(app, entry))
            .collect::<tauri::Result<Vec<_>>>()?;
        let borrowed: Vec<&dyn IsMenuItem<Wry>> = items.iter().map(AsRef::as_ref).collect();
        Menu::with_items(app, &borrowed)
    }

    fn menu_item(app: &AppHandle, entry: TrayEntry) -> tauri::Result<Box<dyn IsMenuItem<Wry>>> {
        Ok(match entry {
            TrayEntry::Item {
                item,
                text,
                is_enabled,
            } => Box::new(MenuItem::with_id(
                app,
                item.id(),
                text,
                is_enabled,
                None::<&str>,
            )?),
            TrayEntry::Check {
                item,
                text,
                is_checked,
                accelerator,
            } => Box::new(CheckMenuItem::with_id(
                app,
                item.id(),
                text,
                true,
                is_checked,
                accelerator,
            )?),
            TrayEntry::Separator => Box::new(PredefinedMenuItem::separator(app)?),
        })
    }

    fn choose(app: &AppHandle, event: &MenuEvent) {
        match TrayItem::with_id(event.id().as_ref()) {
            Some(TrayItem::Open) => bring_forward(app),
            Some(TrayItem::ScreenshotMode) => tell(app, TrayItemChosen::ScreenshotMode),
            Some(TrayItem::ContinueReading) => {
                bring_forward(app);
                tell(app, TrayItemChosen::ContinueReading);
            }
            Some(TrayItem::Quit) => app.exit(0),
            Some(TrayItem::ScreenshotModeState) | None => {}
        }
    }

    fn tell(app: &AppHandle, chosen: TrayItemChosen) {
        if let Err(error) = chosen.emit(app) {
            tracing::warn!(%error, ?chosen, "tell the interface a tray item was chosen");
        }
    }

    fn bring_forward(app: &AppHandle) {
        let Some(window) = app.get_webview_window(MAIN_WINDOW) else {
            return;
        };
        let shown = window
            .unminimize()
            .and_then(|()| window.show())
            .and_then(|()| window.set_focus());
        if let Err(error) = shown {
            tracing::warn!(%error, "bring the window forward from the tray");
        }
    }
}

#[cfg(target_os = "linux")]
mod linux {
    use std::path::{Path, PathBuf};

    const APP_INDICATOR_LIBRARIES: [&str; 2] =
        ["libayatana-appindicator3.so.1", "libappindicator3.so.1"];
    const LIBRARY_PATH_VARIABLE: &str = "LD_LIBRARY_PATH";
    const LIBRARY_FOLDERS: [&str; 6] = [
        "/usr/lib",
        "/usr/lib64",
        "/lib",
        "/lib64",
        "/usr/local/lib",
        "/app/lib",
    ];

    /// The tray's `AppIndicator` loader panics when neither Ayatana's nor the original appindicator library is installed, so the tray is left out without one.
    pub(super) fn has_app_indicator() -> bool {
        let from_environment = std::env::var_os(LIBRARY_PATH_VARIABLE)
            .map(|paths| std::env::split_paths(&paths).collect::<Vec<_>>())
            .unwrap_or_default();
        has_app_indicator_in(from_environment.into_iter().chain(system_library_folders()))
    }

    fn system_library_folders() -> impl Iterator<Item = PathBuf> {
        let multiarch = format!("/usr/lib/{}-linux-gnu", std::env::consts::ARCH);
        LIBRARY_FOLDERS
            .into_iter()
            .map(PathBuf::from)
            .chain([PathBuf::from(multiarch)])
    }

    pub(super) fn has_app_indicator_in(folders: impl IntoIterator<Item = PathBuf>) -> bool {
        folders
            .into_iter()
            .any(|folder| holds_app_indicator(&folder))
    }

    fn holds_app_indicator(folder: &Path) -> bool {
        APP_INDICATOR_LIBRARIES
            .iter()
            .any(|library| folder.join(library).is_file())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn menu() -> TrayMenu {
        TrayMenu {
            open: "Open Omnileaf".to_owned(),
            screenshot_mode: "Screenshot mode".to_owned(),
            screenshot_mode_state: "On · turns off at 22:14".to_owned(),
            is_screenshot_mode_on: true,
            screenshot_mode_shortcut: TrayShortcut {
                letter: 'H',
                shift: true,
            },
            continue_reading: "Continue reading".to_owned(),
            has_book_to_continue: true,
            quit: "Quit Omnileaf".to_owned(),
        }
    }

    fn check_entry(entries: &[TrayEntry]) -> Option<&TrayEntry> {
        entries
            .iter()
            .find(|entry| matches!(entry, TrayEntry::Check { .. }))
    }

    #[test]
    fn lists_open_screenshot_mode_with_its_state_continue_reading_and_quit() {
        let listed = entries(&menu());

        assert_eq!(
            listed,
            vec![
                TrayEntry::Item {
                    item: TrayItem::Open,
                    text: "Open Omnileaf".to_owned(),
                    is_enabled: true,
                },
                TrayEntry::Check {
                    item: TrayItem::ScreenshotMode,
                    text: "Screenshot mode".to_owned(),
                    is_checked: true,
                    accelerator: Some("CmdOrCtrl+Shift+H".to_owned()),
                },
                TrayEntry::Item {
                    item: TrayItem::ScreenshotModeState,
                    text: "On · turns off at 22:14".to_owned(),
                    is_enabled: false,
                },
                TrayEntry::Item {
                    item: TrayItem::ContinueReading,
                    text: "Continue reading".to_owned(),
                    is_enabled: true,
                },
                TrayEntry::Separator,
                TrayEntry::Item {
                    item: TrayItem::Quit,
                    text: "Quit Omnileaf".to_owned(),
                    is_enabled: true,
                },
            ]
        );
    }

    #[test]
    fn leaves_screenshot_mode_unticked_while_it_is_off() {
        let off = TrayMenu {
            is_screenshot_mode_on: false,
            ..menu()
        };

        let listed = entries(&off);

        assert!(matches!(
            check_entry(&listed),
            Some(TrayEntry::Check {
                is_checked: false,
                ..
            })
        ));
    }

    #[test]
    fn names_a_chosen_shortcut_without_shift() {
        let chosen = TrayMenu {
            screenshot_mode_shortcut: TrayShortcut {
                letter: 'J',
                shift: false,
            },
            ..menu()
        };

        let listed = entries(&chosen);

        assert!(matches!(
            check_entry(&listed),
            Some(TrayEntry::Check { accelerator: Some(keys), .. }) if keys == "CmdOrCtrl+J"
        ));
    }

    #[test]
    fn leaves_out_a_shortcut_that_is_not_a_capital_letter() {
        let odd = TrayMenu {
            screenshot_mode_shortcut: TrayShortcut {
                letter: '+',
                shift: false,
            },
            ..menu()
        };

        let listed = entries(&odd);

        assert!(matches!(
            check_entry(&listed),
            Some(TrayEntry::Check {
                accelerator: None,
                ..
            })
        ));
    }

    #[test]
    fn greys_continue_reading_out_with_no_book_to_continue() {
        let nothing_read = TrayMenu {
            has_book_to_continue: false,
            ..menu()
        };

        let listed = entries(&nothing_read);

        assert!(listed.contains(&TrayEntry::Item {
            item: TrayItem::ContinueReading,
            text: "Continue reading".to_owned(),
            is_enabled: false,
        }));
    }

    #[test]
    fn shows_an_ampersand_instead_of_reading_it_as_a_mnemonic() {
        let translated = TrayMenu {
            open: "Open & read".to_owned(),
            ..menu()
        };

        let listed = entries(&translated);

        assert!(matches!(
            listed.first(),
            Some(TrayEntry::Item { text, .. }) if text == "Open && read"
        ));
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn finds_ayatanas_app_indicator_in_a_library_folder() {
        let folder = std::env::temp_dir().join(format!("omnileaf-tray-{}", std::process::id()));
        std::fs::create_dir_all(&folder).unwrap();
        std::fs::write(folder.join("libayatana-appindicator3.so.1"), b"").unwrap();

        let found = linux::has_app_indicator_in([folder.clone()]);
        std::fs::remove_dir_all(&folder).unwrap();

        assert!(found);
    }

    #[cfg(target_os = "linux")]
    #[test]
    fn finds_no_app_indicator_in_an_empty_folder() {
        let found =
            linux::has_app_indicator_in([std::env::temp_dir().join("omnileaf-no-such-folder")]);

        assert!(!found);
    }

    #[test]
    fn finds_each_item_by_its_id() {
        let found: Vec<Option<TrayItem>> = TrayItem::ALL
            .into_iter()
            .map(|item| TrayItem::with_id(item.id()))
            .collect();

        assert_eq!(found, TrayItem::ALL.map(Some).to_vec());
    }
}
