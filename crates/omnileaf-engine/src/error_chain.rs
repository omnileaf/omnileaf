use std::error::Error;

/// The error's message followed by each of its causes', so one log line says what failed and why.
#[must_use]
pub fn describe_error(error: &dyn Error) -> String {
    let mut description = error.to_string();
    let mut cause = error.source();
    while let Some(source) = cause {
        description.push_str(": ");
        description.push_str(&source.to_string());
        cause = source.source();
    }
    description
}

#[cfg(test)]
mod tests {
    use std::io;

    use super::*;

    #[derive(Debug, thiserror::Error)]
    #[error("open the cover cache")]
    struct OpenFailed(#[source] io::Error);

    #[test]
    fn follows_the_error_with_each_of_its_causes() {
        let error = OpenFailed(io::Error::other("disk full"));

        let description = describe_error(&error);

        assert_eq!(description, "open the cover cache: disk full");
    }
}
