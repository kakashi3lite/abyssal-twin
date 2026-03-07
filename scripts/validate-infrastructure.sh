#!/bin/bash
# Infrastructure Validation Script
# Validates that all CI/CD, deployment, and local development components work in unison

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/.." && pwd)"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

ERRORS=0
WARNINGS=0

echo "═══════════════════════════════════════════════════════════════════════════════"
echo "  ABYSSAL TWIN — Infrastructure Validation"
echo "  Validates CI/CD, deployment, and local development unison"
echo "═══════════════════════════════════════════════════════════════════════════════"
echo ""

check_file() {
    if [ -f "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        return 0
    else
        echo -e "${RED}✗${NC} $2"
        echo "  Missing: $1"
        ((ERRORS++))
        return 1
    fi
}

check_dir() {
    if [ -d "$1" ]; then
        echo -e "${GREEN}✓${NC} $2"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} $2"
        echo "  Missing directory: $1"
        ((WARNINGS++))
        return 1
    fi
}

check_command() {
    if command -v "$1" &> /dev/null; then
        echo -e "${GREEN}✓${NC} $2: $(command -v "$1")"
        return 0
    else
        echo -e "${YELLOW}⚠${NC} $2 not found (optional)"
        ((WARNINGS++))
        return 1
    fi
}

echo "📋 SECTION 1: Project Structure"
echo "───────────────────────────────────────────────────────────────────────────────"
check_file "$PROJECT_ROOT/pyproject.toml" "Python project config"
check_file "$PROJECT_ROOT/src/iort_dt_federation/Cargo.toml" "Rust federation crate"
check_file "$PROJECT_ROOT/cloudflare/package.json" "Cloudflare Workers package"
check_file "$PROJECT_ROOT/cloudflare/wrangler.toml" "Wrangler configuration"
check_file "$PROJECT_ROOT/docker/docker-compose.simulation.yml" "Docker Compose"
echo ""

echo "📋 SECTION 2: CI/CD Workflows"
echo "───────────────────────────────────────────────────────────────────────────────"
check_file "$PROJECT_ROOT/.github/workflows/ci.yml" "CI workflow"
check_file "$PROJECT_ROOT/.github/workflows/ci-competitive.yml" "Competitive CI"
check_file "$PROJECT_ROOT/.github/workflows/deploy.yml" "Deploy workflow"
check_file "$PROJECT_ROOT/.github/workflows/provenance.yml" "Provenance workflow"
check_file "$PROJECT_ROOT/.github/workflows/security-orchestration.yml" "Security workflow"
echo ""

echo "📋 SECTION 3: Composite Actions"
echo "───────────────────────────────────────────────────────────────────────────────"
check_file "$PROJECT_ROOT/.github/actions/setup-monorepo/action.yml" "Setup monorepo action"
check_file "$PROJECT_ROOT/.github/actions/security-remediate/action.yml" "Security remediate action"
echo ""

echo "📋 SECTION 4: Docker Infrastructure"
echo "───────────────────────────────────────────────────────────────────────────────"
check_file "$PROJECT_ROOT/docker/federation/Dockerfile" "Federation Dockerfile"
check_file "$PROJECT_ROOT/docker/ros2/Dockerfile" "ROS2 Dockerfile"
check_file "$PROJECT_ROOT/stonefish/Dockerfile" "Stonefish Dockerfile"
check_file "$PROJECT_ROOT/docker/zenoh/acoustic.json5" "Zenoh config"
check_file "$PROJECT_ROOT/docker/observability/prometheus.yml" "Prometheus config"
echo ""

echo "📋 SECTION 5: TypeScript Configuration"
echo "───────────────────────────────────────────────────────────────────────────────"
check_file "$PROJECT_ROOT/tsconfig.base.json" "Root TypeScript config"
check_file "$PROJECT_ROOT/cloudflare/tsconfig.json" "Cloudflare TypeScript config"
check_file "$PROJECT_ROOT/cloudflare/src/types/brands.ts" "Branded types"
check_file "$PROJECT_ROOT/cloudflare/src/utils/match.ts" "Pattern matching utility"
echo ""

echo "📋 SECTION 6: Validation Tests"
echo "───────────────────────────────────────────────────────────────────────────────"

# Test 1: TypeScript compilation
echo -n "TypeScript compilation... "
cd "$PROJECT_ROOT/cloudflare"
if npx tsc --noEmit 2>/dev/null; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    ((ERRORS++))
fi

# Test 2: YAML validation
echo -n "GitHub Actions YAML syntax... "
cd "$PROJECT_ROOT"
YAML_VALID=true
for wf in .github/workflows/*.yml; do
    if ! python3 -c "import yaml; yaml.safe_load(open('$wf'))" 2>/dev/null; then
        echo -e "${RED}FAIL${NC} ($wf)"
        YAML_VALID=false
        ((ERRORS++))
        break
    fi
done
if [ "$YAML_VALID" = true ]; then
    echo -e "${GREEN}PASS${NC}"
fi

# Test 3: Wrangler environments
echo -n "Wrangler environment definitions... "
if grep -q "\[env.staging\]" "$PROJECT_ROOT/cloudflare/wrangler.toml" && \
   grep -q "\[env.production\]" "$PROJECT_ROOT/cloudflare/wrangler.toml"; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${RED}FAIL${NC}"
    ((ERRORS++))
fi

# Test 4: Docker Compose validation
echo -n "Docker Compose syntax... "
if command -v docker &> /dev/null; then
    if docker compose -f "$PROJECT_ROOT/docker/docker-compose.simulation.yml" config > /dev/null 2>&1; then
        echo -e "${GREEN}PASS${NC}"
    else
        echo -e "${YELLOW}WARN${NC} (services may reference missing Dockerfiles)"
        ((WARNINGS++))
    fi
else
    echo -e "${YELLOW}SKIP${NC} (docker not available)"
fi

# Test 5: Poetry lock file
echo -n "Poetry lock file... "
if [ -f "$PROJECT_ROOT/poetry.lock" ]; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${YELLOW}WARN${NC} (lock file missing - run 'poetry lock')"
    ((WARNINGS++))
fi

# Test 6: Cargo lock file
echo -n "Cargo lock file... "
if [ -f "$PROJECT_ROOT/src/iort_dt_federation/Cargo.lock" ]; then
    echo -e "${GREEN}PASS${NC}"
else
    echo -e "${YELLOW}WARN${NC} (lock file missing - run 'cargo generate-lockfile')"
    ((WARNINGS++))
fi

echo ""

echo "📋 SECTION 7: Tool Availability"
echo "───────────────────────────────────────────────────────────────────────────────"
check_command "python3" "Python 3"
check_command "node" "Node.js"
check_command "npm" "npm"
check_command "cargo" "Rust/Cargo"
check_command "docker" "Docker"
check_command "poetry" "Poetry"
check_command "wrangler" "Wrangler CLI"
echo ""

echo "═══════════════════════════════════════════════════════════════════════════════"
echo "  VALIDATION SUMMARY"
echo "═══════════════════════════════════════════════════════════════════════════════"

if [ $ERRORS -eq 0 ] && [ $WARNINGS -eq 0 ]; then
    echo -e "  ${GREEN}✓ ALL CHECKS PASSED${NC}"
    echo "  Infrastructure is ready for deployment!"
    exit 0
elif [ $ERRORS -eq 0 ]; then
    echo -e "  ${YELLOW}⚠ PASSED WITH WARNINGS${NC}"
    echo "  Warnings: $WARNINGS"
    echo "  Infrastructure is functional but has optional gaps"
    exit 0
else
    echo -e "  ${RED}✗ VALIDATION FAILED${NC}"
    echo "  Errors: $ERRORS"
    echo "  Warnings: $WARNINGS"
    echo ""
    echo "  Required fixes:"
    echo "  1. Address all ✗ items above"
    echo "  2. Re-run this validation"
    exit 1
fi
