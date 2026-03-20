# Cognito sign-in after API / Amplify changes

## What’s going wrong?

**`VITE_API_BASE_URL`** (e.g. `https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com`) is **not** used for the Cognito password flow itself. The browser talks to **`cognito-idp.<region>.amazonaws.com`** directly.

The app only uses the API to load **which** user pool and app client to use:

`GET {VITE_API_BASE_URL}/api/public/cognito/config` → `{ region, userPoolId, appClientId }`

So if sign-in fails with **HTTP 400** from Cognito, it’s usually one of these:

1. **New Cognito User Pool after Terraform** — Terraform creates **`youtubebooster-users`** and writes **`/youtubebooster/cognito/user-pool-id`** and **`/youtubebooster/cognito/app-client-id`**. If that pool is **new**, your existing users still live in the **old** pool. Sign-in then fails (often **400** / “incorrect username or password”) because the account **does not exist** in the new pool.
2. **Stale Lambda vs SSM** — The API reads Cognito settings from SSM **when the Lambda cold-starts**. If you change SSM but **don’t** recycle Lambda instances, behavior can be inconsistent until a **new deployment** or **forced cold start**.
3. **Wrong pool / client pair** — If SSM ever mixes an old pool id with a new app client id (or vice versa), Cognito returns **400**.

## If SSM is already “correct” but sign-in still fails

SSM being correct in the console is **not** enough unless the **running API** and the **browser** use the same values.

### 1) Compare SSM to what Lambda actually returns

The Lambda reads Cognito from SSM **once per cold start** (`Program.cs`). It does **not** re-read SSM on every request.

1. In **Parameter Store**, copy **`/youtubebooster/cognito/user-pool-id`** and **`/youtubebooster/cognito/app-client-id`** (exact strings, no spaces).
2. Open **`GET {VITE_API_BASE_URL}/api/public/cognito/config`** in the browser.
3. **They must match.** If the JSON shows **different** ids than SSM → warm Lambdas are still on an old snapshot → **redeploy** or **update-function-configuration** (or any change that forces new execution environments), then retry.

Until the API response matches SSM, the SPA may be signing in against the **wrong** pool/client even though SSM looks fine.

### 2) Confirm the app client belongs to that pool

In **Cognito → your user pool → App integration → App clients**, open the client whose id matches **`appClientId`**. It must be under **this** pool (not another pool’s client id copied by mistake).

### 3) User state (when the user exists in that pool)

- Status should be **CONFIRMED** (not stuck in **FORCE_CHANGE_PASSWORD** / **RESET_REQUIRED** without completing the flow).
- Try **Forgot password** once to rule out a bad password / typo.
- Password policy must still be satisfied (length, upper/lower, etc.).

### 4) Get the real Cognito error

In **DevTools → Network**, open the failing **`cognito-idp...`** request → **Response**. Note **`__type`** (e.g. `NotAuthorizedException`, `InvalidParameterException`, `ResourceNotFoundException`). That pinpoints config vs credentials vs request shape.

### 5) Clear old Cognito cache in the browser

If you ever switched **app client id** or pool, clear **localStorage** keys starting with **`CognitoIdentityServiceProvider.`** for this site (or “Clear site data”), then try again.

## Quick checks

### 1) See what the API is advertising

Open in the browser (no auth):

`https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com/api/public/cognito/config`

Note **`userPoolId`** and **`appClientId`**.

### 2) See where your user actually exists

In **AWS Console → Cognito → User pools**, open the pool whose **Pool id** matches **`userPoolId`** from step 1. Check **Users** for `mykantor@bellsouth.net` (or your email).

- **User missing** → you’re on a **new** pool; see fixes below.
- **User present** → check password / verification, or inspect the **Network** tab for the exact Cognito error body.

## Fixes

### A) Keep existing users (point API + app at the **old** pool)

1. In Cognito, find the **original** user pool that still has your users.
2. Copy its **Pool id** and the **App client id** of the SPA client (no client secret) that allows **USER_PASSWORD_AUTH** / **SRP**.
3. Set SSM (region `us-east-1`):
   - `/youtubebooster/cognito/region` → e.g. `us-east-1`
   - `/youtubebooster/cognito/user-pool-id` → old pool id
   - `/youtubebooster/cognito/app-client-id` → old app client id
4. **Recycle Lambda** so it reloads config (any of):
   - Redeploy the Lambda zip / run your usual publish script, or  
   - `aws lambda update-function-configuration --function-name youtubebooster-ai-api --region us-east-1` with a harmless change (e.g. description), or  
   - Wait until all executions are cold-started (not reliable).
5. Hard-refresh the Amplify site (or clear site data) and try again.

### B) Accept the **new** pool (fresh accounts)

1. Leave Terraform-managed Cognito + SSM as-is.
2. Use **Sign up** on the site again for each user (or invite users).
3. Migrate data separately if needed (Dynamo users keyed by `sub` will change).

### C) One Terraform stack, one pool (avoid duplicate pools)

Long term, **import** the existing Cognito user pool + app client into Terraform state so `apply` doesn’t create a second pool. That’s a one-time infra task; ask whoever owns AWS/Terraform to do it carefully.

## Amplify env vars reminder

- **`VITE_API_BASE_URL`** = your **API Gateway base URL** (no trailing slash), e.g.  
  `https://yri8sw6k1h.execute-api.us-east-1.amazonaws.com`
- Rebuild the frontend after changing it so the SPA embeds the new value.

## Related code

- Public config: `backend/.../Program.cs` → `/api/public/cognito/config`
- SSM keys: `infra/terraform/main.tf` → `cognito/region`, `cognito/user-pool-id`, `cognito/app-client-id`
- JWT validation: `backend/.../CognitoAuth.cs` (must match the same pool as sign-in)
