pub(super) enum Version<'a> {
    Full(&'a str),
    PreRelease(&'a str),
}

fn is_version_number(part: &str) -> bool {
    !part.is_empty()
        && part.bytes().all(|byte| byte.is_ascii_digit())
        && (part == "0" || !part.starts_with('0'))
}

fn is_pre_release_identifier(identifier: &str) -> bool {
    let is_numeric = identifier.bytes().all(|byte| byte.is_ascii_digit());
    if is_numeric {
        return is_version_number(identifier);
    }
    identifier
        .bytes()
        .all(|byte| byte.is_ascii_alphanumeric() || byte == b'-')
}

fn is_pre_release_label(label: &str) -> bool {
    label.split('.').all(is_pre_release_identifier)
}

pub(super) fn is_full_version(text: &str) -> bool {
    matches!(parse_version(text), Ok(Version::Full(_)))
}

pub(super) fn parse_version(version: &str) -> anyhow::Result<Version<'_>> {
    let (core, label) = version
        .split_once('-')
        .map_or((version, None), |(core, label)| (core, Some(label)));
    let parts: Vec<&str> = core.split('.').collect();
    anyhow::ensure!(
        parts.len() == 3
            && parts.iter().all(|part| is_version_number(part))
            && label.is_none_or(is_pre_release_label),
        "`{version}` is not a version such as 1.2.0 or 1.2.0-rc.1"
    );
    Ok(match label {
        None => Version::Full(version),
        Some(_) => Version::PreRelease(version),
    })
}

#[cfg(test)]
mod tests {
    use crate::changelog::{
        Format,
        tests::{fragment_text, notes_in, scratch_repo},
    };

    #[test]
    fn refuses_notes_for_a_version_that_is_not_semver() {
        let scratch = scratch_repo(&[]);

        for version in [
            "1.2",
            "v1.2.0",
            "1.02.0",
            "1.2.0+build",
            "1.2.0.0",
            "",
            "../1.2.0",
            "1.2.0-",
            "1.2.0-rc.01",
            "1.2.0-00",
        ] {
            let error = notes_in(&scratch, version, Format::Json).unwrap_err();

            assert!(
                error.to_string().contains("not a version"),
                "{version}: {error}"
            );
        }
    }

    #[test]
    fn takes_a_pre_release_label_with_a_zero_or_a_word_that_starts_with_one() {
        let scratch = scratch_repo(&[(
            "a.md",
            &fragment_text("type: fix\narea: reader", "Not yet out."),
        )]);

        for version in ["1.2.0-rc.0", "1.2.0-0a.1"] {
            let json = notes_in(&scratch, version, Format::Json).unwrap();

            assert!(
                json.contains(&format!("\"version\": \"{version}\"")),
                "{json}"
            );
        }
    }
}
