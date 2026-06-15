const assert = require("node:assert/strict");
const test = require("node:test");

const {
  assetMatchesSearch,
  buildCardSnapshot,
  buildTemplateTypesPayload,
  cloneTemplateTypes,
  sanitizeFileName,
  updateSlotLayout,
} = require("./layout-editor-utils.js");

const templateTypes = [
  {
    id: "template_slime_bi",
    name: "Slime bi-terrain",
    category: "template_slime_bi",
    width: 1500,
    height: 2100,
    slots: [
      {
        id: "slime_main",
        label: "Image Slime",
        category: "slime",
        x: 300,
        y: 420,
        width: 900,
        height: 850,
        fit: "contain",
        zIndex: 10,
      },
    ],
  },
  {
    id: "template_bonus",
    name: "Bonus",
    category: "template_bonus",
    width: 1500,
    height: 2100,
    slots: [],
  },
];

test("updateSlotLayout updates one slot without mutating the source", () => {
  const next = updateSlotLayout(templateTypes, "template_slime_bi", "slime_main", {
    x: 125.7,
    y: -20,
    width: 0,
    height: 333.2,
    fit: "cover",
    shape: "circle",
    zIndex: 25.8,
  });

  const slot = next[0].slots[0];
  assert.equal(slot.x, 126);
  assert.equal(slot.y, 0);
  assert.equal(slot.width, 1);
  assert.equal(slot.height, 333);
  assert.equal(slot.fit, "cover");
  assert.equal(slot.shape, "circle");
  assert.equal(slot.zIndex, 26);
  assert.equal(templateTypes[0].slots[0].x, 300);
});

test("buildTemplateTypesPayload returns a complete versioned payload", () => {
  const cloned = cloneTemplateTypes(templateTypes);
  const payload = buildTemplateTypesPayload(cloned);

  assert.equal(payload.version, 1);
  assert.deepEqual(
    payload.templateTypes.map((type) => type.id),
    ["template_slime_bi", "template_bonus"],
  );
  assert.equal(payload.templateTypes[0].slots[0].fit, "contain");
});

test("sanitizeFileName creates stable export-safe names", () => {
  assert.equal(sanitizeFileName("Slime Eau / Plaine lvl2"), "Slime_Eau_Plaine_lvl2");
  assert.equal(sanitizeFileName("  Éclair spécial !!!  "), "Eclair_special");
  assert.equal(sanitizeFileName(""), "");
});

test("buildCardSnapshot stores card identity and selected slot state", () => {
  const now = "2026-06-15T12:00:00.000Z";
  const snapshot = buildCardSnapshot(
    {
      selectedTemplateTypeId: "template_slime_mono",
      templateAssetByType: { template_slime_mono: "template_1" },
      slotStateByType: {
        template_slime_mono: {
          slime_main: { assetId: "slime_1", zoom: 1.2, offsetX: 3, offsetY: -4 },
        },
      },
    },
    {
      cardName: "Slime Test",
      existingCard: { id: "card_1", createdAt: "2026-06-14T10:00:00.000Z" },
      now,
    },
  );

  assert.equal(snapshot.id, "card_1");
  assert.equal(snapshot.name, "Slime Test");
  assert.equal(snapshot.templateTypeId, "template_slime_mono");
  assert.equal(snapshot.templateAssetId, "template_1");
  assert.equal(snapshot.createdAt, "2026-06-14T10:00:00.000Z");
  assert.equal(snapshot.updatedAt, now);
  assert.deepEqual(snapshot.slots.slime_main, {
    assetId: "slime_1",
    zoom: 1.2,
    offsetX: 3,
    offsetY: -4,
  });
});

test("assetMatchesSearch filters by text, category, terrain, and level", () => {
  const asset = {
    id: "slime_eau_plaine_lvl2",
    name: "Slime Eau Plaine Lvl2",
    src: "assets/card-builder/slimes/SlimeEauPlainelvl2_transparent.png",
  };

  assert.equal(assetMatchesSearch(asset, "plaine", "slime", ""), true);
  assert.equal(assetMatchesSearch(asset, "icon", "slime", ""), false);
  assert.equal(assetMatchesSearch(asset, "", "slime", "eau"), true);
  assert.equal(assetMatchesSearch(asset, "", "slime", "lvl2"), true);
  assert.equal(assetMatchesSearch(asset, "", "slime", "desert"), false);
});
