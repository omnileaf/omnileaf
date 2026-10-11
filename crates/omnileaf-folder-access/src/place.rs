use omnileaf_engine::TreeUri;

/// Android's own provider for the device's storage volumes, whose document ids read `volume:folder/folder`.
const EXTERNAL_STORAGE_AUTHORITY: &str = "com.android.externalstorage.documents";
const PRIMARY_VOLUME: &str = "primary";
const INTERNAL_STORAGE: &str = "Internal storage";
const PLACE_SEPARATOR: &str = " › ";

pub(crate) fn place_of(tree: &TreeUri, document_id: &str, storage_name: Option<&str>) -> String {
    match volume_path(tree, document_id) {
        Some((volume, path)) => place_on_volume(volume, path, storage_name),
        None => storage_name.unwrap_or_default().to_owned(),
    }
}

fn volume_path<'a>(tree: &TreeUri, document_id: &'a str) -> Option<(&'a str, &'a str)> {
    let authority = tree
        .as_str()
        .strip_prefix("content://")?
        .split('/')
        .next()?;
    (authority == EXTERNAL_STORAGE_AUTHORITY)
        .then(|| document_id.split_once(':'))
        .flatten()
}

fn place_on_volume(volume: &str, path: &str, volume_name: Option<&str>) -> String {
    let mut folders: Vec<&str> = path
        .split('/')
        .filter(|folder| !folder.is_empty())
        .collect();
    if folders.pop().is_none() {
        return String::new();
    }
    let volume = volume_name.or((volume == PRIMARY_VOLUME).then_some(INTERNAL_STORAGE));
    volume
        .into_iter()
        .chain(folders)
        .collect::<Vec<_>>()
        .join(PLACE_SEPARATOR)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn tree(authority: &str) -> TreeUri {
        TreeUri::parse(format!("content://{authority}/tree/folder")).unwrap()
    }

    fn on_device() -> TreeUri {
        tree("com.android.externalstorage.documents")
    }

    #[test]
    fn places_a_folder_on_the_internal_storage_under_the_folders_above_it() {
        let place = place_of(&on_device(), "primary:Documents/Comics", None);

        assert_eq!(place, "Internal storage › Documents");
    }

    #[test]
    fn names_the_internal_storage_as_android_describes_it() {
        let place = place_of(
            &on_device(),
            "primary:Documents/Comics",
            Some("Internal shared storage"),
        );

        assert_eq!(place, "Internal shared storage › Documents");
    }

    #[test]
    fn places_a_folder_at_the_top_of_the_internal_storage_on_it_alone() {
        let place = place_of(&on_device(), "primary:Comics", None);

        assert_eq!(place, "Internal storage");
    }

    #[test]
    fn names_a_removable_volume_as_android_describes_it() {
        let place = place_of(
            &on_device(),
            "1A2B-3C4D:Books/Manga/Comics",
            Some("SD card"),
        );

        assert_eq!(place, "SD card › Books › Manga");
    }

    #[test]
    fn leaves_out_a_volume_android_does_not_describe() {
        let place = place_of(&on_device(), "1A2B-3C4D:Books/Comics", None);

        assert_eq!(place, "Books");
    }

    #[test]
    fn gives_a_whole_volume_no_place_since_its_name_already_says_it() {
        let place = place_of(&on_device(), "1A2B-3C4D:", Some("SD card"));

        assert_eq!(place, "");
    }

    #[test]
    fn places_a_folder_from_another_provider_in_that_provider() {
        let place = place_of(&tree("documents.test"), "folder-7", Some("Cloud"));

        assert_eq!(place, "Cloud");
    }

    #[test]
    fn gives_a_folder_from_an_unnamed_provider_no_place() {
        let place = place_of(&tree("documents.test"), "folder-7", None);

        assert_eq!(place, "");
    }
}
