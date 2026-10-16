# Public landing page: no environment variables needed

The Payquick v2 homepage at `/` is a **static React presentation**. It must render correctly even when:

- `VITE_API_URL` is not set.
- The Flask API and Aiven PostgreSQL are unavailable.
- Paystack, VTpass and meter-remote-loading credentials do not exist.
- The user is not signed in and has no wallet or saved meter.

The public page does not call `/api/*`, does not require authentication, fetch provider catalogues or connect to any payment system. Visual balances and sample transactions are clearly labelled illustrative. No remote font, external image or environment-specific domain is required for its initial rendering.

## Routes

| URL | Purpose | Depends on backend? |
| --- | --- | --- |
| `/` | Public marketing and service overview | No |
| `/login` | Existing authentication form | Only when submitting credentials |
| `/register` | Existing registration form | Only when submitting details |
| `/app` | Customer dashboard, after authentication | Yes |
| `/#services` | Services on public homepage | No |
| `/#how-it-works` | Public explanation | No |
| `/#questions` | FAQs | No |

The CTA controls use client navigation and the browser back/forward history. Refreshing `/login`, `/register` or `/app` resolves through the explicit Vercel rewrites in `v2/frontend/vercel.json`.

The application intentionally stores the current sign-in token in memory, not the browser's persistent localStorage. Refreshing `/app` without a session displays the login form instead of failing.

## Verification

From `v2/frontend`:

1. `npm install`
2. `npm run test:landing` runs a server-side render of the public root without API, database or payment variables and checks the expected sections.
3. `npm run build` verifies TypeScript and the Vite production bundle.
4. `npm run dev` lets you inspect mobile/desktop layout and sign-in navigation. A running Flask backend is **not needed** to view the homepage.

CI performs the public landing test before the web build. Android/PWA packaging includes the same landing page and still requires `VITE_API_URL` for **authenticated payment functionality**, not for displaying the public homepage.

## Honest launch messaging

The homepage includes a development-preview notice because live payment and remote meter loading remain disabled. It does not promise that test-only transactions or optional PQ-AI functionality are active. When all providers are certified, revise the preview language through a reviewed release commit, **not** an unverified client-provided environment flag.

The landing page uses local, bundled CSS and vector illustrations. The page can be deployed to Vercel as a frontend-only static site without connecting Aiven, Paystack, VTpass or Flask. Backend-driven features will not function until separately configured.
