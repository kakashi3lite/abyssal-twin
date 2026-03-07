# ✅ CI/CD Verification Guide

## 🎯 Deployment Checklist

Use this checklist to verify everything is working correctly.

### Step 1: Verify GitHub Secrets

Go to: `https://github.com/kakashi3lite/abyssal-twin/settings/secrets/actions`

Required secrets:
- [ ] `CLOUDFLARE_API_TOKEN` — For Pages deployment
- [ ] `CLOUDFLARE_ACCOUNT_ID` — For API calls

**How to get these:**
```bash
# 1. Cloudflare API Token
# Visit: https://dash.cloudflare.com/profile/api-tokens
# Create token with permissions:
#   - Cloudflare Pages: Edit
#   - Account: Read

# 2. Account ID
# Visit: https://dash.cloudflare.com
# Copy Account ID from the right sidebar
```

### Step 2: Trigger Test Deployments

**Test CI Pipeline:**
```bash
# Make a small change and push
echo "# Test" >> README.md
git add README.md
git commit -m "test: trigger CI pipeline"
git push origin main
```

**Check:** https://github.com/kakashi3lite/abyssal-twin/actions

Expected jobs to run:
- ✅ changes (detect modified files)
- ✅ typescript (if cloudflare/ changed)
- ✅ mission-control (if mission-control/ changed)
- ✅ summary (pipeline status)

### Step 3: Verify Dashboard Deployment

**Option A: GitHub Actions (Automatic)**

1. Add secrets to GitHub (see Step 1)
2. Create Cloudflare Pages project:
   ```bash
   cd mission-control
   npx wrangler pages project create abyssal-mission-control
   ```
3. Push any change to `mission-control/**`
4. Check: https://github.com/kakashi3lite/abyssal-twin/actions/workflows/deploy-dashboard.yml

**Option B: Manual Deploy**

```bash
cd mission-control
npm install
npm run build
npx wrangler pages deploy dist --project-name=abyssal-mission-control
```

**Verify deployment:**
```bash
# Should return HTML
curl https://abyssal-mission-control.pages.dev
```

### Step 4: Test Dashboard Locally

```bash
cd mission-control
npm install
npm run dev

# Open http://localhost:3000
```

**Verify:**
- [ ] Page loads without errors
- [ ] Dark/light theme toggle works
- [ ] No console errors
- [ ] Responsive on mobile view

### Step 5: View Screenshots/Gallery

```bash
# Open gallery locally
open docs/screenshots/index.html

# Or serve with Python
python3 -m http.server 8080 --directory docs/screenshots
# Open http://localhost:8080
```

---

## 🔍 Debugging Common Issues

### Issue: "CLOUDFLARE_API_TOKEN not set"

**Fix:**
1. Go to GitHub repo → Settings → Secrets
2. Add `CLOUDFLARE_API_TOKEN` with your token
3. Re-run failed workflow

### Issue: TypeScript build fails

**Fix:**
```bash
cd mission-control
rm -rf node_modules dist
npm install
npm run build
```

### Issue: "Project not found" on deploy

**Fix:**
```bash
cd mission-control
npx wrangler login
npx wrangler pages project create abyssal-mission-control
```

### Issue: Workflow not triggering

**Check:**
1. Ensure workflow file is in `.github/workflows/`
2. Check if path filters match your changes
3. Verify YAML syntax: `python3 -c "import yaml; yaml.safe_load(open('.github/workflows/ci-master.yml'))"`

---

## 📊 Expected Pipeline Behavior

### On Push to `main`:

```
1. ci-master.yml runs
   ├── changes (detects files)
   ├── typescript (if cloudflare/** changed)
   ├── mission-control (if mission-control/** changed)
   ├── rust (if src/** changed)
   ├── python (if src/** or tests/** changed)
   ├── docker (if docker/** changed)
   └── summary (aggregate results)

2. If mission-control/** changed:
   deploy-dashboard.yml runs
   ├── build (TypeScript + Vite)
   ├── deploy (Cloudflare Pages)
   └── smoke-test (verify deployment)
```

### Build Times (Expected):

| Job | Duration | Cache Hit |
|-----|----------|-----------|
| TypeScript | ~1.5 min | ~30 sec |
| Mission Control | ~2 min | ~45 sec |
| Rust | ~4 min | ~2 min |
| Python | ~3 min | ~1 min |
| Docker | ~6 min | ~3 min |

---

## ✅ Success Criteria

You know everything is working when:

1. **✅ CI Pipeline**: Green checkmarks on https://github.com/kakashi3lite/abyssal-twin/actions
2. **✅ Dashboard Live**: https://abyssal-mission-control.pages.dev loads
3. **✅ Local Dev**: `npm run dev` works without errors
4. **✅ Screenshots**: Gallery displays correctly
5. **✅ Auto-deploy**: Push to main triggers deployment

---

## 🚀 Quick Status Check

Run this to verify everything:

```bash
cd /Users/kakashi3lite/abyssal-twin

echo "=== Files Check ==="
test -f .github/workflows/ci-master.yml && echo "✅ ci-master.yml" || echo "❌ ci-master.yml"
test -f .github/workflows/deploy-dashboard.yml && echo "✅ deploy-dashboard.yml" || echo "❌ deploy-dashboard.yml"
test -f mission-control/src/main.ts && echo "✅ main.ts" || echo "❌ main.ts"

echo ""
echo "=== Build Check ==="
cd mission-control && npm run build > /dev/null 2>&1 && echo "✅ Build passes" || echo "❌ Build fails"

echo ""
echo "=== Git Check ==="
git status --short | head -5

echo ""
echo "Done! Check https://github.com/kakashi3lite/abyssal-twin/actions for live status"
```

---

## 📞 Support

If issues persist:
1. Check workflow logs: https://github.com/kakashi3lite/abyssal-twin/actions
2. Review CI/CD docs: `docs/ci-cd/README.md`
3. Open an issue: https://github.com/kakashi3lite/abyssal-twin/issues
