use specta::{
    Type, Types,
    datatype::{DataType, Reference},
};
use specta_typescript::Branded;

pub(crate) fn branded_string(brand: &'static str, types: &mut Types) -> DataType {
    DataType::Reference(Reference::opaque(Branded::new(
        brand,
        String::definition(types),
    )))
}
