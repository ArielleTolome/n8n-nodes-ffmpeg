import { exec as execCallback } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as https from 'https';
import * as http from 'http';

export const execAsync = promisify(execCallback);

export interface FfmpegResult {
  outputPath: string;
  mimeType: string;
  fileExtension: string;
}

/**
 * Validate that ffmpeg is available on the system
 */
export async function validateFfmpeg(): Promise<void> {
  try {
    await execAsync('ffmpeg -version');
  } catch {
    // Try common install paths before giving up
    const commonPaths = [
      '/usr/local/bin/ffmpeg',
      '/usr/bin/ffmpeg',
      '/opt/homebrew/bin/ffmpeg',
      '/opt/local/bin/ffmpeg',
    ];
    for (const p of commonPaths) {
      try {
        await execAsync(`${p} -version`);
        return; // Found it
      } catch {
        // Continue searching
      }
    }
    throw new Error(
      'FFmpeg is not installed or not in PATH. ' +
      'Install it with:\n' +
      '  macOS: brew install ffmpeg\n' +
      '  Ubuntu/Debian: sudo apt install ffmpeg\n' +
      '  Windows: https://ffmpeg.org/download.html\n' +
      'Then ensure ffmpeg is accessible in your system PATH.'
    );
  }
}

/**
 * Validate that ffprobe is available on the system
 */
export async function validateFfprobe(): Promise<void> {
  try {
    await execAsync('ffprobe -version');
  } catch {
    throw new Error(
      'ffprobe is not installed or not in PATH. ' +
      'It should be bundled with FFmpeg. Try reinstalling FFmpeg:\n' +
      '  macOS: brew install ffmpeg\n' +
      '  Ubuntu/Debian: sudo apt install ffmpeg'
    );
  }
}

/**
 * Create a temp directory for this session
 */
export function createTempDir(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-ffmpeg-'));
  return tmpDir;
}

/**
 * Download a URL to a temp file, returns local path
 */
export async function downloadToTemp(url: string, tmpDir: string, ext?: string): Promise<string> {
  const extension = ext || path.extname(new URL(url).pathname) || '.tmp';
  const tmpFile = path.join(tmpDir, `input_${Date.now()}${extension}`);

  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(tmpFile);
    const protocol = url.startsWith('https') ? https : http;

    const request = protocol.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        // Handle redirects
        file.close();
        fs.unlinkSync(tmpFile);
        downloadToTemp(response.headers.location!, tmpDir, ext).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(`Failed to download file: HTTP ${response.statusCode}`));
        return;
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve(tmpFile);
      });
    });

    request.on('error', (err) => {
      fs.unlink(tmpFile, () => {});
      reject(err);
    });

    file.on('error', (err) => {
      fs.unlink(tmpFile, () => {});
      reject(err);
    });
  });
}

/**
 * Resolve input: if URL, download; if path, validate exists. Returns local path.
 */
export async function resolveInput(input: string, tmpDir: string, ext?: string): Promise<string> {
  if (!input || input.trim() === '') {
    throw new Error('Input file path or URL is required but was not provided.');
  }

  const trimmed = input.trim();

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return downloadToTemp(trimmed, tmpDir, ext);
  }

  const resolved = path.resolve(trimmed);
  if (!fs.existsSync(resolved)) {
    throw new Error(
      `Input file not found: "${resolved}". ` +
      'Please check that the file path is correct and the file exists.'
    );
  }

  return resolved;
}

/**
 * Validate that required string parameters are non-empty
 */
export function requireParam(value: string | undefined | null, paramName: string): string {
  if (!value || value.trim() === '') {
    throw new Error(`Required parameter "${paramName}" is missing or empty.`);
  }
  return value.trim();
}

/**
 * Read a file and return as base64
 */
export function fileToBase64(filePath: string): string {
  return fs.readFileSync(filePath).toString('base64');
}

/**
 * Clean up a temp directory
 */
export function cleanupTempDir(tmpDir: string): void {
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

/**
 * Get MIME type from file extension
 */
export function getMimeType(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  const mimeMap: Record<string, string> = {
    '.mp4': 'video/mp4',
    '.mov': 'video/quicktime',
    '.avi': 'video/x-msvideo',
    '.mkv': 'video/x-matroska',
    '.webm': 'video/webm',
    '.flv': 'video/x-flv',
    '.wmv': 'video/x-ms-wmv',
    '.m4v': 'video/x-m4v',
    '.3gp': 'video/3gpp',
    '.ts': 'video/mp2t',
    '.gif': 'image/gif',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.png': 'image/png',
    '.mp3': 'audio/mpeg',
    '.aac': 'audio/aac',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.flac': 'audio/flac',
    '.m4a': 'audio/mp4',
    '.opus': 'audio/opus',
    '.json': 'application/json',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

/**
 * Parse FFmpeg stderr to extract a clean error message
 */
function parseFfmpegError(stderr: string): string {
  if (!stderr) return '';
  const lines = stderr.split('\n');
  // Find lines that contain actual errors (not progress/metadata lines)
  const errorLines = lines.filter(l =>
    l.includes('Error') ||
    l.includes('error') ||
    l.includes('Invalid') ||
    l.includes('No such file') ||
    l.includes('Permission denied') ||
    l.includes('Conversion failed') ||
    l.includes('Unknown encoder') ||
    l.includes('Encoder') ||
    l.includes('not found') ||
    l.startsWith('Option') && l.includes('not found')
  );
  if (errorLines.length > 0) {
    return errorLines.slice(-5).join('\n').trim();
  }
  // Fall back to last 1500 chars of stderr
  return stderr.slice(-1500).trim();
}

/**
 * Execute ffmpeg command with proper error handling
 */
export async function runFfmpeg(args: string): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execAsync(`ffmpeg ${args}`, { maxBuffer: 100 * 1024 * 1024 });
    return result;
  } catch (error: unknown) {
    const err = error as { stderr?: string; code?: number; signal?: string; message?: string };
    const stderr = err.stderr || '';
    const exitCode = err.code;

    // Check for specific common failure modes
    if (stderr.includes('No such file or directory') || stderr.includes('does not exist')) {
      const match = stderr.match(/(['"]?)([^'"]+?)\1: No such file or directory/);
      const filePath = match ? match[2] : 'input file';
      throw new Error(`FFmpeg input file not found: "${filePath}". Check that the path is correct.`);
    }

    if (stderr.includes('Unknown encoder') || stderr.includes('Encoder') && stderr.includes('not found')) {
      const match = stderr.match(/(?:Unknown encoder|Encoder) ['"]?([^'"]+)['"]?/);
      const codec = match ? match[1] : 'specified codec';
      throw new Error(
        `FFmpeg encoder not found: "${codec}". ` +
        'This codec may not be compiled into your FFmpeg build. ' +
        'Try a different codec (e.g. libx264 instead of h265).'
      );
    }

    if (stderr.includes('Permission denied')) {
      throw new Error(
        'FFmpeg permission denied. Check that the output directory exists and is writable.'
      );
    }

    const cleanError = parseFfmpegError(stderr);
    const exitInfo = exitCode !== undefined ? ` (exit code ${exitCode})` : '';
    throw new Error(
      `FFmpeg failed${exitInfo}.\n` +
      (cleanError ? `Details: ${cleanError}` : `Raw output: ${stderr.slice(-1500)}`)
    );
  }
}

/**
 * Execute ffprobe command
 */
export async function runFfprobe(args: string): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execAsync(`ffprobe ${args}`, { maxBuffer: 50 * 1024 * 1024 });
    return result;
  } catch (error: unknown) {
    const err = error as { stderr?: string; code?: number; message?: string };
    const stderr = err.stderr || '';
    if (stderr.includes('No such file') || stderr.includes('does not exist')) {
      throw new Error(`ffprobe: Input file not found. Check the file path.`);
    }
    throw new Error(`ffprobe failed: ${err.message || 'unknown error'}\n${stderr.slice(-500)}`);
  }
}

/**
 * Build n8n binary data from output file
 */
export function buildBinaryData(outputPath: string): {
  data: string;
  mimeType: string;
  fileExtension: string;
  fileName: string;
} {
  const mimeType = getMimeType(outputPath);
  const fileExtension = path.extname(outputPath).slice(1);
  const fileName = path.basename(outputPath);
  const data = fileToBase64(outputPath);

  return { data, mimeType, fileExtension, fileName };
}

/**
 * Escape a string for use in ffmpeg filter_complex
 */
export function escapeFilterValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:');
}

/**
 * Convert time string to seconds (supports HH:MM:SS.mmm or plain seconds)
 */
export function timeToSeconds(time: string): number {
  if (/^\d+(\.\d+)?$/.test(time)) {
    return parseFloat(time);
  }
  const parts = time.split(':').map(parseFloat);
  if (parts.length === 3) {
    return parts[0] * 3600 + parts[1] * 60 + parts[2];
  }
  if (parts.length === 2) {
    return parts[0] * 60 + parts[1];
  }
  return parseFloat(time);
}
