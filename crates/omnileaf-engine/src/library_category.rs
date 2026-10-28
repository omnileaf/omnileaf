use serde::{Deserialize, Serialize};
use specta::{Type, Types, datatype::DataType};

use crate::ipc_brand::branded_string;

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Type)]
#[serde(rename_all = "camelCase")]
pub struct LibraryCategory {
    pub id: CategoryId,
    pub name: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(transparent)]
pub struct CategoryId(String);

impl CategoryId {
    pub(crate) fn stored(&self) -> Option<omnileaf_sync_proto::CategoryId> {
        self.0.parse().ok()
    }
}

impl From<omnileaf_sync_proto::CategoryId> for CategoryId {
    fn from(id: omnileaf_sync_proto::CategoryId) -> Self {
        Self(id.to_string())
    }
}

impl From<String> for CategoryId {
    fn from(id: String) -> Self {
        Self(id)
    }
}

impl From<CategoryId> for String {
    fn from(id: CategoryId) -> Self {
        id.0
    }
}

impl Type for CategoryId {
    fn definition(types: &mut Types) -> DataType {
        branded_string("CategoryId", types)
    }
}
