import fs from "fs";
import sharp from "sharp";
import prettyBytes from "pretty-bytes";
import { SingleBar, Presets } from "cli-progress";
import applemojis from "./data/applemojis.js";

const outputJsonPath = "./output/applemojis.optimized.json";

// Load original JSON
const data = JSON.parse(JSON.stringify(applemojis));

// Backup original
fs.mkdirSync("./backup", { recursive: true });
fs.writeFileSync(
  "./backup/applemojis.backup.js",
  `export const applemojis = ${JSON.stringify(applemojis, null, 2)};`
);

// Prepare output folder
fs.mkdirSync("./output", { recursive: true });

// Progress bar
const bar = new SingleBar(
  {
    format: `Emoji Optimize | {bar} | {value}/{total} | {percentage}% | Saved: {saved}`,
  },
  Presets.shades_classic
);

let totalBefore = 0;
let totalAfter = 0;

// Optimized conversion with better compression
async function convertEmoji(emojiObj) {
  if (!emojiObj.emoji || !emojiObj.emoji.startsWith("data:image")) {
    return emojiObj;
  }

  const base64 = emojiObj.emoji.split(",")[1];
  const buffer = Buffer.from(base64, "base64");

  // Track original size
  const beforeSize = buffer.length;
  totalBefore += beforeSize;

  // Aggressive WebP compression with quality tuning
  const webpBuffer = await sharp(buffer)
    .resize(42, 42, {
      fit: "contain",
      kernel: sharp.kernel.lanczos3, // Best quality resampling
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .webp({
      quality: 75, // Slightly higher for better quality
      alphaQuality: 80, // Better alpha channel
      effort: 6, // Max compression effort (0-6)
      lossless: false,
      nearLossless: false,
      smartSubsample: true, // Better color subsampling
    })
    .toBuffer();

  const afterSize = webpBuffer.length;
  totalAfter += afterSize;

  emojiObj.emoji = `data:image/webp;base64,${webpBuffer.toString("base64")}`;
  return emojiObj;
}

// Batch processing for better performance
async function convertBatch(batch) {
  return Promise.all(batch.map(convertEmoji));
}

async function run() {
  bar.start(data.length, 0, { saved: "0B" });

  // Process in batches of 50 for parallelization
  const batchSize = 50;
  let processed = 0;

  for (let i = 0; i < data.length; i += batchSize) {
    const batch = data.slice(i, i + batchSize);
    const results = await convertBatch(batch);

    // Update data array with results
    results.forEach((result, idx) => {
      data[i + idx] = result;
    });

    processed += batch.length;
    const savedBytes = totalBefore - totalAfter;
    bar.update(Math.min(processed, data.length), {
      saved: prettyBytes(savedBytes),
    });
  }

  bar.stop();

  // Save finished optimized JSON
  fs.writeFileSync(
    "./output/applemojis.optimized.js",
    `export const applemojis = ${JSON.stringify(data, null, 2)};`
  );

  console.log("\n✅ Optimization Complete!\n");
  console.log(`Original Size:  ${prettyBytes(totalBefore)}`);
  console.log(`Optimized Size: ${prettyBytes(totalAfter)}`);
  console.log(
    `📉 Saved:        ${prettyBytes(totalBefore - totalAfter)} (${(
      (1 - totalAfter / totalBefore) *
      100
    ).toFixed(1)}%)`
  );
  console.log(`💾 Output saved to: ${outputJsonPath}\n`);
}

run();
