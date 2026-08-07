# IoRT-DT ROS 2 Workspace — Stub Dockerfile
#
# PLACEHOLDER: Full ROS 2 workspace build requires iort_dt_msgs,
# iort_dt_bridge, and iort_dt_bringup packages (Phase 2).
# This stub provides a ROS 2 base environment for compose validation.
#
# TODO: Add colcon build of src/ packages once ROS 2 message
#       definitions and bridge nodes are implemented.

FROM ros:jazzy-ros-base-noble

LABEL org.opencontainers.image.source="https://github.com/kakashi3lite/abyssal-twin"
LABEL org.opencontainers.image.description="IoRT-DT ROS 2 Workspace (stub)"

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        python3-colcon-common-extensions \
        ros-jazzy-rmw-zenoh-cpp \
    && rm -rf /var/lib/apt/lists/*

ENV ROS_DOMAIN_ID=42
ENV RMW_IMPLEMENTATION=rmw_zenoh_cpp

WORKDIR /workspace

HEALTHCHECK --interval=10s --timeout=3s --retries=3 \
    CMD ["true"]

CMD ["bash", "-c", "echo '[ros2-stub] ROS 2 workspace not yet built. See docker/ros2/README.md' && sleep infinity"]
