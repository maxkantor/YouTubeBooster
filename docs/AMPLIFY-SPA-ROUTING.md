# Amplify SPA routing (`/admin/login/`, `/dashboard`, …)

**Lambda/API logs are unrelated.** A 404 on `https://…amplifyapp.com/admin/...` is returned by **Amplify Hosting** before your React bundle runs. The browser “unsafe frame / chrome-error” message is a side effect of that 404 page.

## What the repo does

1. **Root `amplify.yml` (monorepo)** — `customRules` sit next to `appRoot` (same pattern as [monorepo custom headers](https://docs.aws.amazon.com/amplify/latest/userguide/custom-header-YAML-format.html)), with a single catch‑all rewrite:
   - **`/<*>`** → **`/index.html`** — **`200`** (rewrite)
2. **`frontend/public/_redirects`** — Netlify-style rules (copied to `dist/`): **apex/http → `https://www.youtubeboosterai.com` (301)**, then **`/home` `/index` → `/`**, then **`/* → /index.html 200`**. Confirm **Amplify → Domains** has both apex and `www` attached so redirects apply. No `#` comment lines (safer for parsers).
3. **Terraform** (`enable_amplify_app`) — `aws_amplify_app` includes the same **`custom_rule`** so the rule exists in AWS even if Hosting ever ignores the YAML block.

After push, wait for the Amplify build + deploy to finish, then hard‑refresh or try an incognito window.

## If it still 404s — check the Amplify app (most common)

### 1. Rewrites must exist in the console

1. AWS Console → **Amplify** → your app → **Hosting** → **Rewrites and redirects**.
2. You should see at least **one** rule: source **`/<*>`**, target **`/index.html`**, type **Rewrite (200)**.
3. If the list is **empty** or wrong, the build spec from Git is not driving redirects (or an old console spec is overriding it). **Add this rule manually** (open JSON/text editor):

```json
[
  {
    "source": "/<*>",
    "status": "200",
    "target": "/index.html",
    "condition": null
  }
]
```

Save, then **Redeploy** the branch once.

### 2. Build specification must come from the repo

**Hosting** → **Build settings**: the app should use **`amplify.yml` from the repository**. If the console shows a **different** build spec with **no** `customRules`, either paste the repo file or remove the override so Git is the source of truth.

### 3. Monorepo env

**App settings** → **Environment variables**: **`AMPLIFY_MONOREPO_APP_ROOT`** = **`frontend`** (must match `appRoot` in `amplify.yml`).

### 4. Terraform-managed Amplify

If this app is created via **`enable_amplify_app`** in `infra/terraform`, run **`terraform apply`** after pulling so `custom_rule` on `aws_amplify_app` is applied.

## Optional: `AMPLIFY_DIFF_DEPLOY`

Only relevant if **`AMPLIFY_DIFF_DEPLOY=true`**. If every push already runs a full build, you can ignore it. Otherwise see [diff-based frontend builds](https://docs.aws.amazon.com/amplify/latest/userguide/edit-build-settings.html#configuring-diff-based-frontend-build-and-deploy).
