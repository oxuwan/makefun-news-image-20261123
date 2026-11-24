/**
 * Entrypoint for the newspaper front-page image entry (Monday 23 November 2026).
 *
 * Reads entry.png next to this file, validates that it is a real,
 * well-formed PNG of at most 1024x1024 and at most 1 MiB, and copies
 * its exact bytes to <output-dir>/entry.png. Fully deterministic: the
 * output is byte-identical to the input on every run.
 *
 * Output directory: $MAKEFUN_OUTPUT_DIR, or /output when unset.
 * Standard library only, no dependencies, no network.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const MAX_DIMENSION = 1024;
const MAX_FILE_SIZE = 1048576; // 1 MiB
const IHDR_LENGTH = 13;
const IEND_TAIL_LENGTH = 12;

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

function findInputFile(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const besideScript = join(here, "entry.png");
  if (existsSync(besideScript)) return besideScript;
  const besideCwd = resolve(process.cwd(), "entry.png");
  if (existsSync(besideCwd)) return besideCwd;
  fail("entry.png not found next to main.ts or in the current directory");
}

function parsePngDimensions(data: Buffer): { width: number; height: number } {
  if (data.length < PNG_SIGNATURE.length + 8 + IHDR_LENGTH + IEND_TAIL_LENGTH) {
    fail(`entry.png is too short to be a valid PNG (${data.length} bytes)`);
  }

  if (!data.subarray(0, PNG_SIGNATURE.length).equals(PNG_SIGNATURE)) {
    fail("entry.png does not start with the PNG signature");
  }

  const ihdrLength = data.readUInt32BE(8);
  const ihdrType = data.subarray(12, 16).toString("ascii");
  if (ihdrType !== "IHDR") {
    fail(`first PNG chunk is ${ihdrType}, expected IHDR`);
  }
  if (ihdrLength !== IHDR_LENGTH) {
    fail(`IHDR chunk has length ${ihdrLength}, expected ${IHDR_LENGTH}`);
  }

  const width = data.readUInt32BE(16);
  const height = data.readUInt32BE(20);
  if (width === 0 || height === 0) {
    fail(`PNG dimensions must be positive, got ${width}x${height}`);
  }
  if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
    fail(
      `PNG dimensions ${width}x${height} exceed the ${MAX_DIMENSION}x${MAX_DIMENSION} limit`,
    );
  }
  return { width, height };
}

function checkIendPresent(data: Buffer): void {
  // The IEND chunk is fixed: zero length, type "IEND", and the CRC of
  // the ASCII bytes "IEND" (0xAE426082). Checking the CRC as well as the
  // type catches a truncated or corrupted tail that merely ends in
  // the letters IEND.
  const IEND_CRC = 0xae426082;
  const tail = data.subarray(data.length - IEND_TAIL_LENGTH);
  const tailLength = tail.readUInt32BE(0);
  const tailType = tail.subarray(4, 8).toString("ascii");
  const tailCrc = tail.readUInt32BE(8);
  if (tailLength !== 0 || tailType !== "IEND") {
    fail("entry.png is missing the IEND chunk at the end of the file");
  }
  if (tailCrc !== IEND_CRC) {
    fail(
      `IEND chunk at the end of entry.png has a bad CRC (0x${tailCrc.toString(16)}), expected 0xae426082 — the file may be truncated or corrupted`,
    );
  }
}

function main(): void {
  const inputPath = findInputFile();
  const data = readFileSync(inputPath);

  if (data.length > MAX_FILE_SIZE) {
    fail(
      `entry.png is ${data.length} bytes, which exceeds the ${MAX_FILE_SIZE} byte (1 MiB) limit`,
    );
  }

  const { width, height } = parsePngDimensions(data);
  checkIendPresent(data);

  const outputDir = process.env.MAKEFUN_OUTPUT_DIR?.trim() || "/output";
  mkdirSync(outputDir, { recursive: true });

  const outputPath = join(outputDir, "entry.png");
  writeFileSync(outputPath, data);

  console.log(`Wrote ${outputPath} (${width}x${height}, ${data.length} bytes)`);
}

main();
