# ROS2 Workspace Dockerfile
# Builds ROS2 packages for abyssal-twin

FROM iort-dt:base as builder

ARG ROS_DISTRO=jazzy

# Install additional ROS2 dependencies
RUN apt-get update && apt-get install -y \
    ros-${ROS_DISTRO}-common-interfaces \
    ros-${ROS_DISTRO}-launch-testing \
    python3-colcon-common-extensions \
    python3-rosdep \
    && rm -rf /var/lib/apt/lists/*

# Initialize rosdep
RUN rosdep init 2>/dev/null || true && rosdep update || true

# Copy source code
WORKDIR /workspace
COPY src/iort_dt_msgs ./src/iort_dt_msgs 2>/dev/null || mkdir -p src/iort_dt_msgs
COPY pyproject.toml ./

# Install Python dependencies
RUN pip install --no-cache-dir poetry && \
    poetry config virtualenvs.create false && \
    poetry install --no-interaction --no-ansi --only main 2>/dev/null || \
    pip install --no-cache-dir \
        pydantic numpy scipy fastavro lz4 numba \
        matplotlib prometheus-client

# Build ROS2 workspace if message definitions exist
RUN if [ -f src/iort_dt_msgs/package.xml ]; then \
        source /opt/ros/${ROS_DISTRO}/setup.bash && \
        colcon build \
            --symlink-install \
            --cmake-args -DCMAKE_BUILD_TYPE=RelWithDebInfo; \
    else \
        echo "No ROS2 packages found, skipping colcon build"; \
    fi

# Runtime stage
FROM iort-dt:base

ARG ROS_DISTRO=jazzy

# Copy built workspace
COPY --from=builder /workspace/install /workspace/install
COPY --from=builder /workspace/src /workspace/src

# Setup environment
WORKDIR /workspace
RUN echo "source /workspace/install/setup.bash" >> /root/.bashrc

ENV PYTHONPATH=/workspace/install/lib/python3.12/site-packages:${PYTHONPATH}
ENV LD_LIBRARY_PATH=/workspace/install/lib:${LD_LIBRARY_PATH}

CMD ["bash", "-c", "source /opt/ros/${ROS_DISTRO}/setup.bash && source install/setup.bash && sleep infinity"]
