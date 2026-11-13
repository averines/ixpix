# Changelog

All notable changes to ixpix are listed here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Fixed

- Reset sprite exclusions and grid offsets when opening a different image.
- Ignore image loads superseded by another selection or closing the image.
- Enforce export size limits for keyboard shortcuts and keep filenames tied to the exported image.
- Keep preset storage failures visible without reporting an unsuccessful write as saved.
- Support arrow navigation in segmented controls and keyboard activation of Help.
- Use every background seed and repaint the refined grid when sharpening changes.
- Keep the optional touch icon exclusive to the online version.

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
