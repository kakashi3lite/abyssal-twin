# 🌐 Complete Deployment Guide

**Author:** kakashi3lite  
**Date:** 2026-03-06

---

## 🎯 Overview

Abyssal Twin supports **dual deployment** to both GitHub Pages and Cloudflare Pages simultaneously.

| Platform | URL | Status | Requirements |
|----------|-----|--------|--------------|
| **GitHub Pages** | [kakashi3lite.github.io/abyssal-twin](https://kakashi3lite.github.io/abyssal-twin/) | ✅ Active | None (FREE) |
| **Cloudflare Pages** | [abyssal-mission-control.pages.dev](https://abyssal-mission-control.pages.dev/) | ⚡ Fast | API Token |

---

## 🚀 GitHub Pages Deployment (Recommended)

### Step 1: Enable in Settings

1. Go to: `https://github.com/kakashi3lite/abyssal-twin/settings/pages`
2. Under **"Build and deployment"**:
   - Source: Select **"GitHub Actions"**
3. Click **Save**

### Step 2: Trigger Deployment

```bash
# Push any change to main
git commit --allow-empty -m "deploy: trigger GitHub Pages"
git push origin main
```

### Step 3: Monitor

- Check: `https://github.com/kakashi3lite/abyssal-twin/actions`
- Look for: **"Deploy to GitHub Pages"** workflow
- Wait for: ✅ Green checkmark

### Step 4: Access

```
https://kakashi3lite.github.io/abyssal-twin/
```

---

## ⚡ Cloudflare Pages Deployment

### Step 1: Get Credentials

**API Token:**
1. Go to: https://dash.cloudflare.com/profile/api-tokens
2. Create token with permissions:
   - `Cloudflare Pages: Edit`
   - `Account: Read`

**Account ID:**
1. Go to: https://dash.cloudflare.com
2. Copy Account ID from right sidebar

### Step 2: Add GitHub Secrets

1. Go to: `https://github.com/kakashi3lite/abyssal-twin/settings/secrets/actions`
2. Add secrets:
   ```
   Name: CLOUDFLARE_API_TOKEN
   Value: your-api-token-here
   
   Name: CLOUDFLARE_ACCOUNT_ID
   Value: your-account-id-here
   ```

### Step 3: Trigger Deployment

```bash
# Push any change to mission-control/
git commit --allow-empty -m "deploy: trigger Cloudflare Pages"
git push origin main
```

### Step 4: Access

```
https://abyssal-mission-control.pages.dev/
```

---

## 📊 Deployment Comparison

| Feature | GitHub Pages | Cloudflare Pages |
|---------|-------------|------------------|
| **Cost** | FREE | FREE |
| **Setup** | 1 click | API Token needed |
| **Speed** | Fast | ⚡ Faster (Edge) |
| **Custom Domain** | ✅ Yes | ✅ Yes |
| **Build Time** | ~2 min | ~2 min |
| **SSL** | ✅ Automatic | ✅ Automatic |

---

## 🖼️ Snapshots Gallery

Standalone HTML snapshots that work on any platform:

| Snapshot | Description | Link |
|----------|-------------|------|
| **Fleet Status** | Real-time AUV tracking | [View](docs/screenshots/dashboard-overview.html) |
| **Research Metrics** | RQ1/RQ3 validation | [View](docs/screenshots/research-metrics.html) |
| **Gallery** | All snapshots | [View](docs/screenshots/index.html) |

**Features:**
- ✅ Fully self-contained (inline CSS)
- ✅ No external dependencies
- ✅ Works offline
- ✅ Mobile responsive

---

## 🔧 Environment Configuration

### GitHub Pages Build

```yaml
# .github/workflows/github-pages.yml
env:
  VITE_API_BASE: https://api.abyssal-twin.dev
  VITE_WS_URL: wss://api.abyssal-twin.dev/ws/live
  VITE_SSE_URL: https://api.abyssal-twin.dev/api/v1/fleet/stream
```

### Cloudflare Pages Build

```yaml
# .github/workflows/cloudflare-pages.yml
env:
  VITE_API_BASE: ${{ env.PRODUCTION_API }}
  VITE_WS_URL: ${{ env.PRODUCTION_WS }}
  VITE_SSE_URL: ${{ env.PRODUCTION_SSE }}
```

### Local Development

```bash
# Uses defaults in src/main.ts
cd mission-control
npm run dev
```

---

## 🚨 Troubleshooting

### Issue: 404 Error on GitHub Pages

**Cause:** Pages not enabled in settings

**Fix:**
1. Settings → Pages → Select "GitHub Actions"
2. Push to trigger deployment

### Issue: Cloudflare "Project not found"

**Cause:** Project doesn't exist yet

**Fix:**
```bash
cd mission-control
npx wrangler pages project create abyssal-mission-control
```

### Issue: Assets not loading (404)

**Cause:** Absolute paths in build

**Fix:** Already resolved - vite.config.ts uses `base: './'`

**Verify:**
```bash
grep 'src="./assets/' mission-control/dist/index.html
```

### Issue: API calls failing (CORS)

**Cause:** Cloudflare Workers CORS headers not configured

**Fix:** Add to Cloudflare Worker:
```javascript
headers: {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
}
```

### Issue: Workflow not triggering

**Cause:** Path filters not matching

**Fix:**
```bash
# Make any change to mission-control/
echo "# trigger" >> mission-control/README.md
git add . && git commit -m "trigger: deploy" && git push
```

---

## ✅ Verification Checklist

### GitHub Pages
- [ ] Enabled in Settings → Pages
- [ ] Workflow triggered on push
- [ ] Build job completes
- [ ] Deploy job completes
- [ ] URL loads without 404
- [ ] Snapshots accessible

### Cloudflare Pages
- [ ] Secrets added to GitHub
- [ ] Project created in Cloudflare
- [ ] Workflow triggered
- [ ] Deployment successful
- [ ] URL loads correctly

### Both
- [ ] Dashboard renders
- [ ] Theme toggle works
- [ ] Responsive on mobile
- [ ] No console errors

---

## 📚 Related Documentation

- [README.md](README.md) — Project overview
- [GITHUB_PAGES_SETUP.md](GITHUB_PAGES_SETUP.md) — GitHub-specific setup
- [DEPLOYMENT_VERIFICATION.md](DEPLOYMENT_VERIFICATION.md) — Verification checklist
- [docs/ci-cd/README.md](docs/ci-cd/README.md) — CI/CD documentation

---

## 📞 Support

- **GitHub Issues:** https://github.com/kakashi3lite/abyssal-twin/issues
- **Actions Logs:** https://github.com/kakashi3lite/abyssal-twin/actions
- **Documentation:** See docs/ folder

---

**Status:** ✅ Both deployments configured and ready

**Author:** kakashi3lite
