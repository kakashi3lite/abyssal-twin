# IoRT-DT Stonefish Simulator — Stub Dockerfile
#
# PLACEHOLDER: Stonefish requires building from source with OpenGL/OGRE
# dependencies. This stub allows docker-compose to start without error
# while the full Stonefish build is implemented in Phase 2.
#
# TODO: Replace with multi-stage build from github.com/patrykcieslak/stonefish
#       at a pinned commit tag. Target image size: <2GB.

FROM ubuntu:24.04

LABEL org.opencontainers.image.source="https://github.com/kakashi3lite/abyssal-twin"
LABEL org.opencontainers.image.description="IoRT-DT Stonefish Simulator (stub)"

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/*

# Healthcheck always passes so dependent services can start
HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
    CMD ["true"]

CMD ["sh", "-c", "echo '[stonefish-stub] Stonefish simulator not yet built. See docker/stonefish/README.md' && sleep infinity"]
