#!/usr/bin/env bash
# Post-create setup for IoRT-DT DevContainer
set -euo pipefail

echo "🔧 IoRT-DT DevContainer setup..."

# ─── Python environment ────────────────────────────────────────────────────
echo "📦 Installing Python dependencies..."
cd /workspace
poetry config virtualenvs.in-project true
poetry install --with dev

# ─── Pre-commit hooks ──────────────────────────────────────────────────────
echo "🔗 Installing pre-commit hooks..."
poetry run pre-commit install || true

# ─── Rust federation crate ────────────────────────────────────────────────
if [ -f "src/iort_dt_federation/Cargo.toml" ]; then
    echo "🦀 Building Rust federation crate..."
    cargo build --manifest-path src/iort_dt_federation/Cargo.toml --release || \
        echo "⚠️  Rust build skipped (may need native libraries)"
fi

# ─── ROS 2 workspace ──────────────────────────────────────────────────────
echo "🤖 Building ROS 2 workspace..."
source /opt/ros/jazzy/setup.bash || true
cd /workspace/src && colcon build \
    --symlink-install \
    --cmake-args -DCMAKE_BUILD_TYPE=RelWithDebInfo \
    --packages-select iort_dt_msgs iort_dt_compression \
    2>&1 | tail -20 || echo "⚠️  ROS 2 build skipped in DevContainer"

# ─── DDS-Security certificates ────────────────────────────────────────────
echo "🔒 Generating DDS-Security certificates..."
bash /workspace/scripts/ci/generate_certs.sh || echo "⚠️  Cert generation skipped"

echo "✅ DevContainer setup complete!"
echo "Run: make demo"
