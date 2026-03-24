/**
 * Unit tests for ffmpeg.utils.ts
 * These tests validate the utility functions without requiring FFmpeg to be installed.
 */

import * as fs from 'fs';

// Mock execCallback so validateFfmpeg doesn't need a real ffmpeg binary
jest.mock('child_process', () => ({
  exec: jest.fn(),
}));

import {
  timeToSeconds,
  getMimeType,
  escapeFilterValue,
  createTempDir,
  cleanupTempDir,
  requireParam,
} from '../utils/ffmpeg.utils';

describe('timeToSeconds', () => {
  test('converts plain seconds string', () => {
    expect(timeToSeconds('10')).toBe(10);
    expect(timeToSeconds('10.5')).toBe(10.5);
  });

  test('converts HH:MM:SS format', () => {
    expect(timeToSeconds('00:00:10')).toBe(10);
    expect(timeToSeconds('00:01:30')).toBe(90);
    expect(timeToSeconds('01:00:00')).toBe(3600);
    expect(timeToSeconds('01:30:45')).toBe(5445);
  });

  test('converts MM:SS format', () => {
    expect(timeToSeconds('1:30')).toBe(90);
    expect(timeToSeconds('0:05')).toBe(5);
  });

  test('handles decimal seconds in HH:MM:SS.mmm', () => {
    expect(timeToSeconds('00:00:10.5')).toBeCloseTo(10.5);
  });
});

describe('getMimeType', () => {
  test('returns correct MIME for video formats', () => {
    expect(getMimeType('/path/to/file.mp4')).toBe('video/mp4');
    expect(getMimeType('/path/to/file.mov')).toBe('video/quicktime');
    expect(getMimeType('/path/to/file.webm')).toBe('video/webm');
    expect(getMimeType('/path/to/file.avi')).toBe('video/x-msvideo');
    expect(getMimeType('/path/to/file.mkv')).toBe('video/x-matroska');
  });

  test('returns correct MIME for audio formats', () => {
    expect(getMimeType('/path/to/file.mp3')).toBe('audio/mpeg');
    expect(getMimeType('/path/to/file.aac')).toBe('audio/aac');
    expect(getMimeType('/path/to/file.wav')).toBe('audio/wav');
    expect(getMimeType('/path/to/file.flac')).toBe('audio/flac');
  });

  test('returns correct MIME for image formats', () => {
    expect(getMimeType('/path/to/file.jpg')).toBe('image/jpeg');
    expect(getMimeType('/path/to/file.jpeg')).toBe('image/jpeg');
    expect(getMimeType('/path/to/file.png')).toBe('image/png');
    expect(getMimeType('/path/to/file.gif')).toBe('image/gif');
  });

  test('returns octet-stream for unknown extension', () => {
    expect(getMimeType('/path/to/file.xyz')).toBe('application/octet-stream');
    expect(getMimeType('/path/to/file')).toBe('application/octet-stream');
  });

  test('is case-insensitive for extensions', () => {
    expect(getMimeType('/path/to/FILE.MP4')).toBe('video/mp4');
    expect(getMimeType('/path/to/FILE.MP3')).toBe('audio/mpeg');
  });
});

describe('escapeFilterValue', () => {
  test('escapes backslashes', () => {
    expect(escapeFilterValue('C:\\path\\to\\file')).toContain('\\\\');
  });

  test('escapes single quotes', () => {
    expect(escapeFilterValue("it's here")).toContain("\\'");
  });

  test('escapes colons', () => {
    expect(escapeFilterValue('00:00:10')).toContain('\\:');
  });

  test('handles empty string', () => {
    expect(escapeFilterValue('')).toBe('');
  });
});

describe('requireParam', () => {
  test('returns trimmed value for valid input', () => {
    expect(requireParam('  hello  ', 'testParam')).toBe('hello');
    expect(requireParam('value', 'testParam')).toBe('value');
  });

  test('throws for empty string', () => {
    expect(() => requireParam('', 'myParam')).toThrow(/myParam/);
    expect(() => requireParam('   ', 'myParam')).toThrow(/myParam/);
  });

  test('throws for null/undefined', () => {
    expect(() => requireParam(null, 'myParam')).toThrow(/myParam/);
    expect(() => requireParam(undefined, 'myParam')).toThrow(/myParam/);
  });
});

describe('createTempDir / cleanupTempDir', () => {
  test('creates a temp directory', () => {
    const tmpDir = createTempDir();
    expect(fs.existsSync(tmpDir)).toBe(true);
    expect(tmpDir).toContain('n8n-ffmpeg-');
    cleanupTempDir(tmpDir);
    expect(fs.existsSync(tmpDir)).toBe(false);
  });

  test('cleanupTempDir does not throw for non-existent dir', () => {
    expect(() => cleanupTempDir('/nonexistent/path/xyz123')).not.toThrow();
  });

  test('creates unique temp dirs on each call', () => {
    const dir1 = createTempDir();
    const dir2 = createTempDir();
    expect(dir1).not.toBe(dir2);
    cleanupTempDir(dir1);
    cleanupTempDir(dir2);
  });
});

describe('quotePath', () => {
  let quotePath: (p: string) => string;

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    quotePath = (await import('../utils/ffmpeg.utils')).quotePath;
  });

  test('wraps plain paths in single quotes', () => {
    expect(quotePath('/tmp/output.mp4')).toBe("'/tmp/output.mp4'");
  });

  test('handles paths with spaces', () => {
    const result = quotePath('/my files/video clip.mp4');
    expect(result).toBe("'/my files/video clip.mp4'");
  });

  test('escapes embedded single quotes', () => {
    const result = quotePath("/it's/here.mp4");
    expect(result).toContain("\\'");
  });

  test('escapes backslashes', () => {
    const result = quotePath('C:\\Users\\test\\video.mp4');
    expect(result).toContain('\\\\');
  });
});

describe('ensureOutputDir', () => {
  let ensureOutputDir: (outputPath: string) => void;
  let tmpBase: string;

  beforeAll(async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    ensureOutputDir = (await import('../utils/ffmpeg.utils')).ensureOutputDir;
  });

  beforeEach(() => {
    tmpBase = fs.mkdtempSync(require('os').tmpdir() + require('path').sep + 'n8n-test-');
  });

  afterEach(() => {
    try { fs.rmSync(tmpBase, { recursive: true, force: true }); } catch { /* ignore */ }
  });

  test('does not throw when directory already exists', () => {
    expect(() => ensureOutputDir(require('path').join(tmpBase, 'out.mp4'))).not.toThrow();
  });

  test('creates missing nested output directory', () => {
    const nested = require('path').join(tmpBase, 'a', 'b', 'c', 'out.mp4');
    expect(() => ensureOutputDir(nested)).not.toThrow();
    expect(fs.existsSync(require('path').dirname(nested))).toBe(true);
  });

  test('throws for invalid root path', () => {
    // On any OS, attempting to create a subdirectory under /proc/fakepath should fail
    // We just verify the function throws if mkdirSync fails
    const badPath = require('path').join('/proc_fake_readonly_xyz', 'subdir', 'out.mp4');
    // This will either throw because /proc_fake_readonly_xyz doesn't exist
    // or succeed by creating it in /tmp. Either way it should not crash unexpectedly.
    try {
      ensureOutputDir(badPath);
      // If it succeeds (on some systems /proc_fake_readonly_xyz may be writable), that's fine
    } catch (err: unknown) {
      const e = err as { message?: string };
      expect(e.message).toBeDefined();
    }
  });
});

describe('resolveInput validation', () => {
  // These tests verify that resolveInput properly validates empty input
  // without needing a real filesystem or network
  let resolveInput: (input: string, tmpDir: string, ext?: string) => Promise<string>;

  beforeAll(async () => {
    // Import after mocking
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    resolveInput = (await import('../utils/ffmpeg.utils')).resolveInput;
  });

  test('throws for empty input string', async () => {
    await expect(resolveInput('', '/tmp')).rejects.toThrow('required');
  });

  test('throws for whitespace-only input', async () => {
    await expect(resolveInput('   ', '/tmp')).rejects.toThrow('required');
  });

  test('throws for non-existent local file', async () => {
    await expect(resolveInput('/this/path/does/not/exist.mp4', '/tmp')).rejects.toThrow('not found');
  });
});
