const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const {
  ASSET_CATEGORIES,
  buildAssetsPayload,
  slugifyId,
} = require("./generate-assets-json.js");

function createTempWorkspace() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "card-builder-assets-"));
  const assetsRoot = path.join(root, "assets", "card-builder");
  fs.mkdirSync(assetsRoot, { recursive: true });
  return { root, assetsRoot };
}

function writeFile(root, relativePath) {
  const filePath = path.join(root, ...relativePath.split("/"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, "test");
}

test("slugifyId generates stable ASCII ids from file names", () => {
  assert.equal(slugifyId("Slime Eau Plaine Lvl2"), "slime_eau_plaine_lvl2");
  assert.equal(slugifyId("Icône Terrain 1"), "icone_terrain_1");
  assert.equal(slugifyId("!!!"), "asset");
});

test("buildAssetsPayload classifies image files deterministically", () => {
  const { assetsRoot } = createTempWorkspace();

  writeFile(assetsRoot, "templates/slime/bi/Slime Bi 01.PNG");
  writeFile(assetsRoot, "templates/slime/bi/Slime-Bi-01.webp");
  writeFile(assetsRoot, "templates/bonus/Bonus Template.jpeg");
  writeFile(assetsRoot, "slimes/Slime Eau Plaine Lvl2.png");
  writeFile(assetsRoot, "icons/Icône Terrain 1.JPG");
  writeFile(assetsRoot, "icons/readme.txt");
  writeFile(assetsRoot, "unknown/ignored.png");

  const payload = buildAssetsPayload(assetsRoot);

  assert.equal(payload.version, 1);
  assert.deepEqual(Object.keys(payload.assets), ASSET_CATEGORIES);
  assert.deepEqual(
    payload.assets.template_slime_bi.map((asset) => asset.id),
    ["slime_bi_01", "slime_bi_01_2"],
  );
  assert.equal(
    payload.assets.template_slime_bi[0].src,
    "assets/card-builder/templates/slime/bi/Slime Bi 01.PNG",
  );
  assert.equal(payload.assets.icon[0].id, "icone_terrain_1");
  assert.equal(payload.assets.icon[0].name, "Icône Terrain 1");
  assert.equal(payload.assets.slime[0].id, "slime_eau_plaine_lvl2");
  assert.equal(payload.assets.template_bonus[0].id, "bonus_template");
  assert.deepEqual(payload.assets.creature, []);
});
