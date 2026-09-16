# Design Spec: Site Bilingual (Chinese / English)

## 1. Background & Goals

Currently, the marketing and legal website (`apps/site`) has partial i18n support: the home landing page (`LandingApp.tsx`) contains translation dictionaries for Chinese and English, but the legal and policy pages (`/terms`, `/privacy`, `/support`, `/account-cleanup`) are strictly in Chinese with hardcoded navigation.

The goal is to provide a complete, SEO-friendly bilingual experience across the entire site:
1. Support Chinese (`zh-CN`) as default under root URLs (`/`, `/terms/`, `/privacy/`, `/support/`, `/account-cleanup/`).
2. Support English (`en`) under `/en/` prefixed URLs (`/en/`, `/en/terms/`, `/en/privacy/`, `/en/support/`, `/en/account-cleanup/`).
3. Provide seamless language switching in headers and navigation across all pages.
4. Ensure legal terms (`terms`, `privacy`, `support`, `account-cleanup`) in English accurately reflect the personal developer status, notice-and-takedown copyright procedures, indemnification, and limitation of liability.

## 2. URL & Route Architecture

| Page | Chinese URL | English URL |
| :--- | :--- | :--- |
| Landing / Home | `/` | `/en/` |
| Terms of Service | `/terms/` | `/en/terms/` |
| Privacy Policy | `/privacy/` | `/en/privacy/` |
| Support & Contact | `/support/` | `/en/support/` |
| Account Cleanup | `/account-cleanup/` | `/en/account-cleanup/` |

### File Layout in `apps/site/src/pages/`
```
apps/site/src/pages/
├── index.astro                 # Chinese landing page
├── terms.astro                 # Chinese TOS
├── privacy.astro               # Chinese Privacy Policy
├── support.astro               # Chinese Support
├── account-cleanup.astro       # Chinese Account Cleanup
└── en/
    ├── index.astro             # English landing page
    ├── terms.astro             # English TOS
    ├── privacy.astro           # English Privacy Policy
    ├── support.astro           # English Support
    └── account-cleanup.astro   # English Account Cleanup
```

## 3. Component Updates

### 3.1 `LegalPage.astro`
- Props:
  ```ts
  interface Props {
    eyebrow: string
    title: string
    description: string
    updatedAt: string
    locale?: 'zh' | 'en'
    alternateHref?: string
  }
  ```
- Top navigation:
  - Brand link links to `/` (for `zh`) or `/en/` (for `en`).
  - Nav links:
    - `zh`: 支持 (`/support/`), 隐私 (`/privacy/`), 条款 (`/terms/`)
    - `en`: Support (`/en/support/`), Privacy (`/en/privacy/`), Terms (`/en/terms/`)
  - Language toggle:
    - If on `zh`: Shows `English` linking to `alternateHref` (e.g. `/en/terms/`).
    - If on `en`: Shows `中文` linking to `alternateHref` (e.g. `/terms/`).
- Footer:
  - Back to home link points to `/` or `/en/`.
  - Copyright text and status note respects `locale`.

### 3.2 `LandingApp.tsx`
- Refactor the language switcher:
  - Switching to English redirects/navigates to `/en/`.
  - Switching to Chinese redirects/navigates to `/`.
  - Persists preference in `localStorage` (`afilmory-site-locale`).
- Ensure footer links (`Terms`, `Privacy`) link to `/en/terms` and `/en/privacy` when on English landing page.

## 4. Content & Translation Scope

1. **`en/terms.astro`**:
   - Translate all 14 sections into natural, legally sound English.
   - Accurately preserve individual developer protections:
     - Section 1: Service Scope & Individual Developer capacity.
     - Section 3: User Content ownership & platform technical license.
     - Section 4: Notice-and-takedown copyright infringement procedure (DMCA-style).
     - Section 5: Acceptable use, prohibition of unauthorized mass scraping / AI training.
     - Section 6: Sponsorship in-app purchases.
     - Section 7: Service changes and availability.
     - Section 8: Third-party services.
     - Section 9: Account termination and dormant cleanup.
     - Section 10: User indemnification of the individual developer.
     - Section 11: AS-IS warranty disclaimer and limitation of liability (capped at 12-month spend or 0/100 RMB/USD).
     - Section 12: Governing law (PRC) and jurisdiction.
     - Section 13: Modifications.
     - Section 14: Contact information.

2. **`en/privacy.astro`**:
   - Complete English translation covering collected information, use, public gallery scope, sharing, retention & deletion, data security, international transfers, minors, and user rights.

3. **`en/support.astro`**:
   - English support questions covering login/workspace, photo upload, notifications, sponsorship purchases, account deletion, and copyright/content infringement reporting.

4. **`en/account-cleanup.astro`**:
   - Policy details on inactivity threshold (3 months), content threshold (0 photos, 0 storage), 14-day deletion window, and recovery process.

## 5. Verification Plan

1. Verify routing:
   - `/` and `/en/` load the respective Chinese and English landing pages.
   - Switching language on the landing page navigates cleanly between `/` and `/en/`.
   - `/terms/` has `English` link pointing to `/en/terms/`, and `/en/terms/` has `中文` link pointing to `/terms/`.
   - Same for `/privacy/`, `/support/`, and `/account-cleanup/`.
2. Build verification:
   - Run `astro build` (or check build output) to ensure all static pages generate without broken imports or syntax errors.
