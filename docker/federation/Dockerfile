# IoRT-DT Federation Service — Production Container
# Multi-stage build: Rust builder -> distroless runtime
# Target: <50MB final image, non-root, no shell

# ── Stage 1: Build ─────────────────────────────────────────────────────────
# Build context is the repo root (..); federation crate lives under src/iort_dt_federation/
FROM rust:1.85-bookworm AS builder

WORKDIR /build

# Cache dependency build by copying manifests first
COPY src/iort_dt_federation/Cargo.toml src/iort_dt_federation/Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && echo "" > src/lib.rs \
    && cargo build --release 2>/dev/null || true \
    && rm -rf src

# Build the actual binary
COPY src/iort_dt_federation/src/ src/
RUN cargo build --release \
    && strip target/release/iort-federation

# ── Stage 2: Runtime ───────────────────────────────────────────────────────
FROM gcr.io/distroless/cc-debian12

LABEL org.opencontainers.image.source="https://github.com/kakashi3lite/abyssal-twin"
LABEL org.opencontainers.image.description="IoRT-DT Federation Service"
LABEL org.opencontainers.image.licenses="Apache-2.0"

COPY --from=builder /build/target/release/iort-federation /usr/local/bin/iort-federation

# Non-root user
USER 1000:1000

ENV AUV_ID=0
ENV AUV_COUNT=2
ENV GOSSIP_INTERVAL_MS=500
ENV PARTITION_TIMEOUT_S=30
ENV RUST_LOG=iort_dt_federation=info

ENTRYPOINT ["/usr/local/bin/iort-federation"]
