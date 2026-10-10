# Onam Veg ordering proof of concept

Customer ordering and a protected staff/kitchen dashboard, matching the Onam Veg restaurant website. The original dashboard is retained in `legacy/OriginalDashboard.jsx`; its temporary print/order tunnel is NOT used by this app.

## Current deployment

- Source: onamveg-ux/onam-customer-menu.
- Build: `npm ci`, `npm test`, `npm run build`.
- Build base: `/ordering/`.
- The built `dist` files are copied to `OnamVegWebsite/dist/ordering`; that repository's Vercel project hosts them at https://order.onamveg.in/ using host-specific routing.
- Staff entry: https://order.onamveg.in/?staff=1.
- Until configured, the app shows an explicitly labelled proof of concept. Browsing and a local bag work; submission and staff operations fail closed.
- This does not connect to a physical printer or an external POS. The database-backed staff screen is the kitchen queue.

## Backend setup (Supabase Free)

1. Create a new Supabase project. Keep its database password private.
2. Run `supabase/migrations/001_secure_ordering.sql` in the SQL editor, then `supabase/seed.sql`.
3. Choose phone or email OTP in Supabase Auth. Phone needs an SMS provider. Email needs custom SMTP for delivery to public users; change the email template to show `{{ .Token }}` rather than only a magic link. Configure 6–8 digit codes and short expiry. Enable only the chosen login channel; disable anonymous sign-ins. Limit Auth JWT lifetime to 15 minutes. Set OTP send/verify rate limits, including per-IP limits, and a resend interval of at least 60 seconds.
4. Create a Cloudflare Turnstile widget allowing `order.onamveg.in` (and localhost for local testing). In Supabase Auth bot protection, enable Turnstile and save its SECRET there. This is mandatory: a visible client widget alone is not protection.
5. Enable TOTP MFA in Supabase Auth. Set the Site URL to `https://order.onamveg.in`; keep redirect allowlists restricted to required origins.
6. Put only these PUBLIC values in `public/config.json`: `supabaseUrl`, `supabasePublishableKey` (publishable/anon key, never service-role), `turnstileSiteKey`, and `authChannel` (`phone` or `email`). The database setting is authoritative for the chosen auth channel.
7. Run `update public.ordering_settings set auth_channel='email' where id=true;` if selecting email (default is phone).
8. Have the staff member sign in once at `?staff=1`. In Supabase Auth, copy that user's UUID and assign access through SQL:
   `insert into private.staff(user_id) values ('STAFF-USER-UUID');`
   The user then enrolls an authenticator in the staff screen. Customer metadata cannot grant staff privileges. Never put an owner/service-role key into browser config.
9. Review the seeded menu, prices, table numbers (1–10), phone number (+91 87147 03888), hours and pickup process. The seed is a snapshot of the original repository's spreadsheet, not a live sync. Its prices differ from the marketing website; reconcile them before accepting real orders. Change menu records in Supabase, not in browser state. Use `active=false` to pause a dish.
10. Only after OTP delivery, CAPTCHA, staff MFA, permissions and the review flow are verified, enable with `update public.ordering_settings set enabled=true where id=true;`.

No real customer/kitchen test submissions were made during development. Provider-backed OTP and MFA require your configured project before end-to-end verification is possible.

## Order rules

- Authenticated, non-anonymous user with confirmed contact and OTP authentication in the past hour required at the database boundary.
- Prices and totals calculated from the database. Client-supplied prices/status/customer identities are never accepted.
- Quantity sum determines size: 11 portions of one dish is a large order. Exactly 10 portions is not.
- All requests initially remain outside the kitchen queue. Up to 10 portions needs staff acceptance. Above 10 needs a customer/kitchen call and an MFA-verified staff member recording the confirmation. A customer clicking Call cannot unlock an order.
- Acceptance is refused after 60 minutes; staff should decline expired requests.
- One active order per customer prevents splitting an order into several smaller simultaneous tickets. Three new requests per 15 minutes and 20 per day; cancelling does not reset these limits. Up to 100 portions and 50 distinct lines; larger catering orders require a call.
- UUID idempotency and a database transaction lock prevent repeat submissions from creating duplicate tickets. Failed submissions retain the bag.
- Customers can see only their own orders, and can cancel only before acceptance. Staff roles come from a private owner-maintained table and kitchen access requires AAL2.
- Audit records capture submissions, cancellations, transitions and call confirmations. No automatic telephony is implemented; call confirmation is a trusted staff attestation.
- Contact data and order notes are not stored in localStorage; only item IDs/quantities are. Auth tokens are held in memory; refreshing requires sign-in again. No checkout analytics or third-party tracking is included.
- Client-side configuration never enables ordering on its own; the database switch and authorization checks remain authoritative.

## Tests and limitations

`npm test` executes 23 PostgreSQL-level security tests in PGlite with Supabase auth claims mocked. Tests cover threshold boundaries, unauthenticated/unverified/stale identities, totals, duplicate requests, order isolation, staff/MFA access, mandatory call approval, cancellation and rate limits. They verify SQL policies and transitions, not the hosted Auth service or actual delivery of OTPs.

The proof of concept has no online payments, delivery dispatch, automatic calls, printer integration, availability scheduling or production monitoring. Staff must keep the dashboard open; it polls every 15 seconds and shows the last successful update. For real service, finish provider configuration, staff operational testing, backups, retention rules and monitoring. Free-tier capacity and uptime are not a production guarantee.

## Publish changes to the current Vercel project

After testing and building, copy the CONTENTS of `dist/` to `../onamveg-website/dist/ordering/` (not into a nested dist directory). Keep `public/config.json` and the deployed configuration in sync. Commit source changes here and the built files in OnamVegWebsite; push both to `main`. Vercel auto-deploys OnamVegWebsite. Only that second push updates the current subdomain.

A future standalone Vercel project can instead host this repository, using `npm run build` and output `dist`; configure a root rewrite to `/index.html` plus `/ordering/:path*` → `/:path*`, or build with `vite build --base=/` and update navigation accordingly before moving the domain.
