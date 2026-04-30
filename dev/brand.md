# Brand

## Logo

### Logo Types

- `logo`: plain logo, no background.
- `wordmark`: logo + word.
- `favicon`: logo on background, rounded `17%` corners.
- `avatar`: logo on background, square.

### Rebranding Guidance

- Update the React logo source in `apps/web/src/components/icons/logo.tsx`.
- Update the React wordmark source in `apps/web/src/components/icons/wordmark.tsx`.
- Keep the exported SVG strings in those files in sync with the rendered React components. `BrandMenu` copies those exact strings.
- Update standalone brand assets in `apps/web/public/brand/` when the non-React files need to match the current mark.
- Update favicon files in `apps/web/public/favicon/` when the browser/app icon changes.
- If favicon filenames change, also update `apps/web/src/app/layout.tsx`.
- If the org logo asset changes, verify `apps/web/src/lib/consts.ts` still points at the right public file for structured data.
- If social avatars change, update all external profiles at the same time so the mark stays consistent across the site and socials.

### Where Each Type Is Used

#### Logo

- Source of truth for the in-app React logo: `apps/web/src/components/icons/logo.tsx`
- Copy-as-SVG export: `apps/web/src/components/web/brand-menu.tsx`
- Decorative inline logo in footer: `apps/web/src/components/web/footer.tsx`
- Standalone brand files: `apps/web/public/brand/logo-light.svg`, `apps/web/public/brand/logo-dark.svg`

#### Wordmark

- Source of truth for the in-app React wordmark: `apps/web/src/components/icons/wordmark.tsx`
- Desktop main header: `apps/web/src/components/web/brand-menu.tsx`
- Mobile main header: `apps/web/src/components/layout/navigation-bar.tsx`
- Docs sidebar title: `apps/web/src/app/docs/layout.tsx`
- Copy-as-SVG export: `apps/web/src/components/web/brand-menu.tsx`

#### Favicon

- Main favicon metadata: `apps/web/src/app/layout.tsx`
- Favicon files: `apps/web/public/favicon/favicon.svg`, `apps/web/public/favicon/favicon.ico`, `apps/web/public/favicon/favicon-16x16.png`, `apps/web/public/favicon/favicon-32x32.png`, `apps/web/public/favicon/apple-touch-icon.png`, `apps/web/public/favicon/android-chrome-192x192.png`, `apps/web/public/favicon/android-chrome-512x512.png`
- Manifest reference: `apps/web/src/app/layout.tsx`
- Manifest file: `apps/web/public/favicon/site.webmanifest`
- Structured data org logo: `apps/web/src/lib/consts.ts`

#### Avatar

- Not currently stored as a dedicated file in this repo.
- Intended use is external profile images and square app/profile surfaces.

### Socials To Rebrand

- GitHub org avatar: `https://github.com/getpaykit`
- GitHub repo social image/settings: `https://github.com/getpaykit/paykit`
- X / Twitter profile avatar: `https://x.com/getpaykit`
- LinkedIn company logo: `https://www.linkedin.com/company/getpaykit`
- Discord server icon: `https://discord.gg/nzy9NPpFNU`

### Related Brand Assets

- Open Graph image path is `apps/web/public/brand/og.png`
- Open Graph metadata is configured in `apps/web/src/lib/consts.ts` and `apps/web/src/app/layout.tsx`
