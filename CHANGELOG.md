# Changelog

All notable changes to ixpix are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [1.0.1] - 2026-11-13

### Fixed

- Correct background and shadow removal and refined grid previews.
- Reset image-specific settings and ignore outdated image loads.
- Enforce export size limits and preserve correct filenames.
- Handle invalid saved settings and preset storage failures.
- Fix keyboard navigation and offline startup.

Shadow removal may take longer on complex backgrounds.

## [1.0.0] - 2026-09-26

First public release.

- Automatic grid detection with fractional cell sizes and offsets
- Background removal: chroma key, flood fill, checkerboard backgrounds
- Palette: keep colors, reduce automatically, or map to built-in Lospec palettes
  or your own .hex / .gpl file
- Dithering, outline, stray pixel cleanup, trimming
- Sprite sheets: split into sprites, atlas export with JSON, animation preview
- Crop with aspect ratio lock, undo and redo, presets, before/after comparison
- Works offline from a single HTML file; installable from the online version
