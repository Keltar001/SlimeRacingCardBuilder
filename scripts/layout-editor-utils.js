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

  function normalizeText(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase();
  }

  function sanitizeFileName(value) {
    return String(value || "")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/_+/g, "_");
  }

  function createCardId(now) {
    return `card_${String(now || new Date().toISOString())
      .replace(/[^0-9a-zA-Z]+/g, "_")
      .replace(/^_+|_+$/g, "")}`;
  }

  function buildCardSnapshot(state, options) {
    const safeState = state || {};
    const settings = options || {};
    const now = settings.now || new Date().toISOString();
    const existingCard = settings.existingCard || null;
    const templateTypeId = safeState.selectedTemplateTypeId || "";
    const slotsByType = safeState.slotStateByType || {};

    return {
      id: existingCard && existingCard.id ? existingCard.id : createCardId(now),
      name: String(settings.cardName || "").trim(),
      templateTypeId,
      templateAssetId:
        ((safeState.templateAssetByType || {})[templateTypeId] || "").trim(),
      slots: cloneTemplateTypes([slotsByType[templateTypeId] || {}])[0],
      createdAt: existingCard && existingCard.createdAt ? existingCard.createdAt : now,
      updatedAt: now,
    };
  }

  function assetMatchesSearch(asset, searchText, category, quickFilter) {
    const safeAsset = asset || {};
    const haystack = normalizeText(
      `${safeAsset.id || ""} ${safeAsset.name || ""} ${safeAsset.src || ""} ${category || ""}`,
    );
    const query = normalizeText(searchText).trim();
    const filter = normalizeText(quickFilter).trim();

    return (!query || haystack.includes(query)) && (!filter || haystack.includes(filter));
  }

  function buildA4SheetLayout(cardCount, options) {
    const settings = options || {};
    const pageWidth = 210;
    const pageHeight = 297;
    const cardWidth = 63;
    const cardHeight = 88;
    const columns = 3;
    const rows = 3;
    const rowGap = settings.includeNames ? 4 : 0;
    const cardsPerPage = columns * rows;
    const marginX = (pageWidth - cardWidth * columns) / 2;
    const marginY = (pageHeight - cardHeight * rows - rowGap * (rows - 1)) / 2;
    const count = Math.max(0, Math.floor(Number(cardCount) || 0));
    const positions = Array.from({ length: count }, (_, index) => {
      const pageIndex = Math.floor(index / cardsPerPage);
      const pageSlot = index % cardsPerPage;
      const column = pageSlot % columns;
      const row = Math.floor(pageSlot / columns);
      return {
        index,
        pageIndex,
        column,
        row,
        x: marginX + column * cardWidth,
        y: marginY + row * (cardHeight + rowGap),
        width: cardWidth,
        height: cardHeight,
      };
    });

    return {
      pageWidth,
      pageHeight,
      cardWidth,
      cardHeight,
      columns,
      rows,
      rowGap,
      cardsPerPage,
      marginX,
      marginY,
      pageCount: count ? Math.ceil(count / cardsPerPage) : 0,
      positions,
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
    assetMatchesSearch,
    buildA4SheetLayout,
    buildCardSnapshot,
    buildTemplateTypesPayload,
    cloneTemplateTypes,
    sanitizeFileName,
    updateSlotLayout,
  };
});
