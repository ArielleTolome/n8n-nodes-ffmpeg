/**
 * Sanity tests for node descriptions — verify all nodes have valid structure
 * without executing any FFmpeg commands.
 */

import { FfmpegVideo } from '../nodes/FfmpegVideo/FfmpegVideo.node';
import { FfmpegAudio } from '../nodes/FfmpegAudio/FfmpegAudio.node';
import { FfmpegAnalyze } from '../nodes/FfmpegAnalyze/FfmpegAnalyze.node';
import { FfmpegAdvanced } from '../nodes/FfmpegAdvanced/FfmpegAdvanced.node';

const nodes = [
  { name: 'FfmpegVideo', node: new FfmpegVideo() },
  { name: 'FfmpegAudio', node: new FfmpegAudio() },
  { name: 'FfmpegAnalyze', node: new FfmpegAnalyze() },
  { name: 'FfmpegAdvanced', node: new FfmpegAdvanced() },
];

describe.each(nodes)('$name node description', ({ node }) => {
  const desc = node.description;

  test('has a displayName', () => {
    expect(typeof desc.displayName).toBe('string');
    expect(desc.displayName.length).toBeGreaterThan(0);
  });

  test('has a non-empty name', () => {
    expect(typeof desc.name).toBe('string');
    expect(desc.name.length).toBeGreaterThan(0);
  });

  test('has an icon', () => {
    expect(desc.icon).toMatch(/^file:/);
  });

  test('has inputs and outputs', () => {
    expect(Array.isArray(desc.inputs)).toBe(true);
    expect(Array.isArray(desc.outputs)).toBe(true);
    expect(desc.inputs.length).toBeGreaterThan(0);
    expect(desc.outputs.length).toBeGreaterThan(0);
  });

  test('has properties array', () => {
    expect(Array.isArray(desc.properties)).toBe(true);
    expect(desc.properties.length).toBeGreaterThan(0);
  });

  test('has an operation property with options', () => {
    const opProp = desc.properties.find(p => p.name === 'operation');
    expect(opProp).toBeDefined();
    expect(opProp?.type).toBe('options');
    expect(Array.isArray((opProp as { options?: unknown[] })?.options)).toBe(true);
    expect(((opProp as { options?: unknown[] })?.options?.length ?? 0)).toBeGreaterThan(0);
  });

  test('all properties have name and type', () => {
    for (const prop of desc.properties) {
      expect(typeof prop.name).toBe('string');
      expect(prop.name.length).toBeGreaterThan(0);
      expect(typeof prop.type).toBe('string');
    }
  });

  test('no duplicate property names', () => {
    const names = desc.properties.map(p => p.name);
    const uniqueNames = new Set(names);
    expect(uniqueNames.size).toBe(names.length);
  });
});

describe('FfmpegVideo operations', () => {
  const node = new FfmpegVideo();
  const opProp = node.description.properties.find(p => p.name === 'operation');
  const ops = (opProp as { options?: Array<{ value: string }> })?.options ?? [];
  const opValues = ops.map(o => o.value);

  test('includes xfade operation', () => {
    expect(opValues).toContain('xfade');
  });

  test('includes custom FFmpeg command operation', () => {
    expect(opValues).toContain('custom');
  });

  test('inputVideos field shows for merge, compose, and xfade', () => {
    const inputVideosProp = node.description.properties.find(p => p.name === 'inputVideos');
    expect(inputVideosProp).toBeDefined();
    const showOps = (inputVideosProp?.displayOptions?.show?.operation ?? []) as string[];
    expect(showOps).toContain('merge');
    expect(showOps).toContain('compose');
    expect(showOps).toContain('xfade');
  });

  test('has audioOutputFormat for extractAudio', () => {
    const audioFmtProp = node.description.properties.find(p => p.name === 'audioOutputFormat');
    expect(audioFmtProp).toBeDefined();
    const showOps = (audioFmtProp?.displayOptions?.show?.operation ?? []) as string[];
    expect(showOps).toContain('extractAudio');
  });

  test('has hwaccel option', () => {
    const hwProp = node.description.properties.find(p => p.name === 'hwaccel');
    expect(hwProp).toBeDefined();
    expect(hwProp?.type).toBe('options');
  });

  test('has timeoutSeconds option', () => {
    const toProp = node.description.properties.find(p => p.name === 'timeoutSeconds');
    expect(toProp).toBeDefined();
  });

  test('has at least 28 operations', () => {
    expect(opValues.length).toBeGreaterThanOrEqual(28);
  });

  test('xfade has expanded transition effects (40+)', () => {
    const xfadeProp = node.description.properties.find(p => p.name === 'xfadeEffect');
    expect(xfadeProp).toBeDefined();
    const xfadeOpts = (xfadeProp as { options?: unknown[] })?.options ?? [];
    expect(xfadeOpts.length).toBeGreaterThanOrEqual(20);
  });
});

describe('FfmpegAdvanced operations', () => {
  const node = new FfmpegAdvanced();
  const opProp = node.description.properties.find(p => p.name === 'operation');
  const ops = (opProp as { options?: Array<{ value: string }> })?.options ?? [];
  const opValues = ops.map(o => o.value);

  test('includes new Wave 3 operations', () => {
    expect(opValues).toContain('blurRegion');
    expect(opValues).toContain('deinterlace');
    expect(opValues).toContain('kenburns');
    expect(opValues).toContain('timelapse');
    expect(opValues).toContain('dash');
  });

  test('has hwaccel option', () => {
    const hwProp = node.description.properties.find(p => p.name === 'hwaccel');
    expect(hwProp).toBeDefined();
  });

  test('has timeoutSeconds option', () => {
    const toProp = node.description.properties.find(p => p.name === 'timeoutSeconds');
    expect(toProp).toBeDefined();
  });

  test('includes Wave 11 video operations', () => {
    expect(opValues).toContain('colorCurves');
    expect(opValues).toContain('motionBlur');
    expect(opValues).toContain('slowMotion');
    expect(opValues).toContain('smartCrop');
  });

  test('has at least 20 operations', () => {
    expect(opValues.length).toBeGreaterThanOrEqual(20);
  });
});

describe('FfmpegAudio operations', () => {
  const node = new FfmpegAudio();
  const opProp = node.description.properties.find(p => p.name === 'operation');
  const ops = (opProp as { options?: Array<{ value: string }> })?.options ?? [];
  const opValues = ops.map(o => o.value);

  test('includes Wave 3 operations', () => {
    expect(opValues).toContain('speed');
    expect(opValues).toContain('removeSilence');
  });

  test('includes Wave 5 pitch shift operation', () => {
    expect(opValues).toContain('pitch');
  });

  test('includes Wave 11 audio operations', () => {
    expect(opValues).toContain('compressor');
    expect(opValues).toContain('equalizer');
    expect(opValues).toContain('stereoToMono');
    expect(opValues).toContain('channelMap');
    expect(opValues).toContain('generateTone');
  });

  test('has timeoutSeconds option', () => {
    const toProp = node.description.properties.find(p => p.name === 'timeoutSeconds');
    expect(toProp).toBeDefined();
  });

  test('has at least 14 operations', () => {
    expect(opValues.length).toBeGreaterThanOrEqual(14);
  });
});

describe('FfmpegAnalyze operations', () => {
  const node = new FfmpegAnalyze();
  const opProp = node.description.properties.find(p => p.name === 'operation');
  const ops = (opProp as { options?: Array<{ value: string }> })?.options ?? [];
  const opValues = ops.map(o => o.value);

  test('includes Wave 5 new operations', () => {
    expect(opValues).toContain('extractSubtitle');
    expect(opValues).toContain('waveformVideo');
  });

  test('has timeoutSeconds option', () => {
    const toProp = node.description.properties.find(p => p.name === 'timeoutSeconds');
    expect(toProp).toBeDefined();
  });

  test('has at least 9 operations', () => {
    expect(opValues.length).toBeGreaterThanOrEqual(9);
  });
});
