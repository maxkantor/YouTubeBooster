# Amplify SPA routing (`/admin/login/`, `/dashboard`, …)

If deep links return **404** from `*.amplifyapp.com`, the hosting layer is serving the path as a static file instead of `index.html`.

## Fix in repo

Root **`amplify.yml`** includes SPA rewrites under **`frontend.customRules`**: an explicit **`/admin/<*>`** rule plus the [AWS SPA regex](https://docs.aws.amazon.com/amplify/latest/userguide/redirect-rewrite-examples.html) so static assets are not rewritten to HTML.

After changing `amplify.yml`, **redeploy** the branch. If **`AMPLIFY_DIFF_DEPLOY`** is on, a change only at the repo root might **not trigger a deploy** — see below.

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

## Diff-based deploy can skip hosting updates

If **`AMPLIFY_DIFF_DEPLOY`** is enabled, Amplify may **skip the deploy step** when it sees no changes under the diff root (often `appRoot` / `frontend`). A change **only** to **repo-root** `amplify.yml` might **not** redeploy hosting, so **rewrites never update**.

**Fix one of:**

1. **Redeploy manually:** Amplify → your branch → **Redeploy this version** (forces a new deploy).
2. **Disable diff deploy:** set `AMPLIFY_DIFF_DEPLOY` = `false` for the branch (Hosting → Environment variables).
3. **Widen diff root:** set **`AMPLIFY_DIFF_DEPLOY_ROOT`** to the repository root (e.g. `.`) so edits to root `amplify.yml` count as changes — see [diff-based frontend builds](https://docs.aws.amazon.com/amplify/latest/userguide/edit-build-settings.html#configuring-diff-based-frontend-build-and-deploy).
4. **Trivial commit:** change any file under `frontend/` and push so a full deploy runs.

The browser console message *“Unsafe attempt to load URL … from frame … chrome-error://chromewebdata”* is a side effect of the **404 error page**, not the root cause.
