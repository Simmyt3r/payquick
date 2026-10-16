# Payquick 2.0 Deployment Record

Last checked: 16 October 2026.

## Vercel frontend (built)

- **Project**: `payquick-v2`
- **Vercel project ID**: `prj_TzRqCQyIg9wiKAKJgoR7OInEM7Mu`
- **Source**: `Simmyt3r/payquick`
- **Branch**: `feat/payquick-v2-foundation`
- **Verified source SHA**: `52b1dd2556478972b63125cd3c31a9ec8317a84c`
- **Root directory**: `v2/frontend`
- **Framework**: Vite
- **Deployment**: `dpl_4gmnKR4A3qEyd6aKYoEvMuZQYupj`
- **Vercel build status**: READY (build completed, Vite/PWA assets generated)
- **Public-looking alias**: https://payquick-v2-three.vercel.app
- **Build URL**: https://payquick-v2-pqeaqlsyk-simmyt3r-gmailcoms-projects.vercel.app
- **Dashboard**: https://vercel.com/simmyt3r-gmailcoms-projects/payquick-v2/4gmnKR4A3qEyd6aKYoEvMuZQYupj

**Access caveat:** Deployment authentication (SSO) is enabled on the project; a READY build does not prove anonymous visitors can access the site. No public-access policy was changed.

**Release caveat:** The project's Git-linked production branch is still `main` (the legacy Expo/Firebase source). The V2 deployment explicitly built the feature-branch commit shown above. Do not merge the draft PR or treat an unreviewed push to `main` as a safe financial production release.

The homepage is independent of payment credentials. The Flask API and PostgreSQL wallet backend have **not** been deployed or attached to this frontend. Payment, VTpass vending and physical meter loading feature gates remain disabled pending certification.

## mdsilabs fork

- Repository: https://github.com/mdsilabs/payquick
- Fork of: https://github.com/Simmyt3r/payquick
- Fork's observed `main` at last check: `7bc27332c6ec30a1788ff2f2bf313e0b9ee33ece` (legacy Expo app).
- GitHub connector permissions: **read only**; no push/admin permission.
- Vercel project creation returned `repo_no_access`: Git integration needs repository write/admin access.
- **Result**: No new files or branches were written to the fork. No V2 fork deployment was created.

To continue the fork deployment without replacing its legacy `main`, the fork owner should install/authorize the Vercel GitHub integration for `mdsilabs/payquick` and grant an appropriately scoped GitHub connection permission to push a V2 feature branch. Preserve `main`; sync the V2 branch via an approved PR, then create a **separate** Vercel Vite project rooted at `v2/frontend`. No history rewriting or force push is needed.

## Verification gates

- GitHub Actions CI on source SHA `52b1dd2`: successful backend PostgreSQL regression tests (102), standalone no-env homepage smoke test, Vite production build and Android workflows.
- Vercel build: succeeded for the same SHA.
- Before accepting real money: provision isolated PostgreSQL, review/apply migrations, deploy Flask API and durable worker, configure provider test accounts, run real sandbox cases, reconcile with provider settlement statements, and meet security/compliance requirements.
- Before claiming a meter was auto-loaded: a written utility/manufacturer agreement and genuine meter acceptance proof are required.

This record is for reproducibility. It contains identifiers and links, **not** API keys or connection strings.
