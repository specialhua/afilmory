# Afilmory Web Promo Video Specification

**Topic:** Social-media promo video for the web gallery
**Date:** 2026-09-26
**Target Package:** `apps/promo` (new)
**Status:** Implemented

---

## 1. Goals

A ~42 s, 16:9 (1920×1080) promo video of the `apps/web` gallery for social media (X, Bilibili, Xiaohongshu landscape posts). It shows real product footage, wrapped in polished typography and camera motion, and can be re-rendered after copy edits.

- **Footage source:** the live gallery at `https://innei.afilmory.art` (redirect target of `afilmory.innei.in`). Footage reflects the deployed build, not local `main`.
- **Language:** Chinese captions only.
- **Audio:** no voice-over. Optional music track dropped into `apps/promo/public/` and named in `copy.ts`; unset renders a silent video.
- **Non-goals:** iOS app video (later, separate spec), vertical/square cuts, English version, App Store preview compliance.

## 2. Storyboard

| Time | Scene id | Picture | Caption |
|---|---|---|---|
| 0–3 s | `intro` | Black, one large line of type, then the Afilmory logo | 你的照片，值得更好的展示 |
| 3–12 s | `gallery` | Browser frame pushes in from afar → masonry scroll → click a photo, entry animation plays → WebGL zoom into detail | 流畅浏览，细节尽收眼底 |
| 12–20 s | `exif` | Inspector opens: camera, lens, exposure params, histogram; camera pushes in toward the panel | 每一张照片的拍摄参数 |
| 20–28 s | `map` | Globe slowly rotates → flies to a photo cluster → opens a photo | 在地图上重走旅程 |
| 28–37 s | `search` | ⌘K palette, type a camera name → filtered results → open a photo, tap a reaction | 一搜即达，一键互动 |
| 37–42 s | `outro` | Logo + 「开源 · 可自托管 · afilmory.art」 + GitHub URL | — |

Visual language follows root `DESIGN.md`: dark background, system-blue accent. Type is the system stack (SF Pro + PingFang SC) since Geist has no CJK glyphs. The browser chrome is a simplified Safari window. Scene transitions use camera push/pull plus blur; no flashy effects.

## 3. Structure

```
apps/promo/
  package.json          @afilmory/promo, private; remotion, @remotion/cli, react, react-dom, playwright
  record/capture.ts     cursor overlay, human-paced actions, CDP frame capture → ffmpeg
  record/scenes.ts      one Playwright action script per footage scene (gallery, exif, map, search)
  record/record.ts      CLI: records the named scenes (all by default) into public/clips/<scene>.mp4
  src/copy.ts           all captions + per-scene durations and clip trim offsets
  src/Root.tsx          Remotion composition registration (1920×1080, 60 fps)
  src/Promo.tsx         timeline: sequences scenes + transitions + optional audio
  src/scenes/*.tsx      Intro, FootageScene (shared by the 4 feature scenes), Outro
  src/components/       BrowserFrame, Caption, SceneShell (enter/exit blur-dissolve)
  public/logo.jpg       app icon
  public/clips/         recorded footage (gitignored)
  public/*.mp3          optional music (gitignored)
  out/                  renders (gitignored)
```

`apps/promo` is picked up by the existing `apps/**/*` workspace glob. Shared deps (`react`, `typescript`) use `catalog:` where the catalog has them.

### Commands

- `pnpm --filter @afilmory/promo record [scene]` — record all scenes, or one
- `pnpm --filter @afilmory/promo studio` — Remotion Studio preview
- `pnpm --filter @afilmory/promo render` — writes `out/promo.mp4` (H.264)

## 4. Recording Pipeline

1. Launch system Chrome via Playwright (`channel: 'chrome'`), viewport 1600×1000, `deviceScaleFactor: 2`, dark color scheme.
2. Per scene: navigate, wait for the scene's key selector (never fixed sleeps for readiness), warm up images, then start capture.
3. Capture with CDP `Page.startScreencast` (JPEG, quality 95, full DPR size), keeping each frame's `metadata.timestamp`.
4. Run the scene's scripted actions with human-paced easing (mouse moves along curves, eased scrolls via `mouse.wheel` steps).
5. Stop capture; write frames + durations to an ffmpeg concat list; encode to constant 60 fps H.264 at `public/clips/<scene>.mp4`.

Each scene records independently, so an unsatisfying take is re-recorded alone.

### Risks

- **Live-site timing variance:** every action waits for its target element; each scene starts with a warm-up load.
- **Screencast frame drops on the WebGL viewer:** the first implementation task is a probe of screencast fps on the `gallery` scene. If it cannot sustain ≥ 30 fps, fall back to Playwright `recordVideo` and report the bitrate trade-off before continuing.
- **Recording writes real data:** every scene fulfills `/api/act/views` and `/api/reactions/add` with a fake success via `context.route`; nothing is written to the live gallery.

## 5. Composition

- `copy.ts` is the single source of captions, durations, and trim offsets; `Promo.tsx` derives frame ranges from it.
- `FootageScene` renders a clip inside `BrowserFrame` with a per-scene camera keyframe list (scale + translate over time) for push-ins, and a `Caption` that springs in.
- Transitions: 12-frame cross-dissolve with blur between scenes.
- Audio: `copy.ts` exports `music: string | null` (default `null`); when set, `<Audio src={staticFile(music)}>` plays with a 1 s fade in/out.

## 6. Verification

- Preview each scene in Remotion Studio.
- One full render; check with `ffprobe` that the output is 1920×1080, 60 fps, ~42 s.
- No unit tests: there is no logic here worth testing beyond what the render itself proves.
