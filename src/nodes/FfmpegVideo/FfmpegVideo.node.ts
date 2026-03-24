import {
  IExecuteFunctions,
  INodeExecutionData,
  INodeType,
  INodeTypeDescription,
  NodeOperationError,
} from 'n8n-workflow';
import * as path from 'path';
import * as fs from 'fs';
import {
  validateFfmpeg,
  resolveInput,
  createTempDir,
  cleanupTempDir,
  buildBinaryData,
  runFfmpeg,
  runFfprobe,
  escapeFilterValue,
} from '../../utils/ffmpeg.utils';

export class FfmpegVideo implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'FFmpeg Video',
    name: 'ffmpegVideo',
    icon: 'file:ffmpeg-video.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Process videos using FFmpeg — trim, merge, convert, scale, rotate, crop, overlay, and more.',
    defaults: {
      name: 'FFmpeg Video',
    },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      // ─── OPERATION ───────────────────────────────────────────────────
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Trim / Cut', value: 'trim', description: 'Cut a video to a start/end time' },
          { name: 'Merge / Concatenate', value: 'merge', description: 'Join multiple videos end-to-end' },
          { name: 'Convert Format', value: 'convert', description: 'Change container or codec' },
          { name: 'Scale / Resize', value: 'scale', description: 'Change video dimensions' },
          { name: 'Crop', value: 'crop', description: 'Crop video to a rectangle' },
          { name: 'Rotate', value: 'rotate', description: 'Rotate video by degrees' },
          { name: 'Flip', value: 'flip', description: 'Flip video horizontally or vertically' },
          { name: 'Reverse', value: 'reverse', description: 'Play video in reverse' },
          { name: 'Speed Change', value: 'speed', description: 'Speed up or slow down video' },
          { name: 'Loop', value: 'loop', description: 'Loop video N times' },
          { name: 'Pad Video', value: 'pad', description: 'Add padding (letterbox/pillarbox)' },
          { name: 'Split into Segments', value: 'split', description: 'Split into equal-length segments' },
          { name: 'Extract Audio', value: 'extractAudio', description: 'Pull audio track from video' },
          { name: 'Remove Audio', value: 'removeAudio', description: 'Strip audio from video' },
          { name: 'Add / Replace Audio', value: 'addAudio', description: 'Add or replace audio track' },
          { name: 'Overlay Image (Watermark)', value: 'overlayImage', description: 'Overlay an image/logo on video' },
          { name: 'Overlay Video (PiP)', value: 'overlayVideo', description: 'Picture-in-picture video overlay' },
          { name: 'Burn Text', value: 'burnText', description: 'Draw text onto video (drawtext filter)' },
          { name: 'Add Subtitles', value: 'addSubtitles', description: 'Burn .srt or .ass subtitle file' },
          { name: 'Compose Side-by-Side', value: 'compose', description: 'Stack/tile videos (hstack/vstack/xstack)' },
          { name: 'Fade In/Out', value: 'fade', description: 'Fade video in and/or out' },
          { name: 'Crossfade / Xfade', value: 'xfade', description: 'Transition crossfade between two clips' },
          { name: 'Change Framerate', value: 'framerate', description: 'Set output frames per second' },
          { name: 'Strip Metadata', value: 'stripMetadata', description: 'Remove all metadata from video' },
          { name: 'Generate GIF', value: 'generateGif', description: 'Convert video segment to animated GIF' },
          { name: 'Generate Thumbnail', value: 'thumbnail', description: 'Extract best-frame thumbnail' },
          { name: 'Create Slideshow', value: 'slideshow', description: 'Create video from images + optional audio' },
        ],
        default: 'trim',
      },

      // ─── INPUT ───────────────────────────────────────────────────────
      {
        displayName: 'Input Video',
        name: 'inputVideo',
        type: 'string',
        default: '',
        placeholder: '/path/to/video.mp4 or https://example.com/video.mp4',
        description: 'Path or URL to the input video',
        displayOptions: {
          hide: {
            operation: ['merge', 'compose', 'slideshow'],
          },
        },
      },
      {
        displayName: 'Input Videos (one per line)',
        name: 'inputVideos',
        type: 'string',
        typeOptions: { rows: 4 },
        default: '',
        placeholder: '/path/to/video1.mp4\n/path/to/video2.mp4',
        description: 'Paths or URLs to input videos, one per line',
        displayOptions: {
          show: {
            operation: ['merge', 'compose'],
          },
        },
      },
      {
        displayName: 'Input Images (one per line)',
        name: 'inputImages',
        type: 'string',
        typeOptions: { rows: 4 },
        default: '',
        placeholder: '/path/to/frame1.jpg\n/path/to/frame2.jpg',
        description: 'Paths or URLs to images for slideshow',
        displayOptions: {
          show: {
            operation: ['slideshow'],
          },
        },
      },

      // ─── OUTPUT ──────────────────────────────────────────────────────
      {
        displayName: 'Output Path',
        name: 'outputPath',
        type: 'string',
        default: '',
        placeholder: '/tmp/output.mp4 (leave empty for auto temp file)',
        description: 'Path for output file. Leave empty to auto-generate a temp file.',
      },
      {
        displayName: 'Output Format',
        name: 'outputFormat',
        type: 'options',
        options: [
          { name: 'MP4 (h264)', value: 'mp4' },
          { name: 'MOV (QuickTime)', value: 'mov' },
          { name: 'WebM (VP9)', value: 'webm' },
          { name: 'AVI', value: 'avi' },
          { name: 'MKV', value: 'mkv' },
          { name: 'GIF', value: 'gif' },
          { name: 'MP3', value: 'mp3' },
          { name: 'AAC', value: 'aac' },
          { name: 'WAV', value: 'wav' },
          { name: 'Same as Input', value: 'same' },
        ],
        default: 'mp4',
        displayOptions: {
          show: {
            operation: ['trim', 'merge', 'convert', 'scale', 'crop', 'rotate', 'flip', 'reverse',
              'speed', 'loop', 'pad', 'removeAudio', 'addAudio', 'overlayImage',
              'overlayVideo', 'burnText', 'addSubtitles', 'compose', 'fade', 'xfade',
              'framerate', 'stripMetadata', 'slideshow'],
          },
        },
      },
      {
        displayName: 'Return Binary Data',
        name: 'returnBinary',
        type: 'boolean',
        default: true,
        description: 'Whether to return the file as binary data in the n8n item',
      },
      {
        displayName: 'Binary Property Name',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        displayOptions: {
          show: { returnBinary: [true] },
        },
      },

      // ─── TRIM OPTIONS ─────────────────────────────────────────────────
      {
        displayName: 'Start Time',
        name: 'startTime',
        type: 'string',
        default: '0',
        placeholder: '00:00:10 or 10.5',
        description: 'Start time (HH:MM:SS.mmm or seconds)',
        displayOptions: { show: { operation: ['trim'] } },
      },
      {
        displayName: 'End Time',
        name: 'endTime',
        type: 'string',
        default: '',
        placeholder: '00:00:30 or 30',
        description: 'End time (HH:MM:SS.mmm or seconds). Leave empty to use Duration.',
        displayOptions: { show: { operation: ['trim'] } },
      },
      {
        displayName: 'Duration',
        name: 'duration',
        type: 'string',
        default: '',
        placeholder: '10 or 00:00:10',
        description: 'Duration to keep. Used only if End Time is empty.',
        displayOptions: { show: { operation: ['trim'] } },
      },

      // ─── CONVERT OPTIONS ──────────────────────────────────────────────
      {
        displayName: 'Video Codec',
        name: 'videoCodec',
        type: 'options',
        options: [
          { name: 'H.264 (libx264)', value: 'libx264' },
          { name: 'H.265 / HEVC (libx265)', value: 'libx265' },
          { name: 'VP9 (libvpx-vp9)', value: 'libvpx-vp9' },
          { name: 'AV1 (libsvtav1)', value: 'libsvtav1' },
          { name: 'Copy (no re-encode)', value: 'copy' },
          { name: 'Auto (let FFmpeg choose)', value: 'auto' },
        ],
        default: 'libx264',
        displayOptions: { show: { operation: ['convert', 'trim', 'merge', 'scale', 'crop', 'rotate', 'flip', 'speed', 'loop', 'pad', 'overlayImage', 'overlayVideo', 'burnText', 'addSubtitles', 'compose', 'fade', 'xfade', 'framerate', 'slideshow'] } },
      },
      {
        displayName: 'CRF Quality',
        name: 'crf',
        type: 'number',
        typeOptions: { minValue: 0, maxValue: 63 },
        default: 23,
        description: 'Constant Rate Factor: lower = better quality, larger file. h264: 0-51 (18-28 typical). 0 = lossless.',
        displayOptions: { show: { operation: ['convert', 'trim', 'merge', 'scale', 'crop', 'rotate', 'flip', 'speed', 'loop', 'pad', 'overlayImage', 'overlayVideo', 'burnText', 'addSubtitles', 'compose', 'fade', 'xfade', 'framerate', 'slideshow'] } },
      },
      {
        displayName: 'Audio Codec',
        name: 'audioCodec',
        type: 'options',
        options: [
          { name: 'AAC', value: 'aac' },
          { name: 'MP3 (libmp3lame)', value: 'libmp3lame' },
          { name: 'Opus (libopus)', value: 'libopus' },
          { name: 'Copy (no re-encode)', value: 'copy' },
          { name: 'None (remove audio)', value: 'none' },
          { name: 'Auto', value: 'auto' },
        ],
        default: 'aac',
        displayOptions: { show: { operation: ['convert', 'trim', 'merge', 'speed', 'fade', 'xfade', 'slideshow'] } },
      },

      // ─── SCALE OPTIONS ────────────────────────────────────────────────
      {
        displayName: 'Width',
        name: 'scaleWidth',
        type: 'string',
        default: '1280',
        placeholder: '1280 or -1 (auto)',
        description: 'Output width in pixels. Use -1 to maintain aspect ratio.',
        displayOptions: { show: { operation: ['scale'] } },
      },
      {
        displayName: 'Height',
        name: 'scaleHeight',
        type: 'string',
        default: '-1',
        placeholder: '720 or -1 (auto)',
        description: 'Output height in pixels. Use -1 to maintain aspect ratio.',
        displayOptions: { show: { operation: ['scale'] } },
      },
      {
        displayName: 'Scale Preset',
        name: 'scalePreset',
        type: 'options',
        options: [
          { name: 'Custom (use Width/Height)', value: 'custom' },
          { name: '4K UHD (3840x2160)', value: '3840:-2' },
          { name: '1080p (1920x1080)', value: '1920:-2' },
          { name: '720p (1280x720)', value: '1280:-2' },
          { name: '480p (854x480)', value: '854:-2' },
          { name: '360p (640x360)', value: '640:-2' },
          { name: 'Square 1:1 (1080x1080)', value: '1080:1080' },
          { name: 'Portrait 9:16 (1080x1920)', value: '1080:1920' },
          { name: 'Landscape 16:9 (1920x1080)', value: '1920:1080' },
        ],
        default: 'custom',
        displayOptions: { show: { operation: ['scale'] } },
      },

      // ─── CROP OPTIONS ─────────────────────────────────────────────────
      {
        displayName: 'Crop Width',
        name: 'cropWidth',
        type: 'string',
        default: 'iw',
        placeholder: '1280 or iw/2',
        description: 'Width of crop area. Supports expressions: iw=input width.',
        displayOptions: { show: { operation: ['crop'] } },
      },
      {
        displayName: 'Crop Height',
        name: 'cropHeight',
        type: 'string',
        default: 'ih',
        placeholder: '720 or ih/2',
        description: 'Height of crop area. Supports expressions: ih=input height.',
        displayOptions: { show: { operation: ['crop'] } },
      },
      {
        displayName: 'Crop X (left offset)',
        name: 'cropX',
        type: 'string',
        default: '0',
        placeholder: '0 or (iw-1280)/2',
        displayOptions: { show: { operation: ['crop'] } },
      },
      {
        displayName: 'Crop Y (top offset)',
        name: 'cropY',
        type: 'string',
        default: '0',
        placeholder: '0 or (ih-720)/2',
        displayOptions: { show: { operation: ['crop'] } },
      },

      // ─── ROTATE OPTIONS ───────────────────────────────────────────────
      {
        displayName: 'Rotation',
        name: 'rotationPreset',
        type: 'options',
        options: [
          { name: '90° Clockwise', value: '90cw' },
          { name: '90° Counter-Clockwise', value: '90ccw' },
          { name: '180°', value: '180' },
          { name: 'Custom Angle', value: 'custom' },
        ],
        default: '90cw',
        displayOptions: { show: { operation: ['rotate'] } },
      },
      {
        displayName: 'Custom Angle (degrees)',
        name: 'rotationAngle',
        type: 'number',
        default: 45,
        description: 'Angle in degrees (counter-clockwise positive)',
        displayOptions: {
          show: { operation: ['rotate'], rotationPreset: ['custom'] },
        },
      },
      {
        displayName: 'Fill Color',
        name: 'rotateFillColor',
        type: 'string',
        default: 'black',
        description: 'Background fill color for custom rotation (e.g., black, white, 0x000000)',
        displayOptions: {
          show: { operation: ['rotate'], rotationPreset: ['custom'] },
        },
      },

      // ─── FLIP OPTIONS ─────────────────────────────────────────────────
      {
        displayName: 'Flip Direction',
        name: 'flipDirection',
        type: 'options',
        options: [
          { name: 'Horizontal (left-right)', value: 'hflip' },
          { name: 'Vertical (up-down)', value: 'vflip' },
          { name: 'Both', value: 'both' },
        ],
        default: 'hflip',
        displayOptions: { show: { operation: ['flip'] } },
      },

      // ─── SPEED OPTIONS ────────────────────────────────────────────────
      {
        displayName: 'Speed Factor',
        name: 'speedFactor',
        type: 'number',
        typeOptions: { minValue: 0.1, maxValue: 100, numberPrecision: 2 },
        default: 2.0,
        description: 'Speed multiplier. 2.0 = 2x faster, 0.5 = half speed.',
        displayOptions: { show: { operation: ['speed'] } },
      },

      // ─── LOOP OPTIONS ─────────────────────────────────────────────────
      {
        displayName: 'Loop Count',
        name: 'loopCount',
        type: 'number',
        typeOptions: { minValue: 2, maxValue: 100 },
        default: 3,
        description: 'Number of times to loop the video',
        displayOptions: { show: { operation: ['loop'] } },
      },

      // ─── PAD OPTIONS ──────────────────────────────────────────────────
      {
        displayName: 'Pad Width',
        name: 'padWidth',
        type: 'string',
        default: '1920',
        description: 'Target padded width',
        displayOptions: { show: { operation: ['pad'] } },
      },
      {
        displayName: 'Pad Height',
        name: 'padHeight',
        type: 'string',
        default: '1080',
        description: 'Target padded height',
        displayOptions: { show: { operation: ['pad'] } },
      },
      {
        displayName: 'Pad Color',
        name: 'padColor',
        type: 'string',
        default: 'black',
        description: 'Background fill color (e.g., black, white, 0x000000)',
        displayOptions: { show: { operation: ['pad'] } },
      },

      // ─── SPLIT OPTIONS ────────────────────────────────────────────────
      {
        displayName: 'Segment Duration (seconds)',
        name: 'segmentDuration',
        type: 'number',
        default: 60,
        description: 'Length of each output segment in seconds',
        displayOptions: { show: { operation: ['split'] } },
      },
      {
        displayName: 'Segment Output Directory',
        name: 'segmentOutputDir',
        type: 'string',
        default: '/tmp/segments',
        description: 'Directory to write segment files',
        displayOptions: { show: { operation: ['split'] } },
      },

      // ─── AUDIO OPTIONS ────────────────────────────────────────────────
      {
        displayName: 'Audio File',
        name: 'audioFile',
        type: 'string',
        default: '',
        placeholder: '/path/to/audio.mp3 or https://...',
        description: 'Path or URL to the audio file',
        displayOptions: { show: { operation: ['addAudio'] } },
      },
      {
        displayName: 'Audio Mode',
        name: 'audioMode',
        type: 'options',
        options: [
          { name: 'Replace (new audio only)', value: 'replace' },
          { name: 'Mix (blend original + new)', value: 'mix' },
        ],
        default: 'replace',
        displayOptions: { show: { operation: ['addAudio'] } },
      },

      // ─── OVERLAY IMAGE OPTIONS ────────────────────────────────────────
      {
        displayName: 'Overlay Image',
        name: 'overlayImageFile',
        type: 'string',
        default: '',
        placeholder: '/path/to/logo.png or https://...',
        displayOptions: { show: { operation: ['overlayImage'] } },
      },
      {
        displayName: 'Overlay Position',
        name: 'overlayPosition',
        type: 'options',
        options: [
          { name: 'Top Left', value: '10:10' },
          { name: 'Top Right', value: 'main_w-overlay_w-10:10' },
          { name: 'Bottom Left', value: '10:main_h-overlay_h-10' },
          { name: 'Bottom Right', value: 'main_w-overlay_w-10:main_h-overlay_h-10' },
          { name: 'Center', value: '(main_w-overlay_w)/2:(main_h-overlay_h)/2' },
          { name: 'Custom', value: 'custom' },
        ],
        default: 'main_w-overlay_w-10:10',
        displayOptions: { show: { operation: ['overlayImage'] } },
      },
      {
        displayName: 'Overlay X',
        name: 'overlayX',
        type: 'string',
        default: '10',
        displayOptions: { show: { operation: ['overlayImage'], overlayPosition: ['custom'] } },
      },
      {
        displayName: 'Overlay Y',
        name: 'overlayY',
        type: 'string',
        default: '10',
        displayOptions: { show: { operation: ['overlayImage'], overlayPosition: ['custom'] } },
      },
      {
        displayName: 'Overlay Opacity',
        name: 'overlayOpacity',
        type: 'number',
        typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
        default: 1.0,
        description: '1.0 = fully opaque, 0.0 = invisible',
        displayOptions: { show: { operation: ['overlayImage'] } },
      },
      {
        displayName: 'Overlay Scale Width',
        name: 'overlayScaleWidth',
        type: 'number',
        default: 0,
        description: 'Scale overlay to this width (0 = no scaling)',
        displayOptions: { show: { operation: ['overlayImage'] } },
      },
      {
        displayName: 'Start Time (seconds)',
        name: 'overlayStartTime',
        type: 'number',
        default: 0,
        description: 'When the overlay starts appearing (seconds)',
        displayOptions: { show: { operation: ['overlayImage'] } },
      },
      {
        displayName: 'End Time (seconds, 0=always)',
        name: 'overlayEndTime',
        type: 'number',
        default: 0,
        displayOptions: { show: { operation: ['overlayImage'] } },
      },

      // ─── OVERLAY VIDEO (PiP) OPTIONS ──────────────────────────────────
      {
        displayName: 'PiP Video',
        name: 'pipVideoFile',
        type: 'string',
        default: '',
        placeholder: '/path/to/pip.mp4 or https://...',
        displayOptions: { show: { operation: ['overlayVideo'] } },
      },
      {
        displayName: 'PiP Width',
        name: 'pipWidth',
        type: 'string',
        default: '320',
        description: 'Width of the PiP window in pixels',
        displayOptions: { show: { operation: ['overlayVideo'] } },
      },
      {
        displayName: 'PiP Position X',
        name: 'pipX',
        type: 'string',
        default: 'main_w-overlay_w-10',
        description: 'Horizontal position (supports expressions)',
        displayOptions: { show: { operation: ['overlayVideo'] } },
      },
      {
        displayName: 'PiP Position Y',
        name: 'pipY',
        type: 'string',
        default: 'main_h-overlay_h-10',
        displayOptions: { show: { operation: ['overlayVideo'] } },
      },

      // ─── BURN TEXT OPTIONS ────────────────────────────────────────────
      {
        displayName: 'Text',
        name: 'burnText',
        type: 'string',
        default: 'Sample Text',
        displayOptions: { show: { operation: ['burnText'] } },
      },
      {
        displayName: 'Font Size',
        name: 'fontSize',
        type: 'number',
        default: 48,
        displayOptions: { show: { operation: ['burnText'] } },
      },
      {
        displayName: 'Font Color',
        name: 'fontColor',
        type: 'string',
        default: 'white',
        description: 'Color name or hex (e.g., white, #FFFFFF, white@0.8 for transparency)',
        displayOptions: { show: { operation: ['burnText'] } },
      },
      {
        displayName: 'Text X Position',
        name: 'textX',
        type: 'string',
        default: '(w-text_w)/2',
        description: 'X coordinate (supports expressions: w=width, text_w=text width)',
        displayOptions: { show: { operation: ['burnText'] } },
      },
      {
        displayName: 'Text Y Position',
        name: 'textY',
        type: 'string',
        default: 'h-th-20',
        description: 'Y coordinate (h=height, th=text height)',
        displayOptions: { show: { operation: ['burnText'] } },
      },
      {
        displayName: 'Font File Path',
        name: 'fontFile',
        type: 'string',
        default: '',
        placeholder: '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf',
        description: 'Path to .ttf font file. Leave empty to use default.',
        displayOptions: { show: { operation: ['burnText'] } },
      },
      {
        displayName: 'Box Background',
        name: 'textBoxBackground',
        type: 'boolean',
        default: false,
        description: 'Whether to add a background box behind text',
        displayOptions: { show: { operation: ['burnText'] } },
      },
      {
        displayName: 'Box Color',
        name: 'textBoxColor',
        type: 'string',
        default: 'black@0.5',
        displayOptions: { show: { operation: ['burnText'], textBoxBackground: [true] } },
      },

      // ─── SUBTITLES ────────────────────────────────────────────────────
      {
        displayName: 'Subtitle File',
        name: 'subtitleFile',
        type: 'string',
        default: '',
        placeholder: '/path/to/subtitles.srt',
        displayOptions: { show: { operation: ['addSubtitles'] } },
      },
      {
        displayName: 'Subtitle Style Override',
        name: 'subtitleStyle',
        type: 'string',
        default: '',
        placeholder: 'FontSize=24,PrimaryColour=&Hffffff',
        description: 'ASS style override for .srt files',
        displayOptions: { show: { operation: ['addSubtitles'] } },
      },

      // ─── COMPOSE OPTIONS ──────────────────────────────────────────────
      {
        displayName: 'Compose Layout',
        name: 'composeLayout',
        type: 'options',
        options: [
          { name: 'Side by Side (hstack)', value: 'hstack' },
          { name: 'Top/Bottom (vstack)', value: 'vstack' },
          { name: '2x2 Grid (xstack)', value: 'xstack_2x2' },
        ],
        default: 'hstack',
        displayOptions: { show: { operation: ['compose'] } },
      },

      // ─── FADE OPTIONS ─────────────────────────────────────────────────
      {
        displayName: 'Fade In Duration (seconds)',
        name: 'fadeInDuration',
        type: 'number',
        default: 1.0,
        description: '0 to disable',
        displayOptions: { show: { operation: ['fade'] } },
      },
      {
        displayName: 'Fade Out Duration (seconds)',
        name: 'fadeOutDuration',
        type: 'number',
        default: 1.0,
        description: '0 to disable',
        displayOptions: { show: { operation: ['fade'] } },
      },
      {
        displayName: 'Video Duration (seconds)',
        name: 'videoTotalDuration',
        type: 'number',
        default: 0,
        description: 'Required for fade out. 0 = auto-detect (slower).',
        displayOptions: { show: { operation: ['fade'] } },
      },

      // ─── XFADE OPTIONS ────────────────────────────────────────────────
      {
        displayName: 'Transition Effect',
        name: 'xfadeEffect',
        type: 'options',
        options: [
          { name: 'Fade', value: 'fade' },
          { name: 'Wipe Left', value: 'wipeleft' },
          { name: 'Wipe Right', value: 'wiperight' },
          { name: 'Wipe Up', value: 'wipeup' },
          { name: 'Wipe Down', value: 'wipedown' },
          { name: 'Slide Left', value: 'slideleft' },
          { name: 'Slide Right', value: 'slideright' },
          { name: 'Dissolve', value: 'dissolve' },
          { name: 'Pixelize', value: 'pixelize' },
          { name: 'Radial', value: 'radial' },
          { name: 'Smoothleft', value: 'smoothleft' },
          { name: 'Circlecrop', value: 'circlecrop' },
        ],
        default: 'fade',
        displayOptions: { show: { operation: ['xfade'] } },
      },
      {
        displayName: 'Transition Duration (seconds)',
        name: 'xfadeDuration',
        type: 'number',
        default: 1.0,
        displayOptions: { show: { operation: ['xfade'] } },
      },
      {
        displayName: 'First Clip Duration (seconds)',
        name: 'xfadeOffset',
        type: 'number',
        default: 5.0,
        description: 'Duration of first clip before transition starts',
        displayOptions: { show: { operation: ['xfade'] } },
      },

      // ─── FRAMERATE OPTIONS ────────────────────────────────────────────
      {
        displayName: 'Frame Rate (FPS)',
        name: 'fps',
        type: 'number',
        default: 30,
        displayOptions: { show: { operation: ['framerate'] } },
      },

      // ─── GIF OPTIONS ──────────────────────────────────────────────────
      {
        displayName: 'GIF Width',
        name: 'gifWidth',
        type: 'number',
        default: 480,
        displayOptions: { show: { operation: ['generateGif'] } },
      },
      {
        displayName: 'GIF FPS',
        name: 'gifFps',
        type: 'number',
        default: 10,
        displayOptions: { show: { operation: ['generateGif'] } },
      },
      {
        displayName: 'GIF Start Time',
        name: 'gifStart',
        type: 'string',
        default: '0',
        displayOptions: { show: { operation: ['generateGif'] } },
      },
      {
        displayName: 'GIF Duration (seconds)',
        name: 'gifDuration',
        type: 'number',
        default: 5,
        displayOptions: { show: { operation: ['generateGif'] } },
      },

      // ─── THUMBNAIL OPTIONS ────────────────────────────────────────────
      {
        displayName: 'Thumbnail Timestamp',
        name: 'thumbTimestamp',
        type: 'string',
        default: '00:00:01',
        description: 'Timestamp to extract thumbnail (HH:MM:SS or seconds)',
        displayOptions: { show: { operation: ['thumbnail'] } },
      },
      {
        displayName: 'Thumbnail Width',
        name: 'thumbWidth',
        type: 'number',
        default: 1280,
        displayOptions: { show: { operation: ['thumbnail'] } },
      },

      // ─── SLIDESHOW OPTIONS ────────────────────────────────────────────
      {
        displayName: 'Image Duration (seconds per image)',
        name: 'slideDuration',
        type: 'number',
        default: 3.0,
        displayOptions: { show: { operation: ['slideshow'] } },
      },
      {
        displayName: 'Slideshow Audio File (optional)',
        name: 'slideshowAudio',
        type: 'string',
        default: '',
        displayOptions: { show: { operation: ['slideshow'] } },
      },
      {
        displayName: 'Slide Width',
        name: 'slideWidth',
        type: 'number',
        default: 1920,
        displayOptions: { show: { operation: ['slideshow'] } },
      },
      {
        displayName: 'Slide Height',
        name: 'slideHeight',
        type: 'number',
        default: 1080,
        displayOptions: { show: { operation: ['slideshow'] } },
      },

      // ─── EXTRA FFMPEG ARGS ────────────────────────────────────────────
      {
        displayName: 'Extra FFmpeg Arguments',
        name: 'extraArgs',
        type: 'string',
        default: '',
        placeholder: '-preset fast -tune film',
        description: 'Additional FFmpeg arguments appended to the command',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    await validateFfmpeg();

    for (let i = 0; i < items.length; i++) {
      const tmpDir = createTempDir();
      try {
        const operation = this.getNodeParameter('operation', i) as string;
        const outputFormat = (this.getNodeParameter('outputFormat', i, 'mp4') as string);
        const returnBinary = this.getNodeParameter('returnBinary', i) as boolean;
        const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
        const extraArgs = this.getNodeParameter('extraArgs', i, '') as string;
        const videoCodec = this.getNodeParameter('videoCodec', i, 'libx264') as string;
        const crf = this.getNodeParameter('crf', i, 23) as number;
        const audioCodec = this.getNodeParameter('audioCodec', i, 'aac') as string;

        let outputPath = this.getNodeParameter('outputPath', i, '') as string;
        if (!outputPath) {
          const ext = outputFormat === 'same' ? 'mp4' : outputFormat;
          outputPath = path.join(tmpDir, `output.${ext}`);
        }

        // Build codec args
        const vcodecArg = videoCodec === 'auto' ? '' : videoCodec === 'copy' ? '-vcodec copy' : `-vcodec ${videoCodec} -crf ${crf}`;
        const acodecArg = audioCodec === 'auto' ? '-acodec aac' : audioCodec === 'none' ? '-an' : `-acodec ${audioCodec}`;

        let ffmpegCmd = '';

        // ─── OPERATIONS ────────────────────────────────────────────────
        if (operation === 'trim') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const startTime = this.getNodeParameter('startTime', i) as string;
          const endTime = this.getNodeParameter('endTime', i, '') as string;
          const duration = this.getNodeParameter('duration', i, '') as string;

          const inputPath = await resolveInput(inputVideo, tmpDir);
          const ssArg = startTime ? `-ss ${startTime}` : '';
          const toArg = endTime ? `-to ${endTime}` : duration ? `-t ${duration}` : '';

          ffmpegCmd = `-y ${ssArg} -i "${inputPath}" ${toArg} ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'merge') {
          const inputVideosRaw = this.getNodeParameter('inputVideos', i) as string;
          const videoList = inputVideosRaw.split('\n').map(v => v.trim()).filter(Boolean);
          if (videoList.length < 2) throw new NodeOperationError(this.getNode(), 'Need at least 2 videos to merge', { itemIndex: i });

          const listFile = path.join(tmpDir, 'concat_list.txt');
          const resolvedPaths: string[] = [];
          for (const v of videoList) {
            const p = await resolveInput(v, tmpDir);
            resolvedPaths.push(p);
          }
          const listContent = resolvedPaths.map(p => `file '${p}'`).join('\n');
          fs.writeFileSync(listFile, listContent);
          ffmpegCmd = `-y -f concat -safe 0 -i "${listFile}" ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'convert') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          ffmpegCmd = `-y -i "${inputPath}" ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'scale') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          const scalePreset = this.getNodeParameter('scalePreset', i) as string;
          let scaleVal: string;
          if (scalePreset !== 'custom') {
            scaleVal = scalePreset;
          } else {
            const w = this.getNodeParameter('scaleWidth', i) as string;
            const h = this.getNodeParameter('scaleHeight', i) as string;
            scaleVal = `${w}:${h}`;
          }
          ffmpegCmd = `-y -i "${inputPath}" -vf "scale=${scaleVal}" ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'crop') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          const w = this.getNodeParameter('cropWidth', i) as string;
          const h = this.getNodeParameter('cropHeight', i) as string;
          const x = this.getNodeParameter('cropX', i) as string;
          const y = this.getNodeParameter('cropY', i) as string;
          ffmpegCmd = `-y -i "${inputPath}" -vf "crop=${w}:${h}:${x}:${y}" ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'rotate') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          const preset = this.getNodeParameter('rotationPreset', i) as string;
          let transposeArg = '';
          if (preset === '90cw') {
            transposeArg = '-vf "transpose=1"';
          } else if (preset === '90ccw') {
            transposeArg = '-vf "transpose=2"';
          } else if (preset === '180') {
            transposeArg = '-vf "transpose=1,transpose=1"';
          } else {
            const angle = this.getNodeParameter('rotationAngle', i) as number;
            const fillColor = this.getNodeParameter('rotateFillColor', i) as string;
            const rad = (angle * Math.PI) / 180;
            transposeArg = `-vf "rotate=${rad}:fillcolor=${fillColor}"`;
          }
          ffmpegCmd = `-y -i "${inputPath}" ${transposeArg} ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'flip') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          const dir = this.getNodeParameter('flipDirection', i) as string;
          const filterVal = dir === 'both' ? 'hflip,vflip' : dir;
          ffmpegCmd = `-y -i "${inputPath}" -vf "${filterVal}" ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'reverse') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          ffmpegCmd = `-y -i "${inputPath}" -vf reverse -af areverse ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'speed') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          const factor = this.getNodeParameter('speedFactor', i) as number;
          const audioCodecForSpeed = this.getNodeParameter('audioCodec', i, 'aac') as string;
          // setpts for video, atempo for audio (limited to 0.5-2.0, chain for wider range)
          const setpts = 1 / factor;
          let atempoChain = '';
          let remaining = factor;
          const tempos: string[] = [];
          while (remaining > 2.0) { tempos.push('atempo=2.0'); remaining /= 2.0; }
          while (remaining < 0.5) { tempos.push('atempo=0.5'); remaining /= 0.5; }
          tempos.push(`atempo=${remaining.toFixed(4)}`);
          atempoChain = tempos.join(',');
          const audioFilter = audioCodecForSpeed === 'none' ? '-an' : `-af "${atempoChain}" -acodec ${audioCodecForSpeed === 'auto' ? 'aac' : audioCodecForSpeed}`;
          ffmpegCmd = `-y -i "${inputPath}" -vf "setpts=${setpts.toFixed(6)}*PTS" ${audioFilter} ${vcodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'loop') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          const loopCount = this.getNodeParameter('loopCount', i) as number;
          const listFile = path.join(tmpDir, 'loop_list.txt');
          const lines = Array(loopCount).fill(`file '${inputPath}'`).join('\n');
          fs.writeFileSync(listFile, lines);
          ffmpegCmd = `-y -f concat -safe 0 -i "${listFile}" ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'pad') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          const pw = this.getNodeParameter('padWidth', i) as string;
          const ph = this.getNodeParameter('padHeight', i) as string;
          const pc = this.getNodeParameter('padColor', i) as string;
          ffmpegCmd = `-y -i "${inputPath}" -vf "scale=${pw}:${ph}:force_original_aspect_ratio=decrease,pad=${pw}:${ph}:(ow-iw)/2:(oh-ih)/2:${pc}" ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'split') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          const segDur = this.getNodeParameter('segmentDuration', i) as number;
          const segDir = this.getNodeParameter('segmentOutputDir', i) as string;
          fs.mkdirSync(segDir, { recursive: true });
          const segPattern = path.join(segDir, 'segment_%03d.mp4');
          ffmpegCmd = `-y -i "${inputPath}" -c copy -f segment -segment_time ${segDur} -reset_timestamps 1 "${segPattern}"`;

        } else if (operation === 'extractAudio') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          const ext = outputFormat === 'same' ? 'mp3' : outputFormat;
          outputPath = outputPath.replace(/\.[^.]+$/, `.${ext}`);
          ffmpegCmd = `-y -i "${inputPath}" -vn ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'removeAudio') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          ffmpegCmd = `-y -i "${inputPath}" -an ${vcodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'addAudio') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const audioFile = this.getNodeParameter('audioFile', i) as string;
          const audioMode = this.getNodeParameter('audioMode', i) as string;
          const videoPath = await resolveInput(inputVideo, tmpDir);
          const audioPath = await resolveInput(audioFile, tmpDir);

          if (audioMode === 'replace') {
            ffmpegCmd = `-y -i "${videoPath}" -i "${audioPath}" -c:v copy -map 0:v:0 -map 1:a:0 -shortest ${extraArgs} "${outputPath}"`;
          } else {
            ffmpegCmd = `-y -i "${videoPath}" -i "${audioPath}" -filter_complex "[0:a][1:a]amix=inputs=2:duration=first[aout]" -map 0:v -map "[aout]" -c:v copy ${extraArgs} "${outputPath}"`;
          }

        } else if (operation === 'overlayImage') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const overlayImg = this.getNodeParameter('overlayImageFile', i) as string;
          const position = this.getNodeParameter('overlayPosition', i) as string;
          const opacity = this.getNodeParameter('overlayOpacity', i) as number;
          const scaleW = this.getNodeParameter('overlayScaleWidth', i, 0) as number;
          const startT = this.getNodeParameter('overlayStartTime', i, 0) as number;
          const endT = this.getNodeParameter('overlayEndTime', i, 0) as number;

          const videoPath = await resolveInput(inputVideo, tmpDir);
          const imgPath = await resolveInput(overlayImg, tmpDir);

          const [x, y] = position === 'custom'
            ? [this.getNodeParameter('overlayX', i) as string, this.getNodeParameter('overlayY', i) as string]
            : position.split(':');

          let overlayFilter = '';
          let overlayInput = '[1:v]';

          if (scaleW > 0) {
            overlayInput = '[ovscaled]';
            overlayFilter = `[1:v]scale=${scaleW}:-1[ovscaled];`;
          }

          let enableExpr = '';
          if (startT > 0 || endT > 0) {
            enableExpr = `:enable='between(t,${startT},${endT > 0 ? endT : 99999})'`;
          }

          const opacityFilter = opacity < 1.0 ? `format=rgba,colorchannelmixer=aa=${opacity}` : '';
          const finalOverlay = opacityFilter ? '[ovfinal]' : overlayInput;

          let filterComplex: string;
          if (opacityFilter) {
            filterComplex = `${overlayFilter}${overlayInput.replace('[', '').replace(']', '')}[ovop];[ovop]${opacityFilter}[ovfinal];[0:v]${finalOverlay}overlay=${x}:${y}${enableExpr}[out]`;
          } else {
            filterComplex = `${overlayFilter}[0:v]${overlayInput}overlay=${x}:${y}${enableExpr}[out]`;
          }

          ffmpegCmd = `-y -i "${videoPath}" -i "${imgPath}" -filter_complex "${filterComplex}" -map "[out]" -map 0:a? ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'overlayVideo') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const pipVideo = this.getNodeParameter('pipVideoFile', i) as string;
          const pipWidth = this.getNodeParameter('pipWidth', i) as string;
          const pipX = this.getNodeParameter('pipX', i) as string;
          const pipY = this.getNodeParameter('pipY', i) as string;

          const mainPath = await resolveInput(inputVideo, tmpDir);
          const pipPath = await resolveInput(pipVideo, tmpDir);

          ffmpegCmd = `-y -i "${mainPath}" -i "${pipPath}" -filter_complex "[1:v]scale=${pipWidth}:-1[pip];[0:v][pip]overlay=${pipX}:${pipY}[out]" -map "[out]" -map 0:a? ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'burnText') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          const text = escapeFilterValue(this.getNodeParameter('burnText', i) as string);
          const fontSize = this.getNodeParameter('fontSize', i) as number;
          const fontColor = this.getNodeParameter('fontColor', i) as string;
          const textX = this.getNodeParameter('textX', i) as string;
          const textY = this.getNodeParameter('textY', i) as string;
          const fontFile = this.getNodeParameter('fontFile', i, '') as string;
          const boxBg = this.getNodeParameter('textBoxBackground', i) as boolean;
          const boxColor = boxBg ? this.getNodeParameter('textBoxColor', i) as string : '';

          let dtFilter = `drawtext=text='${text}':fontsize=${fontSize}:fontcolor=${fontColor}:x=${textX}:y=${textY}`;
          if (fontFile) dtFilter += `:fontfile='${escapeFilterValue(fontFile)}'`;
          if (boxBg) dtFilter += `:box=1:boxcolor=${boxColor}:boxborderw=8`;

          ffmpegCmd = `-y -i "${inputPath}" -vf "${dtFilter}" ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'addSubtitles') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const subFile = this.getNodeParameter('subtitleFile', i) as string;
          const subStyle = this.getNodeParameter('subtitleStyle', i, '') as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);

          const ext = path.extname(subFile).toLowerCase();
          let subFilter: string;
          if (ext === '.ass') {
            subFilter = `ass='${escapeFilterValue(subFile)}'`;
          } else {
            subFilter = `subtitles='${escapeFilterValue(subFile)}'`;
            if (subStyle) subFilter += `:force_style='${subStyle}'`;
          }
          ffmpegCmd = `-y -i "${inputPath}" -vf "${subFilter}" ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'compose') {
          const inputVideosRaw = this.getNodeParameter('inputVideos', i) as string;
          const videoList = inputVideosRaw.split('\n').map(v => v.trim()).filter(Boolean);
          const layout = this.getNodeParameter('composeLayout', i) as string;

          const resolvedPaths: string[] = [];
          for (const v of videoList) {
            resolvedPaths.push(await resolveInput(v, tmpDir));
          }

          const inputs = resolvedPaths.map(p => `-i "${p}"`).join(' ');
          let filterComplex: string;
          if (layout === 'hstack') {
            const streams = resolvedPaths.map((_, idx) => `[${idx}:v]`).join('');
            filterComplex = `${streams}hstack=inputs=${resolvedPaths.length}[out]`;
          } else if (layout === 'vstack') {
            const streams = resolvedPaths.map((_, idx) => `[${idx}:v]`).join('');
            filterComplex = `${streams}vstack=inputs=${resolvedPaths.length}[out]`;
          } else {
            // xstack 2x2
            filterComplex = `[0:v][1:v][2:v][3:v]xstack=inputs=4:layout=0_0|w0_0|0_h0|w0_h0[out]`;
          }
          ffmpegCmd = `-y ${inputs} -filter_complex "${filterComplex}" -map "[out]" ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'fade') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          const fadeIn = this.getNodeParameter('fadeInDuration', i) as number;
          const fadeOut = this.getNodeParameter('fadeOutDuration', i) as number;
          let totalDuration = this.getNodeParameter('videoTotalDuration', i, 0) as number;

          if (fadeOut > 0 && totalDuration === 0) {
            // Auto-detect duration
            const { stdout } = await runFfprobe(`-v quiet -show_entries format=duration -of csv=p=0 "${inputPath}"`);
            totalDuration = parseFloat(stdout.trim());
          }

          const vFilters: string[] = [];
          const aFilters: string[] = [];
          if (fadeIn > 0) {
            vFilters.push(`fade=t=in:st=0:d=${fadeIn}`);
            aFilters.push(`afade=t=in:st=0:d=${fadeIn}`);
          }
          if (fadeOut > 0 && totalDuration > 0) {
            const outStart = totalDuration - fadeOut;
            vFilters.push(`fade=t=out:st=${outStart}:d=${fadeOut}`);
            aFilters.push(`afade=t=out:st=${outStart}:d=${fadeOut}`);
          }

          const vfArg = vFilters.length > 0 ? `-vf "${vFilters.join(',')}"` : '';
          const afArg = aFilters.length > 0 ? `-af "${aFilters.join(',')}"` : '';
          ffmpegCmd = `-y -i "${inputPath}" ${vfArg} ${afArg} ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'xfade') {
          const inputVideosRaw = this.getNodeParameter('inputVideos', i, '') as string;
          // For xfade, we need exactly 2 videos
          let clip1Path: string, clip2Path: string;
          if (inputVideosRaw.trim()) {
            const vids = inputVideosRaw.split('\n').map(v => v.trim()).filter(Boolean);
            clip1Path = await resolveInput(vids[0], tmpDir);
            clip2Path = await resolveInput(vids[1], tmpDir);
          } else {
            throw new NodeOperationError(this.getNode(), 'Xfade requires exactly 2 videos in "Input Videos"', { itemIndex: i });
          }
          const effect = this.getNodeParameter('xfadeEffect', i) as string;
          const duration = this.getNodeParameter('xfadeDuration', i) as number;
          const offset = this.getNodeParameter('xfadeOffset', i) as number;
          ffmpegCmd = `-y -i "${clip1Path}" -i "${clip2Path}" -filter_complex "[0:v][1:v]xfade=transition=${effect}:duration=${duration}:offset=${offset}[out]" -map "[out]" ${vcodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'framerate') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          const fps = this.getNodeParameter('fps', i) as number;
          ffmpegCmd = `-y -i "${inputPath}" -vf fps=${fps} ${vcodecArg} ${acodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'stripMetadata') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          ffmpegCmd = `-y -i "${inputPath}" -map_metadata -1 -c:v copy -c:a copy ${extraArgs} "${outputPath}"`;

        } else if (operation === 'generateGif') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          const gifWidth = this.getNodeParameter('gifWidth', i) as number;
          const gifFps = this.getNodeParameter('gifFps', i) as number;
          const gifStart = this.getNodeParameter('gifStart', i) as string;
          const gifDuration = this.getNodeParameter('gifDuration', i) as number;
          outputPath = outputPath.replace(/\.[^.]+$/, '.gif');
          const paletteFile = path.join(tmpDir, 'palette.png');
          // Two-pass palette GIF generation for best quality
          await runFfmpeg(`-y -ss ${gifStart} -t ${gifDuration} -i "${inputPath}" -vf "fps=${gifFps},scale=${gifWidth}:-1:flags=lanczos,palettegen" "${paletteFile}"`);
          ffmpegCmd = `-y -ss ${gifStart} -t ${gifDuration} -i "${inputPath}" -i "${paletteFile}" -lavfi "fps=${gifFps},scale=${gifWidth}:-1:flags=lanczos[x];[x][1:v]paletteuse" "${outputPath}"`;

        } else if (operation === 'thumbnail') {
          const inputVideo = this.getNodeParameter('inputVideo', i) as string;
          const inputPath = await resolveInput(inputVideo, tmpDir);
          const ts = this.getNodeParameter('thumbTimestamp', i) as string;
          const tw = this.getNodeParameter('thumbWidth', i) as number;
          outputPath = outputPath.replace(/\.[^.]+$/, '.jpg');
          ffmpegCmd = `-y -ss ${ts} -i "${inputPath}" -vframes 1 -vf "scale=${tw}:-1" ${extraArgs} "${outputPath}"`;

        } else if (operation === 'slideshow') {
          const inputImagesRaw = this.getNodeParameter('inputImages', i) as string;
          const imageList = inputImagesRaw.split('\n').map(v => v.trim()).filter(Boolean);
          const slideDuration = this.getNodeParameter('slideDuration', i) as number;
          const slideshowAudio = this.getNodeParameter('slideshowAudio', i, '') as string;
          const slideW = this.getNodeParameter('slideWidth', i) as number;
          const slideH = this.getNodeParameter('slideHeight', i) as number;

          const resolvedImages: string[] = [];
          for (const img of imageList) {
            resolvedImages.push(await resolveInput(img, tmpDir));
          }

          const listFile = path.join(tmpDir, 'slide_list.txt');
          const listContent = resolvedImages.map(p => `file '${p}'\nduration ${slideDuration}`).join('\n');
          // Add last image again (ffmpeg concat demuxer quirk)
          fs.writeFileSync(listFile, listContent + `\nfile '${resolvedImages[resolvedImages.length - 1]}'`);

          let audioArg = '';
          if (slideshowAudio) {
            const audioPath = await resolveInput(slideshowAudio, tmpDir);
            audioArg = `-i "${audioPath}" -shortest`;
          }

          ffmpegCmd = `-y -f concat -safe 0 -i "${listFile}" ${audioArg} -vf "scale=${slideW}:${slideH}:force_original_aspect_ratio=decrease,pad=${slideW}:${slideH}:(ow-iw)/2:(oh-ih)/2,setsar=1" ${vcodecArg} ${audioArg ? acodecArg : '-an'} ${extraArgs} "${outputPath}"`;

        } else {
          throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
        }

        // Run FFmpeg
        await runFfmpeg(ffmpegCmd);

        // Build output item
        const newItem: INodeExecutionData = {
          json: {
            operation,
            outputPath,
            success: true,
          },
        };

        if (returnBinary && fs.existsSync(outputPath)) {
          const binData = buildBinaryData(outputPath);
          newItem.binary = {
            [binaryPropertyName]: {
              data: binData.data,
              mimeType: binData.mimeType,
              fileExtension: binData.fileExtension,
              fileName: binData.fileName,
            },
          };
          newItem.json.mimeType = binData.mimeType;
          newItem.json.fileName = binData.fileName;
        } else if (operation === 'split') {
          // For split, return list of files
          const segDir = this.getNodeParameter('segmentOutputDir', i) as string;
          const files = fs.readdirSync(segDir).filter(f => f.startsWith('segment_')).map(f => path.join(segDir, f));
          newItem.json.segments = files;
          newItem.json.segmentCount = files.length;
        }

        returnData.push(newItem);
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: (error as Error).message,
              success: false,
            },
          });
        } else {
          throw error;
        }
      } finally {
        cleanupTempDir(tmpDir);
      }
    }

    return [returnData];
  }
}
