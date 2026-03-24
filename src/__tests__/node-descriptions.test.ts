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

  test('inputVideos field shows for merge, compose, and xfade', () => {
    const inputVideosProp = node.description.properties.find(p => p.name === 'inputVideos');
    expect(inputVideosProp).toBeDefined();
    const showOps = (inputVideosProp?.displayOptions?.show?.operation ?? []) as string[];
    expect(showOps).toContain('merge');
    expect(showOps).toContain('compose');
    expect(showOps).toContain('xfade');
  });

  test('has at least 25 operations', () => {
    expect(opValues.length).toBeGreaterThanOrEqual(25);
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

  test('has at least 12 operations', () => {
    expect(opValues.length).toBeGreaterThanOrEqual(12);
  });
});

describe('FfmpegAudio operations', () => {
  const node = new FfmpegAudio();
  const opProp = node.description.properties.find(p => p.name === 'operation');
  const ops = (opProp as { options?: Array<{ value: string }> })?.options ?? [];
  const opValues = ops.map(o => o.value);

  test('includes new Wave 3 operations', () => {
    expect(opValues).toContain('speed');
    expect(opValues).toContain('removeSilence');
  });

  test('has at least 8 operations', () => {
    expect(opValues.length).toBeGreaterThanOrEqual(8);
  });
});
