use std::{collections::HashMap, fs, path::Path};

use anyhow::Context;
use axum::{
    body::Bytes,
    extract::State,
    http::{StatusCode, Uri, header},
    response::{IntoResponse, Response},
};

use crate::{AppState, auth::Session, page::NO_STORE};

const PREFIX: &str = "/admin/";
const SHELL: &str = "index.html";
const IMMUTABLE_DIRECTORY: &str = "_app/immutable/";
const IMMUTABLE_CACHE: &str = "private, max-age=31536000, immutable";

struct Asset {
    bytes: Bytes,
    content_type: &'static str,
    immutable: bool,
}

impl Asset {
    fn respond(&self) -> Response {
        let cache = if self.immutable {
            IMMUTABLE_CACHE
        } else {
            NO_STORE
        };
        (
            [
                (header::CONTENT_TYPE, self.content_type),
                (header::CACHE_CONTROL, cache),
            ],
            self.bytes.clone(),
        )
            .into_response()
    }
}

pub(crate) struct Assets {
    files: HashMap<String, Asset>,
}

impl Assets {
    pub(crate) fn load(directory: &Path) -> anyhow::Result<Self> {
        let mut files = HashMap::new();
        collect(directory, "", &mut files)?;
        anyhow::ensure!(
            files.contains_key(SHELL),
            "no {SHELL} in {}",
            directory.display()
        );
        Ok(Self { files })
    }

    fn find(&self, path: &str) -> Option<&Asset> {
        self.files.get(path).or_else(|| {
            let is_page = !last_segment(path).contains('.');
            is_page.then(|| self.files.get(SHELL)).flatten()
        })
    }
}

fn last_segment(path: &str) -> &str {
    path.rsplit_once('/').map_or(path, |(_, last)| last)
}

const UNESCAPED_PUNCTUATION: &[u8] = b"-._~!$&'()*+,;=:@[]";

fn is_spelled_as_named(name: &str) -> bool {
    !name.is_empty()
        && name
            .bytes()
            .all(|byte| byte.is_ascii_alphanumeric() || UNESCAPED_PUNCTUATION.contains(&byte))
}

fn content_type_of(path: &str) -> &'static str {
    match last_segment(path)
        .rsplit_once('.')
        .map(|(_, extension)| extension)
    {
        Some("html") => "text/html; charset=utf-8",
        Some("js" | "mjs") => "text/javascript; charset=utf-8",
        Some("css") => "text/css; charset=utf-8",
        Some("txt") => "text/plain; charset=utf-8",
        Some("json" | "map") => "application/json",
        Some("webmanifest") => "application/manifest+json",
        Some("svg") => "image/svg+xml",
        Some("xml") => "application/xml",
        Some("png") => "image/png",
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("gif") => "image/gif",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("ico") => "image/x-icon",
        Some("woff") => "font/woff",
        Some("woff2") => "font/woff2",
        _ => "application/octet-stream",
    }
}

fn collect(
    directory: &Path,
    prefix: &str,
    files: &mut HashMap<String, Asset>,
) -> anyhow::Result<()> {
    let listing = || format!("read {}", directory.display());
    for entry in fs::read_dir(directory).with_context(listing)? {
        let entry = entry.with_context(listing)?;
        let kind = entry
            .file_type()
            .with_context(|| format!("inspect {}", entry.path().display()))?;
        if !kind.is_dir() && !kind.is_file() {
            continue;
        }
        let name = entry
            .file_name()
            .into_string()
            .ok()
            .filter(|name| is_spelled_as_named(name))
            .with_context(|| {
                format!(
                    "{} has a character other than letters, digits and {}",
                    entry.path().display(),
                    String::from_utf8_lossy(UNESCAPED_PUNCTUATION)
                )
            })?;
        let path = format!("{prefix}{name}");
        if kind.is_dir() {
            collect(&entry.path(), &format!("{path}/"), files)?;
        } else {
            let bytes = fs::read(entry.path())
                .with_context(|| format!("read {}", entry.path().display()))?;
            files.insert(
                path.clone(),
                Asset {
                    bytes: Bytes::from(bytes),
                    content_type: content_type_of(&path),
                    immutable: path.starts_with(IMMUTABLE_DIRECTORY),
                },
            );
        }
    }
    Ok(())
}

pub(crate) async fn serve(
    State(state): State<AppState>,
    session: Result<Session, Response>,
    uri: Uri,
) -> Response {
    let Some(path) = uri.path().strip_prefix(PREFIX) else {
        return StatusCode::NOT_FOUND.into_response();
    };
    let Some(assets) = &state.assets else {
        return StatusCode::NOT_FOUND.into_response();
    };
    if let Err(sign_in) = session {
        return sign_in;
    }
    assets
        .find(path)
        .map_or_else(|| StatusCode::NOT_FOUND.into_response(), Asset::respond)
}
