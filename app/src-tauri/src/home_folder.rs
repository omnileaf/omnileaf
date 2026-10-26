use std::{
    path::PathBuf,
    sync::{Mutex, PoisonError},
};

use omnileaf_engine::HomeFolderSetting;
use tauri::{AppHandle, Manager};

#[derive(Default)]
pub(crate) struct ChosenHome(Mutex<Option<PathBuf>>);

#[derive(Debug, thiserror::Error)]
#[error("use the library in the folder chosen as the home folder, before a folder was chosen")]
pub(crate) struct NothingChosen;

impl ChosenHome {
    pub(crate) fn remember(&self, folder: PathBuf) {
        *self.0.lock().unwrap_or_else(PoisonError::into_inner) = Some(folder);
    }

    pub(crate) fn folder(&self) -> Option<PathBuf> {
        self.0
            .lock()
            .unwrap_or_else(PoisonError::into_inner)
            .clone()
    }
}

pub(crate) fn setting(app: &AppHandle) -> Option<HomeFolderSetting> {
    app.try_state::<HomeFolderSetting>()
        .map(|setting| setting.inner().clone())
}

#[cfg(test)]
mod tests {
    use super::*;

    const CHOSEN: &str = "/media/Sample Library";
    const CHOSEN_AFTER: &str = "/media/Sample Library 2";

    #[test]
    fn holds_no_home_folder_before_one_is_chosen() {
        let chosen = ChosenHome::default();

        let folder = chosen.folder();

        assert_eq!(folder, None);
    }

    #[test]
    fn keeps_the_home_folder_chosen_last() {
        let chosen = ChosenHome::default();
        chosen.remember(PathBuf::from(CHOSEN));

        chosen.remember(PathBuf::from(CHOSEN_AFTER));

        assert_eq!(chosen.folder(), Some(PathBuf::from(CHOSEN_AFTER)));
    }
}
