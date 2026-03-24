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
  execAsync,
} from '../../utils/ffmpeg.utils';

export class FfmpegAudio implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'FFmpeg Audio',
    name: 'ffmpegAudio',
    icon: 'file:ffmpeg-audio.svg',
    group: ['transform'],
    version: 1,
    subtitle: '={{$parameter["operation"]}}',
    description: 'Process audio using FFmpeg — normalize, trim, merge, convert, adjust volume, fade, and more.',
    defaults: {
      name: 'FFmpeg Audio',
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
          { name: 'Trim Audio', value: 'trim', description: 'Cut audio to a time range' },
          { name: 'Merge Audio Files', value: 'merge', description: 'Concatenate or mix multiple audio files' },
          { name: 'Convert Format', value: 'convert', description: 'Change audio format/codec' },
          { name: 'Normalize (Loudnorm EBU R128)', value: 'loudnorm', description: 'Normalize to EBU R128 standard' },
          { name: 'Adjust Volume', value: 'volume', description: 'Increase or decrease volume' },
          { name: 'Fade In/Out', value: 'fade', description: 'Fade audio in and/or out' },
          { name: 'Remove Audio from Video', value: 'removeFromVideo', description: 'Strip audio from a video file' },
          { name: 'Mix Audio Tracks', value: 'mix', description: 'Mix multiple audio streams together' },
        ],
        default: 'trim',
      },

      // ─── INPUT ───────────────────────────────────────────────────────
      {
        displayName: 'Input Audio',
        name: 'inputAudio',
        type: 'string',
        default: '',
        placeholder: '/path/to/audio.mp3 or https://...',
        displayOptions: {
          hide: { operation: ['merge', 'mix'] },
        },
      },
      {
        displayName: 'Input Files (one per line)',
        name: 'inputFiles',
        type: 'string',
        typeOptions: { rows: 4 },
        default: '',
        displayOptions: {
          show: { operation: ['merge', 'mix'] },
        },
      },

      // ─── OUTPUT ──────────────────────────────────────────────────────
      {
        displayName: 'Output Format',
        name: 'outputFormat',
        type: 'options',
        options: [
          { name: 'MP3', value: 'mp3' },
          { name: 'AAC (.m4a)', value: 'm4a' },
          { name: 'WAV', value: 'wav' },
          { name: 'OGG (Vorbis)', value: 'ogg' },
          { name: 'FLAC', value: 'flac' },
          { name: 'Opus', value: 'opus' },
          { name: 'MP4 (with audio)', value: 'mp4' },
        ],
        default: 'mp3',
        displayOptions: {
          hide: { operation: ['removeFromVideo'] },
        },
      },
      {
        displayName: 'Output Path',
        name: 'outputPath',
        type: 'string',
        default: '',
        placeholder: '/tmp/output.mp3 (leave empty for auto)',
      },
      {
        displayName: 'Return Binary Data',
        name: 'returnBinary',
        type: 'boolean',
        default: true,
      },
      {
        displayName: 'Binary Property Name',
        name: 'binaryPropertyName',
        type: 'string',
        default: 'data',
        displayOptions: { show: { returnBinary: [true] } },
      },

      // ─── TRIM ─────────────────────────────────────────────────────────
      {
        displayName: 'Start Time',
        name: 'startTime',
        type: 'string',
        default: '0',
        placeholder: '00:00:10 or 10',
        displayOptions: { show: { operation: ['trim'] } },
      },
      {
        displayName: 'End Time',
        name: 'endTime',
        type: 'string',
        default: '',
        placeholder: '00:01:00 or 60',
        displayOptions: { show: { operation: ['trim'] } },
      },
      {
        displayName: 'Duration',
        name: 'duration',
        type: 'string',
        default: '',
        placeholder: '30 or 00:00:30',
        description: 'Used if End Time is empty',
        displayOptions: { show: { operation: ['trim'] } },
      },

      // ─── MERGE ────────────────────────────────────────────────────────
      {
        displayName: 'Merge Mode',
        name: 'mergeMode',
        type: 'options',
        options: [
          { name: 'Concatenate (end to end)', value: 'concat' },
          { name: 'Mix (overlay simultaneous)', value: 'mix' },
        ],
        default: 'concat',
        displayOptions: { show: { operation: ['merge'] } },
      },

      // ─── CONVERT ──────────────────────────────────────────────────────
      {
        displayName: 'Audio Bitrate',
        name: 'audioBitrate',
        type: 'string',
        default: '192k',
        placeholder: '128k, 192k, 320k',
        displayOptions: { show: { operation: ['convert', 'loudnorm', 'trim', 'fade', 'volume'] } },
      },

      // ─── LOUDNORM ─────────────────────────────────────────────────────
      {
        displayName: 'Target Integrated Loudness (LUFS)',
        name: 'loudnormI',
        type: 'number',
        default: -16,
        description: 'EBU R128 target: -23 LUFS (broadcast), -16 LUFS (streaming/YouTube), -14 LUFS (Spotify)',
        displayOptions: { show: { operation: ['loudnorm'] } },
      },
      {
        displayName: 'Max True Peak (dBTP)',
        name: 'loudnormTP',
        type: 'number',
        default: -1.5,
        displayOptions: { show: { operation: ['loudnorm'] } },
      },
      {
        displayName: 'Loudness Range (LU)',
        name: 'loudnormLRA',
        type: 'number',
        default: 11,
        displayOptions: { show: { operation: ['loudnorm'] } },
      },

      // ─── VOLUME ───────────────────────────────────────────────────────
      {
        displayName: 'Volume Adjustment',
        name: 'volumeLevel',
        type: 'string',
        default: '1.5',
        placeholder: '2.0 (double), 0.5 (half), -5dB, 10dB',
        description: 'Volume multiplier or dB value (e.g., 0.5, 2.0, -5dB)',
        displayOptions: { show: { operation: ['volume'] } },
      },

      // ─── FADE ─────────────────────────────────────────────────────────
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
        displayName: 'Audio Total Duration (seconds)',
        name: 'audioTotalDuration',
        type: 'number',
        default: 0,
        description: 'Required for fade out. 0 = auto-detect.',
        displayOptions: { show: { operation: ['fade'] } },
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
        const outputFormat = this.getNodeParameter('outputFormat', i, 'mp3') as string;
        const returnBinary = this.getNodeParameter('returnBinary', i) as boolean;
        const binaryPropertyName = this.getNodeParameter('binaryPropertyName', i) as string;
        const extraArgs = this.getNodeParameter('extraArgs', i, '') as string;

        let outputPath = this.getNodeParameter('outputPath', i, '') as string;
        if (!outputPath) {
          outputPath = path.join(tmpDir, `output.${outputFormat}`);
        }

        let ffmpegCmd = '';

        if (operation === 'trim') {
          const inputAudio = this.getNodeParameter('inputAudio', i) as string;
          const startTime = this.getNodeParameter('startTime', i) as string;
          const endTime = this.getNodeParameter('endTime', i, '') as string;
          const duration = this.getNodeParameter('duration', i, '') as string;
          const bitrate = this.getNodeParameter('audioBitrate', i) as string;
          const inputPath = await resolveInput(inputAudio, tmpDir);
          const toArg = endTime ? `-to ${endTime}` : duration ? `-t ${duration}` : '';
          ffmpegCmd = `-y -ss ${startTime} -i "${inputPath}" ${toArg} -ab ${bitrate} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'merge') {
          const inputFilesRaw = this.getNodeParameter('inputFiles', i) as string;
          const mergeMode = this.getNodeParameter('mergeMode', i) as string;
          const fileList = inputFilesRaw.split('\n').map(v => v.trim()).filter(Boolean);

          const resolvedPaths: string[] = [];
          for (const f of fileList) {
            resolvedPaths.push(await resolveInput(f, tmpDir));
          }

          if (mergeMode === 'concat') {
            const listFile = path.join(tmpDir, 'concat_list.txt');
            fs.writeFileSync(listFile, resolvedPaths.map(p => `file '${p}'`).join('\n'));
            ffmpegCmd = `-y -f concat -safe 0 -i "${listFile}" -c copy ${extraArgs} "${outputPath}"`;
          } else {
            const inputs = resolvedPaths.map(p => `-i "${p}"`).join(' ');
            const amix = `amix=inputs=${resolvedPaths.length}:duration=longest`;
            ffmpegCmd = `-y ${inputs} -filter_complex "${amix}" ${extraArgs} "${outputPath}"`;
          }

        } else if (operation === 'convert') {
          const inputAudio = this.getNodeParameter('inputAudio', i) as string;
          const bitrate = this.getNodeParameter('audioBitrate', i) as string;
          const inputPath = await resolveInput(inputAudio, tmpDir);
          ffmpegCmd = `-y -i "${inputPath}" -ab ${bitrate} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'loudnorm') {
          const inputAudio = this.getNodeParameter('inputAudio', i) as string;
          const I = this.getNodeParameter('loudnormI', i) as number;
          const TP = this.getNodeParameter('loudnormTP', i) as number;
          const LRA = this.getNodeParameter('loudnormLRA', i) as number;
          const bitrate = this.getNodeParameter('audioBitrate', i) as string;
          const inputPath = await resolveInput(inputAudio, tmpDir);
          ffmpegCmd = `-y -i "${inputPath}" -af "loudnorm=I=${I}:TP=${TP}:LRA=${LRA}" -ab ${bitrate} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'volume') {
          const inputAudio = this.getNodeParameter('inputAudio', i) as string;
          const vol = this.getNodeParameter('volumeLevel', i) as string;
          const bitrate = this.getNodeParameter('audioBitrate', i, '192k') as string;
          const inputPath = await resolveInput(inputAudio, tmpDir);
          ffmpegCmd = `-y -i "${inputPath}" -af "volume=${vol}" -ab ${bitrate} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'fade') {
          const inputAudio = this.getNodeParameter('inputAudio', i) as string;
          const fadeIn = this.getNodeParameter('fadeInDuration', i) as number;
          const fadeOut = this.getNodeParameter('fadeOutDuration', i) as number;
          const bitrate = this.getNodeParameter('audioBitrate', i, '192k') as string;
          let totalDuration = this.getNodeParameter('audioTotalDuration', i, 0) as number;
          const inputPath = await resolveInput(inputAudio, tmpDir);

          if (fadeOut > 0 && totalDuration === 0) {
            try {
              const { stdout } = await execAsync(`ffprobe -v quiet -show_entries format=duration -of csv=p=0 "${inputPath}"`);
              totalDuration = parseFloat(stdout.trim()) || 60;
            } catch {
              totalDuration = 60;
            }
          }

          const aFilters: string[] = [];
          if (fadeIn > 0) aFilters.push(`afade=t=in:st=0:d=${fadeIn}`);
          if (fadeOut > 0 && totalDuration > 0) {
            aFilters.push(`afade=t=out:st=${totalDuration - fadeOut}:d=${fadeOut}`);
          }
          const afArg = aFilters.length > 0 ? `-af "${aFilters.join(',')}"` : '';
          ffmpegCmd = `-y -i "${inputPath}" ${afArg} -ab ${bitrate} ${extraArgs} "${outputPath}"`;

        } else if (operation === 'removeFromVideo') {
          const inputAudio = this.getNodeParameter('inputAudio', i) as string;
          const inputPath = await resolveInput(inputAudio, tmpDir);
          outputPath = outputPath.replace(/\.[^.]+$/, '.mp4');
          ffmpegCmd = `-y -i "${inputPath}" -c:v copy -an ${extraArgs} "${outputPath}"`;

        } else if (operation === 'mix') {
          const inputFilesRaw = this.getNodeParameter('inputFiles', i) as string;
          const fileList = inputFilesRaw.split('\n').map(v => v.trim()).filter(Boolean);
          const resolvedPaths: string[] = [];
          for (const f of fileList) {
            resolvedPaths.push(await resolveInput(f, tmpDir));
          }
          const inputs = resolvedPaths.map(p => `-i "${p}"`).join(' ');
          ffmpegCmd = `-y ${inputs} -filter_complex "amix=inputs=${resolvedPaths.length}:duration=longest:normalize=0" ${extraArgs} "${outputPath}"`;

        } else {
          throw new NodeOperationError(this.getNode(), `Unknown operation: ${operation}`, { itemIndex: i });
        }

        await runFfmpeg(ffmpegCmd);

        const newItem: INodeExecutionData = {
          json: { operation, outputPath, success: true },
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
