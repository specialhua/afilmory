# Afilmory Landing Page Redesign Specification

**Topic:** Landing Page Redesign (Light & Shadow Exhibition × Modern Bento Grid)  
**Date:** 2026-09-03  
**Target Package:** `apps/site`  
**Status:** Approved

---

## 1. Background & Goals

Afilmory is a modern photo exhibition platform designed around the core philosophy:
> *"The photograph is the only light source. Everything else is glass in front of it."*

While `apps/web` implements a dark-only, UIKit/SwiftUI inspired glass aesthetic, the existing marketing landing page (`apps/site`) was relatively flat, text-heavy, and did not fully convey the visceral, immersive feeling of stepping into an art gallery or show modern SaaS software delight.

### Key Goals:
1. **Artistic & Visual Impact:** Elevate the first impression with dynamic ambient light derived from photographs, subtle 3D tilt gallery frames, and tactile typography.
2. **Product Value Communication via Bento Grid:** Modern, interactive Bento Grid showcasing Afilmory's standout features (EXIF inspector, color extraction, MapLibre footprints, Live Photo motion, SaaS + Self-host dual architecture).
3. **Enhanced Live Demo:** Refine the exhibition sandbox with window chrome, layout switching, and inspection drawer.
4. **Community Discovery:** Upgrade the featured gallery section with rich cover photography and subtle hover interactions.
5. **Localization & Performance:** Full parity in English and Chinese, clean zero-comment implementation, lightweight pure CSS/Tailwind animations.

---

## 2. Architecture & Components

The redesign updates and introduces components within `apps/site/src/components/`:

### 2.1 Component Structure
- `LandingApp.tsx`: Main orchestrator holding state, modals, smooth scrolling, and section order.
- `HeroSection.tsx` (re-architected within or alongside LandingApp):
  - Dynamic ambient color diffusion based on active showcase photography.
  - Interactive 3D tilt photo frame with EXIF pill overlay.
  - High-conversion dual CTA buttons (Create Space / Live Demo) + App Store badge + GitHub star counter / badge.
- `BentoGrid.tsx` (new component):
  - **Tile 1 (Large - Deep EXIF):** Live interactive camera specs (Aperture, Shutter, ISO, Focal Length, Camera & Lens name) with interactive preview.
  - **Tile 2 (Medium - Adaptive Ambience):** Dynamic ThumbHash/color-shift demo showcasing how UI chrome tints to photo tones.
  - **Tile 3 (Medium - Live Photo & Motion):** Time-slice motion simulation representing Live Photo playback and fluid gestures.
  - **Tile 4 (Medium - Map Footprints):** Stylized MapLibre dark tile footprint showcase with pulsing photo coordinates.
  - **Tile 5 (Medium - Dual Architecture):** Cloud/SaaS zero-config vs. Self-hosted Docker/S3/Cloudflare with one-click copy command snippet.
- `LiveDemo.tsx` (upgraded):
  - macOS window chrome framing (traffic lights, title, mode toggles).
  - Responsive masonry with fast inspection lightbox drawer.
- `Discover.tsx` (upgraded):
  - Rich featured gallery cards with cover preview thumbnails, photo counts, and live links.
- `site/src/i18n/`: Complete copy update for `en.ts` and `zh.ts`.
- `site/src/styles/`: Refined tokens, glow gradients, glassmorphism hair-lines, and responsive micro-interactions.

---

## 3. Visual & Styling Standards

Adhering strictly to repository conventions (`CLAUDE.md`, `DESIGN.md`):
1. **Color Palette:**
   - Backgrounds: `#0a0a0a` to `#050505` with subtle noise or radial gradient.
   - Text hierarchy: `#ebe8e2` (headline), `#8a8680` (body), `#5c5852` (subtle/mono).
   - Accents: Dynamic and content-derived (`#c4a574` gold default, plus photo-derived values).
   - Glass borders: `rgba(255, 255, 255, 0.08)` to `rgba(255, 255, 255, 0.15)` hairline outlines.
2. **Typography:**
   - English Display / Serif: `Instrument Serif`, `Georgia`, serif.
   - Sans: `Inter`, `PingFang SC`, system-ui.
   - Technical / Data: `IBM Plex Mono`, `SF Mono`, ui-monospace.
3. **Comments Rule:**
   - Zero comments, zero JSDoc across all new or modified code. Clear identifier naming only.

---

## 4. Verification Plan

1. Build & Lint:
   - Run type-check and lint on changed files (`apps/site`).
   - Run production build for `apps/site` (`pnpm --filter site build` / `pnpm build`).
2. Visual & Interactive Verification:
   - Preview in browser via local dev server (`pnpm --filter site dev`).
   - Verify Hero 3D tilt, responsive layouts on desktop and mobile viewports.
   - Verify Bento Grid interactive components and hover states.
   - Test i18n switching between English (`/en/`) and Chinese (`/`).
   - Validate modal dialogs (Create Space, Login) continue opening properly.
