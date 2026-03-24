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

// ─── Process-exit temp-dir registry ──────────────────────────────────────────
const _activeTempDirs = new Set<string>();

function _registerExitCleanup(): void {
  const cleanup = (): void => {
    for (const dir of _activeTempDirs) {
      try {
        fs.rmSync(dir, { recursive: true, force: true });
      } catch {
        // Best-effort
      }
    }
    _activeTempDirs.clear();
  };
  process.once('exit', cleanup);
  process.once('SIGINT', () => { cleanup(); process.exit(130); });
  process.once('SIGTERM', () => { cleanup(); process.exit(143); });
  process.once('uncaughtException', (err) => {
    cleanup();
    console.error('Uncaught exception, cleaned up ffmpeg temp dirs:', err);
    process.exit(1);
  });
}

// Register once at module load
_registerExitCleanup();

// ─── Path quoting ─────────────────────────────────────────────────────────────

/**
 * Wrap a file path in single quotes, escaping any embedded single quotes.
 * This ensures paths with spaces or special characters work in ffmpeg commands.
 */
export function quotePath(p: string): string {
  // Escape backslashes and single quotes, then wrap in single quotes
  return `'${p.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

// ─── FFmpeg / ffprobe availability ────────────────────────────────────────────

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

// ─── Temp directory management ────────────────────────────────────────────────

/**
 * Create a temp directory for this session and register it for process-exit cleanup.
 */
export function createTempDir(): string {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'n8n-ffmpeg-'));
  _activeTempDirs.add(tmpDir);
  return tmpDir;
}

/**
 * Clean up a temp directory immediately and deregister from exit cleanup.
 */
export function cleanupTempDir(tmpDir: string): void {
  _activeTempDirs.delete(tmpDir);
  try {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  } catch {
    // Best-effort cleanup
  }
}

// ─── URL download ─────────────────────────────────────────────────────────────

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
        try { fs.unlinkSync(tmpFile); } catch { /* ignore */ }
        downloadToTemp(response.headers.location!, tmpDir, ext).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        reject(new Error(
          `Failed to download file from URL: HTTP ${response.statusCode}. ` +
          `URL: ${url}`
        ));
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
      reject(new Error(`Network error downloading ${url}: ${err.message}`));
    });

    file.on('error', (err) => {
      fs.unlink(tmpFile, () => {});
      reject(new Error(`File write error while downloading ${url}: ${err.message}`));
    });
  });
}

// ─── Input resolution ─────────────────────────────────────────────────────────

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

// ─── Output directory validation ─────────────────────────────────────────────

/**
 * Ensure the parent directory of an output path exists. Creates it if missing.
 */
export function ensureOutputDir(outputPath: string): void {
  const dir = path.dirname(outputPath);
  if (!fs.existsSync(dir)) {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (err: unknown) {
      const e = err as { message?: string };
      throw new Error(
        `Cannot create output directory "${dir}": ${e.message || String(err)}. ` +
        'Check that you have write permission to this path.'
      );
    }
  } else {
    // Directory exists — check write permission
    try {
      fs.accessSync(dir, fs.constants.W_OK);
    } catch {
      throw new Error(
        `Output directory "${dir}" exists but is not writable. ` +
        'Check file system permissions.'
      );
    }
  }
}

// ─── Parameter validation ─────────────────────────────────────────────────────

/**
 * Validate that required string parameters are non-empty
 */
export function requireParam(value: string | undefined | null, paramName: string): string {
  if (!value || value.trim() === '') {
    throw new Error(`Required parameter "${paramName}" is missing or empty.`);
  }
  return value.trim();
}

// ─── File helpers ─────────────────────────────────────────────────────────────

/**
 * Read a file and return as base64
 */
export function fileToBase64(filePath: string): string {
  return fs.readFileSync(filePath).toString('base64');
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

// ─── FFmpeg error parsing ─────────────────────────────────────────────────────

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
    (l.startsWith('Option') && l.includes('not found'))
  );
  if (errorLines.length > 0) {
    return errorLines.slice(-5).join('\n').trim();
  }
  // Fall back to last 1500 chars of stderr
  return stderr.slice(-1500).trim();
}

// ─── FFmpeg execution ─────────────────────────────────────────────────────────

/**
 * Execute ffmpeg command with proper error handling.
 * `args` should use quotePath() for any file paths that may contain spaces.
 * @param args FFmpeg argument string
 * @param timeoutMs Optional timeout in milliseconds (default: 300000 = 5 minutes)
 */
export async function runFfmpeg(args: string, timeoutMs = 300000): Promise<{ stdout: string; stderr: string }> {
  try {
    const result = await execAsync(`ffmpeg ${args}`, { maxBuffer: 100 * 1024 * 1024, timeout: timeoutMs });
    return result;
  } catch (error: unknown) {
    const err = error as { stderr?: string; code?: number; signal?: string; message?: string; killed?: boolean };
    const stderr = err.stderr || '';
    const exitCode = err.code;

    // Check for timeout (killed by signal)
    if (err.killed || err.signal === 'SIGTERM') {
      throw new Error(
        `FFmpeg process timed out after ${Math.round(timeoutMs / 1000)} seconds. ` +
        'The input file may be too large or corrupt. Increase the Timeout setting or check the input file.'
      );
    }

    // Check for specific common failure modes
    if (stderr.includes('No such file or directory') || stderr.includes('does not exist')) {
      const match = stderr.match(/(['"]?)([^'"]+?)\1: No such file or directory/);
      const filePath = match ? match[2] : 'input file';
      throw new Error(
        `FFmpeg input file not found: "${filePath}". ` +
        'Check that the path is correct and the file exists.'
      );
    }

    if (stderr.includes('Unknown encoder') || (stderr.includes('Encoder') && stderr.includes('not found'))) {
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

// ─── Filter escaping ──────────────────────────────────────────────────────────

/**
 * Escape a string for use in ffmpeg filter_complex
 */
export function escapeFilterValue(value: string): string {
  return value
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/:/g, '\\:');
}

// ─── Time conversion ──────────────────────────────────────────────────────────

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
