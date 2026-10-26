use serde::Serialize;
use specta::Type;

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct FoundLibrary {
    pub series: u32,
    pub books: u32,
    /// Crosses as a plain number, which holds every such date exactly.
    #[specta(type = Option<i32>)]
    pub last_backup_at_ms: Option<i64>,
}
