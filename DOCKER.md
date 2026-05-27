# Docker + Docker Hub Setup

This project has a production-ready multi-stage Dockerfile that produces a small, secure image using Next.js standalone output.

## Quick Commands (Recommended)

```bash
# Build for Railway (amd64)
npm run docker:build

# Build + push to Docker Hub (k1dev2026/rams-compliance-app)
npm run docker:build:push

# Run locally with your .env.local
npm run docker:run

# Push manually (after building)
npm run docker:push
```

> **Note**: All build commands automatically use `--platform linux/amd64` because Railway runs on AMD64 servers.

## Publishing to Docker Hub (Recommended)

### 1. One-time Setup

1. Create a free account at [hub.docker.com](https://hub.docker.com)
2. Create a new repository called `rams-compliance-app` (or any name you prefer)
3. Go to **Account Settings → Security** and create a **Personal Access Token** (recommended over password)
   - Scope: `Read, Write, Delete`

### 2. Add GitHub Secrets

In your GitHub repository, go to **Settings → Secrets and variables → Actions** and add:

| Secret Name         | Value                              |
|---------------------|------------------------------------|
| `DOCKERHUB_USERNAME` | k1dev2026 (or your Docker Hub username) |
| `DOCKERHUB_TOKEN`    | The Personal Access Token you created |

### 3. Automatic Builds

The workflow at `.github/workflows/docker.yml` will automatically:

- Build the image on every push to `main`
- Build on version tags (`v1.0.0`, etc.)
- Push to Docker Hub with proper tags (`latest`, `sha`, semver)

You can also trigger it manually from the **Actions** tab (this will use `npm run docker:build:push` for full consistency with local development).

## Deploying on Railway (Two Options)

### Option A: Build on Railway (Current)
Keep using the Dockerfile directly (what you're doing now). Simple but consumes build minutes.

### Option B: Deploy Pre-built Image from Docker Hub (Recommended & Faster)

Once the GitHub Action has pushed an image to Docker Hub, you can deploy it directly on Railway without building every time.

#### For a new service:
1. In Railway, click **New** → **Deploy from Image**
2. Enter the image URL:
   ```
   k1dev2026/rams-compliance-app:latest
   ```
3. Click **Deploy**

#### To switch an **existing** Railway service to use the pre-built image:

1. Go to your service in Railway
2. Click on the **Settings** tab
3. Under **Source**, click the current source (usually your GitHub repo)
4. Select **"Deploy from Image"**
5. Paste the image you want to use:
   - For latest: `k1dev2026/rams-compliance-app:latest`
   - For a specific commit (best for production): `k1dev2026/rams-compliance-app:sha-abc1234`
6. Save the change

Railway will now pull the pre-built image from Docker Hub on every deploy instead of running `docker build`.

**Benefits:**
- Much faster deployments (no build time on Railway)
- Consistent builds (built the same way every time in GitHub Actions)
- Uses your GitHub Actions minutes instead of Railway build minutes

You can still keep the Dockerfile in the repo for local development and Railway's "Build from Dockerfile" fallback if needed.

## Image Tags Strategy

We recommend this tagging convention (already configured in the workflow):

- `latest` → current main branch
- `sha-xxxxxxx` → specific commit (great for rollbacks)
- `v1.2.3` → version tags
- `1.2` → major.minor

Example full image references:
- `k1dev2026/rams-compliance-app:latest`
- `k1dev2026/rams-compliance-app:sha-7f3a2b1`

## Security Notes

- Never bake secrets into the image (our Dockerfile is designed to avoid this)
- Use Railway/Docker secrets at runtime only
- Prefer Personal Access Tokens over your Docker Hub password
- Consider private repositories if the image contains sensitive logic

## Need Help?

Run `npm run docker:build` locally first to verify everything works before pushing to Docker Hub.
