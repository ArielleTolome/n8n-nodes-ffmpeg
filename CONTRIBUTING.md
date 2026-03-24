# Contributing to n8n-nodes-ffmpeg

Thank you for considering contributing! This document explains how to work with the codebase.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Local Setup](#local-setup)
- [Project Structure](#project-structure)
- [How to Add a New Operation](#how-to-add-a-new-operation)
- [Running Tests](#running-tests)
- [Building Locally](#building-locally)
- [Code Style](#code-style)
- [Submitting a PR](#submitting-a-pr)

---

## Prerequisites

| Tool | Version |
|------|---------|
| Node.js | ≥ 18.0.0 |
| npm | ≥ 9.0.0 |
| FFmpeg | any recent version |
| TypeScript | ≥ 5.0 (installed via devDependencies) |

Install FFmpeg:
- **macOS:** `brew install ffmpeg`
- **Ubuntu/Debian:** `sudo apt install ffmpeg`
- **Windows:** https://ffmpeg.org/download.html

---

## Local Setup

```bash
git clone https://github.com/ArielleTolome/n8n-nodes-ffmpeg.git
cd n8n-nodes-ffmpeg
npm install
npm run build
npm test
```

---

## Project Structure

```
src/
  nodes/
    FfmpegVideo/       # Video operations (trim, merge, scale, …)
    FfmpegAudio/       # Audio operations (normalize, fade, pitch, …)
    FfmpegAnalyze/     # Analysis operations (probe, thumbnails, …)
    FfmpegAdvanced/    # Advanced/experimental (HLS, DASH, chroma key, …)
  utils/
    ffmpeg.utils.ts    # Shared helpers: runFfmpeg, resolveInput, quotePath, …
  __tests__/
    ffmpeg.utils.test.ts     # Unit tests for utilities
    node-descriptions.test.ts # Structural tests for all node descriptors
    ffmpeg.commands.test.ts  # Command-generation integration tests
dist/                  # Compiled output (auto-generated, do not edit)
examples/              # Real n8n workflow JSON examples
```

---

## How to Add a New Operation

### 1. Choose the right node

| Operation type | Node |
|----------------|------|
| Video manipulation | `FfmpegVideo` |
| Audio manipulation | `FfmpegAudio` |
| Media analysis / extraction | `FfmpegAnalyze` |
| Advanced / multi-step | `FfmpegAdvanced` |

### 2. Add the operation entry

Open the node file (e.g. `src/nodes/FfmpegVideo/FfmpegVideo.node.ts`) and find the `operation` property. Add your entry to the `options` array:

```typescript
{ name: 'My Operation', value: 'myOperation', description: 'Does something useful' },
```

### 3. Add operation parameters

Below the operation selector, add `INodeProperties` entries with `displayOptions.show.operation: ['myOperation']`:

```typescript
{
  displayName: 'My Param',
  name: 'myParam',
  type: 'string',
  default: '',
  required: true,
  displayOptions: { show: { operation: ['myOperation'] } },
  description: 'What this param does',
},
```

### 4. Implement the handler

In the node's `execute()` method, add a branch for your operation:

```typescript
} else if (operation === 'myOperation') {
  const tmpDir = createTempDir();
  try {
    const inputFile = await resolveInput(
      this.getNodeParameter('inputFile', i) as string,
      tmpDir,
    );
    const outputPath = path.join(tmpDir, `output.mp4`);

    // Build your ffmpeg command using quotePath() for all paths
    await runFfmpeg(
      `-i ${quotePath(inputFile)} -c:v libx264 ${quotePath(outputPath)} -y`,
    );

    const binaryData = buildBinaryData(outputPath);
    returnData.push({
      json: {},
      binary: { data: binaryData },
    });
  } finally {
    cleanupTempDir(tmpDir);
  }
}
```

**Key rules:**
- Always use `quotePath()` for file paths in ffmpeg commands — handles spaces and special characters.
- Always `cleanupTempDir()` in a `finally` block.
- Use `resolveInput()` for inputs — it handles both local paths and URLs.
- Use `ensureOutputDir()` if writing outside a temp dir.

### 5. Add tests

Add your operation to `src/__tests__/node-descriptions.test.ts` (the `has at least N operations` check) and add command-generation tests in `src/__tests__/ffmpeg.commands.test.ts`.

### 6. Update CHANGELOG.md

Add an entry under an `## [Unreleased]` section.

---

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage report
npm run test:coverage

# Run a specific test file
npx jest src/__tests__/ffmpeg.utils.test.ts
```

Tests use Jest + ts-jest. No real FFmpeg is needed — `child_process.exec` is mocked.

---

## Building Locally

```bash
npm run build
```

This runs `tsc` and then copies SVG icons into `dist/`. Check `dist/nodes/` to confirm all 4 nodes compiled.

To test in n8n locally:
```bash
# Link this package globally
npm link

# In your n8n home dir
cd ~/.n8n
mkdir custom
cd custom
npm link n8n-nodes-ffmpeg
```

---

## Code Style

- TypeScript strict mode is enabled (`strict: true` in tsconfig and ts-jest).
- ESLint enforces `@typescript-eslint` rules. Run `npm run lint:fix` before committing.
- No unused variables or parameters (enforced by tsconfig).
- All file paths in ffmpeg commands **must** use `quotePath()`.
- All temp dirs **must** be cleaned up in `finally` blocks.

---

## Submitting a PR

1. Fork the repo and create a branch: `git checkout -b feat/my-operation`
2. Make your changes and add tests.
3. Run `npm run build && npm test` — both must pass.
4. Run `npm run lint` — no errors.
5. Update `CHANGELOG.md`.
6. Open a PR against `main` with a clear description of what the operation does and a sample ffmpeg command.

PRs that include tests are merged much faster. Thank you!
