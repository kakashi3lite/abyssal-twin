FROM ubuntu:24.04

ARG ROS_DISTRO=jazzy
ARG DEBIAN_FRONTEND=noninteractive

# ─── Base dependencies ─────────────────────────────────────────────────────
RUN apt-get update && apt-get install -y \
    curl wget git build-essential cmake \
    python3.12 python3.12-dev python3-pip python3-venv \
    libssl-dev pkg-config \
    # ROS 2 dependencies
    software-properties-common \
    && rm -rf /var/lib/apt/lists/*

# ─── ROS 2 Jazzy ──────────────────────────────────────────────────────────
RUN curl -sSL https://raw.githubusercontent.com/ros/rosdistro/master/ros.asc \
    | gpg --dearmor -o /usr/share/keyrings/ros-archive-keyring.gpg && \
    echo "deb [arch=$(dpkg --print-architecture) \
    signed-by=/usr/share/keyrings/ros-archive-keyring.gpg] \
    http://packages.ros.org/ros2/ubuntu noble main" \
    > /etc/apt/sources.list.d/ros2.list && \
    apt-get update && apt-get install -y \
        ros-${ROS_DISTRO}-ros-base \
        ros-${ROS_DISTRO}-rmw-zenoh-cpp \
        ros-${ROS_DISTRO}-ros2-control \
        ros-${ROS_DISTRO}-sensor-msgs \
        ros-${ROS_DISTRO}-geometry-msgs \
        ros-${ROS_DISTRO}-nav-msgs \
        ros-dev-tools \
        python3-colcon-common-extensions \
    && rm -rf /var/lib/apt/lists/*

# ─── Stonefish simulator dependencies ────────────────────────────────────
RUN apt-get update && apt-get install -y \
    libsdl2-dev libsdl2-image-dev \
    libglm-dev libfreeimage-dev \
    libglew-dev libfreetype6-dev \
    && rm -rf /var/lib/apt/lists/*

# ─── Rust ─────────────────────────────────────────────────────────────────
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --default-toolchain 1.75.0 && \
    echo '. $HOME/.cargo/env' >> /root/.bashrc

ENV PATH="/root/.cargo/bin:${PATH}"

# ─── Poetry (Python package manager) ──────────────────────────────────────
RUN curl -sSL https://install.python-poetry.org | python3.12 - && \
    echo 'export PATH="/root/.local/bin:$PATH"' >> /root/.bashrc

ENV PATH="/root/.local/bin:${PATH}"

# ─── OpenSSL tools (for DDS-Security cert generation) ─────────────────────
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

# ─── Environment ──────────────────────────────────────────────────────────
ENV ROS_DISTRO=${ROS_DISTRO}
ENV RMW_IMPLEMENTATION=rmw_zenoh_cpp
ENV WORKSPACE=/workspace

RUN echo "source /opt/ros/${ROS_DISTRO}/setup.bash" >> /root/.bashrc && \
    echo "export RMW_IMPLEMENTATION=rmw_zenoh_cpp" >> /root/.bashrc

WORKDIR /workspace
