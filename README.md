# n8n-nodes-ffmpeg

Production-grade n8n community nodes for FFmpeg video/audio processing. More powerful and feature-rich than Fal.ai's FFmpeg API — **80+ operations** across 4 nodes.

[![Build Status](https://github.com/ArielleTolome/n8n-nodes-ffmpeg/actions/workflows/build.yml/badge.svg)](https://github.com/ArielleTolome/n8n-nodes-ffmpeg/actions)
[![npm version](https://img.shields.io/npm/v/n8n-nodes-ffmpeg-studio)](https://www.npmjs.com/package/n8n-nodes-ffmpeg-studio)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Node.js ≥18](https://img.shields.io/badge/node-%3E%3D18-brightgreen)](https://nodejs.org)

## Table of Contents

- [Features](#features)
- [Requirements](#requirements)
- [Installation](#installation)
- [Node Reference](#node-reference)
  - [FFmpeg Video](#ffmpeg-video)
  - [FFmpeg Audio](#ffmpeg-audio)
  - [FFmpeg Analyze](#ffmpeg-analyze)
  - [FFmpeg Advanced](#ffmpeg-advanced)
- [Workflow Examples](#workflow-examples)
- [Common Patterns](#common-patterns)
- [Publishing](#publishing-to-npm)
- [Contributing](#contributing)
- [Troubleshooting](#troubleshooting)

---

## Features

| Node | Operations | Key Capabilities |
|------|-----------|-----------------|
| **FFmpeg Video** | 28 | Trim, merge, convert, scale, crop, rotate, watermark, PiP, subtitles, GIF, slideshow, custom command |
| **FFmpeg Audio** | 16 | Normalize, mix, compressor, equalizer, pitch shift, stereo-to-mono, channel mapping, generate tones |
| **FFmpeg Analyze** | 10 | Metadata, scene detection, silence detection, sprite sheets, waveform video, subtitle extraction |
| **FFmpeg Advanced** | 20 | LUT grading, chroma key, stabilize, HLS, DASH, color curves, slow motion, motion blur, smart crop |

---

## Requirements

- **[FFmpeg](https://ffmpeg.org/download.html)** installed and in your system `PATH`
  - macOS: `brew install ffmpeg`
  - Ubuntu/Debian: `sudo apt install ffmpeg`
  - Windows: download from [ffmpeg.org](https://ffmpeg.org/download.html)
- **Node.js** >= 18.0.0
- **n8n** (self-hosted)

> **Optional FFmpeg features** (require specific build flags):
> - Video stabilization → `--enable-libvidstab`
> - H.265/HEVC → `--enable-libx265`
> - AV1 encoding → `--enable-libsvtav1`
> - VP9 → `--enable-libvpx`

---

## Installation

### Via n8n Community Nodes UI

1. Open n8n → **Settings** → **Community Nodes**
2. Click **Install a community node**
3. Enter `n8n-nodes-ffmpeg-studio`
4. Click **Install**

### Via npm

```bash
cd ~/.n8n/custom   # or your custom extensions path
npm install n8n-nodes-ffmpeg
```

Then restart n8n.

---

## Node Reference

### FFmpeg Video

The main workhorse node with 28 operations for video editing.

#### Trim / Cut
Cut a video to a specific time range.

| Field | Example | Notes |
|-------|---------|-------|
| Input Video | `/home/user/input.mp4` or `https://...` | Path or URL |
| Start Time | `00:00:10` or `10.5` | HH:MM:SS or seconds |
| End Time | `00:00:30` | Leave empty to use Duration |
| Duration | `20` | Only used if End Time is empty |

**FFmpeg equivalent:**
```bash
ffmpeg -ss 10 -i input.mp4 -to 30 -vcodec libx264 -acodec aac output.mp4
```

---

#### Merge / Concatenate
Join multiple videos end-to-end using `concat` demuxer.

| Field | Example |
|-------|---------|
| Input Videos (one per line) | `/path/clip1.mp4`<br>`/path/clip2.mp4`<br>`https://cdn.example.com/clip3.mp4` |

> **Note:** Videos should have the same codec, resolution, and framerate for best results. Use "Convert Format" on each clip first if they differ.

---

#### Convert Format
Change container or codec without changing content.

| Field | Options |
|-------|---------|
| Output Format | MP4, MOV, WebM, AVI, MKV |
| Video Codec | H.264 (libx264), H.265 (libx265), VP9 (libvpx-vp9), AV1 (libsvtav1), Copy |
| Audio Codec | AAC, MP3, Opus, Copy, None |
| CRF Quality | 0–51 (18=high quality, 28=smaller file) |

---

#### Scale / Resize
Change video dimensions with common presets or custom size.

| Preset | Resolution |
|--------|-----------|
| 3840×2160 (4K UHD) | 3840×2160 |
| 1920×1080 (Full HD) | 1920×1080 |
| 1280×720 (HD) | 1280×720 |
| 854×480 (SD) | 854×480 |
| 1080×1920 (9:16 Portrait) | 1080×1920 |
| 1080×1080 (Square) | 1080×1080 |
| Custom | Enter W×H |

> Use `-1` for width or height to maintain aspect ratio. E.g., `1280:-1` scales width to 1280 and height proportionally.

---

#### Crop
Extract a rectangular region from the video.

| Field | Example | Description |
|-------|---------|-------------|
| Crop Width | `640` or `iw/2` | Supports FFmpeg expressions |
| Crop Height | `360` or `ih/2` | |
| Crop X | `320` or `(iw-640)/2` | Left offset (default centers) |
| Crop Y | `180` or `(ih-360)/2` | Top offset |

---

#### Overlay Image (Watermark)
Overlay an image, logo, or watermark on video.

| Field | Example |
|-------|---------|
| Overlay Image | `/path/to/logo.png` |
| Position | Top-Left, Top-Right, Bottom-Right, Bottom-Left, Center, Custom |
| Opacity | `0.8` (0=transparent, 1=opaque) |
| Scale (% of video width) | `15` (makes overlay 15% of video width) |
| Start Time (s) | `5` |
| End Time (s) | `25` (0 = always visible) |

**FFmpeg equivalent:**
```bash
ffmpeg -i input.mp4 -i logo.png \
  -filter_complex "[1:v]scale=iw*0.15:-1[logo];[0:v][logo]overlay=W-w-10:H-h-10:enable='between(t,5,25)'" \
  output.mp4
```

---

#### Burn Text (drawtext)
Render text directly onto the video using the `drawtext` filter.

| Field | Example |
|-------|---------|
| Text | `Hello World` or `%{pts\\:hms}` (timecode) |
| Font Size | `48` |
| Font Color | `white` or `#FF0000` |
| Position | `(W-tw)/2:(H-th)/2` (centered) |
| Background Box | Enable for readability |

**Common expressions:**
- `%{pts\:hms}` — current timecode
- `%{frame_num}` — frame number
- `(W-tw)/2` — horizontally centered
- `H-th-20` — 20px from bottom

---

#### Crossfade / Xfade
Apply a transition effect between two video clips.

| Effect | Description |
|--------|-------------|
| fade | Simple opacity fade |
| wipeleft / wiperight / wipeup / wipedown | Wipe transition |
| slideleft / slideright | Slide transition |
| circlecrop | Circle crop reveal |
| radial | Radial wipe |
| smoothleft / smoothright | Smooth slide |
| hblur | Horizontal motion blur |

| Field | Example |
|-------|---------|
| Input Videos (2 clips) | `/path/clip1.mp4`<br>`/path/clip2.mp4` |
| Xfade Effect | `fade` |
| Crossfade Duration (s) | `0.5` |
| Offset (s) | `3.5` (when first clip transition starts) |

---

#### Create Slideshow
Combine a set of images into a video with optional audio.

| Field | Example |
|-------|---------|
| Input Images (one per line) | `/images/frame01.jpg`<br>`/images/frame02.jpg` |
| Duration Per Image (s) | `3` |
| Slideshow Audio | `/music/background.mp3` (optional) |
| Fade Between Images | Enable for smooth transitions |

---

### FFmpeg Audio

#### Normalize (Loudnorm EBU R128)
Normalize audio to broadcast standards.

| Field | Default | Description |
|-------|---------|-------------|
| Target Integrated Loudness (I) | `-16 LUFS` | `-23` for broadcast, `-14` for streaming |
| True Peak (TP) | `-1.5 dBTP` | Maximum true peak |
| LRA Range | `11 LU` | Loudness range |

**Use case:** Normalize podcast audio before publishing, normalize ad audio for Meta/Google Ads.

---

#### Remove Silence
Strip silent sections from audio automatically.

| Field | Example | Description |
|-------|---------|-------------|
| Silence Threshold (dB) | `-50` | Audio below this level is silence |
| Minimum Silence Duration (s) | `0.5` | Shorter gaps are kept |
| Keep Edges | `false` | Preserve leading/trailing silence |

**Use case:** Remove dead air from podcast recordings, tighten interview audio.

---

#### Change Speed
Speed up or slow down audio.

| Field | Example | Notes |
|-------|---------|-------|
| Speed Factor | `1.5` | 1.5 = 50% faster, 0.5 = half speed |

Range: `0.125×` to `8×`. Automatically chains `atempo` filters for values outside `0.5–2.0`.

---

#### Mix Audio Tracks
Combine multiple audio streams using `amix`.

| Field | Example |
|-------|---------|
| Input Files (one per line) | `/audio/voice.mp3`<br>`/audio/music.mp3` |

> Audio levels are not normalized by default — adjust volumes first using the **Adjust Volume** operation.

---

### FFmpeg Analyze

#### Get Metadata
Extract technical metadata from any video or audio file.

**Output JSON example:**
```json
{
  "format": "mp4",
  "duration": "125.3",
  "bit_rate": "4200000",
  "video_codec": "h264",
  "width": 1920,
  "height": 1080,
  "fps": "29.97",
  "audio_codec": "aac",
  "audio_sample_rate": "44100",
  "audio_channels": 2
}
```

---

#### Detect Scene Changes
Find cut points in a video using the `scdet` filter.

| Field | Default | Description |
|-------|---------|-------------|
| Threshold | `10` | Lower = more sensitive (0–100) |

**Output:** Array of scene change timestamps in seconds.

**Use case:** Auto-chaptering, splitting a long video at natural cut points.

---

#### Generate Sprite Sheet
Create a thumbnail preview grid (like YouTube's scrubber preview).

| Field | Example |
|-------|---------|
| Frame Interval (s) | `5` (one thumb every 5 seconds) |
| Tile Width (px) | `160` |
| Tile Height (px) | `90` |
| Columns | `10` |

---

### FFmpeg Advanced

#### Apply LUT (Color Grading)
Apply a `.cube` color lookup table for cinematic color grading.

| Field | Example | Notes |
|-------|---------|-------|
| LUT File Path | `/luts/cinematic.cube` | Must be a .cube format file |
| LUT Strength | `0.8` | 0=original, 1=full LUT |

**Popular free LUT sources:** Lutify.me, RocketStock, Ground Control

---

#### Chroma Key (Green Screen)
Remove a background color and optionally replace with another video/image.

| Field | Example | Description |
|-------|---------|-------------|
| Chroma Key Color | `0x00ff00` | Green screen |
| Similarity Threshold | `0.1` | 0.01=strict, 0.3=loose |
| Blend Amount | `0.05` | Edge feathering |
| Background File | `/bg/office.jpg` | Optional replacement background |

> **Output format:** If no background is provided, output is WebM (VP9) with transparency (YUVA420). If a background is provided, output is MP4.

---

#### Blur Region (Mosaic/Redact)
Pixelate a rectangular region for privacy/redaction.

| Field | Example | Description |
|-------|---------|-------------|
| Region X | `240` | Left edge of region |
| Region Y | `120` | Top edge of region |
| Region Width | `200` | Width of region |
| Region Height | `150` | Height of region |
| Blur Intensity | `15` | Higher = more pixelated |

**Use case:** Blur faces for GDPR compliance, redact license plates, hide UI elements.

---

#### Deinterlace
Remove interlacing from broadcast or legacy video.

| Field | Options |
|-------|---------|
| Mode | Send Frame (same fps), Send Field (2× fps) |
| Parity | Auto-detect, Top Field First, Bottom Field First |

**Use case:** Processing cable TV recordings, converting interlaced broadcast footage.

---

#### Ken Burns / Zoom Pan
Create an animated zoom-and-pan effect on a still image or video.

| Field | Example | Description |
|-------|---------|-------------|
| Zoom Start | `1.0` | 1.0 = original size |
| Zoom End | `1.5` | 1.5 = 50% zoomed in |
| Pan Direction | Left to Right | 7 options |
| Output Width | `1920` | |
| Output Height | `1080` | |
| Output FPS | `25` | |

**Use case:** Documentary-style animation of photos, social media content from static images.

---

#### Time-lapse
Create a time-lapse by sampling frames at regular intervals.

| Field | Example | Description |
|-------|---------|-------------|
| Frame Interval | `30` | Keep 1 frame every 30 → 30× speed |
| Output FPS | `30` | Frame rate of output |

**Examples:**
- `interval=10, fps=30` → 10× speed (10 minutes = 1 minute output)
- `interval=300, fps=24` → 300× speed (5 hours = 1 minute output)

---

#### HLS Segmentation
Segment video for HTTP Live Streaming (HLS).

| Field | Example |
|-------|---------|
| Segment Duration (s) | `6` |
| Output Directory | `/var/www/html/stream/` |
| Playlist Name | `playlist.m3u8` |

**Output:** `playlist.m3u8` + `segment_000.ts`, `segment_001.ts`, ...

> **Note:** Serve the output directory via a web server (nginx, Apache, S3, Cloudflare). HLS requires HTTP/HTTPS.

---

#### DASH Packaging
Package video for MPEG-DASH adaptive streaming.

| Field | Example |
|-------|---------|
| Segment Duration (s) | `4` |
| Output Directory | `/var/www/html/dash/` |
| Manifest Name | `manifest.mpd` |

**Output:** `manifest.mpd` + `init_*.mp4` + `seg_*_*.m4s` segments

> Both HLS and DASH are supported — use HLS for Apple/iOS, DASH for broader compatibility.

---

#### Stabilize Video
Smooth out camera shake using a two-pass vidstab process.

| Field | Default | Description |
|-------|---------|-------------|
| Smoothing | `10` | Window in frames. Higher = smoother but more crop |
| Max Angle | `-1` | Max correction angle in degrees. -1 = unlimited |

> **Requires:** FFmpeg compiled with `--enable-libvidstab`. Check with `ffmpeg -filters | grep vidstab`.

---

## Common Patterns

### Video Processing Pipeline

```
HTTP Request → FFmpeg Video (Trim) → FFmpeg Advanced (Apply LUT) → FFmpeg Audio (Normalize) → S3 Upload
```

### Batch Thumbnail Generation

```
List Files → Split → FFmpeg Analyze (Extract Frame) → Write Binary File → Merge
```

### Podcast Processing

```
HTTP Request → FFmpeg Audio (Normalize) → FFmpeg Audio (Remove Silence) → FFmpeg Audio (Fade In/Out) → Send Email
```

### Green Screen Replacement

```
Read File → FFmpeg Advanced (Chroma Key, bg=office.jpg) → FFmpeg Video (Burn Text) → Write File
```

### HLS Streaming Prep

```
HTTP Request (upload) → FFmpeg Video (Scale 1080p) → FFmpeg Advanced (HLS Segmentation) → Upload Segments to S3
```

---

## Troubleshooting

### FFmpeg not found

```
Error: FFmpeg is not installed or not in PATH
```

Install FFmpeg for your platform:
- macOS: `brew install ffmpeg`
- Ubuntu: `sudo apt install ffmpeg`
- Verify: `ffmpeg -version`

If ffmpeg is installed but n8n can't find it, set the PATH in your n8n startup script:
```bash
export PATH="/usr/local/bin:$PATH"
n8n start
```

### Encoder not found

```
Error: FFmpeg encoder not found: "libx265"
```

Your FFmpeg build doesn't include that codec. Try a different codec or install a full-featured FFmpeg build. On Ubuntu: `sudo apt install ffmpeg` installs the full build. On macOS: `brew install ffmpeg` includes most codecs.

### Input file not found

```
Error: Input file not found: "/path/to/file.mp4"
```

Check that the path is absolute, the file exists, and n8n has read permissions for that path.

### Stabilization fails

```
Error: FFmpeg failed. Details: No such filter: vidstabdetect
```

Your FFmpeg build doesn't include vidstab. Compile from source or use a build that includes `--enable-libvidstab`.

### Large files / timeouts

For large files, increase n8n's execution timeout in your n8n config or environment:
```
EXECUTIONS_TIMEOUT=3600
```

---

---

## Workflow Examples

Real n8n workflow JSON files you can import directly into n8n. Find them in the [`examples/`](examples/) directory.

| Workflow | Description |
|----------|-------------|
| [Social Media Video Pipeline](examples/social-media-video-pipeline.json) | Trim → Scale to 1080×1920 → Burn text → Export MP4 for Reels/TikTok |
| [Podcast Audio Pipeline](examples/podcast-audio-pipeline.json) | Trim → Loudnorm → Fade → Export broadcast-quality MP3 |
| [Thumbnail Generation](examples/thumbnail-generation.json) | Extract frame → Add watermark → Save as 1280×720 PNG |
| [Green Screen Removal](examples/green-screen-removal.json) | Chroma key → Composite onto custom background → Export |
| [HLS Streaming Prep](examples/hls-streaming-prep.json) | Transcode → Segment into HLS 6-second chunks with M3U8 |

**To import:** In n8n, go to *Workflows → Import from File* and select the JSON.

---

## Publishing to npm

> **Note:** npm publishing requires an npm account and an `NPM_TOKEN` secret configured in the repository.

To publish manually:
```bash
npm login
npm publish --access public
```

To enable automatic publishing via GitHub Actions on each release tag, add your `NPM_TOKEN` to the repository secrets under **Settings → Secrets and variables → Actions**.

Until published, you can install directly from GitHub:
```bash
cd ~/.n8n/custom
npm install ArielleTolome/n8n-nodes-ffmpeg
```

---

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for a full guide on:

- How to add a new operation
- How to run and write tests
- How to build and test locally with n8n
- Code style rules (TypeScript strict, path quoting)
- How to submit a pull request

---

## License

MIT — see [LICENSE](LICENSE)
