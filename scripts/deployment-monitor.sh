#!/bin/bash
# Real-time Deployment Monitor
# Shows live GitHub Actions status and metrics

REPO="kakashi3lite/abyssal-twin"

echo "╔════════════════════════════════════════════════════════════════════════════╗"
echo "║           🌊 ABYSSAL TWIN — DEPLOYMENT MONITOR                            ║"
echo "╚════════════════════════════════════════════════════════════════════════════╝"
echo ""

# Check if gh CLI is available
if ! command -v gh &> /dev/null; then
    echo "⚠️  GitHub CLI not installed. Install with: brew install gh"
    echo "   Then authenticate: gh auth login"
    echo ""
    echo "Manual monitoring: https://github.com/$REPO/actions"
    exit 1
fi

# Get latest workflow runs
echo "📊 LATEST WORKFLOW RUNS"
echo "────────────────────────"
gh run list --repo "$REPO" --limit 5 --json name,status,conclusion,url,createdAt \
    --jq '.[] | "\(.name): \(.status) \(.conclusion // "") [\(.createdAt)]"' 2>/dev/null || \
    echo "   (Run 'gh auth login' to see live status)"

echo ""
echo "🔗 Quick Links"
echo "─────────────"
echo "   CI Status:       https://github.com/$REPO/actions/workflows/ci.yml"
echo "   Deploy Status:   https://github.com/$REPO/actions/workflows/deploy.yml"
echo "   Security:        https://github.com/$REPO/security/dependabot"
echo ""
