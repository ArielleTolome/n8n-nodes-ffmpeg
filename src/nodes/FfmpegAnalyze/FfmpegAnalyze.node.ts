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
  validateFfprobe,
  resolveInput,
  createTempDir,
  cleanupTempDir,
  buildBinaryData,
  runFfmpeg,
  runFfprobe,
  execAsync,
} from '../../utils/ffmpeg.utils';

export class FfmpegAnalyze implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'FFmpeg Analyze',
    name: 'ffmpegAnalyze',
    icon: 'file:ffmpeg-analyze.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Analyze media with FFmpeg — metadata, extract frames, detect scenes, waveform, silence, loudness.',
    defaults: {
      name: 'FFmpeg Analyze',
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
          { name: 'Get Metadata', value: 'metadata', description: 'Get full media metadata (codec, fps, resolution, duration, bitrate)' },
          { name: 'Extract Frames', value: 'extractFrames', description: 'Extract frames at interval, timestamp, or range' },
          { name: 'Extract Nth Frame', value: 'extractNthFrame', description: 'Extract every Nth frame' },
          { name: 'Extract Subtitle Track', value: 'extractSubtitle', description: 'Extract embedded subtitle stream to .srt or .ass file' },
          { name: 'Detect Scene Changes', value: 'sceneDetect', description: 'Detect scene transitions (timestamps)' },
          { name: 'Detect Silence', value: 'silenceDetect', description: 'Find silent sections in audio' },
          { name: 'Get Loudness Stats', value: 'loudnessStats', description: 'EBU R128 loudness analysis' },
          { name: 'Get Waveform Data', value: 'waveformData', description: 'Extract waveform amplitude JSON' },
          { name: 'Generate Waveform Video', value: 'waveformVideo', description: 'Render audio waveform as a video (showwaves filter)' },
          { name: 'Generate Sprite Sheet', value: 'spriteSheet', description: 'Generate video preview sprite sheet' },
        ],
        default: 'metadata',
      },

      // ─── INPUT ───────────────────────────────────────────────────────
      {
        displayName: 'Input File',
        name: 'inputFile',
        type: 'string',
        default: '',
        placeholder: '/path/to/video.mp4 or https://...',
        description: 'Path or URL to input media file',
      },

      // ─── EXTRACT FRAMES ──────────────────────────────────────────────
      {
        displayName: 'Frame Extraction Mode',
        name: 'frameMode',
        type: 'options',
        options: [
          { name: 'Every N Seconds', value: 'interval' },
          { name: 'At Specific Timestamp', value: 'timestamp' },
          { name: 'Time Range', value: 'range' },
          { name: 'Every Nth Frame', value: 'nth' },
        ],
        default: 'interval',
        displayOptions: { show: { operation: ['extractFrames'] } },
      },
      {
        displayName: 'Interval (seconds)',
        name: 'frameInterval',
        type: 'number',
        default: 1.0,
        displayOptions: { show: { operation: ['extractFrames'], frameMode: ['interval'] } },
      },
      {
        displayName: 'Timestamp',
        name: 'frameTimestamp',
        type: 'string',
        default: '00:00:01',
        displayOptions: { show: { operation: ['extractFrames'], frameMode: ['timestamp'] } },
      },
      {
        displayName: 'Start Time',
        name: 'frameRangeStart',
        type: 'string',
        default: '0',
        displayOptions: { show: { operation: ['extractFrames'], frameMode: ['range'] } },
      },
      {
        displayName: 'End Time',
        name: 'frameRangeEnd',
        type: 'string',
        default: '10',
        displayOptions: { show: { operation: ['extractFrames'], frameMode: ['range'] } },
      },
      {
        displayName: 'N (every Nth frame)',
        name: 'frameNth',
        type: 'number',
        default: 30,
        displayOptions: {
          show: {
            operation: ['extractNthFrame'],
          },
        },
      },
      {
        displayName: 'N (every Nth frame)',
        name: 'frameNthInterval',
        type: 'number',
        default: 30,
        displayOptions: {
          show: {
            operation: ['extractFrames'],
            frameMode: ['nth'],
          },
        },
      },
      {
        displayName: 'Frame Width',
        name: 'frameWidth',
        type: 'number',
        default: 1280,
        description: 'Scale extracted frames to this width (0 = no scaling)',
        displayOptions: { show: { operation: ['extractFrames', 'extractNthFrame'] } },
      },
      {
        displayName: 'Max Frames',
        name: 'maxFrames',
        type: 'number',
        default: 0,
        description: '0 = no limit',
        displayOptions: { show: { operation: ['extractFrames', 'extractNthFrame'] } },
      },
      {
        displayName: 'Output Directory',
        name: 'framesOutputDir',
        type: 'string',
        default: '/tmp/frames',
        displayOptions: { show: { operation: ['extractFrames', 'extractNthFrame'] } },
      },

      // ─── SCENE DETECT ────────────────────────────────────────────────
      {
        displayName: 'Scene Change Threshold',
        name: 'sceneThreshold',
        type: 'number',
        typeOptions: { minValue: 0, maxValue: 1, numberPrecision: 2 },
        default: 0.4,
        description: 'Sensitivity: 0=detect all, 1=detect nothing. 0.3-0.5 is typical.',
        displayOptions: { show: { operation: ['sceneDetect'] } },
      },

      // ─── SILENCE DETECT ──────────────────────────────────────────────
      {
        displayName: 'Silence Threshold (dB)',
        name: 'silenceThreshold',
        type: 'number',
        default: -40,
        description: 'Noise level threshold in dB. More negative = only detect very quiet silence.',
        displayOptions: { show: { operation: ['silenceDetect'] } },
      },
      {
        displayName: 'Minimum Silence Duration (seconds)',
        name: 'silenceMinDuration',
        type: 'number',
        default: 0.5,
        displayOptions: { show: { operation: ['silenceDetect'] } },
      },

      // ─── WAVEFORM ─────────────────────────────────────────────────────
      {
        displayName: 'Waveform Sample Rate (Hz)',
        name: 'waveformSampleRate',
        type: 'number',
        default: 100,
        description: 'Samples per second. Higher = more detail, more data.',
        displayOptions: { show: { operation: ['waveformData'] } },
      },

      // ─── SPRITE SHEET ─────────────────────────────────────────────────
      {
        displayName: 'Sprite Interval (seconds)',
        name: 'spriteInterval',
        type: 'number',
        default: 10,
        displayOptions: { show: { operation: ['spriteSheet'] } },
      },
      {
        displayName: 'Sprite Tile Width',
        name: 'spriteWidth',
        type: 'number',
        default: 160,
        displayOptions: { show: { operation: ['spriteSheet'] } },
      },
      {
        displayName: 'Sprite Tile Height',
        name: 'spriteHeight',
        type: 'number',
        default: 90,
        displayOptions: { show: { operation: ['spriteSheet'] } },
      },
      {
        displayName: 'Sprite Columns',
        name: 'spriteCols',
        type: 'number',
        default: 10,
        displayOptions: { show: { operation: ['spriteSheet'] } },
      },
      {
        displayName: 'Sprite Output Path',
        name: 'spriteOutputPath',
        type: 'string',
        default: '',
        placeholder: '/tmp/sprite.jpg (leave empty for auto)',
        displayOptions: { show: { operation: ['spriteSheet'] } },
      },

      // ─── EXTRACT SUBTITLE ────────────────────────────────────────────
      {
        displayName: 'Subtitle Track Index',
        name: 'subtitleTrackIndex',
        type: 'number',
        default: 0,
        description: 'Stream index of the subtitle track (0 = first subtitle stream)',
        displayOptions: { show: { operation: ['extractSubtitle'] } },
      },
      {
        displayName: 'Subtitle Output Format',
        name: 'subtitleFormat',
        type: 'options',
        options: [
          { name: 'SRT (SubRip)', value: 'srt' },
          { name: 'ASS/SSA (Advanced SubStation)', value: 'ass' },
          { name: 'WebVTT', value: 'vtt' },
        ],
        default: 'srt',
        displayOptions: { show: { operation: ['extractSubtitle'] } },
      },
      {
        displayName: 'Subtitle Output Path',
        name: 'subtitleOutputPath',
        type: 'string',
        default: '',
        placeholder: '/tmp/subtitles.srt (leave empty for auto)',
        displayOptions: { show: { operation: ['extractSubtitle'] } },
      },

      // ─── WAVEFORM VIDEO ───────────────────────────────────────────────
      {
        displayName: 'Waveform Width',
        name: 'waveformWidth',
        type: 'number',
        default: 1280,
        description: 'Width of the waveform video in pixels',
        displayOptions: { show: { operation: ['waveformVideo'] } },
      },
      {
        displayName: 'Waveform Height',
        name: 'waveformHeight',
        type: 'number',
        default: 360,
        description: 'Height of the waveform video in pixels',
        displayOptions: { show: { operation: ['waveformVideo'] } },
      },
      {
        displayName: 'Waveform Style',
        name: 'waveformStyle',
        type: 'options',
        options: [
          { name: 'Point', value: 'point' },
          { name: 'Line', value: 'line' },
          { name: 'P2P (Peak to Peak)', value: 'p2p' },
          { name: 'Centered', value: 'cline' },
        ],
        default: 'line',
        displayOptions: { show: { operation: ['waveformVideo'] } },
      },
      {
        displayName: 'Waveform Color',
        name: 'waveformColor',
        type: 'string',
        default: '#00ff88',
        placeholder: '#00ff88 or lime',
        description: 'Color of the waveform line (hex or color name)',
        displayOptions: { show: { operation: ['waveformVideo'] } },
      },
      {
        displayName: 'Background Color',
        name: 'waveformBgColor',
        type: 'string',
        default: '#000000',
        description: 'Background color (hex or color name)',
        displayOptions: { show: { operation: ['waveformVideo'] } },
      },
      {
        displayName: 'Waveform Output Path',
        name: 'waveformVideoOutputPath',
        type: 'string',
        default: '',
        placeholder: '/tmp/waveform.mp4 (leave empty for auto)',
        displayOptions: { show: { operation: ['waveformVideo'] } },
      },

      {
        displayName: 'Return Binary Data',
        name: 'returnBinary',
        type: 'boolean',
        default: false,
        description: 'Return sprite sheet / frames as binary (for extract operations)',
      },
      {
        displayName: 'Binary Property Name',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        displayOptions: { show: { returnBinary: [true] } },
      },

      // ─── TIMEOUT ──────────────────────────────────────────────────────
      {
        displayName: 'Timeout (seconds)',
        name: 'timeoutSeconds',
        type: 'number',
        default: 300,
        description: 'Maximum time to wait for FFmpeg to complete. Increase for large files.',
      },
    ],
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    await validateFfmpeg();
    await validateFfprobe();

    for (let i = 0; i < items.length; i++) {
      const tmpDir = createTempDir();
      try {
        const operation = this.getNodeParameter('operation', i) as string;
        const inputFile = this.getNodeParameter('inputFile', i) as string;
        const returnBinary = this.getNodeParameter('returnBinary', i, false) as boolean;
        const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i, 'data') as string;

        const inputPath = await resolveInput(inputFile, tmpDir);

        if (operation === 'metadata') {
          const { stdout } = await runFfprobe(
            `-v quiet -print_format json -show_format -show_streams "${inputPath}"`
          );
          const meta = JSON.parse(stdout);
          const videoStream = meta.streams?.find((s: { codec_type: string }) => s.codec_type === 'video');
          const audioStream = meta.streams?.find((s: { codec_type: string }) => s.codec_type === 'audio');

          returnData.push({
            json: {
              operation: 'metadata',
              duration: parseFloat(meta.format?.duration || '0'),
              durationFormatted: formatDuration(parseFloat(meta.format?.duration || '0')),
              size: parseInt(meta.format?.size || '0'),
              bitrate: parseInt(meta.format?.bit_rate || '0'),
              format: meta.format?.format_name,
              video: videoStream ? {
                codec: videoStream.codec_name,
                width: videoStream.width,
                height: videoStream.height,
                fps: evalFraction(videoStream.r_frame_rate),
                avgFps: evalFraction(videoStream.avg_frame_rate),
                pixelFormat: videoStream.pix_fmt,
                bitrate: parseInt(videoStream.bit_rate || '0'),
                profile: videoStream.profile,
                level: videoStream.level,
                colorSpace: videoStream.color_space,
                aspectRatio: videoStream.display_aspect_ratio,
              } : null,
              audio: audioStream ? {
                codec: audioStream.codec_name,
                sampleRate: parseInt(audioStream.sample_rate || '0'),
                channels: audioStream.channels,
                channelLayout: audioStream.channel_layout,
                bitrate: parseInt(audioStream.bit_rate || '0'),
              } : null,
              raw: meta,
            },
          });

        } else if (operation === 'extractFrames') {
          const frameMode = this.getNodeParameter('frameMode', i) as string;
          const frameWidth = this.getNodeParameter('frameWidth', i) as number;
          const maxFrames = this.getNodeParameter('maxFrames', i) as number;
          const outDir = this.getNodeParameter('framesOutputDir', i) as string;
          fs.mkdirSync(outDir, { recursive: true });

          let vfFilter = '';
          let ssArg = '';
          let toArg = '';

          if (frameMode === 'interval') {
            const interval = this.getNodeParameter('frameInterval', i) as number;
            vfFilter = `fps=1/${interval}`;
          } else if (frameMode === 'timestamp') {
            const ts = this.getNodeParameter('frameTimestamp', i) as string;
            ssArg = `-ss ${ts}`;
            toArg = `-vframes 1`;
            vfFilter = '';
          } else if (frameMode === 'range') {
            const start = this.getNodeParameter('frameRangeStart', i) as string;
            const end = this.getNodeParameter('frameRangeEnd', i) as string;
            ssArg = `-ss ${start}`;
            toArg = `-to ${end}`;
            vfFilter = 'fps=1';
          } else if (frameMode === 'nth') {
            const nth = this.getNodeParameter('frameNthInterval', i) as number;
            vfFilter = `select='not(mod(n\\,${nth}))',setpts=N/FRAME_RATE/TB`;
          }

          const scaleFilter = frameWidth > 0 ? `scale=${frameWidth}:-1` : '';
          const combinedFilter = [vfFilter, scaleFilter].filter(Boolean).join(',');
          const vfArg = combinedFilter ? `-vf "${combinedFilter}"` : '';
          const maxArg = maxFrames > 0 ? `-vframes ${maxFrames}` : '';
          const outPattern = path.join(outDir, 'frame_%06d.jpg');

          await runFfmpeg(`-y ${ssArg} -i "${inputPath}" ${toArg} ${vfArg} ${maxArg} -q:v 2 "${outPattern}"`);

          const files = fs.readdirSync(outDir)
            .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
            .sort()
            .map(f => path.join(outDir, f));

          const newItem: INodeExecutionData = {
            json: { operation: 'extractFrames', frameCount: files.length, outputDir: outDir, files },
          };

          if (returnBinary && files.length > 0) {
            const binData = buildBinaryData(files[0]);
            newItem.binary = {
              [binaryPropertyName]: {
                data: binData.data,
                mimeType: binData.mimeType,
                fileExtension: binData.fileExtension,
                fileName: binData.fileName,
              },
            };
          }
          returnData.push(newItem);

        } else if (operation === 'extractNthFrame') {
          const nth = this.getNodeParameter('frameNth', i) as number;
          const frameWidth = this.getNodeParameter('frameWidth', i) as number;
          const maxFrames = this.getNodeParameter('maxFrames', i) as number;
          const outDir = this.getNodeParameter('framesOutputDir', i) as string;
          fs.mkdirSync(outDir, { recursive: true });

          const scaleFilter = frameWidth > 0 ? `,scale=${frameWidth}:-1` : '';
          const maxArg = maxFrames > 0 ? `-vframes ${maxFrames}` : '';
          const outPattern = path.join(outDir, 'frame_%06d.jpg');
          await runFfmpeg(`-y -i "${inputPath}" -vf "select='not(mod(n\\,${nth}))',setpts=N/FRAME_RATE/TB${scaleFilter}" ${maxArg} -q:v 2 "${outPattern}"`);

          const files = fs.readdirSync(outDir)
            .filter(f => f.startsWith('frame_') && f.endsWith('.jpg'))
            .sort()
            .map(f => path.join(outDir, f));

          returnData.push({
            json: { operation: 'extractNthFrame', frameCount: files.length, outputDir: outDir, files, nth },
          });

        } else if (operation === 'sceneDetect') {
          const threshold = this.getNodeParameter('sceneThreshold', i) as number;
          const logFile = path.join(tmpDir, 'scenes.txt');

          try {
            await runFfmpeg(`-y -i "${inputPath}" -vf "scdet=threshold=${threshold * 100},metadata=mode=print:file=${logFile}" -f null /dev/null`);
          } catch {
            // FFmpeg returns non-zero when output is /dev/null, but data is in logFile
          }

          const scenes: Array<{ timestamp: number; score: number }> = [];
          if (fs.existsSync(logFile)) {
            const content = fs.readFileSync(logFile, 'utf-8');
            const lines = content.split('\n');
            for (const line of lines) {
              const ptsMatch = line.match(/pts_time:([0-9.]+)/);
              const scoreMatch = line.match(/lavfi\.scd\.score:([0-9.]+)/);
              if (ptsMatch && scoreMatch) {
                scenes.push({
                  timestamp: parseFloat(ptsMatch[1]),
                  score: parseFloat(scoreMatch[1]),
                });
              }
            }
          }

          // Alternative: use ffprobe with scene filter output
          if (scenes.length === 0) {
            try {
              const { stderr } = await runFfmpeg(`-y -i "${inputPath}" -vf "select='gt(scene,${threshold})',showinfo" -f null /dev/null`);
              const ptsTimes = [...stderr.matchAll(/pts_time:([0-9.]+)/g)];
              ptsTimes.forEach(m => scenes.push({ timestamp: parseFloat(m[1]), score: threshold }));
            } catch {
              // best effort
            }
          }

          returnData.push({
            json: { operation: 'sceneDetect', threshold, sceneCount: scenes.length, scenes },
          });

        } else if (operation === 'silenceDetect') {
          const threshold = this.getNodeParameter('silenceThreshold', i) as number;
          const minDuration = this.getNodeParameter('silenceMinDuration', i) as number;

          let stderr = '';
          try {
            const result = await execAsync(
              `ffmpeg -i "${inputPath}" -af "silencedetect=n=${threshold}dB:d=${minDuration}" -f null /dev/null 2>&1`
            );
            stderr = result.stdout + result.stderr;
          } catch (e: unknown) {
            stderr = (e as { stderr?: string; stdout?: string }).stderr || (e as { stdout?: string }).stdout || '';
          }

          const silenceSegments: Array<{ start: number; end: number; duration: number }> = [];
          const startMatches = [...stderr.matchAll(/silence_start: ([0-9.]+)/g)];
          const endMatches = [...stderr.matchAll(/silence_end: ([0-9.]+)/g)];

          startMatches.forEach((m, idx) => {
            const start = parseFloat(m[1]);
            const end = endMatches[idx] ? parseFloat(endMatches[idx][1]) : -1;
            silenceSegments.push({ start, end, duration: end >= 0 ? end - start : -1 });
          });

          returnData.push({
            json: {
              operation: 'silenceDetect',
              threshold,
              minDuration,
              silenceCount: silenceSegments.length,
              silenceSegments,
            },
          });

        } else if (operation === 'loudnessStats') {
          let stderr = '';
          try {
            const result = await execAsync(
              `ffmpeg -i "${inputPath}" -af loudnorm=I=-16:TP=-1.5:LRA=11:print_format=json -f null /dev/null 2>&1`
            );
            stderr = result.stdout + result.stderr;
          } catch (e: unknown) {
            stderr = (e as { stderr?: string }).stderr || (e as { stdout?: string }).stdout || '';
          }

          const jsonMatch = stderr.match(/\{[\s\S]*"input_i"[\s\S]*\}/);
          let loudnessData: Record<string, unknown> = {};
          if (jsonMatch) {
            try {
              loudnessData = JSON.parse(jsonMatch[0]);
            } catch {
              loudnessData = { raw: jsonMatch[0] };
            }
          }

          // Also get volumedetect stats
          let volStderr = '';
          try {
            const vr = await execAsync(`ffmpeg -i "${inputPath}" -af volumedetect -f null /dev/null 2>&1`);
            volStderr = vr.stdout + vr.stderr;
          } catch (e: unknown) {
            volStderr = (e as { stderr?: string }).stderr || '';
          }

          const meanMatch = volStderr.match(/mean_volume: ([0-9.-]+) dB/);
          const maxMatch = volStderr.match(/max_volume: ([0-9.-]+) dB/);

          returnData.push({
            json: {
              operation: 'loudnessStats',
              loudnorm: loudnessData,
              volumeDetect: {
                meanVolume: meanMatch ? parseFloat(meanMatch[1]) : null,
                maxVolume: maxMatch ? parseFloat(maxMatch[1]) : null,
              },
            },
          });

        } else if (operation === 'waveformData') {
          const sampleRate = this.getNodeParameter('waveformSampleRate', i) as number;
          const waveformFile = path.join(tmpDir, 'waveform.json');

          // Extract PCM samples and compute RMS amplitudes
          const pcmFile = path.join(tmpDir, 'audio.pcm');
          await runFfmpeg(`-y -i "${inputPath}" -vn -acodec pcm_s16le -ar ${sampleRate} -ac 1 -f s16le "${pcmFile}"`);

          const buffer = fs.readFileSync(pcmFile);
          const samples: number[] = [];
          for (let j = 0; j < buffer.length - 1; j += 2) {
            const sample = buffer.readInt16LE(j);
            samples.push(sample / 32768.0);
          }

          const waveformData = { sampleRate, samples, sampleCount: samples.length };
          fs.writeFileSync(waveformFile, JSON.stringify(waveformData));

          const newItem: INodeExecutionData = {
            json: {
              operation: 'waveformData',
              sampleRate,
              sampleCount: samples.length,
              duration: samples.length / sampleRate,
              samples: samples.slice(0, 1000), // Return first 1000 for JSON, full in file
              waveformFile,
            },
          };

          if (returnBinary) {
            const binData = buildBinaryData(waveformFile);
            newItem.binary = {
              [binaryPropertyName]: {
                data: binData.data,
                mimeType: 'application/json',
                fileExtension: 'json',
                fileName: 'waveform.json',
              },
            };
          }
          returnData.push(newItem);

        } else if (operation === 'spriteSheet') {
          const interval = this.getNodeParameter('spriteInterval', i) as number;
          const tileW = this.getNodeParameter('spriteWidth', i) as number;
          const tileH = this.getNodeParameter('spriteHeight', i) as number;
          const cols = this.getNodeParameter('spriteCols', i) as number;

          let spritePath = this.getNodeParameter('spriteOutputPath', i, '') as string;
          if (!spritePath) spritePath = path.join(tmpDir, 'sprite.jpg');

          await runFfmpeg(
            `-y -i "${inputPath}" -vf "fps=1/${interval},scale=${tileW}:${tileH},tile=${cols}x100" -frames:v 1 "${spritePath}"`
          );

          const newItem: INodeExecutionData = {
            json: { operation: 'spriteSheet', interval, tileWidth: tileW, tileHeight: tileH, cols, outputPath: spritePath },
          };

          if (returnBinary && fs.existsSync(spritePath)) {
            const binData = buildBinaryData(spritePath);
            newItem.binary = {
              [binaryPropertyName]: {
                data: binData.data,
                mimeType: binData.mimeType,
                fileExtension: binData.fileExtension,
                fileName: binData.fileName,
              },
            };
          }
          returnData.push(newItem);

        } else if (operation === 'extractSubtitle') {
          const trackIndex = this.getNodeParameter('subtitleTrackIndex', i, 0) as number;
          const subFormat = this.getNodeParameter('subtitleFormat', i, 'srt') as string;
          let subOutputPath = this.getNodeParameter('subtitleOutputPath', i, '') as string;
          if (!subOutputPath) subOutputPath = path.join(tmpDir, `subtitles.${subFormat}`);

          // Map stream by subtitle type index
          await runFfmpeg(`-y -i "${inputPath}" -map 0:s:${trackIndex} "${subOutputPath}"`);

          const newItem: INodeExecutionData = {
            json: {
              operation: 'extractSubtitle',
              trackIndex,
              format: subFormat,
              outputPath: subOutputPath,
              success: true,
            },
          };

          if (returnBinary && fs.existsSync(subOutputPath)) {
            const binData = buildBinaryData(subOutputPath);
            newItem.binary = {
              [binaryPropertyName]: {
                data: binData.data,
                mimeType: 'text/plain',
                fileExtension: subFormat,
                fileName: path.basename(subOutputPath),
              },
            };
          }
          returnData.push(newItem);

        } else if (operation === 'waveformVideo') {
          const wfW = this.getNodeParameter('waveformWidth', i, 1280) as number;
          const wfH = this.getNodeParameter('waveformHeight', i, 360) as number;
          const wfStyle = this.getNodeParameter('waveformStyle', i, 'line') as string;
          const wfColor = this.getNodeParameter('waveformColor', i, '#00ff88') as string;
          const wfBgColor = this.getNodeParameter('waveformBgColor', i, '#000000') as string;
          let wfOutputPath = this.getNodeParameter('waveformVideoOutputPath', i, '') as string;
          if (!wfOutputPath) wfOutputPath = path.join(tmpDir, 'waveform.mp4');

          // showwaves filter renders audio waveform as video
          const showwavesFilter = `showwaves=s=${wfW}x${wfH}:mode=${wfStyle}:colors=${wfColor}`;
          const bgFilter = `color=${wfBgColor}:s=${wfW}x${wfH}[bg];[bg][0:v]overlay=0:0`;
          await runFfmpeg(
            `-y -i "${inputPath}" -filter_complex "[0:a]${showwavesFilter}[waves];color=${wfBgColor}:s=${wfW}x${wfH}[bg];[bg][waves]overlay=0:0[out]" -map "[out]" -vcodec libx264 -pix_fmt yuv420p "${wfOutputPath}"`
          );
          void bgFilter; // suppress unused variable

          const newItem: INodeExecutionData = {
            json: {
              operation: 'waveformVideo',
              width: wfW,
              height: wfH,
              style: wfStyle,
              color: wfColor,
              backgroundColor: wfBgColor,
              outputPath: wfOutputPath,
              success: true,
            },
          };

          if (returnBinary && fs.existsSync(wfOutputPath)) {
            const binData = buildBinaryData(wfOutputPath);
            newItem.binary = {
              [binaryPropertyName]: {
                data: binData.data,
                mimeType: binData.mimeType,
                fileExtension: binData.fileExtension,
                fileName: binData.fileName,
              },
            };
          }
          returnData.push(newItem);

        } else {
          throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
        }

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

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = (seconds % 60).toFixed(3);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${s.padStart(6, '0')}`;
}

function evalFraction(fraction: string): number {
  if (!fraction || !fraction.includes('/')) return parseFloat(fraction) || 0;
  const [num, den] = fraction.split('/').map(Number);
  return den !== 0 ? num / den : 0;
}
