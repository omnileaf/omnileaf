use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hmac::{Hmac, KeyInit, Mac};
use sha2::Sha256;

const MINIMUM_KEY_LENGTH: usize = 32;

#[derive(Debug, thiserror::Error)]
#[error("ADMIN_SESSION_KEY must be at least {MINIMUM_KEY_LENGTH} characters")]
pub struct KeyTooShort;

/// Signs short strings so a cookie holding one can be trusted when it comes back.
#[derive(Clone)]
pub(crate) struct Keys(Vec<u8>);

impl Keys {
    pub(crate) fn new(secret: &str) -> Result<Self, KeyTooShort> {
        if secret.len() < MINIMUM_KEY_LENGTH {
            return Err(KeyTooShort);
        }
        Ok(Self(secret.as_bytes().to_vec()))
    }

    fn mac(&self, purpose: &str, payload: &[u8]) -> Hmac<Sha256> {
        let mut mac = Hmac::<Sha256>::new_from_slice(&self.0).unwrap_or_else(|_| unreachable!());
        mac.update(purpose.as_bytes());
        mac.update(&[0]);
        mac.update(payload);
        mac
    }

    /// The purpose is signed along with the text, so a value made for one cookie is no good in another.
    pub(crate) fn seal(&self, purpose: &str, text: &str, expires: u64) -> String {
        let payload = format!("{text}:{expires}");
        let tag = self
            .mac(purpose, payload.as_bytes())
            .finalize()
            .into_bytes();
        format!(
            "{}.{}",
            URL_SAFE_NO_PAD.encode(payload),
            URL_SAFE_NO_PAD.encode(tag)
        )
    }

    pub(crate) fn open(&self, purpose: &str, sealed: &str, now: u64) -> Option<String> {
        let (payload, tag) = sealed.split_once('.')?;
        let payload = URL_SAFE_NO_PAD.decode(payload).ok()?;
        let tag = URL_SAFE_NO_PAD.decode(tag).ok()?;
        self.mac(purpose, &payload).verify_slice(&tag).ok()?;
        let payload = String::from_utf8(payload).ok()?;
        let (text, expires) = payload.rsplit_once(':')?;
        (expires.parse::<u64>().ok()? > now).then(|| text.to_owned())
    }

    pub(crate) fn csrf_token(&self, session_cookie: &str) -> String {
        let tag = self
            .mac("csrf", session_cookie.as_bytes())
            .finalize()
            .into_bytes();
        URL_SAFE_NO_PAD.encode(tag)
    }

    pub(crate) fn csrf_matches(&self, session_cookie: &str, token: &str) -> bool {
        URL_SAFE_NO_PAD.decode(token).is_ok_and(|tag| {
            self.mac("csrf", session_cookie.as_bytes())
                .verify_slice(&tag)
                .is_ok()
        })
    }
}

pub(crate) fn random_token() -> Result<String, getrandom::Error> {
    let mut bytes = [0_u8; 32];
    getrandom::fill(&mut bytes)?;
    Ok(URL_SAFE_NO_PAD.encode(bytes))
}
