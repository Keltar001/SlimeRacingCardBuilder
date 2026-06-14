const fs = require("node:fs");
const path = require("node:path");

// Usage: node CardBuilder/scripts/generate-assets-json.js

const VERSION = 1;
const CARD_BUILDER_ROOT = path.resolve(__dirname, "..");
const IMAGE_EXTENSIONS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

const ASSET_CATEGORIES = [
  "template_bonus",
  "template_creature",
  "template_slime_mono",
  "template_slime_bi",
  "template_slime_tri",
  "template_slime_secret",
  "template_slime_ultime",
  "slime",
  "creature",
  "icon",
  "bonus_asset",
  "restriction",
  "level",
  "marker",
];

const CATEGORY_PATHS = [
  { prefix: "templates/bonus/", category: "template_bonus" },
  { prefix: "templates/creature/", category: "template_creature" },
  { prefix: "templates/slime/mono/", category: "template_slime_mono" },
  { prefix: "templates/slime/bi/", category: "template_slime_bi" },
  { prefix: "templates/slime/tri/", category: "template_slime_tri" },
  { prefix: "templates/slime/secret/", category: "template_slime_secret" },
  { prefix: "templates/slime/ultime/", category: "template_slime_ultime" },
  { prefix: "slimes/", category: "slime" },
  { prefix: "creatures/", category: "creature" },
  { prefix: "icons/", category: "icon" },
  { prefix: "bonus/", category: "bonus_asset" },
  { prefix: "restrictions/", category: "restriction" },
  { prefix: "levels/", category: "level" },
  { prefix: "markers/", category: "marker" },
];

function normalizeSlashes(value) {
  return value.split(path.sep).join("/");
}

function slugifyId(value) {
  const slug = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return slug || "asset";
}

function toAssetName(value) {
  return value
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .split(" ")
    .map((word) =>
      word ? `${word[0].toLocaleUpperCase("fr-FR")}${word.slice(1)}` : word,
    )
    .join(" ");
}

function createEmptyAssets() {
  return ASSET_CATEGORIES.reduce((assets, category) => {
    assets[category] = [];
    return assets;
  }, {});
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
  }

  const files = [];
  const entries = fs
    .readdirSync(rootDir, { withFileTypes: true })
    .sort((a, b) => a.name.localeCompare(b.name, "en"));

  entries.forEach((entry) => {
    const entryPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(entryPath));
    } else if (entry.isFile()) {
      files.push(entryPath);
    }
  });

  return files;
}

function getCategory(relativePath) {
  const normalizedPath = normalizeSlashes(relativePath).toLowerCase();
  const mapping = CATEGORY_PATHS.find((entry) =>
    normalizedPath.startsWith(entry.prefix),
  );
  return mapping ? mapping.category : null;
}

function makeUniqueId(baseId, usedIds) {
  if (!usedIds.has(baseId)) {
    usedIds.add(baseId);
    return baseId;
  }

  let suffix = 2;
  let nextId = `${baseId}_${suffix}`;
  while (usedIds.has(nextId)) {
    suffix += 1;
    nextId = `${baseId}_${suffix}`;
  }

  usedIds.add(nextId);
  return nextId;
}

function buildAssetsPayload(assetsRoot) {
  const assets = createEmptyAssets();
  const usedIdsByCategory = ASSET_CATEGORIES.reduce((result, category) => {
    result[category] = new Set();
    return result;
  }, {});

  const files = walkFiles(assetsRoot).sort((a, b) =>
    normalizeSlashes(path.relative(assetsRoot, a)).localeCompare(
      normalizeSlashes(path.relative(assetsRoot, b)),
      "en",
    ),
  );

  files.forEach((filePath) => {
    const extension = path.extname(filePath).toLowerCase();
    if (!IMAGE_EXTENSIONS.has(extension)) {
      return;
    }

    const relativePath = normalizeSlashes(path.relative(assetsRoot, filePath));
    const category = getCategory(relativePath);
    if (!category) {
      return;
    }

    const baseName = path.basename(filePath, path.extname(filePath));
    const baseId = slugifyId(baseName);
    const id = makeUniqueId(baseId, usedIdsByCategory[category]);

    assets[category].push({
      id,
      name: toAssetName(baseName),
      src: `assets/card-builder/${relativePath}`,
    });
  });

  return {
    version: VERSION,
    assets,
  };
}

function writeAssetsJson({
  assetsRoot = path.join(CARD_BUILDER_ROOT, "assets", "card-builder"),
  outputPath = path.join(CARD_BUILDER_ROOT, "data", "assets.json"),
} = {}) {
  const payload = buildAssetsPayload(assetsRoot);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  return payload;
}

if (require.main === module) {
  const payload = writeAssetsJson();
  const total = Object.values(payload.assets).reduce(
    (sum, entries) => sum + entries.length,
    0,
  );
  console.log(`Generated CardBuilder/data/assets.json with ${total} image asset(s).`);
}

module.exports = {
  ASSET_CATEGORIES,
  CATEGORY_PATHS,
  buildAssetsPayload,
  getCategory,
  normalizeSlashes,
  slugifyId,
  writeAssetsJson,
};
