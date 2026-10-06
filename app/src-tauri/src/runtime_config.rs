//! The settings the app reads from its environment once, at startup.

use std::{env, ffi::OsString, path::PathBuf};

const DATA_DIR_VARIABLE: &str = "OMNILEAF_DATA_DIR";

#[derive(Debug, PartialEq, Eq)]
pub(crate) struct RuntimeConfig {
    /// Where the library lives instead of the platform's app data folder, so tests start from an empty one.
    pub(crate) data_dir: Option<PathBuf>,
}

#[derive(Debug, thiserror::Error)]
pub(crate) enum ConfigError {
    #[error("{DATA_DIR_VARIABLE} must be an absolute path, not {}", path.display())]
    RelativeDataDir { path: PathBuf },
}

impl RuntimeConfig {
    pub(crate) fn from_environment() -> Result<Self, ConfigError> {
        Self::from_variables(|name| env::var_os(name))
    }

    fn from_variables(read: impl Fn(&str) -> Option<OsString>) -> Result<Self, ConfigError> {
        let data_dir = read(DATA_DIR_VARIABLE)
            .map(PathBuf::from)
            .map(|path| {
                if path.is_absolute() {
                    Ok(path)
                } else {
                    Err(ConfigError::RelativeDataDir { path })
                }
            })
            .transpose()?;
        Ok(Self { data_dir })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn read_from(variables: &[(&str, &str)]) -> Result<RuntimeConfig, ConfigError> {
        RuntimeConfig::from_variables(|name| {
            variables
                .iter()
                .find(|(variable, _)| *variable == name)
                .map(|(_, value)| OsString::from(value))
        })
    }

    #[test]
    fn keeps_the_platform_data_folder_when_no_override_is_set() {
        let config = read_from(&[]);

        assert!(matches!(config, Ok(RuntimeConfig { data_dir: None })));
    }

    #[test]
    fn moves_the_data_folder_to_an_absolute_override() {
        let folder = env::temp_dir().join("omnileaf-data");
        let folder_text = folder.to_str().unwrap();

        let config = read_from(&[(DATA_DIR_VARIABLE, folder_text)]);

        assert!(matches!(config, Ok(RuntimeConfig { data_dir: Some(dir) }) if dir == folder));
    }

    #[test]
    fn refuses_a_relative_data_folder() {
        let config = read_from(&[(DATA_DIR_VARIABLE, "omnileaf-data")]);

        assert!(matches!(config, Err(ConfigError::RelativeDataDir { .. })));
    }

    #[test]
    fn refuses_an_empty_data_folder() {
        let config = read_from(&[(DATA_DIR_VARIABLE, "")]);

        assert!(matches!(config, Err(ConfigError::RelativeDataDir { .. })));
    }
}
