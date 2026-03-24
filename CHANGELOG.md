# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.2.0] - 2026-03-24

### Fixed
- **`xfade` displayOptions**: `inputVideos` field now correctly shows for the `xfade` operation (previously only showed for `merge`/`compose`)
- **`copy-icons` script**: Now correctly copies SVG icons for ALL nodes (`FfmpegVideo`, `FfmpegAudio`, `FfmpegAnalyze`, `FfmpegAdvanced`). The old script referenced a non-existent `FfmpegNode` directory.

### Changed
- **`n8n-workflow` moved to `peerDependencies`**: Follows the standard convention for n8n community nodes — the workflow package is provided by the n8n runtime and should not be bundled.

### Added
- **CI/CD pipeline** (`.github/workflows/build.yml`): Automated build and lint on every push and pull request, tested on Node 18 and Node 20. Also verifies all dist artifacts are generated.
- **Improved error handling** in `ffmpeg.utils.ts`:
  - `validateFfmpeg()` now searches common install paths and provides platform-specific install instructions when ffmpeg is not found.
  - `runFfmpeg()` parses FFmpeg stderr to surface clean, actionable error messages (file not found, unknown encoder, permission denied).
  - `runFfprobe()` now surfaces file-not-found errors more clearly.
- **Input validation**:
  - `resolveInput()` validates that the input string is non-empty before attempting resolution.
  - `requireParam()` utility added for validating required string parameters.
  - `trim` operation validates that `inputVideo` is provided before calling FFmpeg.
  - `merge` operation validates that `inputVideos` is provided and contains at least 2 entries with clearer messages.
- **`CHANGELOG.md`**: This file.

## [0.1.0] - 2026-03-23

### Added
- Initial release with 4 FFmpeg nodes:
  - **FFmpeg Video** — 27 operations: trim, merge, convert, scale, crop, rotate, flip, reverse, speed change, loop, pad, split, extract audio, remove audio, add/replace audio, overlay image (watermark), overlay video (PiP), burn text, add subtitles, compose side-by-side, fade, crossfade (xfade), change framerate, strip metadata, generate GIF, generate thumbnail, create slideshow
  - **FFmpeg Audio** — 8 operations: trim, merge, convert format, normalize (EBU R128 loudnorm), adjust volume, fade in/out, remove audio from video, mix audio tracks
  - **FFmpeg Analyze** — operations: extract frames, get media metadata (JSON), scene detection, detect silence, extract waveform image, generate sprite sheet
  - **FFmpeg Advanced** — 10 operations: apply LUT (color grading), blur, sharpen, denoise, vignette, chroma key (green screen), stabilize (vidstab), HLS segmentation, draw shapes/boxes, color adjustment
- Utility library (`ffmpeg.utils.ts`) with shared helpers: URL download, temp file management, MIME type mapping, FFmpeg/ffprobe execution wrappers, base64 output, filter value escaping, time-to-seconds conversion
- Comprehensive TypeScript types throughout
- ESLint configuration
- Full README with feature list and quick-start instructions
- MIT License
- Published to GitHub: https://github.com/ArielleTolome/n8n-nodes-ffmpeg

[Unreleased]: https://github.com/ArielleTolome/n8n-nodes-ffmpeg/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ArielleTolome/n8n-nodes-ffmpeg/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ArielleTolome/n8n-nodes-ffmpeg/releases/tag/v0.1.0
