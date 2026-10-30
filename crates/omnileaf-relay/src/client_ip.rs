use std::net::{IpAddr, SocketAddr};

use axum::http::HeaderMap;

const CLOUDFLARE_CLIENT_HEADER: &str = "cf-connecting-ip";
const IPV6_SITE_PREFIX_BYTES: usize = 6;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ClientIpSource {
    CloudflareHeader,
    Peer,
}

#[derive(Clone, Copy, PartialEq, Eq)]
pub enum ClientAddress {
    V4([u8; 4]),
    V6SitePrefix([u8; IPV6_SITE_PREFIX_BYTES]),
    Unidentified,
}

impl ClientAddress {
    #[must_use]
    pub fn from_request(
        source: ClientIpSource,
        headers: &HeaderMap,
        peer: Option<SocketAddr>,
    ) -> Self {
        let address = match source {
            ClientIpSource::CloudflareHeader => headers
                .get(CLOUDFLARE_CLIENT_HEADER)
                .and_then(|value| value.to_str().ok())
                .and_then(|text| text.trim().parse::<IpAddr>().ok()),
            ClientIpSource::Peer => peer.map(|peer| peer.ip()),
        };
        address.map_or(Self::Unidentified, Self::from_ip)
    }

    fn from_ip(address: IpAddr) -> Self {
        match address.to_canonical() {
            IpAddr::V4(v4) => Self::V4(v4.octets()),
            IpAddr::V6(v6) => {
                let mut network = [0; IPV6_SITE_PREFIX_BYTES];
                network
                    .iter_mut()
                    .zip(v6.octets())
                    .for_each(|(slot, byte)| *slot = byte);
                Self::V6SitePrefix(network)
            }
        }
    }

    pub(crate) fn bucket_bytes(&self) -> &[u8] {
        match self {
            Self::V4(octets) => octets,
            Self::V6SitePrefix(network) => network,
            Self::Unidentified => &[],
        }
    }
}

impl std::fmt::Debug for ClientAddress {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("ClientAddress(..)")
    }
}
