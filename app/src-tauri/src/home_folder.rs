use std::{
    path::PathBuf,
    sync::{Mutex, PoisonError},
};

use omnileaf_engine::HomeFolderSetting;
use tauri::{AppHandle, Manager};

use crate::ipc_error::IpcError;

#[derive(Default)]
pub(crate) struct ChosenHome(Mutex<Option<PathBuf>>);

#[derive(Debug, thiserror::Error)]
#[error("act on the folder chosen as the home folder before any folder was chosen")]
struct NothingChosen;

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

pub(crate) fn chosen(app: &AppHandle) -> Result<(HomeFolderSetting, PathBuf), IpcError> {
    setting(app)
        .zip(app.state::<ChosenHome>().folder())
        .ok_or_else(|| IpcError::internal(&NothingChosen))
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
