# n8n-nodes-ffmpeg

Production-grade n8n community nodes for FFmpeg video/audio processing. More powerful and feature-rich than Fal.ai's FFmpeg API.

## Features

This package provides 4 nodes covering 50+ FFmpeg operations:

### 🎬 FFmpeg Video
Core video operations:
- **Trim/Cut** — cut by start/end time or duration
- **Merge/Concatenate** — join multiple videos end-to-end
- **Convert Format** — MP4, MOV, WebM, AVI, MKV with codec selection (H.264, H.265, VP9, AV1)
- **Scale/Resize** — with presets (4K, 1080p, 720p, portrait, landscape, square)
- **Crop** — by x/y/width/height with expression support
- **Rotate** — 90°CW, 90°CCW, 180°, or custom angle
- **Flip** — horizontal, vertical, or both
- **Reverse** — play video backwards
- **Speed Change** — speed up or slow down (preserves audio pitch chain)
- **Loop** — repeat video N times
- **Pad** — letterbox/pillarbox to target dimensions
- **Split into Segments** — equal-length segments with `-f segment`
- **Extract Audio** — pull audio track from video
- **Remove Audio** — strip audio from video
- **Add/Replace Audio** — replace or mix with new audio track
- **Overlay Image** — watermark/logo with position presets, opacity, timing, scale
- **Overlay Video (PiP)** — picture-in-picture with size/position control
- **Burn Text** — drawtext filter with font, size, color, background box
- **Add Subtitles** — burn .srt or .ass subtitle files
- **Compose Side-by-Side** — hstack, vstack, or 2x2 xstack grid
- **Fade In/Out** — video + audio fade
- **Crossfade/Xfade** — 12 transition effects between clips
- **Change Framerate** — set target FPS
- **Strip Metadata** — remove all metadata
- **Generate GIF** — two-pass palette GIF from video segment
- **Generate Thumbnail** — extract frame at timestamp
- **Create Slideshow** — images → video with optional audio

### 🎵 FFmpeg Audio
- **Trim Audio** — cut by time range
- **Merge Audio Files** — concatenate or mix/overlay
- **Convert Format** — MP3, AAC, WAV, OGG, FLAC, Opus
- **Normalize (Loudnorm EBU R128)** — broadcast/streaming standard normalization
- **Adjust Volume** — multiplier or dB (e.g., `2.0`, `0.5`, `-5dB`)
- **Fade In/Out** — audio fade with auto-duration detection
- **Remove Audio from Video** — strip audio, keep video stream
- **Mix Audio Tracks** — amix multiple audio files simultaneously

### 🔍 FFmpeg Analyze
- **Get Metadata** — duration, codec, fps, resolution, bitrate, color space, etc.
- **Extract Frames** — by interval, timestamp, time range, or every Nth frame
- **Extract Nth Frame** — every Nth frame with optional scale
- **Detect Scene Changes** — scdet filter with configurable threshold
- **Detect Silence** — find silent sections with threshold + min duration
- **Get Loudness Stats** — EBU R128 loudnorm + volumedetect stats
- **Get Waveform Data** — PCM amplitude samples as JSON
- **Generate Sprite Sheet** — video preview thumbnails in a tiled grid

### ⚡ FFmpeg Advanced
- **Apply LUT (Color Grading)** — .cube LUT with adjustable blend strength
- **Blur Video** — Gaussian blur
- **Sharpen Video** — unsharp mask
- **Denoise Video** — hqdn3d (light/medium/strong)
- **Add Vignette** — cinematic vignette effect
- **Chroma Key (Green Screen)** — chromakey filter with background replacement
- **Stabilize Video** — vidstabdetect + vidstabtransform (2-pass)
- **HLS Segmentation** — generate .m3u8 + .ts segments for streaming
- **Draw Shapes/Boxes** — drawbox filter for bounding boxes
- **Color Adjustment** — brightness, contrast, saturation, hue, gamma

## Requirements

- [FFmpeg](https://ffmpeg.org/download.html) installed and in PATH
- For stabilization: FFmpeg must be compiled with `--enable-libvidstab`
- For AV1: FFmpeg must be compiled with `--enable-libsvtav1`
- Node.js >= 18.0.0
- n8n

## Installation

### Via n8n Community Nodes

In n8n, go to **Settings → Community Nodes → Install**, then enter:
```
n8n-nodes-ffmpeg
```

### Manual Installation

```bash
npm install n8n-nodes-ffmpeg
```

Or clone and build locally:
```bash
git clone https://github.com/ArielleTolome/n8n-nodes-ffmpeg
cd n8n-nodes-ffmpeg
npm install
npm run build
```

## Usage Examples

### Trim a video to first 30 seconds
- Node: **FFmpeg Video**
- Operation: **Trim / Cut**
- Input Video: `/path/to/input.mp4`
- Start Time: `0`
- End Time: `30`
- Output Format: `MP4`

### Merge multiple videos
- Node: **FFmpeg Video**
- Operation: **Merge / Concatenate**
- Input Videos (one per line):
  ```
  /path/to/clip1.mp4
  /path/to/clip2.mp4
  /path/to/clip3.mp4
  ```

### Normalize audio for YouTube
- Node: **FFmpeg Audio**
- Operation: **Normalize (Loudnorm EBU R128)**
- Target Integrated Loudness: `-16` (LUFS)
- Max True Peak: `-1.5` (dBTP)

### Extract metadata
- Node: **FFmpeg Analyze**
- Operation: **Get Metadata**
- Input File: `/path/to/video.mp4`

Returns: duration, codec, fps, resolution, bitrate, color space, audio info.

### Green screen removal
- Node: **FFmpeg Advanced**
- Operation: **Chroma Key (Green Screen)**
- Input Video: `/path/to/greenscreen.mp4`
- Chroma Key Color: `0x00ff00`
- Similarity Threshold: `0.1`
- Background Video/Image: `/path/to/background.jpg`

### Generate animated GIF
- Node: **FFmpeg Video**
- Operation: **Generate GIF**
- Input Video: `/path/to/video.mp4`
- GIF Start: `5` (seconds)
- GIF Duration: `3`
- GIF Width: `480`

## Input Support

All nodes support:
- **Local file paths**: `/path/to/file.mp4`
- **HTTP/HTTPS URLs**: `https://example.com/video.mp4` (auto-downloaded to temp file)

## Output

Each node can:
- Return **binary data** directly in the n8n item (for use with Write Binary File, HTTP Request, etc.)
- Return the **output file path** in JSON
- Both simultaneously

## Notes

- All operations use temp directories that are cleaned up automatically
- `ffmpeg` and `ffprobe` must be installed on the machine running n8n
- For stabilization, `vidstab` library must be compiled into FFmpeg
- npm publish is documented but skipped in CI (requires manual publish step)

## License

MIT
