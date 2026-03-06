# IoRT-DT Master Makefile
# Canonical commands for research reproducibility

.PHONY: all bootstrap build test test-rq1 test-rq2 test-rq3 test-rq4 test-all \
        demo paper-figures red-team clean lint format docs

COMPOSE := docker compose -f docker/docker-compose.simulation.yml
ROS2_RUN := $(COMPOSE) run --rm ros2
PYTHON := poetry run python
FIGURE_OUTPUT := docs/figures

# ─── Bootstrap ────────────────────────────────────────────────────────────────

bootstrap: ## One-time project setup
	@echo "🔧 Setting up IoRT-DT development environment..."
	@cp -n configs/security/governance.xml.template configs/security/governance.xml 2>/dev/null || true
	@bash scripts/ci/generate_certs.sh
	@pip install poetry --quiet
	@poetry install --with dev
	@cargo build --manifest-path src/iort_dt_federation/Cargo.toml --release 2>/dev/null || true
	@pre-commit install 2>/dev/null || true
	@echo "✅ Bootstrap complete. Run: docker compose -f docker/docker-compose.simulation.yml up"

# ─── Build ────────────────────────────────────────────────────────────────────

build: ## Build all Docker images
	$(COMPOSE) build

build-ros2: ## Build ROS 2 workspace (for native development)
	cd src && colcon build --symlink-install --cmake-args -DCMAKE_BUILD_TYPE=RelWithDebInfo

# ─── Tests ────────────────────────────────────────────────────────────────────

test-rq1: ## RQ1: Validate compression ratio >10:1, F1>0.9 at 0.5Hz sync
	@echo "🧪 Testing RQ1: Acoustic-Constrained DT Synchronization..."
	$(PYTHON) -m pytest tests/unit/test_compression.py tests/property/test_rq1_bounds.py \
		experiments/rq1_sync_tradeoff/validate.py \
		-v --tb=short --timeout=300
	@echo "✅ RQ1 tests passed"

test-rq2: ## RQ2: Validate federation convergence <60s, RMS error <2m
	@echo "🧪 Testing RQ2: Federated DT Coordination..."
	$(COMPOSE) run --rm ros2 bash -c \
		"source /opt/ros/jazzy/setup.bash && \
		 cd /workspace && \
		 python3 experiments/rq2_federation/validate.py --auv-count 4 --partition-duration 120"
	@echo "✅ RQ2 tests passed"

test-rq3: ## RQ3: Validate ARL₀>10000, detection delay <120s
	@echo "🧪 Testing RQ3: Physics-Informed Anomaly Detection..."
	$(PYTHON) -m pytest tests/unit/test_anomaly.py tests/property/test_rq3_arl.py \
		experiments/rq3_anomaly/validate.py \
		-v --tb=short --timeout=600
	@echo "✅ RQ3 tests passed"

test-rq4: ## RQ4: Validate handshake <30s, encryption overhead <15%
	@echo "🧪 Testing RQ4: DDS Security under Acoustic Constraints..."
	$(PYTHON) -m pytest tests/unit/test_security.py \
		experiments/rq4_security/validate.py \
		-v --tb=short --timeout=300
	@echo "✅ RQ4 tests passed"

test-all: test-rq1 test-rq3 test-rq4 ## Run all unit/property tests (RQ2 requires Docker)
	@echo "✅ All tests passed"

test: test-all ## Alias for test-all

lint: ## Lint Python (ruff) and Rust (clippy)
	poetry run ruff check src/ experiments/ tests/
	poetry run mypy src/ --ignore-missing-imports
	cargo clippy --manifest-path src/iort_dt_federation/Cargo.toml -- -D warnings 2>/dev/null || true

format: ## Format code
	poetry run ruff format src/ experiments/ tests/
	cargo fmt --manifest-path src/iort_dt_federation/Cargo.toml 2>/dev/null || true

# ─── Demo ─────────────────────────────────────────────────────────────────────

demo: ## Launch demo: AUV → inject fault → detect → federate alert
	@echo "🤖 Launching IoRT-DT demo..."
	$(COMPOSE) up -d
	@sleep 10
	@echo "💥 Injecting thruster fault (30% degradation)..."
	$(COMPOSE) exec ros2 bash -c \
		"source /opt/ros/jazzy/setup.bash && \
		 ros2 topic pub /iort/fault_injection std_msgs/msg/String \
		 'data: {\"type\": \"thruster\", \"severity\": 0.30, \"auv_id\": 0}' --once"
	@echo "📊 Dashboard: http://localhost:3000"
	@echo "🔬 MLflow: http://localhost:5000"

# ─── Paper Figures ────────────────────────────────────────────────────────────

paper-figures: ## Regenerate all paper figures (deterministic, seeded)
	@echo "📊 Generating paper figures..."
	@mkdir -p $(FIGURE_OUTPUT)
	$(PYTHON) experiments/rq1_sync_tradeoff/run.py --seed 42 --output $(FIGURE_OUTPUT)/fig1_sync_tradeoff.pdf
	$(PYTHON) experiments/rq3_anomaly/run.py --seed 42 --output $(FIGURE_OUTPUT)/fig2_roc_curves.pdf
	$(PYTHON) experiments/rq3_anomaly/run_arl.py --seed 42 --output $(FIGURE_OUTPUT)/fig3_arl_bounds.pdf
	$(PYTHON) experiments/rq4_security/run.py --seed 42 --output $(FIGURE_OUTPUT)/fig4_security_overhead.pdf
	@echo "✅ Figures saved to $(FIGURE_OUTPUT)/"

reproduce: ## Reproduce specific paper result: make reproduce FIGURE=1 SEED=42
	$(PYTHON) -m iort_dt.experiments.reproduce --figure $(FIGURE) --seed $(SEED)

# ─── Security Red-Team ────────────────────────────────────────────────────────

red-team: ## Run attack simulations (RQ4 red-teaming)
	@echo "🔴 Running red-team simulations..."
	$(PYTHON) scripts/attacks/replay_attack.py --duration 60
	$(PYTHON) scripts/attacks/spoofing_attack.py --target auv_0
	@echo "✅ Red-team complete. Check experiments/rq4_security/results/"

# ─── Documentation ────────────────────────────────────────────────────────────

docs: ## Build documentation (Sphinx + mdBook)
	poetry run sphinx-build -b html docs/api docs/_build/html 2>/dev/null || true
	@echo "📚 Docs available at docs/_build/html/index.html"

# ─── Utilities ────────────────────────────────────────────────────────────────

clean: ## Remove build artifacts
	rm -rf build/ install/ log/ .mypy_cache/ .ruff_cache/ __pycache__/
	find . -name "*.pyc" -delete
	$(COMPOSE) down --remove-orphans 2>/dev/null || true

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | \
		awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'
