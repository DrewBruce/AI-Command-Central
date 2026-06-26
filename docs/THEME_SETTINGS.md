# AI Command Central Theme Settings

This file records the current visual theme values used by the app. The source of truth is `src/styles.css`, especially the `:root` block at the top of the file.

## Core Theme

| Token | Value | Use |
| --- | --- | --- |
| `--bg` | `#070a0e` | Deep app background |
| `--bg-soft` | `#0b1016` | Softer dark background |
| `--surface` | `#101720` | Primary panel/card surface |
| `--surface-2` | `#131d28` | Secondary surface |
| `--surface-3` | `#172332` | Raised/deeper surface |
| `--line` | `#243241` | Strong border line |
| `--line-soft` | `rgba(145, 170, 198, 0.16)` | Default subtle border |
| `--text` | `#eef4f8` | Primary text |
| `--text-2` | `#c6d1dc` | Secondary text |
| `--muted` | `#8293a3` | Muted labels and helper text |
| `--dim` | `#5e6f7f` | Low-emphasis text |
| `--accent` | `#5fd2e8` | Cyan accent, active nav, focus, links |
| `--accent-2` | `#9ce6f0` | Brighter cyan highlight |
| `--action` | `#f0b35a` | Warm action accent |
| `--ok` | `#72d39b` | Success / complete |
| `--warn` | `#f3c55c` | Warning / revise |
| `--danger` | `#ff7f7d` | Danger / failed |
| `--review` | `#91a7ff` | Review / active agent state |
| `--idle` | `#6f8190` | Queued / inactive |

## Structure Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--shadow` | `0 24px 80px rgba(0, 0, 0, 0.38)` | Main elevated panel shadow |
| `--radius-sm` | `6px` | Small buttons and controls |
| `--radius` | `8px` | Standard cards, buttons, inputs |
| `--radius-lg` | `12px` | Large panels |
| `--nav-width` | `248px` | Left navigation rail |

## Typography

The app uses the system sans stack:

```css
Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif
```

Global text rendering:

```css
font-synthesis: none;
text-rendering: optimizeLegibility;
-webkit-font-smoothing: antialiased;
```

## Page Background

The body uses a dark layered treatment:

```css
background:
  radial-gradient(circle at 30% -10%, rgba(95, 210, 232, 0.16), transparent 34rem),
  linear-gradient(135deg, #080b10 0%, #071018 48%, #090c11 100%);
```

This gives the app its dark command-center base with a restrained cyan glow.

## Main Panels

Primary panels such as the hero, attention panel, run panel, content panel, workflow gallery, and workflow canvas use:

```css
border: 1px solid var(--line-soft);
border-radius: var(--radius-lg);
background: linear-gradient(180deg, rgba(16, 23, 32, 0.88), rgba(10, 15, 22, 0.92));
box-shadow: var(--shadow);
```

Panel padding is generally `16px`.

## Navigation

Navigation rail:

```css
background: rgba(9, 14, 20, 0.88);
backdrop-filter: blur(28px);
border-right: 1px solid var(--line-soft);
```

Active/hover nav item:

```css
border-color: rgba(95, 210, 232, 0.2);
background: rgba(95, 210, 232, 0.1);
color: var(--text);
```

Brand mark:

```css
border: 1px solid rgba(95, 210, 232, 0.38);
border-radius: 10px;
background: linear-gradient(145deg, rgba(95, 210, 232, 0.2), rgba(19, 29, 40, 0.78));
color: var(--accent-2);
box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.08);
```

## Primary Button

The main call-to-action uses a brighter cyan fill:

```css
border: 1px solid rgba(95, 210, 232, 0.55);
background: linear-gradient(180deg, #78e2f5, #3eb9d4);
color: #071118;
box-shadow: 0 10px 30px rgba(95, 210, 232, 0.18);
```

## Status Colors

Status dots and pills use the core semantic tokens:

| State | Token | Glow |
| --- | --- | --- |
| Idle | `--idle` | `0 0 0 3px rgba(111, 129, 144, 0.12)` |
| OK | `--ok` | `0 0 0 3px rgba(114, 211, 155, 0.14)` |
| Warn | `--warn` | `0 0 0 3px rgba(243, 197, 92, 0.14)` |
| Danger | `--danger` | `0 0 0 3px rgba(255, 127, 125, 0.14)` |
| Review | `--review` | `0 0 0 3px rgba(145, 167, 255, 0.14)` |

## Workflow Canvas

Canvas background:

```css
background:
  linear-gradient(rgba(145, 170, 198, 0.04) 1px, transparent 1px),
  linear-gradient(90deg, rgba(145, 170, 198, 0.04) 1px, transparent 1px),
  rgba(7, 10, 14, 0.72);
```

Node background:

```css
background: rgba(19, 29, 40, 0.96);
box-shadow: 0 12px 32px rgba(0, 0, 0, 0.24);
```

Active node:

```css
border-color: rgba(95, 210, 232, 0.9);
background: linear-gradient(180deg, rgba(95, 210, 232, 0.18), rgba(19, 29, 40, 0.98));
box-shadow:
  0 0 0 3px rgba(95, 210, 232, 0.1),
  0 16px 38px rgba(0, 0, 0, 0.28);
```

Canvas edge colors:

| Edge State | Value |
| --- | --- |
| Default | `rgba(145, 170, 198, 0.18)` |
| Active | `rgba(95, 210, 232, 0.88)` |
| Complete | `rgba(114, 211, 155, 0.58)` |
| Draft connector | `rgba(95, 210, 232, 0.86)` |

## Current Icon Locations

Current web favicon:

```text
public/favicon.png
```

Legacy SVG favicon retained for reference:

```text
public/favicon.svg
```

Current native icon folder:

```text
src-tauri/icons/
```

The current `icon.png` is `512 x 512` RGBA PNG. The native icon folder now also includes:

```text
32x32.png
64x64.png
128x128.png
128x128@2x.png
icon.icns
icon.ico
Windows square logo PNGs
iOS AppIcon PNGs
```

`src-tauri/tauri.conf.json` declares the main Tauri icon list:

```json
[
  "icons/32x32.png",
  "icons/128x128.png",
  "icons/128x128@2x.png",
  "icons/icon.icns",
  "icons/icon.ico"
]
```

Packaging is still inactive in config with `"active": false`, matching the current app setup.

## Legacy SVG Favicon Palette

The retained SVG favicon uses:

| Part | Value |
| --- | --- |
| Background | `#0b1118` |
| Grid stroke | `#5fd2e8` |
| Green node | `#72d39b` |
| Cyan node | `#5fd2e8` |
| Review node | `#91a7ff` |
| Warning node | `#f3c55c` |
