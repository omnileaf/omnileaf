FROM rust:1.98.0-slim-bookworm@sha256:1469a27c125cb5a3aebfa4f4e4665d935b02fb72cc093b2c974b3d740e43f157 AS build
WORKDIR /src
COPY . .
RUN cargo build --release --locked -p omnileaf-admin

FROM gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f
COPY --from=build /src/target/release/omnileaf-admin /omnileaf-admin
ENV ADMIN_LISTEN=0.0.0.0:8080
USER nonroot
EXPOSE 8080
ENTRYPOINT ["/omnileaf-admin"]
CMD ["serve"]
