(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.CardBuilderLayoutUtils = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  const VERSION = 1;

  function cloneTemplateTypes(templateTypes) {
    return JSON.parse(JSON.stringify(Array.isArray(templateTypes) ? templateTypes : []));
  }

  function buildTemplateTypesPayload(templateTypes) {
    return {
      version: VERSION,
      templateTypes: cloneTemplateTypes(templateTypes),
    };
  }

  function sanitizeNumber(value, fallback, min) {
    const parsed = Number(value);
    const next = Number.isFinite(parsed) ? parsed : fallback;
    return Math.max(Math.round(next), min);
  }

  function sanitizeFit(value, fallback) {
    return value === "cover" || value === "contain" ? value : fallback || "contain";
  }

  function sanitizeShape(value) {
    return value === "circle" ? "circle" : undefined;
  }

  function updateSlotLayout(templateTypes, typeId, slotId, patch) {
    const next = cloneTemplateTypes(templateTypes);
    const type = next.find((entry) => entry.id === typeId);
    if (!type || !Array.isArray(type.slots)) {
      return next;
    }

    const slot = type.slots.find((entry) => entry.id === slotId);
    if (!slot) {
      return next;
    }

    if (Object.prototype.hasOwnProperty.call(patch, "x")) {
      slot.x = sanitizeNumber(patch.x, slot.x || 0, 0);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "y")) {
      slot.y = sanitizeNumber(patch.y, slot.y || 0, 0);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "width")) {
      slot.width = sanitizeNumber(patch.width, slot.width || 1, 1);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "height")) {
      slot.height = sanitizeNumber(patch.height, slot.height || 1, 1);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "fit")) {
      slot.fit = sanitizeFit(patch.fit, slot.fit);
    }
    if (Object.prototype.hasOwnProperty.call(patch, "shape")) {
      const shape = sanitizeShape(patch.shape);
      if (shape) {
        slot.shape = shape;
      } else {
        delete slot.shape;
      }
    }
    if (Object.prototype.hasOwnProperty.call(patch, "zIndex")) {
      slot.zIndex = sanitizeNumber(patch.zIndex, slot.zIndex || 0, 0);
    }

    return next;
  }

  return {
    buildTemplateTypesPayload,
    cloneTemplateTypes,
    updateSlotLayout,
  };
});
