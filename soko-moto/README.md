# Soko Moto

Soko Moto is a farmer-first local marketplace for Kenya. This project uses Next.js 14 App Router, React and Supabase for authentication, PostgreSQL data, row-level security and product image storage.

## Included app areas

- Responsive landing page using the supplied Soko Moto branding and agricultural background assets.
- Account creation and sign-in with member roles.
- Discover page connected to published database listings; no fake/seeded farmers or product records.
- Farmer product management: create, edit, publish/unpublish, delete, upload up to five product photos and save drafts.
- Community donations: offer surplus produce or request support; requests are recorded against a real donation.
- Orders: buyer order requests and buyer/seller order views.
- Messages: database-backed direct messages between members.
- Veterinary directory and appointment requests; providers only appear when they create and publish profiles.
- Profile editing and setup guide.
- Optional AI listing-description assistant using a server-side OpenAI API key; suggestions are deliberately constrained not to invent certification, harvest dates or product claims.
- SQL schema with tables, indexes, row-level security policies, profile trigger and product image storage policies.
- Original supplied reference images retained under `public/images/reference/` for implementation/design reference; page layouts use the supplied logo and backgrounds rather than rendering whole screenshots as fake app UI.

## Run locally

1. Install Node.js 18.17+ (Node 20 LTS recommended).
2. Copy `.env.example` to `.env.local` and add your Supabase project URL and anon/public (or `sb_publishable_...`) key.
3. In the Supabase SQL Editor, run `supabase/schema.sql`.
4. In Supabase Authentication settings, set the local site URL and allowed redirect URLs.
5. Run:

   ```bash
   npm install
   npm run dev
   ```

6. Visit the local URL shown by Next.js.

If Supabase is not configured, the UI deliberately shows setup guidance and does not invent marketplace data. Authentication, image uploads, and persistent records require your configured Supabase project.

## Checking the Supabase connection

Open `/setup` (or `/api/health/supabase`) in the running app. It reports missing/invalid env vars, whether Supabase is reachable, and whether the tables and `product-images` bucket exist. `supabase/schema.sql` is idempotent, so you can re-run it safely after fixing a failed run.

Common causes of "can't connect": env vars set but app not restarted/redeployed; URL pasted with `/rest/v1` or a dashboard link; service-role key used instead of the anon key; free project paused; Auth redirect URLs not set for your domain.

## Deployment

Deploy to Vercel or another Node-compatible Next.js host. Add `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` to the deployment environment and run the database SQL against the production Supabase project. Set the production site URL and redirect allowlist in Supabase Auth. Run `npm run build` and test all workflows using at least two separate accounts (buyer and seller) before public launch.

## Important production boundary

This is a substantial integrated starter, not a claim that every external service is already live. A marketplace launch still requires real Supabase credentials, email delivery settings, domain/HTTPS, operational moderation, admin tools, privacy/terms, backups, monitoring, abuse protection, and payment/delivery integrations if you intend to process money or coordinate delivery. The AI listing assistant also requires a server-side `OPENAI_API_KEY`; it is optional and does not run until configured. No fake testimonials, reviews, stock records or vet identities are bundled as live data. Vet verification is an operational review process and must not be represented as automatic proof of qualification.

## Images

- `public/images/logo.png`: supplied logo asset.
- `public/images/agri-background.png`: agricultural marketplace background.
- `public/images/vet-background.png`: veterinary hero background.
- `public/images/hero-with-phone.png`: supplied marketplace hero visual.
- `public/images/market-flatlay-background.png` and `market-header-background.png`: supplied supporting backgrounds.
- `public/images/reference/`: supplied UI screenshots and design references, retained for further implementation.

## Troubleshooting the Next.js development runtime

If the browser reports a stale `webpack.js` / `options.factory` runtime error after editing CSS or components, stop the dev server (`Ctrl+C`) and clear the generated Next.js cache before restarting:

```powershell
Remove-Item -Recurse -Force .next -ErrorAction SilentlyContinue
npm run dev
```

The `.next` directory is generated output and is intentionally excluded from the project ZIP. The CSS compatibility warning for `align-items: end` has been corrected to `align-items: flex-end`. A minimal `public/sw.js` is included for browsers that still request an older root service-worker URL; it does not cache or intercept app traffic.
