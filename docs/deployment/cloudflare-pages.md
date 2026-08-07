# Deploy Mission Control to Cloudflare Pages

This guide walks you through deploying the Mission Control dashboard to Cloudflare Pages for free hosting with global CDN.

## Prerequisites

- Cloudflare account (free tier works)
- GitHub repository connected to Cloudflare
- `CLOUDFLARE_API_TOKEN` secret in GitHub

## Option 1: GitHub Actions (Recommended)

The dashboard will automatically deploy when you push to `main`.

### 1. Get Cloudflare Credentials

```bash
# Get your Account ID
# Visit: https://dash.cloudflare.com → select domain → copy Account ID from right sidebar

# Create API Token
# Visit: https://dash.cloudflare.com/profile/api-tokens
# Create token with "Cloudflare Pages: Edit" permission
```

### 2. Add Secrets to GitHub

Go to **Settings → Secrets and variables → Actions** in your GitHub repo:

```
Name: CLOUDFLARE_API_TOKEN
Value: your-api-token-here

Name: CLOUDFLARE_ACCOUNT_ID  
Value: your-account-id-here
```

### 3. Create Pages Project

```bash
# Install Wrangler
npm install -g wrangler

# Login
wrangler login

# Create project
cd mission-control
wrangler pages project create abyssal-mission-control
```

### 4. Deploy

```bash
git add .
git commit -m "feat: deploy mission control to Cloudflare Pages"
git push origin main
```

GitHub Actions will automatically build and deploy.

## Option 2: Direct Upload (Manual)

```bash
cd mission-control

# Install dependencies
npm install

# Build
npm run build

# Deploy directly
wrangler pages deploy dist --project-name=abyssal-mission-control
```

## Option 3: Wrangler CLI

```bash
cd mission-control

# Login to Cloudflare
wrangler login

# Deploy
wrangler pages publish dist --project-name=abyssal-mission-control
```

## Custom Domain Setup

1. Go to [Cloudflare Dashboard](https://dash.cloudflare.com)
2. Select your Pages project
3. Click "Custom domains"
4. Add your domain (e.g., `dashboard.abyssal-twin.dev`)
5. Follow DNS verification steps

## Environment Variables

Create `mission-control/.env.production`:

```bash
VITE_API_BASE=https://api.abyssal-twin.dev
VITE_WS_URL=wss://api.abyssal-twin.dev/ws/live
```

## Verification

After deployment, verify:

```bash
# Check dashboard loads
curl https://abyssal-mission-control.pages.dev

# Check API connectivity (update URL to your backend)
curl https://api.abyssal-twin.dev/api/v1/health
```

## Troubleshooting

### Build fails
```bash
# Check TypeScript errors
npm run build 2>&1 | head -50
```

### API not connecting
- Check CORS headers in Cloudflare Workers
- Verify `VITE_API_BASE` is set correctly

### WebSocket fails
- Ensure `VITE_WS_URL` uses `wss://` not `ws://`
- Check WebSocket endpoint is deployed

## Next Steps

- [Configure monitoring](../monitoring.md)
- [Set up custom domain](../custom-domain.md)
- [Enable analytics](../analytics.md)
