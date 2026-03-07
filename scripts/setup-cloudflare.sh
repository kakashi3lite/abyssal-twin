#!/bin/bash
# One-time Cloudflare setup script
# Run this locally after setting CLOUDFLARE_API_TOKEN

set -e

echo "🌊 Abyssal Twin — Cloudflare First-Time Setup"
echo "=============================================="
echo ""

if [ -z "$CLOUDFLARE_API_TOKEN" ]; then
    echo "❌ CLOUDFLARE_API_TOKEN not set"
    echo "   Export it first: export CLOUDFLARE_API_TOKEN=your_token"
    exit 1
fi

cd cloudflare

echo "1️⃣  Creating D1 Databases..."
echo "────────────────────────────"

# Create staging database
echo "Creating staging database..."
wrangler d1 create abyssal-fleet-staging 2>/dev/null || echo "   (may already exist)"

# Create production database
echo "Creating production database..."
wrangler d1 create abyssal-fleet 2>/dev/null || echo "   (may already exist)"

echo ""
echo "2️⃣  Creating R2 Buckets..."
echo "─────────────────────────"

# Create staging bucket
echo "Creating staging bucket..."
wrangler r2 bucket create abyssal-missions-staging 2>/dev/null || echo "   (may already exist)"

# Create production bucket
echo "Creating production bucket..."
wrangler r2 bucket create abyssal-missions 2>/dev/null || echo "   (may already exist)"

echo ""
echo "3️⃣  Getting Database IDs..."
echo "──────────────────────────"
echo "Run this to see your database IDs:"
echo "  wrangler d1 list"
echo ""
echo "Then update cloudflare/wrangler.toml with the IDs:"
echo "  database_id = \"<staging-database-id>\"   # in [env.staging.d1_databases]"
echo "  database_id = \"<prod-database-id>\"      # in [[d1_databases]] (top level)"
echo ""
echo "✅ Setup complete! You can now deploy with:"
echo "   git push origin main"
