# Flip Finder AI

Flip Finder AI is a free, local-first Progressive Web App for evaluating and managing resale finds on an iPhone. It works with any item category and uses the free GitHub Models allowance for built-in photo analysis and item-specific AI chat.

## What Phase 1 includes

- Mobile dashboard and project filters
- Facebook Marketplace and Kijiji screenshot/photo intake
- On-device image compression
- Draft and project persistence in IndexedDB
- Built-in OpenAI GPT-4.1-mini photo analysis through GitHub Models
- Personalized verdicts using profit, hourly return, investment and risk limits
- Separate item workspaces with stages, photos, notes, expenses and sale records
- In-app AI chat and one-tap help for identification, inspection, pricing, cleaning, repair, photographs, listings, messages and offers
- Backup export and restore
- Offline app shell and iPhone Home Screen installation support

The app does not scrape Facebook or Kijiji, automatically send messages, or publish listings. GitHub Models free usage is rate limited and is intended for personal prototyping. Keep paid usage disabled so requests stop instead of creating charges.

## Run it locally

From the project folder:

```bash
npm run serve
```

Open `http://localhost:4173` on the computer. A PWA service worker requires localhost or HTTPS.

## Test it

```bash
npm run check
```

## Secure free AI setup

The public app must never contain a GitHub token. The included Netlify Function keeps it on the server.

1. Create a fine-grained GitHub personal access token with only **Models: Read** permission.
2. Sign in to Netlify with GitHub and import this repository.
3. Leave the build command blank and use `.` as the publish directory.
4. Add `GITHUB_MODELS_TOKEN` in **Site configuration → Environment variables**.
5. Optionally add `GITHUB_MODEL=openai/gpt-4.1-mini`.
6. Deploy the site. The function is available at `/api/ai` on the same address.

Never commit the real token to GitHub, paste it into app code, or send it through a chat.

## iPhone installation

1. Open the Netlify HTTPS link in Safari on the iPhone.
2. Tap **Share → Add to Home Screen → Add**.

All personal settings and project data remain in that Safari installation. The public repository contains only generic app code and demonstration records. Export backups from the app to protect personal records.

## Important storage note

Do not use Private Browsing. Safari may remove website storage if website data is manually cleared. Use **Settings → Export Backup** regularly and save the JSON file in Files or iCloud Drive.
