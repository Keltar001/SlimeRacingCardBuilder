(function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = "slime-racing-card-builder-v1";
  const TEMPLATE_TYPES_URL = "data/template-types.json";
  const ASSETS_URL = "data/assets.json";

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

  const DEFAULT_SLOT_STATE = {
    assetId: "",
    zoom: 1,
    offsetX: 0,
    offsetY: 0,
  };

  const elements = {};
  const imageCache = new Map();

  let templateTypes = [];
  let assetsByCategory = createEmptyAssets();
  let loadError = "";
  let statusMessage = "";
  let statusKind = "info";
  let drawRunId = 0;

  let state = {
    schemaVersion: SCHEMA_VERSION,
    selectedTemplateTypeId: "",
    selectedSlotId: "",
    templateAssetByType: {},
    slotStateByType: {},
  };

  document.addEventListener("DOMContentLoaded", init);

  async function init() {
    cacheElements();
    bindEvents();
    state = loadSavedState();
    render();

    try {
      const [templatePayload, assetPayload] = await Promise.all([
        loadJson(TEMPLATE_TYPES_URL, "template-types.json"),
        loadJson(ASSETS_URL, "assets.json"),
      ]);

      templateTypes = normalizeTemplateTypes(templatePayload);
      assetsByCategory = normalizeAssets(assetPayload);
      hydrateStateFromData();
      setStatus("", "info");
    } catch (error) {
      loadError = error.message || "Impossible de charger les donnees JSON.";
      setStatus(loadError, "error");
    }

    render();
    requestCanvasDraw();
  }

  function cacheElements() {
    elements.templateTypeSelect = document.getElementById("templateTypeSelect");
    elements.templateInfo = document.getElementById("templateInfo");
    elements.templateGallery = document.getElementById("templateGallery");
    elements.templateCount = document.getElementById("templateCount");
    elements.assetGallery = document.getElementById("assetGallery");
    elements.assetCount = document.getElementById("assetCount");
    elements.statusMessage = document.getElementById("statusMessage");
    elements.cardCanvas = document.getElementById("cardCanvas");
    elements.slotOverlay = document.getElementById("slotOverlay");
    elements.slotDetails = document.getElementById("slotDetails");
    elements.slotControls = document.getElementById("slotControls");
    elements.slotZoom = document.getElementById("slotZoom");
    elements.slotZoomNumber = document.getElementById("slotZoomNumber");
    elements.slotOffsetX = document.getElementById("slotOffsetX");
    elements.slotOffsetY = document.getElementById("slotOffsetY");
    elements.exportButton = document.getElementById("exportButton");
    elements.removeSlotButton = document.getElementById("removeSlotButton");
  }

  function bindEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("error", handleImageElementError, true);
    elements.templateTypeSelect.addEventListener("change", handleTemplateTypeChange);
    elements.slotControls.addEventListener("input", handleSlotControlInput);
    elements.slotControls.addEventListener("change", handleSlotControlInput);
  }

  async function loadJson(url, label) {
    let response;
    try {
      response = await fetch(url);
    } catch (error) {
      throw new Error(
        `Impossible de charger ${label}. Le Card Builder est prevu pour GitHub Pages.`,
      );
    }

    if (!response.ok) {
      throw new Error(`${label} introuvable (${response.status}).`);
    }

    try {
      return await response.json();
    } catch (error) {
      throw new Error(`JSON invalide dans ${label}.`);
    }
  }

  function normalizeTemplateTypes(payload) {
    if (!payload || payload.version !== SCHEMA_VERSION || !Array.isArray(payload.templateTypes)) {
      throw new Error("JSON invalide dans template-types.json.");
    }

    return payload.templateTypes
      .filter((type) => type && type.id && type.category)
      .map((type) => ({
        ...type,
        width: Number(type.width) || 1500,
        height: Number(type.height) || 2100,
        slots: Array.isArray(type.slots) ? type.slots : [],
      }));
  }

  function normalizeAssets(payload) {
    if (!payload || payload.version !== SCHEMA_VERSION || !payload.assets) {
      throw new Error("JSON invalide dans assets.json.");
    }

    return ASSET_CATEGORIES.reduce((result, category) => {
      result[category] = Array.isArray(payload.assets[category])
        ? payload.assets[category].filter((asset) => asset && asset.id && asset.src)
        : [];
      return result;
    }, {});
  }

  function createEmptyAssets() {
    return ASSET_CATEGORIES.reduce((result, category) => {
      result[category] = [];
      return result;
    }, {});
  }

  function hydrateStateFromData() {
    if (!templateTypes.length) {
      state.selectedTemplateTypeId = "";
      state.selectedSlotId = "";
      return;
    }

    const selectedType = getCurrentTemplateType();
    if (!selectedType) {
      state.selectedTemplateTypeId = templateTypes[0].id;
      state.selectedSlotId = "";
    }

    const currentType = getCurrentTemplateType();
    if (!currentType) {
      return;
    }

    const selectedTemplateAsset = getCurrentTemplateAsset();
    if (
      selectedTemplateAsset &&
      !getAssetsForCategory(currentType.category).some(
        (asset) => asset.id === selectedTemplateAsset.id,
      )
    ) {
      state.templateAssetByType[currentType.id] = "";
    }

    if (
      state.selectedSlotId &&
      !currentType.slots.some((slot) => slot.id === state.selectedSlotId)
    ) {
      state.selectedSlotId = "";
    }
  }

  function loadSavedState() {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (!saved) {
        return { ...state };
      }

      const parsed = JSON.parse(saved);
      if (!parsed || parsed.schemaVersion !== SCHEMA_VERSION) {
        statusMessage = "Ancienne sauvegarde ignoree : schemaVersion incompatible.";
        statusKind = "warning";
        return { ...state };
      }

      return {
        schemaVersion: SCHEMA_VERSION,
        selectedTemplateTypeId: parsed.selectedTemplateTypeId || "",
        selectedSlotId: parsed.selectedSlotId || "",
        templateAssetByType: parsed.templateAssetByType || {},
        slotStateByType: parsed.slotStateByType || {},
      };
    } catch (error) {
      statusMessage = "Sauvegarde locale ignoree : donnees illisibles.";
      statusKind = "warning";
      return { ...state };
    }
  }

  function saveState() {
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          schemaVersion: SCHEMA_VERSION,
          selectedTemplateTypeId: state.selectedTemplateTypeId,
          selectedSlotId: state.selectedSlotId,
          templateAssetByType: state.templateAssetByType,
          slotStateByType: state.slotStateByType,
        }),
      );
    } catch (error) {
      setStatus("Sauvegarde locale impossible.", "warning");
    }
  }

  function render() {
    renderTemplateTypeSelect();
    renderTemplateInfo();
    renderTemplateGallery();
    renderSlotOverlay();
    renderSlotDetails();
    renderAssetGallery();
    renderButtons();
    renderStatus();
    syncSlotControls();
  }

  function renderTemplateTypeSelect() {
    if (!templateTypes.length) {
      elements.templateTypeSelect.innerHTML =
        '<option value="">Aucun type disponible</option>';
      elements.templateTypeSelect.disabled = true;
      return;
    }

    elements.templateTypeSelect.disabled = false;
    elements.templateTypeSelect.innerHTML = templateTypes
      .map(
        (type) =>
          `<option value="${escapeHtml(type.id)}">${escapeHtml(type.name || type.id)}</option>`,
      )
      .join("");
    elements.templateTypeSelect.value = state.selectedTemplateTypeId;
  }

  function renderTemplateInfo() {
    const type = getCurrentTemplateType();
    if (!type) {
      elements.templateInfo.textContent = "Aucun type de template disponible.";
      return;
    }

    elements.templateInfo.textContent = `Template attendu : ${type.width}x${type.height} - ${type.slots.length} slot(s)`;
  }

  function renderTemplateGallery() {
    const type = getCurrentTemplateType();
    const selectedAsset = getCurrentTemplateAsset();
    const templates = type ? getAssetsForCategory(type.category) : [];

    elements.templateCount.textContent = String(templates.length);

    if (!type) {
      elements.templateGallery.innerHTML =
        '<p class="empty-state">Aucun type de template disponible.</p>';
      return;
    }

    if (!templates.length) {
      elements.templateGallery.innerHTML =
        '<p class="empty-state">Aucun template disponible pour ce type.</p>';
      return;
    }

    elements.templateGallery.innerHTML = templates
      .map((asset) =>
        renderThumbButton({
          action: "select-template-asset",
          asset,
          selected: selectedAsset && selectedAsset.id === asset.id,
        }),
      )
      .join("");
  }

  function renderSlotOverlay() {
    const type = getCurrentTemplateType();
    const templateAsset = getCurrentTemplateAsset();

    if (!type || !templateAsset) {
      elements.slotOverlay.innerHTML = "";
      elements.slotOverlay.className = "slot-overlay";
      return;
    }

    elements.slotOverlay.className = `slot-overlay${
      state.selectedSlotId ? "" : " is-idle"
    }`;
    elements.slotOverlay.innerHTML = type.slots
      .map((slot, index) => {
        const selected = state.selectedSlotId === slot.id;
        const left = (Number(slot.x) / type.width) * 100;
        const top = (Number(slot.y) / type.height) * 100;
        const width = (Number(slot.width) / type.width) * 100;
        const height = (Number(slot.height) / type.height) * 100;
        const classes = [
          "slot-hotspot",
          selected ? "is-selected" : "",
          slot.shape === "circle" ? "is-circle" : "",
        ]
          .filter(Boolean)
          .join(" ");

        return `
          <button
            type="button"
            class="${classes}"
            data-action="select-slot"
            data-slot-id="${escapeHtml(slot.id)}"
            style="left:${left}%;top:${top}%;width:${width}%;height:${height}%;z-index:${getSlotZIndex(slot, index)}"
            title="${escapeHtml(slot.label || slot.id)}">
            <span class="slot-label">${escapeHtml(slot.label || slot.id)}</span>
          </button>
        `;
      })
      .join("");
  }

  function renderSlotDetails() {
    const slot = getSelectedSlot();
    const type = getCurrentTemplateType();

    if (!type || !getCurrentTemplateAsset()) {
      elements.slotDetails.innerHTML =
        '<p class="empty-state">Choisis une image de template pour activer les slots.</p>';
      elements.slotControls.hidden = true;
      return;
    }

    if (!slot) {
      elements.slotDetails.innerHTML =
        '<p class="empty-state">Aucun slot selectionne.</p>';
      elements.slotControls.hidden = true;
      return;
    }

    const slotState = getSlotState(type.id, slot.id);
    const asset = slotState.assetId
      ? getAssetById(slot.category, slotState.assetId)
      : null;

    elements.slotDetails.innerHTML = `
      <strong>${escapeHtml(slot.label || slot.id)}</strong>
      <span>Categorie : ${escapeHtml(slot.category)}</span><br>
      <span>Position : ${Number(slot.x) || 0}, ${Number(slot.y) || 0} - ${Number(slot.width) || 0}x${Number(slot.height) || 0}</span><br>
      <span>${asset ? `Image : ${escapeHtml(asset.name || asset.id)}` : "Slot selectionne sans image choisie."}</span>
    `;
    elements.slotControls.hidden = false;
  }

  function renderAssetGallery() {
    const type = getCurrentTemplateType();
    const slot = getSelectedSlot();
    const templateAsset = getCurrentTemplateAsset();

    if (!type || !templateAsset || !slot) {
      elements.assetCount.textContent = "0";
      elements.assetGallery.innerHTML =
        '<p class="empty-state">Selectionne un slot pour afficher sa galerie.</p>';
      return;
    }

    const slotState = getSlotState(type.id, slot.id);
    const assets = getAssetsForCategory(slot.category);
    elements.assetCount.textContent = String(assets.length);

    if (!assets.length) {
      elements.assetGallery.innerHTML = `<p class="empty-state">Aucun asset dans la categorie ${escapeHtml(slot.category)}.</p>`;
      return;
    }

    elements.assetGallery.innerHTML = assets
      .map((asset) =>
        renderThumbButton({
          action: "select-slot-asset",
          asset,
          selected: slotState.assetId === asset.id,
        }),
      )
      .join("");
  }

  function renderThumbButton({ action, asset, selected }) {
    return `
      <button
        type="button"
        class="thumb-card${selected ? " is-selected" : ""}"
        data-action="${escapeHtml(action)}"
        data-asset-id="${escapeHtml(asset.id)}">
        <img src="${escapeHtml(asset.src)}" alt="${escapeHtml(asset.name || asset.id)}" loading="lazy">
        <span>${escapeHtml(asset.name || asset.id)}</span>
      </button>
    `;
  }

  function renderButtons() {
    const hasTemplate = Boolean(getCurrentTemplateAsset());
    const selectedSlot = getSelectedSlot();
    elements.exportButton.disabled = Boolean(loadError) || !hasTemplate;
    elements.removeSlotButton.disabled = !selectedSlot;
  }

  function renderStatus() {
    let message = statusMessage;
    let kind = statusKind;
    const type = getCurrentTemplateType();

    if (loadError) {
      message = loadError;
      kind = "error";
    } else if (!templateTypes.length) {
      message = "Aucun type de template disponible.";
      kind = "warning";
    } else if (type && !getCurrentTemplateAsset()) {
      message = "Choisis une image de template avant de placer des assets.";
      kind = "info";
    }

    elements.statusMessage.textContent = message;
    elements.statusMessage.className = `status-message is-${kind}`;
  }

  function syncSlotControls() {
    const type = getCurrentTemplateType();
    const slot = getSelectedSlot();
    if (!type || !slot || elements.slotControls.hidden) {
      return;
    }

    const slotState = getSlotState(type.id, slot.id);
    const zoom = Number(slotState.zoom) || 1;
    elements.slotZoom.value = String(clamp(zoom, 0.2, 3));
    elements.slotZoomNumber.value = String(roundForInput(zoom));
    elements.slotOffsetX.value = String(Math.round(Number(slotState.offsetX) || 0));
    elements.slotOffsetY.value = String(Math.round(Number(slotState.offsetY) || 0));
  }

  function handleTemplateTypeChange(event) {
    state.selectedTemplateTypeId = event.target.value;
    state.selectedSlotId = "";
    saveState();
    setStatus("", "info");
    render();
    requestCanvasDraw();
  }

  function handleClick(event) {
    const actionTarget = event.target.closest("[data-action]");
    if (!actionTarget) {
      return;
    }

    const action = actionTarget.dataset.action;

    if (action === "select-template-asset") {
      selectTemplateAsset(actionTarget.dataset.assetId);
    } else if (action === "select-slot") {
      selectSlot(actionTarget.dataset.slotId);
    } else if (action === "select-slot-asset") {
      selectSlotAsset(actionTarget.dataset.assetId);
    } else if (action === "reset-card") {
      resetCurrentCard();
    } else if (action === "remove-slot-image") {
      removeSelectedSlotImage();
    } else if (action === "reset-slot-position") {
      resetSelectedSlotPosition();
    } else if (action === "export-png") {
      exportPng();
    }
  }

  function selectTemplateAsset(assetId) {
    const type = getCurrentTemplateType();
    if (!type) {
      return;
    }

    state.templateAssetByType[type.id] = assetId || "";
    state.selectedSlotId = "";
    setStatus("", "info");
    saveState();
    render();
    requestCanvasDraw();
  }

  function selectSlot(slotId) {
    const slot = getSlotById(slotId);
    if (!slot || !getCurrentTemplateAsset()) {
      return;
    }

    state.selectedSlotId = slot.id;
    const type = getCurrentTemplateType();
    const slotState = getSlotState(type.id, slot.id);

    if (!slotState.assetId) {
      setStatus("Slot selectionne sans image choisie.", "warning");
    } else {
      setStatus("", "info");
    }

    saveState();
    render();
    requestCanvasDraw();
  }

  function selectSlotAsset(assetId) {
    const type = getCurrentTemplateType();
    const slot = getSelectedSlot();
    if (!type || !slot) {
      return;
    }

    const asset = getAssetById(slot.category, assetId);
    if (!asset) {
      setStatus(`Asset introuvable dans la categorie ${slot.category}.`, "error");
      return;
    }

    const slotState = getMutableSlotState(type.id, slot.id);
    const isNewAsset = slotState.assetId !== asset.id;
    slotState.assetId = asset.id;
    if (isNewAsset) {
      slotState.zoom = 1;
      slotState.offsetX = 0;
      slotState.offsetY = 0;
    }

    setStatus("", "info");
    saveState();
    render();
    requestCanvasDraw();
  }

  function resetCurrentCard() {
    const type = getCurrentTemplateType();
    if (!type) {
      return;
    }

    state.slotStateByType[type.id] = {};
    state.selectedSlotId = "";
    setStatus("Carte reinitialisee pour le type courant.", "success");
    saveState();
    render();
    requestCanvasDraw();
  }

  function removeSelectedSlotImage() {
    const type = getCurrentTemplateType();
    const slot = getSelectedSlot();
    if (!type || !slot) {
      return;
    }

    const slotState = getMutableSlotState(type.id, slot.id);
    if (!slotState.assetId) {
      setStatus("Slot selectionne sans image choisie.", "warning");
    } else {
      slotState.assetId = "";
      slotState.zoom = 1;
      slotState.offsetX = 0;
      slotState.offsetY = 0;
      setStatus("Image retiree du slot selectionne.", "success");
    }

    saveState();
    render();
    requestCanvasDraw();
  }

  function resetSelectedSlotPosition() {
    const type = getCurrentTemplateType();
    const slot = getSelectedSlot();
    if (!type || !slot) {
      return;
    }

    const slotState = getMutableSlotState(type.id, slot.id);
    slotState.zoom = 1;
    slotState.offsetX = 0;
    slotState.offsetY = 0;
    setStatus("Position du slot reinitialisee.", "success");
    saveState();
    render();
    requestCanvasDraw();
  }

  function handleSlotControlInput(event) {
    const type = getCurrentTemplateType();
    const slot = getSelectedSlot();
    if (!type || !slot) {
      return;
    }

    const slotState = getMutableSlotState(type.id, slot.id);
    if (event.target === elements.slotZoom || event.target === elements.slotZoomNumber) {
      slotState.zoom = clamp(Number(event.target.value) || 1, 0.05, 10);
    } else if (event.target === elements.slotOffsetX) {
      slotState.offsetX = clamp(Number(event.target.value) || 0, -5000, 5000);
    } else if (event.target === elements.slotOffsetY) {
      slotState.offsetY = clamp(Number(event.target.value) || 0, -5000, 5000);
    } else {
      return;
    }

    syncSlotControls();
    saveState();
    requestCanvasDraw();
  }

  async function exportPng() {
    if (!getCurrentTemplateAsset()) {
      setStatus("Export impossible : aucune template n'est choisie.", "error");
      renderStatus();
      return;
    }

    const drawn = await drawCanvas();
    if (!drawn) {
      renderStatus();
      return;
    }

    const type = getCurrentTemplateType();
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.download = `${type.id}-${date}.png`;
    link.href = elements.cardCanvas.toDataURL("image/png");
    link.click();
    setStatus("PNG HD exporte en taille reelle.", "success");
    renderStatus();
  }

  function requestCanvasDraw() {
    void drawCanvas();
  }

  async function drawCanvas() {
    const runId = ++drawRunId;
    const canvas = elements.cardCanvas;
    const context = canvas.getContext("2d");
    const type = getCurrentTemplateType();

    if (!type) {
      canvas.width = 1500;
      canvas.height = 2100;
      drawEmptyCanvas(context, canvas.width, canvas.height, "Aucun type disponible");
      return false;
    }

    if (canvas.width !== type.width || canvas.height !== type.height) {
      canvas.width = type.width;
      canvas.height = type.height;
    }

    context.clearRect(0, 0, canvas.width, canvas.height);

    const templateAsset = getCurrentTemplateAsset();
    if (!templateAsset) {
      drawEmptyCanvas(
        context,
        canvas.width,
        canvas.height,
        "Aucune image de template choisie",
      );
      return false;
    }

    let templateImage;
    try {
      templateImage = await loadImage(templateAsset.src);
    } catch (error) {
      if (runId === drawRunId) {
        drawEmptyCanvas(context, canvas.width, canvas.height, "Template introuvable");
        setStatus(`Image introuvable ou cassee : ${templateAsset.src}`, "error");
        renderStatus();
      }
      return false;
    }

    if (runId !== drawRunId) {
      return false;
    }

    context.drawImage(templateImage, 0, 0, canvas.width, canvas.height);

    const layers = type.slots
      .map((slot, index) => {
        const slotState = getSlotState(type.id, slot.id);
        const asset = slotState.assetId
          ? getAssetById(slot.category, slotState.assetId)
          : null;
        return { slot, index, slotState, asset };
      })
      .filter((layer) => layer.asset)
      .sort(
        (left, right) =>
          getSlotZIndex(left.slot, left.index) -
            getSlotZIndex(right.slot, right.index) || left.index - right.index,
      );

    for (const layer of layers) {
      try {
        const image = await loadImage(layer.asset.src);
        if (runId !== drawRunId) {
          return false;
        }
        drawSlotImage(context, image, layer.slot, layer.slotState);
      } catch (error) {
        if (runId === drawRunId) {
          setStatus(`Image introuvable ou cassee : ${layer.asset.src}`, "warning");
          renderStatus();
        }
      }
    }

    return true;
  }

  function drawEmptyCanvas(context, width, height, message) {
    context.clearRect(0, 0, width, height);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);
    context.strokeStyle = "#ccd8d0";
    context.lineWidth = 6;
    context.strokeRect(3, 3, width - 6, height - 6);
    context.fillStyle = "#607267";
    context.font = "700 54px system-ui, sans-serif";
    context.textAlign = "center";
    context.textBaseline = "middle";
    context.fillText(message, width / 2, height / 2);
  }

  function drawSlotImage(context, image, slot, slotState) {
    const slotX = Number(slot.x) || 0;
    const slotY = Number(slot.y) || 0;
    const slotWidth = Number(slot.width) || 0;
    const slotHeight = Number(slot.height) || 0;
    const fit = slot.fit || "contain";
    const baseScale =
      fit === "cover"
        ? Math.max(slotWidth / image.width, slotHeight / image.height)
        : Math.min(slotWidth / image.width, slotHeight / image.height);
    const scale = baseScale * (Number(slotState.zoom) || 1);
    const drawWidth = image.width * scale;
    const drawHeight = image.height * scale;
    const drawX =
      slotX + (slotWidth - drawWidth) / 2 + (Number(slotState.offsetX) || 0);
    const drawY =
      slotY + (slotHeight - drawHeight) / 2 + (Number(slotState.offsetY) || 0);

    context.save();
    context.beginPath();
    if (slot.shape === "circle") {
      context.arc(
        slotX + slotWidth / 2,
        slotY + slotHeight / 2,
        Math.min(slotWidth, slotHeight) / 2,
        0,
        Math.PI * 2,
      );
    } else {
      context.rect(slotX, slotY, slotWidth, slotHeight);
    }
    context.clip();
    context.drawImage(image, drawX, drawY, drawWidth, drawHeight);
    context.restore();
  }

  function loadImage(src) {
    if (imageCache.has(src)) {
      return imageCache.get(src);
    }

    const promise = new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(`Image introuvable : ${src}`));
      image.src = src;
    });

    imageCache.set(src, promise);
    return promise;
  }

  function handleImageElementError(event) {
    if (event.target && event.target.tagName === "IMG") {
      event.target.classList.add("is-broken");
      setStatus(
        `Image introuvable ou cassee : ${event.target.getAttribute("src")}`,
        "warning",
      );
      renderStatus();
    }
  }

  function getCurrentTemplateType() {
    return templateTypes.find((type) => type.id === state.selectedTemplateTypeId);
  }

  function getCurrentTemplateAsset() {
    const type = getCurrentTemplateType();
    if (!type) {
      return null;
    }

    const assetId = state.templateAssetByType[type.id] || "";
    return assetId ? getAssetById(type.category, assetId) : null;
  }

  function getAssetsForCategory(category) {
    return assetsByCategory[category] || [];
  }

  function getAssetById(category, assetId) {
    return getAssetsForCategory(category).find((asset) => asset.id === assetId) || null;
  }

  function getSlotById(slotId) {
    const type = getCurrentTemplateType();
    if (!type) {
      return null;
    }

    return type.slots.find((slot) => slot.id === slotId) || null;
  }

  function getSelectedSlot() {
    return state.selectedSlotId ? getSlotById(state.selectedSlotId) : null;
  }

  function getSlotState(typeId, slotId) {
    const typeSlots = state.slotStateByType[typeId] || {};
    return {
      ...DEFAULT_SLOT_STATE,
      ...(typeSlots[slotId] || {}),
    };
  }

  function getMutableSlotState(typeId, slotId) {
    if (!state.slotStateByType[typeId]) {
      state.slotStateByType[typeId] = {};
    }

    if (!state.slotStateByType[typeId][slotId]) {
      state.slotStateByType[typeId][slotId] = { ...DEFAULT_SLOT_STATE };
    }

    state.slotStateByType[typeId][slotId] = {
      ...DEFAULT_SLOT_STATE,
      ...state.slotStateByType[typeId][slotId],
    };
    return state.slotStateByType[typeId][slotId];
  }

  function getSlotZIndex(slot, index) {
    return Number.isFinite(Number(slot.zIndex)) ? Number(slot.zIndex) : index;
  }

  function setStatus(message, kind) {
    statusMessage = message || "";
    statusKind = kind || "info";
    renderStatus();
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
  }

  function roundForInput(value) {
    return Math.round(value * 100) / 100;
  }
})();
