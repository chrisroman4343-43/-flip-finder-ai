# Flip Finder AI

Flip Finder AI is a free, local-first Progressive Web App for evaluating and managing resale finds on an iPhone. It works with any item category and can be configured for the owner’s local resale market and personal profit rules.

## What Phase 1 includes

- Mobile dashboard and project filters
- Facebook Marketplace and Kijiji screenshot/photo intake
- On-device image compression
- Draft and project persistence in IndexedDB
- Custom ChatGPT Plus evaluation prompts with structured result import
- Personalized verdicts using profit, hourly return, investment and risk limits
- Separate item workspaces with stages, photos, notes, expenses and sale records
- Quick ChatGPT prompts for identification, inspection, pricing, cleaning, repair, photographs, listings, messages and offers
- Backup export and restore
- Offline app shell and iPhone Home Screen installation support

The app does not scrape Facebook or Kijiji, call a paid AI API, automatically send messages, or publish listings.

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

## Free GitHub Pages deployment

1. Create a new GitHub repository.
2. Upload every file and folder in this project.
3. Open the repository’s **Settings → Pages**.
4. Under **Build and deployment**, choose **Deploy from a branch**.
5. Choose the `main` branch and `/ (root)`, then save.
6. Wait for GitHub to show the published HTTPS link.
7. Open that link in Safari on the iPhone.
8. Tap **Share → Add to Home Screen → Add**.

All personal settings and project data remain in that Safari installation. The public repository contains only generic app code and demonstration records. Export backups from the app to protect personal records.

## Important storage note

Do not use Private Browsing. Safari may remove website storage if website data is manually cleared. Use **Settings → Export Backup** regularly and save the JSON file in Files or iCloud Drive.
