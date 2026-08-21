# Amplify SPA routing (`/admin/login/`, `/dashboard`, …)

**Lambda/API logs are unrelated.** A 404 on `https://…amplifyapp.com/admin/...` is returned by **Amplify Hosting** before your React bundle runs. The browser “unsafe frame / chrome-error” message is a side effect of that 404 page.

## What the repo does

1. **Root `amplify.yml` (monorepo)** — `customRules` sit next to `appRoot`. **Indexable marketing URLs rewrite to `/path/index.html` (200).** Private app URLs (`/admin`, `/dashboard`, `/auth`, `/checkout`, …) rewrite to **`/spa.html`** (noindex shell). There is **no** global `/<*>` → homepage rewrite — that made Google treat `/audit` and `/blog` as homepage duplicates (“Crawled - currently not indexed”).
2. **`frontend/public/_redirects`** — Netlify-style www/http → apex. Build also writes `dist/_redirects` from `frontend/scripts/hosting-redirect-rules.mjs`.
3. **Terraform** (`enable_amplify_app`) — same SEO + SPA rules as `amplify.yml`.
4. **Amplify console `customRules`** — must match the repo. A SPA catch-all regex that excludes only image/font extensions (but **not** `.html`) will rewrite `/audit/index.html` and `/spa.html` back to the homepage. After changing rules, run an Amplify **RELEASE** if the custom domain still CloudFront-Hits stale HTML while `*.amplifyapp.com` is correct.

After push, wait for the Amplify build + deploy to finish, then hard‑refresh or try an incognito window.

## If it still 404s — check the Amplify app (most common)

### 1. Rewrites must exist in the console

1. AWS Console → **Amplify** → your app → **Hosting** → **Rewrites and redirects**.
2. You should see **301s** for retired marketing URLs, **200s** for `/audit` → `/audit/index.html` (and the other public pages), and **200s** for `/admin/<*>` and `/dashboard/<*>` to `/index.html`. You should **not** see a single catch-all `/<*>` → `/index.html` for the whole site.
3. If the list is **empty** or still has a sitewide `/<*>` → `/index.html` rewrite, the console is overriding Git. Copy **`customRules` from repo `amplify.yml`** (SEO 200s + SPA prefixes only). Do **not** add a global `/<*>` homepage rewrite.

### 2. Build specification must come from the repo

**Hosting** → **Build settings**: the app should use **`amplify.yml` from the repository**. If the console shows a **different** build spec with **no** `customRules`, either paste the repo file or remove the override so Git is the source of truth.

### 3. Monorepo env

**App settings** → **Environment variables**: **`AMPLIFY_MONOREPO_APP_ROOT`** = **`frontend`** (must match `appRoot` in `amplify.yml`).

### 4. Terraform-managed Amplify

If this app is created via **`enable_amplify_app`** in `infra/terraform`, run **`terraform apply`** after pulling so `custom_rule` on `aws_amplify_app` is applied.

## Optional: `AMPLIFY_DIFF_DEPLOY`

Only relevant if **`AMPLIFY_DIFF_DEPLOY=true`**. If every push already runs a full build, you can ignore it. Otherwise see [diff-based frontend builds](https://docs.aws.amazon.com/amplify/latest/userguide/edit-build-settings.html#configuring-diff-based-frontend-build-and-deploy).
