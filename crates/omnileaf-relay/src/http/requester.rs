use std::net::SocketAddr;

use axum::{
    extract::{ConnectInfo, FromRequestParts},
    http::request::Parts,
};

use super::Relay;
use crate::client_ip::ClientAddress;

pub(crate) struct Requester(pub(crate) ClientAddress);

impl FromRequestParts<Relay> for Requester {
    type Rejection = std::convert::Infallible;

    fn from_request_parts(
        parts: &mut Parts,
        relay: &Relay,
    ) -> impl Future<Output = Result<Self, Self::Rejection>> + Send {
        let peer = parts
            .extensions
            .get::<ConnectInfo<SocketAddr>>()
            .map(|ConnectInfo(address)| *address);
        let address = ClientAddress::from_request(relay.settings.client_ip, &parts.headers, peer);
        std::future::ready(Ok(Self(address)))
    }
}
