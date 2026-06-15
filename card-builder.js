(function () {
  "use strict";

  const SCHEMA_VERSION = 1;
  const STORAGE_KEY = "slime-racing-card-builder-v1";
  const TEMPLATE_TYPES_URL = "data/template-types.json";
  const ASSETS_URL = "data/assets.json";
  const layoutUtils = window.CardBuilderLayoutUtils;

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

  let originalTemplateTypes = [];
  let templateTypes = [];
  let assetsByCategory = createEmptyAssets();
  let loadError = "";
  let statusMessage = "";
  let statusKind = "info";
  let drawRunId = 0;
  let activePointerEdit = null;

  let state = {
    schemaVersion: SCHEMA_VERSION,
    selectedTemplateTypeId: "",
    selectedSlotId: "",
    templateAssetByType: {},
    slotStateByType: {},
    layoutEditorMode: false,
    showGuides: true,
    layoutTemplateTypes: null,
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

      originalTemplateTypes = normalizeTemplateTypes(templatePayload);
      templateTypes = state.layoutTemplateTypes
        ? normalizeTemplateTypes({
            version: SCHEMA_VERSION,
            templateTypes: state.layoutTemplateTypes,
          })
        : layoutUtils.cloneTemplateTypes(originalTemplateTypes);
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
    elements.layoutEditorToggle = document.getElementById("layoutEditorToggle");
    elements.guidesToggle = document.getElementById("guidesToggle");
    elements.layoutEditorPanel = document.getElementById("layoutEditorPanel");
    elements.layoutSlotDetails = document.getElementById("layoutSlotDetails");
    elements.layoutControls = document.getElementById("layoutControls");
    elements.layoutX = document.getElementById("layoutX");
    elements.layoutY = document.getElementById("layoutY");
    elements.layoutWidth = document.getElementById("layoutWidth");
    elements.layoutHeight = document.getElementById("layoutHeight");
    elements.layoutFit = document.getElementById("layoutFit");
    elements.layoutShape = document.getElementById("layoutShape");
    elements.layoutZIndex = document.getElementById("layoutZIndex");
    elements.templateTypesImport = document.getElementById("templateTypesImport");
  }

  function bindEvents() {
    document.addEventListener("click", handleClick);
    document.addEventListener("error", handleImageElementError, true);
    document.addEventListener("pointermove", handleLayoutPointerMove);
    document.addEventListener("pointerup", handleLayoutPointerUp);
    elements.templateTypeSelect.addEventListener("change", handleTemplateTypeChange);
    elements.layoutEditorToggle.addEventListener("change", handleLayoutEditorToggle);
    elements.guidesToggle.addEventListener("change", handleGuidesToggle);
    elements.slotControls.addEventListener("input", handleSlotControlInput);
    elements.slotControls.addEventListener("change", handleSlotControlInput);
    elements.layoutControls.addEventListener("input", handleLayoutControlInput);
    elements.layoutControls.addEventListener("change", handleLayoutControlInput);
    elements.slotOverlay.addEventListener("pointerdown", handleLayoutPointerDown);
    elements.templateTypesImport.addEventListener("change", handleTemplateTypesImport);
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
        layoutEditorMode: Boolean(parsed.layoutEditorMode),
        showGuides: parsed.showGuides !== false,
        layoutTemplateTypes: Array.isArray(parsed.layoutTemplateTypes)
          ? parsed.layoutTemplateTypes
          : null,
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
          layoutEditorMode: state.layoutEditorMode,
          showGuides: state.showGuides,
          layoutTemplateTypes: state.layoutTemplateTypes,
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
    renderLayoutEditor();
    renderAssetGallery();
    renderButtons();
    renderStatus();
    syncSlotControls();
    syncLayoutControls();
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

    const overlayClasses = [
      "slot-overlay",
      state.selectedSlotId ? "" : "is-idle",
      state.layoutEditorMode ? "is-editing" : "",
      state.showGuides ? "" : "is-hidden-guides",
    ]
      .filter(Boolean)
      .join(" ");
    elements.slotOverlay.className = overlayClasses;
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
          state.layoutEditorMode ? "is-editing" : "",
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
            ${state.layoutEditorMode && selected ? renderResizeHandles() : ""}
          </button>
        `;
      })
      .join("");
  }

  function renderResizeHandles() {
    return `
      <span class="resize-handle" data-handle="nw" aria-hidden="true"></span>
      <span class="resize-handle" data-handle="ne" aria-hidden="true"></span>
      <span class="resize-handle" data-handle="sw" aria-hidden="true"></span>
      <span class="resize-handle" data-handle="se" aria-hidden="true"></span>
    `;
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

    if (state.layoutEditorMode) {
      elements.slotDetails.innerHTML =
        '<p class="empty-state">Mode edition actif : utilise le panneau Layout Editor.</p>';
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

  function renderLayoutEditor() {
    elements.layoutEditorToggle.checked = state.layoutEditorMode;
    elements.guidesToggle.checked = state.showGuides;
    elements.layoutEditorPanel.hidden = !state.layoutEditorMode;

    if (!state.layoutEditorMode) {
      elements.layoutControls.hidden = true;
      return;
    }

    const type = getCurrentTemplateType();
    const slot = getSelectedSlot();
    if (!type || !slot) {
      elements.layoutSlotDetails.innerHTML =
        '<p class="empty-state">Selectionne un slot pour modifier ses zones.</p>';
      elements.layoutControls.hidden = true;
      return;
    }

    elements.layoutSlotDetails.innerHTML = `
      <strong>${escapeHtml(slot.label || slot.id)}</strong>
      <span>ID : ${escapeHtml(slot.id)}</span><br>
      <span>Categorie : ${escapeHtml(slot.category)}</span><br>
      <span>Type : ${escapeHtml(type.id)}</span>
    `;
    elements.layoutControls.hidden = false;
  }

  function renderAssetGallery() {
    const type = getCurrentTemplateType();
    const slot = getSelectedSlot();
    const templateAsset = getCurrentTemplateAsset();

    if (state.layoutEditorMode) {
      elements.assetCount.textContent = "0";
      elements.assetGallery.innerHTML =
        "<p class=\"empty-state\">Mode edition actif : la galerie d'images est desactivee.</p>";
      return;
    }

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
    elements.removeSlotButton.disabled = !selectedSlot || state.layoutEditorMode;
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

  function syncLayoutControls() {
    const slot = getSelectedSlot();
    if (!state.layoutEditorMode || !slot || elements.layoutControls.hidden) {
      return;
    }

    elements.layoutX.value = String(Math.round(Number(slot.x) || 0));
    elements.layoutY.value = String(Math.round(Number(slot.y) || 0));
    elements.layoutWidth.value = String(Math.max(1, Math.round(Number(slot.width) || 1)));
    elements.layoutHeight.value = String(
      Math.max(1, Math.round(Number(slot.height) || 1)),
    );
    elements.layoutFit.value = slot.fit === "cover" ? "cover" : "contain";
    elements.layoutShape.value = slot.shape === "circle" ? "circle" : "";
    elements.layoutZIndex.value = String(Math.max(0, Math.round(Number(slot.zIndex) || 0)));
  }

  function handleTemplateTypeChange(event) {
    state.selectedTemplateTypeId = event.target.value;
    state.selectedSlotId = "";
    saveState();
    setStatus("", "info");
    render();
    requestCanvasDraw();
  }

  function handleLayoutEditorToggle(event) {
    state.layoutEditorMode = event.target.checked;
    if (state.layoutEditorMode) {
      state.showGuides = true;
      setStatus("Mode edition des zones actif.", "info");
    } else {
      setStatus("", "info");
    }
    saveState();
    render();
    requestCanvasDraw();
  }

  function handleGuidesToggle(event) {
    state.showGuides = event.target.checked;
    saveState();
    render();
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
    } else if (action === "copy-current-type-json") {
      copyCurrentTypeJson();
    } else if (action === "download-template-types") {
      downloadTemplateTypesJson();
    } else if (action === "import-template-types") {
      elements.templateTypesImport.click();
    } else if (action === "reset-layout-json") {
      resetLayoutFromOriginalJson();
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

    if (state.layoutEditorMode) {
      setStatus("Slot selectionne pour edition des zones.", "info");
    } else if (!slotState.assetId) {
      setStatus("Slot selectionne sans image choisie.", "warning");
    } else {
      setStatus("", "info");
    }

    saveState();
    render();
    requestCanvasDraw();
  }

  function selectSlotAsset(assetId) {
    if (state.layoutEditorMode) {
      setStatus("Mode edition actif : selection d'image desactivee.", "warning");
      return;
    }

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

  function handleLayoutControlInput(event) {
    const slot = getSelectedSlot();
    if (!state.layoutEditorMode || !slot) {
      return;
    }

    const patch = {};
    if (event.target === elements.layoutX) {
      patch.x = elements.layoutX.value;
    } else if (event.target === elements.layoutY) {
      patch.y = elements.layoutY.value;
    } else if (event.target === elements.layoutWidth) {
      patch.width = elements.layoutWidth.value;
    } else if (event.target === elements.layoutHeight) {
      patch.height = elements.layoutHeight.value;
    } else if (event.target === elements.layoutFit) {
      patch.fit = elements.layoutFit.value;
    } else if (event.target === elements.layoutShape) {
      patch.shape = elements.layoutShape.value;
    } else if (event.target === elements.layoutZIndex) {
      patch.zIndex = elements.layoutZIndex.value;
    } else {
      return;
    }

    updateSelectedSlotLayout(patch);
  }

  function handleLayoutPointerDown(event) {
    if (!state.layoutEditorMode) {
      return;
    }

    const slotButton = event.target.closest(".slot-hotspot");
    if (!slotButton) {
      return;
    }

    event.preventDefault();
    const slot = getSlotById(slotButton.dataset.slotId);
    const type = getCurrentTemplateType();
    if (!slot || !type) {
      return;
    }

    state.selectedSlotId = slot.id;
    const handle = event.target.dataset.handle || "move";
    activePointerEdit = {
      handle,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startSlot: { ...slot },
      typeWidth: type.width,
      typeHeight: type.height,
    };
    saveState();
    render();
  }

  function handleLayoutPointerMove(event) {
    if (!activePointerEdit || event.pointerId !== activePointerEdit.pointerId) {
      return;
    }

    const type = getCurrentTemplateType();
    if (!type) {
      return;
    }

    const scale = getCanvasScale();
    const dx = (event.clientX - activePointerEdit.startClientX) * scale.x;
    const dy = (event.clientY - activePointerEdit.startClientY) * scale.y;
    const start = activePointerEdit.startSlot;
    const patch = getDragPatch(start, activePointerEdit.handle, dx, dy);
    updateSelectedSlotLayout(patch, { quiet: true });
  }

  function handleLayoutPointerUp(event) {
    if (!activePointerEdit || event.pointerId !== activePointerEdit.pointerId) {
      return;
    }

    activePointerEdit = null;
    saveState();
    setStatus("Layout sauvegarde localement.", "success");
  }

  function getCanvasScale() {
    const rect = elements.cardCanvas.getBoundingClientRect();
    const type = getCurrentTemplateType();
    return {
      x: type && rect.width ? type.width / rect.width : 1,
      y: type && rect.height ? type.height / rect.height : 1,
    };
  }

  function getDragPatch(start, handle, dx, dy) {
    const x = Number(start.x) || 0;
    const y = Number(start.y) || 0;
    const width = Number(start.width) || 1;
    const height = Number(start.height) || 1;

    if (handle === "move") {
      return {
        x: x + dx,
        y: y + dy,
      };
    }

    const patch = {};
    if (handle.includes("w")) {
      patch.x = x + dx;
      patch.width = width - dx;
    }
    if (handle.includes("e")) {
      patch.width = width + dx;
    }
    if (handle.includes("n")) {
      patch.y = y + dy;
      patch.height = height - dy;
    }
    if (handle.includes("s")) {
      patch.height = height + dy;
    }
    return patch;
  }

  function updateSelectedSlotLayout(patch, options = {}) {
    const type = getCurrentTemplateType();
    const slot = getSelectedSlot();
    if (!type || !slot) {
      return;
    }

    templateTypes = layoutUtils.updateSlotLayout(
      templateTypes,
      type.id,
      slot.id,
      patch,
    );
    state.layoutTemplateTypes = layoutUtils.cloneTemplateTypes(templateTypes);
    saveState();
    render();
    requestCanvasDraw();
    if (!options.quiet) {
      setStatus("Layout sauvegarde localement.", "success");
    }
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

  async function copyCurrentTypeJson() {
    const type = getCurrentTemplateType();
    if (!type) {
      setStatus("Aucun type courant a copier.", "warning");
      return;
    }

    const text = JSON.stringify(type, null, 2);
    try {
      await navigator.clipboard.writeText(text);
      setStatus("JSON du type actuel copie.", "success");
    } catch (error) {
      const textarea = document.createElement("textarea");
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      textarea.remove();
      setStatus("JSON du type actuel copie.", "success");
    }
  }

  function downloadTemplateTypesJson() {
    const payload = layoutUtils.buildTemplateTypesPayload(templateTypes);
    const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "template-types.json";
    link.click();
    URL.revokeObjectURL(link.href);
    setStatus("template-types.json telecharge.", "success");
  }

  function handleTemplateTypesImport(event) {
    const file = event.target.files && event.target.files[0];
    event.target.value = "";
    if (!file) {
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const payload = JSON.parse(String(reader.result || ""));
        const importedTypes = normalizeTemplateTypes(payload);
        templateTypes = importedTypes;
        state.layoutTemplateTypes = layoutUtils.cloneTemplateTypes(templateTypes);
        hydrateStateFromData();
        saveState();
        setStatus("template-types.json importe et sauvegarde localement.", "success");
        render();
        requestCanvasDraw();
      } catch (error) {
        setStatus("Import impossible : template-types.json invalide.", "error");
      }
    };
    reader.onerror = () => {
      setStatus("Import impossible : fichier illisible.", "error");
    };
    reader.readAsText(file);
  }

  function resetLayoutFromOriginalJson() {
    templateTypes = layoutUtils.cloneTemplateTypes(originalTemplateTypes);
    state.layoutTemplateTypes = null;
    state.selectedSlotId = "";
    hydrateStateFromData();
    saveState();
    setStatus("Layout restaure depuis le JSON original.", "success");
    render();
    requestCanvasDraw();
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
