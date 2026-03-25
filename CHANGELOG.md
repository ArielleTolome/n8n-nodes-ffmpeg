# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [1.0.0] - 2026-03-24

### 🎉 v1.0.0 — Production Release

This is the first stable, production-ready release of n8n-nodes-ffmpeg-studio. The journey from v0.1.0 to v1.0.0 spanned 12 development waves, growing from a basic proof-of-concept to 80+ operations across 4 nodes.

### What's Included in v1.0.0

#### Summary of all waves:
- **Wave 1 (v0.1.0)**: Foundation — proper n8n package structure, basic video ops
- **Wave 2 (v0.2.0)**: Error handling, validation, CI/CD pipeline, CHANGELOG
- **Wave 3 (v0.3.0)**: 7 new advanced operations (blur region, deinterlace, ken burns, timelapse, DASH, audio speed, remove silence)
- **Wave 4 (v0.4.0)**: Test suite, comprehensive README, CI test integration
- **Wave 5 (v0.5.0)**: Subtitle extraction, waveform video, pitch shift, npm publish prep
- **Wave 6 (v0.6.0)**: `quotePath()`, `ensureOutputDir()`, process-exit cleanup, `prepublishOnly` tests, CONTRIBUTING.md
- **Wave 7 (v0.6.0)**: 5 real workflow examples, README workflow section
- **Wave 8 (v0.6.0)**: 142-test suite, CI coverage upload
- **Wave 9 (v0.6.0)**: Raw FFmpeg passthrough operation in FfmpegAdvanced
- **Wave 10 (v0.7.0)**: Custom FFmpeg op in FfmpegVideo, hwaccel, timeouts, xfade audio fix, 40+ xfade effects
- **Wave 11 (v0.8.0)**: 9 new operations — compressor/EQ/stereo-to-mono/channel map/generate tone (audio) + color curves/motion blur/slow motion/smart crop (video)
- **Wave 12 (v1.0.0)**: Final README pass, publishing docs, version bump

#### Final stats:
- **4 nodes**: FfmpegVideo, FfmpegAudio, FfmpegAnalyze, FfmpegAdvanced
- **80+ operations** total
- **153 tests** passing
- Full TypeScript with strict mode
- CI/CD with GitHub Actions (build + test on Node 18/20/22)
- Production-grade error messages
- URL input handling (downloads to temp automatically)
- Hardware acceleration support (videotoolbox/nvenc/vaapi)
- Configurable timeouts on all operations

### Upgrade Notes
No breaking changes from 0.8.0. This is a stability and documentation release.

> **npm publish**: Requires npm account and `NPM_TOKEN` secret. See README Publishing section.

## [0.8.0] - 2026-03-24

### Added — Wave 11: More Audio + Video Operations

#### FfmpegAudio — 5 new operations
- **Compressor / Limiter** — Dynamic range compression via `acompressor` filter. Configurable threshold, ratio, attack, release, makeup gain, knee width. Use ratio 20+ for limiting.
- **Equalizer (Parametric EQ)** — Multi-band parametric equalizer using FFmpeg's `equalizer` filter. Input bands as JSON: `[{"freq": 1000, "gain": -3, "width": 200}]`
- **Stereo to Mono** — Convert stereo/multi-channel to mono. Three modes: average both channels, left only, right only.
- **Channel Mapping** — Re-map audio channels using `pan` filter. Presets: mono, stereo, 5.1, 7.1, swap L/R, duplicate left, duplicate right.
- **Generate Silence / Tone** — Generate audio from scratch: silence, sine wave (with frequency), white noise, or pink noise. Configurable duration and sample rate.

#### FfmpegAdvanced — 4 new operations
- **Color Curves (Instagram Filters)** — Apply curve-based color grading via FFmpeg's `curves` filter. 7 presets: warm, cool, vintage, high contrast, cross process, matte, vivid. Also supports custom JSON curves.
- **Motion Blur** — Add temporal motion blur using `tmix` filter (average N consecutive frames). Configurable frame count.
- **Slow Motion (Frame Interpolation)** — Smooth slow motion via `minterpolate` filter. 3 modes: blend (fast), mci (motion-compensated, high quality), duplicate (no interpolation). Configurable factor (2x–16x).
- **Smart Aspect Ratio Crop** — Change aspect ratio with centered crop (no letterboxing). Presets: 16:9, 9:16 (TikTok/Reels), 1:1 (Instagram), 4:3, 3:4, 4:5, 21:9 cinematic, custom.

### Stats
- 153 tests passing
- 4 nodes, 77+ operations total

## [0.7.0] - 2026-03-24

### Added — Wave 10: Final Polish Pass

#### FfmpegVideo
- **Custom FFmpeg Command operation** added directly to FfmpegVideo (same power as FfmpegAdvanced's Raw op) — users can now run custom ffmpeg commands from any video workflow without switching nodes
- **`audioOutputFormat` field** for `extractAudio` — was previously broken, always defaulting to mp4 instead of correct audio extension. Now shows mp3/aac/wav/ogg/flac/m4a options
- **`hwaccel` field** on encoding operations (none/auto/videotoolbox/nvenc/vaapi) — pass `-hwaccel` flag for GPU acceleration on supported hardware
- **`timeoutSeconds` field** — all 4 nodes now have configurable timeout (default 300s); ffmpeg process is killed if it exceeds limit with a clear error message
- **Expanded xfade transitions** — added 40+ xfade effects: slideup/down, smoothright/up/down, rectcrop, distance, fadegrays/black/white, squeezeh/v, zoomin, hlslice/hrslice/vuslice/vdslice, hblur/vblur, diag*, hlwind/hrwind/vuwind/vdwind, cover*/reveal* (full FFmpeg xfade filter support)
- **xfade audio crossfade** — xfade operation now properly crossfades audio tracks using `acrossfade` filter (was dropping audio before)
- **slideshow audio fix** — fixed double-use of `audioArg` that was causing malformed ffmpeg commands with audio slideshows

#### FfmpegAdvanced
- **`hwaccel` field** added for encoding operations
- **`timeoutSeconds` field** added
- **Fixed `raw` operation** — `inputVideo` was being resolved (and throwing) even for the Raw Command operation. Raw op no longer requires inputVideo to be set.

#### FfmpegAudio
- **`timeoutSeconds` field** added

#### FfmpegAnalyze
- **`timeoutSeconds` field** added

#### Utils
- **`runFfmpeg()` timeout support** — accepts optional `timeoutMs` parameter; provides clear timeout error message when process is killed

### Fixed
- `extractAudio` now uses correct audio codec and extension based on `audioOutputFormat`
- `overlayImage` opacity filter — fixed incorrect label reference in filter_complex for opacity blending
- `speed` operation atempo chain logic — fixed incorrect direction for values < 0.5 (was multiplying instead of dividing)

## [0.6.0] - 2026-03-24

### Added — Wave 6: npm Publish Hardening + Edge Case Fixes
- **`quotePath()` utility**: All file paths in ffmpeg commands are now properly single-quoted, handling spaces, special characters, ampersands, and parentheses in file paths. Previously, paths with spaces would break ffmpeg commands silently.
- **`ensureOutputDir()` utility**: Validates that output directories exist and are writable before writing files. Creates missing directories (recursive) and provides actionable error messages if the directory can't be created.
- **Process-exit temp-dir cleanup**: All temp directories created by `createTempDir()` are now registered and cleaned up on process `exit`, `SIGINT`, `SIGTERM`, and uncaught exceptions. No more orphaned temp files.
- **`prepublishOnly` runs tests**: `npm run prepublishOnly` now runs both `build` AND `test` before allowing publish.
- **CONTRIBUTING.md**: Full contributor guide covering how to add operations, run tests, build locally, link for n8n testing, and submit PRs.

### Added — Wave 7: Workflow Examples + README Enhancements
- **`examples/` directory** with 5 real n8n workflow JSON files ready to import:
  - `social-media-video-pipeline.json` — Trim → Scale 1080×1920 → Burn text → MP4
  - `podcast-audio-pipeline.json` — Trim → Loudnorm (-16 LUFS) → Fade → MP3
  - `thumbnail-generation.json` — Extract frame → Add watermark → PNG
  - `green-screen-removal.json` — Chroma key → Background overlay → MP4
  - `hls-streaming-prep.json` — Transcode → HLS segments + M3U8
- **README badges**: Added Node.js ≥18 badge alongside existing build/npm/license badges.
- **README Workflow Examples section**: Table linking to all 5 example workflows with descriptions.
- **README Contributing section**: Now points to CONTRIBUTING.md.

### Added — Wave 8: Test Coverage Expansion (141 → 142 tests)
- **`ffmpeg.commands.test.ts`**: New integration test file with 70+ tests covering:
  - `quotePath()` — 8 edge cases (spaces, quotes, backslashes, ampersands, parentheses)
  - `escapeFilterValue()` — combinations of special characters
  - `timeToSeconds()` — zero, large values, fractional, 24-hour
  - `getMimeType()` — uppercase extensions, `.ts`, `.3gp`, `.opus`, `.json`
  - `requireParam()` — `"0"` value, null, undefined, whitespace varieties
  - `createTempDir/cleanupTempDir` — 10 unique dirs, idempotent cleanup, nested file cleanup
  - `ensureOutputDir` — single/deeply nested dir creation, no output file side-effects
  - `runFfmpeg` error classification — file not found, unknown encoder, permission denied, exit code
  - `resolveInput` — spaces in paths, existing files
  - Node operation counts — all 4 nodes
  - `package.json` npm readiness — 10 assertions on keywords, license, engines, n8n field, etc.
  - Command string safety — space-safe quoting in constructed commands
- **CI coverage**: GitHub Actions now runs `npm run test:coverage` and uploads coverage artifact.

### Added — Wave 9: Raw FFmpeg Passthrough Operation
- **`Raw FFmpeg Command` operation** in FfmpegAdvanced: Execute arbitrary ffmpeg commands with full argument control. Supports optional binary output return by specifying the output file path.

### Fixed
- `parseFfmpegError()` — fixed `||` operator precedence bug (was mismatching `Encoder … not found` detection).
- `extraArgs` property now has `displayOptions.hide` to suppress it for `raw`, `hls`, and `dash` operations that don't use it.

## [0.5.0] - 2026-03-24

### Added — FFmpeg Analyze (2 new operations)
- **Extract Subtitle Track**: Extract embedded subtitle streams from video files to `.srt`, `.ass`, or `.vtt` format. Configurable track index for multi-subtitle videos.
- **Generate Waveform Video**: Render audio waveform as an MP4 video using FFmpeg's `showwaves` filter. Configurable width, height, waveform style (point/line/p2p/centered), waveform color, and background color.

### Added — FFmpeg Audio (1 new operation)
- **Pitch Shift**: Shift audio pitch in semitones without changing playback speed. Uses the `asetrate + aresample + atempo` technique to achieve true pitch shifting. Supports ±24 semitones. Auto-detects source sample rate.

### Added — npm Publish Prep
- `.npmignore`: Excludes source files, tests, CI config, and dev files from the npm package. Only `dist/` and `README.md` are published.

### Changed
- Test suite expanded to 64 tests (added coverage for Wave 5 operations)

## [0.4.0] - 2026-03-24

### Added
- **Test suite**: 61 unit tests across 2 test files (`ffmpeg.utils.test.ts`, `node-descriptions.test.ts`)
  - Tests for `timeToSeconds`, `getMimeType`, `escapeFilterValue`, `requireParam`, `createTempDir`/`cleanupTempDir`, `resolveInput` validation
  - Structural sanity tests for all 4 nodes: description fields, properties, operation lists, no duplicate property names
  - Specific regression tests: xfade `inputVideos` displayOptions fix, Wave 3 new operations presence
- **Jest infrastructure**: `jest.config.js`, `npm test` and `npm run test:coverage` scripts
- **CI/CD updated**: `build.yml` now runs `npm test` step after build and lint
- **README**: Complete rewrite with per-operation documentation, field tables, FFmpeg equivalents, common workflow patterns, and troubleshooting guide

### Changed
- CI workflow now tests on Node 18 and Node 20 with build + lint + test + artifact verification

## [0.3.0] - 2026-03-24

### Added — FFmpeg Advanced (5 new operations)
- **Blur Region (Mosaic/Redact)**: Pixelate a rectangular region for face/license plate redaction. Configurable X, Y, W, H, and intensity.
- **Deinterlace**: Remove interlacing artifacts using the `yadif` filter. Supports all yadif modes (send frame, send field) and parity detection.
- **Ken Burns / Zoom Pan**: Animated zoom and pan using FFmpeg's `zoompan` filter. Configurable zoom start/end, 7 pan directions, output resolution and FPS.
- **Time-lapse**: Create time-lapse videos by selecting every Nth frame. Configurable interval and output FPS.
- **DASH Packaging**: Package video for MPEG-DASH streaming, producing an MPD manifest plus `.m4s` segments. Configurable segment duration, output directory, and manifest name.

### Added — FFmpeg Audio (2 new operations)
- **Change Speed**: Speed up or slow down audio using chained `atempo` filters. Supports full range 0.125–8× (chains multiple atempo steps for values outside 0.5–2.0).
- **Remove Silence**: Strip silent sections using `silenceremove` filter. Configurable threshold (dB), minimum silence duration, and edge-preservation option.

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

[Unreleased]: https://github.com/ArielleTolome/n8n-nodes-ffmpeg/compare/v0.5.0...HEAD
[0.5.0]: https://github.com/ArielleTolome/n8n-nodes-ffmpeg/compare/v0.4.0...v0.5.0
[0.4.0]: https://github.com/ArielleTolome/n8n-nodes-ffmpeg/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/ArielleTolome/n8n-nodes-ffmpeg/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/ArielleTolome/n8n-nodes-ffmpeg/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ArielleTolome/n8n-nodes-ffmpeg/releases/tag/v0.1.0
