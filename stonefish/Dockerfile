# Stonefish Underwater Robotics Simulator
# Physics-based simulation environment for AUV testing
# https://github.com/patrykcieslak/stonefish

FROM ubuntu:22.04 AS builder

# Prevent interactive prompts during build
ENV DEBIAN_FRONTEND=noninteractive

# Install system dependencies
RUN apt-get update && apt-get install -y \
    build-essential \
    cmake \
    git \
    pkg-config \
    libglm-dev \
    libsdl2-dev \
    libfreetype6-dev \
    libglew-dev \
    libpthread-stubs0-dev \
    libjpeg-dev \
    libpng-dev \
    libopencv-dev \
    ros-humble-desktop \
    && rm -rf /var/lib/apt/lists/*

# Build Stonefish from source
WORKDIR /src
RUN git clone --depth 1 --branch v1.5.0 https://github.com/patrykcieslak/stonefish.git

WORKDIR /src/stonefish/build
RUN cmake .. \
    -DCMAKE_BUILD_TYPE=Release \
    -DCMAKE_INSTALL_PREFIX=/opt/stonefish \
    && make -j$(nproc) \
    && make install

# Runtime stage
FROM ubuntu:22.04

ENV DEBIAN_FRONTEND=noninteractive
ENV STONEFISH_INSTALL_PATH=/opt/stonefish

# Install runtime dependencies only
RUN apt-get update && apt-get install -y \
    libsdl2-2.0-0 \
    libfreetype6 \
    libglew2.2 \
    libjpeg8 \
    libpng16-16 \
    libopencv-core4.5d \
    libopencv-imgproc4.5d \
    libopencv-highgui4.5d \
    && rm -rf /var/lib/apt/lists/*

# Copy built artifacts
COPY --from=builder /opt/stonefish /opt/stonefish

# Set up library path
RUN echo "/opt/stonefish/lib" > /etc/ld.so.conf.d/stonefish.conf \
    && ldconfig

# Workspace for scenarios and models
WORKDIR /workspace

# Default command runs the simulator in headless mode for CI
# Override in docker-compose for GUI mode
CMD ["/opt/stonefish/bin/stonefish", "--help"]

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD test -f /opt/stonefish/lib/libStonefish.so || exit 1
