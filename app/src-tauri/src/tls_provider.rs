/// Tauri's dev-server proxy builds its own `reqwest` client, which panics on start-up when no rustls provider is installed.
pub(crate) fn install_default() {
    rustls::crypto::ring::default_provider()
        .install_default()
        .ok();
}

#[cfg(test)]
mod tests {
    use super::install_default;

    #[test]
    fn a_default_client_builds_after_the_provider_is_installed() {
        install_default();
        assert!(reqwest::Client::builder().build().is_ok());
    }

    #[test]
    fn installing_twice_is_harmless() {
        install_default();
        install_default();
    }
}
