FROM rust:1.98.0-slim-bookworm AS build
WORKDIR /src
COPY . .
RUN cargo build --release --locked -p omnileaf-relay \
 && mkdir -p /data

FROM gcr.io/distroless/cc-debian12:nonroot
COPY --from=build /src/target/release/omnileaf-relay /omnileaf-relay
COPY --from=build --chown=nonroot:nonroot /data /data
ENV RELAY_LISTEN=0.0.0.0:8080 RELAY_DATABASE=/data/relay.sqlite3
VOLUME /data
USER nonroot
EXPOSE 8080
ENTRYPOINT ["/omnileaf-relay"]
CMD ["serve"]
