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
} from '../../utils/ffmpeg.utils';

export class FfmpegAdvanced implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'FFmpeg Advanced',
    name: 'ffmpegAdvanced',
    icon: 'file:ffmpeg-advanced.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Advanced FFmpeg effects — LUT color grading, blur/sharpen, denoise, chroma key (green screen), vignette, HLS segmentation, stabilization.',
    defaults: {
      name: 'FFmpeg Advanced',
    },
    inputs: ['main'],
    outputs: ['main'],
    properties: [
      {
        displayName: 'Operation',
        name: 'operation',
        type: 'options',
        noDataExpression: true,
        options: [
          { name: 'Apply LUT (Color Grading)', value: 'lut', description: 'Apply a .cube LUT file for color grading' },
          { name: 'Blur Region (Mosaic/Redact)', value: 'blurRegion', description: 'Blur a rectangular region (faces, license plates, etc.)' },
          { name: 'Blur Video', value: 'blur', description: 'Apply Gaussian blur to entire video' },
          { name: 'Chroma Key (Green Screen)', value: 'chromakey', description: 'Remove green/blue screen background' },
          { name: 'Color Adjustment', value: 'colorAdjust', description: 'Adjust brightness, contrast, saturation, hue' },
          { name: 'DASH Packaging', value: 'dash', description: 'Package video for MPEG-DASH streaming (MPD manifest + segments)' },
          { name: 'Deinterlace', value: 'deinterlace', description: 'Deinterlace interlaced video (yadif filter)' },
          { name: 'Denoise Video', value: 'denoise', description: 'Reduce video noise (hqdn3d)' },
          { name: 'Draw Shapes / Boxes', value: 'drawbox', description: 'Draw rectangles or boxes on video' },
          { name: 'HLS Segmentation', value: 'hls', description: 'Segment video for HTTP Live Streaming' },
          { name: 'Ken Burns / Zoom Pan', value: 'kenburns', description: 'Animated zoom and pan effect (zoompan filter)' },
          { name: 'Sharpen Video', value: 'sharpen', description: 'Sharpen video with unsharp mask' },
          { name: 'Stabilize Video', value: 'stabilize', description: 'Smooth out camera shake (vidstab)' },
          { name: 'Time-lapse', value: 'timelapse', description: 'Create time-lapse by selecting frames at interval' },
          { name: 'Add Vignette', value: 'vignette', description: 'Add cinematic vignette effect' },
        ],
        default: 'lut',
      },

      // ─── INPUT ───────────────────────────────────────────────────────
      {
        displayName: 'Input Video',
        name: 'inputVideo',
        type: 'string',
        default: '',
        placeholder: '/path/to/video.mp4 or https://...',
      },

      // ─── OUTPUT ──────────────────────────────────────────────────────
      {
        displayName: 'Output Path',
        name: 'outputPath',
        type: 'string',
        default: '',
        placeholder: '/tmp/output.mp4 (leave empty for auto)',
      },
      {
        displayName: 'Output Format',
        name: 'outputFormat',
        type: 'options',
        options: [
          { name: 'MP4', value: 'mp4' },
          { name: 'MOV', value: 'mov' },
          { name: 'WebM', value: 'webm' },
          { name: 'MKV', value: 'mkv' },
        ],
        default: 'mp4',
        displayOptions: { hide: { operation: ['hls', 'dash'] } },
      },
      {
        displayName: 'Video Codec',
        name: 'videoCodec',
        type: 'options',
        options: [
          { name: 'H.264 (libx264)', value: 'libx264' },
          { name: 'H.265 / HEVC (libx265)', value: 'libx265' },
          { name: 'Copy (no re-encode)', value: 'copy' },
        ],
        default: 'libx264',
        displayOptions: { hide: { operation: ['hls', 'dash'] } },
      },
      {
        displayName: 'CRF Quality',
        name: 'crf',
        type: 'number',
        typeOptions: { minValue: 0, maxValue: 51 },
        default: 23,
        displayOptions: { hide: { operation: ['hls', 'dash'] } },
      },
      {
        displayName: 'Return Binary Data',
        name: 'returnBinary',
        type: 'boolean',
        default: true,
        displayOptions: { hide: { operation: ['hls', 'dash', 'stabilize'] } },
      },
      {
        displayName: 'Binary Property Name',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        displayOptions: { show: { returnBinary: [true] } },
      },

      // ─── LUT ─────────────────────────────────────────────────────────
      {
        displayName: 'LUT File Path',
        name: 'lutFile',
        type: 'string',
        default: '',
        placeholder: '/path/to/preset.cube',
        description: 'Path to a .cube LUT file for color grading',
        displayOptions: { show: { operation: ['lut'] } },
      },
      {
        displayName: 'LUT Strength (0-1)',
        name: 'lutStrength',
        type: 'number',
        typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
        default: 1.0,
        description: 'Blend LUT with original (1=full LUT, 0=original)',
        displayOptions: { show: { operation: ['lut'] } },
      },

      // ─── BLUR ─────────────────────────────────────────────────────────
      {
        displayName: 'Blur Sigma',
        name: 'blurSigma',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 20 },
        default: 2,
        description: 'Blur intensity. Higher = more blurred.',
        displayOptions: { show: { operation: ['blur'] } },
      },

      // ─── SHARPEN ──────────────────────────────────────────────────────
      {
        displayName: 'Luma Matrix Size',
        name: 'sharpenLumaX',
        type: 'number',
        default: 5,
        description: 'Luma sharpening matrix size (odd number, e.g., 3, 5, 7)',
        displayOptions: { show: { operation: ['sharpen'] } },
      },
      {
        displayName: 'Luma Strength',
        name: 'sharpenLumaAmount',
        type: 'number',
        default: 1.5,
        description: 'Luma sharpening amount. Positive=sharpen, negative=blur.',
        displayOptions: { show: { operation: ['sharpen'] } },
      },

      // ─── DENOISE ──────────────────────────────────────────────────────
      {
        displayName: 'Denoise Strength',
        name: 'denoiseStrength',
        type: 'options',
        options: [
          { name: 'Light', value: 'light' },
          { name: 'Medium', value: 'medium' },
          { name: 'Strong', value: 'strong' },
        ],
        default: 'medium',
        displayOptions: { show: { operation: ['denoise'] } },
      },

      // ─── VIGNETTE ─────────────────────────────────────────────────────
      {
        displayName: 'Vignette Angle (radians)',
        name: 'vignetteAngle',
        type: 'number',
        default: 1.0,
        description: 'Higher = stronger vignette. Try 0.5-1.5.',
        displayOptions: { show: { operation: ['vignette'] } },
      },
      {
        displayName: 'Vignette Mode',
        name: 'vignetteMode',
        type: 'options',
        options: [
          { name: 'Forward (darken edges)', value: 'forward' },
          { name: 'Backward (lighten edges)', value: 'backward' },
        ],
        default: 'forward',
        displayOptions: { show: { operation: ['vignette'] } },
      },

      // ─── CHROMA KEY ───────────────────────────────────────────────────
      {
        displayName: 'Chroma Key Color',
        name: 'chromaColor',
        type: 'string',
        default: '0x00ff00',
        description: 'Color to remove (hex). Green screen: 0x00ff00, Blue screen: 0x0000ff',
        displayOptions: { show: { operation: ['chromakey'] } },
      },
      {
        displayName: 'Similarity Threshold',
        name: 'chromaSimilarity',
        type: 'number',
        typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
        default: 0.1,
        description: 'How similar to key color to remove. 0.01=strict, 0.3=loose.',
        displayOptions: { show: { operation: ['chromakey'] } },
      },
      {
        displayName: 'Blend Amount',
        name: 'chromaBlend',
        type: 'number',
        typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
        default: 0.0,
        description: 'Edge feathering (0=hard edge)',
        displayOptions: { show: { operation: ['chromakey'] } },
      },
      {
        displayName: 'Background Video/Image (optional)',
        name: 'chromaBgFile',
        type: 'string',
        default: '',
        placeholder: '/path/to/background.mp4 or .jpg',
        description: 'Replace removed background with this video or image. Leave empty for transparent (WebM output).',
        displayOptions: { show: { operation: ['chromakey'] } },
      },

      // ─── STABILIZE ────────────────────────────────────────────────────
      {
        displayName: 'Stabilize Smoothing',
        name: 'stabilizeSmoothing',
        type: 'number',
        default: 10,
        description: 'Smoothing window in frames. Higher = smoother but may crop more.',
        displayOptions: { show: { operation: ['stabilize'] } },
      },
      {
        displayName: 'Stabilize Max Angle',
        name: 'stabilizeMaxAngle',
        type: 'number',
        default: -1,
        description: 'Max angle to correct in degrees (-1 = no limit)',
        displayOptions: { show: { operation: ['stabilize'] } },
      },

      // ─── HLS ──────────────────────────────────────────────────────────
      {
        displayName: 'HLS Segment Duration (seconds)',
        name: 'hlsTime',
        type: 'number',
        default: 6,
        displayOptions: { show: { operation: ['hls'] } },
      },
      {
        displayName: 'HLS Output Directory',
        name: 'hlsOutputDir',
        type: 'string',
        default: '/tmp/hls',
        displayOptions: { show: { operation: ['hls'] } },
      },
      {
        displayName: 'HLS Playlist Name',
        name: 'hlsPlaylistName',
        type: 'string',
        default: 'playlist.m3u8',
        displayOptions: { show: { operation: ['hls'] } },
      },

      // ─── DRAWBOX ──────────────────────────────────────────────────────
      {
        displayName: 'Box X',
        name: 'boxX',
        type: 'string',
        default: '100',
        displayOptions: { show: { operation: ['drawbox'] } },
      },
      {
        displayName: 'Box Y',
        name: 'boxY',
        type: 'string',
        default: '100',
        displayOptions: { show: { operation: ['drawbox'] } },
      },
      {
        displayName: 'Box Width',
        name: 'boxWidth',
        type: 'string',
        default: '200',
        displayOptions: { show: { operation: ['drawbox'] } },
      },
      {
        displayName: 'Box Height',
        name: 'boxHeight',
        type: 'string',
        default: '100',
        displayOptions: { show: { operation: ['drawbox'] } },
      },
      {
        displayName: 'Box Color',
        name: 'boxColor',
        type: 'string',
        default: 'red',
        description: 'Color name or hex (e.g., red, #FF0000)',
        displayOptions: { show: { operation: ['drawbox'] } },
      },
      {
        displayName: 'Box Thickness (0=filled)',
        name: 'boxThickness',
        type: 'number',
        default: 3,
        displayOptions: { show: { operation: ['drawbox'] } },
      },

      // ─── COLOR ADJUST ─────────────────────────────────────────────────
      {
        displayName: 'Brightness',
        name: 'brightness',
        type: 'number',
        typeOptions: { minValue: -1, maxValue: 1, numberPrecision: 2 },
        default: 0,
        description: '-1 to 1 (0=no change)',
        displayOptions: { show: { operation: ['colorAdjust'] } },
      },
      {
        displayName: 'Contrast',
        name: 'contrast',
        type: 'number',
        typeOptions: { minValue: -1000, maxValue: 1000, numberPrecision: 2 },
        default: 1,
        description: '-1000 to 1000 (1=no change)',
        displayOptions: { show: { operation: ['colorAdjust'] } },
      },
      {
        displayName: 'Saturation',
        name: 'saturation',
        type: 'number',
        typeOptions: { minValue: 0, maxValue: 3, numberPrecision: 2 },
        default: 1,
        description: '0=grayscale, 1=original, 3=oversaturated',
        displayOptions: { show: { operation: ['colorAdjust'] } },
      },
      {
        displayName: 'Hue Shift (degrees)',
        name: 'hue',
        type: 'number',
        typeOptions: { minValue: -360, maxValue: 360 },
        default: 0,
        displayOptions: { show: { operation: ['colorAdjust'] } },
      },
      {
        displayName: 'Gamma',
        name: 'gamma',
        type: 'number',
        typeOptions: { minValue: 0.1, maxValue: 10, numberPrecision: 2 },
        default: 1,
        displayOptions: { show: { operation: ['colorAdjust'] } },
      },

      // ─── BLUR REGION ─────────────────────────────────────────────────
      {
        displayName: 'Region X',
        name: 'blurRegionX',
        type: 'string',
        default: '100',
        description: 'X position of the region to blur',
        displayOptions: { show: { operation: ['blurRegion'] } },
      },
      {
        displayName: 'Region Y',
        name: 'blurRegionY',
        type: 'string',
        default: '100',
        description: 'Y position of the region to blur',
        displayOptions: { show: { operation: ['blurRegion'] } },
      },
      {
        displayName: 'Region Width',
        name: 'blurRegionW',
        type: 'string',
        default: '200',
        description: 'Width of the region to blur',
        displayOptions: { show: { operation: ['blurRegion'] } },
      },
      {
        displayName: 'Region Height',
        name: 'blurRegionH',
        type: 'string',
        default: '100',
        description: 'Height of the region to blur',
        displayOptions: { show: { operation: ['blurRegion'] } },
      },
      {
        displayName: 'Blur Intensity',
        name: 'blurRegionIntensity',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 50 },
        default: 10,
        description: 'Pixelation block size (higher = more blurred/pixelated)',
        displayOptions: { show: { operation: ['blurRegion'] } },
      },

      // ─── DEINTERLACE ─────────────────────────────────────────────────
      {
        displayName: 'Deinterlace Mode',
        name: 'deinterlaceMode',
        type: 'options',
        options: [
          { name: 'Send Frame (output at input fps)', value: '0' },
          { name: 'Send Field (output at 2x fps)', value: '1' },
          { name: 'Send Frame No Top (skip top field)', value: '2' },
          { name: 'Send Field No Top (skip top field, 2x)', value: '3' },
        ],
        default: '0',
        displayOptions: { show: { operation: ['deinterlace'] } },
      },
      {
        displayName: 'Deinterlace Parity',
        name: 'deinterlaceParity',
        type: 'options',
        options: [
          { name: 'Auto (detect from stream)', value: '-1' },
          { name: 'Top Field First', value: '0' },
          { name: 'Bottom Field First', value: '1' },
        ],
        default: '-1',
        displayOptions: { show: { operation: ['deinterlace'] } },
      },

      // ─── KEN BURNS ───────────────────────────────────────────────────
      {
        displayName: 'Zoom Start',
        name: 'kbZoomStart',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 3, numberPrecision: 2 },
        default: 1.0,
        description: 'Starting zoom level (1.0 = original size)',
        displayOptions: { show: { operation: ['kenburns'] } },
      },
      {
        displayName: 'Zoom End',
        name: 'kbZoomEnd',
        type: 'number',
        typeOptions: { minValue: 1, maxValue: 3, numberPrecision: 2 },
        default: 1.5,
        description: 'Ending zoom level (1.5 = 50% zoom in)',
        displayOptions: { show: { operation: ['kenburns'] } },
      },
      {
        displayName: 'Pan Direction',
        name: 'kbPanDirection',
        type: 'options',
        options: [
          { name: 'Center (no pan)', value: 'center' },
          { name: 'Left to Right', value: 'ltr' },
          { name: 'Right to Left', value: 'rtl' },
          { name: 'Top to Bottom', value: 'ttb' },
          { name: 'Bottom to Top', value: 'btt' },
          { name: 'Top-Left to Bottom-Right', value: 'tl_br' },
          { name: 'Bottom-Right to Top-Left', value: 'br_tl' },
        ],
        default: 'center',
        displayOptions: { show: { operation: ['kenburns'] } },
      },
      {
        displayName: 'Output Width',
        name: 'kbWidth',
        type: 'number',
        default: 1920,
        description: 'Output frame width in pixels',
        displayOptions: { show: { operation: ['kenburns'] } },
      },
      {
        displayName: 'Output Height',
        name: 'kbHeight',
        type: 'number',
        default: 1080,
        description: 'Output frame height in pixels',
        displayOptions: { show: { operation: ['kenburns'] } },
      },
      {
        displayName: 'Output FPS',
        name: 'kbFps',
        type: 'number',
        default: 25,
        description: 'Frames per second for output',
        displayOptions: { show: { operation: ['kenburns'] } },
      },

      // ─── TIME-LAPSE ───────────────────────────────────────────────────
      {
        displayName: 'Frame Interval (keep 1 in N frames)',
        name: 'timelapseInterval',
        type: 'number',
        typeOptions: { minValue: 2, maxValue: 1000 },
        default: 10,
        description: 'Keep 1 frame every N frames. E.g., 10 = 10x speed, 60 = 60x speed.',
        displayOptions: { show: { operation: ['timelapse'] } },
      },
      {
        displayName: 'Output FPS',
        name: 'timelapseFps',
        type: 'number',
        default: 30,
        description: 'Frame rate of the output time-lapse video',
        displayOptions: { show: { operation: ['timelapse'] } },
      },

      // ─── DASH ─────────────────────────────────────────────────────────
      {
        displayName: 'DASH Segment Duration (seconds)',
        name: 'dashSegTime',
        type: 'number',
        default: 4,
        displayOptions: { show: { operation: ['dash'] } },
      },
      {
        displayName: 'DASH Output Directory',
        name: 'dashOutputDir',
        type: 'string',
        default: '/tmp/dash',
        displayOptions: { show: { operation: ['dash'] } },
      },
      {
        displayName: 'DASH Manifest Name',
        name: 'dashManifestName',
        type: 'string',
        default: 'manifest.mpd',
        displayOptions: { show: { operation: ['dash'] } },
      },

      // ─── EXTRA ARGS ───────────────────────────────────────────────────
      {
        displayName: 'Extra FFmpeg Arguments',
        name: 'extraArgs',
        type: 'string',
        default: '',
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
        const inputVideo = this.getNodeParameter('inputVideo', i) as string;
        const outputFormat = this.getNodeParameter('outputFormat', i, 'mp4') as string;
        const returnBinary = this.getNodeParameter('returnBinary', i, true) as boolean;
        const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i, 'data') as string;
        const extraArgs = this.getNodeParameter('extraArgs', i, '') as string;
        const videoCodec = this.getNodeParameter('videoCodec', i, 'libx264') as string;
        const crf = this.getNodeParameter('crf', i, 23) as number;

        let outputPath = this.getNodeParameter('outputPath', i, '') as string;
        if (!outputPath) {
          outputPath = path.join(tmpDir, `output.${outputFormat}`);
        }

        const inputPath = await resolveInput(inputVideo, tmpDir);
        const vcodecArg = videoCodec === 'copy' ? '-vcodec copy' : `-vcodec ${videoCodec} -crf ${crf}`;

        let ffmpegCmd = '';

        if (operation === 'lut') {
          const lutFile = this.getNodeParameter('lutFile', i) as string;
          const strength = this.getNodeParameter('lutStrength', i) as number;
          if (strength < 1.0) {
            // Blend original with LUT-applied
            ffmpegCmd = `-y -i "${inputPath}" -vf "lut3d='${lutFile}',blend=all_mode=normal:all_opacity=${strength}" ${vcodecArg} -acodec copy ${extraArgs} "${outputPath}"`;
          } else {
            ffmpegCmd = `-y -i "${inputPath}" -vf "lut3d='${lutFile}'" ${vcodecArg} -acodec copy ${extraArgs} "${outputPath}"`;
          }

        } else if (operation === 'blur') {
          const sigma = this.getNodeParameter('blurSigma', i) as number;
          ffmpegCmd = `-y -i "${inputPath}" -vf "gblur=sigma=${sigma}" ${vcodecArg} -acodec copy ${extraArgs} "${outputPath}"`;

        } else if (operation === 'sharpen') {
          const lumaX = this.getNodeParameter('sharpenLumaX', i) as number;
          const lumaAmt = this.getNodeParameter('sharpenLumaAmount', i) as number;
          const lumaXOdd = lumaX % 2 === 0 ? lumaX + 1 : lumaX;
          ffmpegCmd = `-y -i "${inputPath}" -vf "unsharp=${lumaXOdd}:${lumaXOdd}:${lumaAmt}:3:3:0" ${vcodecArg} -acodec copy ${extraArgs} "${outputPath}"`;

        } else if (operation === 'denoise') {
          const strength = this.getNodeParameter('denoiseStrength', i) as string;
          let hqdn3dArgs = '';
          if (strength === 'light') hqdn3dArgs = 'hqdn3d=2:1:2:3';
          else if (strength === 'medium') hqdn3dArgs = 'hqdn3d=4:3:6:4.5';
          else hqdn3dArgs = 'hqdn3d=8:6:12:9';
          ffmpegCmd = `-y -i "${inputPath}" -vf "${hqdn3dArgs}" ${vcodecArg} -acodec copy ${extraArgs} "${outputPath}"`;

        } else if (operation === 'vignette') {
          const angle = this.getNodeParameter('vignetteAngle', i) as number;
          const mode = this.getNodeParameter('vignetteMode', i) as string;
          const modeVal = mode === 'forward' ? 0 : 1;
          ffmpegCmd = `-y -i "${inputPath}" -vf "vignette=angle=${angle}:mode=${modeVal}" ${vcodecArg} -acodec copy ${extraArgs} "${outputPath}"`;

        } else if (operation === 'chromakey') {
          const color = this.getNodeParameter('chromaColor', i) as string;
          const similarity = this.getNodeParameter('chromaSimilarity', i) as number;
          const blend = this.getNodeParameter('chromaBlend', i) as number;
          const bgFile = this.getNodeParameter('chromaBgFile', i, '') as string;

          if (bgFile) {
            const bgPath = await resolveInput(bgFile, tmpDir);
            const chromaFilter = `chromakey=${color}:${similarity}:${blend}`;
            ffmpegCmd = `-y -i "${bgPath}" -i "${inputPath}" -filter_complex "[1:v]${chromaFilter}[fg];[0:v][fg]overlay[out]" -map "[out]" -map 1:a? ${vcodecArg} -acodec aac ${extraArgs} "${outputPath}"`;
          } else {
            // Transparent output (WebM/RGBA)
            const webmOut = outputPath.replace(/\.[^.]+$/, '.webm');
            outputPath = webmOut;
            ffmpegCmd = `-y -i "${inputPath}" -vf "chromakey=${color}:${similarity}:${blend}" -vcodec libvpx-vp9 -pix_fmt yuva420p -an ${extraArgs} "${outputPath}"`;
          }

        } else if (operation === 'stabilize') {
          const smoothing = this.getNodeParameter('stabilizeSmoothing', i) as number;
          const maxAngle = this.getNodeParameter('stabilizeMaxAngle', i) as number;
          const transformsFile = path.join(tmpDir, 'transforms.trf');
          const maxAngleArg = maxAngle >= 0 ? `:maxangle=${maxAngle * Math.PI / 180}` : '';

          // Pass 1: detect
          await runFfmpeg(`-y -i "${inputPath}" -vf "vidstabdetect=shakiness=5:accuracy=15:result='${transformsFile}'" -f null /dev/null`);
          // Pass 2: transform
          ffmpegCmd = `-y -i "${inputPath}" -vf "vidstabtransform=input='${transformsFile}':smoothing=${smoothing}${maxAngleArg},unsharp=5:5:0.8:3:3:0.4" ${vcodecArg} -acodec copy ${extraArgs} "${outputPath}"`;

        } else if (operation === 'hls') {
          const hlsTime = this.getNodeParameter('hlsTime', i) as number;
          const hlsDir = this.getNodeParameter('hlsOutputDir', i) as string;
          const playlistName = this.getNodeParameter('hlsPlaylistName', i) as string;
          fs.mkdirSync(hlsDir, { recursive: true });
          const playlistPath = path.join(hlsDir, playlistName);
          const segPattern = path.join(hlsDir, 'segment_%03d.ts');
          ffmpegCmd = `-y -i "${inputPath}" -codec: copy -start_number 0 -hls_time ${hlsTime} -hls_list_size 0 -hls_segment_filename "${segPattern}" -f hls ${extraArgs} "${playlistPath}"`;

        } else if (operation === 'drawbox') {
          const bx = this.getNodeParameter('boxX', i) as string;
          const by = this.getNodeParameter('boxY', i) as string;
          const bw = this.getNodeParameter('boxWidth', i) as string;
          const bh = this.getNodeParameter('boxHeight', i) as string;
          const bc = this.getNodeParameter('boxColor', i) as string;
          const bt = this.getNodeParameter('boxThickness', i) as number;
          const thickness = bt === 0 ? 'fill' : String(bt);
          ffmpegCmd = `-y -i "${inputPath}" -vf "drawbox=x=${bx}:y=${by}:w=${bw}:h=${bh}:color=${bc}:t=${thickness}" ${vcodecArg} -acodec copy ${extraArgs} "${outputPath}"`;

        } else if (operation === 'colorAdjust') {
          const brightness = this.getNodeParameter('brightness', i) as number;
          const contrast = this.getNodeParameter('contrast', i) as number;
          const saturation = this.getNodeParameter('saturation', i) as number;
          const hue = this.getNodeParameter('hue', i) as number;
          const gamma = this.getNodeParameter('gamma', i) as number;
          const eqFilter = `eq=brightness=${brightness}:contrast=${contrast}:saturation=${saturation}:gamma=${gamma}`;
          const hueFilter = hue !== 0 ? `,hue=h=${hue}` : '';
          ffmpegCmd = `-y -i "${inputPath}" -vf "${eqFilter}${hueFilter}" ${vcodecArg} -acodec copy ${extraArgs} "${outputPath}"`;

        } else if (operation === 'blurRegion') {
          const rx = this.getNodeParameter('blurRegionX', i) as string;
          const ry = this.getNodeParameter('blurRegionY', i) as string;
          const rw = this.getNodeParameter('blurRegionW', i) as string;
          const rh = this.getNodeParameter('blurRegionH', i) as string;
          const intensity = this.getNodeParameter('blurRegionIntensity', i) as number;
          // Pixelate the region: scale down to 1/intensity then back up
          const blurFilter = `[0:v]crop=${rw}:${rh}:${rx}:${ry},scale=iw/${intensity}:ih/${intensity},scale=${rw}:${rh}:flags=neighbor[blurred];[0:v][blurred]overlay=${rx}:${ry}`;
          ffmpegCmd = `-y -i "${inputPath}" -filter_complex "${blurFilter}" ${vcodecArg} -acodec copy ${extraArgs} "${outputPath}"`;

        } else if (operation === 'deinterlace') {
          const deMode = this.getNodeParameter('deinterlaceMode', i) as string;
          const deParity = this.getNodeParameter('deinterlaceParity', i) as string;
          ffmpegCmd = `-y -i "${inputPath}" -vf "yadif=mode=${deMode}:parity=${deParity}" ${vcodecArg} -acodec copy ${extraArgs} "${outputPath}"`;

        } else if (operation === 'kenburns') {
          const zoomStart = this.getNodeParameter('kbZoomStart', i) as number;
          const zoomEnd = this.getNodeParameter('kbZoomEnd', i) as number;
          const panDir = this.getNodeParameter('kbPanDirection', i) as string;
          const kbW = this.getNodeParameter('kbWidth', i) as number;
          const kbH = this.getNodeParameter('kbHeight', i) as number;
          const kbFps = this.getNodeParameter('kbFps', i) as number;

          // Build zoompan x/y expressions based on direction
          let xExpr = 'iw/2-(iw/zoom/2)';
          let yExpr = 'ih/2-(ih/zoom/2)';
          if (panDir === 'ltr') { xExpr = 'on/(in-1)*(iw-iw/zoom)'; yExpr = 'ih/2-(ih/zoom/2)'; }
          else if (panDir === 'rtl') { xExpr = '(1-on/(in-1))*(iw-iw/zoom)'; yExpr = 'ih/2-(ih/zoom/2)'; }
          else if (panDir === 'ttb') { xExpr = 'iw/2-(iw/zoom/2)'; yExpr = 'on/(in-1)*(ih-ih/zoom)'; }
          else if (panDir === 'btt') { xExpr = 'iw/2-(iw/zoom/2)'; yExpr = '(1-on/(in-1))*(ih-ih/zoom)'; }
          else if (panDir === 'tl_br') { xExpr = 'on/(in-1)*(iw-iw/zoom)'; yExpr = 'on/(in-1)*(ih-ih/zoom)'; }
          else if (panDir === 'br_tl') { xExpr = '(1-on/(in-1))*(iw-iw/zoom)'; yExpr = '(1-on/(in-1))*(ih-ih/zoom)'; }

          const zoomExpr = `${zoomStart}+on*(${(zoomEnd - zoomStart).toFixed(4)}/in)`;
          const zoompanFilter = `zoompan=z='${zoomExpr}':x='${xExpr}':y='${yExpr}':d=in:s=${kbW}x${kbH}:fps=${kbFps}`;
          ffmpegCmd = `-y -i "${inputPath}" -vf "${zoompanFilter}" ${vcodecArg} -acodec copy ${extraArgs} "${outputPath}"`;

        } else if (operation === 'timelapse') {
          const interval = this.getNodeParameter('timelapseInterval', i) as number;
          const tlFps = this.getNodeParameter('timelapseFps', i) as number;
          // select every Nth frame and set output fps
          ffmpegCmd = `-y -i "${inputPath}" -vf "select='not(mod(n\\,${interval}))',setpts=N/FRAME_RATE/TB" -r ${tlFps} -an ${vcodecArg} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'dash') {
          const dashSegTime = this.getNodeParameter('dashSegTime', i) as number;
          const dashDir = this.getNodeParameter('dashOutputDir', i) as string;
          const dashManifest = this.getNodeParameter('dashManifestName', i) as string;
          fs.mkdirSync(dashDir, { recursive: true });
          const manifestPath = path.join(dashDir, dashManifest);
          const segPattern = path.join(dashDir, 'seg_$RepresentationID$_$Number%05d$.m4s');
          const initPattern = path.join(dashDir, 'init_$RepresentationID$.mp4');
          ffmpegCmd = `-y -i "${inputPath}" -c:v libx264 -c:a aac -b:a 128k -seg_duration ${dashSegTime} -use_template 1 -use_timeline 1 -init_seg_name "${path.basename(initPattern)}" -media_seg_name "${path.basename(segPattern)}" -adaptation_sets "id=0,streams=v id=1,streams=a" ${extraArgs} -f dash "${manifestPath}"`;

        } else {
          throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
        }

        await runFfmpeg(ffmpegCmd);

        const newItem: INodeExecutionData = {
          json: { operation, outputPath, success: true },
        };

        if (operation === 'hls') {
          const hlsDir = this.getNodeParameter('hlsOutputDir', i) as string;
          const files = fs.readdirSync(hlsDir).map(f => path.join(hlsDir, f));
          newItem.json.hlsDir = hlsDir;
          newItem.json.files = files;
        } else if (operation === 'dash') {
          const dashDir = this.getNodeParameter('dashOutputDir', i) as string;
          const dashManifest = this.getNodeParameter('dashManifestName', i) as string;
          const files = fs.readdirSync(dashDir).map(f => path.join(dashDir, f));
          newItem.json.dashDir = dashDir;
          newItem.json.manifestPath = path.join(dashDir, dashManifest);
          newItem.json.files = files;
          newItem.json.segmentCount = files.filter(f => f.endsWith('.m4s')).length;
        } else if (returnBinary && fs.existsSync(outputPath)) {
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
        }

        returnData.push(newItem);
      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({ json: { error: (error as Error).message, success: false } });
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
