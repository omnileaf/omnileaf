use std::{
    fs,
    path::{Path, PathBuf},
};

use anyhow::Context;
use omnileaf_testkit::{SAMPLE_LIBRARY_NAME, write_sample_library};

pub(crate) fn generate(out: &Path) -> anyhow::Result<Vec<PathBuf>> {
    let library = out.join(SAMPLE_LIBRARY_NAME);
    if library.exists() {
        fs::remove_dir_all(&library)
            .with_context(|| format!("remove the earlier fixtures in {}", library.display()))?;
    }
    write_sample_library(out)
        .with_context(|| format!("write the sample library into {}", out.display()))
}

#[cfg(test)]
mod tests {
    use std::{env, fs, process};

    use omnileaf_testkit::SAMPLE_LIBRARY_NAME;

    use super::*;

    #[test]
    fn replaces_files_left_from_an_earlier_run() {
        let out = env::temp_dir().join(format!("omnileaf-xtask-fixtures-{}", process::id()));
        let stale = out.join(SAMPLE_LIBRARY_NAME).join("stale.cbz");
        fs::create_dir_all(stale.parent().unwrap()).unwrap();
        fs::write(&stale, b"left over").unwrap();

        let written = generate(&out).unwrap();

        assert!(!stale.exists());
        assert!(!written.is_empty());
        assert!(written.iter().all(|file| out.join(file).is_file()));
        fs::remove_dir_all(&out).unwrap();
    }
}
