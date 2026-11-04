FROM rust:1.98.0-slim-bookworm@sha256:1469a27c125cb5a3aebfa4f4e4665d935b02fb72cc093b2c974b3d740e43f157 AS build
WORKDIR /src
COPY . .
RUN cargo build --release --locked -p omnileaf-admin

FROM node:26.10.0-bookworm-slim@sha256:3ffc19ea878019d9e9ae8971732ad4a03cda44f167107173174b60ed7c65bed3 AS ui
RUN npm install --global --ignore-scripts pnpm@12.10.1
WORKDIR /src
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY admin-ui/package.json admin-ui/package.json
RUN pnpm --filter @omnileaf/admin-ui... install --frozen-lockfile --ignore-scripts
COPY admin-ui admin-ui
RUN pnpm --dir admin-ui build

FROM gcr.io/distroless/cc-debian12:nonroot@sha256:9dac0a79194e45a7da0158a9c6da57b217585af0786db3845d1f0ec1a0dd182f
COPY --from=build /src/target/release/omnileaf-admin /omnileaf-admin
COPY --from=ui /src/admin-ui/build /ui
ENV ADMIN_LISTEN=0.0.0.0:8080
ENV ADMIN_STATIC_DIR=/ui
USER nonroot
EXPOSE 8080
ENTRYPOINT ["/omnileaf-admin"]
CMD ["serve"]
