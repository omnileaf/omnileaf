//! Strings the interface's types keep apart, each under a brand of its own.

use specta::{
    Type, Types,
    datatype::{DataType, Reference},
};
use specta_typescript::Branded;

/// A string the interface can't mistake for any other string, since only the IPC client hands one out.
pub(crate) fn branded_string(brand: &'static str, types: &mut Types) -> DataType {
    DataType::Reference(Reference::opaque(Branded::new(
        brand,
        String::definition(types),
    )))
}
