# IoRT-DT Federation Service — Production Container
# Multi-stage build: Rust builder -> distroless runtime
# Target: <50MB final image, non-root, no shell
#
# NOTE: Installing Rust nightly via rustup due to time crate requiring Rust 1.88
# TODO: Switch to rust:1-bookworm once Rust 1.88 is stable

# ── Stage 1: Build ─────────────────────────────────────────────────────────
FROM debian:bookworm-slim AS builder

WORKDIR /build

# Install required dependencies
RUN apt-get update && apt-get install -y \
    curl \
    build-essential \
    pkg-config \
    libssl-dev \
    && rm -rf /var/lib/apt/lists/*

# Install Rust nightly via rustup
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh -s -- -y --default-toolchain nightly
ENV PATH="/root/.cargo/bin:${PATH}"

# Verify Rust version
RUN rustc --version && cargo --version

# Copy manifests first for dependency caching
COPY src/iort_dt_federation/Cargo.toml src/iort_dt_federation/Cargo.lock ./

# Create dummy source for dependency build
RUN mkdir src && \
    echo "fn main() {}" > src/main.rs && \
    echo "" > src/lib.rs && \
    cargo build --release 2>/dev/null || true && \
    rm -rf src

# Copy actual source and build
COPY src/iort_dt_federation/src/ ./src/
RUN cargo build --release && \
    strip target/release/iort-federation

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
