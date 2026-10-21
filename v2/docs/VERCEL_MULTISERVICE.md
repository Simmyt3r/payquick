# Payquick: Vercel multi-service deployment

**Status:** Repository configuration committed to the v2 feature branch. This is not proof of a successful multi-service deployment or financial certification.

## Service names and public routes

| Name | Root directory | Framework | Public routes |
| --- | --- | --- | --- |
| backend | v2/backend | Flask, entrypoint app:app | /api/(.*) |
| frontend | v2/frontend | Vite | / and all non-API paths |

Vercel preserves the original request path when forwarding to a service. Flask already declares /api/health, /api/auth/login, /api/vtu/orders, /api/webhooks/paystack and other /api routes, so no prefix stripping is needed.

The repo-root vercel.json has explicit /login, /register and /app rewrites to the frontend's /index.html to support direct SPA entry/refresh. Its general /api/(.*) rule appears first; the frontend catch-all appears last.

## Bindings between services

**No runtime bindings were added because the current code has no server-to-server call between these services.**

- Vite is a browser SPA. Its client calls same-origin /api/... over the public API rewrite. A Vercel runtime service binding cannot be consumed inside browser JavaScript or at frontend build time.
- Flask serves JSON and does not send requests to the Vite server.
- Aiven PostgreSQL, VTpass and Paystack are external infrastructure/providers, not Vercel internal services.
- The durable vending worker remains outside the Vercel web request lifecycle and is not a service in this project.

If a future server-side service must call another, add a four-field binding on the caller, for example:

    { "type": "service", "service": "backend", "format": "url", "env": "INTERNAL_BACKEND_URL" }

Never invent that binding for client-side Vite code, or expose its injected URL in the public bundle.

## Application changes

- Web API requests are now always same-origin /api, regardless of VITE_API_URL.
- Installed Capacitor Android still uses the explicit VITE_API_URL HTTPS origin because there is no website origin inside a native app.
- The Vite localhost:5000 proxy remains only for the standalone npm run dev workflow, not cloud requests.
- The legacy frontend-only Vercel project rooted at v2/frontend retains its nested configuration and is not automatically converted by adding the repository-root file.

## Deployment procedure

Import Simmyt3r/payquick as a NEW Vercel Services project and choose the repository ROOT as the Vercel root directory. Use the reviewed feat/payquick-v2-foundation source for a preview, not the legacy main branch. Do not merge the financial platform to main solely to deploy.

Vercel Services (beta) builds both services under one project/domain. It does not provision Aiven PostgreSQL, execute SQL migrations, manage the external durable vending worker, or certify VTpass/Paystack.

Keep PAYMENTS_ENABLED=false, VTU_VENDING_ENABLED=false, ELECTRICITY_VENDING_ENABLED=false, VTPASS_LIVE_ENABLED=false and REMOTE_METER_LOADING_ENABLED=false. Customer-facing backend features need separately provisioned DATABASE_URL and JWT_SECRET. The public landing page does not.

## Tests

From v2/frontend run:

    npm run test:services
    npm run test:landing
    npm run build

CI runs these tests. The service contract check tests service names, routing precedence, backend /api paths, SPA deep links, same-origin web calls and the absence of fake service bindings. After import, verify /, /login and /register load the SPA; /api/health returns Flask JSON; unauthenticated /api/wallet returns 401 JSON, never index.html.

## Please confirm before production promotion

1. Keep names backend (Flask) and frontend (Vite)?
2. Keep backend public only via /api/* and frontend public via every other path? No internal-only third service?
3. Keep zero internal bindings until a real server-side caller is introduced?

Official guide: https://vercel.com/docs/services

## Post-deployment readiness and registration UX

The deployment now separates liveness (`GET /api/health`, HTTP 200 for a running Flask process) from customer readiness (`GET /api/ready`, HTTP 200 only after TLS PostgreSQL, JWT secret and required migrations are available; otherwise HTTP 503 with non-sensitive check statuses). Login/registration fail safely with 503 if not configured. The client checks readiness on the login/register screen and disables submission when unavailable, rather than presenting a misleading working form. Known database connection failures respond with 503 and no secrets. Unknown API routes/methods retain correct HTTP 404/405, not a generic HTTP 500.

Do not enable live payment switches merely to turn readiness green. Readiness is for customer account infrastructure, **not** provider certification. The UI's public landing remains independent of readiness.
