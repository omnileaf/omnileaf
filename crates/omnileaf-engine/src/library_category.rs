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
