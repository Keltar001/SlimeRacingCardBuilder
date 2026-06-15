const assert = require("node:assert/strict");
const test = require("node:test");

const {
  buildTemplateTypesPayload,
  cloneTemplateTypes,
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
