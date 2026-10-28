use omnileaf_db::catalog;
use serde::Serialize;
use specta::Type;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub enum ValueSource {
    FolderName,
    FileName,
    Files,
}

impl From<catalog::ValueSource> for ValueSource {
    fn from(source: catalog::ValueSource) -> Self {
        match source {
            catalog::ValueSource::FolderName => Self::FolderName,
            catalog::ValueSource::FileName => Self::FileName,
            catalog::ValueSource::Files => Self::Files,
        }
    }
}
