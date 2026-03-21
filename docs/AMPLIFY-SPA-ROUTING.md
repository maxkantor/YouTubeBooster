# Amplify SPA routing (`/admin/login/`, `/dashboard`, …)

If deep links return **404** from `*.amplifyapp.com`, the hosting layer is serving the path as a static file instead of `index.html`.

## Fix in repo

Root **`amplify.yml`** includes SPA rewrites under **`frontend.customRules`**: an explicit **`/admin/<*>`** rule plus the [AWS SPA regex](https://docs.aws.amazon.com/amplify/latest/userguide/redirect-rewrite-examples.html) so static assets are not rewritten to HTML.

After changing `amplify.yml`, push as usual; a new build runs if your app **builds on every push** (typical). Wait for the job to finish before retesting deep links.

## Fix immediately in AWS Console

1. Amplify → your app → **Hosting** → **Rewrites and redirects** → **Open text editor** (or manage rules).
2. Ensure these rules exist **in order** (admin rule first is fine):

```json
[
  {
    "source": "/admin/<*>",
    "status": "200",
    "target": "/index.html",
    "condition": null
  },
  {
    "source": "</^[^.]+$|\\.(?!(css|gif|ico|jpg|js|png|txt|svg|woff|woff2|ttf|map|json|webp)$)([^.]+$)/>",
    "status": "200",
    "target": "/index.html",
    "condition": null
  }
]
```

3. Save, then **redeploy** if the console asks.

## Checklist

- **Environment variable:** `AMPLIFY_MONOREPO_APP_ROOT` = `frontend` (must match `appRoot` in `amplify.yml`).
- **Build artifact:** `baseDirectory` = `frontend/dist` (via `dist` under `appRoot` in the spec).
- **`frontend/public/_redirects`:** Netlify-style fallback is copied into `dist/`; Amplify may also honor it, but YAML/console rules are the reliable fix.

## Optional: diff-based deploy (`AMPLIFY_DIFF_DEPLOY`)

If **every push already triggers a full build**, you can ignore this.

Only when **`AMPLIFY_DIFF_DEPLOY`** is set to **`true`** can Amplify **skip** the frontend build/deploy when it detects no diff under the configured root—then a change **only** to repo-root `amplify.yml` might not refresh hosting. Fixes: **Redeploy this version**, set **`AMPLIFY_DIFF_DEPLOY=false`**, set **`AMPLIFY_DIFF_DEPLOY_ROOT`**, or see [diff-based frontend builds](https://docs.aws.amazon.com/amplify/latest/userguide/edit-build-settings.html#configuring-diff-based-frontend-build-and-deploy).

The browser console message *“Unsafe attempt to load URL … from frame … chrome-error://chromewebdata”* is a side effect of the **404 error page**, not the root cause.
