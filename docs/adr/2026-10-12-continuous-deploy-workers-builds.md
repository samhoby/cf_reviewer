# ADR: Continuous deployment with Cloudflare Workers Builds

- **Status:** Accepted
- **Date:** 2026-10-12
- **Owner:** Thierry Simões

## Context
Deploys were manual (`npm run deploy`). Every commit to the repository should redeploy the app automatically.

## Options considered
1. **GitHub Actions** — `.github/workflows/deploy.yml` runs typecheck + `wrangler deploy`. Config lives in the repo, but needs a Cloudflare API token and account ID stored as GitHub secrets.
2. **Cloudflare Workers Builds** — connect the GitHub repo to the Worker in the Cloudflare dashboard; Cloudflare builds and deploys on push. No workflow file and no secrets to manage.

## Decision
Option 2, deploying **pushes to `main` only**.

| Setting | Value |
|---|---|
| Repository | `samhoby/cf_reviewer` |
| Production branch | `main` |
| Build command | `npm run typecheck` |
| Deploy command | `npx wrangler deploy` |
| Non-production branch builds | Disabled |

The build command acts as a gate: if `tsc --noEmit` fails, nothing is deployed.

## Consequences
- Every push to `main` goes to production within minutes; build logs appear under the Worker's **Deployments** tab and on the GitHub commit status.
- CI/CD configuration lives in the Cloudflare dashboard, not in the repo. This ADR is its record; update it if the settings change.
- The Worker `name` in `wrangler.jsonc` (`cf-reviewer`) must match the connected Worker, or the build fails.
- Other branches and PRs are not built or checked.

## Migration plan
1. Deploy once manually (`npm run deploy`) so the Worker exists.
2. Dashboard → Workers & Pages → `cf-reviewer` → Settings → Builds → Connect → GitHub → `samhoby/cf_reviewer`, then apply the settings above.
3. Push a commit to `main` and confirm the build succeeds.
4. If the GitHub repo is renamed, reconnect it in the same settings page.
