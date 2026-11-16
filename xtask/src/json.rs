use serde::Serialize;

pub(crate) fn pretty(value: &impl Serialize) -> serde_json::Result<String> {
    serde_json::to_string_pretty(value).map(|json| json + "\n")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn indents_the_json_and_ends_it_with_one_newline() {
        let value = serde_json::json!({"version": "1.2.0", "entries": []});

        let json = pretty(&value).unwrap();

        assert_eq!(json, "{\n  \"entries\": [],\n  \"version\": \"1.2.0\"\n}\n");
    }
}
