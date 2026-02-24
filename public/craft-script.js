// ============================================
// State
// ============================================
let undoStacks = { board: [], map: [] };
let redoStacks = { board: [], map: [] };
const MAX_UNDO = 50;
let cardClipboard = null;

let boards = [
  { id: 'board-1', name: 'Board 1', cards: [], connections: [] },
];
let currentBoardId = 'board-1';

let maps = [
  {
    id: 'map-1',
    name: 'Map 1',
    imageUrl: '',
    pins: [],
    scale: { pixels: 100, distance: 1, unit: 'miles' }
  },
];
let currentMapId = 'map-1';

let chapters = [
  {
    id: 'chapter-1',
    label: 'Chapter 1',
    title: 'New Chapter',
    content: '',
    words: 0,
  },
];
let currentChapterId = 'chapter-1';
let chapterFolders = []; // { id, name, collapsed, hidden }

// Bidirectional associations: { sourceType, sourceId, targetType, targetId }
let associations = [];

let selectedCard = null;
let multiSelectedCards = new Set();
let isMarqueeSelecting = false;
let marqueeStart = null;
let selectedPin = null;
let currentTool = 'select';
let mapTool = 'map-select';

// Utility: upload image file to R2, returns promise with URL. Falls back to base64 on failure.
function uploadFileImage(file, callback) {
  if (window.craftUploadImage) {
    window.craftUploadImage(file)
      .then(url => callback(url))
      .catch(() => {
        const r = new FileReader();
        r.onload = () => callback(r.result);
        r.readAsDataURL(file);
      });
  } else {
    const r = new FileReader();
    r.onload = () => callback(r.result);
    r.readAsDataURL(file);
  }
}

// Destination markers (map view)
let destinationMarkers = [];
let selectedDestinationId = null;

let zoom = 1;
let mapZoom = 1;
let panOffset = { x: 0, y: 0 };
let mapPanOffset = { x: 0, y: 0 };
let isPanning = false;
let isMapPanning = false;
let panStart = { x: 0, y: 0 };
let isDragging = false;
let isDraggingPin = false;
let isResizing = false;
let dragOffset = { x: 0, y: 0 };
let snapEnabled = false;
const SNAP_GRID = 20;
const SNAP_THRESHOLD = 12;
let currentView = 'board';
let connectingFrom = null;
let lastDiceResult = null;
let diceHistory = [];
let contextMenuCard = null;
let contextMenuPin = null;
let contextMenuMap = null;
let contextMenuTable = null;
let contextMenuCell = null;
let contextMenuPosition = { x: 0, y: 0 };
let popupCallback = null;
let imageUploadCallback = null;
let imageUploadTarget = null;
let pendingSelection = null;
let editingPinId = null;
let editingMapId = null;

// Measurement state
let measurementStart = null;
let measurementEnd = null;
let isMeasuring = false;

const cardColors = {
  character: '#4ecdc4',
  location: '#22c55e',
  item: '#d4a824',
  note: '#8b5cf6',
  quest: '#ff6b35',
  statblock: '#f43f5e',
  chart: '#14b8a6',
  bar: '#ef4444',
  stress: '#f97316',
  injury: '#f43f5e',
  body: '#8b5cf6',
  image: '#888888',
  text: '#a07810',
  randomizer: '#e879a8',
};

// ============================================
// Initialization
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  initBoards();
  initMaps();
  initChapters();
  initEventListeners();
  updateCanvas();
  updateStatusBar();
});

function initBoards() {
  renderBoardsList();
}

function initMaps() {
  renderMapsList();
}

function initChapters() {
  renderChaptersList();
}

function initEventListeners() {
  // View toggle
  document.getElementById('boardViewBtn').addEventListener('click', () => switchView('board'));
  document.getElementById('mapViewBtn').addEventListener('click', () => switchView('map'));
  document.getElementById('writeViewBtn').addEventListener('click', () => switchView('write'));
  document.getElementById('timelineViewBtn').addEventListener('click', () => switchView('timeline'));
  document.getElementById('combatViewBtn')?.addEventListener('click', () => switchView('combat'));
  document.getElementById('factionViewBtn')?.addEventListener('click', () => switchView('factions'));
  document.getElementById('mindmapViewBtn')?.addEventListener('click', () => switchView('mindmap'));
  document.getElementById('soundboardViewBtn')?.addEventListener('click', () => switchView('soundboard'));
  initMindMapEvents();

  // Sidebar toggle
  document.getElementById('toggleSidebarBtn').addEventListener('click', toggleSidebar);

  // Details panel toggle
  document.getElementById('togglePanelBtn').addEventListener('click', toggleDetailsPanel);
  document.getElementById('closePanelBtn').addEventListener('click', () => {
    document.getElementById('detailsPanel').classList.add('collapsed');
  });

  // Collapsible templates
  document.getElementById('templatesHeader').addEventListener('click', toggleTemplates);

  // Card templates
  document.querySelectorAll('.template-btn[data-type]').forEach((btn) => {
    btn.addEventListener('click', () => addCard(btn.dataset.type));
  });

  // Tool buttons (board)
  document.querySelectorAll('.tool-btn[data-tool]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const tool = btn.dataset.tool;
      if (tool.startsWith('map-')) {
        setMapTool(tool);
      } else {
        setTool(tool);
      }
    });
  });

  // Zoom controls (board)
  document.getElementById('zoomInBtn').addEventListener('click', zoomIn);
  document.getElementById('zoomOutBtn').addEventListener('click', zoomOut);
  document.getElementById('zoomFitBtn').addEventListener('click', zoomFit);
  document.getElementById('snapToggleBtn')?.addEventListener('click', toggleSnap);

  // Zoom controls (map)
  document.getElementById('mapZoomInBtn').addEventListener('click', mapZoomIn);
  document.getElementById('mapZoomOutBtn').addEventListener('click', mapZoomOut);
  document.getElementById('mapZoomFitBtn').addEventListener('click', mapZoomFit);
  document.getElementById('mapZoomWidthBtn').addEventListener('click', mapZoomWidth);
  document.getElementById('mapZoomHeightBtn').addEventListener('click', mapZoomHeight);
  document.getElementById('mapZoomCenterBtn').addEventListener('click', mapZoomCenter);

  // Add board/chapter/map
  document.getElementById('addBoardBtn').addEventListener('click', addBoard);
  document.getElementById('addChapterBtn').addEventListener('click', addChapter);
  document.getElementById('addFolderBtn')?.addEventListener('click', addChapterFolder);
  document.getElementById('addMapBtn').addEventListener('click', createNewMap);

  // Details inputs
  document.getElementById('detailName').addEventListener('input', updateSelectedCard);
  document.getElementById('detailDescription').addEventListener('input', updateSelectedCard);
  document.getElementById('detailTags').addEventListener('input', updateSelectedCard);

  // Card styling
  document.getElementById('cardFontFamily').addEventListener('change', updateCardStyle);
  document.getElementById('cardFontSize').addEventListener('change', updateCardStyle);
  document.getElementById('toolbarTitleColor')?.addEventListener('input', (e) => { const d = document.getElementById('detailTitleColor'); if (d) d.value = e.target.value; updateCardStyle(); });
  document.getElementById('toolbarLabelColor')?.addEventListener('input', (e) => { const d = document.getElementById('detailLabelColor'); if (d) d.value = e.target.value; updateCardStyle(); });
  document.getElementById('toolbarTextColor')?.addEventListener('input', (e) => { const d = document.getElementById('detailTextColor'); if (d) d.value = e.target.value; updateCardStyle(); });
  document.getElementById('detailLabelColor')?.addEventListener('input', (e) => { const t = document.getElementById('toolbarLabelColor'); if (t) t.value = e.target.value; updateCardStyle(); });
  document.getElementById('detailTextColor')?.addEventListener('input', (e) => { const t = document.getElementById('toolbarTextColor'); if (t) t.value = e.target.value; updateCardStyle(); });
  document.getElementById('detailTitleColor')?.addEventListener('input', (e) => { const t = document.getElementById('toolbarTitleColor'); if (t) t.value = e.target.value; updateCardStyle(); });
  document.getElementById('toolbarBgColor')?.addEventListener('input', updateCardStyle);

  // Toolbar border, design, hide header/tags
  document.getElementById('toolbarBorderStyle')?.addEventListener('change', updateCardToolbarExtras);
  document.getElementById('toolbarBorderColor')?.addEventListener('input', updateCardToolbarExtras);
  document.getElementById('toolbarCardDesign')?.addEventListener('change', updateCardToolbarExtras);
  document.getElementById('toolbarHideHeader')?.addEventListener('change', updateCardToolbarExtras);
  document.getElementById('toolbarHideTags')?.addEventListener('change', updateCardToolbarExtras);
  document.getElementById('toolbarFontFamily')?.addEventListener('change', updateCardToolbarExtras);
  document.getElementById('toolbarFontSize')?.addEventListener('change', updateCardToolbarExtras);
  document.getElementById('toolbarSharpEdge')?.addEventListener('change', updateCardToolbarExtras);
  const cardTopColorEl = document.getElementById('cardTopColor');
  if (cardTopColorEl) cardTopColorEl.addEventListener('input', updateCardStyle);

  // Board top accent picker (Photoshop-style toolbar)
  const cardTopAccentPicker = document.getElementById('cardTopAccentPicker');
  if (cardTopAccentPicker) {
    cardTopAccentPicker.addEventListener('input', () => {
      if (!selectedCard) return;
      const board = getCurrentBoard();
      const cardData = board?.cards?.find((c) => c.id === selectedCard.id);
      if (!cardData) return;
      cardData.topColor = cardTopAccentPicker.value;
      refreshCard(cardData);
    });
  }

  // Quick card top accent control (Board toolbar)
  const quickTop = document.getElementById('quickTopColor');
  if (quickTop) {
    quickTop.addEventListener('input', () => {
      if (!selectedCard) return;
      const board = getCurrentBoard();
      const cardData = board?.cards?.find((c) => c.id === selectedCard.id);
      if (!cardData) return;
      cardData.topColor = quickTop.value;
      refreshCard(cardData);
    });
  }

  // Toolbar card title sync
  const toolbarTitle = document.getElementById('toolbarCardTitle');
  if (toolbarTitle) {
    toolbarTitle.addEventListener('input', () => {
      if (!selectedCard) return;
      const board = getCurrentBoard();
      const cardData = board?.cards?.find((c) => c.id === selectedCard.id);
      if (!cardData) return;
      cardData.title = toolbarTitle.value;
      // Sync with details panel
      document.getElementById('detailName').value = toolbarTitle.value;
      refreshCard(cardData);
    });
  }


  // Text alignment
  document.querySelectorAll('.align-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.align-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      updateTextAlignment(btn.dataset.align);
    });
  });

  // Text style
  document.getElementById('textStyleSelect').addEventListener('change', updateTextCardStyle);

  // Image upload
  document.getElementById('uploadImageBtn').addEventListener('click', () => {
    imageUploadTarget = 'card';
    openImageUploadModal();
  });
  document.getElementById('removeImageBtn').addEventListener('click', removeCardImage);

  // Chart settings
  document.getElementById('chartType').addEventListener('change', updateChartCard);
  document.getElementById('chartFill').addEventListener('change', updateChartCard);
  document.getElementById('addChartDataBtn').addEventListener('click', addChartSegment);

  // Stat block
  document.getElementById('addStatBtn').addEventListener('click', addStat);

  // Bar card
  document.getElementById('addBarBtn').addEventListener('click', addBar);

  // Stress/Clock settings
  document.getElementById('stressSegments').addEventListener('input', updateStressCard);
  document.getElementById('stressFilled').addEventListener('input', updateStressCard);
  document.getElementById('stressStyle').addEventListener('change', updateStressCard);
  document.getElementById('stressFillStyle').addEventListener('change', updateStressCard);
  document.getElementById('stressColor').addEventListener('input', updateStressCard);

  // Injury track
  document.getElementById('addInjuryTrackBtn').addEventListener('click', addInjuryTrack);

  // Body settings
  document.getElementById('bodyFigure').addEventListener('change', updateBodyCard);
  document.getElementById('bodyOverlayColor').addEventListener('input', updateBodyCard);
  // Body map settings (no scale - card resize handles sizing)
  document.getElementById('pointColor').addEventListener('input', updateBodyCard);

  // Item card
  ['itemType', 'itemRarity', 'itemLoad', 'itemUsesCurrent', 'itemUsesMax'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', updateItemCard);
  });
  document.getElementById('itemEffect')?.addEventListener('input', updateItemCard);
  document.getElementById('addItemPropertyBtn')?.addEventListener('click', addItemProperty);

  // Personality card
  document.getElementById('addPersonalityTraitBtn')?.addEventListener('click', addPersonalityTrait);

  // Attributes card
  document.getElementById('attrCategory')?.addEventListener('change', updateAttrCategory);
  document.getElementById('addAttributeBtn')?.addEventListener('click', addAttribute);

  // Inventory card
  document.getElementById('invMaxSlots')?.addEventListener('change', updateInvMaxSlots);
  document.getElementById('addInventoryItemBtn')?.addEventListener('click', addInventoryItem);

  // Currency card
  document.getElementById('addCurrencyBtn')?.addEventListener('click', addCurrency);
  document.getElementById('addStashBtn')?.addEventListener('click', addStash);

  // Mood card
  ['moodLevel', 'moodLowLabel', 'moodHighLabel', 'moodColorLow', 'moodColorHigh'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', updateMoodCard);
  });

  // Randomizer card
  document.getElementById('randDiceNotation')?.addEventListener('input', () => {
    if (!selectedCard) return;
    const board = getCurrentBoard();
    const cd = board.cards.find(c => c.id === selectedCard.id);
    if (!cd) return;
    cd.diceNotation = document.getElementById('randDiceNotation').value;
    refreshCardElement(cd);
  });
  document.getElementById('randAddEntry')?.addEventListener('click', () => {
    if (!selectedCard) return;
    const board = getCurrentBoard();
    const cd = board.cards.find(c => c.id === selectedCard.id);
    if (!cd || !cd.tableEntries) return;
    cd.tableEntries.push({ text: `Result ${cd.tableEntries.length + 1}`, weight: 1 });
    renderRandomizerEntriesList(cd);
    refreshCardElement(cd);
  });
  document.getElementById('randRollBtn')?.addEventListener('click', () => {
    if (!selectedCard) return;
    rollRandomizerCard(selectedCard.id);
  });

  // Delete card button
  document.getElementById('deleteCardBtn').addEventListener('click', () => {
    if (selectedCard) deleteCard(selectedCard.id);
  });

  // Connection
  document.getElementById('addConnectionBtn').addEventListener('click', startConnectionFromDetails);
  document.getElementById('cancelConnection').addEventListener('click', cancelConnection);

  // Write editor
  const writeEditor = document.getElementById('writeEditor');
  writeEditor.addEventListener('input', updateWordCount);
  writeEditor.addEventListener('input', processWikiLinksInEditor);

  // Debounced save + sync for write editor content
  let _writeSaveTimer = null;
  writeEditor.addEventListener('input', () => {
    clearTimeout(_writeSaveTimer);
    _writeSaveTimer = setTimeout(() => {
      saveCurrentChapter();
      if (typeof window.craftSchedulePush === 'function') window.craftSchedulePush();
    }, 400);
  });

  // Chapter title/label sync
  document.getElementById('writeChapterTitle').addEventListener('input', (e) => {
    const chapter = chapters.find((c) => c.id === currentChapterId);
    if (chapter) {
      chapter.title = e.target.value;
      renderChaptersList();
      if (typeof window.craftSchedulePush === 'function') window.craftSchedulePush();
    }
  });

  document.getElementById('writeChapterLabel').addEventListener('input', (e) => {
    const chapter = chapters.find((c) => c.id === currentChapterId);
    if (chapter) {
      chapter.label = e.target.value;
      renderChaptersList();
      if (typeof window.craftSchedulePush === 'function') window.craftSchedulePush();
    }
  });

  // Toolbar buttons
  document.querySelectorAll('.write-toolbar .write-tool-btn[data-command]').forEach((btn) => {
    btn.addEventListener('click', () => execFormatCommand(btn.dataset.command));
  });

  // Font selects — save editor selection before dropdowns steal focus
  let _savedFontFamilyRange = null;
  document.getElementById('fontFamily').addEventListener('mousedown', () => {
    const editor = document.getElementById('writeEditor');
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      _savedFontFamilyRange = sel.getRangeAt(0).cloneRange();
    }
  });
  document.getElementById('fontFamily').addEventListener('change', (e) => {
    const editor = document.getElementById('writeEditor');
    const range = _savedFontFamilyRange;
    _savedFontFamilyRange = null;

    if (range && !range.collapsed && editor.contains(range.startContainer)) {
      // Restore selection and apply
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);
      document.execCommand('fontName', false, e.target.value);
      saveCurrentChapter();
    } else if (!editor.textContent.trim()) {
      editor.style.fontFamily = e.target.value;
    }
    editor.focus();
  });

  // Font size: save editor selection before the dropdown steals focus
  let _savedFontSizeRange = null;
  document.getElementById('fontSize').addEventListener('mousedown', () => {
    const editor = document.getElementById('writeEditor');
    const sel = window.getSelection();
    if (sel.rangeCount > 0 && editor.contains(sel.anchorNode)) {
      _savedFontSizeRange = sel.getRangeAt(0).cloneRange();
    }
  });

  document.getElementById('fontSize').addEventListener('change', (e) => {
    const editor = document.getElementById('writeEditor');
    const sizeVal = e.target.value;
    const range = _savedFontSizeRange;
    _savedFontSizeRange = null;

    if (range && !range.collapsed && editor.contains(range.startContainer)) {
      // Restore selection into the editor
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);

      // Check if entire selection is already inside a single font-size span
      const parent = range.commonAncestorContainer;
      const existingSpan = parent.nodeType === 1 && parent.style && parent.style.fontSize 
        ? parent : (parent.parentElement && parent.parentElement.style && parent.parentElement.style.fontSize ? parent.parentElement : null);
      
      if (existingSpan && existingSpan !== editor && range.toString() === existingSpan.textContent) {
        existingSpan.style.fontSize = sizeVal + 'px';
      } else {
        const fragment = range.extractContents();
        const wrapper = document.createElement('span');
        wrapper.style.fontSize = sizeVal + 'px';
        
        // Flatten nested font-size spans
        fragment.querySelectorAll('span[style*="font-size"]').forEach(s => {
          s.style.fontSize = '';
          if (!s.style.cssText.trim()) {
            while (s.firstChild) s.parentNode.insertBefore(s.firstChild, s);
            s.remove();
          }
        });
        fragment.querySelectorAll('font[size]').forEach(f => {
          const replacement = document.createDocumentFragment();
          while (f.firstChild) replacement.appendChild(f.firstChild);
          f.parentNode.replaceChild(replacement, f);
        });
        
        wrapper.appendChild(fragment);
        range.insertNode(wrapper);
        
        sel.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(wrapper);
        sel.addRange(newRange);
      }
      saveCurrentChapter();
    } else if (range && range.collapsed && editor.contains(range.startContainer)) {
      // Cursor-only: use execCommand which handles this case well
      document.execCommand('fontSize', false, '7');
      // Replace the <font size="7"> with a proper span
      editor.querySelectorAll('font[size="7"]').forEach(f => {
        const span = document.createElement('span');
        span.style.fontSize = sizeVal + 'px';
        while (f.firstChild) span.appendChild(f.firstChild);
        f.parentNode.replaceChild(span, f);
      });
    } else if (!editor.textContent.trim()) {
      editor.style.fontSize = sizeVal + 'px';
    }
    editor.focus();
  });

  // Color inputs for write mode
  document.getElementById('textColor').addEventListener('input', (e) => {
    document.execCommand('foreColor', false, e.target.value);
    document.getElementById('writeEditor').focus();
  });
  document.getElementById('highlightColor').addEventListener('input', (e) => {
    document.execCommand('hiliteColor', false, e.target.value);
    document.getElementById('writeEditor').focus();
  });

  // Write toolbar special buttons
  document.getElementById('insertLinkBtn').addEventListener('click', openLinkModal);
  document.getElementById('insertImageBtn').addEventListener('click', () => {
    imageUploadTarget = 'editor';
    saveEditorSelection();
    openImageUploadModal();
  });
  document.getElementById('insertTableBtn').addEventListener('click', openTableModal);
  document.getElementById('insertColumnsBtn').addEventListener('click', openColumnsModal);
  document.getElementById('insertDiceBtn').addEventListener('click', openDiceModal);

  // Indent toggle
  document.getElementById('indentToggleBtn')?.addEventListener('click', toggleFirstLineIndent);
  // Justify toggle
  document.getElementById('justifyToggleBtn')?.addEventListener('click', toggleJustify);
  // Thesaurus
  document.getElementById('thesaurusBtn')?.addEventListener('click', openThesaurus);
  // Export
  document.getElementById('exportWriteBtn')?.addEventListener('click', openExportModal);
  // Right-click thesaurus in editor
  document.getElementById('writeEditor')?.addEventListener('contextmenu', handleEditorContextMenu);

  // Dice roller
  document.getElementById('diceRollerBtn').addEventListener('click', openDiceModal);
  document.getElementById('settingsBtn')?.addEventListener('click', function() { window.openSettingsModal(); });
  document.getElementById('searchNavBtn')?.addEventListener('click', openSearch);
  document.getElementById('searchOverlay')?.addEventListener('click', (e) => { if (e.target.id === 'searchOverlay') closeSearch(); });
  document.getElementById('searchInput')?.addEventListener('input', (e) => performSearch(e.target.value));
  document.getElementById('searchInput')?.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeSearch();
    if (e.key === 'Enter') {
      // Navigate to first result
      const first = document.querySelector('.search-result-item');
      if (first) first.click();
    }
  });
  initViewSettings();
  document.getElementById('closeDiceModal').addEventListener('click', closeDiceModal);
  document.querySelectorAll('.dice-btn').forEach((btn) => {
    btn.addEventListener('click', () => rollDice(btn.dataset.dice));
  });
  document.getElementById('rollCustomBtn').addEventListener('click', rollCustomDice);
  document.getElementById('insertDiceResult').addEventListener('click', insertDiceResult);
  document.getElementById('diceModal').addEventListener('click', (e) => {
    if (e.target.id === 'diceModal') closeDiceModal();
  });

  // Custom popup
  document.getElementById('closePopup').addEventListener('click', closePopup);
  document.getElementById('popupCancel').addEventListener('click', closePopup);
  document.getElementById('popupConfirm').addEventListener('click', confirmPopup);
  document.getElementById('popupModal').addEventListener('click', (e) => {
    if (e.target.id === 'popupModal') closePopup();
  });

  // Image upload modal
  document.getElementById('closeImageModal').addEventListener('click', closeImageModal);
  document.getElementById('cancelImageUpload').addEventListener('click', closeImageModal);
  document.getElementById('confirmImageUpload').addEventListener('click', confirmImageUpload);
  document.getElementById('imageUploadModal').addEventListener('click', (e) => {
    if (e.target.id === 'imageUploadModal') closeImageModal();
  });

  // Image upload tabs
  document.querySelectorAll('.upload-tab').forEach((tab) => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.upload-tab').forEach((t) => t.classList.remove('active'));
      document.querySelectorAll('.upload-tab-content').forEach((c) => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById(tab.dataset.tab + 'Tab').classList.add('active');
    });
  });

  // File drop zone
  const dropZone = document.getElementById('fileDropZone');
  dropZone.addEventListener('click', () => document.getElementById('imageFileInput').click());
  dropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropZone.style.borderColor = 'var(--gold)';
  });
  dropZone.addEventListener('dragleave', () => {
    dropZone.style.borderColor = '';
  });
  dropZone.addEventListener('drop', handleFileDrop);

  document.getElementById('imageFileInput').addEventListener('change', handleFileSelect);
  document.getElementById('clearPreview').addEventListener('click', clearImagePreview);

  // Map upload modal
  document.getElementById('closeMapUploadModal').addEventListener('click', closeMapUploadModal);
  document.getElementById('cancelMapUpload').addEventListener('click', closeMapUploadModal);
  document.getElementById('confirmMapUpload').addEventListener('click', confirmMapUpload);
  document.getElementById('mapUploadModal').addEventListener('click', (e) => {
    if (e.target.id === 'mapUploadModal') closeMapUploadModal();
  });

  const mapDropZone = document.getElementById('mapDropZone');
  mapDropZone.addEventListener('click', () => document.getElementById('mapFileInput').click());
  mapDropZone.addEventListener('dragover', (e) => {
    e.preventDefault();
    mapDropZone.style.borderColor = 'var(--gold)';
  });
  mapDropZone.addEventListener('dragleave', () => {
    mapDropZone.style.borderColor = '';
  });
  mapDropZone.addEventListener('drop', handleMapFileDrop);
  document.getElementById('mapFileInput').addEventListener('change', handleMapFileSelect);
  document.getElementById('clearMapPreview').addEventListener('click', clearMapPreview);

  // Pin editor modal
  document.getElementById('closePinEditor').addEventListener('click', closePinEditorModal);
  document.getElementById('cancelPinEdit').addEventListener('click', closePinEditorModal);
  document.getElementById('savePinEdit').addEventListener('click', savePinChanges);
  document.getElementById('deletePinBtn').addEventListener('click', deleteCurrentPin);
  document.getElementById('pinEditorModal').addEventListener('click', (e) => {
    if (e.target.id === 'pinEditorModal') closePinEditorModal();
  });

  // Pin color options (scoped to parent container)
  document.querySelectorAll('.pin-color-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const container = btn.closest('.pin-color-options');
      container.querySelectorAll('.pin-color-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Pin icon color picker
  document.getElementById('pinIconColorPicker')?.addEventListener('input', (e) => {
    document.getElementById('pinIconColorLabel').textContent = e.target.value;
  });

  // Pin shape options
  document.querySelectorAll('.pin-shape-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pin-shape-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Pin icon options
  document.querySelectorAll('.pin-icon-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.pin-icon-btn').forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Edit pin from details panel
  document.getElementById('editPinBtn').addEventListener('click', () => {
    if (selectedPin) openPinEditorModal(selectedPin);
  });

  // Map editor modal
  document.getElementById('closeMapEditor').addEventListener('click', closeMapEditorModal);
  document.getElementById('cancelMapEdit').addEventListener('click', closeMapEditorModal);
  document.getElementById('saveMapEdit').addEventListener('click', saveMapChanges);
  document.getElementById('deleteMapBtn').addEventListener('click', deleteCurrentMap);
  document.getElementById('mapEditorModal').addEventListener('click', (e) => {
    if (e.target.id === 'mapEditorModal') closeMapEditorModal();
  });
  document.getElementById('destEditorModal').addEventListener('click', (e) => {
    if (e.target.id === 'destEditorModal') closeDestEditorModal();
  });
  document.getElementById('changeMapImageBtn').addEventListener('click', () => {
    document.getElementById('mapEditorFileInput').click();
  });
  document.getElementById('mapEditorFileInput').addEventListener('change', handleMapEditorFileSelect);

  // Context menus
  document.getElementById('pinContextMenu').addEventListener('click', handlePinContextAction);
  document.getElementById('mapSidebarContextMenu').addEventListener('click', handleMapSidebarContextAction);
  document.getElementById('pinSidebarContextMenu').addEventListener('click', handlePinSidebarContextAction);
  document.getElementById('mapCanvasContextMenu').addEventListener('click', handleMapCanvasContextAction);

  // Tag finder panel
  document.getElementById('closeTagFinder').addEventListener('click', closeTagFinder);

  // Measurement
  document.getElementById('clearMeasurement').addEventListener('click', clearMeasurement);

  // Association search for pins
  const pinAssocSearch = document.getElementById('pinAssociationSearch');
  pinAssocSearch.addEventListener('input', (e) => handleAssociationSearch(e.target.value, 'pinAssociationSearchResults', 'pin'));
  pinAssocSearch.addEventListener('focus', (e) => handleAssociationSearch(e.target.value, 'pinAssociationSearchResults', 'pin'));
  pinAssocSearch.addEventListener('blur', () => setTimeout(() => hideSearchResults('pinAssociationSearchResults'), 200));

  // Association search for cards
  const cardAssocSearch = document.getElementById('cardAssociationSearch');
  cardAssocSearch.addEventListener('input', (e) => handleAssociationSearch(e.target.value, 'cardAssociationSearchResults', 'card'));
  cardAssocSearch.addEventListener('focus', (e) => handleAssociationSearch(e.target.value, 'cardAssociationSearchResults', 'card'));
  cardAssocSearch.addEventListener('blur', () => setTimeout(() => hideSearchResults('cardAssociationSearchResults'), 200));

  // Association search for chapters
  const chapterAssocSearch = document.getElementById('chapterAssociationSearch');
  chapterAssocSearch.addEventListener('input', (e) => handleAssociationSearch(e.target.value, 'chapterAssociationSearchResults', 'chapter'));
  chapterAssocSearch.addEventListener('focus', (e) => handleAssociationSearch(e.target.value, 'chapterAssociationSearchResults', 'chapter'));
  chapterAssocSearch.addEventListener('blur', () => setTimeout(() => hideSearchResults('chapterAssociationSearchResults'), 200));

  // Chapter tags input
  const chapterTagsInput = document.getElementById('chapterTags');
  chapterTagsInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addChapterTagFromInput();
    }
  });
  chapterTagsInput.addEventListener('blur', () => {
    addChapterTagFromInput();
  });

  // Wiki link modal for write view
  document.getElementById('insertWikiLinkBtn').addEventListener('click', openWikiLinkModal);
  document.getElementById('closeWikiLinkModal').addEventListener('click', closeWikiLinkModal);
  document.getElementById('cancelWikiLink').addEventListener('click', closeWikiLinkModal);
  document.getElementById('confirmWikiLink').addEventListener('click', confirmWikiLink);
  document.getElementById('wikiLinkModal').addEventListener('click', (e) => {
    if (e.target.id === 'wikiLinkModal') closeWikiLinkModal();
  });

  const wikiLinkSearch = document.getElementById('wikiLinkSearch');
  wikiLinkSearch.addEventListener('input', (e) => handleWikiLinkSearch(e.target.value));

  // Link modal
  document.getElementById('closeLinkModal').addEventListener('click', closeLinkModal);
  document.getElementById('cancelLink').addEventListener('click', closeLinkModal);
  document.getElementById('confirmLink').addEventListener('click', confirmLink);
  document.getElementById('linkModal').addEventListener('click', (e) => {
    if (e.target.id === 'linkModal') closeLinkModal();
  });

  // Table modal
  document.getElementById('closeTableModal').addEventListener('click', closeTableModal);
  document.getElementById('cancelTable').addEventListener('click', closeTableModal);
  document.getElementById('confirmTable').addEventListener('click', confirmTable);
  document.getElementById('tableModal').addEventListener('click', (e) => {
    if (e.target.id === 'tableModal') closeTableModal();
  });
  document.getElementById('tableRows').addEventListener('input', updateTablePreview);
  document.getElementById('tableCols').addEventListener('input', updateTablePreview);

  // Canvas events (board)
  const canvasContainer = document.getElementById('boardView');
  canvasContainer.addEventListener('mousedown', handleCanvasMouseDown);
  canvasContainer.addEventListener('mousemove', handleCanvasMouseMove);
  canvasContainer.addEventListener('mouseup', handleCanvasMouseUp);
  canvasContainer.addEventListener('mouseleave', handleCanvasMouseUp);
  canvasContainer.addEventListener('wheel', handleCanvasWheel, { passive: false });

  // Map events
  const mapCanvas = document.getElementById('mapCanvas');
  mapCanvas.addEventListener('mousedown', handleMapMouseDown);
  mapCanvas.addEventListener('mousemove', handleMapMouseMove);
  mapCanvas.addEventListener('mouseup', handleMapMouseUp);
  mapCanvas.addEventListener('mouseleave', handleMapMouseUp);
  mapCanvas.addEventListener('wheel', handleMapWheel, { passive: false });
  mapCanvas.addEventListener('dblclick', handleMapDoubleClick);

  // Context menu
  document.addEventListener('contextmenu', handleContextMenu);
  // Block default browser right-click except on text inputs (but not sidebar list inputs)
  document.addEventListener('contextmenu', (e) => {
    const tag = e.target.tagName;
    // Allow native context menu on general text inputs/textareas/contentEditable, 
    // but block it on sidebar list items (board names, chapter names, etc.) which have custom context menus
    if (tag === 'INPUT' || tag === 'TEXTAREA' || e.target.isContentEditable) {
      if (e.target.closest('.board-item, .chapter-item, .folder-header, .map-item, .tl-list-item')) return; // handled by custom menu
      return;
    }
    if (!e.defaultPrevented) e.preventDefault();
  });
  document.addEventListener('click', closeContextMenu);
  document.querySelectorAll('.context-menu-item[data-action]').forEach((item) => {
    item.addEventListener('click', handleContextAction);
  });

  // Combatant context menu
  document.querySelectorAll('#combatantContextMenu .context-menu-item[data-action]').forEach(item => {
    item.addEventListener('click', () => { handleCombatantContextAction(item.dataset.action); });
  });
  // Faction/Contact context menu
  document.querySelectorAll('#facContactContextMenu .context-menu-item[data-action]').forEach(item => {
    item.addEventListener('click', () => { handleFacContactContextAction(item.dataset.action); });
  });

  // Keyboard shortcuts
  document.addEventListener('keydown', handleKeyboard);
}

// ============================================
// View Switching
// ============================================
function switchView(view) {
  // Save current chapter content before switching away from write view
  if (currentView === 'write') saveCurrentChapter();
  currentView = view;

  document.querySelectorAll('.view-toggle-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  const get = (id) => document.getElementById(id);

  const boardView = get('boardView');
  const mapView = get('mapView');
  const writeView = get('writeView');
  const timelineView = get('timelineView');
  const combatView = get('combatView');
  const factionView = get('factionView');
  const mindmapView = get('mindmapView');
  const soundboardView = get('soundboardView');
  const boardsSection = get('boardsSection');
  const templatesSection = get('templatesSection');
  const mapsSection = get('mapsSection');
  const pinsSection = get('pinsSection');
  const tagsSection = get('tagsSection');
  const chaptersSection = get('chaptersSection');
  const timelinesSection = get('timelinesSection');
  const timelineTemplatesSection = get('timelineTemplatesSection');
  const timelineInfoSection = get('timelineInfoSection');
  const combatAddSection = get('combatAddSection');
  const combatEncountersSection = get('combatEncountersSection');
  const factionsListSection = get('factionsListSection');
  const contactsListSection = get('contactsListSection');
  const orgsListSection = get('orgsListSection');

  // Hide everything first
  document.querySelector('.main-content')?.classList.remove('sb-active');
  [boardView, mapView, writeView, timelineView, combatView, factionView, mindmapView, soundboardView,
   boardsSection, templatesSection, mapsSection, pinsSection, tagsSection, chaptersSection,
   timelinesSection, timelineTemplatesSection, timelineInfoSection,
   combatAddSection, combatEncountersSection, factionsListSection, contactsListSection, orgsListSection]
    .filter(Boolean)
    .forEach((el) => el.classList.add('hidden'));

  deselectAll();
  clearMeasurement();
  cancelRegionDrawing();
  removeRegionEditHandles();
  selectedRegionId = null;
  document.getElementById('tlCalendarPanel')?.classList.add('hidden');
  document.getElementById('tlDetails')?.classList.add('hidden');
  document.getElementById('factionDetails')?.classList.add('hidden');
  document.getElementById('contactDetails')?.classList.add('hidden');
  document.getElementById('orgDetails')?.classList.add('hidden');
  document.getElementById('mindmapDetails')?.classList.add('hidden');
  document.getElementById('mindmapSettings')?.classList.add('hidden');
  document.getElementById('regionDetails')?.classList.add('hidden');

  if (view === 'board') {
    boardView?.classList.remove('hidden');
    boardsSection?.classList.remove('hidden');
    templatesSection?.classList.remove('hidden');

    // IMPORTANT: when a view was display:none, sizes/positions can be 0 until the next frame.
    // Refresh canvas + transforms after layout is restored so the board doesn't "break".
    requestAnimationFrame(() => {
      updateCanvas();
      applyCanvasTransform();
      renderConnections();
      updateStatusBar();
    });
    return;
  }

  if (view === 'map') {
    mapView?.classList.remove('hidden');
    mapsSection?.classList.remove('hidden');
    pinsSection?.classList.remove('hidden');
    tagsSection?.classList.remove('hidden');

    requestAnimationFrame(() => {
      updateMapView();
      updateMapStatusBar();
      renderTagsCloud();
      centerMapOnLoad();
    });
    return;
  }

  if (view === 'timeline') {
    timelineView?.classList.remove('hidden');
    timelinesSection?.classList.remove('hidden');
    timelineTemplatesSection?.classList.remove('hidden');
    timelineInfoSection?.classList.remove('hidden');

    // Show details panel with timeline details + calendar
    const dp = get('detailsPanel');
    dp?.classList.remove('collapsed');
    get('emptyState')?.classList.add('hidden');
    get('cardDetails')?.classList.add('hidden');
    get('pinDetails')?.classList.add('hidden');
    get('chapterDetails')?.classList.add('hidden');
    get('tlCalendarPanel')?.classList.remove('hidden');
    get('tlDetails')?.classList.remove('hidden');

    requestAnimationFrame(() => {
      renderTimelineView();
    });
    return;
  }

  if (view === 'combat') {
    combatView?.classList.remove('hidden');
    combatAddSection?.classList.remove('hidden');
    combatEncountersSection?.classList.remove('hidden');

    requestAnimationFrame(() => {
      renderCombatants();
    });
    return;
  }

  if (view === 'factions') {
    factionView?.classList.remove('hidden');
    // Show correct sidebar based on active sub-tab
    if (currentFacTab === 'contacts') {
      contactsListSection?.classList.remove('hidden');
    } else {
      factionsListSection?.classList.remove('hidden');
    }

    // Open details panel
    const dp = get('detailsPanel');
    dp?.classList.remove('collapsed');

    requestAnimationFrame(() => {
      switchFacTab(currentFacTab || 'factions');
    });
    return;
  }

  if (view === 'mindmap') {
    mindmapView?.classList.remove('hidden');

    // Open details panel with settings
    const dp = get('detailsPanel');
    dp?.classList.remove('collapsed');
    get('emptyState')?.classList.add('hidden');
    get('cardDetails')?.classList.add('hidden');
    get('pinDetails')?.classList.add('hidden');
    get('chapterDetails')?.classList.add('hidden');
    get('mindmapDetails')?.classList.add('hidden');
    get('mindmapSettings')?.classList.remove('hidden');

    requestAnimationFrame(() => {
      renderMindMap();
    });
    return;
  }

  if (view === 'soundboard') {
    soundboardView?.classList.remove('hidden');
    document.querySelector('.main-content')?.classList.add('sb-active');
    requestAnimationFrame(() => {
      if (typeof initSoundboard === 'function' && !soundboardView._inited) {
        initSoundboard();
        soundboardView._inited = true;
      }
    });
    return;
  }

  // write
  writeView?.classList.remove('hidden');
  chaptersSection?.classList.remove('hidden');

  requestAnimationFrame(() => {
    const chapter = chapters.find((c) => c.id === currentChapterId);
    if (!chapter) return;

    get('writeEditor').innerHTML = chapter.content;
    get('writeChapterTitle').value = chapter.title;
    get('writeChapterLabel').value = chapter.label;
    get('chapterTags').value = '';
    get('chapterDetailName').textContent = chapter.title || chapter.label;
    renderChapterTagPills();

    updateWordCount();
    renderChapterAssociationsList();

    // Restore indent/justify toggles from chapter data
    const editor = get('writeEditor');
    writeIndentMode = !!chapter.indentMode;
    writeJustifyMode = !!chapter.justifyMode;
    editor?.classList.toggle('indent-mode', writeIndentMode);
    editor?.classList.toggle('justify-mode', writeJustifyMode);
    const indentBtn = get('indentToggleBtn');
    const justifyBtn = get('justifyToggleBtn');
    if (indentBtn) indentBtn.classList.toggle('active', writeIndentMode);
    if (justifyBtn) justifyBtn.classList.toggle('active', writeJustifyMode);

    // Show chapter details in panel
    get('emptyState')?.classList.add('hidden');
    get('cardDetails')?.classList.add('hidden');
    get('pinDetails')?.classList.add('hidden');
    get('chapterDetails')?.classList.remove('hidden');
    get('detailsPanel')?.classList.remove('collapsed');
  });
}


// ============================================
// Sidebar
// ============================================
function toggleSidebar() {
  document.getElementById('sidebar').classList.toggle('collapsed');
}

function toggleDetailsPanel() {
  document.getElementById('detailsPanel').classList.toggle('collapsed');
}

function toggleTemplates() {
  const header = document.getElementById('templatesHeader');
  const templates = document.getElementById('cardTemplates');
  header.classList.toggle('collapsed');
  templates.classList.toggle('collapsed');
}

// ============================================
// Custom Popup System
// ============================================
function openPopup(title, placeholder, defaultValue, callback) {
  document.getElementById('popupTitle').textContent = title;
  document.getElementById('popupInput').placeholder = placeholder;
  document.getElementById('popupInput').value = defaultValue || '';
  popupCallback = callback;
  document.getElementById('popupModal').classList.remove('hidden');
  document.getElementById('popupInput').focus();
}

function closePopup() {
  document.getElementById('popupModal').classList.add('hidden');
  popupCallback = null;
}

function confirmPopup() {
  const value = document.getElementById('popupInput').value;
  if (popupCallback) {
    popupCallback(value);
  }
  closePopup();
}

// ============================================
// Image Upload Modal
// ============================================
function openImageUploadModal() {
  document.getElementById('imageUploadModal').classList.remove('hidden');
  clearImagePreview();
  document.getElementById('imageUrlInput').value = '';
}

function closeImageModal() {
  document.getElementById('imageUploadModal').classList.add('hidden');
  imageUploadCallback = null;
}

function handleFileDrop(e) {
  e.preventDefault();
  e.target.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    previewFile(file);
  }
}

function handleFileSelect(e) {
  const file = e.target.files[0];
  if (file) previewFile(file);
}

let pendingImageFile = null;
function previewFile(file) {
  pendingImageFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('previewImg').src = e.target.result;
    document.getElementById('fileDropZone').classList.add('hidden');
    document.getElementById('filePreview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function clearImagePreview() {
  pendingImageFile = null;
  document.getElementById('previewImg').src = '';
  document.getElementById('fileDropZone').classList.remove('hidden');
  document.getElementById('filePreview').classList.add('hidden');
  document.getElementById('imageFileInput').value = '';
}

function confirmImageUpload() {
  let imageUrl = '';

  const previewSrc = document.getElementById('previewImg').src;
  if (previewSrc && previewSrc !== window.location.href) {
    imageUrl = previewSrc;
  } else {
    imageUrl = document.getElementById('imageUrlInput').value.trim();
  }

  if (!imageUrl) {
    closeImageModal();
    return;
  }

  function applyImage(url) {
    if (imageUploadTarget === 'card' && selectedCard) {
      const board = getCurrentBoard();
      const cardData = board.cards.find((c) => c.id === selectedCard.id);
      if (cardData) {
        cardData.imageUrl = url;
        document.getElementById('detailImagePreview').classList.remove('hidden');
        document.getElementById('detailImage').src = url;
        refreshCard(cardData);
      }
    } else if (imageUploadTarget === 'editor') {
      restoreEditorSelection();
      const imgWrapper = `
        <div class="editor-image-wrapper" contenteditable="false">
          <img src="${url}" class="editor-image">
          <div class="image-resize-handle"></div>
        </div>
    `;
    document.execCommand('insertHTML', false, imgWrapper);
    saveCurrentChapter();
    setupEditorImageResize();
  }
    closeImageModal();
    pendingImageFile = null;
  }

  // Upload file to R2 if available, otherwise use image directly
  if (pendingImageFile && window.craftUploadImage) {
    showNotif('Uploading image...');
    window.craftUploadImage(pendingImageFile)
      .then(url => { applyImage(url); showNotif('Image uploaded'); })
      .catch(err => { console.error('Image upload failed:', err); applyImage(imageUrl); showNotif('Upload failed, using local image'); });
  } else {
    applyImage(imageUrl);
  }
}

// ============================================
// Map Upload Modal
// ============================================
function openMapUploadModal() {
  document.getElementById('mapUploadModal').classList.remove('hidden');
  clearMapPreview();
}

function closeMapUploadModal() {
  document.getElementById('mapUploadModal').classList.add('hidden');
}

function handleMapFileDrop(e) {
  e.preventDefault();
  e.target.style.borderColor = '';
  const file = e.dataTransfer.files[0];
  if (file && file.type.startsWith('image/')) {
    previewMapFile(file);
  }
}

function handleMapFileSelect(e) {
  const file = e.target.files[0];
  if (file) previewMapFile(file);
}

let pendingMapFile = null;
function previewMapFile(file) {
  pendingMapFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    document.getElementById('mapPreviewImg').src = e.target.result;
    document.getElementById('mapDropZone').classList.add('hidden');
    document.getElementById('mapFilePreview').classList.remove('hidden');
  };
  reader.readAsDataURL(file);
}

function clearMapPreview() {
  pendingMapFile = null;
  document.getElementById('mapPreviewImg').src = '';
  document.getElementById('mapDropZone').classList.remove('hidden');
  document.getElementById('mapFilePreview').classList.add('hidden');
  document.getElementById('mapFileInput').value = '';
}

function confirmMapUpload() {
  const previewSrc = document.getElementById('mapPreviewImg').src;
  if (!previewSrc || previewSrc === window.location.href) {
    closeMapUploadModal();
    return;
  }

  function applyMapImage(url) {
    const currentMap = getCurrentMap();
    if (currentMap) {
      currentMap.imageUrl = url;
      updateMapView();
      centerMapOnLoad();
    } else {
      const newId = `map-${Date.now()}`;
      maps.push({
        id: newId, name: 'New Map', imageUrl: url,
        pins: [], scale: { pixels: 100, distance: 1, unit: 'miles' }
      });
      currentMapId = newId;
      renderMapsList();
      updateMapView();
      centerMapOnLoad();
    }
    closeMapUploadModal();
    pendingMapFile = null;
  }

  // Upload file to R2 if available, otherwise use preview src directly
  if (pendingMapFile && window.craftUploadImage) {
    showNotif('Uploading image...');
    window.craftUploadImage(pendingMapFile)
      .then(url => { applyMapImage(url); showNotif('Map image uploaded'); })
      .catch(err => { console.error('Map upload failed:', err); applyMapImage(previewSrc); showNotif('Upload failed, using local image'); });
  } else {
    applyMapImage(previewSrc);
  }
}

function centerMapOnLoad() {
  const mapCanvas = document.getElementById('mapCanvas');
  const mapImg = document.getElementById('mapImage');
  if (!mapCanvas || !mapImg) return;

  // Wait for image to load then fit to container width and center
  const img = new Image();
  img.onload = () => {
    const canvasRect = mapCanvas.getBoundingClientRect();
    const imgW = img.naturalWidth;
    const imgH = img.naturalHeight;
    if (!imgW || !imgH || !canvasRect.width) return;

    // Fit to container width
    mapZoom = canvasRect.width / imgW;

    const scaledH = imgH * mapZoom;
    mapPanOffset.x = 0;
    // Center vertically if image is shorter than container
    if (scaledH < canvasRect.height) {
      mapPanOffset.y = (canvasRect.height - scaledH) / 2;
    } else {
      mapPanOffset.y = 0;
    }

    applyMapTransform();
    document.getElementById('mapZoomLevel').textContent = `${Math.round(mapZoom * 100)}%`;
  };
  img.src = mapImg.src || getCurrentMap()?.imageUrl;
}

// ============================================
// Pin Editor Modal
// ============================================
function openPinEditorModal(pinId) {
  const currentMap = getCurrentMap();
  if (!currentMap) return;

  const pin = currentMap.pins.find((p) => p.id === pinId);
  if (!pin) return;

  editingPinId = pinId;
  document.getElementById('pinEditorTitle').textContent = 'Edit Pin';
  document.getElementById('pinName').value = pin.name || '';
  document.getElementById('pinDescription').value = pin.description || '';
  document.getElementById('pinTags').value = (pin.tags || []).join(', ');

  // Pin image
  const pinImg = document.getElementById('pinEditorImage');
  const pinNoImg = document.getElementById('pinEditorNoImage');
  const pinRemBtn = document.getElementById('pinImageRemoveBtn');
  if (pin.image) {
    pinImg.src = pin.image; pinImg.classList.remove('hidden'); pinNoImg.classList.add('hidden');
    pinRemBtn?.classList.remove('hidden');
  } else {
    pinImg.classList.add('hidden'); pinNoImg.classList.remove('hidden');
    pinRemBtn?.classList.add('hidden');
  }

  // Set shape
  document.querySelectorAll('.pin-shape-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.shape === (pin.shape || 'circle'));
  });

  // Set color
  document.querySelectorAll('#pinColorOptions .pin-color-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.color === pin.color);
  });

  // Set icon
  document.querySelectorAll('.pin-icon-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.icon === (pin.icon || ''));
  });

  // Set icon color
  const iconClr = pin.iconColor || '#ffffff';
  document.getElementById('pinIconColorPicker').value = iconClr;
  document.getElementById('pinIconColorLabel').textContent = iconClr;

  // Clear and populate associations
  document.getElementById('pinAssociationSearch').value = '';
  renderAssociationsList('pin', pinId, 'pinAssociationsList');

  document.getElementById('pinEditorModal').classList.remove('hidden');
}

function closePinEditorModal() {
  document.getElementById('pinEditorModal').classList.add('hidden');
  document.getElementById('pinAssociationSearchResults').classList.add('hidden');
  editingPinId = null;
}

function savePinChanges() {
  if (!editingPinId) return;

  const currentMap = getCurrentMap();
  if (!currentMap) return;

  const pin = currentMap.pins.find((p) => p.id === editingPinId);
  if (!pin) return;

  pin.name = document.getElementById('pinName').value || 'Unnamed Pin';
  pin.description = document.getElementById('pinDescription').value || '';

  // Parse tags
  const tagsInput = document.getElementById('pinTags').value;
  pin.tags = tagsInput.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0);

  const activeColor = document.querySelector('#pinColorOptions .pin-color-btn.active');
  pin.color = activeColor ? activeColor.dataset.color : '#ef4444';

  const activeShape = document.querySelector('.pin-shape-btn.active');
  pin.shape = activeShape ? activeShape.dataset.shape : 'circle';

  const activeIcon = document.querySelector('.pin-icon-btn.active');
  pin.icon = activeIcon ? activeIcon.dataset.icon : '';

  pin.iconColor = document.getElementById('pinIconColorPicker').value || '#ffffff';

  renderPins();
  renderPinsList();
  renderTagsCloud();

  if (selectedPin === editingPinId) {
    showPinDetails(pin);
  }

  closePinEditorModal();
}

function deleteCurrentPin() {
  if (!editingPinId) return;

  const currentMap = getCurrentMap();
  if (!currentMap) return;

  saveUndoState();
  currentMap.pins = currentMap.pins.filter((p) => p.id !== editingPinId);

  if (selectedPin === editingPinId) {
    selectedPin = null;
    document.getElementById('pinDetails').classList.add('hidden');
    document.getElementById('emptyState').classList.remove('hidden');
  }

  renderPins();
  renderPinsList();
  renderTagsCloud();
  updateMapStatusBar();
  closePinEditorModal();
}

function deletePinById(pinId) {
  const currentMap = getCurrentMap();
  if (!currentMap) return;

  currentMap.pins = currentMap.pins.filter((p) => p.id !== pinId);

  if (selectedPin === pinId) {
    selectedPin = null;
    document.getElementById('pinDetails').classList.add('hidden');
    document.getElementById('emptyState').classList.remove('hidden');
  }

  renderPins();
  renderPinsList();
  renderTagsCloud();
  updateMapStatusBar();
}

// ============================================
// Link Modal
// ============================================
function openLinkModal() {
  saveEditorSelection();
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    document.getElementById('linkTextInput').value = selection.toString();
  }
  document.getElementById('linkUrlInput').value = '';
  document.getElementById('linkModal').classList.remove('hidden');
  document.getElementById('linkUrlInput').focus();
}

function closeLinkModal() {
  document.getElementById('linkModal').classList.add('hidden');
}

function confirmLink() {
  const text = document.getElementById('linkTextInput').value || 'Link';
  const url = document.getElementById('linkUrlInput').value;

  if (url) {
    restoreEditorSelection();
    const link = `<a href="${url}" target="_blank">${text}</a>`;
    document.execCommand('insertHTML', false, link);
    saveCurrentChapter();
  }

  closeLinkModal();
}

// ============================================
// Table Modal
// ============================================
function openTableModal() {
  saveEditorSelection();
  document.getElementById('tableRows').value = 3;
  document.getElementById('tableCols').value = 3;
  updateTablePreview();
  document.getElementById('tableModal').classList.remove('hidden');
}

function closeTableModal() {
  document.getElementById('tableModal').classList.add('hidden');
}

function updateTablePreview() {
  const rows = parseInt(document.getElementById('tableRows').value) || 3;
  const cols = parseInt(document.getElementById('tableCols').value) || 3;
  const grid = document.getElementById('tablePreviewGrid');
  grid.style.gridTemplateColumns = `repeat(${cols}, 24px)`;
  grid.innerHTML = '';
  for (let i = 0; i < rows * cols; i++) {
    grid.innerHTML += '<div class="table-preview-cell"></div>';
  }
}

function confirmTable() {
  const rows = parseInt(document.getElementById('tableRows').value) || 3;
  const cols = parseInt(document.getElementById('tableCols').value) || 3;

  let table = '<table><thead><tr>';
  for (let c = 0; c < cols; c++) {
    table += '<th>Header</th>';
  }
  table += '</tr></thead><tbody>';
  for (let r = 0; r < rows - 1; r++) {
    table += '<tr>';
    for (let c = 0; c < cols; c++) {
      table += '<td>Cell</td>';
    }
    table += '</tr>';
  }
  table += '</tbody></table>';

  restoreEditorSelection();
  document.execCommand('insertHTML', false, table);
  saveCurrentChapter();
  closeTableModal();
}

// Editor selection handling
function saveEditorSelection() {
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    pendingSelection = selection.getRangeAt(0).cloneRange();
  }
}

function restoreEditorSelection() {
  if (pendingSelection) {
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(pendingSelection);
    pendingSelection = null;
  } else {
    document.getElementById('writeEditor').focus();
  }
}

// ============================================
// Boards Management
// ============================================
function renderBoardsList() {
  const list = document.getElementById('boardsList');
  list.innerHTML = '';

  boards.forEach((board) => {
    const item = document.createElement('div');
    item.className = `board-item${board.id === currentBoardId ? ' active' : ''}`;
    item.dataset.boardId = board.id;
    item.draggable = true;

    item.innerHTML = `
      <span class="drag-handle">⋮⋮</span>
      <input type="text" class="board-name" value="${board.name}" data-board-id="${board.id}">
      <button class="delete-item-btn" data-id="${board.id}" title="Delete">×</button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT' && !e.target.classList.contains('delete-item-btn')) {
        selectBoard(board.id);
      }
    });

    const input = item.querySelector('.board-name');
    input.addEventListener('change', (e) => {
      board.name = e.target.value;
      updateStatusBar();
    });
    input.addEventListener('click', (e) => e.stopPropagation());
    input.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllContextMenus();
      ctxBoardId = board.id;
      const menu = document.getElementById('boardContextMenu');
      menu.classList.remove('hidden');
      menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
      menu.style.top = Math.min(e.clientY, window.innerHeight - 120) + 'px';
    });

    item.querySelector('.delete-item-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteBoard(board.id);
    });

    item.addEventListener('dragstart', (e) => handleListDragStart(e, 'board'));
    item.addEventListener('dragover', handleListDragOver);
    item.addEventListener('dragleave', handleListDragLeave);
    item.addEventListener('drop', (e) => handleListDrop(e, 'board'));
    item.addEventListener('dragend', handleListDragEnd);

    // Right-click context menu
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllContextMenus();
      ctxBoardId = board.id;
      const menu = document.getElementById('boardContextMenu');
      menu.classList.remove('hidden');
      menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
      menu.style.top = Math.min(e.clientY, window.innerHeight - 120) + 'px';
    });

    list.appendChild(item);
  });
}

function addBoard() {
  const newId = `board-${Date.now()}`;
  boards.push({ id: newId, name: 'New Board', cards: [], connections: [] });
  renderBoardsList();
  selectBoard(newId);
}

let ctxBoardId = null;
function duplicateBoardCtx() {
  closeAllContextMenus();
  if (!ctxBoardId) return;
  const src = boards.find(b => b.id === ctxBoardId);
  if (!src) return;
  const dup = JSON.parse(JSON.stringify(src));
  dup.id = `board-${Date.now()}`;
  dup.name = src.name + ' (Copy)';
  dup.cards.forEach(c => { c.id = `card-${Date.now()}-${Math.random().toString(36).substr(2,5)}`; });
  boards.push(dup);
  renderBoardsList();
  selectBoard(dup.id);
  showNotif('Board duplicated');
}
function renameBoardCtx() {
  closeAllContextMenus();
  if (!ctxBoardId) return;
  const item = document.querySelector(`.board-item[data-board-id="${ctxBoardId}"] .board-name`);
  if (item) { item.focus(); item.select(); }
}
function deleteBoardCtx() {
  closeAllContextMenus();
  if (ctxBoardId) deleteBoard(ctxBoardId);
}

function deleteBoard(boardId) {
  if (boards.length <= 1) return;
  boards = boards.filter((b) => b.id !== boardId);
  if (currentBoardId === boardId) {
    currentBoardId = boards[0].id;
  }
  renderBoardsList();
  updateCanvas();
  updateStatusBar();
}

function selectBoard(boardId) {
  currentBoardId = boardId;
  renderBoardsList();
  updateCanvas();
  updateStatusBar();
  deselectAll();
}

function getCurrentBoard() {
  return boards.find((b) => b.id === currentBoardId);
}

// ============================================
// Maps Management
// ============================================
function renderMapsList() {
  const list = document.getElementById('mapsList');
  list.innerHTML = '';

  maps.forEach((map) => {
    const item = document.createElement('div');
    item.className = `map-item${map.id === currentMapId ? ' active' : ''}${map.hidden ? ' item-hidden' : ''}`;
    item.dataset.mapId = map.id;

    item.innerHTML = `
      <span class="drag-handle">⋮⋮</span>
      ${map.hidden ? '<span class="hidden-badge-sm" title="Hidden" style="position:static;margin-right:4px;">👁</span>' : ''}
      <input type="text" class="map-name" value="${map.name}" data-map-id="${map.id}">
      <button class="edit-item-btn" data-id="${map.id}" title="Edit Map">⚙</button>
      <button class="delete-item-btn" data-id="${map.id}" title="Delete">×</button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT' && !e.target.classList.contains('delete-item-btn') && !e.target.classList.contains('edit-item-btn')) {
        selectMap(map.id);
      }
    });

    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openMapSidebarContextMenu(e, map);
    });

    const input = item.querySelector('.map-name');
    input.addEventListener('change', (e) => {
      map.name = e.target.value;
      updateMapStatusBar();
    });
    input.addEventListener('click', (e) => e.stopPropagation());

    item.querySelector('.edit-item-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      openMapEditorModal(map.id);
    });

    item.querySelector('.delete-item-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteMap(map.id);
    });

    list.appendChild(item);
  });
}

function deleteMap(mapId) {
  if (maps.length <= 1) return;
  maps = maps.filter((m) => m.id !== mapId);
  if (currentMapId === mapId) {
    currentMapId = maps[0].id;
  }
  renderMapsList();
  updateMapView();
  updateMapStatusBar();
  renderTagsCloud();
  clearMeasurement();
}

function selectMap(mapId) {
  const changed = currentMapId !== mapId;
  currentMapId = mapId;
  renderMapsList();
  updateMapView();
  updateMapStatusBar();
  deselectPin();
  deselectRegion();
  cancelRegionDrawing();
  if (changed) centerMapOnLoad();
}

function getCurrentMap() {
  return maps.find((m) => m.id === currentMapId);
}

function updateMapView() {
  const currentMap = getCurrentMap();
  const mapImage = document.getElementById('mapImage');
  const mapEmptyState = document.getElementById('mapEmptyState');

  if (currentMap && currentMap.imageUrl) {
    mapImage.src = currentMap.imageUrl;
    mapImage.classList.remove('hidden');
    mapEmptyState.classList.add('hidden');
    renderPins();
    renderRegions();
    renderMapPaths();
    // Re-render after image loads so SVG layer has correct dimensions
    mapImage.onload = () => {
      requestAnimationFrame(() => {
        renderRegions();
        renderMapPaths();
        renderPins();
        applyMapTransform();
      });
    };
  } else {
    mapImage.classList.add('hidden');
    mapEmptyState.classList.remove('hidden');
    document.getElementById('pinsLayer').innerHTML = '';
    document.getElementById('regionsLayer').querySelectorAll('g.region-group').forEach(el => el.remove());
  }

  renderPinsList();
  applyMapTransform();
}

// ============================================
// Pins Management
// ============================================
function renderPins() {
  const currentMap = getCurrentMap();
  const pinsLayer = document.getElementById('pinsLayer');
  pinsLayer.innerHTML = '';

  if (!currentMap) return;

  currentMap.pins.forEach((pin) => {
    const pinEl = createPinElement(pin);
    pinsLayer.appendChild(pinEl);
  });
}


function renderDestinations() {
  const layer = document.getElementById('pinsLayer');
  if (!layer) return;

  // Remove existing destination elements
  layer.querySelectorAll('.destination-marker').forEach(el => el.remove());

  destinationMarkers.forEach((dest, i) => {
    const el = document.createElement('div');
    el.className = 'destination-marker' + (dest.id === selectedDestinationId ? ' selected' : '');
    el.style.left = dest.x + '%';
    el.style.top = dest.y + '%';
    el.style.pointerEvents = 'auto';

    const color = dest.color || '#f43f5e';
    const label = dest.label || `Dest ${i + 1}`;

    el.innerHTML = `
      <div class="dest-pulse-ring" style="border-color: ${color}55; background: ${color}08;"></div>
      <div class="dest-pulse-ring delay" style="border-color: ${color}55; background: ${color}08;"></div>
      <div class="dest-crosshair-h" style="background: ${color};"></div>
      <div class="dest-crosshair-v" style="background: ${color};"></div>
      <div class="dest-core" style="background: radial-gradient(circle at 35% 35%, ${color}dd, ${color} 55%, ${color}aa); box-shadow: 0 0 16px ${color}bb, 0 0 32px ${color}55, 0 0 4px rgba(255,255,255,0.25);"></div>
      ${dest.hideLabel ? '' : `<div class="dest-label" style="border-color: ${color}40;">${label}</div>`}
    `;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectedDestinationId = dest.id;
      if (window.craftMyRole === 'viewer') {
        showNotif('You do not have permission to edit this room');
        return;
      }
      openDestEditorModal(dest.id);
    });

    el.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (window.craftMyRole === 'viewer') {
        showNotif('You do not have permission to delete this item');
        return;
      }
      destinationMarkers = destinationMarkers.filter(d => d.id !== dest.id);
      if (selectedDestinationId === dest.id) selectedDestinationId = null;
      renderDestinations();
      showNotif('Destination removed');
    });

    layer.appendChild(el);
  });
}

// Destination Editor
let editingDestId = null;

function openDestEditorModal(destId) {
  const dest = destinationMarkers.find(d => d.id === destId);
  if (!dest) return;
  editingDestId = destId;

  document.getElementById('destName').value = dest.label || '';
  document.getElementById('destHideLabel').checked = !!dest.hideLabel;

  // Set color
  document.querySelectorAll('#destColorOptions .pin-color-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.color === (dest.color || '#f43f5e'));
  });

  document.getElementById('destEditorModal').classList.remove('hidden');
}

function closeDestEditorModal() {
  document.getElementById('destEditorModal').classList.add('hidden');
  editingDestId = null;
}

function saveDestChanges() {
  if (!editingDestId) return;
  const dest = destinationMarkers.find(d => d.id === editingDestId);
  if (!dest) return;

  dest.label = document.getElementById('destName').value || '';
  dest.hideLabel = document.getElementById('destHideLabel').checked;
  const activeColor = document.querySelector('#destColorOptions .pin-color-btn.active');
  dest.color = activeColor ? activeColor.dataset.color : '#f43f5e';

  renderDestinations();
  closeDestEditorModal();
}

function deleteCurrentDest() {
  if (!editingDestId) return;
  destinationMarkers = destinationMarkers.filter(d => d.id !== editingDestId);
  if (selectedDestinationId === editingDestId) selectedDestinationId = null;
  renderDestinations();
  closeDestEditorModal();
  showNotif('Destination removed');
}


function createPinElement(pin) {
  const el = document.createElement('div');
  el.className = `map-pin shape-${pin.shape || 'circle'}`;
  el.id = pin.id;
  el.dataset.pinId = pin.id;
  el.style.left = `${pin.x}%`;
  el.style.top = `${pin.y}%`;
  el.style.setProperty('--pin-color', pin.color || '#ef4444');

  const shape = pin.shape || 'circle';
  const icon = pin.icon || '';
  const iconColor = pin.iconColor || '#ffffff';
  const iconHtml = icon ? `<i class="ra ${icon} pin-icon-inner" style="color:${iconColor}"></i>` : '';
  let markerHtml = '';

  switch (shape) {
    case 'diamond':
      markerHtml = `<div class="pin-marker diamond">${iconHtml}</div>`;
      break;
    case 'pin':
      markerHtml = `<div class="pin-marker pin-drop"><svg viewBox="0 0 24 24" fill="var(--pin-color)" stroke="rgba(255,255,255,0.85)" stroke-width="1.5"><path d="M12 2C8 2 5 5 5 8.5c0 5.5 7 13.5 7 13.5s7-8 7-13.5C19 5 16 2 12 2z"/></svg>${icon ? `<span class="pin-icon-overlay">${iconHtml}</span>` : ''}</div>`;
      break;
    case 'square':
      markerHtml = `<div class="pin-marker square">${iconHtml}</div>`;
      break;
    case 'star':
      markerHtml = `<div class="pin-marker star"><svg viewBox="0 0 24 24" fill="var(--pin-color)" stroke="rgba(255,255,255,0.85)" stroke-width="1"><path d="M12 2l3 6 6.5 1-4.7 4.6 1.1 6.4-5.9-3.1-5.9 3.1 1.1-6.4L2.5 9l6.5-1z"/></svg>${icon ? `<span class="pin-icon-overlay">${iconHtml}</span>` : ''}</div>`;
      break;
    case 'triangle':
      markerHtml = `<div class="pin-marker triangle">${icon ? `<span class="pin-icon-below">${iconHtml}</span>` : ''}</div>`;
      break;
    default: // circle
      markerHtml = `<div class="pin-marker circle">${iconHtml}</div>`;
  }

  el.innerHTML = `
    ${markerHtml}
    <div class="pin-label">${pin.name || 'Unnamed'}</div>
  `;

  if (selectedPin === pin.id) {
    el.classList.add('selected');
  }

  el.addEventListener('click', (e) => {
    e.stopPropagation();
    selectPin(pin.id);
  });

  el.addEventListener('dblclick', (e) => {
    e.stopPropagation();
    if (window.craftMyRole === 'viewer') {
      showNotif('You do not have permission to edit this room');
      return;
    }
    openPinEditorModal(pin.id);
  });

  // Dragging
  el.addEventListener('mousedown', (e) => {
    if (mapTool !== 'map-select') return;
    e.stopPropagation();
    startPinDrag(e, pin);
  });

  return el;
}

function startPinDrag(e, pin) {
  // Block drag for viewers
  if (window.craftMyRole === 'viewer') {
    e.preventDefault();
    e.stopPropagation();
    return;
  }
  isDraggingPin = true;
  const mapCanvas = document.getElementById('mapCanvas');
  const wrapper = document.getElementById('mapImageWrapper');
  const pinEl = document.getElementById(pin.id);

  const onMove = (moveE) => {
    if (!isDraggingPin) return;

    const rect = wrapper.getBoundingClientRect();
    const x = ((moveE.clientX - rect.left) / rect.width) * 100;
    const y = ((moveE.clientY - rect.top) / rect.height) * 100;

    pin.x = Math.max(0, Math.min(100, x));
    pin.y = Math.max(0, Math.min(100, y));

    pinEl.style.left = `${pin.x}%`;
    pinEl.style.top = `${pin.y}%`;
  };

  const onUp = () => {
    isDraggingPin = false;
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  };

  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}

function selectPin(pinId) {
  const currentMap = getCurrentMap();
  if (!currentMap) return;

  selectedPin = pinId;
  deselectRegion();

  document.querySelectorAll('.map-pin').forEach((el) => {
    el.classList.toggle('selected', el.id === pinId);
  });

  const pin = currentMap.pins.find((p) => p.id === pinId);
  if (pin) {
    showPinDetails(pin);
  }

  document.getElementById('detailsPanel').classList.remove('collapsed');
}

function deselectPin() {
  selectedPin = null;
  document.querySelectorAll('.map-pin').forEach((el) => el.classList.remove('selected'));
  document.getElementById('pinDetails').classList.add('hidden');
  document.getElementById('emptyState').classList.remove('hidden');
}

function showPinDetails(pin) {
  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('cardDetails').classList.add('hidden');
  document.getElementById('pinDetails').classList.remove('hidden');

  document.getElementById('pinDetailName').textContent = pin.name || 'Unnamed Pin';

  // Show pin image
  const pinImgSection = document.getElementById('pinImageSection');
  const pinDetailImg = document.getElementById('pinDetailImage');
  if (pin.image && pinImgSection && pinDetailImg) {
    pinDetailImg.src = pin.image;
    pinImgSection.classList.remove('hidden');
  } else if (pinImgSection) {
    pinImgSection.classList.add('hidden');
  }

  // Parse wiki links in description
  const descEl = document.getElementById('pinDetailDescription');
  descEl.innerHTML = parseWikiLinks(pin.description || 'No description');

  // Show tags
  const tagsSection = document.getElementById('pinTagsSection');
  const tagsEl = document.getElementById('pinDetailTags');

  if (pin.tags && pin.tags.length > 0) {
    tagsSection.classList.remove('hidden');
    tagsEl.innerHTML = pin.tags.map(tag =>
      `<span class="pin-tag clickable" onclick="openTagFinder('${tag}')">${tag}</span>`
    ).join('');
  } else {
    tagsSection.classList.add('hidden');
    tagsEl.innerHTML = '';
  }

  // Show associations
  const assocSection = document.getElementById('pinAssociationsSection');
  const assocEl = document.getElementById('pinDetailAssociations');
  const pinAssociations = getAssociationsFor('pin', pin.id);

  if (pinAssociations.length > 0) {
    assocSection.classList.remove('hidden');
    assocEl.innerHTML = pinAssociations.map(assoc => {
      const info = getItemInfo(assoc.type, assoc.id);
      if (!info) return '';
      const parentId = assoc.parentId || info.mapId || '';
      return `
        <div class="association-row" onclick="navigateToItem('${assoc.type}', '${assoc.id}', '${parentId}')">
          <span class="association-swatch type-${assoc.type}" style="background: ${info.color || '#888'}"></span>
          <span class="association-title">${info.name || 'Unknown'}</span>
          <span class="association-meta">${assoc.type}</span>
        </div>
      `;
    }).join('');
  } else {
    assocEl.innerHTML = '<span class="no-associations">None</span>';
  }
}

function renderPinsList() {
  const currentMap = getCurrentMap();
  const list = document.getElementById('pinsList');

  if (!currentMap || currentMap.pins.length === 0) {
    list.innerHTML = '<div class="empty-pins-message">Click on the map to add pins</div>';
    return;
  }

  list.innerHTML = '';
  currentMap.pins.forEach((pin) => {
    const item = document.createElement('div');
    item.className = `pin-list-item${selectedPin === pin.id ? ' active' : ''}`;
    item.dataset.pinId = pin.id;

    const shapeClass = `pin-shape-indicator ${pin.shape || 'circle'}`;
    item.innerHTML = `
      <span class="${shapeClass}" style="--pin-color: ${pin.color || '#ef4444'}"></span>
      <span class="pin-list-name">${pin.name || 'Unnamed'}</span>
    `;

    item.addEventListener('click', () => selectPin(pin.id));
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openPinSidebarContextMenu(e, pin);
    });

    list.appendChild(item);
  });
}

function addPin(x, y) {
  const currentMap = getCurrentMap();
  if (!currentMap) return;
  saveUndoState();

  const pin = {
    id: `pin-${Date.now()}`,
    x,
    y,
    name: 'New Pin',
    description: '',
    color: '#ef4444',
    shape: 'circle',
    tags: [],
  };

  currentMap.pins.push(pin);
  renderPins();
  renderPinsList();
  renderTagsCloud();
  updateMapStatusBar();

  // Animate the new pin
  const pinEl = document.getElementById(pin.id);
  if (pinEl) {
    pinEl.classList.add('pin-drop-anim');
    setTimeout(() => pinEl.classList.remove('pin-drop-anim'), 500);
  }

  // Open editor for new pin
  openPinEditorModal(pin.id);
}

// ============================================
// Map Regions System
// ============================================
let selectedRegionId = null;
let regionDrawing = null; // { points: [{x,y,curve}], active: true }

function getMapRegions() {
  const m = getCurrentMap();
  if (!m) return [];
  if (!m.regions) m.regions = [];
  return m.regions;
}

function renderRegions() {
  const layer = document.getElementById('regionsLayer');
  const defs = document.getElementById('regionPatternDefs');
  if (!layer || !defs) return;

  // Clear everything except defs
  layer.querySelectorAll('g.region-group').forEach(el => el.remove());
  defs.innerHTML = '';

  const regions = getMapRegions();
  let w = layer.clientWidth || layer.getBoundingClientRect().width;
  let h = layer.clientHeight || layer.getBoundingClientRect().height;
  // Fallback: use map image or wrapper dimensions if SVG layer hasn't been laid out yet
  if (!w || !h) {
    const mapImg = document.getElementById('mapImage');
    const wrapper = document.getElementById('mapImageWrapper') || layer.parentElement;
    if (mapImg && mapImg.naturalWidth) { w = mapImg.clientWidth || mapImg.naturalWidth; h = mapImg.clientHeight || mapImg.naturalHeight; }
    else if (wrapper) { w = wrapper.clientWidth; h = wrapper.clientHeight; }
  }
  if (!w || !h) return;

  regions.forEach(reg => {
    // Hidden regions: invisible to users without hidden access, dimmed for those with access
    if (reg.hidden && !window.craftCanViewHidden) return;

    // Create fill patterns
    createRegionPattern(defs, reg);

    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('class', 'region-group' + (reg.hidden ? ' region-hidden' : ''));
    g.setAttribute('data-region-id', reg.id);

    // Main path
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    const d = buildRegionPath(reg.points, true, w, h);
    path.setAttribute('d', d);

    // Fill
    if (reg.fillPattern === 'none') {
      path.setAttribute('fill', 'none');
    } else if (reg.fillPattern === 'solid') {
      path.setAttribute('fill', reg.fillColor);
      path.setAttribute('fill-opacity', reg.fillOpacity);
    } else {
      path.setAttribute('fill', `url(#pattern-${reg.id})`);
      path.setAttribute('fill-opacity', reg.fillOpacity);
    }

    // Stroke
    if (reg.strokeStyle === 'none') {
      path.setAttribute('stroke', 'none');
    } else {
      path.setAttribute('stroke', reg.strokeColor);
      path.setAttribute('stroke-width', reg.strokeWidth);
      if (reg.strokeStyle === 'dashed') path.setAttribute('stroke-dasharray', `${reg.strokeWidth * 4},${reg.strokeWidth * 2}`);
      else if (reg.strokeStyle === 'dotted') path.setAttribute('stroke-dasharray', `${reg.strokeWidth},${reg.strokeWidth * 2}`);
      path.setAttribute('stroke-linejoin', 'round');
    }

    // Hit area
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('d', d);
    hit.setAttribute('fill', 'transparent');
    hit.setAttribute('stroke', 'transparent');
    hit.setAttribute('stroke-width', Math.max(14, reg.strokeWidth + 10));
    hit.style.cursor = 'pointer';

    hit.addEventListener('click', (e) => {
      if (mapTool === 'map-region') return;
      e.stopPropagation();
      selectRegion(reg.id);
    });
    hit.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      selectedRegionId = reg.id;
      showRegionContextMenu(e.clientX, e.clientY);
    });
    // Drag entire region
    hit.addEventListener('mousedown', (e) => {
      if (mapTool === 'map-region' || e.button !== 0) return;
      e.stopPropagation();
      e.preventDefault();
      const wrapper = document.getElementById('mapImageWrapper');
      if (!wrapper) return;
      const wRect = wrapper.getBoundingClientRect();
      const wW = wRect.width / mapZoom;
      const wH = wRect.height / mapZoom;
      if (!wW || !wH) return;
      let startX = e.clientX;
      let startY = e.clientY;
      let dragged = false;
      let undoSaved = false;
      const onMove = (me) => {
        const dx = (me.clientX - startX) / mapZoom;
        const dy = (me.clientY - startY) / mapZoom;
        if (Math.abs(dx) < 2 && Math.abs(dy) < 2) return;
        if (!undoSaved) { saveMapUndoState(); undoSaved = true; }
        dragged = true;
        const pctX = (dx / wW) * 100;
        const pctY = (dy / wH) * 100;
        reg.points.forEach(p => { p.x += pctX; p.y += pctY; });
        startX = me.clientX;
        startY = me.clientY;
        renderRegions();
        renderRegionEditHandles();
      };
      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.classList.remove('mm-dragging');
        if (!dragged) {
          selectRegion(reg.id);
        }
      };
      document.body.classList.add('mm-dragging');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    g.appendChild(path);
    g.appendChild(hit);

    // Name label
    if (reg.name && !reg.hideText) {
      const centroid = getRegionCentroid(reg.points);
      const cx = (centroid.x / 100) * w;
      const cy = (centroid.y / 100) * h;
      const tc = reg.textColor || reg.strokeColor;
      const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      text.setAttribute('x', cx);
      text.setAttribute('y', cy);
      text.setAttribute('text-anchor', 'middle');
      text.setAttribute('dominant-baseline', 'central');
      text.setAttribute('dy', '0');
      text.setAttribute('fill', tc);
      text.setAttribute('font-size', '14');
      text.setAttribute('font-weight', '600');
      text.setAttribute('font-family', 'Inter, system-ui, sans-serif');
      text.setAttribute('paint-order', 'stroke');
      text.setAttribute('stroke', 'rgba(0,0,0,0.7)');
      text.setAttribute('stroke-width', '3');
      text.setAttribute('pointer-events', 'none');
      text.textContent = reg.name;
      g.appendChild(text);
    }

    // Selection highlight
    if (reg.id === selectedRegionId) {
      if (reg.strokeStyle === 'none') {
        path.setAttribute('stroke', reg.strokeColor || reg.fillColor);
        path.setAttribute('stroke-width', '2');
        path.setAttribute('stroke-dasharray', '6,3');
      } else {
        path.setAttribute('stroke-width', parseFloat(reg.strokeWidth) + 2);
      }
      path.setAttribute('filter', 'drop-shadow(0 0 4px rgba(255,255,255,0.3))');
    }

    layer.appendChild(g);
  });
}

function createRegionPattern(defs, reg) {
  if (reg.fillPattern === 'solid' || reg.fillPattern === 'none') return;

  const pat = document.createElementNS('http://www.w3.org/2000/svg', 'pattern');
  pat.setAttribute('id', `pattern-${reg.id}`);
  pat.setAttribute('patternUnits', 'userSpaceOnUse');

  if (reg.fillPattern === 'stripes') {
    pat.setAttribute('width', '10');
    pat.setAttribute('height', '10');
    pat.setAttribute('patternTransform', 'rotate(45)');
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', '0'); line.setAttribute('y1', '0');
    line.setAttribute('x2', '0'); line.setAttribute('y2', '10');
    line.setAttribute('stroke', reg.fillColor);
    line.setAttribute('stroke-width', '4');
    pat.appendChild(line);
  } else if (reg.fillPattern === 'dots') {
    pat.setAttribute('width', '12');
    pat.setAttribute('height', '12');
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', '6'); circle.setAttribute('cy', '6');
    circle.setAttribute('r', '2.5');
    circle.setAttribute('fill', reg.fillColor);
    pat.appendChild(circle);
  } else if (reg.fillPattern === 'crosshatch') {
    pat.setAttribute('width', '10');
    pat.setAttribute('height', '10');
    const l1 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l1.setAttribute('x1','0'); l1.setAttribute('y1','0'); l1.setAttribute('x2','10'); l1.setAttribute('y2','10');
    l1.setAttribute('stroke', reg.fillColor); l1.setAttribute('stroke-width','1.5');
    const l2 = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    l2.setAttribute('x1','10'); l2.setAttribute('y1','0'); l2.setAttribute('x2','0'); l2.setAttribute('y2','10');
    l2.setAttribute('stroke', reg.fillColor); l2.setAttribute('stroke-width','1.5');
    pat.appendChild(l1);
    pat.appendChild(l2);
  }
  defs.appendChild(pat);
}

function buildRegionPath(points, closed, w, h) {
  if (!points || points.length < 2 || !w || !h) return '';
  const px = (p) => ({ x: (p.x / 100) * w, y: (p.y / 100) * h });
  const p0 = px(points[0]);
  let d = `M ${p0.x} ${p0.y}`;
  for (let i = 1; i < points.length; i++) {
    const p = px(points[i]);
    const prev = px(points[i - 1]);
    if (points[i].curve) {
      const mx = (prev.x + p.x) / 2;
      const my = (prev.y + p.y) / 2;
      const ddx = p.x - prev.x;
      const ddy = p.y - prev.y;
      const dir = points[i].curve === 'in' ? -1 : 1;
      d += ` Q ${mx + ddy * 0.25 * dir} ${my - ddx * 0.25 * dir} ${p.x} ${p.y}`;
    } else {
      d += ` L ${p.x} ${p.y}`;
    }
  }
  if (closed && points.length > 2) {
    const last = px(points[points.length - 1]);
    const first = px(points[0]);
    if (points[0].curve) {
      const mx = (last.x + first.x) / 2;
      const my = (last.y + first.y) / 2;
      const ddx = first.x - last.x;
      const ddy = first.y - last.y;
      const dir = points[0].curve === 'in' ? -1 : 1;
      d += ` Q ${mx + ddy * 0.25 * dir} ${my - ddx * 0.25 * dir} ${first.x} ${first.y}`;
    }
    d += ' Z';
  }
  return d;
}

function getRegionCentroid(points) {
  if (!points || points.length === 0) return { x: 50, y: 50 };
  // Bounding box center is the most visually centered for all region shapes
  const minX = Math.min(...points.map(p => p.x));
  const maxX = Math.max(...points.map(p => p.x));
  const minY = Math.min(...points.map(p => p.y));
  const maxY = Math.max(...points.map(p => p.y));
  return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
}

// ---- Region Drawing ----
function startRegionDrawing() {
  regionDrawing = { points: [], active: true };
  const drawLayer = document.getElementById('regionDrawLayer');
  drawLayer.classList.remove('hidden');
  drawLayer.innerHTML = '';
  showNotif('Click to place points. Double-click or press Enter to finish.');
}

function addRegionDrawPoint(xPct, yPct) {
  if (!regionDrawing) return;
  regionDrawing.points.push({ x: xPct, y: yPct, curve: false });
  renderRegionDrawPreview();
}

function renderRegionDrawPreview() {
  const drawLayer = document.getElementById('regionDrawLayer');
  if (!drawLayer || !regionDrawing) return;
  drawLayer.innerHTML = '';

  // Remove old HTML handles
  document.querySelectorAll('.region-draw-handle').forEach(el => el.remove());

  const pts = regionDrawing.points;
  if (pts.length === 0) return;

  const w = drawLayer.clientWidth || drawLayer.getBoundingClientRect().width;
  const h = drawLayer.clientHeight || drawLayer.getBoundingClientRect().height;

  // Preview path (SVG with pixel coordinates)
  if (pts.length > 1 && w && h) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', buildRegionPath(pts, false, w, h));
    path.setAttribute('fill', 'rgba(78,205,196,0.15)');
    path.setAttribute('stroke', '#4ecdc4');
    path.setAttribute('stroke-width', '2');
    path.setAttribute('stroke-dasharray', '8,4');
    drawLayer.appendChild(path);

    // Closing line preview
    if (pts.length > 2) {
      const last = pts[pts.length - 1];
      const first = pts[0];
      const closeLine = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      closeLine.setAttribute('x1', (last.x / 100) * w);
      closeLine.setAttribute('y1', (last.y / 100) * h);
      closeLine.setAttribute('x2', (first.x / 100) * w);
      closeLine.setAttribute('y2', (first.y / 100) * h);
      closeLine.setAttribute('stroke', '#4ecdc4');
      closeLine.setAttribute('stroke-width', '1');
      closeLine.setAttribute('stroke-dasharray', '4,4');
      closeLine.setAttribute('opacity', '0.5');
      drawLayer.appendChild(closeLine);
    }
  }

  // HTML dot handles (positioned via CSS %, always perfectly circular)
  const wrapper = document.getElementById('mapImageWrapper');
  const hs = 1 / mapZoom;
  pts.forEach((p, i) => {
    const dot = document.createElement('div');
    dot.className = 'region-draw-handle';
    dot.style.left = p.x + '%';
    dot.style.top = p.y + '%';
    dot.style.transform = `translate(-50%, -50%) scale(${hs})`;

    if (i === 0) {
      dot.classList.add('first');
      if (pts.length > 2) {
        dot.addEventListener('mousedown', (e) => {
          e.stopPropagation();
          e.preventDefault();
          finishRegionDrawing();
        });
        dot.addEventListener('click', (e) => {
          e.stopPropagation();
          e.preventDefault();
        });
      }
    }
    wrapper.appendChild(dot);
  });
}

function finishRegionDrawing() {
  if (!regionDrawing || regionDrawing.points.length < 3) {
    cancelRegionDrawing();
    showNotif('Need at least 3 points for a region');
    return;
  }

  saveMapUndoState();

  const map = getCurrentMap();
  if (!map) return;
  if (!map.regions) map.regions = [];

  const reg = {
    id: 'reg_' + Date.now() + '_' + Math.floor(Math.random() * 1000),
    name: '',
    points: regionDrawing.points,
    fillColor: '#4ecdc4',
    fillOpacity: 0.2,
    fillPattern: 'solid',
    strokeColor: '#4ecdc4',
    strokeWidth: 2,
    strokeStyle: 'solid',
    textColor: '#4ecdc4',
    hideText: false,
    tags: []
  };
  map.regions.push(reg);

  regionDrawing = null;
  document.getElementById('regionDrawLayer').classList.add('hidden');
  document.getElementById('regionDrawLayer').innerHTML = '';
  document.querySelectorAll('.region-draw-handle').forEach(el => el.remove());

  renderRegions();
  selectRegion(reg.id);
  setMapTool('map-select');
  showNotif('Region created — edit properties in the details panel');
}

function cancelRegionDrawing() {
  regionDrawing = null;
  const drawLayer = document.getElementById('regionDrawLayer');
  if (drawLayer) {
    drawLayer.classList.add('hidden');
    drawLayer.innerHTML = '';
  }
  document.querySelectorAll('.region-draw-handle').forEach(el => el.remove());
}

// ---- Map Path Drawing ----
let mapPathDrawing = null;
let selectedMapPath = null;

function startMapPathDrawing() {
  mapPathDrawing = { points: [], active: true };
}

function addMapPathPoint(xPct, yPct) {
  if (!mapPathDrawing) return;
  mapPathDrawing.points.push({ x: xPct, y: yPct });
  renderMapPathPreview();
}

function renderMapPathPreview() {
  let preview = document.getElementById('mapPathPreview');
  if (!preview) {
    const wrapper = document.getElementById('mapImageWrapper');
    if (!wrapper) return;
    preview = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    preview.id = 'mapPathPreview';
    preview.setAttribute('viewBox', '0 0 100 100');
    preview.setAttribute('preserveAspectRatio', 'none');
    preview.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:15;';
    wrapper.appendChild(preview);
  }
  preview.innerHTML = '';
  if (!mapPathDrawing || mapPathDrawing.points.length < 1) return;
  const pts = mapPathDrawing.points;
  // Draw dots
  pts.forEach(p => {
    const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    circle.setAttribute('cx', p.x);
    circle.setAttribute('cy', p.y);
    circle.setAttribute('r', '0.6');
    circle.setAttribute('fill', '#d4a824');
    circle.setAttribute('stroke', '#000');
    circle.setAttribute('stroke-width', '0.15');
    preview.appendChild(circle);
  });
  // Draw curve
  if (pts.length >= 2) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', buildSmoothPath(pts));
    path.setAttribute('stroke', '#d4a824');
    path.setAttribute('stroke-width', '0.3');
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-dasharray', '1 0.5');
    preview.appendChild(path);
  }
}

function buildSmoothPath(pts, curveType, tension) {
  if (pts.length < 2) return '';
  const t = tension != null ? tension : 0.33;
  const type = curveType || 'smooth';
  
  if (type === 'straight' || pts.length === 2) {
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i].x} ${pts[i].y}`;
    return d;
  }
  
  if (type === 'step') {
    let d = `M ${pts[0].x} ${pts[0].y}`;
    for (let i = 1; i < pts.length; i++) {
      const mx = (pts[i - 1].x + pts[i].x) / 2;
      d += ` L ${mx} ${pts[i - 1].y} L ${mx} ${pts[i].y} L ${pts[i].x} ${pts[i].y}`;
    }
    return d;
  }
  
  // Smooth: Catmull-Rom spline with configurable tension
  let d = `M ${pts[0].x} ${pts[0].y}`;
  const alpha = t * 3;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(pts.length - 1, i + 2)];
    const cp1x = p1.x + (p2.x - p0.x) * alpha / 6;
    const cp1y = p1.y + (p2.y - p0.y) * alpha / 6;
    const cp2x = p2.x - (p3.x - p1.x) * alpha / 6;
    const cp2y = p2.y - (p3.y - p1.y) * alpha / 6;
    d += ` C ${cp1x} ${cp1y}, ${cp2x} ${cp2y}, ${p2.x} ${p2.y}`;
  }
  return d;
}

function finishMapPath() {
  if (!mapPathDrawing || mapPathDrawing.points.length < 2) { cancelMapPath(); return; }
  const map = getCurrentMap();
  if (!map) { cancelMapPath(); return; }
  if (!map.paths) map.paths = [];
  const activeColorBtn = document.querySelector('.pin-color-btn.active');
  map.paths.push({
    id: 'path-' + Date.now(),
    points: mapPathDrawing.points,
    color: activeColorBtn ? activeColorBtn.dataset.color : '#d4a824',
    width: 2,
    style: 'solid',
    name: 'Path ' + (map.paths.length + 1)
  });
  mapPathDrawing = null;
  const preview = document.getElementById('mapPathPreview');
  if (preview) preview.remove();
  renderMapPaths();
  setMapTool('map-select');
  showNotif('Path created');
}

function cancelMapPath() {
  mapPathDrawing = null;
  const preview = document.getElementById('mapPathPreview');
  if (preview) preview.remove();
}

function renderMapPaths() {
  const map = getCurrentMap();
  if (!map || !map.paths) return;
  let pathLayer = document.getElementById('mapPathLayer');
  const wrapper = document.getElementById('mapImageWrapper');
  if (!wrapper) return;
  if (!pathLayer) {
    pathLayer = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    pathLayer.id = 'mapPathLayer';
    pathLayer.setAttribute('viewBox', '0 0 100 100');
    pathLayer.setAttribute('preserveAspectRatio', 'none');
    pathLayer.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:5;';
    wrapper.appendChild(pathLayer);
  }
  // Ensure viewBox is set (for existing layers missing it)
  if (!pathLayer.getAttribute('viewBox')) {
    pathLayer.setAttribute('viewBox', '0 0 100 100');
    pathLayer.setAttribute('preserveAspectRatio', 'none');
  }
  pathLayer.innerHTML = '';
  map.paths.forEach(p => {
    if (p.points.length < 2) return;
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', buildSmoothPath(p.points, p.curveType, p.tension));
    path.setAttribute('stroke', p.color || '#d4a824');
    path.setAttribute('stroke-width', p.width || 2);
    path.setAttribute('fill', 'none');
    path.setAttribute('stroke-linecap', 'round');
    path.setAttribute('stroke-linejoin', 'round');
    path.setAttribute('vector-effect', 'non-scaling-stroke');
    if (p.style === 'dashed') path.setAttribute('stroke-dasharray', '8 4');
    else if (p.style === 'dotted') path.setAttribute('stroke-dasharray', '2 4');
    else if (p.style === 'dashdot') path.setAttribute('stroke-dasharray', '8 3 2 3');
    path.style.pointerEvents = 'stroke';
    path.style.cursor = 'pointer';
    if (p.id === selectedMapPath) {
      path.setAttribute('filter', 'drop-shadow(0 0 4px rgba(212,168,36,0.6))');
      path.setAttribute('stroke-width', (p.width || 2) + 1.5);
    }
    path.addEventListener('click', (e) => {
      e.stopPropagation();
      selectMapPath(p.id);
    });
    pathLayer.appendChild(path);
    // Path endpoints - arrows/dots based on setting
    const arrow = p.arrow || 'none';
    const pts = p.points;
    const color = p.color || '#d4a824';
    const w = p.width || 2;
    if (arrow === 'dots' || arrow === 'none') {
      [pts[0], pts[pts.length - 1]].forEach(pt => {
        const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        dot.setAttribute('cx', pt.x);
        dot.setAttribute('cy', pt.y);
        dot.setAttribute('r', '0.5');
        dot.setAttribute('fill', color);
        dot.setAttribute('stroke', 'rgba(0,0,0,0.5)');
        dot.setAttribute('stroke-width', '1');
        dot.setAttribute('vector-effect', 'non-scaling-stroke');
        pathLayer.appendChild(dot);
      });
    }
    if (arrow === 'end' || arrow === 'both') {
      drawPathArrow(pathLayer, pts[pts.length - 2], pts[pts.length - 1], color, w);
    }
    if (arrow === 'start' || arrow === 'both') {
      drawPathArrow(pathLayer, pts[1], pts[0], color, w);
    }
  });
}

function drawPathArrow(svg, fromPt, toPt, color, width) {
  if (!fromPt || !toPt) return;
  const size = Math.max(1.2, width * 0.5);
  const dx = toPt.x - fromPt.x;
  const dy = toPt.y - fromPt.y;
  const len = Math.hypot(dx, dy);
  if (len < 0.01) return;
  const nx = dx / len, ny = dy / len;
  const px = -ny, py = nx;
  const tipX = toPt.x, tipY = toPt.y;
  const baseX = tipX - nx * size * 0.8, baseY = tipY - ny * size * 0.8;
  const d = `M ${tipX} ${tipY} L ${baseX + px * size * 0.4} ${baseY + py * size * 0.4} L ${baseX - px * size * 0.4} ${baseY - py * size * 0.4} Z`;
  const arrowPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  arrowPath.setAttribute('d', d);
  arrowPath.setAttribute('fill', color);
  arrowPath.setAttribute('stroke', 'rgba(0,0,0,0.3)');
  arrowPath.setAttribute('stroke-width', '0.5');
  arrowPath.setAttribute('vector-effect', 'non-scaling-stroke');
  svg.appendChild(arrowPath);
}

function selectMapPath(id) {
  selectedMapPath = id;
  const map = getCurrentMap();
  if (!map || !map.paths) return;
  const p = map.paths.find(pp => pp.id === id);
  if (!p) return;
  // Show path detail panel
  document.getElementById('emptyState')?.classList.add('hidden');
  document.getElementById('cardDetails')?.classList.add('hidden');
  document.getElementById('pinDetails')?.classList.add('hidden');
  document.getElementById('regionDetails')?.classList.add('hidden');
  document.getElementById('chapterDetails')?.classList.add('hidden');
  const panel = document.getElementById('mapPathDetails');
  if (panel) {
    panel.classList.remove('hidden');
    document.getElementById('pathDetailName').value = p.name || '';
    document.getElementById('pathDetailWidth').value = p.width || 2;
    document.getElementById('pathDetailStyle').value = p.style || 'solid';
    const arrowEl = document.getElementById('pathDetailArrow');
    if (arrowEl) arrowEl.value = p.arrow || 'none';
    // Init color swatches
    initSwatchPicker('pathColorSwatches', p.color || '#d4a824', (c) => { p.color = c; renderMapPaths(); });
    // Wire up controls
    document.getElementById('pathDetailName').onchange = (e) => { p.name = e.target.value; };
    document.getElementById('pathDetailWidth').oninput = (e) => { p.width = parseFloat(e.target.value); renderMapPaths(); };
    document.getElementById('pathDetailStyle').onchange = (e) => { p.style = e.target.value; renderMapPaths(); };
    if (arrowEl) arrowEl.onchange = (e) => { p.arrow = e.target.value; renderMapPaths(); };
    const curveEl = document.getElementById('pathDetailCurve');
    if (curveEl) { curveEl.value = p.curveType || 'smooth'; curveEl.onchange = (e) => { p.curveType = e.target.value; renderMapPaths(); }; }
    const tensionEl = document.getElementById('pathDetailTension');
    const tensionVal = document.getElementById('pathTensionVal');
    if (tensionEl) {
      tensionEl.value = p.tension != null ? p.tension : 0.33;
      if (tensionVal) tensionVal.textContent = tensionEl.value;
      tensionEl.oninput = (e) => { p.tension = parseFloat(e.target.value); if (tensionVal) tensionVal.textContent = e.target.value; renderMapPaths(); };
    }
    document.getElementById('pathDeleteBtn').onclick = () => { deleteSelectedMapPath(); panel.classList.add('hidden'); };
    document.getElementById('detailsPanel')?.classList.remove('collapsed');
  }
  renderMapPaths();
}

function deleteSelectedMapPath() {
  if (!selectedMapPath) return;
  const map = getCurrentMap();
  if (!map || !map.paths) return;
  map.paths = map.paths.filter(p => p.id !== selectedMapPath);
  selectedMapPath = null;
  renderMapPaths();
  showNotif('Path deleted');
}

// ---- Region Selection & Editing ----
function selectRegion(id) {
  deselectPin();
  selectedRegionId = id;
  renderRegions();
  // Only show edit handles for non-viewers
  if (window.craftMyRole !== 'viewer') {
    renderRegionEditHandles();
  }
  showRegionDetail();
}

function deselectRegion() {
  if (selectedRegionId) {
    selectedRegionId = null;
    document.getElementById('regionDetails')?.classList.add('hidden');
    removeRegionEditHandles();
    renderRegions();
  }
}

function removeRegionEditHandles() {
  document.querySelectorAll('.region-edit-handle').forEach(el => el.remove());
}

function renderRegionEditHandles() {
  removeRegionEditHandles();
  const regions = getMapRegions();
  const reg = regions.find(r => r.id === selectedRegionId);
  if (!reg) return;

  const wrapper = document.getElementById('mapImageWrapper');
  if (!wrapper) return;

  const pts = reg.points;

  // Edge midpoint "add point" handles
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;

    const addBtn = document.createElement('div');
    addBtn.className = 'region-edit-handle region-edge-add';
    addBtn.style.left = mx + '%';
    addBtn.style.top = my + '%';
    const hs = 1 / mapZoom;
    addBtn.style.transform = `translate(-50%, -50%) scale(${hs})`;
    
    addBtn.textContent = '+';

    const insertIdx = (i + 1) % pts.length;
    addBtn.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      saveMapUndoState();
      // Insert at the actual index after point i
      const realIdx = i + 1;
      reg.points.splice(realIdx, 0, { x: mx, y: my, curve: false });
      renderRegions();
      renderRegionEditHandles();
      renderRegionPointsList(reg);
      showNotif('Point added');
    });

    wrapper.appendChild(addBtn);
  }

  // Vertex handles
  reg.points.forEach((p, i) => {
    const handle = document.createElement('div');
    handle.className = 'region-edit-handle' + (p.curve === 'out' ? ' curved-out' : p.curve === 'in' ? ' curved-in' : (p.curve === true ? ' curved-out' : ''));
    handle.style.left = p.x + '%';
    handle.style.top = p.y + '%';
    const hs = 1 / mapZoom;
    handle.style.transform = `translate(-50%, -50%) scale(${hs})`;
    

    let dragged = false;
    let startX, startY;

    handle.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      dragged = false;
      startX = e.clientX;
      startY = e.clientY;

      const rect = wrapper.getBoundingClientRect();

      const onMove = (me) => {
        const dx = me.clientX - startX;
        const dy = me.clientY - startY;
        if (Math.abs(dx) > 3 || Math.abs(dy) > 3) dragged = true;

        if (dragged) {
          const newX = ((me.clientX - rect.left) / rect.width) * 100;
          const newY = ((me.clientY - rect.top) / rect.height) * 100;
          p.x = Math.max(0, Math.min(100, newX));
          p.y = Math.max(0, Math.min(100, newY));
          handle.style.left = p.x + '%';
          handle.style.top = p.y + '%';
          renderRegions();
        }
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        document.body.classList.remove('mm-dragging');

        if (!dragged) {
          // Click — cycle curve: off → out → in → off
          saveMapUndoState();
          if (!p.curve) p.curve = 'out';
          else if (p.curve === 'out') p.curve = 'in';
          else p.curve = false;
          renderRegions();
          renderRegionEditHandles();
          renderRegionPointsList(reg);
        } else {
          saveMapUndoState();
          renderRegionEditHandles();
          renderRegionPointsList(reg);
        }
      };

      document.body.classList.add('mm-dragging');
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });

    wrapper.appendChild(handle);
  });
}

function showRegionDetail() {
  const regions = getMapRegions();
  const reg = regions.find(r => r.id === selectedRegionId);
  if (!reg) return;

  const get = id => document.getElementById(id);

  // Show region panel, hide others
  const dp = get('detailsPanel');
  dp?.classList.remove('collapsed');
  ['emptyState','cardDetails','pinDetails','chapterDetails','mindmapDetails','mindmapSettings',
   'factionDetails','contactDetails','orgDetails','tlDetails','tlCalendarPanel'].forEach(id => {
    get(id)?.classList.add('hidden');
  });
  get('regionDetails')?.classList.remove('hidden');

  // Populate fields
  get('regionDetailName').value = reg.name || '';
  get('regionFillOpacity').value = reg.fillOpacity;
  get('regionFillPattern').value = reg.fillPattern;
  get('regionStrokeWidth').value = reg.strokeWidth;
  get('regionStrokeStyle').value = reg.strokeStyle;
  get('regionHideText').checked = !!reg.hideText;

  // Swatch pickers
  initSwatchPicker('regionTextColorSwatches', reg.textColor || reg.strokeColor, (c) => { reg.textColor = c; renderRegions(); });
  initSwatchPicker('regionFillColorSwatches', reg.fillColor, (c) => { saveMapUndoState(); reg.fillColor = c; renderRegions(); });
  initSwatchPicker('regionStrokeColorSwatches', reg.strokeColor, (c) => { saveMapUndoState(); reg.strokeColor = c; renderRegions(); });

  // Bind inputs
  get('regionDetailName').oninput = () => { reg.name = get('regionDetailName').value; renderRegions(); };
  get('regionFillOpacity').oninput = () => { reg.fillOpacity = parseFloat(get('regionFillOpacity').value); renderRegions(); };
  get('regionFillPattern').onchange = () => { saveMapUndoState(); reg.fillPattern = get('regionFillPattern').value; renderRegions(); };
  get('regionStrokeWidth').oninput = () => { reg.strokeWidth = parseFloat(get('regionStrokeWidth').value); renderRegions(); };
  get('regionStrokeStyle').onchange = () => { saveMapUndoState(); reg.strokeStyle = get('regionStrokeStyle').value; renderRegions(); };
  get('regionHideText').onchange = () => { reg.hideText = get('regionHideText').checked; renderRegions(); };

  get('regionDeleteBtn').onclick = () => deleteSelectedRegion();

  renderRegionPointsList(reg);

  // Tags
  if (!reg.tags) reg.tags = [];
  renderRegionTags(reg);
  const tagInput = get('regionDetailTagsInput');
  if (tagInput) tagInput.value = '';
}

// ---- Region Tag Functions ----
function addRegionTagFromInput() {
  const input = document.getElementById('regionDetailTagsInput');
  if (!input) return;
  const regions = getMapRegions();
  const reg = regions.find(r => r.id === selectedRegionId);
  if (!reg) return;
  const raw = input.value.replace(/,/g, '').trim().toLowerCase();
  if (!raw) { input.value = ''; return; }
  if (!reg.tags) reg.tags = [];
  if (!reg.tags.includes(raw)) {
    reg.tags.push(raw);
  }
  input.value = '';
  renderRegionTags(reg);
  renderTagsCloud();
}

function renderRegionTags(reg) {
  const el = document.getElementById('regionDetailTagsDisplay');
  if (!el || !reg) return;
  el.innerHTML = (reg.tags || []).map(t =>
    `<span class="chapter-tag-pill">${t}<button class="chapter-tag-remove" onclick="removeRegionTag('${reg.id}','${t.replace(/'/g,"\\\\'")}')">&times;</button></span>`
  ).join('');
}

function removeRegionTag(regId, tag) {
  const regions = getMapRegions();
  const reg = regions.find(r => r.id === regId);
  if (!reg) return;
  reg.tags = (reg.tags || []).filter(t => t !== tag);
  renderRegionTags(reg);
  renderTagsCloud();
}

function renderRegionPointsList(reg) {
  const list = document.getElementById('regionPointsList');
  if (!list) return;
  list.innerHTML = reg.points.map((p, i) => {
    const curveLabel = p.curve === 'out' ? '⌒' : p.curve === 'in' ? '⌓' : '—';
    const curveClass = p.curve ? ' active' : '';
    return `<div class="region-point-row">
      <span class="region-point-label">P${i + 1}</span>
      <span class="region-point-coords">${p.x.toFixed(1)}, ${p.y.toFixed(1)}</span>
      <button class="region-point-curve-btn${curveClass}" onclick="toggleRegionPointCurve('${reg.id}',${i})" title="Cycle curve: off → out → in">${curveLabel}</button>
      <button class="region-point-del-btn" onclick="deleteRegionPoint('${reg.id}',${i})" title="Delete point">×</button>
    </div>`;
  }).join('');
}

function toggleRegionPointCurve(regId, ptIndex) {
  const regions = getMapRegions();
  const reg = regions.find(r => r.id === regId);
  if (!reg) return;
  saveMapUndoState();
  const p = reg.points[ptIndex];
  if (!p.curve) p.curve = 'out';
  else if (p.curve === 'out') p.curve = 'in';
  else p.curve = false;
  renderRegions();
  renderRegionPointsList(reg);
}

function deleteRegionPoint(regId, ptIndex) {
  const regions = getMapRegions();
  const reg = regions.find(r => r.id === regId);
  if (!reg || reg.points.length <= 3) {
    showNotif('Region needs at least 3 points');
    return;
  }
  saveMapUndoState();
  reg.points.splice(ptIndex, 1);
  renderRegions();
  renderRegionPointsList(reg);
}

function deleteSelectedRegion() {
  const map = getCurrentMap();
  if (!map || !map.regions) return;
  saveMapUndoState();
  map.regions = map.regions.filter(r => r.id !== selectedRegionId);
  selectedRegionId = null;
  document.getElementById('regionDetails')?.classList.add('hidden');
  document.getElementById('emptyState')?.classList.remove('hidden');
  document.getElementById('regionContextMenu')?.classList.add('hidden');
  removeRegionEditHandles();
  renderRegions();
  showNotif('Region deleted');
}

function editSelectedRegion() {
  document.getElementById('regionContextMenu')?.classList.add('hidden');
  selectRegion(selectedRegionId);
}

function duplicateSelectedRegion() {
  document.getElementById('regionContextMenu')?.classList.add('hidden');
  const map = getCurrentMap();
  if (!map || !map.regions) return;
  const reg = map.regions.find(r => r.id === selectedRegionId);
  if (!reg) return;
  saveMapUndoState();
  const dup = JSON.parse(JSON.stringify(reg));
  dup.id = 'reg_' + Date.now() + '_' + Math.floor(Math.random() * 1000);
  dup.name = (dup.name || 'Region') + ' (copy)';
  dup.points = dup.points.map(p => ({ ...p, x: p.x + 2, y: p.y + 2 }));
  map.regions.push(dup);
  renderRegions();
  selectRegion(dup.id);
  showNotif('Region duplicated');
}

function toggleHideRegionCtx() {
  document.getElementById('regionContextMenu')?.classList.add('hidden');
  const map = getCurrentMap();
  if (!map || !map.regions) return;
  const reg = map.regions.find(r => r.id === selectedRegionId);
  if (!reg) return;
  saveMapUndoState();
  reg.hidden = !reg.hidden;
  renderRegions();
  showNotif(reg.hidden ? 'Region hidden' : 'Region visible');
}

function showRegionContextMenu(cx, cy) {
  const menu = document.getElementById('regionContextMenu');
  if (!menu) return;
  menu.style.left = cx + 'px';
  menu.style.top = cy + 'px';
  menu.classList.remove('hidden');
}

// ---- Map-scoped undo helpers ----
function saveMapUndoState() {
  const map = getCurrentMap();
  if (!map) return;
  undoStacks.map.push(JSON.stringify({ pins: map.pins, regions: map.regions || [] }));
  if (undoStacks.map.length > MAX_UNDO) undoStacks.map.shift();
  redoStacks.map = [];
}

// ============================================
// Wiki Links
// ============================================
function parseWikiLinks(text) {
  if (!text) return '';

  // Match [[Name]] or [[Name|Display Text]]
  return text.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (match, itemName, displayText) => {
    const display = displayText || itemName;
    const result = findEntityByName(itemName.trim());

    if (result) {
      return `<span class="wiki-link" onclick="navigateToEntity('${result.type}','${result.id}','${result.parentId || ''}')">${display}</span>`;
    } else {
      return `<span class="wiki-link broken">${display}</span>`;
    }
  });
}

function findEntityByName(name) {
  const lowerName = name.toLowerCase();
  // Search cards
  for (const board of boards) {
    for (const card of board.cards) {
      if (card.title && card.title.toLowerCase().includes(lowerName)) return { type: 'card', id: card.id };
    }
  }
  // Search pins
  for (const map of maps) {
    for (const pin of map.pins) {
      if (pin.name && pin.name.toLowerCase().includes(lowerName)) return { type: 'pin', id: pin.id, parentId: map.id };
    }
  }
  // Search chapters
  for (const ch of chapters) {
    if (ch.title && ch.title.toLowerCase().includes(lowerName)) return { type: 'chapter', id: ch.id };
  }
  // Search factions
  for (const f of factions) {
    if (f.name && f.name.toLowerCase().includes(lowerName)) return { type: 'faction', id: f.id };
  }
  // Search contacts
  for (const c of contacts) {
    if (c.name && c.name.toLowerCase().includes(lowerName)) return { type: 'contact', id: c.id };
  }
  // Search organizations
  for (const o of organizations) {
    if (o.name && o.name.toLowerCase().includes(lowerName)) return { type: 'org', id: o.id };
  }
  return null;
}

function navigateToEntity(type, id, parentId) {
  if (type === 'card') { navigateToCard(id); }
  else if (type === 'pin') { navigateToPin(parentId, id); }
  else if (type === 'chapter') { navigateToView('write'); setTimeout(() => selectChapter(id), 50); }
  else if (type === 'faction') { navigateToView('factions'); setTimeout(() => { switchFacTab('factions'); selectedFactionId = id; renderFactionGrid(); renderFactionsSidebar(); showFacDetail(); }, 50); }
  else if (type === 'contact') { navigateToView('factions'); setTimeout(() => { switchFacTab('contacts'); selectedContactId = id; renderContactsGrid(); renderContactsSidebar(); showContactDetail(); }, 50); }
  else if (type === 'org') { navigateToView('factions'); setTimeout(() => { switchFacTab('orgs'); selectedOrgId = id; renderOrgsGrid(); renderOrgsSidebar(); showOrgDetail(); }, 50); }
  else if (type === 'region') { navigateToView('map'); setTimeout(() => { if (parentId) selectMap(parentId); setTimeout(() => selectRegion(id), 100); }, 50); }
}

function processWikiLinksInEditor() {
  const editor = document.getElementById('writeEditor');
  if (!editor) return;
  const sel = window.getSelection();
  if (!sel.rangeCount) return;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== 3) return; // text node only
  const text = node.textContent;
  // Look for completed [[...]] followed by a space or at end
  const match = text.match(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]\s$/);
  if (!match) return;
  const itemName = match[1].trim();
  const displayText = match[2] || itemName;
  const result = findEntityByName(itemName);
  if (!result) return;

  const matchStart = text.lastIndexOf('[[' + match[1]);
  if (matchStart === -1) return;

  // Create the wiki-link span
  const beforeText = text.substring(0, matchStart);
  const afterText = text.substring(matchStart + match[0].length);
  const link = document.createElement('span');
  link.className = 'wiki-link';
  link.setAttribute('onclick', `navigateToEntity('${result.type}','${result.id}','${result.parentId || ''}')`);
  link.textContent = displayText;

  const parent = node.parentNode;
  const beforeNode = document.createTextNode(beforeText);
  const afterSpace = document.createTextNode('\u00A0' + afterText);
  parent.insertBefore(beforeNode, node);
  parent.insertBefore(link, node);
  parent.insertBefore(afterSpace, node);
  parent.removeChild(node);

  // Place cursor after the link
  const newRange = document.createRange();
  newRange.setStart(afterSpace, 1);
  newRange.collapse(true);
  sel.removeAllRanges();
  sel.addRange(newRange);

  saveCurrentChapter();
}

function navigateToCard(cardId) {
  // Find which board has this card
  for (const board of boards) {
    const card = board.cards.find((c) => c.id === cardId);
    if (card) {
      currentBoardId = board.id;
      switchView('board');
      renderBoardsList();
      updateCanvas();

      setTimeout(() => {
        const cardEl = document.getElementById(cardId);
        if (cardEl) {
          selectCard(cardEl);
          // Scroll card into view
          const container = document.getElementById('boardView');
          const cardRect = cardEl.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();

          panOffset.x = containerRect.width / 2 - card.x * zoom - cardEl.offsetWidth / 2;
          panOffset.y = containerRect.height / 2 - card.y * zoom - cardEl.offsetHeight / 2;
          applyCanvasTransform();
        }
      }, 100);
      return;
    }
  }
}

// ============================================
// Chapters Management
// ============================================
function renderChaptersList() {
  const list = document.getElementById('chaptersList');
  list.innerHTML = '';

  // Helper: is a chapter effectively hidden (directly or via folder)
  function isChapterEffectivelyHidden(ch) {
    if (ch.hidden) return true;
    if (ch.folderId) {
      const f = chapterFolders.find(f => f.id === ch.folderId);
      if (f && f.hidden) return true;
    }
    return false;
  }

  function createChapterItem(chapter) {
    const item = document.createElement('div');
    const effectivelyHidden = isChapterEffectivelyHidden(chapter);
    item.className = `chapter-item${chapter.id === currentChapterId ? ' active' : ''}${effectivelyHidden ? ' item-hidden' : ''}`;
    item.dataset.chapterId = chapter.id;
    item.draggable = true;

    item.innerHTML = `
      <span class="drag-handle">⋮⋮</span>
      <div class="chapter-info">
        <input type="text" class="chapter-label-input" value="${chapter.label}" data-chapter-id="${chapter.id}">
        <input type="text" class="chapter-title" value="${chapter.title}" data-chapter-id="${chapter.id}">
      </div>
      <span class="chapter-words">${chapter.words || 0}</span>
      <button class="delete-item-btn" data-id="${chapter.id}" title="Delete">×</button>
    `;

    item.addEventListener('click', (e) => {
      if (e.target.tagName !== 'INPUT' && !e.target.classList.contains('delete-item-btn')) {
        selectChapter(chapter.id);
      }
    });

    const labelInput = item.querySelector('.chapter-label-input');
    labelInput.addEventListener('change', (e) => {
      chapter.label = e.target.value;
      if (chapter.id === currentChapterId) {
        document.getElementById('writeChapterLabel').value = e.target.value;
      }
      if (typeof window.craftSchedulePush === 'function') window.craftSchedulePush();
    });
    labelInput.addEventListener('click', (e) => e.stopPropagation());

    const titleInput = item.querySelector('.chapter-title');
    titleInput.addEventListener('change', (e) => {
      chapter.title = e.target.value;
      if (chapter.id === currentChapterId) {
        document.getElementById('writeChapterTitle').value = e.target.value;
      }
      if (typeof window.craftSchedulePush === 'function') window.craftSchedulePush();
    });
    titleInput.addEventListener('click', (e) => e.stopPropagation());

    item.querySelector('.delete-item-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      deleteChapter(chapter.id);
    });

    item.addEventListener('dragstart', (e) => handleListDragStart(e, 'chapter'));
    item.addEventListener('dragover', handleListDragOver);
    item.addEventListener('dragleave', handleListDragLeave);
    item.addEventListener('drop', (e) => handleListDrop(e, 'chapter'));
    item.addEventListener('dragend', handleListDragEnd);

    // Right-click context menu
    item.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllContextMenus();
      ctxChapterId = chapter.id;
      const menu = document.getElementById('chapterContextMenu');
      menu.classList.remove('hidden');
      menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
      menu.style.top = Math.min(e.clientY, window.innerHeight - 140) + 'px';
    });
    return item;
  }

  // Render folders first, then unfiled chapters
  chapterFolders.forEach((folder, folderIdx) => {
    const folderEl = document.createElement('div');
    folderEl.className = 'chapter-folder' + (folder.hidden ? ' item-hidden' : '');
    folderEl.dataset.folderId = folder.id;
    folderEl.draggable = true;
    const folderChapters = chapters.filter(c => c.folderId === folder.id);
    const wordCount = folderChapters.reduce((s, c) => s + (c.words || 0), 0);
    const chapterCount = folderChapters.length;
    folderEl.innerHTML = `<div class="folder-header" data-folder-id="${folder.id}">
      <span class="drag-handle">⋮⋮</span>
      <span class="folder-toggle">${folder.collapsed ? '▸' : '▾'}</span>
      <svg class="folder-icon-svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 01-2 2H4a2 2 0 01-2-2V5a2 2 0 012-2h5l2 3h9a2 2 0 012 2z"/></svg>
      <input type="text" class="folder-name-input" value="${folder.name}" />
      <span class="folder-meta">${chapterCount}<span class="chapter-words">${wordCount}</span></span>
    </div>`;
    const headerEl = folderEl.querySelector('.folder-header');
    headerEl.addEventListener('click', (e) => {
      if (e.target.tagName === 'INPUT' || e.target.classList.contains('drag-handle')) return;
      folder.collapsed = !folder.collapsed;
      renderChaptersList();
    });
    headerEl.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      e.stopPropagation();
      closeAllContextMenus();
      ctxFolderId = folder.id;
      const menu = document.getElementById('folderContextMenu');
      if (menu) {
        menu.classList.remove('hidden');
        menu.style.left = Math.min(e.clientX, window.innerWidth - 180) + 'px';
        menu.style.top = Math.min(e.clientY, window.innerHeight - 140) + 'px';
      }
    });
    folderEl.querySelector('.folder-name-input').addEventListener('change', (e) => {
      folder.name = e.target.value;
      if (typeof window.craftSchedulePush === 'function') window.craftSchedulePush();
    });
    folderEl.querySelector('.folder-name-input').addEventListener('click', (e) => e.stopPropagation());

    // Folder drag/drop for reordering folders
    folderEl.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/folder-id', folder.id);
      e.dataTransfer.effectAllowed = 'move';
      folderEl.classList.add('dragging');
    });
    folderEl.addEventListener('dragend', () => folderEl.classList.remove('dragging'));
    folderEl.addEventListener('dragover', (e) => {
      e.preventDefault();
      // Accept folders for reorder AND chapters for move-into
      folderEl.classList.add('drag-over');
    });
    folderEl.addEventListener('dragleave', () => folderEl.classList.remove('drag-over'));
    folderEl.addEventListener('drop', (e) => {
      e.preventDefault();
      folderEl.classList.remove('drag-over');
      const droppedFolderId = e.dataTransfer.getData('text/folder-id');
      const chapterId = e.dataTransfer.getData('text/chapter-id');
      if (droppedFolderId && droppedFolderId !== folder.id) {
        // Reorder folders
        const fromIdx = chapterFolders.findIndex(f => f.id === droppedFolderId);
        const toIdx = chapterFolders.findIndex(f => f.id === folder.id);
        if (fromIdx >= 0 && toIdx >= 0) {
          const [moved] = chapterFolders.splice(fromIdx, 1);
          chapterFolders.splice(toIdx, 0, moved);
          renderChaptersList();
        }
      } else if (chapterId) {
        const ch = chapters.find(c => c.id === chapterId);
        if (ch) { ch.folderId = folder.id; renderChaptersList(); }
      }
    });

    list.appendChild(folderEl);

    if (!folder.collapsed) {
      const folderBody = document.createElement('div');
      folderBody.className = 'folder-body';
      folderChapters.forEach(chapter => {
        const item = createChapterItem(chapter);
        // Override dragstart to include folder info
        item.addEventListener('dragstart', (e) => {
          e.dataTransfer.setData('text/chapter-id', chapter.id);
        }, true);
        folderBody.appendChild(item);
      });
      list.appendChild(folderBody);
    }
  });

  // Unfiled chapters
  chapters.filter(c => !c.folderId).forEach(chapter => {
    const item = createChapterItem(chapter);
    item.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/chapter-id', chapter.id);
    }, true);
    list.appendChild(item);
  });

  // Drop zone at bottom to unfolder chapters
  const unfileZone = document.createElement('div');
  unfileZone.className = 'chapter-unfile-zone';
  unfileZone.textContent = '';
  unfileZone.addEventListener('dragover', (e) => { e.preventDefault(); unfileZone.classList.add('drag-over'); unfileZone.textContent = 'Drop to remove from folder'; });
  unfileZone.addEventListener('dragleave', () => { unfileZone.classList.remove('drag-over'); unfileZone.textContent = ''; });
  unfileZone.addEventListener('drop', (e) => {
    e.preventDefault();
    unfileZone.classList.remove('drag-over');
    unfileZone.textContent = '';
    const chapterId = e.dataTransfer.getData('text/chapter-id');
    if (chapterId) {
      const ch = chapters.find(c => c.id === chapterId);
      if (ch && ch.folderId) { ch.folderId = null; renderChaptersList(); showNotif('Removed from folder'); }
    }
  });
  list.appendChild(unfileZone);
}

let ctxChapterId = null;
let ctxFolderId = null;
function toggleHideChapterCtx() {
  const ch = chapters.find(c => c.id === ctxChapterId);
  if (ch) { ch.hidden = !ch.hidden; renderChaptersList(); showNotif(ch.hidden ? `${ch.title} hidden` : `${ch.title} visible`); }
  closeAllContextMenus();
}
function deleteChapterCtx() {
  if (ctxChapterId) deleteChapter(ctxChapterId);
  closeAllContextMenus();
}
function moveChapterToFolderCtx(folderId) {
  const ch = chapters.find(c => c.id === ctxChapterId);
  if (ch) { ch.folderId = folderId || null; renderChaptersList(); showNotif(folderId ? 'Moved to folder' : 'Removed from folder'); }
  closeAllContextMenus();
}

function addChapterFolder() {
  const id = 'folder-' + Date.now();
  chapterFolders.push({ id, name: 'New Folder', collapsed: false, hidden: false });
  renderChaptersList();
}
function deleteChapterFolderCtx() {
  closeAllContextMenus();
  if (!ctxFolderId) return;
  // Unfolder all chapters in this folder
  chapters.forEach(c => { if (c.folderId === ctxFolderId) c.folderId = null; });
  chapterFolders = chapterFolders.filter(f => f.id !== ctxFolderId);
  renderChaptersList();
  showNotif('Folder deleted');
}
function toggleHideFolderCtx() {
  closeAllContextMenus();
  const f = chapterFolders.find(f => f.id === ctxFolderId);
  if (f) { f.hidden = !f.hidden; renderChaptersList(); showNotif(f.hidden ? 'Folder hidden' : 'Folder visible'); }
}

function addChapter() {
  const newId = `chapter-${Date.now()}`;
  const num = chapters.length + 1;
  chapters.push({
    id: newId,
    label: `Chapter ${num}`,
    title: 'New Chapter',
    content: '',
    words: 0,
  });
  renderChaptersList();
  selectChapter(newId);
}

function deleteChapter(chapterId) {
  if (chapters.length <= 1) return;

  saveCurrentChapter();
  chapters = chapters.filter((c) => c.id !== chapterId);
  if (currentChapterId === chapterId) {
    currentChapterId = chapters[0].id;
  }
  renderChaptersList();

  const chapter = chapters.find((c) => c.id === currentChapterId);
  if (chapter) {
    document.getElementById('writeEditor').innerHTML = chapter.content;
    document.getElementById('writeChapterTitle').value = chapter.title;
    document.getElementById('writeChapterLabel').value = chapter.label;
    updateWordCount();
  }
}

function selectChapter(chapterId) {
  saveCurrentChapter();
  currentChapterId = chapterId;
  renderChaptersList();

  const chapter = chapters.find((c) => c.id === chapterId);
  if (chapter) {
    document.getElementById('writeEditor').innerHTML = chapter.content;
    document.getElementById('writeChapterTitle').value = chapter.title;
    document.getElementById('writeChapterLabel').value = chapter.label;
    document.getElementById('chapterTags').value = '';
    document.getElementById('chapterDetailName').textContent = chapter.title || chapter.label;
    updateWordCount();
    renderChapterTagPills();
    renderChapterAssociationsList();

    // Restore indent/justify toggles
    const editor = document.getElementById('writeEditor');
    writeIndentMode = !!chapter.indentMode;
    writeJustifyMode = !!chapter.justifyMode;
    editor.classList.toggle('indent-mode', writeIndentMode);
    editor.classList.toggle('justify-mode', writeJustifyMode);
    const indentBtn = document.getElementById('indentToggleBtn');
    const justifyBtn = document.getElementById('justifyToggleBtn');
    if (indentBtn) indentBtn.classList.toggle('active', writeIndentMode);
    if (justifyBtn) justifyBtn.classList.toggle('active', writeJustifyMode);

    // Show chapter details in panel
    document.getElementById('emptyState').classList.add('hidden');
    document.getElementById('cardDetails').classList.add('hidden');
    document.getElementById('pinDetails').classList.add('hidden');
    document.getElementById('chapterDetails').classList.remove('hidden');
    document.getElementById('detailsPanel').classList.remove('collapsed');
  }

  if (currentView !== 'write') {
    switchView('write');
  }
}

function saveCurrentChapter() {
  const chapter = chapters.find((c) => c.id === currentChapterId);
  if (chapter) {
    // CRITICAL: Only read editor DOM when we're actually on the write view.
    // The editor is only populated when write view is active.
    // Reading it from other views returns empty/stale content and overwrites saved data.
    if (currentView === 'write') {
      const editorEl = document.getElementById('writeEditor');
      if (editorEl) {
        chapter.content = editorEl.innerHTML;
        const text = editorEl.textContent;
        chapter.words = text.trim() ? text.trim().split(/\s+/).length : 0;
      }
    }
    // Persist indent/justify toggles (these are stored in JS vars, safe from any view)
    chapter.indentMode = writeIndentMode;
    chapter.justifyMode = writeJustifyMode;
  }
}

function addChapterTagFromInput() {
  const chapter = chapters.find((c) => c.id === currentChapterId);
  if (!chapter) return;
  const input = document.getElementById('chapterTags');
  const raw = input.value.trim();
  if (!raw) return;
  if (!chapter.tags) chapter.tags = [];
  const newTags = raw.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0);
  newTags.forEach(tag => {
    if (!chapter.tags.includes(tag)) {
      chapter.tags.push(tag);
    }
  });
  input.value = '';
  renderChapterTagPills();
}

function removeChapterTag(tagToRemove) {
  const chapter = chapters.find((c) => c.id === currentChapterId);
  if (!chapter || !chapter.tags) return;
  chapter.tags = chapter.tags.filter(t => t !== tagToRemove);
  renderChapterTagPills();
}

function renderChapterTagPills() {
  const container = document.getElementById('chapterTagsDisplay');
  if (!container) return;
  const chapter = chapters.find((c) => c.id === currentChapterId);
  const tags = (chapter && chapter.tags) || [];
  if (tags.length === 0) {
    container.innerHTML = '';
    return;
  }
  container.innerHTML = tags.map(tag => 
    `<span class="chapter-tag-pill">${tag}<button class="chapter-tag-remove" onclick="removeChapterTag('${tag.replace(/'/g, "\\'")}')">&times;</button></span>`
  ).join('');
}


function renderChapterAssociationsList() {
  if (!currentChapterId) return;
  renderAssociationsList('chapter', currentChapterId, 'chapterAssociationsList');
}

function setupEditorImageResize() {
  const editor = document.getElementById('writeEditor');
  const images = editor.querySelectorAll('.editor-image-wrapper');

  images.forEach(wrapper => {
    const handle = wrapper.querySelector('.image-resize-handle');
    const img = wrapper.querySelector('.editor-image');
    if (!handle || !img) return;

    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      e.stopPropagation();

      const startX = e.clientX;
      const startWidth = img.offsetWidth;

      const onMove = (moveE) => {
        const diff = moveE.clientX - startX;
        const newWidth = Math.max(100, startWidth + diff);
        img.style.width = newWidth + 'px';
      };

      const onUp = () => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        saveCurrentChapter();
      };

      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

// ============================================
// List Drag and Drop
// ============================================
let draggedListItem = null;
let dragListType = null;

function handleListDragStart(e, type) {
  draggedListItem = e.target.closest('.board-item, .chapter-item');
  dragListType = type;
  draggedListItem.classList.add('dragging');
  e.dataTransfer.effectAllowed = 'move';
}

function handleListDragOver(e) {
  e.preventDefault();
  const item = e.target.closest('.board-item, .chapter-item');
  if (item && item !== draggedListItem) {
    item.classList.add('drag-over');
  }
}

function handleListDragLeave(e) {
  const item = e.target.closest('.board-item, .chapter-item');
  if (item) item.classList.remove('drag-over');
}

function handleListDrop(e, type) {
  e.preventDefault();
  const targetItem = e.target.closest('.board-item, .chapter-item');
  if (!targetItem || targetItem === draggedListItem || type !== dragListType) return;

  targetItem.classList.remove('drag-over');

  const list = type === 'board' ? boards : chapters;
  const idKey = type === 'board' ? 'boardId' : 'chapterId';

  const draggedId = draggedListItem.dataset[idKey];
  const targetId = targetItem.dataset[idKey];

  const draggedIndex = list.findIndex((item) => item.id === draggedId);
  const targetIndex = list.findIndex((item) => item.id === targetId);

  if (draggedIndex !== -1 && targetIndex !== -1) {
    const [removed] = list.splice(draggedIndex, 1);
    list.splice(targetIndex, 0, removed);
    type === 'board' ? renderBoardsList() : renderChaptersList();
  }
}

function handleListDragEnd() {
  if (draggedListItem) draggedListItem.classList.remove('dragging');
  document.querySelectorAll('.drag-over').forEach((el) => el.classList.remove('drag-over'));
  draggedListItem = null;
  dragListType = null;
}

// ============================================
// Canvas & Pan (Board)
// ============================================
function handleCanvasMouseDown(e) {
  if (
    e.target.closest('.card') ||
    e.target.closest('.zoom-controls') ||
    e.target.closest('.canvas-tools') ||
    e.target.closest('.connection-mode-indicator') ||
    e.target.closest('.board-toolbar') ||
    e.target.closest('.connection-hit')
  ) {
    return;
  }

  if (currentTool === 'pan' || e.button === 1) {
    isPanning = true;
    panStart = { x: e.clientX - panOffset.x, y: e.clientY - panOffset.y };
    document.getElementById('boardView').classList.add('panning');
    e.preventDefault();
  } else if (currentTool === 'select') {
    if (!e.shiftKey) deselectAll();
    // Start marquee selection
    const canvasContainer = document.getElementById('boardView');
    const rect = canvasContainer.getBoundingClientRect();
    isMarqueeSelecting = true;
    marqueeStart = { x: e.clientX - rect.left, y: e.clientY - rect.top };
    let marquee = document.getElementById('marqueeRect');
    if (!marquee) {
      marquee = document.createElement('div');
      marquee.id = 'marqueeRect';
      marquee.className = 'marquee-rect';
      canvasContainer.appendChild(marquee);
    }
    marquee.style.left = `${marqueeStart.x}px`;
    marquee.style.top = `${marqueeStart.y}px`;
    marquee.style.width = '0px';
    marquee.style.height = '0px';
    marquee.style.display = 'block';
  }
}

function handleCanvasMouseMove(e) {
  if (isPanning) {
    panOffset.x = e.clientX - panStart.x;
    panOffset.y = e.clientY - panStart.y;
    applyCanvasTransform();
  } else if (isMarqueeSelecting && marqueeStart) {
    const canvasContainer = document.getElementById('boardView');
    const rect = canvasContainer.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;

    const marquee = document.getElementById('marqueeRect');
    if (marquee) {
      const left = Math.min(marqueeStart.x, currentX);
      const top = Math.min(marqueeStart.y, currentY);
      const width = Math.abs(currentX - marqueeStart.x);
      const height = Math.abs(currentY - marqueeStart.y);
      marquee.style.left = `${left}px`;
      marquee.style.top = `${top}px`;
      marquee.style.width = `${width}px`;
      marquee.style.height = `${height}px`;
    }
  }
}

function handleCanvasMouseUp(e) {
  if (isPanning) {
    isPanning = false;
    document.getElementById('boardView').classList.remove('panning');
  }

  if (isMarqueeSelecting && marqueeStart) {
    const canvasContainer = document.getElementById('boardView');
    const containerRect = canvasContainer.getBoundingClientRect();
    const endX = (e?.clientX || 0) - containerRect.left;
    const endY = (e?.clientY || 0) - containerRect.top;

    const marqueeLeft = Math.min(marqueeStart.x, endX);
    const marqueeTop = Math.min(marqueeStart.y, endY);
    const marqueeRight = Math.max(marqueeStart.x, endX);
    const marqueeBottom = Math.max(marqueeStart.y, endY);

    // Only process if dragged more than 5px (not just a click)
    if (marqueeRight - marqueeLeft > 5 || marqueeBottom - marqueeTop > 5) {
      document.querySelectorAll('.card').forEach(card => {
        const cardRect = card.getBoundingClientRect();
        const cardScreenLeft = cardRect.left - containerRect.left;
        const cardScreenTop = cardRect.top - containerRect.top;
        const cardScreenRight = cardScreenLeft + cardRect.width;
        const cardScreenBottom = cardScreenTop + cardRect.height;

        // Check overlap
        if (cardScreenLeft < marqueeRight && cardScreenRight > marqueeLeft &&
            cardScreenTop < marqueeBottom && cardScreenBottom > marqueeTop) {
          multiSelectedCards.add(card.id);
          card.classList.add('multi-selected');
        }
      });

      // Also select connection lines that intersect the marquee
      const board = getCurrentBoard();
      if (board && board.connections) {
        const svgEl = document.getElementById('connectionsLayer');
        if (svgEl) {
          const svgRect = svgEl.getBoundingClientRect();
          board.connections.forEach(conn => {
            const fromCard = document.getElementById(conn.from);
            const toCard = document.getElementById(conn.to);
            if (!fromCard || !toCard) return;
            const fR = fromCard.getBoundingClientRect();
            const tR = toCard.getBoundingClientRect();
            const fCx = fR.left + fR.width/2 - containerRect.left;
            const fCy = fR.top + fR.height/2 - containerRect.top;
            const tCx = tR.left + tR.width/2 - containerRect.left;
            const tCy = tR.top + tR.height/2 - containerRect.top;
            // Check if line segment intersects marquee rectangle
            if (lineIntersectsRect(fCx, fCy, tCx, tCy, marqueeLeft, marqueeTop, marqueeRight, marqueeBottom)) {
              const already = multiSelectedConnections.some(sc => (sc.from===conn.from&&sc.to===conn.to)||(sc.from===conn.to&&sc.to===conn.from));
              if (!already) multiSelectedConnections.push(conn);
            }
          });
        }
      }

      if (multiSelectedCards.size > 0 || multiSelectedConnections.length > 0) {
        const totalItems = multiSelectedCards.size + multiSelectedConnections.length;
        setToolbarMode(multiSelectedConnections.length > 0 && multiSelectedCards.size === 0 ? 'connection' : 'multi');
        const toolbarLabel = document.getElementById('toolbarLabel');
        const toolbarStatus = document.getElementById('toolbarStatus');
        const toolbarIcon = document.getElementById('toolbarIcon');
        if (toolbarLabel) toolbarLabel.textContent = 'Multiple';
        if (toolbarStatus) toolbarStatus.textContent = `${totalItems} items selected`;
        if (toolbarIcon) toolbarIcon.textContent = '⬡';
        renderConnections();
      }
    }

    // Remove marquee
    const marquee = document.getElementById('marqueeRect');
    if (marquee) marquee.style.display = 'none';
    isMarqueeSelecting = false;
    marqueeStart = null;
  }
}

function handleCanvasWheel(e) {
  e.preventDefault();
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  zoom = Math.max(0.25, Math.min(2, zoom + delta));
  applyCanvasTransform();
  document.getElementById('zoomLevel').textContent = `${Math.round(zoom * 100)}%`;
}

function applyCanvasTransform() {
  const canvas = document.getElementById('canvas');
  canvas.style.transform = `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`;
}

// Helper: check if line segment intersects a rectangle
function lineIntersectsRect(x1, y1, x2, y2, rLeft, rTop, rRight, rBottom) {
  // Check if either endpoint is inside rect
  if ((x1 >= rLeft && x1 <= rRight && y1 >= rTop && y1 <= rBottom) ||
      (x2 >= rLeft && x2 <= rRight && y2 >= rTop && y2 <= rBottom)) return true;
  // Check line vs each rect edge
  return lineSegmentsIntersect(x1,y1,x2,y2, rLeft,rTop,rRight,rTop) ||
         lineSegmentsIntersect(x1,y1,x2,y2, rRight,rTop,rRight,rBottom) ||
         lineSegmentsIntersect(x1,y1,x2,y2, rLeft,rBottom,rRight,rBottom) ||
         lineSegmentsIntersect(x1,y1,x2,y2, rLeft,rTop,rLeft,rBottom);
}
function lineSegmentsIntersect(x1,y1,x2,y2,x3,y3,x4,y4) {
  const d = (x2-x1)*(y4-y3)-(y2-y1)*(x4-x3);
  if (d === 0) return false;
  const t = ((x3-x1)*(y4-y3)-(y3-y1)*(x4-x3)) / d;
  const u = ((x3-x1)*(y2-y1)-(y3-y1)*(x2-x1)) / d;
  return t >= 0 && t <= 1 && u >= 0 && u <= 1;
}

// ============================================
// Map Pan & Zoom
// ============================================
function handleMapMouseDown(e) {
  if (e.target.closest('.map-pin') || e.target.closest('.destination-marker') || e.target.closest('.zoom-controls') || e.target.closest('.canvas-tools') || e.target.closest('.measurement-display') || e.target.closest('.region-draw-handle') || e.target.closest('.region-edit-handle')) {
    return;
  }

  const currentMap = getCurrentMap();

  // Viewers can only pan, not use any map tools
  if (window.craftMyRole === 'viewer') {
    if (mapTool === 'map-pan' || e.button === 1) {
      isMapPanning = true;
      panStart = { x: e.clientX - mapPanOffset.x, y: e.clientY - mapPanOffset.y };
      document.getElementById('mapView').classList.add('panning');
      e.preventDefault();
    }
    return;
  }

  if (mapTool === 'map-pan' || e.button === 1) {
    isMapPanning = true;
    panStart = { x: e.clientX - mapPanOffset.x, y: e.clientY - mapPanOffset.y };
    document.getElementById('mapView').classList.add('panning');
    e.preventDefault();
  } else if (mapTool === 'map-destination' && currentMap && currentMap.imageUrl) {
    const wrapper = document.getElementById('mapImageWrapper');
    const rect = wrapper.getBoundingClientRect();
    const dx = ((e.clientX - rect.left) / rect.width) * 100;
    const dy = ((e.clientY - rect.top) / rect.height) * 100;
    const id = 'dest_' + Date.now() + '_' + Math.floor(Math.random()*1000);
    destinationMarkers.push({ id, x: dx, y: dy, label: '', color: '#f43f5e', hideLabel: false });
    selectedDestinationId = id;
    renderDestinations();
    openDestEditorModal(id);
  } else if (mapTool === 'map-pin' && currentMap && currentMap.imageUrl) {
    // Add pin at click location (single click)
    const wrapper = document.getElementById('mapImageWrapper');
    const rect = wrapper.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    addPin(x, y);
  } else if (mapTool === 'map-measure' && currentMap && currentMap.imageUrl) {
    // Handle measurement
    handleMeasurementClick(e.clientX, e.clientY);
  } else if (mapTool === 'map-region' && currentMap && currentMap.imageUrl) {
    const wrapper = document.getElementById('mapImageWrapper');
    const rect = wrapper.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    if (!regionDrawing) startRegionDrawing();
    addRegionDrawPoint(xPct, yPct);
  } else if (mapTool === 'map-path' && currentMap && currentMap.imageUrl) {
    const wrapper = document.getElementById('mapImageWrapper');
    const rect = wrapper.getBoundingClientRect();
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;
    if (!mapPathDrawing) startMapPathDrawing();
    addMapPathPoint(xPct, yPct);
  } else if (mapTool === 'map-select') {
    deselectPin();
    deselectRegion();
  }
}

function handleMapDoubleClick(e) {
  if (e.target.closest('.map-pin') || e.target.closest('.region-draw-handle') || e.target.closest('.region-edit-handle')) return;

  const currentMap = getCurrentMap();
  if (!currentMap || !currentMap.imageUrl) return;

  if (mapTool === 'map-region' && regionDrawing) {
    // Double-click adds a duplicate point, remove it
    if (regionDrawing.points.length > 1) regionDrawing.points.pop();
    finishRegionDrawing();
    return;
  }

  if (mapTool === 'map-path' && mapPathDrawing) {
    // Double-click adds a duplicate point, remove it
    if (mapPathDrawing.points.length > 1) mapPathDrawing.points.pop();
    finishMapPath();
    return;
  }

  // Add pin on double-click when pin tool is selected
  if (mapTool === 'map-pin') {
    const wrapper = document.getElementById('mapImageWrapper');
    const rect = wrapper.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    addPin(x, y);
  }
}

function handleMapMouseMove(e) {
  if (isMapPanning) {
    mapPanOffset.x = e.clientX - panStart.x;
    mapPanOffset.y = e.clientY - panStart.y;
    applyMapTransform();
    // Keep measurement line in sync with pan
    if (measurementStart) {
      if (measurementEnd) {
        updateMeasurementLine();
      } else {
        // Live preview while panning with only start point
        updateMeasurementPreview(e.clientX, e.clientY);
      }
    }
  } else if (mapTool === 'map-measure' && measurementStart && !measurementEnd) {
    // Live preview line from start to cursor
    updateMeasurementPreview(e.clientX, e.clientY);
  }
}

function handleMapMouseUp() {
  if (isMapPanning) {
    isMapPanning = false;
    document.getElementById('mapView').classList.remove('panning');
  }
}

function handleMapWheel(e) {
  e.preventDefault();
  const rect = document.getElementById('mapCanvas').getBoundingClientRect();
  const mouseX = e.clientX - rect.left;
  const mouseY = e.clientY - rect.top;

  const oldZoom = mapZoom;
  const delta = e.deltaY > 0 ? -0.1 : 0.1;
  mapZoom = Math.max(0.25, Math.min(4, mapZoom + delta));

  // Zoom toward cursor
  const zoomRatio = mapZoom / oldZoom;
  mapPanOffset.x = mouseX - (mouseX - mapPanOffset.x) * zoomRatio;
  mapPanOffset.y = mouseY - (mouseY - mapPanOffset.y) * zoomRatio;

  applyMapTransform();
  document.getElementById('mapZoomLevel').textContent = `${Math.round(mapZoom * 100)}%`;
  if (measurementStart) {
    if (measurementEnd) updateMeasurementLine();
  }
}

function applyMapTransform() {
  const wrapper = document.getElementById('mapImageWrapper');
  wrapper.style.transform = `translate(${mapPanOffset.x}px, ${mapPanOffset.y}px) scale(${mapZoom})`;

  // Scale pins inversely so they remain visible regardless of zoom
  const pinScale = Math.max(0.5, Math.min(2.5, 1 / Math.pow(mapZoom, 0.6)));
  document.querySelectorAll('.map-pin').forEach(pin => {
    pin.style.setProperty('--pin-scale', pinScale);
  });
  document.querySelectorAll('.destination-marker').forEach(dest => {
    dest.style.setProperty('--dest-scale', pinScale);
  });
  // Counter-scale region handles
  const handleScale = 1 / mapZoom;
  document.querySelectorAll('.region-draw-handle, .region-edit-handle').forEach(h => {
    h.style.transform = `translate(-50%, -50%) scale(${handleScale})`;
  });
}

function mapZoomIn() {
  mapZoom = Math.min(4, mapZoom + 0.1);
  applyMapTransform();
  document.getElementById('mapZoomLevel').textContent = `${Math.round(mapZoom * 100)}%`;
}

function mapZoomOut() {
  mapZoom = Math.max(0.25, mapZoom - 0.1);
  applyMapTransform();
  document.getElementById('mapZoomLevel').textContent = `${Math.round(mapZoom * 100)}%`;
}

function mapZoomFit() {
  mapZoom = 1;
  mapPanOffset = { x: 0, y: 0 };
  applyMapTransform();
  document.getElementById('mapZoomLevel').textContent = '100%';
}

function mapZoomWidth() {
  const mapImg = document.getElementById('mapImage');
  const mapCanvas = document.getElementById('mapCanvas');

  if (!mapImg.naturalWidth) return;

  const containerWidth = mapCanvas.clientWidth;
  const containerHeight = mapCanvas.clientHeight;
  const imageWidth = mapImg.naturalWidth;
  const imageHeight = mapImg.naturalHeight;

  mapZoom = containerWidth / imageWidth;
  const scaledH = imageHeight * mapZoom;
  mapPanOffset.x = 0;
  mapPanOffset.y = scaledH < containerHeight ? (containerHeight - scaledH) / 2 : 0;
  applyMapTransform();
  document.getElementById('mapZoomLevel').textContent = `${Math.round(mapZoom * 100)}%`;
}

// ============================================
// Cards
// ============================================
function updateCanvas() {
  const canvas = document.getElementById('canvas');
  canvas.innerHTML = '';

  const board = getCurrentBoard();
  if (!board) return;

  board.cards.forEach((card) => {
    try { createCardElement(card); } catch(e) { console.warn('Card render error:', card.type, card.id, e); }
  });
  renderConnections();

  const emptyState = document.getElementById('canvasEmptyState');
  if (emptyState) emptyState.classList.toggle('hidden', board.cards.length > 0);

  updateStatusBar();
}

function createCardElement(cardData) {
  const canvas = document.getElementById('canvas');

  const card = document.createElement('div');
  card.className = `card ${cardData.type}`;
  if (cardData.textStyle) card.classList.add(cardData.textStyle);
  if (cardData.design) card.classList.add(`design-${cardData.design}`);
  if (cardData.sharpEdge) card.classList.add('edge-sharp');
  if (cardData.hideTitle) card.classList.add('hide-title');
  if (cardData.hideTags) card.classList.add('hide-tags');
  if (cardData.hidden) card.classList.add('card-hidden');
  card.id = cardData.id;
  card.style.left = `${cardData.x}px`;
  card.style.top = `${cardData.y}px`;
  if (cardData.width) card.style.width = `${cardData.width}px`;
  if (cardData.height) card.style.height = `${cardData.height}px`;
  if (cardData.fontFamily && cardData.fontFamily !== 'Inter') card.style.fontFamily = cardData.fontFamily;
  if (cardData.bgColor && cardData.bgColor !== '#0a0a0a') card.style.background = cardData.bgColor;
  if (cardData.borderStyle && cardData.borderStyle !== 'none') {
    card.style.borderStyle = cardData.borderStyle;
    card.style.borderWidth = '2px';
    card.style.borderColor = cardData.borderColor || '#4ecdc4';
  }

  let content = '';

  // Image
  // For image cards: title should appear above the image, so we inject the image inside card-content.
  let imageHtml = '';
  if (cardData.imageUrl && cardData.type !== 'body') {
    imageHtml = `<img class="card-image" src="${cardData.imageUrl}" alt="${cardData.title}">`;
    if (cardData.type !== 'image') {
      content = imageHtml;
      imageHtml = '';
    }
  }

  content += `<div class="card-type-indicator" style="${cardData.topColor ? `background: ${cardData.topColor}` : ``}"></div><div class="card-content">`;

  // Title - always centered
  const titleColor = cardData.titleColor || '#f5ede0';
  const textColor = cardData.textColor || '#a89880';
  const labelColor = cardData.labelColor || '#4ecdc4';
  const fontFamily = cardData.fontFamily || 'Inter';
  const fontSize = cardData.fontSize || 14;
  const textAlign = cardData.textAlign || 'left';

  // Title rendering - text cards get alignment applied
  if (cardData.type === 'text') {
    content += `<div class="card-title" style="color: ${titleColor}; font-family: ${fontFamily}; text-align: ${textAlign}">${cardData.title}</div>`;
    if (cardData.description) {
      content += `<div class="card-description" style="color: ${textColor}; font-family: ${fontFamily}; font-size: ${fontSize}px; text-align: ${textAlign}; white-space: pre-wrap;">${parseWikiLinks(cardData.description)}</div>`;
    }
  } else {
    content += `<div class="card-title" style="color: ${titleColor}; font-family: ${fontFamily}">${cardData.title}</div>`;
  }
  if (imageHtml) content += imageHtml;

  // Type-specific content
  if (cardData.type === 'statblock' && cardData.stats) {
    content += `<div class="card-stats">`;
    for (const [stat, value] of Object.entries(cardData.stats)) {
      content += `<div class="stat-item"><div class="stat-label" style="color: ${labelColor}">${stat}</div><div class="stat-value" style="color: ${textColor}">${value}</div></div>`;
    }
    content += `</div>`;
  } else if (cardData.type === 'chart' && cardData.chartData) {
    content += `<div class="card-chart">${renderChart(cardData)}</div>`;
  } else if (cardData.type === 'bar' && cardData.bars) {
    content += `<div class="card-bars">${renderBars(cardData)}</div>`;
  } else if (cardData.type === 'stress') {
    content += renderStressDisplay(cardData);
  } else if (cardData.type === 'injury' && cardData.injuryTracks) {
    content += renderInjuryTracks(cardData);
  } else if (cardData.type === 'body') {
    content += renderBodyMap(cardData);
  } else if (cardData.type === 'item') {
    content += renderItemCard(cardData);
  } else if (cardData.type === 'personality') {
    content += renderPersonalityCard(cardData);
  } else if (cardData.type === 'attributes') {
    content += renderAttributesCard(cardData);
  } else if (cardData.type === 'inventory') {
    content += renderInventoryCard(cardData);
  } else if (cardData.type === 'currency') {
    content += renderCurrencyCard(cardData);
  } else if (cardData.type === 'mood') {
    content += renderMoodCard(cardData);
  } else if (cardData.type === 'randomizer') {
    content += renderRandomizerCard(cardData);
  } else if (cardData.type === 'ability') {
    content += renderAbilityCard(cardData);
  } else if (cardData.type === 'character') {
    content += renderCharacterCard(cardData);
  } else if (cardData.type === 'location') {
    content += renderLocationCard(cardData);
  } else if (cardData.type === 'quest') {
    content += renderQuestCard(cardData);
  } else if (cardData.type === 'ref-map') {
    content += renderRefMapCard(cardData);
  } else if (cardData.type === 'ref-chapter') {
    content += renderRefChapterCard(cardData);
  } else if (cardData.type === 'ref-timeline') {
    content += renderRefTimelineCard(cardData);
  } else if (cardData.type === 'ref-music' || cardData.type === 'ref-soundscape') {
    content += renderRefMusicCard(cardData);
  } else if (cardData.type !== 'text' && cardData.type !== 'image' && cardData.description) {
    content += `<div class="card-description" style="color: ${textColor}; font-family: ${fontFamily}; font-size: ${fontSize}px; text-align: ${textAlign}; white-space: pre-wrap">${parseWikiLinks(cardData.description)}</div>`;
  }

  // Tags
  if (cardData.tags && cardData.tags.length > 0) {
    content += `<div class="card-tags">${cardData.tags.map((tag) => `<span class="card-tag">${tag}</span>`).join('')}</div>`;
  }

  content += `</div>`;
  content += `<div class="resize-handle"></div>`;

  card.innerHTML = content;

  // Click handlers for interactive elements
  if (cardData.type === 'stress') {
    card.querySelectorAll('.stress-segment').forEach((seg, i) => {
      seg.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleStressSegment(cardData.id, i);
      });
    });
  }

  if (cardData.type === 'injury') {
    card.querySelectorAll('.injury-box').forEach((box) => {
      box.addEventListener('click', (e) => {
        e.stopPropagation();
        toggleInjuryBox(cardData.id, box.dataset.track, parseInt(box.dataset.index));
      });
    });

    card.querySelectorAll('.injury-text-field').forEach((field) => {
      field.addEventListener('click', (e) => {
        e.stopPropagation();
      });
      field.addEventListener('mousedown', (e) => { e.stopPropagation(); });
      field.addEventListener('input', (e) => {
        const trackIndex = parseInt(e.target.dataset.track);
        const boxIndex = parseInt(e.target.dataset.index);
        updateInjuryText(cardData.id, trackIndex, boxIndex, e.target.value);
        // Auto-resize
        e.target.style.height = 'auto';
        e.target.style.height = e.target.scrollHeight + 'px';
      });
      // Initial auto-resize
      field.style.height = 'auto';
      field.style.height = field.scrollHeight + 'px';
    });
  }

  if (cardData.type === 'body') {
    const bodyMap = card.querySelector('.body-map');
    if (bodyMap) {
      bodyMap.addEventListener('click', (e) => {
        e.stopPropagation();
        handleBodyMapClick(e, cardData.id);
      });
    }
  }

  if (cardData.type === 'mood') {
    const moodTrack = card.querySelector('.mood-track-bg');
    if (moodTrack) {
      const updateMoodFromEvent = (e) => {
        const rect = moodTrack.getBoundingClientRect();
        const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        const newLevel = Math.round(x * 100);
        const board = getCurrentBoard();
        const cd = board.cards.find(c => c.id === cardData.id);
        if (cd) {
          cd.moodLevel = newLevel;
          refreshCard(cd);
          const moodInput = document.getElementById('moodLevel');
          if (moodInput && selectedCard && selectedCard.id === cardData.id) moodInput.value = newLevel;
        }
      };
      moodTrack.addEventListener('mousedown', (e) => {
        e.stopPropagation();
        e.preventDefault();
        updateMoodFromEvent(e);
        const onMove = (ev) => { ev.preventDefault(); updateMoodFromEvent(ev); };
        const onUp = () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
        document.addEventListener('mousemove', onMove);
        document.addEventListener('mouseup', onUp);
      });
      moodTrack.style.cursor = 'pointer';
    }
  }

  // Events
  card.addEventListener('mousedown', (e) => {
    if (e.target.classList.contains('resize-handle')) {
      startResize(e, card);
    } else if (
      !e.target.closest('.stress-segment') &&
      !e.target.closest('.injury-box') &&
      !e.target.closest('.injury-text-field') &&
      !e.target.closest('.body-map') &&
      !e.target.closest('.mood-track-bg') &&
      !e.target.closest('.rand-roll-btn')
    ) {
      startDrag(e, card);
    }
  });

  card.addEventListener('click', (e) => {
    if (
      !e.target.closest('.stress-segment') &&
      !e.target.closest('.injury-box') &&
      !e.target.closest('.injury-text-field') &&
      !e.target.closest('.body-map') &&
      !e.target.closest('.mood-track-bg') &&
      !e.target.closest('.rand-roll-btn')
    ) {
      e.stopPropagation();
      handleCardClick(card, e);
    }
  });

  canvas.appendChild(card);
}

// ============================================
// Chart Rendering
// ============================================
function renderChart(cardData) {
  const data = cardData.chartData || [];
  const chartType = cardData.chartType || 'pie';
  const chartFill = cardData.chartFill || 'solid';

  if (!data.length) return '<div style="color: #605545; font-size: 12px;">No data</div>';

  const total = data.reduce((sum, item) => sum + item.value, 0);
  if (total === 0) return '<div style="color: #605545; font-size: 12px;">No data</div>';

  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const innerR = chartType === 'donut' ? r * 0.55 : chartType === 'ring' ? r * 0.7 : 12;
  const gaugeMode = chartType === 'gauge';

  let patternDefs = '';
  let segments = '';
  let cumulativeAngle = gaugeMode ? -180 : -90;

  data.forEach((item, i) => {
    const sliceAngle = gaugeMode ? (item.value / total) * 180 : (item.value / total) * 360;
    const startAngle = cumulativeAngle;
    const endAngle = cumulativeAngle + sliceAngle;
    cumulativeAngle = endAngle;

    const startRad = startAngle * Math.PI / 180;
    const endRad = endAngle * Math.PI / 180;
    const largeArc = sliceAngle > 180 ? 1 : 0;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const ix1 = cx + innerR * Math.cos(startRad);
    const iy1 = cy + innerR * Math.sin(startRad);
    const ix2 = cx + innerR * Math.cos(endRad);
    const iy2 = cy + innerR * Math.sin(endRad);

    const d = `M ${ix1} ${iy1} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;

    let fillAttr = item.color;
    let extra = '';
    if (chartFill === 'striped') {
      const pid = `chartStripe-${cardData.id || 'c'}-${i}`;
      patternDefs += `<pattern id="${pid}" patternUnits="userSpaceOnUse" width="6" height="6" patternTransform="rotate(45)"><rect width="3" height="6" fill="${item.color}"/></pattern>`;
      fillAttr = `url(#${pid})`;
    } else if (chartFill === 'crosshatch') {
      const pid = `chartCross-${cardData.id || 'c'}-${i}`;
      patternDefs += `<pattern id="${pid}" patternUnits="userSpaceOnUse" width="8" height="8"><rect width="8" height="8" fill="${item.color}" opacity="0.3"/><path d="M0,0 L8,8 M8,0 L0,8" stroke="${item.color}" stroke-width="1.5"/></pattern>`;
      fillAttr = `url(#${pid})`;
    } else if (chartFill === 'dots') {
      const pid = `chartDots-${cardData.id || 'c'}-${i}`;
      patternDefs += `<pattern id="${pid}" patternUnits="userSpaceOnUse" width="6" height="6"><rect width="6" height="6" fill="${item.color}" opacity="0.25"/><circle cx="3" cy="3" r="1.5" fill="${item.color}"/></pattern>`;
      fillAttr = `url(#${pid})`;
    } else if (chartFill === 'gradient') {
      const gid = `chartGrad-${cardData.id || 'c'}-${i}`;
      patternDefs += `<linearGradient id="${gid}" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="${item.color}" stop-opacity="1"/><stop offset="100%" stop-color="${item.color}" stop-opacity="0.3"/></linearGradient>`;
      fillAttr = `url(#${gid})`;
    } else if (chartFill === 'outline') {
      fillAttr = 'transparent';
      extra = `stroke="${item.color}" stroke-width="2.5"`;
    }

    segments += `<path d="${d}" fill="${fillAttr}" ${extra} stroke="rgba(0,0,0,0.3)" stroke-width="1"/>`;

    // Label
    const midAngle = (startAngle + endAngle) / 2;
    const midRad = midAngle * Math.PI / 180;
    const labelR = (r + innerR) / 2;
    const lx = cx + labelR * Math.cos(midRad);
    const ly = cy + labelR * Math.sin(midRad);
    const pct = Math.round((item.value / total) * 100);
    if (pct > 5) {
      segments += `<text x="${lx}" y="${ly}" text-anchor="middle" dominant-baseline="central" fill="#fff" font-size="10" font-weight="600" style="text-shadow:0 1px 3px rgba(0,0,0,0.8)">${pct}%</text>`;
    }
  });

  return `
    <div class="chart-visual-svg">
      <svg viewBox="0 0 ${size} ${gaugeMode ? size/2 + 10 : size}" width="100%" height="100%">
        <defs>${patternDefs}</defs>
        ${segments}
        <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="var(--bg-dark, #0a0a0a)" stroke="rgba(255,255,255,0.1)" stroke-width="1"/>
      </svg>
    </div>
  `;
}

// ============================================
// Bar Rendering
// ============================================
function renderBars(cardData) {
  const bars = cardData.bars || [];
  return bars.map((bar) => {
    const percent = Math.min(100, (bar.current / bar.max) * 100);
    const style = bar.style || 'solid';
    let fillStyle = `background: ${bar.color};`;
    if (style === 'gradient') {
      fillStyle = `background: linear-gradient(90deg, ${bar.color}, ${adjustColor(bar.color, 30)});`;
    }

    return `
      <div class="card-bar-item">
        <div class="card-bar-label" style="color: ${cardData.textColor || '#a89880'}">
          <span>${bar.name}</span>
          <span>${bar.current} / ${bar.max}</span>
        </div>
        <div class="card-bar">
          <div class="card-bar-fill ${style}" style="width: ${percent}%; ${fillStyle}"></div>
        </div>
      </div>
    `;
  }).join('');
}

function adjustColor(hex, percent) {
  const num = parseInt(hex.replace('#', ''), 16);
  const amt = Math.round(2.55 * percent);
  const R = Math.min(255, (num >> 16) + amt);
  const G = Math.min(255, ((num >> 8) & 0x00ff) + amt);
  const B = Math.min(255, (num & 0x0000ff) + amt);
  return `#${((1 << 24) | (R << 16) | (G << 8) | B).toString(16).slice(1)}`;
}

// ============================================
// Stress/Clock Rendering
// ============================================
function renderStressDisplay(cardData) {
  const segments = cardData.stressSegments || 4;
  const filled = cardData.stressFilled || 0;
  const style = cardData.stressStyle || 'clock';
  const color = cardData.stressColor || '#f97316';
  const fillStyle = cardData.stressFillStyle || 'solid';

  if (style === 'clock') {
    return renderClock(segments, filled, color, fillStyle);
  }

  let html = `<div class="stress-display" style="color: ${color}">`;
  for (let i = 0; i < segments; i++) {
    const isFilled = i < filled;
    let symbol = '';
    if (style === 'slashes') {
      symbol = isFilled ? '/' : '';
    }
    html += `<div class="stress-segment ${style} ${isFilled ? 'filled' : ''} fill-${fillStyle}" data-index="${i}" style="--fill-color: ${color};">${symbol}</div>`;
  }
  html += '</div>';
  return html;
}

function renderClock(segments, filled, color, fillStyle = 'solid') {
  const size = 200;
  const cx = size / 2;
  const cy = size / 2;
  const r = size / 2 - 4;
  const innerR = 12;

  let segmentsSvg = '';

  for (let i = 0; i < segments; i++) {
    const startAngle = (i * 360 / segments) - 90;
    const endAngle = ((i + 1) * 360 / segments) - 90;
    const isFilled = i < filled;

    const startRad = startAngle * Math.PI / 180;
    const endRad = endAngle * Math.PI / 180;
    const largeArc = (endAngle - startAngle > 180) ? 1 : 0;

    const x1 = cx + r * Math.cos(startRad);
    const y1 = cy + r * Math.sin(startRad);
    const x2 = cx + r * Math.cos(endRad);
    const y2 = cy + r * Math.sin(endRad);
    const ix1 = cx + innerR * Math.cos(startRad);
    const iy1 = cy + innerR * Math.sin(startRad);
    const ix2 = cx + innerR * Math.cos(endRad);
    const iy2 = cy + innerR * Math.sin(endRad);

    const d = `M ${ix1} ${iy1} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} L ${ix2} ${iy2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${ix1} ${iy1} Z`;

    let fillAttr = 'transparent';
    let extraAttr = '';
    if (isFilled) {
      if (fillStyle === 'solid') {
        fillAttr = color;
      } else if (fillStyle === 'outline') {
        fillAttr = 'transparent';
        extraAttr = `stroke="${color}" stroke-width="2.5"`;
      } else if (fillStyle === 'gradient') {
        fillAttr = color;
        extraAttr = `opacity="0.85"`;
      } else if (fillStyle === 'glow') {
        fillAttr = color;
        extraAttr = `filter="url(#clockGlow)"`;
      } else {
        fillAttr = `url(#clockPattern-${fillStyle})`;
      }
    }

    segmentsSvg += `<path class="stress-segment" data-index="${i}" d="${d}" fill="${fillAttr}" ${extraAttr} stroke="rgba(255,255,255,0.1)" stroke-width="1" style="cursor:pointer;" />`;
  }

  // Build pattern defs
  let patternDefs = '';
  if (fillStyle === 'striped') {
    patternDefs = `<pattern id="clockPattern-striped" patternUnits="userSpaceOnUse" width="8" height="8" patternTransform="rotate(45)">
      <rect width="4" height="8" fill="${color}"/></pattern>`;
  } else if (fillStyle === 'crosshatch') {
    patternDefs = `<pattern id="clockPattern-crosshatch" patternUnits="userSpaceOnUse" width="6" height="6">
      <path d="M0 0L6 6M6 0L0 6" stroke="${color}" stroke-width="1.5" fill="none"/></pattern>`;
  } else if (fillStyle === 'dots') {
    patternDefs = `<pattern id="clockPattern-dots" patternUnits="userSpaceOnUse" width="6" height="6">
      <circle cx="3" cy="3" r="1.8" fill="${color}"/></pattern>`;
  } else if (fillStyle === 'diamond-pattern') {
    patternDefs = `<pattern id="clockPattern-diamond-pattern" patternUnits="userSpaceOnUse" width="8" height="8">
      <path d="M4 0L8 4L4 8L0 4Z" fill="${color}" opacity="0.8"/></pattern>`;
  }

  const glowFilter = fillStyle === 'glow' ? `<filter id="clockGlow"><feGaussianBlur stdDeviation="3" result="glow"/>
    <feMerge><feMergeNode in="glow"/><feMergeNode in="SourceGraphic"/></feMerge></filter>` : '';

  return `
    <div class="stress-display">
      <svg class="clock-svg" viewBox="0 0 ${size} ${size}" width="100%" height="100%">
        <defs>${patternDefs}${glowFilter}</defs>
        <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="3" opacity="0.6"/>
        ${segmentsSvg}
        <circle cx="${cx}" cy="${cy}" r="${innerR}" fill="var(--bg-dark, #0a0a0a)" stroke="${color}" stroke-width="2"/>
      </svg>
    </div>
  `;
}

function toggleStressSegment(cardId, index) {
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === cardId);
  if (!cardData) return;

  const segments = cardData.stressSegments || 4;
  if (index < cardData.stressFilled) {
    cardData.stressFilled = index;
  } else {
    cardData.stressFilled = index + 1;
  }

  cardData.stressFilled = Math.max(0, Math.min(segments, cardData.stressFilled));

  if (selectedCard && selectedCard.id === cardId) {
    document.getElementById('stressFilled').value = cardData.stressFilled;
  }

  refreshCard(cardData);
}

// ============================================
// Injury Track Rendering
// ============================================
function renderInjuryTracks(cardData) {
  const tracks = cardData.injuryTracks || [];
  const textColor = cardData.textColor || '#a89880';

  return tracks.map((track, trackIndex) => {
    const boxes = [];
    for (let i = 0; i < track.boxes; i++) {
      const isFilled = i < track.filled;
      const injuryText = track.injuries && track.injuries[i] ? track.injuries[i] : '';
      boxes.push(`
        <div class="injury-box-container">
          <div class="injury-box ${isFilled ? 'filled crossed' : ''}" data-track="${trackIndex}" data-index="${i}"></div>
          <textarea
                 class="injury-text-field"
                 placeholder="..."
                 data-track="${trackIndex}"
                 data-index="${i}"
                 rows="1"
                 style="color: ${textColor};">${injuryText}</textarea>
        </div>
      `);
    }

    return `
      <div class="injury-track">
        <div class="injury-track-name" style="color: ${textColor}">${track.name}</div>
        <div class="injury-boxes-grid">${boxes.join('')}</div>
      </div>
    `;
  }).join('');
}

function toggleInjuryBox(cardId, trackIndex, boxIndex) {
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === cardId);
  if (!cardData || !cardData.injuryTracks) return;

  const track = cardData.injuryTracks[trackIndex];
  if (!track) return;

  if (boxIndex < track.filled) {
    track.filled = boxIndex;
  } else {
    track.filled = boxIndex + 1;
  }

  track.filled = Math.max(0, Math.min(track.boxes, track.filled));

  if (selectedCard && selectedCard.id === cardId) {
    renderInjuryTracksList(cardData.injuryTracks);
  }

  refreshCard(cardData);
}

function updateInjuryText(cardId, trackIndex, boxIndex, text) {
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === cardId);
  if (!cardData || !cardData.injuryTracks) return;

  const track = cardData.injuryTracks[trackIndex];
  if (!track) return;

  // Initialize injuries array if it doesn't exist
  if (!track.injuries) {
    track.injuries = [];
  }

  // Update the injury text
  track.injuries[boxIndex] = text;

  // No need to refresh the card, the input is already updated
  // Just save the state
  if (selectedCard && selectedCard.id === cardId) {
    renderInjuryTracksList(cardData.injuryTracks);
  }
}

// ============================================
// Body Map Rendering
// ============================================
function renderBodyMap(cardData) {
  const figure = cardData.bodyFigure || 'neutral';
  const overlayColor = cardData.bodyOverlayColor || getDefaultBodyColor(figure);
  const points = cardData.bodyPoints || [];

  // Convert hex to RGB 0-1 range for SVG feColorMatrix
  const r = parseInt(overlayColor.substr(1, 2), 16) / 255;
  const g = parseInt(overlayColor.substr(3, 2), 16) / 255;
  const b = parseInt(overlayColor.substr(5, 2), 16) / 255;

  const filterId = `body-color-${cardData.id}`;

  const svgFilter = `<svg width="0" height="0" style="position:absolute;">
    <defs><filter id="${filterId}" color-interpolation-filters="sRGB">
      <feColorMatrix type="matrix" values="0 0 0 0 ${r.toFixed(3)}  0 0 0 0 ${g.toFixed(3)}  0 0 0 0 ${b.toFixed(3)}  0 0 0 1 0"/>
    </filter></defs></svg>`;

  const silhouettes = {
    neutral: `<img class="body-silhouette-img" src="https://i.imgur.com/Ijb1i3C.png" alt="Neutral silhouette" draggable="false" style="filter: url(#${filterId});">`,
    masculine: `<img class="body-silhouette-img" src="https://i.imgur.com/E9ktSLI.png" alt="Male silhouette" draggable="false" style="filter: url(#${filterId});">`,
    feminine: `<img class="body-silhouette-img" src="https://i.imgur.com/8NhBWjx.png" alt="Female silhouette" draggable="false" style="filter: url(#${filterId});">`,
  };

  const pointsHtml = points.map((p) =>
    `<div class="body-point" style="left: ${p.x}%; top: ${p.y}%; background: ${p.color}; box-shadow: 0 0 8px ${p.color}, 0 0 4px ${p.color};" data-x="${p.x}" data-y="${p.y}"></div>`
  ).join('');

  const scale = cardData.bodyScale || 0.9;
  return `${svgFilter}<div class="body-map"><div class="body-map-inner">${silhouettes[figure]}${pointsHtml}</div></div>`;
}

function getDefaultBodyColor(figure) {
  const defaults = {
    neutral: '#4ecdc4',
    masculine: '#5b8def',
    feminine: '#e879a8'
  };
  return defaults[figure] || '#4ecdc4';
}

function getColorInvert(hexColor) {
  // Convert hex to RGB to determine if we should invert
  const r = parseInt(hexColor.substr(1, 2), 16);
  const g = parseInt(hexColor.substr(3, 2), 16);
  const b = parseInt(hexColor.substr(5, 2), 16);
  const brightness = (r + g + b) / 3;
  return brightness > 128 ? '100%' : '0%';
}

function handleBodyMapClick(e, cardId) {
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === cardId);
  if (!cardData) return;

  // Use the inner div for accurate positioning relative to the silhouette
  const bodyMapInner = e.currentTarget.querySelector('.body-map-inner');
  const rect = bodyMapInner.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;

  if (!cardData.bodyPoints) cardData.bodyPoints = [];

  const threshold = 8;
  const existingIndex = cardData.bodyPoints.findIndex(
    (p) => Math.abs(p.x - x) < threshold && Math.abs(p.y - y) < threshold
  );

  if (existingIndex !== -1) {
    cardData.bodyPoints.splice(existingIndex, 1);
  } else {
    const pointColor = cardData.pointColor || '#ef4444';
    cardData.bodyPoints.push({
      x: Math.round(x),
      y: Math.round(y),
      color: pointColor,
    });
  }

  refreshCard(cardData);
}

// ============================================
// Item Card Rendering
// ============================================
function renderItemCard(cardData) {
  const rarityColors = { common: '#a89880', uncommon: '#22c55e', rare: '#3b82f6', epic: '#a855f7', legendary: '#f59e0b' };
  const rarityColor = rarityColors[cardData.itemRarity] || '#a89880';
  const typeIcons = { weapon: '⚔', armor: '🛡', consumable: '⬡', tool: '⚒', artifact: '✦', gear: '◆', misc: '•' };
  const icon = typeIcons[cardData.itemType] || '◆';
  const textColor = cardData.textColor || '#a89880';
  const uses = cardData.itemUsesMax > 0 ? `<div class="item-uses"><span style="color:${textColor}">Uses</span> <span style="color:${rarityColor}">${cardData.itemUsesCurrent}/${cardData.itemUsesMax}</span></div>` : '';
  const load = cardData.itemLoad > 0 ? `<span class="item-load">${'■'.repeat(cardData.itemLoad)}${'□'.repeat(Math.max(0, 5 - cardData.itemLoad))}</span>` : '';
  const props = (cardData.itemProperties || []).map(p => `<span class="item-prop-tag">${p}</span>`).join('');
  const effect = cardData.itemEffect ? `<div class="item-effect" style="color:${textColor}">${cardData.itemEffect}</div>` : '';
  const desc = cardData.description ? `<div class="item-desc" style="color:${textColor};white-space:pre-wrap">${cardData.description}</div>` : '';

  return `
    <div class="item-card-content">
      <div class="item-header-row">
        <span class="item-type-icon" style="color:${rarityColor}">${icon}</span>
        <span class="item-rarity-badge" style="color:${rarityColor};border-color:${rarityColor}">${cardData.itemRarity}</span>
        ${load ? `<span class="item-load-display" style="color:${textColor}">${load}</span>` : ''}
      </div>
      ${desc}
      ${effect}
      ${uses}
      ${props ? `<div class="item-props-row">${props}</div>` : ''}
    </div>
  `;
}

// ============================================
// Personality Card Rendering
// ============================================
function renderPersonalityCard(cardData) {
  const traits = cardData.personalityTraits || [];
  const textColor = cardData.textColor || '#a89880';
  return `<div class="personality-card-content">
    ${traits.map(t => `
      <div class="personality-trait-row">
        <span class="personality-trait-icon">${t.icon || '◆'}</span>
        <div class="personality-trait-body">
          <span class="personality-trait-label">${t.label}</span>
          <span class="personality-trait-value" style="color:${textColor}">${t.value || '—'}</span>
        </div>
      </div>
    `).join('')}
  </div>`;
}

// ============================================
// Attributes Card Rendering
// ============================================
function renderAttributesCard(cardData) {
  const attrs = cardData.attributes || [];
  const textColor = cardData.textColor || '#a89880';
  const titleColor = cardData.titleColor || '#f5ede0';
  const labelColor = cardData.labelColor || '#4ecdc4';
  const catColors = { appearance: '#60a5fa', background: '#f59e0b', demeanor: '#a855f7', custom: '#4ecdc4' };
  const catColor = catColors[cardData.attrCategory] || '#60a5fa';
  const catLabel = cardData.attrCategory || 'appearance';

  return `<div class="attributes-card-content">
    <div class="attr-category-badge" style="color:${catColor};border-color:${catColor}">${catLabel}</div>
    ${attrs.map(a => `
      <div class="attr-profile-row">
        <span class="attr-profile-label" style="color:${labelColor}">${a.name}</span>
        <span class="attr-profile-value" style="color:${textColor}">${a.value || '—'}</span>
      </div>
    `).join('')}
    ${attrs.length === 0 ? '<div style="color:#605545;font-size:11px;text-align:center;padding:8px">No traits defined</div>' : ''}
  </div>`;
}

// ============================================
// Inventory Card Rendering
// ============================================
function renderInventoryCard(cardData) {
  const items = cardData.invItems || [];
  const maxSlots = cardData.invMaxSlots || 10;
  const usedLoad = items.reduce((s, i) => s + (i.load * (i.qty || 1)), 0);
  const textColor = cardData.textColor || '#a89880';
  const loadPct = Math.min(100, (usedLoad / maxSlots) * 100);
  const loadColor = loadPct > 80 ? '#ef4444' : loadPct > 50 ? '#f59e0b' : '#22c55e';

  return `<div class="inventory-card-content">
    <div class="inv-load-bar">
      <div class="inv-load-fill" style="width:${loadPct}%;background:${loadColor}"></div>
      <span class="inv-load-text" style="color:${textColor}">${usedLoad} / ${maxSlots}</span>
    </div>
    <div class="inv-items-list">
      ${items.map((item, i) => `
        <div class="inv-item-row">
          <span class="inv-item-qty" style="color:${loadColor}">${item.qty}×</span>
          <span class="inv-item-name" style="color:${textColor}">${item.name}</span>
          <span class="inv-item-load">${'▪'.repeat(item.load)}</span>
        </div>
      `).join('')}
      ${items.length === 0 ? `<div style="color:#605545;font-size:11px;text-align:center;padding:8px">Empty</div>` : ''}
    </div>
  </div>`;
}

// ============================================
// Currency Card Rendering
// ============================================
function renderCurrencyCard(cardData) {
  const currencies = cardData.currencies || [];
  const stash = cardData.stash || [];
  const textColor = cardData.textColor || '#a89880';

  return `<div class="currency-card-content">
    <div class="currency-purse">
      ${currencies.map(c => `
        <div class="currency-row">
          <span class="currency-icon">${c.icon || '●'}</span>
          <span class="currency-name" style="color:${textColor}">${c.name}</span>
          <span class="currency-amount">${c.amount}</span>
        </div>
      `).join('')}
      ${currencies.length === 0 ? '<div style="color:#605545;font-size:11px;text-align:center">No currencies</div>' : ''}
    </div>
    ${stash.length > 0 ? `
      <div class="currency-stash">
        <div class="stash-label" style="color:${textColor}">Stash</div>
        ${stash.map(s => `
          <div class="stash-row">
            <span class="stash-name" style="color:${textColor}">${s.name}</span>
            <span class="stash-amount">${s.amount}</span>
          </div>
        `).join('')}
      </div>
    ` : ''}
  </div>`;
}

// ============================================
// Mood Card Rendering
// ============================================
function renderMoodCard(cardData) {
  const level = cardData.moodLevel ?? 50;
  const low = cardData.moodColorLow || '#ef4444';
  const high = cardData.moodColorHigh || '#22c55e';
  const lowLabel = cardData.moodLowLabel || 'Low';
  const highLabel = cardData.moodHighLabel || 'High';
  const textColor = cardData.textColor || '#a89880';

  // Interpolate color
  const pct = level / 100;
  const r1 = parseInt(low.substr(1,2),16), g1 = parseInt(low.substr(3,2),16), b1 = parseInt(low.substr(5,2),16);
  const r2 = parseInt(high.substr(1,2),16), g2 = parseInt(high.substr(3,2),16), b2 = parseInt(high.substr(5,2),16);
  const cr = Math.round(r1 + (r2-r1)*pct), cg = Math.round(g1 + (g2-g1)*pct), cb = Math.round(b1 + (b2-b1)*pct);
  const currentColor = `rgb(${cr},${cg},${cb})`;

  // Mood face
  const face = level < 20 ? '😞' : level < 40 ? '😟' : level < 60 ? '😐' : level < 80 ? '🙂' : '😊';

  return `<div class="mood-card-content">
    <div class="mood-face" style="color:${currentColor}">${face}</div>
    <div class="mood-track">
      <div class="mood-track-bg" style="background:linear-gradient(90deg,${low},${high})">
        <div class="mood-thumb" style="left:${level}%;background:${currentColor}"></div>
      </div>
    </div>
    <div class="mood-labels">
      <span style="color:${low}">${lowLabel}</span>
      <span class="mood-value" style="color:${currentColor}">${level}</span>
      <span style="color:${high}">${highLabel}</span>
    </div>
  </div>`;
}

function renderRandomizerCard(cardData) {
  const entries = cardData.tableEntries || [];
  const lastRoll = cardData.lastRoll;
  const textColor = cardData.textColor || '#a89880';
  const titleColor = cardData.titleColor || '#f5ede0';

  let entriesHtml = entries.map((e, i) => {
    const isActive = lastRoll === i;
    return `<div class="rand-entry${isActive ? ' active' : ''}" style="color:${isActive ? titleColor : textColor}">
      <span class="rand-entry-num">${i + 1}</span>
      <span class="rand-entry-text">${e.text}</span>
    </div>`;
  }).join('');

  const diceLabel = cardData.diceNotation || `1d${entries.length}`;

  return `<div class="randomizer-card-content">
    <div class="rand-table">${entriesHtml}</div>
    <div class="rand-roll-area">
      <button class="rand-roll-btn" onclick="event.stopPropagation();rollRandomizerCard('${cardData.id}')">
        🎲 Roll ${diceLabel}
      </button>
      ${lastRoll !== null && lastRoll !== undefined ? `<div class="rand-result" style="color:${titleColor}">${entries[lastRoll]?.text || '???'}</div>` : ''}
    </div>
  </div>`;
}

function rollRandomizerCard(cardId) {
  const board = getCurrentBoard();
  if (!board) return;
  const card = board.cards.find(c => c.id === cardId);
  if (!card || !card.tableEntries || card.tableEntries.length === 0) return;

  // Weighted roll
  const totalWeight = card.tableEntries.reduce((s, e) => s + (e.weight || 1), 0);
  let roll = Math.random() * totalWeight;
  let picked = 0;
  for (let i = 0; i < card.tableEntries.length; i++) {
    roll -= (card.tableEntries[i].weight || 1);
    if (roll <= 0) { picked = i; break; }
  }

  card.lastRoll = picked;

  // Animate: flash through a few random entries
  const cardEl = document.getElementById(cardId);
  if (!cardEl) return;
  let flashes = 0;
  const maxFlashes = 8;
  const interval = setInterval(() => {
    flashes++;
    if (flashes >= maxFlashes) {
      clearInterval(interval);
      card.lastRoll = picked;
      refreshCardElement(card);
      // Update detail panel if selected
      if (selectedCard && selectedCard.id === cardId) {
        const resultEl = document.getElementById('randLastResult');
        if (resultEl) resultEl.textContent = card.tableEntries[picked]?.text || '';
      }
    } else {
      const temp = Math.floor(Math.random() * card.tableEntries.length);
      card.lastRoll = temp;
      refreshCardElement(card);
    }
  }, 60);
}

function renderRandomizerEntriesList(cardData) {
  const container = document.getElementById('randEntriesList');
  if (!container) return;
  const entries = cardData.tableEntries || [];
  container.innerHTML = entries.map((e, i) => `
    <div class="rand-entry-row">
      <span class="rand-entry-num-detail">${i + 1}.</span>
      <input type="text" class="detail-input sm" value="${(e.text || '').replace(/"/g, '&quot;')}" data-rand-idx="${i}" data-rand-field="text" placeholder="Result..." style="flex:1" />
      <input type="number" class="detail-input sm" value="${e.weight || 1}" data-rand-idx="${i}" data-rand-field="weight" min="1" max="99" style="width:42px" title="Weight" />
      <button class="ct-action-btn danger" data-rand-del="${i}" style="width:20px;height:20px;font-size:10px;">✕</button>
    </div>
  `).join('');

  // Wire entry inputs
  container.querySelectorAll('input[data-rand-field]').forEach(inp => {
    inp.addEventListener('input', () => {
      const idx = parseInt(inp.dataset.randIdx);
      const field = inp.dataset.randField;
      if (field === 'text') cardData.tableEntries[idx].text = inp.value;
      else if (field === 'weight') cardData.tableEntries[idx].weight = parseInt(inp.value) || 1;
      refreshCardElement(cardData);
    });
  });

  // Wire delete buttons
  container.querySelectorAll('button[data-rand-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.randDel);
      cardData.tableEntries.splice(idx, 1);
      renderRandomizerEntriesList(cardData);
      refreshCardElement(cardData);
    });
  });
}

// ============================================
// Ability / Spell / Feat Card
// ============================================
// ============================================
// Character Card Rendering
// ============================================
function renderCharacterCard(cardData) {
  const fields = cardData.charFields || [];
  const textColor = cardData.textColor || '#a89880';
  const titleColor = cardData.titleColor || '#f5ede0';
  const labelColor = cardData.labelColor || '#4ecdc4';
  const bio = cardData.charBio || '';
  return `<div class="character-card-content">
    ${fields.map(f => `<div class="char-field-row">
      <span class="char-field-label" style="color:${labelColor}">${f.label}</span>
      <span class="char-field-value" style="color:${textColor}">${f.value || '—'}</span>
    </div>`).join('')}
    ${bio ? `<div class="char-bio" style="color:${textColor};white-space:pre-wrap">${bio}</div>` : ''}
  </div>`;
}

// ============================================
// Location Card Rendering
// ============================================
function renderLocationCard(cardData) {
  const fields = cardData.locFields || [];
  const textColor = cardData.textColor || '#a89880';
  const titleColor = cardData.titleColor || '#f5ede0';
  const labelColor = cardData.labelColor || '#4ecdc4';
  const landmarks = cardData.locLandmarks || '';
  const secrets = cardData.locSecrets || '';
  return `<div class="location-card-content">
    ${fields.map(f => `<div class="loc-field-row">
      <span class="loc-field-label" style="color:${labelColor}">${f.label}</span>
      <span class="loc-field-value" style="color:${textColor}">${f.value || '—'}</span>
    </div>`).join('')}
    ${landmarks ? `<div class="loc-section"><span class="loc-section-label" style="color:${labelColor}">Landmarks</span><div style="color:${textColor};font-size:11px;line-height:1.4;white-space:pre-wrap">${landmarks}</div></div>` : ''}
    ${secrets ? `<div class="loc-section"><span class="loc-section-label" style="color:#ef4444">Secrets</span><div style="color:${textColor};font-size:11px;line-height:1.4;font-style:italic;white-space:pre-wrap">${secrets}</div></div>` : ''}
  </div>`;
}

// ============================================
// Quest Card Rendering
// ============================================
function renderQuestCard(cardData) {
  const textColor = cardData.textColor || '#a89880';
  const titleColor = cardData.titleColor || '#f5ede0';
  const labelColor = cardData.labelColor || '#4ecdc4';
  const status = cardData.questStatus || 'active';
  const statusColors = { active: '#22c55e', completed: '#3b82f6', failed: '#ef4444', pending: '#f59e0b' };
  const steps = cardData.questSteps || [];
  const doneCount = steps.filter(s => s.done).length;
  return `<div class="quest-card-content">
    <div class="quest-status-badge" style="background:${statusColors[status] || '#22c55e'}22;color:${statusColors[status] || '#22c55e'}">${status}</div>
    ${cardData.questGiver ? `<div class="quest-meta" style="color:${textColor}"><span style="color:${labelColor}">Quest Giver:</span> ${cardData.questGiver}</div>` : ''}
    ${cardData.questObjective ? `<div class="quest-meta" style="color:${textColor}"><span style="color:${labelColor}">Objective:</span> ${cardData.questObjective}</div>` : ''}
    ${steps.length > 0 ? `<div class="quest-steps">${steps.map((s, i) => `<div class="quest-step ${s.done ? 'done' : ''}" onclick="event.stopPropagation();toggleQuestStep('${cardData.id}',${i})"><span class="quest-check">${s.done ? '☑' : '☐'}</span><span style="color:${textColor}">${s.text || 'Step ' + (i+1)}</span></div>`).join('')}<div class="quest-progress-bar"><div style="width:${steps.length ? (doneCount/steps.length*100) : 0}%;background:${statusColors[status]}"></div></div></div>` : ''}
    ${cardData.questReward ? `<div class="quest-meta" style="color:${labelColor}">⭐ ${cardData.questReward}</div>` : ''}
  </div>`;
}

function toggleQuestStep(cardId, index) {
  const board = getCurrentBoard(); if (!board) return;
  const card = board.cards.find(c => c.id === cardId); if (!card) return;
  if (!card.questSteps || !card.questSteps[index]) return;
  card.questSteps[index].done = !card.questSteps[index].done;
  refreshCardElement(card);
}

// ============================================
// Reference Card Renderers
// ============================================
function renderRefMapCard(cardData) {
  const map = maps.find(m => m.id === cardData.refId);
  if (!map) return `<div class="ref-card-empty">No map linked<br><span style="font-size:9px;opacity:0.5">Select a map in the detail panel</span></div>`;
  const pinCount = (map.pins || []).length;
  const regionCount = (map.regions || []).length;
  const thumb = map.imageUrl ? `<div class="ref-thumb" style="background-image:url(${map.imageUrl})"></div>` : '';
  return `<div class="ref-card-content ref-map">
    ${thumb}
    <div class="ref-card-info">
      <div class="ref-card-meta"><span class="ref-badge" style="background:#22c55e">MAP</span></div>
      <div class="ref-card-stat">${pinCount} pin${pinCount !== 1 ? 's' : ''} · ${regionCount} region${regionCount !== 1 ? 's' : ''}</div>
    </div>
    <div class="ref-card-action" onclick="event.stopPropagation();navigateToView('map');setTimeout(()=>selectMap('${map.id}'),100)">Open Map →</div>
  </div>`;
}

function renderRefChapterCard(cardData) {
  const ch = chapters.find(c => c.id === cardData.refId);
  if (!ch) return `<div class="ref-card-empty">No chapter linked<br><span style="font-size:9px;opacity:0.5">Select a chapter in the detail panel</span></div>`;
  const excerpt = ch.content ? ch.content.replace(/<[^>]*>/g, '').substring(0, 300) : '';
  return `<div class="ref-card-content ref-chapter">
    <div class="ref-card-info">
      <div class="ref-card-meta"><span class="ref-badge" style="background:#a78bfa">CHAPTER</span> <span style="opacity:0.5;font-size:10px">${ch.label}</span></div>
      <div class="ref-card-stat">${ch.words || 0} words</div>
      ${excerpt ? `<div class="ref-card-excerpt">${excerpt}${excerpt.length >= 300 ? '…' : ''}</div>` : ''}
    </div>
    <div class="ref-card-action" onclick="event.stopPropagation();selectChapter('${ch.id}')">Open Chapter →</div>
  </div>`;
}

function renderRefTimelineCard(cardData) {
  const tl = timelines.find(t => t.id === cardData.refId);
  if (!tl) return `<div class="ref-card-empty">No timeline linked<br><span style="font-size:9px;opacity:0.5">Select a timeline in the detail panel</span></div>`;
  const cal = typeof getCalendar === 'function' ? getCalendar(tl) : null;
  const eventCount = (tl.events || []).length;
  const dateStr = cal ? `${cal.months[tl.currentDate.month]?.name || ''} ${tl.currentDate.day}, Year ${tl.currentDate.year}` : '';
  return `<div class="ref-card-content ref-timeline">
    <div class="ref-card-info">
      <div class="ref-card-meta"><span class="ref-badge" style="background:#f59e0b">TIMELINE</span></div>
      ${dateStr ? `<div class="ref-card-stat" style="font-size:12px;font-weight:600;color:var(--gold)">${dateStr}</div>` : ''}
      <div class="ref-card-stat">${eventCount} event${eventCount !== 1 ? 's' : ''}</div>
      ${tl.color ? `<div style="height:3px;border-radius:2px;background:${tl.color};margin-top:4px"></div>` : ''}
    </div>
    <div class="ref-card-action" onclick="event.stopPropagation();navigateToView('timeline');selectTimeline('${tl.id}')">Open Timeline →</div>
  </div>`;
}

function renderRefMusicCard(cardData) {
  const url = cardData.musicUrl || '';
  const platform = detectMusicPlatform(url);
  let embedHtml = '';
  if (url && platform === 'youtube') {
    const vid = url.match(/(?:v=|\/embed\/|youtu\.be\/|\/v\/|\/watch\?.*v=)([a-zA-Z0-9_-]{11})/);
    if (vid) embedHtml = `<div class="ref-music-embed"><iframe src="https://www.youtube.com/embed/${vid[1]}?autoplay=0" frameborder="0" allow="autoplay;encrypted-media" allowfullscreen style="width:100%;height:100%;border-radius:4px"></iframe></div>`;
  } else if (url && platform === 'spotify') {
    const match = url.match(/(?:track|album|playlist)\/([a-zA-Z0-9]+)/);
    const type = url.includes('/album/') ? 'album' : url.includes('/playlist/') ? 'playlist' : 'track';
    if (match) embedHtml = `<div class="ref-music-embed"><iframe src="https://open.spotify.com/embed/${type}/${match[1]}?theme=0" frameborder="0" allow="autoplay;clipboard-write;encrypted-media;fullscreen;picture-in-picture" style="width:100%;height:100%;border-radius:4px"></iframe></div>`;
  } else if (url) {
    embedHtml = `<div class="ref-music-embed" style="display:flex;align-items:center;justify-content:center"><audio controls src="${url}" style="width:100%"></audio></div>`;
  }
  return `<div class="ref-card-content ref-music" style="display:flex;flex-direction:column;flex:1">
    <div class="ref-card-meta"><span class="ref-badge" style="background:#ec4899">MUSIC</span> <span style="opacity:0.5;font-size:10px">${platform ? platform.toUpperCase() : 'PLAYER'}</span></div>
    ${embedHtml || `<div class="ref-card-empty" style="flex:1;display:flex;align-items:center;justify-content:center">Paste a URL in the detail panel</div>`}
  </div>`;
}

function detectMusicPlatform(url) {
  if (!url) return '';
  if (url.includes('youtube.com') || url.includes('youtu.be')) return 'youtube';
  if (url.includes('spotify.com')) return 'spotify';
  if (url.includes('soundcloud.com')) return 'soundcloud';
  return 'audio';
}
function renderAbilityCard(cardData) {
  const textColor = cardData.textColor || '#a89880';
  const titleColor = cardData.titleColor || '#f5ede0';
  const aType = cardData.abilityType || 'spell';
  const typeColors = { spell: '#a78bfa', skill: '#4ecdc4', feat: '#f59e0b', ability: '#f43f5e' };
  const typeColor = typeColors[aType] || '#a78bfa';
  const desc = cardData.description || '';
  const useType = cardData.abilityUseType || 'ticks';
  const maxUses = cardData.abilityMaxUses || 3;
  const used = cardData.abilityUsed || 0;
  const counter = cardData.abilityCounter || 0;

  let metaHtml = '';
  const metaParts = [];
  if (cardData.abilityLevel) metaParts.push(`Lvl ${cardData.abilityLevel}`);
  if (cardData.abilityCost) metaParts.push(cardData.abilityCost);
  if (cardData.abilityRange) metaParts.push(cardData.abilityRange);
  if (cardData.abilityDuration) metaParts.push(cardData.abilityDuration);
  if (metaParts.length) metaHtml = `<div style="font-size:10px;color:${textColor};opacity:0.7;margin-bottom:4px;">${metaParts.join(' · ')}</div>`;

  let usesHtml = '';
  if (useType === 'ticks') {
    const ticks = Array.from({length: maxUses}, (_, i) =>
      `<div class="ability-tick${i < used ? ' filled' : ''}" onclick="event.stopPropagation();toggleAbilityTick('${cardData.id}',${i})">${i < used ? '✓' : ''}</div>`
    ).join('');
    usesHtml = `<div class="ability-uses">${ticks}<span class="ability-uses-label">${used}/${maxUses}</span></div>`;
  } else if (useType === 'counter') {
    usesHtml = `<div class="ability-counter">
      <div class="ability-counter-btn" onclick="event.stopPropagation();adjustAbilityCounter('${cardData.id}',-1)">−</div>
      <div class="ability-counter-val">${counter}</div>
      <div class="ability-counter-btn" onclick="event.stopPropagation();adjustAbilityCounter('${cardData.id}',1)">+</div>
    </div>`;
  }

  return `<div class="ability-card-content">
    <div class="ability-type-badge" style="background:${typeColor}22;color:${typeColor};">${aType}</div>
    ${metaHtml}
    ${desc ? `<div class="ability-desc" style="color:${textColor};white-space:pre-wrap">${desc}</div>` : ''}
    ${usesHtml}
  </div>`;
}

function toggleAbilityTick(cardId, index) {
  const board = getCurrentBoard(); if (!board) return;
  const card = board.cards.find(c => c.id === cardId); if (!card) return;
  if (index < card.abilityUsed) { card.abilityUsed = index; }
  else { card.abilityUsed = index + 1; }
  refreshCardElement(card);
}

function adjustAbilityCounter(cardId, delta) {
  const board = getCurrentBoard(); if (!board) return;
  const card = board.cards.find(c => c.id === cardId); if (!card) return;
  card.abilityCounter = Math.max(0, (card.abilityCounter || 0) + delta);
  refreshCardElement(card);
}

// ============================================
// Add Card
// ============================================
// ============================================
// Character/Location/Quest Detail Renderers
// ============================================
function renderCharFieldsInDetail(cardData) {
  const sec = document.getElementById('typeFieldsSection');
  sec.classList.remove('hidden');
  const fields = cardData.charFields || [];
  sec.innerHTML = `<label class="detail-label">Character Info</label>
    <div id="charFieldsList">${fields.map((f, i) => `<div class="attr-edit-row">
      <input class="detail-input sm" value="${(f.label||'').replace(/"/g,'&quot;')}" data-idx="${i}" data-k="label" placeholder="Label" style="width:80px" />
      <input class="detail-input" value="${(f.value||'').replace(/"/g,'&quot;')}" data-idx="${i}" data-k="value" placeholder="Value" style="flex:1" />
      <button class="remove-btn" onclick="removeCharField(${i})">×</button>
    </div>`).join('')}</div>
    <button class="add-btn-full" onclick="addCharField()">+ Add Field</button>`;
  sec.querySelectorAll('.detail-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      const k = e.target.dataset.k;
      if (cardData.charFields[idx]) { cardData.charFields[idx][k] = e.target.value; refreshCardElement(cardData); }
    });
  });
}
function addCharField() {
  if (!selectedCard) return; const board = getCurrentBoard(); const cd = board.cards.find(c => c.id === selectedCard.id); if (!cd) return;
  if (!cd.charFields) cd.charFields = [];
  cd.charFields.push({ label: '', value: '' });
  renderCharFieldsInDetail(cd); refreshCardElement(cd);
}
function removeCharField(idx) {
  if (!selectedCard) return; const board = getCurrentBoard(); const cd = board.cards.find(c => c.id === selectedCard.id); if (!cd) return;
  cd.charFields.splice(idx, 1); renderCharFieldsInDetail(cd); refreshCardElement(cd);
}

function renderLocFieldsInDetail(cardData) {
  const sec = document.getElementById('typeFieldsSection');
  sec.classList.remove('hidden');
  const fields = cardData.locFields || [];
  sec.innerHTML = `<label class="detail-label">Location Details</label>
    <div id="locFieldsList">${fields.map((f, i) => `<div class="attr-edit-row">
      <input class="detail-input sm" value="${(f.label||'').replace(/"/g,'&quot;')}" data-idx="${i}" data-k="label" placeholder="Label" style="width:80px" />
      <input class="detail-input" value="${(f.value||'').replace(/"/g,'&quot;')}" data-idx="${i}" data-k="value" placeholder="Value" style="flex:1" />
      <button class="remove-btn" onclick="removeLocField(${i})">×</button>
    </div>`).join('')}</div>
    <button class="add-btn-full" onclick="addLocField()">+ Add Field</button>
    <label class="detail-label" style="margin-top:8px">Landmarks</label>
    <textarea class="detail-textarea" id="locLandmarksInput" placeholder="Notable landmarks...">${cardData.locLandmarks || ''}</textarea>`;
  sec.querySelectorAll('.detail-input').forEach(inp => {
    inp.addEventListener('input', (e) => {
      const idx = parseInt(e.target.dataset.idx);
      const k = e.target.dataset.k;
      if (cardData.locFields[idx]) { cardData.locFields[idx][k] = e.target.value; refreshCardElement(cardData); }
    });
  });
  document.getElementById('locLandmarksInput')?.addEventListener('input', (e) => { cardData.locLandmarks = e.target.value; refreshCardElement(cardData); });
}
function addLocField() {
  if (!selectedCard) return; const board = getCurrentBoard(); const cd = board.cards.find(c => c.id === selectedCard.id); if (!cd) return;
  if (!cd.locFields) cd.locFields = [];
  cd.locFields.push({ label: '', value: '' }); renderLocFieldsInDetail(cd); refreshCardElement(cd);
}
function removeLocField(idx) {
  if (!selectedCard) return; const board = getCurrentBoard(); const cd = board.cards.find(c => c.id === selectedCard.id); if (!cd) return;
  cd.locFields.splice(idx, 1); renderLocFieldsInDetail(cd); refreshCardElement(cd);
}

function renderQuestFieldsInDetail(cardData) {
  const sec = document.getElementById('typeFieldsSection');
  sec.classList.remove('hidden');
  const steps = cardData.questSteps || [];
  sec.innerHTML = `<label class="detail-label">Quest Info</label>
    <div class="attr-edit-row"><label style="width:70px;font-size:10px;color:var(--gold)">Status</label>
      <select class="detail-input" id="questStatusSel"><option value="active"${cardData.questStatus==='active'?' selected':''}>Active</option><option value="pending"${cardData.questStatus==='pending'?' selected':''}>Pending</option><option value="completed"${cardData.questStatus==='completed'?' selected':''}>Completed</option><option value="failed"${cardData.questStatus==='failed'?' selected':''}>Failed</option></select></div>
    <div class="attr-edit-row"><label style="width:70px;font-size:10px;color:var(--gold)">Giver</label><input class="detail-input" id="questGiverInput" value="${(cardData.questGiver||'').replace(/"/g,'&quot;')}" placeholder="Who gave this quest?" style="flex:1" /></div>
    <div class="attr-edit-row"><label style="width:70px;font-size:10px;color:var(--gold)">Reward</label><input class="detail-input" id="questRewardInput" value="${(cardData.questReward||'').replace(/"/g,'&quot;')}" placeholder="Gold, items, favor..." style="flex:1" /></div>
    <label class="detail-label" style="margin-top:8px">Steps</label>
    <div id="questStepsList">${steps.map((s, i) => `<div class="attr-edit-row"><input type="checkbox" ${s.done ? 'checked' : ''} data-step="${i}" class="quest-step-chk" /><input class="detail-input" value="${(s.text||'').replace(/"/g,'&quot;')}" data-step="${i}" data-k="text" placeholder="Step ${i+1}" style="flex:1" /><button class="remove-btn" onclick="removeQuestStep(${i})">×</button></div>`).join('')}</div>
    <button class="add-btn-full" onclick="addQuestStep()">+ Add Step</button>`;
  document.getElementById('questStatusSel')?.addEventListener('change', (e) => { cardData.questStatus = e.target.value; refreshCardElement(cardData); });
  document.getElementById('questGiverInput')?.addEventListener('input', (e) => { cardData.questGiver = e.target.value; refreshCardElement(cardData); });
  document.getElementById('questRewardInput')?.addEventListener('input', (e) => { cardData.questReward = e.target.value; refreshCardElement(cardData); });
  sec.querySelectorAll('.quest-step-chk').forEach(chk => { chk.addEventListener('change', (e) => { const i = parseInt(e.target.dataset.step); if (cardData.questSteps[i]) { cardData.questSteps[i].done = e.target.checked; refreshCardElement(cardData); } }); });
  sec.querySelectorAll('input[data-k="text"]').forEach(inp => { inp.addEventListener('input', (e) => { const i = parseInt(e.target.dataset.step); if (cardData.questSteps[i]) { cardData.questSteps[i].text = e.target.value; refreshCardElement(cardData); } }); });
}
function addQuestStep() {
  if (!selectedCard) return; const board = getCurrentBoard(); const cd = board.cards.find(c => c.id === selectedCard.id); if (!cd) return;
  if (!cd.questSteps) cd.questSteps = [];
  cd.questSteps.push({ text: '', done: false }); renderQuestFieldsInDetail(cd); refreshCardElement(cd);
}
function removeQuestStep(idx) {
  if (!selectedCard) return; const board = getCurrentBoard(); const cd = board.cards.find(c => c.id === selectedCard.id); if (!cd) return;
  cd.questSteps.splice(idx, 1); renderQuestFieldsInDetail(cd); refreshCardElement(cd);
}

function renderRefFieldsInDetail(cardData) {
  const sec = document.getElementById('typeFieldsSection');
  sec.classList.remove('hidden');
  let html = '';

  if (cardData.type === 'ref-map') {
    const opts = maps.map(m => `<option value="${m.id}"${m.id === cardData.refId ? ' selected' : ''}>${m.name}</option>`).join('');
    html = `<label class="detail-label">Linked Map</label>
      <select class="detail-input" id="refMapSelect" style="width:100%;margin-bottom:8px">${opts || '<option value="">No maps</option>'}</select>`;
  } else if (cardData.type === 'ref-chapter') {
    const opts = chapters.map(c => `<option value="${c.id}"${c.id === cardData.refId ? ' selected' : ''}>${c.label}: ${c.title}</option>`).join('');
    html = `<label class="detail-label">Linked Chapter</label>
      <select class="detail-input" id="refChapterSelect" style="width:100%;margin-bottom:8px">${opts || '<option value="">No chapters</option>'}</select>`;
  } else if (cardData.type === 'ref-timeline') {
    const opts = timelines.map(t => `<option value="${t.id}"${t.id === cardData.refId ? ' selected' : ''}>${t.name}</option>`).join('');
    html = `<label class="detail-label">Linked Timeline</label>
      <select class="detail-input" id="refTimelineSelect" style="width:100%;margin-bottom:8px">${opts || '<option value="">No timelines</option>'}</select>`;
  } else if (cardData.type === 'ref-music' || cardData.type === 'ref-soundscape') {
    html = `<label class="detail-label">Music URL</label>
      <input type="text" class="detail-input" id="refMusicUrl" value="${cardData.musicUrl || ''}" placeholder="Paste YouTube, Spotify, or audio URL..." style="width:100%;margin-bottom:8px" />
      <div style="font-size:10px;color:var(--text-muted);margin-bottom:4px">Supports YouTube, Spotify (track/album/playlist), or direct audio URLs</div>`;
  }

  sec.innerHTML = html;

  // Wire up change listeners
  const mapSel = document.getElementById('refMapSelect');
  if (mapSel) mapSel.addEventListener('change', () => {
    cardData.refId = mapSel.value;
    const m = maps.find(mm => mm.id === mapSel.value);
    if (m) cardData.title = m.name;
    refreshCardElement(cardData);
  });
  const chSel = document.getElementById('refChapterSelect');
  if (chSel) chSel.addEventListener('change', () => {
    cardData.refId = chSel.value;
    const c = chapters.find(cc => cc.id === chSel.value);
    if (c) cardData.title = c.title;
    refreshCardElement(cardData);
  });
  const tlSel = document.getElementById('refTimelineSelect');
  if (tlSel) tlSel.addEventListener('change', () => {
    cardData.refId = tlSel.value;
    const t = timelines.find(tt => tt.id === tlSel.value);
    if (t) cardData.title = t.name;
    refreshCardElement(cardData);
  });
  const musicInput = document.getElementById('refMusicUrl');
  if (musicInput) {
    const updateMusic = () => {
      cardData.musicUrl = musicInput.value.trim();
      cardData.musicPlatform = detectMusicPlatform(cardData.musicUrl);
      refreshCardElement(cardData);
    };
    musicInput.addEventListener('change', updateMusic);
    musicInput.addEventListener('paste', () => setTimeout(updateMusic, 100));
  }
}

function addCard(type) {
  const board = getCurrentBoard();
  if (!board) return;
  saveUndoState();

  const id = `card-${Date.now()}`;
  const titles = {
    character: 'New Character',
    location: 'New Location',
    item: 'New Item',
    note: 'New Note',
    quest: 'New Quest',
    statblock: 'Stat Block',
    chart: 'Chart',
    bar: 'Bar Card',
    stress: 'Clock',
    injury: 'Injury Track',
    body: 'Body Map',
    image: 'Image',
    text: 'Text Block',
    personality: 'Personality',
    attributes: 'Attributes',
    inventory: 'Inventory',
    currency: 'Coin Purse',
    mood: 'Mood',
    randomizer: 'Random Table',
    ability: 'Ability',
    'ref-map': 'Map Reference',
    'ref-chapter': 'Chapter Reference',
    'ref-timeline': 'Timeline Reference',
    'ref-music': 'Music Player',
  };

  const newCard = {
    id,
    type,
    title: titles[type],
    description: ['text', 'image', 'bar', 'stress', 'injury', 'body', 'chart', 'personality', 'attributes', 'inventory', 'currency', 'mood', 'randomizer', 'ability', 'character', 'location', 'quest', 'ref-map', 'ref-chapter', 'ref-timeline', 'ref-music', 'ref-soundscape'].includes(type) ? '' : (type === 'item' ? '' : 'Click to edit...'),
    tags: [],
    x: 100 - panOffset.x / zoom + Math.random() * 200,
    y: 100 - panOffset.y / zoom + Math.random() * 200,
    width: type === 'text' ? 250 : type === 'body' ? 180 : type === 'inventory' ? 220 : type === 'chart' ? 140 : type === 'stress' ? 130 : type === 'ability' ? 200 : type === 'character' ? 220 : type === 'location' ? 240 : type === 'quest' ? 240 : type === 'note' ? 200 : type === 'image' ? 250 : type.startsWith('ref-') ? 260 : 220,
    height: type === 'body' ? 320 : null,
    titleColor: '#f5ede0',
    textColor: '#a89880',
    bgColor: null,
    fontFamily: 'Inter',
    fontSize: 14,
    textAlign: 'left',
  };

  if (type === 'character') {
    newCard.charFields = [
      { label: 'Race', value: '' },
      { label: 'Class', value: '' },
      { label: 'Level', value: '' },
      { label: 'Background', value: '' },
      { label: 'Alignment', value: '' },
    ];
    newCard.charBio = '';
  } else if (type === 'location') {
    newCard.locFields = [
      { label: 'Region', value: '' },
      { label: 'Type', value: '' },
      { label: 'Population', value: '' },
      { label: 'Atmosphere', value: '' },
    ];
    newCard.locSecrets = '';
    newCard.locLandmarks = '';
  } else if (type === 'quest') {
    newCard.questStatus = 'active';
    newCard.questObjective = '';
    newCard.questReward = '';
    newCard.questGiver = '';
    newCard.questSteps = [
      { text: '', done: false },
    ];
  } else if (type === 'note') {
    newCard.description = '';
    newCard.width = 200;
  } else if (type === 'statblock') {
    newCard.stats = { STR: 10, DEX: 10, CON: 10, INT: 10, WIS: 10, CHA: 10 };
  } else if (type === 'chart') {
    newCard.chartType = 'pie';
    newCard.chartFill = 'solid';
    newCard.chartData = [
      { label: 'Segment 1', value: 30, color: '#4ecdc4' },
      { label: 'Segment 2', value: 30, color: '#f43f5e' },
      { label: 'Segment 3', value: 40, color: '#d4a824' },
    ];
  } else if (type === 'bar') {
    newCard.bars = [
      { name: 'HP', current: 75, max: 100, color: '#ef4444', style: 'solid' },
      { name: 'MP', current: 50, max: 100, color: '#3b82f6', style: 'solid' },
    ];
  } else if (type === 'stress') {
    newCard.stressSegments = 4;
    newCard.stressFilled = 0;
    newCard.stressStyle = 'clock';
    newCard.stressColor = '#f97316';
  } else if (type === 'injury') {
    newCard.injuryTracks = [
      { name: 'Lesser Harm', boxes: 2, filled: 0 },
      { name: 'Moderate Harm', boxes: 2, filled: 0 },
      { name: 'Severe Harm', boxes: 1, filled: 0 },
    ];
  } else if (type === 'body') {
    newCard.bodyFigure = 'neutral';
    newCard.bodyOverlayColor = '#4ecdc4';
    newCard.pointColor = '#ef4444';
    newCard.bodyPoints = [];
  } else if (type === 'text') {
    newCard.textStyle = 'heading1';
  } else if (type === 'item') {
    newCard.itemType = 'gear';
    newCard.itemRarity = 'common';
    newCard.itemLoad = 1;
    newCard.itemUsesCurrent = 0;
    newCard.itemUsesMax = 0;
    newCard.itemEffect = '';
    newCard.itemProperties = [];
    newCard.description = '';
  } else if (type === 'personality') {
    newCard.personalityTraits = [
      { label: 'Ideal', value: '', icon: '✦' },
      { label: 'Bond', value: '', icon: '♥' },
      { label: 'Flaw', value: '', icon: '✕' },
      { label: 'Trait', value: '', icon: '◆' },
    ];
  } else if (type === 'attributes') {
    newCard.attrCategory = 'appearance';
    newCard.attributes = [
      { name: 'Race', value: '' },
      { name: 'Height', value: '' },
      { name: 'Build', value: '' },
      { name: 'Hair', value: '' },
      { name: 'Eyes', value: '' },
      { name: 'Skin', value: '' },
      { name: 'Distinguishing', value: '' },
    ];
  } else if (type === 'inventory') {
    newCard.invMaxSlots = 10;
    newCard.invItems = [
      { name: 'Torch', qty: 3, load: 1 },
    ];
  } else if (type === 'currency') {
    newCard.currencies = [
      { name: 'Coin', amount: 0, icon: '●' },
    ];
    newCard.stash = [];
  } else if (type === 'mood') {
    newCard.moodLevel = 50;
    newCard.moodLowLabel = 'Despair';
    newCard.moodHighLabel = 'Euphoria';
    newCard.moodColorLow = '#ef4444';
    newCard.moodColorHigh = '#22c55e';
    newCard.width = 280;
  } else if (type === 'randomizer') {
    newCard.tableEntries = [
      { text: 'Result 1', weight: 1 },
      { text: 'Result 2', weight: 1 },
      { text: 'Result 3', weight: 1 },
      { text: 'Result 4', weight: 1 },
    ];
    newCard.lastRoll = null;
    newCard.diceNotation = '';
    newCard.width = 240;
  } else if (type === 'ability') {
    newCard.abilityType = 'spell';
    newCard.abilityLevel = '';
    newCard.abilityCost = '';
    newCard.abilityRange = '';
    newCard.abilityDuration = '';
    newCard.abilityUseType = 'ticks';
    newCard.abilityMaxUses = 3;
    newCard.abilityUsed = 0;
    newCard.abilityCounter = 0;
  } else if (type === 'ref-map') {
    newCard.refId = maps.length > 0 ? maps[0].id : null;
    newCard.title = maps.length > 0 ? maps[0].name : 'Map Reference';
  } else if (type === 'ref-chapter') {
    newCard.refId = chapters.length > 0 ? chapters[0].id : null;
    newCard.title = chapters.length > 0 ? chapters[0].title : 'Chapter Reference';
  } else if (type === 'ref-timeline') {
    newCard.refId = timelines.length > 0 ? timelines[0].id : null;
    newCard.title = timelines.length > 0 ? timelines[0].name : 'Timeline Reference';
  } else if (type === 'ref-music') {
    newCard.musicUrl = '';
    newCard.musicPlatform = '';
    newCard.title = 'Music Player';
  }

  board.cards.push(newCard);
  createCardElement(newCard);

  document.getElementById('canvasEmptyState').classList.add('hidden');
  updateStatusBar();

  setTimeout(() => {
    const cardEl = document.getElementById(id);
    if (cardEl) selectCard(cardEl);
  }, 10);
}

function handleCardClick(cardEl, event) {
  if (currentTool === 'connect') {
    handleConnectionClick(cardEl);
  } else if (event && (event.shiftKey || event.ctrlKey || event.metaKey)) {
    // Shift/Ctrl/Cmd+click: toggle this card in multi-selection
    addToMultiSelect(cardEl);
  } else {
    selectCard(cardEl);
  }
}

function selectCard(cardEl) {
  deselectAll();
  cardEl.classList.add('selected');
  selectedCard = cardEl;

  // Activate card toolbar
  setToolbarMode('card');

  // Populate toolbar title
  const board2 = getCurrentBoard();
  const cardData2 = board2?.cards?.find((c) => c.id === cardEl.id);
  const toolbarTitle = document.getElementById('toolbarCardTitle');
  if (toolbarTitle && cardData2) toolbarTitle.value = cardData2.title || '';

  document.getElementById('detailsPanel').classList.remove('collapsed');

  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === cardEl.id);
  if (!cardData) return;

  document.getElementById('emptyState').classList.add('hidden');
  document.getElementById('cardDetails').classList.remove('hidden');
  document.getElementById('pinDetails').classList.add('hidden');
  document.getElementById('detailName').value = cardData.title;
  document.getElementById('detailDescription').value = cardData.description || '';
  document.getElementById('detailTags').value = (cardData.tags || []).join(', ');

  // Card styling
  document.getElementById('cardFontFamily').value = cardData.fontFamily || 'Inter';
  document.getElementById('cardFontSize').value = cardData.fontSize || 14;
  // Populate toolbar color pickers
  const toolbarTitleColor = document.getElementById('toolbarTitleColor');
  if (toolbarTitleColor) toolbarTitleColor.value = cardData.titleColor || '#f5ede0';
  const toolbarLabelColor = document.getElementById('toolbarLabelColor');
  if (toolbarLabelColor) toolbarLabelColor.value = cardData.labelColor || '#4ecdc4';
  const toolbarTextColor = document.getElementById('toolbarTextColor');
  if (toolbarTextColor) toolbarTextColor.value = cardData.textColor || '#a89880';
  const toolbarBgColor = document.getElementById('toolbarBgColor');
  if (toolbarBgColor) toolbarBgColor.value = cardData.bgColor || '#0a0a0a';
  // Detail panel color pickers (sync with toolbar)
  const detailLabelColor = document.getElementById('detailLabelColor');
  if (detailLabelColor) detailLabelColor.value = cardData.labelColor || '#4ecdc4';
  const detailTextColor = document.getElementById('detailTextColor');
  if (detailTextColor) detailTextColor.value = cardData.textColor || '#a89880';
  const detailTitleColor = document.getElementById('detailTitleColor');
  if (detailTitleColor) detailTitleColor.value = cardData.titleColor || '#f5ede0';
  // Top accent sync (Details + toolbar)
  const topColor = cardData.topColor || '#4ecdc4';
  const topEl = document.getElementById('cardTopColor');
  if (topEl) topEl.value = topColor;
  const quickTop = document.getElementById('quickTopColor');
  if (quickTop) quickTop.value = topColor;
  const topPicker = document.getElementById('cardTopAccentPicker');
  if (topPicker) topPicker.value = topColor;

  // Populate toolbar extras
  const tbBorderStyle = document.getElementById('toolbarBorderStyle');
  if (tbBorderStyle) tbBorderStyle.value = cardData.borderStyle || 'none';
  const tbBorderColor = document.getElementById('toolbarBorderColor');
  if (tbBorderColor) tbBorderColor.value = cardData.borderColor || '#4ecdc4';
  const tbDesign = document.getElementById('toolbarCardDesign');
  if (tbDesign) tbDesign.value = cardData.design || '';
  const tbHideHeader = document.getElementById('toolbarHideHeader');
  if (tbHideHeader) tbHideHeader.checked = !!cardData.hideTitle;
  const tbHideTags = document.getElementById('toolbarHideTags');
  if (tbHideTags) tbHideTags.checked = !!cardData.hideTags;
  const tbFont = document.getElementById('toolbarFontFamily');
  if (tbFont) tbFont.value = cardData.fontFamily || 'Inter';
  const tbFontSize = document.getElementById('toolbarFontSize');
  if (tbFontSize) tbFontSize.value = cardData.fontSize || 14;
  const tbSharp = document.getElementById('toolbarSharpEdge');
  if (tbSharp) tbSharp.checked = !!cardData.sharpEdge;


  // Hide all type-specific sections first
  const sections = [
    'statblockSection', 'chartSection', 'barSection', 'stressSection',
    'injurySection', 'bodySection', 'textStyleSection', 'imageUploadSection',
    'standardDescSection', 'textAlignSection', 'itemSection',
    'personalitySection', 'attributesSection', 'inventorySection',
    'currencySection', 'moodSection', 'randomizerSection', 'abilitySection', 'typeFieldsSection'
  ];
  sections.forEach((id) => { const el = document.getElementById(id); if (el) el.classList.add('hidden'); });
  document.getElementById('detailImagePreview').classList.add('hidden');

  // Show appropriate sections
  if (cardData.type === 'statblock') {
    document.getElementById('statblockSection').classList.remove('hidden');
    renderStatGrid(cardData.stats);
  } else if (cardData.type === 'chart') {
    document.getElementById('chartSection').classList.remove('hidden');
    document.getElementById('chartType').value = cardData.chartType || 'pie';
    document.getElementById('chartFill').value = cardData.chartFill || 'solid';
    renderChartDataList(cardData.chartData);
  } else if (cardData.type === 'bar') {
    document.getElementById('barSection').classList.remove('hidden');
    renderBarsList(cardData.bars);
  } else if (cardData.type === 'stress') {
    document.getElementById('stressSection').classList.remove('hidden');
    document.getElementById('stressSegments').value = cardData.stressSegments || 4;
    document.getElementById('stressFilled').value = cardData.stressFilled || 0;
    document.getElementById('stressStyle').value = cardData.stressStyle || 'clock';
    document.getElementById('stressFillStyle').value = cardData.stressFillStyle || 'solid';
    document.getElementById('stressColor').value = cardData.stressColor || '#f97316';
  } else if (cardData.type === 'injury') {
    document.getElementById('injurySection').classList.remove('hidden');
    renderInjuryTracksList(cardData.injuryTracks);
  } else if (cardData.type === 'body') {
    document.getElementById('bodySection').classList.remove('hidden');
    document.getElementById('bodyFigure').value = cardData.bodyFigure || 'neutral';
    document.getElementById('bodyOverlayColor').value = cardData.bodyOverlayColor || getDefaultBodyColor(cardData.bodyFigure || 'neutral');
    document.getElementById('pointColor').value = cardData.pointColor || '#ef4444';
  } else if (cardData.type === 'text') {
    document.getElementById('textStyleSection').classList.remove('hidden');
    document.getElementById('textAlignSection').classList.remove('hidden');
    document.getElementById('standardDescSection').classList.remove('hidden');
    document.getElementById('textStyleSelect').value = cardData.textStyle || 'heading1';
    document.querySelectorAll('.align-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.align === (cardData.textAlign || 'left'));
    });
  } else if (cardData.type === 'item') {
    document.getElementById('itemSection').classList.remove('hidden');
    document.getElementById('standardDescSection').classList.remove('hidden');
    document.getElementById('itemType').value = cardData.itemType || 'gear';
    document.getElementById('itemRarity').value = cardData.itemRarity || 'common';
    document.getElementById('itemLoad').value = cardData.itemLoad || 0;
    document.getElementById('itemUsesCurrent').value = cardData.itemUsesCurrent || 0;
    document.getElementById('itemUsesMax').value = cardData.itemUsesMax || 0;
    document.getElementById('itemEffect').value = cardData.itemEffect || '';
    renderItemPropertiesList(cardData.itemProperties || []);
  } else if (cardData.type === 'personality') {
    document.getElementById('personalitySection').classList.remove('hidden');
    renderPersonalityTraitsList(cardData.personalityTraits || []);
  } else if (cardData.type === 'attributes') {
    document.getElementById('attributesSection').classList.remove('hidden');
    document.getElementById('attrCategory').value = cardData.attrCategory || 'appearance';
    renderAttributesList(cardData.attributes || []);
  } else if (cardData.type === 'inventory') {
    document.getElementById('inventorySection').classList.remove('hidden');
    document.getElementById('invMaxSlots').value = cardData.invMaxSlots || 10;
    renderInventoryItemsList(cardData.invItems || []);
  } else if (cardData.type === 'currency') {
    document.getElementById('currencySection').classList.remove('hidden');
    renderCurrencyList(cardData.currencies || []);
    renderStashList(cardData.stash || []);
  } else if (cardData.type === 'mood') {
    document.getElementById('moodSection').classList.remove('hidden');
    document.getElementById('moodLevel').value = cardData.moodLevel ?? 50;
    document.getElementById('moodLowLabel').value = cardData.moodLowLabel || 'Despair';
    document.getElementById('moodHighLabel').value = cardData.moodHighLabel || 'Euphoria';
    document.getElementById('moodColorLow').value = cardData.moodColorLow || '#ef4444';
    document.getElementById('moodColorHigh').value = cardData.moodColorHigh || '#22c55e';
  } else if (cardData.type === 'randomizer') {
    document.getElementById('randomizerSection').classList.remove('hidden');
    document.getElementById('randDiceNotation').value = cardData.diceNotation || '';
    renderRandomizerEntriesList(cardData);
    const resultEl = document.getElementById('randLastResult');
    if (resultEl && cardData.lastRoll !== null && cardData.lastRoll !== undefined) {
      resultEl.textContent = cardData.tableEntries[cardData.lastRoll]?.text || '';
    } else if (resultEl) {
      resultEl.textContent = '';
    }
  } else if (cardData.type === 'ability') {
    const abSec = document.getElementById('abilitySection');
    if (abSec) {
      abSec.classList.remove('hidden');
      document.getElementById('abilityType').value = cardData.abilityType || 'spell';
      document.getElementById('abilityLevel').value = cardData.abilityLevel || '';
      document.getElementById('abilityCost').value = cardData.abilityCost || '';
      document.getElementById('abilityRange').value = cardData.abilityRange || '';
      document.getElementById('abilityDuration').value = cardData.abilityDuration || '';
      document.getElementById('abilityUseType').value = cardData.abilityUseType || 'ticks';
      document.getElementById('abilityMaxUses').value = cardData.abilityMaxUses || 3;
      document.getElementById('abilityDesc').value = cardData.description || '';
    }
  } else if (cardData.type === 'character') {
    document.getElementById('standardDescSection').classList.remove('hidden');
    // Re-purpose standard desc for character bio
    document.getElementById('detailDescription').value = cardData.charBio || '';
    document.getElementById('detailDescription').placeholder = 'Character backstory / notes...';
    renderCharFieldsInDetail(cardData);
  } else if (cardData.type === 'location') {
    document.getElementById('standardDescSection').classList.remove('hidden');
    document.getElementById('detailDescription').value = cardData.locSecrets || '';
    document.getElementById('detailDescription').placeholder = 'Hidden secrets of this location...';
    renderLocFieldsInDetail(cardData);
  } else if (cardData.type === 'quest') {
    document.getElementById('standardDescSection').classList.remove('hidden');
    document.getElementById('detailDescription').value = cardData.questObjective || '';
    document.getElementById('detailDescription').placeholder = 'Quest objective...';
    renderQuestFieldsInDetail(cardData);
  } else if (cardData.type === 'ref-map' || cardData.type === 'ref-chapter' || cardData.type === 'ref-timeline' || cardData.type === 'ref-music' || cardData.type === 'ref-soundscape') {
    renderRefFieldsInDetail(cardData);
  } else if (cardData.type === 'image') {
    // Image cards don't use the standard description field
  } else {
    document.getElementById('standardDescSection').classList.remove('hidden');
  }

  if (cardData.type === 'image') {
    document.getElementById('imageUploadSection').classList.remove('hidden');
  }

  if (cardData.imageUrl) {
    document.getElementById('detailImagePreview').classList.remove('hidden');
    document.getElementById('detailImage').src = cardData.imageUrl;
  }

  updateConnectionsList(cardData.id);
  renderConnections();

  // Render associations list
  renderCardAssociationsList();
}

function deselectAll() {
  document.querySelectorAll('.card.selected').forEach((c) => c.classList.remove('selected'));
  document.querySelectorAll('.card.multi-selected').forEach((c) => c.classList.remove('multi-selected'));
  selectedCard = null;
  multiSelectedCards.clear();
  const quickTop = document.getElementById('quickTopColor');
  if (quickTop) quickTop.value = '#4ecdc4';
  const topPicker = document.getElementById('cardTopAccentPicker');
  if (topPicker) topPicker.value = '#4ecdc4';
  const topEl = document.getElementById('cardTopColor');
  if (topEl) topEl.value = '#4ecdc4';
  selectedPin = null;
  document.querySelectorAll('.map-pin.selected').forEach((p) => p.classList.remove('selected'));
  document.getElementById('emptyState').classList.remove('hidden');
  document.getElementById('cardDetails').classList.add('hidden');
  document.getElementById('pinDetails').classList.add('hidden');
  document.getElementById('chapterDetails')?.classList.add('hidden');

  // Deselect any selected connection and clear toolbar
  selectedConnection = null;
  multiSelectedConnections = [];
  setToolbarMode?.('none');
  renderConnections();

  // Remove marquee
  const marquee = document.getElementById('marqueeRect');
  if (marquee) marquee.remove();
}

function addToMultiSelect(cardEl) {
  if (multiSelectedCards.has(cardEl.id)) {
    // Remove from multi-select
    multiSelectedCards.delete(cardEl.id);
    cardEl.classList.remove('multi-selected');
    if (multiSelectedCards.size === 0) {
      deselectAll();
      return;
    }
  } else {
    // Add current single-selected card to multi-select if exists
    if (selectedCard && !multiSelectedCards.has(selectedCard.id)) {
      multiSelectedCards.add(selectedCard.id);
      selectedCard.classList.add('multi-selected');
    }
    multiSelectedCards.add(cardEl.id);
    cardEl.classList.add('multi-selected');
    selectedCard = null;
    document.querySelectorAll('.card.selected').forEach((c) => c.classList.remove('selected'));
  }

  // Update toolbar for multi-select
  setToolbarMode('multi');
  const toolbarLabel = document.getElementById('toolbarLabel');
  const toolbarStatus = document.getElementById('toolbarStatus');
  const toolbarIcon = document.getElementById('toolbarIcon');
  if (toolbarLabel) toolbarLabel.textContent = 'Multiple';
  if (toolbarStatus) toolbarStatus.textContent = `${multiSelectedCards.size} items selected`;
  if (toolbarIcon) toolbarIcon.textContent = '⬡';
}

function updateSelectedCard() {
  if (!selectedCard) return;

  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData) return;

  cardData.title = document.getElementById('detailName').value;
  // Sync with toolbar title
  const toolbarTitleEl = document.getElementById('toolbarCardTitle');
  if (toolbarTitleEl) toolbarTitleEl.value = cardData.title;
  // Save description to correct field based on card type
  const descVal = document.getElementById('detailDescription').value;
  if (cardData.type === 'character') { cardData.charBio = descVal; }
  else if (cardData.type === 'location') { cardData.locSecrets = descVal; }
  else if (cardData.type === 'quest') { cardData.questObjective = descVal; }
  else { cardData.description = descVal; }
  cardData.tags = document.getElementById('detailTags').value.split(',').map((t) => t.trim()).filter((t) => t);

  refreshCard(cardData);
}

function updateCardStyle() {
  if (!selectedCard) return;

  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData) return;

  cardData.fontFamily = document.getElementById('cardFontFamily').value;
  cardData.fontSize = parseInt(document.getElementById('cardFontSize').value);
  const titleColorEl = document.getElementById('toolbarTitleColor');
  if (titleColorEl) cardData.titleColor = titleColorEl.value;
  const labelColorEl = document.getElementById('toolbarLabelColor');
  if (labelColorEl) cardData.labelColor = labelColorEl.value;
  const textColorEl = document.getElementById('toolbarTextColor');
  if (textColorEl) cardData.textColor = textColorEl.value;
  const bgColorEl = document.getElementById('toolbarBgColor');
  if (bgColorEl && (cardData.bgColor || bgColorEl.value !== '#0a0a0a')) cardData.bgColor = bgColorEl.value;
  const topPicker = document.getElementById('cardTopAccentPicker');
  const topEl = document.getElementById('cardTopColor');
  const quickTop = document.getElementById('quickTopColor');
  if (topPicker) cardData.topColor = topPicker.value;
  else if (topEl) cardData.topColor = topEl.value;
  else if (quickTop && quickTop.value) cardData.topColor = quickTop.value;

  refreshCard(cardData);
}

function updateCardToolbarExtras() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find(c => c.id === selectedCard.id);
  if (!cardData) return;

  const borderStyle = document.getElementById('toolbarBorderStyle');
  const borderColor = document.getElementById('toolbarBorderColor');
  const designSel = document.getElementById('toolbarCardDesign');
  const hideHeader = document.getElementById('toolbarHideHeader');
  const hideTags = document.getElementById('toolbarHideTags');

  if (borderStyle) cardData.borderStyle = borderStyle.value;
  if (borderColor) cardData.borderColor = borderColor.value;
  if (designSel) cardData.design = designSel.value || null;
  if (hideHeader) cardData.hideTitle = hideHeader.checked;
  if (hideTags) cardData.hideTags = hideTags.checked;

  const fontFam = document.getElementById('toolbarFontFamily');
  const fontSize = document.getElementById('toolbarFontSize');
  const sharpEdge = document.getElementById('toolbarSharpEdge');
  if (fontFam) cardData.fontFamily = fontFam.value;
  if (fontSize) cardData.fontSize = parseInt(fontSize.value) || 14;
  if (sharpEdge) cardData.sharpEdge = sharpEdge.checked;

  refreshCard(cardData);
}

function updateTextAlignment(align) {
  if (!selectedCard) return;

  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData) return;

  cardData.textAlign = align;
  refreshCard(cardData);
}

function refreshCard(cardData) {
  const oldCard = document.getElementById(cardData.id);
  if (oldCard) {
    oldCard.remove();
    createCardElement(cardData);
    const newCard = document.getElementById(cardData.id);
    newCard.classList.add('selected');
    selectedCard = newCard;
  }
}

function refreshCardElement(cardData) {
  const oldCard = document.getElementById(cardData.id);
  if (!oldCard) return;
  const wasSelected = oldCard.classList.contains('selected');
  oldCard.remove();
  createCardElement(cardData);
  if (wasSelected) {
    const newCard = document.getElementById(cardData.id);
    if (newCard) { newCard.classList.add('selected'); selectedCard = newCard; }
  }
}

function deleteCard(cardId) {
  const board = getCurrentBoard();
  const cardEl = document.getElementById(cardId);
  if (cardEl) cardEl.remove();

  board.cards = board.cards.filter((c) => c.id !== cardId);
  board.connections = board.connections.filter((c) => c.from !== cardId && c.to !== cardId);

  deselectAll();
  renderConnections();
  updateStatusBar();

  if (board.cards.length === 0) {
    document.getElementById('canvasEmptyState').classList.remove('hidden');
  }
}

// ============================================
// Stat Block Management
// ============================================
function renderStatGrid(stats) {
  const grid = document.getElementById('statGrid');
  grid.innerHTML = '';

  for (const [stat, value] of Object.entries(stats)) {
    const row = document.createElement('div');
    row.className = 'stat-input-row';
    row.innerHTML = `
      <input type="text" value="${stat}" data-old-stat="${stat}" class="stat-name-input">
      <input type="number" value="${value}" data-stat="${stat}" min="1" max="99" class="stat-value-input">
      <button class="remove-btn" data-stat="${stat}">×</button>
    `;

    row.querySelector('.stat-name-input').addEventListener('change', (e) =>
      renameStat(e.target.dataset.oldStat, e.target.value)
    );
    row.querySelector('.stat-value-input').addEventListener('change', (e) =>
      updateStat(e.target.dataset.stat, parseInt(e.target.value) || 10)
    );
    row.querySelector('.remove-btn').addEventListener('click', (e) =>
      removeStat(e.target.dataset.stat)
    );

    grid.appendChild(row);
  }
}

function addStat() {
  if (!selectedCard) return;
  openPopup('Add Stat', 'Stat name', '', (name) => {
    if (!name) return;
    const board = getCurrentBoard();
    const cardData = board.cards.find((c) => c.id === selectedCard.id);
    if (!cardData || !cardData.stats) return;

    if (!cardData.stats[name]) {
      cardData.stats[name] = 10;
      renderStatGrid(cardData.stats);
      refreshCard(cardData);
    }
  });
}

function updateStat(stat, value) {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData || !cardData.stats) return;

  cardData.stats[stat] = value;
  refreshCard(cardData);
}

function renameStat(oldName, newName) {
  if (!selectedCard || !newName || oldName === newName) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData || !cardData.stats) return;

  const value = cardData.stats[oldName];
  delete cardData.stats[oldName];
  cardData.stats[newName] = value;
  renderStatGrid(cardData.stats);
  refreshCard(cardData);
}

function removeStat(stat) {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData || !cardData.stats) return;

  delete cardData.stats[stat];
  renderStatGrid(cardData.stats);
  refreshCard(cardData);
}

// ============================================
// Chart Data Management
// ============================================
function renderChartDataList(chartData) {
  const list = document.getElementById('chartDataList');
  list.innerHTML = '';

  chartData.forEach((item, index) => {
    const row = document.createElement('div');
    row.className = 'chart-data-item';
    row.innerHTML = `
      <input type="text" value="${item.label}" data-index="${index}" data-field="label">
      <input type="number" value="${item.value}" data-index="${index}" data-field="value" min="0">
      <input type="color" value="${item.color}" data-index="${index}" data-field="color">
      <button class="remove-btn" data-index="${index}">×</button>
    `;

    row.querySelectorAll('input').forEach((input) => {
      input.addEventListener('change', (e) =>
        updateChartData(parseInt(e.target.dataset.index), e.target.dataset.field, e.target.value)
      );
    });

    row.querySelector('.remove-btn').addEventListener('click', (e) =>
      removeChartSegment(parseInt(e.target.dataset.index))
    );

    list.appendChild(row);
  });
}

function addChartSegment() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData || !cardData.chartData) return;

  const colors = ['#4ecdc4', '#f43f5e', '#d4a824', '#8b5cf6', '#22c55e', '#ff6b35'];
  cardData.chartData.push({
    label: `Segment ${cardData.chartData.length + 1}`,
    value: 25,
    color: colors[cardData.chartData.length % colors.length],
  });

  renderChartDataList(cardData.chartData);
  refreshCard(cardData);
}

function removeChartSegment(index) {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData || !cardData.chartData) return;

  cardData.chartData.splice(index, 1);
  renderChartDataList(cardData.chartData);
  refreshCard(cardData);
}

function updateChartData(index, field, value) {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData || !cardData.chartData) return;

  cardData.chartData[index][field] = field === 'value' ? parseInt(value) || 0 : value;
  refreshCard(cardData);
}

function updateChartCard() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData) return;

  cardData.chartType = document.getElementById('chartType').value;
  cardData.chartFill = document.getElementById('chartFill').value;
  refreshCard(cardData);
}

// ============================================
// Bar Card Management
// ============================================
function renderBarsList(bars) {
  const list = document.getElementById('barsList');
  list.innerHTML = '';

  bars.forEach((bar, index) => {
    const row = document.createElement('div');
    row.className = 'bar-item-row';
    row.innerHTML = `
      <div class="bar-item-header">
        <input type="text" value="${bar.name}" data-index="${index}" data-field="name">
        <button class="remove-btn" data-index="${index}">×</button>
      </div>
      <div class="bar-item-inputs">
        <input type="number" value="${bar.current}" data-index="${index}" data-field="current" min="0" placeholder="Current">
        <input type="number" value="${bar.max}" data-index="${index}" data-field="max" min="1" placeholder="Max">
        <input type="color" data-index="${index}" data-field="color">
        <select data-index="${index}" data-field="style">
          <option value="solid" ${bar.style === 'solid' ? 'selected' : ''}>Solid</option>
          <option value="striped" ${bar.style === 'striped' ? 'selected' : ''}>Striped</option>
          <option value="segmented" ${bar.style === 'segmented' ? 'selected' : ''}>Segmented</option>
          <option value="gradient" ${bar.style === 'gradient' ? 'selected' : ''}>Gradient</option>
        </select>
      </div>
    `;

    // Set color input value explicitly after DOM creation
    const colorInput = row.querySelector('input[type="color"]');
    if (colorInput) colorInput.value = bar.color || '#ef4444';

    row.querySelectorAll('input, select').forEach((input) => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        const field = e.target.dataset.field;
        let value = e.target.value;
        if (field === 'current' || field === 'max') value = parseInt(value) || 0;
        updateBarData(idx, field, value);
      });
    });

    row.querySelector('.remove-btn').addEventListener('click', (e) =>
      removeBar(parseInt(e.target.dataset.index))
    );

    list.appendChild(row);
  });
}

function addBar() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData || !cardData.bars) return;

  cardData.bars.push({
    name: 'New Bar',
    current: 100,
    max: 100,
    color: '#22c55e',
    style: 'solid',
  });
  renderBarsList(cardData.bars);
  refreshCard(cardData);
}

function removeBar(index) {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData || !cardData.bars) return;

  cardData.bars.splice(index, 1);
  renderBarsList(cardData.bars);
  refreshCard(cardData);
}

function updateBarData(index, field, value) {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData || !cardData.bars) return;

  cardData.bars[index][field] = value;
  refreshCard(cardData);
}

// ============================================
// Stress/Clock Management
// ============================================
function updateStressCard() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData) return;

  cardData.stressSegments = parseInt(document.getElementById('stressSegments').value) || 4;
  cardData.stressFilled = Math.min(
    parseInt(document.getElementById('stressFilled').value) || 0,
    cardData.stressSegments
  );
  cardData.stressStyle = document.getElementById('stressStyle').value;
  cardData.stressFillStyle = document.getElementById('stressFillStyle').value || 'solid';
  cardData.stressColor = document.getElementById('stressColor').value;

  refreshCard(cardData);
}

// ============================================
// Injury Track Management
// ============================================
function renderInjuryTracksList(tracks) {
  const list = document.getElementById('injuryTracksList');
  list.innerHTML = '';

  tracks.forEach((track, index) => {
    const row = document.createElement('div');
    row.className = 'injury-track-row';
    row.innerHTML = `
      <div class="injury-track-header">
        <input type="text" value="${track.name}" data-index="${index}" data-field="name">
        <button class="remove-btn" data-index="${index}">×</button>
      </div>
      <div class="injury-track-inputs">
        <label>Boxes</label>
        <input type="number" value="${track.boxes}" data-index="${index}" data-field="boxes" min="1" max="10">
        <label>Filled</label>
        <input type="number" value="${track.filled}" data-index="${index}" data-field="filled" min="0">
      </div>
    `;

    row.querySelectorAll('input').forEach((input) => {
      input.addEventListener('change', (e) => {
        const idx = parseInt(e.target.dataset.index);
        const field = e.target.dataset.field;
        let value = e.target.value;
        if (field !== 'name') value = parseInt(value) || 0;
        updateInjuryTrackData(idx, field, value);
      });
    });

    row.querySelector('.remove-btn').addEventListener('click', (e) =>
      removeInjuryTrack(parseInt(e.target.dataset.index))
    );

    list.appendChild(row);
  });
}

function addInjuryTrack() {
  if (!selectedCard) return;
  openPopup('Add Injury Track', 'Track name', '', (name) => {
    if (!name) return;
    const board = getCurrentBoard();
    const cardData = board.cards.find((c) => c.id === selectedCard.id);
    if (!cardData || !cardData.injuryTracks) return;

    cardData.injuryTracks.push({ name, boxes: 2, filled: 0 });
    renderInjuryTracksList(cardData.injuryTracks);
    refreshCard(cardData);
  });
}

function removeInjuryTrack(index) {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData || !cardData.injuryTracks) return;

  cardData.injuryTracks.splice(index, 1);
  renderInjuryTracksList(cardData.injuryTracks);
  refreshCard(cardData);
}

function updateInjuryTrackData(index, field, value) {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData || !cardData.injuryTracks) return;

  cardData.injuryTracks[index][field] = value;
  if (field === 'boxes') {
    cardData.injuryTracks[index].filled = Math.min(cardData.injuryTracks[index].filled, value);
  }
  refreshCard(cardData);
}

// ============================================
// Body Map Management
// ============================================
function updateBodyCard() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData) return;

  const newFigure = document.getElementById('bodyFigure').value;
  const figureChanged = newFigure !== cardData.bodyFigure;
  cardData.bodyFigure = newFigure;
  
  if (figureChanged) {
    // Set default color for the new figure type
    const defaultColor = getDefaultBodyColor(newFigure);
    cardData.bodyOverlayColor = defaultColor;
    document.getElementById('bodyOverlayColor').value = defaultColor;
  } else {
    cardData.bodyOverlayColor = document.getElementById('bodyOverlayColor').value;
  }
  cardData.pointColor = document.getElementById('pointColor').value;

  refreshCard(cardData);
}

// ============================================
// Text Style
// ============================================
function updateTextCardStyle() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData) return;

  cardData.textStyle = document.getElementById('textStyleSelect').value;
  refreshCard(cardData);
}

// ============================================
// Item Card Management
// ============================================
function updateItemCard() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData) return;

  cardData.itemType = document.getElementById('itemType').value;
  cardData.itemRarity = document.getElementById('itemRarity').value;
  cardData.itemLoad = parseInt(document.getElementById('itemLoad').value) || 0;
  cardData.itemUsesCurrent = parseInt(document.getElementById('itemUsesCurrent').value) || 0;
  cardData.itemUsesMax = parseInt(document.getElementById('itemUsesMax').value) || 0;
  cardData.itemEffect = document.getElementById('itemEffect').value;
  refreshCard(cardData);
}

function renderItemPropertiesList(properties) {
  const list = document.getElementById('itemPropertiesList');
  if (!list) return;
  list.innerHTML = '';
  properties.forEach((prop, i) => {
    const row = document.createElement('div');
    row.className = 'item-prop-row';
    row.innerHTML = `<input type="text" value="${prop}" data-index="${i}" class="detail-input sm"><button class="remove-btn" data-index="${i}">×</button>`;
    row.querySelector('input').addEventListener('change', (e) => {
      if (!selectedCard) return;
      const board = getCurrentBoard();
      const cd = board.cards.find(c => c.id === selectedCard.id);
      if (cd) { cd.itemProperties[parseInt(e.target.dataset.index)] = e.target.value; refreshCard(cd); }
    });
    row.querySelector('.remove-btn').addEventListener('click', (e) => {
      if (!selectedCard) return;
      const board = getCurrentBoard();
      const cd = board.cards.find(c => c.id === selectedCard.id);
      if (cd) { cd.itemProperties.splice(parseInt(e.target.dataset.index), 1); renderItemPropertiesList(cd.itemProperties); refreshCard(cd); }
    });
    list.appendChild(row);
  });
}

function addItemProperty() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cd = board.cards.find(c => c.id === selectedCard.id);
  if (!cd) return;
  if (!cd.itemProperties) cd.itemProperties = [];
  cd.itemProperties.push('New Property');
  renderItemPropertiesList(cd.itemProperties);
  refreshCard(cd);
}

// ============================================
// Personality Card Management
// ============================================
function renderPersonalityTraitsList(traits) {
  const list = document.getElementById('personalityTraitsList');
  if (!list) return;
  list.innerHTML = '';
  const icons = ['✦','♥','✕','◆','★','⚡','☽','♠'];
  traits.forEach((trait, i) => {
    const row = document.createElement('div');
    row.className = 'personality-edit-row';
    row.innerHTML = `
      <select data-index="${i}" data-field="icon" class="detail-select" style="width:50px">${icons.map(ic => `<option value="${ic}" ${trait.icon===ic?'selected':''}>${ic}</option>`).join('')}</select>
      <input type="text" value="${trait.label}" data-index="${i}" data-field="label" class="detail-input sm" placeholder="Label" style="width:70px">
      <input type="text" value="${trait.value || ''}" data-index="${i}" data-field="value" class="detail-input sm" placeholder="Value..." style="flex:1">
      <button class="remove-btn" data-index="${i}">×</button>
    `;
    row.querySelectorAll('input, select').forEach(inp => {
      inp.addEventListener('change', (e) => {
        if (!selectedCard) return;
        const board = getCurrentBoard();
        const cd = board.cards.find(c => c.id === selectedCard.id);
        if (cd && cd.personalityTraits[parseInt(e.target.dataset.index)]) {
          cd.personalityTraits[parseInt(e.target.dataset.index)][e.target.dataset.field] = e.target.value;
          refreshCard(cd);
        }
      });
    });
    row.querySelector('.remove-btn').addEventListener('click', (e) => {
      if (!selectedCard) return;
      const board = getCurrentBoard();
      const cd = board.cards.find(c => c.id === selectedCard.id);
      if (cd) { cd.personalityTraits.splice(parseInt(e.target.dataset.index), 1); renderPersonalityTraitsList(cd.personalityTraits); refreshCard(cd); }
    });
    list.appendChild(row);
  });
}

function addPersonalityTrait() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cd = board.cards.find(c => c.id === selectedCard.id);
  if (!cd) return;
  if (!cd.personalityTraits) cd.personalityTraits = [];
  cd.personalityTraits.push({ label: 'New Trait', value: '', icon: '◆' });
  renderPersonalityTraitsList(cd.personalityTraits);
  refreshCard(cd);
}

// ============================================
// Attributes Card Management
// ============================================
function updateAttrCategory() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cd = board.cards.find(c => c.id === selectedCard.id);
  if (!cd) return;
  const cat = document.getElementById('attrCategory').value;
  cd.attrCategory = cat;
  const presets = {
    appearance: [
      { name: 'Race', value: '' }, { name: 'Height', value: '' }, { name: 'Build', value: '' },
      { name: 'Hair', value: '' }, { name: 'Eyes', value: '' }, { name: 'Skin', value: '' }, { name: 'Distinguishing', value: '' }
    ],
    background: [
      { name: 'Birthplace', value: '' }, { name: 'Upbringing', value: '' }, { name: 'Occupation', value: '' },
      { name: 'Education', value: '' }, { name: 'Family', value: '' }, { name: 'Social Class', value: '' }, { name: 'Motivation', value: '' }
    ],
    demeanor: [
      { name: 'Temperament', value: '' }, { name: 'Speech', value: '' }, { name: 'Mannerisms', value: '' },
      { name: 'Habits', value: '' }, { name: 'Fears', value: '' }, { name: 'Values', value: '' }, { name: 'Quirks', value: '' }
    ],
    custom: []
  };
  cd.attributes = presets[cat] || presets.custom;
  refreshCard(cd);
  renderAttributesList(cd.attributes);
}

function renderAttributesList(attrs) {
  const list = document.getElementById('attributesList');
  if (!list) return;
  list.innerHTML = '';
  attrs.forEach((attr, i) => {
    const row = document.createElement('div');
    row.className = 'attr-edit-row';
    row.innerHTML = `
      <input type="text" value="${attr.name}" data-index="${i}" data-field="name" class="detail-input sm" style="width:80px" placeholder="Label">
      <input type="text" value="${attr.value || ''}" data-index="${i}" data-field="value" class="detail-input sm" style="flex:1" placeholder="Value...">
      <button class="remove-btn" data-index="${i}">×</button>
    `;
    row.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        if (!selectedCard) return;
        const board = getCurrentBoard();
        const cd = board.cards.find(c => c.id === selectedCard.id);
        if (cd && cd.attributes[parseInt(e.target.dataset.index)]) {
          cd.attributes[parseInt(e.target.dataset.index)][e.target.dataset.field] = e.target.value;
          refreshCard(cd);
        }
      });
    });
    row.querySelector('.remove-btn').addEventListener('click', (e) => {
      if (!selectedCard) return;
      const board = getCurrentBoard();
      const cd = board.cards.find(c => c.id === selectedCard.id);
      if (cd) { cd.attributes.splice(parseInt(e.target.dataset.index), 1); renderAttributesList(cd.attributes); refreshCard(cd); }
    });
    list.appendChild(row);
  });
}

function addAttribute() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cd = board.cards.find(c => c.id === selectedCard.id);
  if (!cd) return;
  if (!cd.attributes) cd.attributes = [];
  cd.attributes.push({ name: 'Trait', value: '' });
  renderAttributesList(cd.attributes);
  refreshCard(cd);
}

// ============================================
// Inventory Card Management
// ============================================
function updateInvMaxSlots() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cd = board.cards.find(c => c.id === selectedCard.id);
  if (cd) { cd.invMaxSlots = parseInt(document.getElementById('invMaxSlots').value) || 10; refreshCard(cd); }
}

function renderInventoryItemsList(items) {
  const list = document.getElementById('inventoryItemsList');
  if (!list) return;
  list.innerHTML = '';
  items.forEach((item, i) => {
    const row = document.createElement('div');
    row.className = 'inv-edit-row';
    row.innerHTML = `
      <input type="text" value="${item.name}" data-index="${i}" data-field="name" class="detail-input sm" style="flex:1" placeholder="Item name">
      <input type="number" value="${item.qty}" data-index="${i}" data-field="qty" class="detail-input sm" style="width:40px" min="0">
      <input type="number" value="${item.load}" data-index="${i}" data-field="load" class="detail-input sm" style="width:40px" min="0" title="Load">
      <button class="remove-btn" data-index="${i}">×</button>
    `;
    row.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        if (!selectedCard) return;
        const board = getCurrentBoard();
        const cd = board.cards.find(c => c.id === selectedCard.id);
        if (cd && cd.invItems[parseInt(e.target.dataset.index)]) {
          const f = e.target.dataset.field;
          cd.invItems[parseInt(e.target.dataset.index)][f] = f === 'name' ? e.target.value : parseInt(e.target.value) || 0;
          refreshCard(cd);
        }
      });
    });
    row.querySelector('.remove-btn').addEventListener('click', (e) => {
      if (!selectedCard) return;
      const board = getCurrentBoard();
      const cd = board.cards.find(c => c.id === selectedCard.id);
      if (cd) { cd.invItems.splice(parseInt(e.target.dataset.index), 1); renderInventoryItemsList(cd.invItems); refreshCard(cd); }
    });
    list.appendChild(row);
  });
}

function addInventoryItem() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cd = board.cards.find(c => c.id === selectedCard.id);
  if (!cd) return;
  if (!cd.invItems) cd.invItems = [];
  cd.invItems.push({ name: 'New Item', qty: 1, load: 1 });
  renderInventoryItemsList(cd.invItems);
  refreshCard(cd);
}

// ============================================
// Currency Card Management
// ============================================
function renderCurrencyList(currencies) {
  const list = document.getElementById('currencyList');
  if (!list) return;
  list.innerHTML = '';
  const icons = ['●','◆','★','♦','⬡','◉','▲','✦'];
  currencies.forEach((cur, i) => {
    const row = document.createElement('div');
    row.className = 'currency-edit-row';
    row.innerHTML = `
      <select data-index="${i}" data-field="icon" class="detail-select" style="width:44px">${icons.map(ic => `<option value="${ic}" ${cur.icon===ic?'selected':''}>${ic}</option>`).join('')}</select>
      <input type="text" value="${cur.name}" data-index="${i}" data-field="name" class="detail-input sm" style="flex:1">
      <input type="number" value="${cur.amount}" data-index="${i}" data-field="amount" class="detail-input sm" style="width:60px" min="0">
      <button class="remove-btn" data-index="${i}">×</button>
    `;
    row.querySelectorAll('input, select').forEach(inp => {
      inp.addEventListener('change', (e) => {
        if (!selectedCard) return;
        const board = getCurrentBoard();
        const cd = board.cards.find(c => c.id === selectedCard.id);
        if (cd && cd.currencies[parseInt(e.target.dataset.index)]) {
          const f = e.target.dataset.field;
          cd.currencies[parseInt(e.target.dataset.index)][f] = f === 'amount' ? parseInt(e.target.value) || 0 : e.target.value;
          refreshCard(cd);
        }
      });
    });
    row.querySelector('.remove-btn').addEventListener('click', (e) => {
      if (!selectedCard) return;
      const board = getCurrentBoard();
      const cd = board.cards.find(c => c.id === selectedCard.id);
      if (cd) { cd.currencies.splice(parseInt(e.target.dataset.index), 1); renderCurrencyList(cd.currencies); refreshCard(cd); }
    });
    list.appendChild(row);
  });
}

function addCurrency() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cd = board.cards.find(c => c.id === selectedCard.id);
  if (!cd) return;
  if (!cd.currencies) cd.currencies = [];
  cd.currencies.push({ name: 'New', amount: 0, icon: '●' });
  renderCurrencyList(cd.currencies);
  refreshCard(cd);
}

function renderStashList(stash) {
  const list = document.getElementById('stashList');
  if (!list) return;
  list.innerHTML = '';
  stash.forEach((s, i) => {
    const row = document.createElement('div');
    row.className = 'stash-edit-row';
    row.innerHTML = `
      <input type="text" value="${s.name}" data-index="${i}" data-field="name" class="detail-input sm" style="flex:1">
      <input type="number" value="${s.amount}" data-index="${i}" data-field="amount" class="detail-input sm" style="width:60px" min="0">
      <button class="remove-btn" data-index="${i}">×</button>
    `;
    row.querySelectorAll('input').forEach(inp => {
      inp.addEventListener('change', (e) => {
        if (!selectedCard) return;
        const board = getCurrentBoard();
        const cd = board.cards.find(c => c.id === selectedCard.id);
        if (cd && cd.stash[parseInt(e.target.dataset.index)]) {
          const f = e.target.dataset.field;
          cd.stash[parseInt(e.target.dataset.index)][f] = f === 'amount' ? parseInt(e.target.value) || 0 : e.target.value;
          refreshCard(cd);
        }
      });
    });
    row.querySelector('.remove-btn').addEventListener('click', (e) => {
      if (!selectedCard) return;
      const board = getCurrentBoard();
      const cd = board.cards.find(c => c.id === selectedCard.id);
      if (cd) { cd.stash.splice(parseInt(e.target.dataset.index), 1); renderStashList(cd.stash); refreshCard(cd); }
    });
    list.appendChild(row);
  });
}

function addStash() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cd = board.cards.find(c => c.id === selectedCard.id);
  if (!cd) return;
  if (!cd.stash) cd.stash = [];
  cd.stash.push({ name: 'Stash', amount: 0 });
  renderStashList(cd.stash);
  refreshCard(cd);
}

// ============================================
// Mood Card Management
// ============================================
function updateMoodCard() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cd = board.cards.find(c => c.id === selectedCard.id);
  if (!cd) return;
  cd.moodLevel = parseInt(document.getElementById('moodLevel').value) || 50;
  cd.moodLowLabel = document.getElementById('moodLowLabel').value;
  cd.moodHighLabel = document.getElementById('moodHighLabel').value;
  cd.moodColorLow = document.getElementById('moodColorLow').value;
  cd.moodColorHigh = document.getElementById('moodColorHigh').value;
  refreshCard(cd);
}

// ============================================
// Image
// ============================================
function removeCardImage() {
  if (!selectedCard) return;
  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === selectedCard.id);
  if (!cardData) return;

  delete cardData.imageUrl;
  document.getElementById('detailImagePreview').classList.add('hidden');
  refreshCard(cardData);
}

// ============================================
// Drag & Resize
// ============================================
function startDrag(e, card) {
  if (currentTool !== 'select' || e.target.tagName === 'INPUT') return;
  if (window.craftMyRole === 'viewer') return;

  isDragging = true;
  card.classList.add('dragging');
  saveUndoState();

  const rect = card.getBoundingClientRect();
  dragOffset = { x: e.clientX - rect.left, y: e.clientY - rect.top };

  const onMouseMove = (e) => {
    if (!isDragging) return;

    const container = document.getElementById('boardView');
    const containerRect = container.getBoundingClientRect();

    let x = (e.clientX - containerRect.left - panOffset.x - dragOffset.x) / zoom;
    let y = (e.clientY - containerRect.top - panOffset.y - dragOffset.y) / zoom;

    const snapped = snapPosition(x, y, card.id, e.shiftKey);
    x = Math.max(0, snapped.x);
    y = Math.max(0, snapped.y);

    // Render alignment guide lines
    renderAlignmentGuides(snapped.guides);

    card.style.left = `${x}px`;
    card.style.top = `${y}px`;

    const board = getCurrentBoard();
    const cardData = board.cards.find((c) => c.id === card.id);
    if (cardData) {
      cardData.x = x;
      cardData.y = y;
    }

    renderConnections();
  };

  const onMouseUp = () => {
    isDragging = false;
    card.classList.remove('dragging');
    clearAlignmentGuides();
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

function startResize(e, card) {
  e.stopPropagation();
  if (window.craftMyRole === 'viewer') return;
  isResizing = true;

  const startWidth = card.offsetWidth;
  const startHeight = card.offsetHeight;
  const startX = e.clientX;
  const startY = e.clientY;

  const onMouseMove = (e) => {
    if (!isResizing) return;

    const dx = (e.clientX - startX) / zoom;
    const dy = (e.clientY - startY) / zoom;

    const newWidth = Math.max(120, startWidth + dx);
    const newHeight = Math.max(80, startHeight + dy);

    card.style.width = `${newWidth}px`;
    card.style.height = `${newHeight}px`;

    const board = getCurrentBoard();
    const cardData = board.cards.find((c) => c.id === card.id);
    if (cardData) {
      cardData.width = newWidth;
      cardData.height = newHeight;
    }

    // Re-render connections while resizing
    renderConnections();
  };

  const onMouseUp = () => {
    isResizing = false;
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', onMouseUp);
    refreshCard(getCurrentBoard().cards.find(c => c.id === card.id));
  };

  document.addEventListener('mousemove', onMouseMove);
  document.addEventListener('mouseup', onMouseUp);
}

// ============================================
// Context Menu
// ============================================
function handleContextMenu(e) {
  // Check for pin first (in map view)
  const pinEl = e.target.closest('.map-pin');
  if (pinEl && currentView === 'map') {
    e.preventDefault();
    closeAllContextMenus();
    const map = getCurrentMap();
    const pin = map.pins.find(p => p.id === pinEl.dataset.pinId);
    if (pin) {
      contextMenuPin = pin;
      selectPin(pin.id);

      const menu = document.getElementById('pinContextMenu');
      menu.classList.remove('hidden');
      menu.style.left = `${e.clientX}px`;
      menu.style.top = `${e.clientY}px`;
    }
    return;
  }

  // Check for map canvas (in map view, on the map image)
  const mapCanvas = e.target.closest('.map-canvas');
  const mapImage = e.target.closest('.map-image');
  const mapWrapper = e.target.closest('.map-image-wrapper');
  if ((mapCanvas || mapImage || mapWrapper) && currentView === 'map') {
    const currentMap = getCurrentMap();
    if (currentMap && currentMap.imageUrl) {
      e.preventDefault();
      closeAllContextMenus();
      openMapCanvasContextMenu(e);
      return;
    }
  }

  // Check for card (in board view)
  const card = e.target.closest('.card');
  if (!card) return;

  e.preventDefault();
  closeAllContextMenus();
  contextMenuCard = card;
  selectCard(card);

  const menu = document.getElementById('contextMenu');
  menu.classList.remove('hidden');
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
}

function closeContextMenu() {
  closeAllContextMenus();
}

function handlePinContextAction(e) {
  const action = e.target.dataset.action;
  if (!action || !contextMenuPin) return;

  if (action === 'editPin') {
    openPinEditorModal(contextMenuPin.id);
  } else if (action === 'measureFrom') {
    startMeasurementFromPin(contextMenuPin);
  } else if (action === 'panToPin') {
    panToPin(contextMenuPin.id);
  } else if (action === 'deletePin') {
    deletePinById(contextMenuPin.id);
  }

  closeContextMenu();
}

function handleContextAction(e) {
  const action = e.target.dataset.action;
  if (!action || !contextMenuCard) return;

  const board = getCurrentBoard();
  const cardData = board.cards.find((c) => c.id === contextMenuCard.id);

  if (action === 'edit') {
    selectCard(contextMenuCard);
  } else if (action === 'duplicate') {
    duplicateCard(contextMenuCard.id);
  } else if (action === 'rollDice') {
    openDiceModal();
  } else if (action === 'delete') {
    deleteCard(contextMenuCard.id);
  } else if (action.startsWith('design-')) {
    const design = action.replace('design-', '');
    if (cardData) {
      cardData.design = design === 'default' ? null : design;
      refreshCard(cardData);
    }
  } else if (action.startsWith('size-')) {
    const sizePresets = {
      'size-small': { width: 150, height: 100 },
      'size-medium': { width: 200, height: 150 },
      'size-large': { width: 280, height: 200 },
      'size-tall': { width: 200, height: 300 },
      'size-wide': { width: 350, height: 150 }
    };
    const preset = sizePresets[action];
    if (cardData && preset) {
      cardData.width = preset.width;
      cardData.height = preset.height;
      refreshCard(cardData);
    }
  } else if (action === 'hideTitle') {
    if (cardData) {
      cardData.hideTitle = !cardData.hideTitle;
      refreshCard(cardData);
    }
  } else if (action === 'hideTags') {
    if (cardData) {
      cardData.hideTags = !cardData.hideTags;
      refreshCard(cardData);
    }
  } else if (action === 'toggleHideCard') {
    if (cardData) {
      cardData.hidden = !cardData.hidden;
      const el = document.getElementById(cardData.id);
      if (el) el.classList.toggle('card-hidden', !!cardData.hidden);
      showNotif(cardData.hidden ? `${cardData.title} hidden from others` : `${cardData.title} visible to all`);
    }
  }

  closeContextMenu();
}

// ============================================
// Connections
// ============================================
function handleConnectionClick(cardEl) {
  if (!connectingFrom) {
    connectingFrom = cardEl.id;
    cardEl.classList.add('connecting');
    document.getElementById('connectionIndicator').classList.remove('hidden');
  } else if (connectingFrom !== cardEl.id) {
    const board = getCurrentBoard();
    const exists = board.connections.some(
      (c) =>
        (c.from === connectingFrom && c.to === cardEl.id) ||
        (c.from === cardEl.id && c.to === connectingFrom)
    );

    if (!exists) {
      saveUndoState();
      board.connections.push({ from: connectingFrom, to: cardEl.id });
    }

    cancelConnection();
    renderConnections();
  }
}

function startConnectionFromDetails() {
  if (!selectedCard) return;
  setTool('connect');
  connectingFrom = selectedCard.id;
  selectedCard.classList.add('connecting');
  document.getElementById('connectionIndicator').classList.remove('hidden');
}

function cancelConnection() {
  if (connectingFrom) {
    const cardEl = document.getElementById(connectingFrom);
    if (cardEl) cardEl.classList.remove('connecting');
  }
  connectingFrom = null;
  document.getElementById('connectionIndicator').classList.add('hidden');
  setTool('select');
}

function renderConnections() {
  // Connections only render on the board view. Avoid hard crashes when the DOM isn't ready or view is swapped.
  let svg = document.getElementById('connectionsLayer');
  if (!svg) {
    const canvas = document.getElementById('canvas');
    if (canvas) {
      svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      svg.setAttribute('class', 'connections-layer');
      svg.setAttribute('id', 'connectionsLayer');
      canvas.prepend(svg);
    } else {
      return;
    }
  }

  // Clear
  svg.innerHTML = '';

  const board = getCurrentBoard();
  if (!board) return;

  const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');

  const colors = new Set(['#4ecdc4', '#f43f5e', '#d4a824', '#8b5cf6', '#22c55e', '#ef4444', '#3b82f6']);
  board.connections.forEach(c => { if (c.color) colors.add(c.color); });

  function addArrow(color) {
    const id = `arrow-${color.replace('#','')}`;
    if (defs.querySelector(`#${CSS.escape(id)}`)) return;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('markerUnits', 'strokeWidth');
    marker.setAttribute('orient', 'auto-start-reverse');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M 0 0 L 10 5 L 0 10 z');
    p.setAttribute('fill', color);
    marker.appendChild(p);
    defs.appendChild(marker);
  }

  function addDiamond(color) {
    const id = `diamond-${color.replace('#','')}`;
    if (defs.querySelector(`#${CSS.escape(id)}`)) return;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 12 12');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '6');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('markerUnits', 'strokeWidth');
    marker.setAttribute('orient', 'auto-start-reverse');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M 6 0 L 12 6 L 6 12 L 0 6 Z');
    p.setAttribute('fill', color);
    marker.appendChild(p);
    defs.appendChild(marker);
  }

  function addCircle(color) {
    const id = `circle-${color.replace('#','')}`;
    if (defs.querySelector(`#${CSS.escape(id)}`)) return;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 12 12');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '6');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('markerUnits', 'strokeWidth');
    marker.setAttribute('orient', 'auto-start-reverse');
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    c.setAttribute('cx', '6');
    c.setAttribute('cy', '6');
    c.setAttribute('r', '5');
    c.setAttribute('fill', color);
    marker.appendChild(c);
    defs.appendChild(marker);
  }

  function addSquare(color) {
    const id = `square-${color.replace('#','')}`;
    if (defs.querySelector(`#${CSS.escape(id)}`)) return;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 12 12');
    marker.setAttribute('refX', '10');
    marker.setAttribute('refY', '6');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('markerUnits', 'strokeWidth');
    marker.setAttribute('orient', 'auto-start-reverse');
    const r = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
    r.setAttribute('x', '1');
    r.setAttribute('y', '1');
    r.setAttribute('width', '10');
    r.setAttribute('height', '10');
    r.setAttribute('fill', color);
    marker.appendChild(r);
    defs.appendChild(marker);
  }

  function addTee(color) {
    const id = `tee-${color.replace('#','')}`;
    if (defs.querySelector(`#${CSS.escape(id)}`)) return;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 12 12');
    marker.setAttribute('refX', '6');
    marker.setAttribute('refY', '6');
    marker.setAttribute('markerWidth', '7');
    marker.setAttribute('markerHeight', '7');
    marker.setAttribute('markerUnits', 'strokeWidth');
    marker.setAttribute('orient', 'auto-start-reverse');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M 6 0 L 6 12 M 6 6 L 12 6');
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', '2.5');
    p.setAttribute('fill', 'none');
    marker.appendChild(p);
    defs.appendChild(marker);
  }

  function addOpenArrow(color) {
    const id = `open-${color.replace('#','')}`;
    if (defs.querySelector(`#${CSS.escape(id)}`)) return;
    const marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
    marker.setAttribute('id', id);
    marker.setAttribute('viewBox', '0 0 10 10');
    marker.setAttribute('refX', '9');
    marker.setAttribute('refY', '5');
    marker.setAttribute('markerWidth', '6');
    marker.setAttribute('markerHeight', '6');
    marker.setAttribute('markerUnits', 'strokeWidth');
    marker.setAttribute('orient', 'auto-start-reverse');
    const p = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    p.setAttribute('d', 'M 0 0 L 10 5 L 0 10');
    p.setAttribute('stroke', color);
    p.setAttribute('stroke-width', '1.5');
    p.setAttribute('fill', 'none');
    marker.appendChild(p);
    defs.appendChild(marker);
  }

  colors.forEach(color => { addArrow(color); addDiamond(color); addCircle(color); addSquare(color); addTee(color); addOpenArrow(color); });
  svg.appendChild(defs);

  const EDGE_PADDING = 18; // keeps endpoints & markers from hiding under cards

  const getEdgePoint = (cardEl, towardX, towardY, pad = EDGE_PADDING) => {
    const cx = parseFloat(cardEl.style.left) + cardEl.offsetWidth / 2;
    const cy = parseFloat(cardEl.style.top) + cardEl.offsetHeight / 2;
    const dx = towardX - cx;
    const dy = towardY - cy;

    // If same point, just return center
    if (dx === 0 && dy === 0) return { x: cx, y: cy };

    const hw = cardEl.offsetWidth / 2;
    const hh = cardEl.offsetHeight / 2;

    // Choose the *side* based on which direction dominates after normalizing by size.
    // This anchors to the CENTER of a side (not a corner), which reads cleaner in the UI.
    const nx = Math.abs(dx) / (hw || 1);
    const ny = Math.abs(dy) / (hh || 1);

    let ex = cx;
    let ey = cy;
    let ox = 0;
    let oy = 0;

    if (nx >= ny) {
      // Left/Right side center
      ox = dx >= 0 ? 1 : -1;
      ex = cx + ox * hw;
      ey = cy;
    } else {
      // Top/Bottom side center
      oy = dy >= 0 ? 1 : -1;
      ex = cx;
      ey = cy + oy * hh;
    }

    // Push outward for marker breathing room
    ex += ox * pad;
    ey += oy * pad;

    return { x: ex, y: ey };
  };

  board.connections.forEach((conn) => {
    const fromCard = document.getElementById(conn.from);
    const toCard = document.getElementById(conn.to);
    if (!fromCard || !toCard) return;

    // Users without hidden access: skip connections involving hidden cards
    if (!window.craftCanViewHidden && (fromCard.classList.contains('card-hidden') || toCard.classList.contains('card-hidden'))) return;

    // Use edge points instead of card centers so markers aren't hidden behind cards
    const toCenterX = parseFloat(toCard.style.left) + toCard.offsetWidth / 2;
    const toCenterY = parseFloat(toCard.style.top) + toCard.offsetHeight / 2;
    const fromCenterX = parseFloat(fromCard.style.left) + fromCard.offsetWidth / 2;
    const fromCenterY = parseFloat(fromCard.style.top) + fromCard.offsetHeight / 2;

    const fromEdge = getEdgePoint(fromCard, toCenterX, toCenterY);
    const toEdge = getEdgePoint(toCard, fromCenterX, fromCenterY);

    const fromX = fromEdge.x;
    const fromY = fromEdge.y;
    const toX = toEdge.x;
    const toY = toEdge.y;

    const midX = (fromX + toX) / 2;

    const dist = Math.hypot(toX - fromX, toY - fromY);
    const curvature = Math.max(80, dist * 0.35);

    const curveMode = conn.curve || 'up';
    let d;
    if (curveMode === 'straight') {
      d = `M ${fromX} ${fromY} L ${toX} ${toY}`;
    } else if (curveMode === 'swirl') {
      // Bee-line swirl: S-curve with decorative loops
      const dx = toX - fromX;
      const dy = toY - fromY;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len; // normal perpendicular
      const ny = dx / len;
      const amp = Math.min(len * 0.25, 60);
      const q1x = fromX + dx * 0.25 + nx * amp;
      const q1y = fromY + dy * 0.25 + ny * amp;
      const q2x = fromX + dx * 0.5 - nx * amp * 0.6;
      const q2y = fromY + dy * 0.5 - ny * amp * 0.6;
      const q3x = fromX + dx * 0.75 + nx * amp * 0.4;
      const q3y = fromY + dy * 0.75 + ny * amp * 0.4;
      d = `M ${fromX} ${fromY} C ${q1x} ${q1y} ${q2x} ${q2y} ${midX} ${(fromY+toY)/2} S ${q3x} ${q3y} ${toX} ${toY}`;
    } else if (curveMode === 'step') {
      // L-shaped step path
      const midStepX = (fromX + toX) / 2;
      d = `M ${fromX} ${fromY} L ${midStepX} ${fromY} L ${midStepX} ${toY} L ${toX} ${toY}`;
    } else if (curveMode === 'zigzag') {
      const dx = toX - fromX;
      const dy = toY - fromY;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len;
      const ny = dx / len;
      const segments = Math.max(3, Math.floor(len / 40));
      const amp = Math.min(20, len * 0.08);
      let pts = `M ${fromX} ${fromY}`;
      for (let i = 1; i <= segments; i++) {
        const t = i / (segments + 1);
        const px = fromX + dx * t + nx * amp * (i % 2 === 0 ? 1 : -1);
        const py = fromY + dy * t + ny * amp * (i % 2 === 0 ? 1 : -1);
        pts += ` L ${px} ${py}`;
      }
      pts += ` L ${toX} ${toY}`;
      d = pts;
    } else if (curveMode === 'wave') {
      const dx = toX - fromX;
      const dy = toY - fromY;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len;
      const ny = dx / len;
      const waveCount = Math.max(2, Math.round(len / 60));
      const amp = Math.min(25, len * 0.1);
      let pts = `M ${fromX} ${fromY}`;
      for (let i = 0; i < waveCount; i++) {
        const t1 = (i + 0.5) / waveCount;
        const t2 = (i + 1) / waveCount;
        const cp1x = fromX + dx * t1 + nx * amp * (i % 2 === 0 ? 1 : -1);
        const cp1y = fromY + dy * t1 + ny * amp * (i % 2 === 0 ? 1 : -1);
        const endX = fromX + dx * t2;
        const endY = fromY + dy * t2;
        pts += ` Q ${cp1x} ${cp1y} ${endX} ${endY}`;
      }
      d = pts;
    } else if (curveMode === 'spring') {
      const dx = toX - fromX;
      const dy = toY - fromY;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len;
      const ny = dx / len;
      const coils = Math.max(3, Math.round(len / 35));
      const amp = Math.min(18, len * 0.08);
      let pts = `M ${fromX} ${fromY}`;
      for (let i = 1; i <= coils; i++) {
        const t = i / (coils + 1);
        const cx1 = fromX + dx * (t - 0.3 / coils) + nx * amp;
        const cy1 = fromY + dy * (t - 0.3 / coils) + ny * amp;
        const cx2 = fromX + dx * (t + 0.3 / coils) - nx * amp;
        const cy2 = fromY + dy * (t + 0.3 / coils) - ny * amp;
        const ex = fromX + dx * t;
        const ey = fromY + dy * t;
        pts += ` C ${cx1} ${cy1} ${cx2} ${cy2} ${ex} ${ey}`;
      }
      pts += ` L ${toX} ${toY}`;
      d = pts;
    } else if (curveMode === 'loop') {
      const dx = toX - fromX;
      const dy = toY - fromY;
      const len = Math.hypot(dx, dy);
      const nx = -dy / len;
      const ny = dx / len;
      const loopR = Math.min(len * 0.2, 40);
      const midLX = fromX + dx * 0.5 + nx * loopR * 2;
      const midLY = fromY + dy * 0.5 + ny * loopR * 2;
      d = `M ${fromX} ${fromY} Q ${fromX + dx * 0.25 + nx * loopR} ${fromY + dy * 0.25 + ny * loopR} ${midLX} ${midLY} Q ${fromX + dx * 0.75 + nx * loopR} ${fromY + dy * 0.75 + ny * loopR} ${toX} ${toY}`;
    } else if (curveMode === 'sstep') {
      const midY = (fromY + toY) / 2;
      d = `M ${fromX} ${fromY} L ${fromX} ${midY} L ${toX} ${midY} L ${toX} ${toY}`;
    } else if (curveMode === 'hstep') {
      // Horizontal-first step (opposite of sstep)
      const midX2 = (fromX + toX) / 2;
      d = `M ${fromX} ${fromY} L ${midX2} ${fromY} L ${midX2} ${toY} L ${toX} ${toY}`;
    } else if (curveMode === 'arc3') {
      // Triple arc - three small arcs along the path
      const t1x = fromX + (toX - fromX) * 0.33;
      const t1y = fromY + (toY - fromY) * 0.33;
      const t2x = fromX + (toX - fromX) * 0.66;
      const t2y = fromY + (toY - fromY) * 0.66;
      const off = curvature * 0.4;
      const nx = -(toY - fromY) / (dist || 1);
      const ny = (toX - fromX) / (dist || 1);
      d = `M ${fromX} ${fromY} Q ${(fromX+t1x)/2 + nx*off} ${(fromY+t1y)/2 + ny*off} ${t1x} ${t1y} Q ${(t1x+t2x)/2 - nx*off} ${(t1y+t2y)/2 - ny*off} ${t2x} ${t2y} Q ${(t2x+toX)/2 + nx*off} ${(t2y+toY)/2 + ny*off} ${toX} ${toY}`;
    } else if (curveMode === 'organic') {
      // Organic/natural looking path with slight random-seeded offsets
      const seed = (conn.from + conn.to).split('').reduce((a,c) => a + c.charCodeAt(0), 0);
      const off1 = ((seed % 50) - 25) * 0.8;
      const off2 = (((seed * 7) % 50) - 25) * 0.8;
      const q1x = fromX + (toX - fromX) * 0.3 + off1;
      const q1y = fromY + (toY - fromY) * 0.3 - curvature * 0.3 + off2;
      const q2x = fromX + (toX - fromX) * 0.7 - off2;
      const q2y = fromY + (toY - fromY) * 0.7 + curvature * 0.2 + off1;
      d = `M ${fromX} ${fromY} C ${q1x} ${q1y} ${q2x} ${q2y} ${toX} ${toY}`;
    } else if (curveMode === 'elbow') {
      // Right-angle elbow from source side
      const dx = toX - fromX;
      const dy = toY - fromY;
      if (Math.abs(dx) > Math.abs(dy)) {
        d = `M ${fromX} ${fromY} L ${toX} ${fromY} L ${toX} ${toY}`;
      } else {
        d = `M ${fromX} ${fromY} L ${fromX} ${toY} L ${toX} ${toY}`;
      }
    } else {
      const ctrlY = (curveMode === 'down')
        ? (Math.max(fromY, toY) + curvature)
        : (Math.min(fromY, toY) - curvature);
      d = `M ${fromX} ${fromY} Q ${midX} ${ctrlY} ${toX} ${toY}`;
    }

    // Glow filter for this connection
    if (conn.glow) {
      const glowId = `connGlow-${conn.color ? conn.color.replace('#','') : '4ecdc4'}`;
      if (!defs.querySelector(`#${CSS.escape(glowId)}`)) {
        const filter = document.createElementNS('http://www.w3.org/2000/svg', 'filter');
        filter.setAttribute('id', glowId);
        filter.setAttribute('x', '-50%'); filter.setAttribute('y', '-50%');
        filter.setAttribute('width', '200%'); filter.setAttribute('height', '200%');
        filter.innerHTML = `<feGaussianBlur in="SourceGraphic" stdDeviation="4" result="blur"/><feMerge><feMergeNode in="blur"/><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>`;
        defs.appendChild(filter);
      }
    }

    // Wide invisible hit area for easy clicking/drag-select
    const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hit.setAttribute('d', d);
    hit.classList.add('connection-hit');
    hit.setAttribute('data-from', conn.from);
    hit.setAttribute('data-to', conn.to);
    hit.style.cursor = 'pointer';
    hit.style.pointerEvents = 'stroke';
    hit.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      if (e.shiftKey) {
        addConnectionToSelection(conn.from, conn.to);
      } else {
        selectConnection(conn.from, conn.to);
      }
    });

    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    path.classList.add('connection-line');

    const color = conn.color || '#4ecdc4';
    const width = conn.width || 2;
    const style = conn.style || 'solid';
    const arrow = conn.arrow || 'none';

    path.setAttribute('stroke', color);
    path.setAttribute('stroke-width', width);
    path.setAttribute('fill', 'none');

    if (style === 'dashed') path.setAttribute('stroke-dasharray', '8 4');
    else if (style === 'dotted') path.setAttribute('stroke-dasharray', '2 4');
    else if (style === 'dashdot') path.setAttribute('stroke-dasharray', '8 3 2 3');
    else if (style === 'longdash') path.setAttribute('stroke-dasharray', '16 6');
    else if (style === 'morse') path.setAttribute('stroke-dasharray', '12 4 2 4 2 4');
    else if (style === 'chain') path.setAttribute('stroke-dasharray', '6 3 2 3 6 3 2 3');

    // Apply glow filter
    if (conn.glow) {
      const glowId = `connGlow-${color.replace('#','')}`;
      path.setAttribute('filter', `url(#${glowId})`);
    }

    // Marker handling (backwards compatible: end/start/both = arrow)
    const markerArrow = `arrow-${color.replace('#', '')}`;
    const markerDiamond = `diamond-${color.replace('#', '')}`;
    const markerCircle = `circle-${color.replace('#', '')}`;
    const markerSquare = `square-${color.replace('#', '')}`;
    const markerTee = `tee-${color.replace('#', '')}`;
    const markerOpen = `open-${color.replace('#', '')}`;

    const applyMarker = (which, markerId) => {
      if (which === 'end') path.setAttribute('marker-end', `url(#${markerId})`);
      if (which === 'start') path.setAttribute('marker-start', `url(#${markerId})`);
      if (which === 'both') {
        path.setAttribute('marker-end', `url(#${markerId})`);
        path.setAttribute('marker-start', `url(#${markerId})`);
      }
    };

    if (arrow === 'end' || arrow === 'start' || arrow === 'both') {
      applyMarker(arrow, markerArrow);
    } else if (arrow.startsWith('diamond-')) {
      applyMarker(arrow.replace('diamond-',''), markerDiamond);
    } else if (arrow.startsWith('circle-')) {
      applyMarker(arrow.replace('circle-',''), markerCircle);
    } else if (arrow.startsWith('square-')) {
      applyMarker(arrow.replace('square-',''), markerSquare);
    } else if (arrow.startsWith('tee-')) {
      applyMarker(arrow.replace('tee-',''), markerTee);
    } else if (arrow.startsWith('open-')) {
      applyMarker(arrow.replace('open-',''), markerOpen);
    }

    if (selectedCard && (conn.from === selectedCard.id || conn.to === selectedCard.id)) {
      path.classList.add('active');
    }
    const isSelected = (selectedConnection && ((selectedConnection.from === conn.from && selectedConnection.to === conn.to) ||
      (selectedConnection.from === conn.to && selectedConnection.to === conn.from))) ||
      multiSelectedConnections.some(sc => (sc.from === conn.from && sc.to === conn.to) || (sc.from === conn.to && sc.to === conn.from));
    if (isSelected) {
      path.classList.add('selected-connection');
    }

    path.setAttribute('data-from', conn.from);
    path.setAttribute('data-to', conn.to);

    // Add hit path first, then visible path
    svg.appendChild(hit);
    svg.appendChild(path);

    // Double line: render a thinner line on top with background color
    if (style === 'double') {
      const innerPath = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      innerPath.setAttribute('d', d);
      innerPath.setAttribute('stroke', 'var(--bg-dark, #0a0a0a)');
      innerPath.setAttribute('stroke-width', Math.max(1, width - 1.5));
      innerPath.setAttribute('fill', 'none');
      innerPath.setAttribute('pointer-events', 'none');
      svg.appendChild(innerPath);
    }

    // Railroad: crossties perpendicular to path
    if (style === 'railroad') {
      const tieCount = Math.max(3, Math.floor(dist / 20));
      for (let i = 1; i <= tieCount; i++) {
        const t = i / (tieCount + 1);
        const px = fromX + (toX - fromX) * t;
        const py = fromY + (toY - fromY) * t;
        const dx = toX - fromX;
        const dy = toY - fromY;
        const len = Math.hypot(dx, dy);
        const nx = -dy / len * (width + 4);
        const ny = dx / len * (width + 4);
        const tie = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        tie.setAttribute('x1', px + nx);
        tie.setAttribute('y1', py + ny);
        tie.setAttribute('x2', px - nx);
        tie.setAttribute('y2', py - ny);
        tie.setAttribute('stroke', color);
        tie.setAttribute('stroke-width', Math.max(1, width * 0.6));
        tie.setAttribute('pointer-events', 'none');
        svg.appendChild(tie);
      }
    }

    // Energy: animated dashes (CSS animation via class)
    if (style === 'energy') {
      path.setAttribute('stroke-dasharray', '4 8');
      path.classList.add('energy-line');
    }

    // Tapered: thicker at start, thinner at end using gradient
    if (style === 'tapered') {
      const taperId = `taper-${conn.from}-${conn.to}`.replace(/[^a-zA-Z0-9-]/g,'');
      if (!defs.querySelector(`#${CSS.escape(taperId)}`)) {
        const grad = document.createElementNS('http://www.w3.org/2000/svg', 'linearGradient');
        grad.setAttribute('id', taperId);
        grad.setAttribute('gradientUnits', 'userSpaceOnUse');
        grad.setAttribute('x1', fromX); grad.setAttribute('y1', fromY);
        grad.setAttribute('x2', toX); grad.setAttribute('y2', toY);
        grad.innerHTML = `<stop offset="0%" stop-color="${color}" stop-opacity="1"/><stop offset="100%" stop-color="${color}" stop-opacity="0.2"/>`;
        defs.appendChild(grad);
      }
      path.setAttribute('stroke', `url(#${taperId})`);
      path.setAttribute('stroke-width', width * 2.5);
    }

    // Barbed: small perpendicular ticks along the path
    if (style === 'barbed') {
      const barbCount = Math.max(4, Math.floor(dist / 16));
      for (let i = 1; i <= barbCount; i++) {
        const t = i / (barbCount + 1);
        const px = fromX + (toX - fromX) * t;
        const py = fromY + (toY - fromY) * t;
        const dxN = toX - fromX, dyN = toY - fromY;
        const len = Math.hypot(dxN, dyN) || 1;
        const nx = -dyN / len * (width + 3);
        const ny = dxN / len * (width + 3);
        const barb = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        barb.setAttribute('x1', px);
        barb.setAttribute('y1', py);
        barb.setAttribute('x2', px + (i % 2 === 0 ? nx : -nx));
        barb.setAttribute('y2', py + (i % 2 === 0 ? ny : -ny));
        barb.setAttribute('stroke', color);
        barb.setAttribute('stroke-width', Math.max(1, width * 0.5));
        barb.setAttribute('pointer-events', 'none');
        svg.appendChild(barb);
      }
    }

    // Render connection label at midpoint
    if (conn.label) {
      const labelX = (fromX + toX) / 2;
      const labelY = (fromY + toY) / 2;
      // Offset label perpendicular to the line
      const dx = toX - fromX;
      const dy = toY - fromY;
      const len = Math.hypot(dx, dy) || 1;
      const offsetX = -(dy / len) * 14;
      const offsetY = (dx / len) * 14;
      
      // Background rect
      const labelGroup = document.createElementNS('http://www.w3.org/2000/svg', 'g');
      labelGroup.setAttribute('pointer-events', 'none');
      const labelText = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      labelText.setAttribute('x', labelX + offsetX);
      labelText.setAttribute('y', labelY + offsetY);
      labelText.setAttribute('text-anchor', 'middle');
      labelText.setAttribute('dominant-baseline', 'middle');
      labelText.setAttribute('fill', color);
      labelText.setAttribute('font-size', '11');
      labelText.setAttribute('font-family', 'Inter, sans-serif');
      labelText.setAttribute('font-weight', '500');
      labelText.setAttribute('paint-order', 'stroke');
      labelText.setAttribute('stroke', 'var(--bg-dark, #0a0a0a)');
      labelText.setAttribute('stroke-width', '3');
      labelText.setAttribute('stroke-linecap', 'round');
      labelText.setAttribute('stroke-linejoin', 'round');
      labelText.textContent = conn.label;
      labelGroup.appendChild(labelText);
      svg.appendChild(labelGroup);
    }
  });
}

// Connection selection and toolbar
let selectedConnection = null;
let multiSelectedConnections = [];

function setToolbarMode(mode) {
  const toolbar = document.getElementById('boardToolbar');
  if (!toolbar) return;

  const icon = document.getElementById('toolbarIcon');
  const label = document.getElementById('toolbarLabel');
  const status = document.getElementById('toolbarStatus');
  const cardControls = document.getElementById('cardControls');
  const connectionControls = document.getElementById('connectionControls');
  const multiControls = document.getElementById('multiControls');
  const clearBtn = document.getElementById('toolbarClearBtn');

  toolbar.dataset.mode = mode;

  if (mode === 'card') {
    icon.textContent = '◆';
    label.textContent = 'Card';
    status.textContent = 'Editing card properties';
    cardControls.style.display = 'flex';
    connectionControls.style.display = 'none';
    if (multiControls) multiControls.style.display = 'none';
    clearBtn.style.display = 'block';
  } else if (mode === 'connection') {
    icon.textContent = '⟿';
    label.textContent = 'Connection';
    status.textContent = 'Editing connection properties';
    cardControls.style.display = 'none';
    connectionControls.style.display = 'flex';
    if (multiControls) multiControls.style.display = 'none';
    clearBtn.style.display = 'block';
  } else if (mode === 'multi') {
    icon.textContent = '⬡';
    label.textContent = 'Multiple';
    status.textContent = `${multiSelectedCards.size} items selected`;
    cardControls.style.display = 'none';
    connectionControls.style.display = 'none';
    if (multiControls) multiControls.style.display = 'flex';
    clearBtn.style.display = 'block';
  } else {
    icon.textContent = '✦';
    label.textContent = 'Selection';
    status.textContent = 'Select a card or connection to edit';
    cardControls.style.display = 'none';
    connectionControls.style.display = 'none';
    if (multiControls) multiControls.style.display = 'none';
    clearBtn.style.display = 'none';
  }
}

function selectConnection(fromId, toId) {
  deselectAll();
  const board = getCurrentBoard();
  multiSelectedConnections = [];
  selectedConnection = board.connections.find(c =>
    (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId)
  );

  if (selectedConnection) {
    multiSelectedConnections = [selectedConnection];
    setToolbarMode('connection');

    // Populate toolbar with current values
    document.getElementById('connStyleSelect').value = selectedConnection.style || 'solid';
    document.getElementById('connWidthSelect').value = selectedConnection.width || '2';
    document.getElementById('connColorPicker').value = selectedConnection.color || '#4ecdc4';
    document.getElementById('connArrowSelect').value = selectedConnection.arrow || 'none';
    document.getElementById('connCurveSelect').value = selectedConnection.curve || 'up';
    const glowTgl = document.getElementById('connGlowToggle');
    if (glowTgl) glowTgl.checked = !!selectedConnection.glow;
    const labelIn = document.getElementById('connLabelInput');
    if (labelIn) labelIn.value = selectedConnection.label || '';

    renderConnections();
  }
}

function addConnectionToSelection(fromId, toId) {
  const board = getCurrentBoard();
  const conn = board.connections.find(c =>
    (c.from === fromId && c.to === toId) || (c.from === toId && c.to === fromId)
  );
  if (!conn) return;

  // Check if already selected
  const idx = multiSelectedConnections.findIndex(sc =>
    (sc.from === conn.from && sc.to === conn.to) || (sc.from === conn.to && sc.to === conn.from)
  );
  if (idx >= 0) {
    multiSelectedConnections.splice(idx, 1);
    if (multiSelectedConnections.length > 0) {
      selectedConnection = multiSelectedConnections[0];
    } else {
      selectedConnection = null;
      setToolbarMode('none');
      renderConnections();
      return;
    }
  } else {
    multiSelectedConnections.push(conn);
    selectedConnection = conn;
  }

  setToolbarMode('connection');
  const statusEl = document.getElementById('toolbarStatus');
  if (statusEl && multiSelectedConnections.length > 1) {
    statusEl.textContent = `${multiSelectedConnections.length} connections selected`;
  }

  document.getElementById('connStyleSelect').value = selectedConnection.style || 'solid';
  document.getElementById('connWidthSelect').value = selectedConnection.width || '2';
  document.getElementById('connColorPicker').value = selectedConnection.color || '#4ecdc4';
  document.getElementById('connArrowSelect').value = selectedConnection.arrow || 'none';
  document.getElementById('connCurveSelect').value = selectedConnection.curve || 'up';
  const glowTgl2 = document.getElementById('connGlowToggle');
  if (glowTgl2) glowTgl2.checked = !!selectedConnection.glow;
  const labelIn2 = document.getElementById('connLabelInput');
  if (labelIn2) labelIn2.value = selectedConnection.label || '';

  renderConnections();
}

function updateConnectionStyle() {
  if (multiSelectedConnections.length === 0 && !selectedConnection) return;

  const board = getCurrentBoard();
  const style = document.getElementById('connStyleSelect').value;
  const width = parseInt(document.getElementById('connWidthSelect').value, 10);
  const color = document.getElementById('connColorPicker').value;
  const arrow = document.getElementById('connArrowSelect').value;
  const curve = document.getElementById('connCurveSelect').value;
  const glow = document.getElementById('connGlowToggle')?.checked || false;
  const label = document.getElementById('connLabelInput')?.value || '';

  const targets = multiSelectedConnections.length > 0 ? multiSelectedConnections : (selectedConnection ? [selectedConnection] : []);

  targets.forEach(sc => {
    const conn = board.connections.find(c =>
      (c.from === sc.from && c.to === sc.to) || (c.from === sc.to && c.to === sc.from)
    );
    if (conn) {
      conn.style = style;
      conn.width = width;
      conn.color = color;
      conn.arrow = arrow;
      conn.curve = curve;
      conn.glow = glow;
      conn.label = label;
    }
  });

  if (selectedConnection) {
    selectedConnection = board.connections.find(c =>
      (c.from === selectedConnection.from && c.to === selectedConnection.to) ||
      (c.from === selectedConnection.to && c.to === selectedConnection.from)
    );
  }

  renderConnections();
}

function clearToolbarSelection() {
  if (selectedConnection || multiSelectedConnections.length > 0) {
    const board = getCurrentBoard();
    const targets = multiSelectedConnections.length > 0 ? multiSelectedConnections : (selectedConnection ? [selectedConnection] : []);
    targets.forEach(sc => {
      const conn = board?.connections?.find(c =>
        (c.from === sc.from && c.to === sc.to) || (c.from === sc.to && c.to === sc.from)
      );
      if (conn) {
        conn.style = 'solid';
        conn.width = 2;
        conn.color = '#4ecdc4';
        conn.arrow = 'none';
        conn.curve = 'up';
      }
    });
    selectedConnection = null;
    multiSelectedConnections = [];
    renderConnections();
  }

  if (selectedCard) {
    selectedCard.classList.remove('selected');
    selectedCard = null;
  }

  // Clear multi-select
  document.querySelectorAll('.card.multi-selected').forEach(c => c.classList.remove('multi-selected'));
  multiSelectedCards.clear();

  setToolbarMode('none');
}

// Initialize unified toolbar events
document.addEventListener('DOMContentLoaded', () => {
  // Connection controls
  document.getElementById('connStyleSelect')?.addEventListener('change', updateConnectionStyle);
  document.getElementById('connWidthSelect')?.addEventListener('change', updateConnectionStyle);
  document.getElementById('connColorPicker')?.addEventListener('input', updateConnectionStyle);
  document.getElementById('connArrowSelect')?.addEventListener('change', updateConnectionStyle);
  document.getElementById('connCurveSelect')?.addEventListener('change', updateConnectionStyle);
  document.getElementById('connGlowToggle')?.addEventListener('change', updateConnectionStyle);
  document.getElementById('connLabelInput')?.addEventListener('input', updateConnectionStyle);

  // Card controls
  document.getElementById('cardTopAccentPicker')?.addEventListener('input', (e) => {
    if (!selectedCard) return;
    const board = getCurrentBoard();
    const cardData = board.cards.find(c => c.id === selectedCard.id);
    if (cardData) {
      cardData.topColor = e.target.value;
      refreshCard(cardData);
    }
  });

  // Multi-select color controls
  const multiColorHandler = (pickerId, propName) => {
    document.getElementById(pickerId)?.addEventListener('input', (e) => {
      if (multiSelectedCards.size === 0) return;
      const board = getCurrentBoard();
      multiSelectedCards.forEach(cardId => {
        const cardData = board.cards.find(c => c.id === cardId);
        if (cardData) {
          cardData[propName] = e.target.value;
          refreshCard(cardData);
        }
      });
    });
  };
  multiColorHandler('multiTopAccent', 'topColor');
  multiColorHandler('multiTitleColor', 'titleColor');
  multiColorHandler('multiTextColor', 'textColor');
  multiColorHandler('multiBgColor', 'bgColor');

  // Multi-select border/design handlers
  document.getElementById('multiBorderStyle')?.addEventListener('change', (e) => {
    if (e.target.value === '') return;
    const board = getCurrentBoard();
    multiSelectedCards.forEach(cardId => {
      const cd = board.cards.find(c => c.id === cardId);
      if (cd) { cd.borderStyle = e.target.value; refreshCard(cd); }
    });
  });
  document.getElementById('multiDesign')?.addEventListener('change', (e) => {
    if (e.target.value === '') return;
    const board = getCurrentBoard();
    multiSelectedCards.forEach(cardId => {
      const cd = board.cards.find(c => c.id === cardId);
      if (cd) { cd.design = e.target.value === 'default' ? null : e.target.value; refreshCard(cd); }
    });
  });
  document.getElementById('multiHideHeader')?.addEventListener('change', (e) => {
    const board = getCurrentBoard();
    multiSelectedCards.forEach(cardId => {
      const cd = board.cards.find(c => c.id === cardId);
      if (cd) { cd.hideTitle = e.target.checked; refreshCard(cd); }
    });
  });
  document.getElementById('multiHideTags')?.addEventListener('change', (e) => {
    const board = getCurrentBoard();
    multiSelectedCards.forEach(cardId => {
      const cd = board.cards.find(c => c.id === cardId);
      if (cd) { cd.hideTags = e.target.checked; refreshCard(cd); }
    });
  });
  document.getElementById('multiSharpEdge')?.addEventListener('change', (e) => {
    const board = getCurrentBoard();
    multiSelectedCards.forEach(cardId => {
      const cd = board.cards.find(c => c.id === cardId);
      if (cd) { cd.sharpEdge = e.target.checked; refreshCard(cd); }
    });
  });
  document.getElementById('multiFontFamily')?.addEventListener('change', (e) => {
    if (!e.target.value) return;
    const board = getCurrentBoard();
    multiSelectedCards.forEach(cardId => {
      const cd = board.cards.find(c => c.id === cardId);
      if (cd) { cd.fontFamily = e.target.value; refreshCard(cd); }
    });
  });
  document.getElementById('multiFontSize')?.addEventListener('change', (e) => {
    if (!e.target.value) return;
    const board = getCurrentBoard();
    multiSelectedCards.forEach(cardId => {
      const cd = board.cards.find(c => c.id === cardId);
      if (cd) { cd.fontSize = parseInt(e.target.value); refreshCard(cd); }
    });
  });

  // Clear button
  document.getElementById('toolbarClearBtn')?.addEventListener('click', clearToolbarSelection);

  // Toolbar starts in 'none' mode
  setToolbarMode('none');
});

function updateConnectionsList(cardId) {
  const list = document.getElementById('connectionsList');
  list.innerHTML = '';

  const board = getCurrentBoard();
  const cardConnections = board.connections.filter((c) => c.from === cardId || c.to === cardId);

  cardConnections.forEach((conn) => {
    const otherId = conn.from === cardId ? conn.to : conn.from;
    const otherCard = board.cards.find((c) => c.id === otherId);
    if (!otherCard) return;

    const item = document.createElement('div');
    item.className = 'connection-item';
    item.innerHTML = `
      <span class="connection-color" style="background: ${cardColors[otherCard.type] || '#888'}"></span>
      <span class="connection-text">${otherCard.title}</span>
      <button class="connection-remove" data-from="${conn.from}" data-to="${conn.to}">×</button>
    `;

    item.querySelector('.connection-remove').addEventListener('click', (e) => {
      board.connections = board.connections.filter(
        (c) => !(c.from === e.target.dataset.from && c.to === e.target.dataset.to)
      );
      updateConnectionsList(cardId);
      renderConnections();
    });

    list.appendChild(item);
  });
}

// ============================================
// Tools & Zoom
// ============================================
function setTool(tool) {
  currentTool = tool;
  document.querySelectorAll('#boardView .tool-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });

  if (tool === 'text') {
    addCard('text');
    setTool('select');
  }

  if (tool !== 'connect' && connectingFrom) cancelConnection();

  document.getElementById('boardView').classList.toggle('panning', tool === 'pan');
}

function setMapTool(tool) {
  // Viewers can only use select and pan
  if (window.craftMyRole === 'viewer' && tool !== 'map-select' && tool !== 'map-pan') {
    showNotif('You do not have permission to edit this room');
    return;
  }
  if (mapTool === 'map-region' && tool !== 'map-region' && regionDrawing) {
    cancelRegionDrawing();
  }
  if (mapTool === 'map-path' && tool !== 'map-path' && mapPathDrawing) {
    cancelMapPath();
  }
  mapTool = tool;
  document.querySelectorAll('#mapView .tool-btn').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.tool === tool);
  });

  const mapView = document.getElementById('mapView');
  mapView.classList.toggle('panning', tool === 'map-pan');
  mapView.setAttribute('data-tool', tool);
}

function zoomIn() {
  zoom = Math.min(2, zoom + 0.1);
  applyCanvasTransform();
  document.getElementById('zoomLevel').textContent = `${Math.round(zoom * 100)}%`;
}

function zoomOut() {
  zoom = Math.max(0.25, zoom - 0.1);
  applyCanvasTransform();
  document.getElementById('zoomLevel').textContent = `${Math.round(zoom * 100)}%`;
}

function toggleSnap() {
  snapEnabled = !snapEnabled;
  const btn = document.getElementById('snapToggleBtn');
  if (btn) {
    if (snapEnabled) {
      btn.style.opacity = '1';
      btn.style.color = 'var(--gold)';
      btn.style.background = 'rgba(212,168,36,0.15)';
      
    } else {
      btn.style.opacity = '0.5';
      btn.style.color = '';
      btn.style.background = '';
      
    }
  }
}

function snapPosition(x, y, cardId, shiftKey) {
  if (!snapEnabled && !shiftKey) return { x, y, guides: [] };
  const board = getCurrentBoard();
  if (!board) return { x, y, guides: [] };
  let sx = x, sy = y;
  const guides = [];

  if (snapEnabled) {
    // Grid snap
    sx = Math.round(sx / SNAP_GRID) * SNAP_GRID;
    sy = Math.round(sy / SNAP_GRID) * SNAP_GRID;
  }

  if (shiftKey || snapEnabled) {
    // Neighbor alignment snap
    const el = document.getElementById(cardId);
    const w = el ? el.offsetWidth : 200;
    const h = el ? el.offsetHeight : 100;
    let bestDx = SNAP_THRESHOLD + 1, bestDy = SNAP_THRESHOLD + 1;
    let guideX = null, guideY = null;
    board.cards.forEach(c => {
      if (c.id === cardId) return;
      const cel = document.getElementById(c.id);
      const cw = cel ? cel.offsetWidth : (c.width || 200);
      const ch = cel ? cel.offsetHeight : 100;
      // Left edge alignment
      const dl = Math.abs(x - c.x); if (dl < Math.abs(bestDx)) { bestDx = x - c.x; guideX = c.x; }
      // Right edge alignment
      const dr = Math.abs((x + w) - (c.x + cw)); if (dr < Math.abs(bestDx)) { bestDx = (x + w) - (c.x + cw); guideX = c.x + cw; }
      // Top alignment
      const dt = Math.abs(y - c.y); if (dt < Math.abs(bestDy)) { bestDy = y - c.y; guideY = c.y; }
      // Bottom alignment
      const db = Math.abs((y + h) - (c.y + ch)); if (db < Math.abs(bestDy)) { bestDy = (y + h) - (c.y + ch); guideY = c.y + ch; }
      // Center X
      const dcx = Math.abs((x + w/2) - (c.x + cw/2)); if (dcx < Math.abs(bestDx)) { bestDx = (x + w/2) - (c.x + cw/2); guideX = c.x + cw/2; }
      // Center Y
      const dcy = Math.abs((y + h/2) - (c.y + ch/2)); if (dcy < Math.abs(bestDy)) { bestDy = (y + h/2) - (c.y + ch/2); guideY = c.y + ch/2; }
    });
    if (Math.abs(bestDx) <= SNAP_THRESHOLD) { sx = x - bestDx; if (guideX !== null) guides.push({ axis: 'x', pos: guideX }); }
    if (Math.abs(bestDy) <= SNAP_THRESHOLD) { sy = y - bestDy; if (guideY !== null) guides.push({ axis: 'y', pos: guideY }); }
  }

  return { x: sx, y: sy, guides };
}

function renderAlignmentGuides(guides) {
  clearAlignmentGuides();
  if (!guides || !guides.length) return;
  const canvas = document.getElementById('canvas');
  if (!canvas) return;
  guides.forEach(g => {
    const line = document.createElement('div');
    line.className = 'alignment-guide-line';
    if (g.axis === 'x') {
      line.style.cssText = `position:absolute;left:${g.pos}px;top:0;width:1px;height:100%;background:rgba(78,205,196,0.5);pointer-events:none;z-index:9999;`;
    } else {
      line.style.cssText = `position:absolute;top:${g.pos}px;left:0;height:1px;width:100%;background:rgba(78,205,196,0.5);pointer-events:none;z-index:9999;`;
    }
    canvas.appendChild(line);
  });
}

function clearAlignmentGuides() {
  document.querySelectorAll('.alignment-guide-line').forEach(el => el.remove());
}

function zoomFit() {
  const board = getCurrentBoard();
  if (!board || !board.cards.length) {
    zoom = 1; panOffset = { x: 0, y: 0 };
    applyCanvasTransform();
    document.getElementById('zoomLevel').textContent = '100%';
    return;
  }
  // Calculate bounding box of all cards
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  board.cards.forEach(c => {
    const el = document.getElementById(c.id);
    const w = el ? el.offsetWidth : (c.width || 220);
    const h = el ? el.offsetHeight : 120;
    if (c.x < minX) minX = c.x;
    if (c.y < minY) minY = c.y;
    if (c.x + w > maxX) maxX = c.x + w;
    if (c.y + h > maxY) maxY = c.y + h;
  });
  const pad = 180;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const bw = maxX - minX;
  const bh = maxY - minY;
  const container = document.getElementById('boardView');
  const cw = container.clientWidth;
  const ch = container.clientHeight;
  zoom = Math.min(cw / bw, ch / bh, 2);
  panOffset = {
    x: (cw - bw * zoom) / 2 - minX * zoom,
    y: (ch - bh * zoom) / 2 - minY * zoom
  };
  applyCanvasTransform();
  document.getElementById('zoomLevel').textContent = `${Math.round(zoom * 100)}%`;
}

// ============================================
// Dice Roller
// ============================================
function openDiceModal() {
  document.getElementById('diceModal').classList.remove('hidden');
}

function closeDiceModal() {
  document.getElementById('diceModal').classList.add('hidden');
}

function rollDice(diceType) {
  const sides = parseInt(diceType.replace('d', ''));
  const result = Math.floor(Math.random() * sides) + 1;
  lastDiceResult = { dice: diceType, result, formula: `1${diceType}` };
  displayDiceResult(lastDiceResult);
  addToHistory(lastDiceResult);
}

function rollCustomDice() {
  const input = document.getElementById('customDice').value.trim();
  if (!input) return;

  const result = parseAndRoll(input);
  if (result !== null) {
    lastDiceResult = { dice: input, result, formula: input };
    displayDiceResult(lastDiceResult);
    addToHistory(lastDiceResult);
  }
}

function parseAndRoll(formula) {
  const match = formula.match(/^(\d*)d(\d+)([+-]\d+)?$/i);
  if (!match) return null;

  const count = parseInt(match[1]) || 1;
  const sides = parseInt(match[2]);
  const modifier = parseInt(match[3]) || 0;

  let total = modifier;
  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }
  return total;
}

function displayDiceResult(rollData) {
  document.getElementById('diceResultValue').textContent = rollData.result;
  document.getElementById('insertDiceResult').disabled = false;
}

function addToHistory(rollData) {
  diceHistory.unshift(rollData);
  if (diceHistory.length > 10) diceHistory.pop();

  document.getElementById('diceHistory').innerHTML = diceHistory
    .map((roll, i) => `<div class="dice-history-item"><span class="dice-history-roll"><span>${roll.formula}</span><span class="dice-history-val">${roll.result}</span></span><button class="dice-history-insert" title="Insert into text" onclick="insertHistoryResult(${i})">Insert</button></div>`)
    .join('');
}

function insertHistoryResult(index) {
  const roll = diceHistory[index];
  if (!roll) return;
  lastDiceResult = roll;
  insertDiceResult();
}

function insertDiceResult() {
  if (!lastDiceResult) return;

  if (currentView === 'write') {
    const editor = document.getElementById('writeEditor');
    editor.focus();
    // Insert as an inline visual badge
    const badge = `<span class="dice-badge" contenteditable="false" data-formula="${lastDiceResult.formula}"><span class="dice-icon">🎲</span><span class="dice-formula">${lastDiceResult.formula}</span><span class="dice-value">${lastDiceResult.result}</span></span>&nbsp;`;
    document.execCommand('insertHTML', false, badge);
    saveCurrentChapter();
  } else if (selectedCard) {
    const descEl = document.getElementById('detailDescription');
    const start = descEl.selectionStart;
    const end = descEl.selectionEnd;
    // For card descriptions (plain text), use a compact visual format
    const text = `⚄ ${lastDiceResult.formula} → ${lastDiceResult.result}`;
    descEl.value = descEl.value.substring(0, start) + text + descEl.value.substring(end);
    descEl.focus();
    descEl.selectionStart = descEl.selectionEnd = start + text.length;
    updateSelectedCard();
  }

  closeDiceModal();
}

// ============================================
// Rich Text Editor
// ============================================
function execFormatCommand(command) {
  const editor = document.getElementById('writeEditor');
  editor.focus();

  // Check if an image is selected or cursor is near an image
  const selection = window.getSelection();
  if (selection.rangeCount > 0) {
    const range = selection.getRangeAt(0);
    const container = range.commonAncestorContainer;

    // Check for image wrapper nearby
    let imageWrapper = null;
    if (container.nodeType === Node.ELEMENT_NODE) {
      imageWrapper = container.closest('.editor-image-wrapper');
    } else if (container.parentElement) {
      imageWrapper = container.parentElement.closest('.editor-image-wrapper');
    }

    // Handle alignment commands for images
    if (imageWrapper && ['justifyLeft', 'justifyCenter', 'justifyRight'].includes(command)) {
      imageWrapper.classList.remove('align-left', 'align-center', 'align-right');
      if (command === 'justifyLeft') {
        imageWrapper.classList.add('align-left');
      } else if (command === 'justifyCenter') {
        imageWrapper.classList.add('align-center');
      } else if (command === 'justifyRight') {
        imageWrapper.classList.add('align-right');
      }
      saveCurrentChapter();
      return;
    }
  }

  if (['h1', 'h2', 'h3'].includes(command)) {
    document.execCommand('formatBlock', false, command.toUpperCase());
  } else if (command === 'blockquote') {
    document.execCommand('formatBlock', false, 'blockquote');
  } else {
    document.execCommand(command, false, null);
  }

  saveCurrentChapter();
}

function updateWordCount() {
  const text = document.getElementById('writeEditor').textContent;
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  document.getElementById('wordCount').textContent = `${words.toLocaleString()} words`;

  document.getElementById('saveStatus').textContent = 'Saving...';
  setTimeout(() => {
    document.getElementById('saveStatus').textContent = 'Saved';
    saveCurrentChapter();
    renderChaptersList();
  }, 500);
}

// ============================================
// Status Bar
// ============================================
function showNotif(msg) {
  // Brief on-screen notification toast
  let toast = document.getElementById('notifToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'notifToast';
    toast.style.cssText = 'position:fixed;bottom:24px;left:50%;transform:translateX(-50%);background:rgba(10,8,6,0.92);color:#f5ede0;padding:8px 20px;border-radius:8px;font-size:13px;z-index:10000;pointer-events:none;opacity:0;transition:opacity 0.3s ease;border:1px solid rgba(212,168,36,0.3);box-shadow:0 4px 16px rgba(0,0,0,0.5);';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => { toast.style.opacity = '0'; }, 1800);
}

function updateStatusBar() {
  const board = getCurrentBoard();
  const sb = document.getElementById('statusBoard');
  const sc = document.getElementById('statusCards');
  if (sb) sb.textContent = `Board: ${board ? board.name : 'None'}`;
  if (sc) sc.textContent = `${board ? board.cards.length : 0} cards`;
}

function updateMapStatusBar() {
  const map = getCurrentMap();
  const sb = document.getElementById('statusBoard');
  const sc = document.getElementById('statusCards');
  if (sb) sb.textContent = `Map: ${map ? map.name : 'None'}`;
  if (sc) sc.textContent = `${map ? map.pins.length : 0} pins`;
}

// ============================================
// Keyboard
// ============================================
function handleKeyboard(e) {
  // Ctrl+/ or Cmd+/ opens search
  if ((e.ctrlKey || e.metaKey) && e.key === '/') { e.preventDefault(); openSearch(); return; }

  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;

  // Ctrl/Cmd shortcuts
  if (e.ctrlKey || e.metaKey) {
    if (e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    if (e.key === 'z' && e.shiftKey) { e.preventDefault(); redo(); return; }
    if (e.key === 'y') { e.preventDefault(); redo(); return; }
    if (e.key === 'c') { e.preventDefault(); copySelected(); return; }
    if (e.key === 'v') { e.preventDefault(); pasteCards(); return; }
    if (e.key === 'd' && selectedCard) { e.preventDefault(); duplicateCard(selectedCard.id); return; }
    if (e.key === 'a' && currentView === 'board') {
      e.preventDefault();
      const board = getCurrentBoard();
      if (board) {
        multiSelectedCards.clear();
        board.cards.forEach(c => { multiSelectedCards.add(c.id); document.getElementById(c.id)?.classList.add('multi-selected'); });
        setToolbarMode('multi');
      }
      return;
    }
    return;
  }

  switch (e.key) {
    case 'Delete':
    case 'Backspace':
      if (currentView === 'board' && (multiSelectedCards.size > 0 || multiSelectedConnections.length > 0)) {
        e.preventDefault();
        const cardCount = multiSelectedCards.size;
        const connCount = multiSelectedConnections.length;
        const parts = [];
        if (cardCount > 0) parts.push(cardCount + ' card' + (cardCount > 1 ? 's' : ''));
        if (connCount > 0) parts.push(connCount + ' connection' + (connCount > 1 ? 's' : ''));
        siteConfirm('Delete Items', 'Delete ' + parts.join(' and ') + '? This can be undone with Ctrl+Z.', 'Delete', true).then(ok => {
          if (!ok) return;
          saveUndoState();
          const cardIds = [...multiSelectedCards];
          const conns = [...multiSelectedConnections];
          multiSelectedCards.clear();
          multiSelectedConnections = [];
          cardIds.forEach(cardId => deleteCard(cardId));
          if (conns.length > 0) {
            const board = getCurrentBoard();
            if (board) {
              conns.forEach(mc => {
                board.connections = board.connections.filter(c => !(c.from === mc.from && c.to === mc.to));
              });
              renderConnections();
            }
          }
          setToolbarMode('none');
          showNotif('Deleted ' + parts.join(' and '));
        });
      } else if (currentView === 'board' && selectedCard) {
        saveUndoState();
        deleteCard(selectedCard.id);
      } else if (currentView === 'map' && selectedPin) {
        const currentMap = getCurrentMap();
        if (currentMap) {
          saveUndoState();
          currentMap.pins = currentMap.pins.filter((p) => p.id !== selectedPin);
          selectedPin = null;
          renderPins();
          renderPinsList();
          renderTagsCloud();
          updateMapStatusBar();
          deselectPin();
        }
      } else if (currentView === 'map' && selectedMapPath) {
        e.preventDefault();
        deleteSelectedMapPath();
      }
      break;
    case 'Escape':
      if (multiviewActive) { closeMultiview(); break; }
      connectingFrom ? cancelConnection() : deselectAll();
      closeContextMenu();
      closePopup();
      closeImageModal();
      closeMapUploadModal();
      closePinEditorModal();
      closeMapEditorModal();
      closeTagFinder();
      closeWikiLinkModal();
      closeLinkModal();
      closeTableModal();
      closeDiceModal();
      clearMeasurement();
      cancelRegionDrawing();
      cancelMapPath();
      document.getElementById('regionContextMenu')?.classList.add('hidden');
      break;
    case 'Enter':
      if (regionDrawing && regionDrawing.points.length >= 3) {
        finishRegionDrawing();
      }
      if (mapPathDrawing && mapPathDrawing.points.length >= 2) {
        finishMapPath();
      }
      break;
    case 'v':
      if (currentView === 'board') setTool('select');
      else if (currentView === 'map') setMapTool('map-select');
      break;
    case 'c':
      if (currentView === 'board') setTool('connect');
      break;
    case 'g':
      if (currentView === 'board') toggleSnap();
      break;
    case 'h':
      if (currentView === 'board') setTool('pan');
      else if (currentView === 'map') setMapTool('map-pan');
      break;
    case 'p':
      if (currentView === 'map') setMapTool('map-pin');
      break;
    case 'm':
      if (currentView === 'map') setMapTool('map-measure');
      break;
    case 'd':
      if (currentView === 'map') setMapTool('map-destination');
      break;
    case 'r':
      if (currentView === 'map') setMapTool('map-region');
      break;
    case 'f':
      if (currentView === 'map') setMapTool('map-path');
      break;
    case 't':
      if (currentView === 'board') setTool('text');
      break;
  }
}

// ============================================
// Undo / Redo
// ============================================
function saveUndoState() {
  if (currentView === 'board') {
    const board = getCurrentBoard();
    if (!board) return;
    undoStacks.board.push(JSON.stringify({ cards: board.cards, connections: board.connections }));
    if (undoStacks.board.length > MAX_UNDO) undoStacks.board.shift();
    redoStacks.board = [];
  } else if (currentView === 'map') {
    saveMapUndoState();
  }
}

function undo() {
  if (currentView === 'board') {
    if (undoStacks.board.length === 0) { showNotif('Nothing to undo'); return; }
    const board = getCurrentBoard(); if (!board) return;
    redoStacks.board.push(JSON.stringify({ cards: board.cards, connections: board.connections }));
    const state = JSON.parse(undoStacks.board.pop());
    board.cards = state.cards; board.connections = state.connections;
    rebuildBoard(); showNotif('Undo');
  } else if (currentView === 'map') {
    if (undoStacks.map.length === 0) { showNotif('Nothing to undo'); return; }
    const map = getCurrentMap(); if (!map) return;
    redoStacks.map.push(JSON.stringify({ pins: map.pins, regions: map.regions || [] }));
    const state = JSON.parse(undoStacks.map.pop());
    map.pins = state.pins;
    map.regions = state.regions || [];
    renderPins(); renderPinsList(); renderRegions(); removeRegionEditHandles(); showNotif('Undo');
  } else {
    showNotif('Nothing to undo');
  }
}

function redo() {
  if (currentView === 'board') {
    if (redoStacks.board.length === 0) { showNotif('Nothing to redo'); return; }
    const board = getCurrentBoard(); if (!board) return;
    undoStacks.board.push(JSON.stringify({ cards: board.cards, connections: board.connections }));
    const state = JSON.parse(redoStacks.board.pop());
    board.cards = state.cards; board.connections = state.connections;
    rebuildBoard(); showNotif('Redo');
  } else if (currentView === 'map') {
    if (redoStacks.map.length === 0) { showNotif('Nothing to redo'); return; }
    const map = getCurrentMap(); if (!map) return;
    undoStacks.map.push(JSON.stringify({ pins: map.pins, regions: map.regions || [] }));
    const state = JSON.parse(redoStacks.map.pop());
    map.pins = state.pins;
    map.regions = state.regions || [];
    renderPins(); renderPinsList(); renderRegions(); removeRegionEditHandles(); showNotif('Redo');
  } else {
    showNotif('Nothing to redo');
  }
}

function rebuildBoard() {
  const canvas = document.getElementById('canvas');
  canvas.querySelectorAll('.card').forEach(el => el.remove());
  const board = getCurrentBoard();
  if (!board) return;
  board.cards.forEach(c => createCardElement(c));
  renderConnections();
  selectedCard = null;
  multiSelectedCards.clear();
  setToolbarMode('none');
  updateStatusBar();
}

// ============================================
// Copy / Paste
// ============================================
function copySelected() {
  if (currentView !== 'board') return;
  if (multiSelectedCards.size > 0) {
    const board = getCurrentBoard();
    cardClipboard = board.cards.filter(c => multiSelectedCards.has(c.id)).map(c => JSON.parse(JSON.stringify(c)));
    showNotif(`Copied ${cardClipboard.length} card(s)`);
  } else if (selectedCard) {
    const board = getCurrentBoard();
    const cd = board.cards.find(c => c.id === selectedCard.id);
    if (cd) { cardClipboard = [JSON.parse(JSON.stringify(cd))]; showNotif('Card copied'); }
  }
}

function pasteCards() {
  if (currentView !== 'board' || !cardClipboard || cardClipboard.length === 0) return;
  saveUndoState();
  const board = getCurrentBoard();
  const offset = 40;
  cardClipboard.forEach(original => {
    const newCard = { ...JSON.parse(JSON.stringify(original)), id: `card-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`, x: original.x + offset, y: original.y + offset };
    board.cards.push(newCard);
    createCardElement(newCard);
  });
  updateStatusBar();
  showNotif(`Pasted ${cardClipboard.length} card(s)`);
}

function duplicateCard(cardId) {
  const board = getCurrentBoard();
  const original = board.cards.find((c) => c.id === cardId);
  if (!original) return;
  saveUndoState();

  const newCard = {
    ...JSON.parse(JSON.stringify(original)),
    id: `card-${Date.now()}`,
    x: original.x + 30,
    y: original.y + 30,
  };
  board.cards.push(newCard);
  createCardElement(newCard);
  updateStatusBar();
}

// ============================================
// Map Editor Modal
// ============================================
function openMapEditorModal(mapId) {
  const map = maps.find(m => m.id === mapId);
  if (!map) return;

  editingMapId = mapId;
  document.getElementById('mapEditorTitle').textContent = 'Edit Map';
  document.getElementById('mapEditorName').value = map.name || '';

  // Set scale values
  const scale = map.scale || { pixels: 100, distance: 1, unit: 'miles' };
  document.getElementById('mapScalePixels').value = scale.pixels;
  document.getElementById('mapScaleDistance').value = scale.distance;
  document.getElementById('mapScaleUnit').value = scale.unit;

  // Show image preview
  const previewImg = document.getElementById('mapEditorPreviewImg');
  if (map.imageUrl) {
    previewImg.src = map.imageUrl;
    previewImg.classList.remove('hidden');
  } else {
    previewImg.src = '';
    previewImg.classList.add('hidden');
  }

  document.getElementById('mapEditorModal').classList.remove('hidden');
}

function closeMapEditorModal() {
  document.getElementById('mapEditorModal').classList.add('hidden');
  editingMapId = null;
}

let pendingMapEditorFile = null;
function handleMapEditorFileSelect(e) {
  const file = e.target.files[0];
  if (!file || !file.type.startsWith('image/')) return;
  pendingMapEditorFile = file;

  const reader = new FileReader();
  reader.onload = (event) => {
    const previewImg = document.getElementById('mapEditorPreviewImg');
    previewImg.src = event.target.result;
    previewImg.classList.remove('hidden');
    previewImg.dataset.newImage = 'pending';
  };
  reader.readAsDataURL(file);
}

function saveMapChanges() {
  if (!editingMapId) return;

  const map = maps.find(m => m.id === editingMapId);
  if (!map) return;

  map.name = document.getElementById('mapEditorName').value || 'Unnamed Map';

  // Save scale settings
  map.scale = {
    pixels: parseInt(document.getElementById('mapScalePixels').value) || 100,
    distance: parseFloat(document.getElementById('mapScaleDistance').value) || 1,
    unit: document.getElementById('mapScaleUnit').value || 'miles'
  };

  // Check if there's a new image
  const previewImg = document.getElementById('mapEditorPreviewImg');
  if (previewImg.dataset.newImage && pendingMapEditorFile && window.craftUploadImage) {
    showNotif('Uploading image...');
    window.craftUploadImage(pendingMapEditorFile)
      .then(url => { map.imageUrl = url; renderMapsList(); updateMapView(); updateMapStatusBar(); showNotif('Map image uploaded'); })
      .catch(err => { console.error('Upload failed:', err); showNotif('Upload failed'); });
    delete previewImg.dataset.newImage;
    pendingMapEditorFile = null;
  } else if (previewImg.dataset.newImage && previewImg.dataset.newImage !== 'pending') {
    map.imageUrl = previewImg.dataset.newImage;
    delete previewImg.dataset.newImage;
  }
  pendingMapEditorFile = null;

  renderMapsList();
  updateMapView();
  updateMapStatusBar();
  closeMapEditorModal();
}

function deleteCurrentMap() {
  if (!editingMapId) return;

  if (maps.length <= 1) {
    alert('Cannot delete the last map');
    return;
  }

  deleteMap(editingMapId);
  closeMapEditorModal();
}

// ============================================
// Tags Cloud & Tag Finder
// ============================================
function renderTagsCloud() {
  const cloud = document.getElementById('tagsCloud');
  const currentMap = getCurrentMap();

  if (!currentMap) {
    cloud.innerHTML = '<div class="empty-tags-message">Add tags to pins or regions to see them here</div>';
    return;
  }

  // Collect tags from pins and regions on current map
  const tagCounts = {};
  currentMap.pins.forEach(pin => {
    (pin.tags || []).forEach(tag => {
      const t = tag.toLowerCase();
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });
  (currentMap.regions || []).forEach(reg => {
    (reg.tags || []).forEach(tag => {
      const t = tag.toLowerCase();
      tagCounts[t] = (tagCounts[t] || 0) + 1;
    });
  });

  const tags = Object.keys(tagCounts).sort();

  if (tags.length === 0) {
    cloud.innerHTML = '<div class="empty-tags-message">Add tags to pins or regions to see them here</div>';
    return;
  }

  cloud.innerHTML = tags.map(tag =>
    `<span class="tag-cloud-item" onclick="openTagFinder('${tag.replace(/'/g, "\\'")}','map')">${tag} <span class="tag-count">${tagCounts[tag]}</span></span>`
  ).join('');
}

function openTagFinder(tag, scope) {
  const panel = document.getElementById('tagFinderPanel');
  const resultsEl = document.getElementById('tagFinderResults');

  document.getElementById('tagFinderName').textContent = tag;

  const results = [];
  const hasTag = (tags) => {
    if (!tags) return false;
    if (Array.isArray(tags)) return tags.some(t => t.toLowerCase() === tag.toLowerCase());
    return String(tags).split(',').map(t => t.trim().toLowerCase()).includes(tag.toLowerCase());
  };

  // When scope is 'map', only search current map pins and regions
  if (scope === 'map') {
    const currentMap = getCurrentMap();
    if (currentMap) {
      (currentMap.pins || []).forEach(pin => {
        if (hasTag(pin.tags)) {
          results.push({
            type: 'pin', id: pin.id, name: pin.name, color: pin.color,
            mapId: currentMap.id, meta: '📍 ' + currentMap.name,
            action: () => { navigateToPin(currentMap.id, pin.id); }
          });
        }
      });
      (currentMap.regions || []).forEach(reg => {
        if (hasTag(reg.tags)) {
          results.push({
            type: 'region', id: reg.id, name: reg.name || 'Unnamed Region',
            color: reg.fillColor, meta: '🗺️ Region',
            action: () => { selectRegion(reg.id); }
          });
        }
      });
    }
  } else {

  // Search pins in all maps (current map first)
  maps.forEach(map => {
    (map.pins || []).forEach(pin => {
      if (hasTag(pin.tags)) {
        results.push({
          type: 'pin', id: pin.id, name: pin.name, color: pin.color,
          mapId: map.id, meta: '📍 ' + map.name,
          action: () => { navigateToPin(map.id, pin.id); }
        });
      }
    });
  });

  // Search cards in all boards
  boards.forEach(board => {
    (board.cards || []).forEach(card => {
      if (hasTag(card.tags)) {
        results.push({
          type: 'card', id: card.id, name: card.title || 'Untitled',
          color: cardColors[card.type] || '#888',
          meta: '📋 ' + board.name,
          action: () => { navigateToView('board'); setTimeout(() => { selectBoard(board.id); setTimeout(() => { const el = document.querySelector(`.card[data-id="${card.id}"]`); if(el){el.click();el.scrollIntoView({behavior:'smooth',block:'center'});} }, 100); }, 50); }
        });
      }
    });
  });

  // Search chapters
  chapters.forEach(ch => {
    if (hasTag(ch.tags)) {
      results.push({
        type: 'chapter', id: ch.id, name: ch.title || 'Untitled',
        color: '#a78bfa', meta: '📖 Chapter',
        action: () => { navigateToView('write'); setTimeout(() => selectChapter(ch.id), 50); }
      });
    }
  });

  // Search timelines & events
  timelines.forEach(tl => {
    if (hasTag(tl.tags)) {
      results.push({
        type: 'timeline', id: tl.id, name: tl.name,
        color: tl.color, meta: '⏳ Timeline',
        action: () => { navigateToView('timeline'); setTimeout(() => selectTimeline(tl.id), 50); }
      });
    }
    (tl.events || []).forEach(evt => {
      if (hasTag(evt.tags)) {
        results.push({
          type: 'event', id: evt.id, name: evt.title,
          color: evt.color, meta: '📅 ' + tl.name,
          action: () => { navigateToView('timeline'); setTimeout(() => { selectTimeline(tl.id); setTimeout(() => selectTlEvent(evt.id, tl.id), 100); }, 50); }
        });
      }
    });
  });

  // Search factions
  factions.forEach(f => {
    if (hasTag(f.tags)) {
      results.push({
        type: 'faction', id: f.id, name: f.name,
        color: f.color, meta: '⚔️ Faction',
        action: () => { navigateToView('factions'); setTimeout(() => { switchFacTab('factions'); selectedFactionId = f.id; renderFactionGrid(); renderFactionsSidebar(); showFacDetail(); }, 50); }
      });
    }
  });

  // Search contacts
  contacts.forEach(c => {
    if (hasTag(c.tags)) {
      const fac = factions.find(f => f.id === c.factionId);
      results.push({
        type: 'contact', id: c.id, name: c.name,
        color: fac ? fac.color : '#666', meta: '👤 Contact',
        action: () => { navigateToView('factions'); setTimeout(() => { switchFacTab('contacts'); selectedContactId = c.id; renderContactsGrid(); renderContactsSidebar(); showContactDetail(); }, 50); }
      });
    }
  });

  // Search organizations
  organizations.forEach(o => {
    if (hasTag(o.tags)) {
      results.push({
        type: 'org', id: o.id, name: o.name,
        color: o.color, meta: '🏛️ Organization',
        action: () => { navigateToView('factions'); setTimeout(() => { switchFacTab('orgs'); selectedOrgId = o.id; renderOrgsGrid(); renderOrgsSidebar(); showOrgDetail(); }, 50); }
      });
    }
  });

  // Search regions
  maps.forEach(map => {
    (map.regions || []).forEach(reg => {
      if (hasTag(reg.tags)) {
        results.push({
          type: 'region', id: reg.id, name: reg.name || 'Unnamed Region',
          color: reg.fillColor, meta: '🗺️ ' + map.name,
          action: () => { navigateToView('map'); setTimeout(() => { selectMap(map.id); setTimeout(() => selectRegion(reg.id), 100); }, 50); }
        });
      }
    });
  });

  } // end else (non-map scope)

  if (results.length === 0) {
    resultsEl.innerHTML = '<div class="tag-finder-empty">No items found with this tag</div>';
  } else {
    window._tagFinderActions = results;
    resultsEl.innerHTML = results.map((item, idx) => `
      <div class="tag-finder-item" onclick="window._tagFinderActions[${idx}].action()">
        <span class="tag-finder-icon pin-icon" style="background: ${item.color}"></span>
        <div class="tag-finder-info">
          <span class="tag-finder-name">${item.name}</span>
          <span class="tag-finder-location">${item.meta}</span>
        </div>
      </div>
    `).join('');
  }

  panel.classList.remove('hidden');
}

function closeTagFinder() {
  document.getElementById('tagFinderPanel').classList.add('hidden');
}

function navigateToPin(mapId, pinId) {
  // Switch to map view first
  switchView('map');

  // Switch to the correct map if needed
  if (currentMapId !== mapId) {
    selectMap(mapId);
  }

  // Select the pin
  setTimeout(() => {
    selectPin(pinId);

    // Pan to the pin
    const map = getCurrentMap();
    const pin = map.pins.find(p => p.id === pinId);
    if (pin) {
      const mapCanvas = document.getElementById('mapCanvas');
      const rect = mapCanvas.getBoundingClientRect();
      const mapImg = document.getElementById('mapImage');

      // Calculate position to center the pin
      const pinX = (pin.x / 100) * mapImg.naturalWidth * mapZoom;
      const pinY = (pin.y / 100) * mapImg.naturalHeight * mapZoom;

      mapPanOffset.x = rect.width / 2 - pinX;
      mapPanOffset.y = rect.height / 2 - pinY;

      applyMapTransform();
    }
  }, 100);

  closeTagFinder();
}

// ============================================
// Distance Measurement
// ============================================
function startMeasurementFromPin(pin) {
  const map = getCurrentMap();
  if (!map || !map.imageUrl) return;

  const mapImg = document.getElementById('mapImage');

  measurementStart = {
    x: (pin.x / 100) * mapImg.naturalWidth,
    y: (pin.y / 100) * mapImg.naturalHeight,
    pinId: pin.id
  };
  measurementEnd = null;
  isMeasuring = true;

  setMapTool('map-measure');
  updateMeasurementDisplay();

  // Show visual feedback
  document.getElementById('measurementDisplay').classList.remove('hidden');
  document.getElementById('measurementValue').textContent = 'Click another point or pin';
}

function handleMeasurementClick(x, y) {
  const map = getCurrentMap();
  if (!map || !map.imageUrl) return;

  const mapImg = document.getElementById('mapImage');
  const mapCanvas = document.getElementById('mapCanvas');
  const rect = mapCanvas.getBoundingClientRect();
  const wrapper = document.getElementById('mapImageWrapper');

  // Calculate actual position on the map image
  const actualX = (x - rect.left - mapPanOffset.x) / mapZoom;
  const actualY = (y - rect.top - mapPanOffset.y) / mapZoom;

  if (!measurementStart) {
    measurementStart = { x: actualX, y: actualY };
    document.getElementById('measurementDisplay').classList.remove('hidden');
    document.getElementById('measurementValue').textContent = 'Click another point';
  } else if (!measurementEnd) {
    measurementEnd = { x: actualX, y: actualY };
    updateMeasurementLine();
    calculateAndDisplayDistance();
  } else {
    // Reset and start new measurement
    measurementStart = { x: actualX, y: actualY };
    measurementEnd = null;
    document.getElementById('measurementValue').textContent = 'Click another point';
    hideMeasurementLine();
  }
}

function updateMeasurementLine() {
  if (!measurementStart || !measurementEnd) {
    hideMeasurementLine();
    return;
  }

  const mapCanvas = document.getElementById('mapCanvas');
  const rect = mapCanvas.getBoundingClientRect();

  // Convert to screen coordinates
  const x1 = measurementStart.x * mapZoom + mapPanOffset.x;
  const y1 = measurementStart.y * mapZoom + mapPanOffset.y;
  const x2 = measurementEnd.x * mapZoom + mapPanOffset.x;
  const y2 = measurementEnd.y * mapZoom + mapPanOffset.y;

  const line = document.getElementById('measurementLine');
  const pointA = document.getElementById('measurePointA');
  const pointB = document.getElementById('measurePointB');

  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);

  pointA.setAttribute('cx', x1);
  pointA.setAttribute('cy', y1);
  pointB.setAttribute('cx', x2);
  pointB.setAttribute('cy', y2);
  pointB.style.display = '';

  document.getElementById('measurementLayer').classList.remove('hidden');
}

function updateMeasurementPreview(clientX, clientY) {
  if (!measurementStart) return;

  const mapCanvas = document.getElementById('mapCanvas');
  const rect = mapCanvas.getBoundingClientRect();

  const x1 = measurementStart.x * mapZoom + mapPanOffset.x;
  const y1 = measurementStart.y * mapZoom + mapPanOffset.y;
  const x2 = clientX - rect.left;
  const y2 = clientY - rect.top;

  const line = document.getElementById('measurementLine');
  const pointA = document.getElementById('measurePointA');
  const pointB = document.getElementById('measurePointB');

  line.setAttribute('x1', x1);
  line.setAttribute('y1', y1);
  line.setAttribute('x2', x2);
  line.setAttribute('y2', y2);

  pointA.setAttribute('cx', x1);
  pointA.setAttribute('cy', y1);
  pointB.setAttribute('cx', x2);
  pointB.setAttribute('cy', y2);
  pointB.style.display = 'none'; // Hide end point during preview

  document.getElementById('measurementLayer').classList.remove('hidden');

  // Show live distance preview
  const actualX2 = (x2 - mapPanOffset.x) / mapZoom;
  const actualY2 = (y2 - mapPanOffset.y) / mapZoom;
  const map = getCurrentMap();
  if (map) {
    const scale = map.scale || { pixels: 100, distance: 1, unit: 'miles' };
    const dx = actualX2 - measurementStart.x;
    const dy = actualY2 - measurementStart.y;
    const pixelDistance = Math.sqrt(dx * dx + dy * dy);
    const realDistance = (pixelDistance / scale.pixels) * scale.distance;
    let displayValue;
    if (realDistance < 0.1) displayValue = realDistance.toFixed(3);
    else if (realDistance < 1) displayValue = realDistance.toFixed(2);
    else if (realDistance < 10) displayValue = realDistance.toFixed(1);
    else displayValue = Math.round(realDistance);
    document.getElementById('measurementValue').textContent = `${displayValue} ${scale.unit}`;
    document.getElementById('measurementDisplay').classList.remove('hidden');
  }
}

function hideMeasurementLine() {
  document.getElementById('measurementLayer').classList.add('hidden');
}

function calculateAndDisplayDistance() {
  if (!measurementStart || !measurementEnd) return;

  const map = getCurrentMap();
  const scale = map.scale || { pixels: 100, distance: 1, unit: 'miles' };

  // Calculate pixel distance
  const dx = measurementEnd.x - measurementStart.x;
  const dy = measurementEnd.y - measurementStart.y;
  const pixelDistance = Math.sqrt(dx * dx + dy * dy);

  // Convert to real distance
  const realDistance = (pixelDistance / scale.pixels) * scale.distance;

  // Format the display
  let displayValue;
  if (realDistance < 0.1) {
    displayValue = realDistance.toFixed(3);
  } else if (realDistance < 1) {
    displayValue = realDistance.toFixed(2);
  } else if (realDistance < 10) {
    displayValue = realDistance.toFixed(1);
  } else {
    displayValue = Math.round(realDistance);
  }

  document.getElementById('measurementValue').textContent = `${displayValue} ${scale.unit}`;
}

function updateMeasurementDisplay() {
  if (measurementStart && measurementEnd) {
    updateMeasurementLine();
    calculateAndDisplayDistance();
  }
}

function clearMeasurement() {
  measurementStart = null;
  measurementEnd = null;
  isMeasuring = false;
  document.getElementById('measurementDisplay').classList.add('hidden');
  hideMeasurementLine();
}

// ============================================
// Search Results Helper
// ============================================
function hideSearchResults(resultsId) {
  document.getElementById(resultsId).classList.add('hidden');
}

// ============================================
// Wiki Link Modal (Write View)
// ============================================
let selectedWikiLink = null;

function openWikiLinkModal() {
  saveEditorSelection();
  document.getElementById('wikiLinkSearch').value = '';
  document.getElementById('wikiLinkSearchResults').innerHTML = '';
  document.getElementById('wikiLinkPreview').classList.add('hidden');
  document.getElementById('confirmWikiLink').disabled = true;
  selectedWikiLink = null;

  document.getElementById('wikiLinkModal').classList.remove('hidden');
  document.getElementById('wikiLinkSearch').focus();
}

function closeWikiLinkModal() {
  document.getElementById('wikiLinkModal').classList.add('hidden');
  selectedWikiLink = null;
}

function handleWikiLinkSearch(query) {
  const resultsEl = document.getElementById('wikiLinkSearchResults');
  const previewEl = document.getElementById('wikiLinkPreview');

  if (!query || query.trim().length < 1) {
    resultsEl.innerHTML = '<div class="search-result-empty">Type to search cards and pins...</div>';
    previewEl.classList.add('hidden');
    document.getElementById('confirmWikiLink').disabled = true;
    return;
  }

  const lowerQuery = query.toLowerCase();
  const results = [];

  // Search cards
  boards.forEach(board => {
    board.cards.forEach(card => {
      if (card.title.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'card',
          id: card.id,
          name: card.title,
          location: board.name,
          color: cardColors[card.type] || '#888'
        });
      }
    });
  });

  // Search pins
  maps.forEach(map => {
    map.pins.forEach(pin => {
      if (pin.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'pin',
          id: pin.id,
          mapId: map.id,
          name: pin.name,
          location: map.name,
          color: pin.color || '#ef4444'
        });
      }
    });
  });

  if (results.length === 0) {
    resultsEl.innerHTML = '<div class="search-result-empty">No results found</div>';
  } else {
    resultsEl.innerHTML = results.slice(0, 10).map(item => `
      <div class="search-result-item" data-type="${item.type}" data-id="${item.id}" data-map-id="${item.mapId || ''}" data-name="${item.name}">
        <span class="search-result-color type-${item.type}" style="background: ${item.color}"></span>
        <span class="search-result-name">${item.name}</span>
        <span class="search-result-location">${item.type === 'pin' ? '📍' : '📋'} ${item.location}</span>
      </div>
    `).join('');

    // Add click handlers
    resultsEl.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('click', () => {
        selectWikiLinkResult(item.dataset.type, item.dataset.id, item.dataset.mapId, item.dataset.name);
      });
    });
  }
}

function selectWikiLinkResult(type, id, mapId, name) {
  selectedWikiLink = { type, id, mapId, name };

  const previewEl = document.getElementById('wikiLinkPreview');
  previewEl.querySelector('.wiki-link-type').textContent = type === 'card' ? '📋 Card:' : '📍 Pin:';
  previewEl.querySelector('.wiki-link-name').textContent = name;
  previewEl.classList.remove('hidden');

  document.getElementById('confirmWikiLink').disabled = false;

  // Highlight selected result
  document.querySelectorAll('#wikiLinkSearchResults .search-result-item').forEach(item => {
    item.classList.toggle('selected', item.dataset.id === id);
  });
}

function confirmWikiLink() {
  if (!selectedWikiLink) return;

  restoreEditorSelection();

  // Create the wiki link markup
  const linkHtml = selectedWikiLink.type === 'card'
    ? `<span class="wiki-link" onclick="navigateToCard('${selectedWikiLink.id}')">${selectedWikiLink.name}</span>`
    : `<span class="wiki-link" onclick="navigateToPin('${selectedWikiLink.mapId}', '${selectedWikiLink.id}')">${selectedWikiLink.name}</span>`;

  document.execCommand('insertHTML', false, linkHtml);
  saveCurrentChapter();

  closeWikiLinkModal();
}

// ============================================
// Bidirectional Association System
// ============================================
function addAssociation(sourceType, sourceId, targetType, targetId, targetParentId = null) {
  // Check if association already exists
  const exists = associations.some(a =>
    (a.sourceType === sourceType && a.sourceId === sourceId &&
     a.targetType === targetType && a.targetId === targetId) ||
    (a.sourceType === targetType && a.sourceId === targetId &&
     a.targetType === sourceType && a.targetId === sourceId)
  );

  if (!exists) {
    associations.push({
      id: `assoc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      sourceType,
      sourceId,
      targetType,
      targetId,
      targetParentId // For pins, this is the mapId
    });
  }
}

function removeAssociation(sourceType, sourceId, targetType, targetId) {
  associations = associations.filter(a =>
    !((a.sourceType === sourceType && a.sourceId === sourceId &&
       a.targetType === targetType && a.targetId === targetId) ||
      (a.sourceType === targetType && a.sourceId === targetId &&
       a.targetType === sourceType && a.targetId === sourceId))
  );
}

function getAssociationsFor(itemType, itemId) {
  const results = [];

  associations.forEach(a => {
    if (a.sourceType === itemType && a.sourceId === itemId) {
      results.push({
        type: a.targetType,
        id: a.targetId,
        parentId: a.targetParentId
      });
    } else if (a.targetType === itemType && a.targetId === itemId) {
      results.push({
        type: a.sourceType,
        id: a.sourceId,
        parentId: null // Source doesn't have parent in our current structure
      });
    }
  });

  return results;
}

function getItemInfo(type, id) {
  switch(type) {
    case 'card':
      for (const board of boards) {
        const card = board.cards.find(c => c.id === id);
        if (card) {
          return {
            name: card.title,
            color: cardColors[card.type] || '#888',
            boardId: board.id,
            boardName: board.name
          };
        }
      }
      break;
    case 'pin':
      for (const map of maps) {
        const pin = map.pins.find(p => p.id === id);
        if (pin) {
          return {
            name: pin.name,
            color: pin.color || '#ef4444',
            mapId: map.id,
            mapName: map.name
          };
        }
      }
      break;
    case 'chapter':
      const chapter = chapters.find(c => c.id === id);
      if (chapter) {
        return {
          name: chapter.title || chapter.label,
          color: '#d4a824'
        };
      }
      break;
    case 'map':
      const map = maps.find(m => m.id === id);
      if (map) {
        return {
          name: map.name,
          color: '#3b82f6',
          mapId: map.id
        };
      }
      break;
    case 'faction':
      const fac = factions.find(f => f.id === id);
      if (fac) {
        return { name: fac.name, color: fac.color || '#8b5cf6' };
      }
      break;
    case 'contact':
      const con = contacts.find(c => c.id === id);
      if (con) {
        const conFac = factions.find(f => f.id === con.factionId);
        return { name: con.name, color: conFac ? conFac.color : '#666' };
      }
      break;
  }
  return null;
}

function navigateToItem(type, id, parentId) {
  switch(type) {
    case 'card':
      navigateToCard(id);
      break;
    case 'pin':
      if (parentId) {
        navigateToPin(parentId, id);
      } else {
        // Find which map has this pin
        for (const map of maps) {
          if (map.pins.find(p => p.id === id)) {
            navigateToPin(map.id, id);
            break;
          }
        }
      }
      break;
    case 'chapter':
      switchView('write');
      selectChapter(id);
      break;
    case 'map':
      switchView('map');
      currentMapId = id;
      renderMapsList();
      updateMapView();
      updateMapStatusBar();
      break;
    case 'faction':
      switchView('factions');
      switchFacTab('factions');
      selectedFactionId = id;
      renderFactionGrid(); renderFactionsSidebar(); showFacDetail();
      break;
    case 'contact':
      switchView('factions');
      switchFacTab('contacts');
      selectedContactId = id;
      renderContactsGrid(); renderContactsSidebar(); showContactDetail();
      break;
  }
}

function handleAssociationSearch(query, resultsId, contextType) {
  const resultsEl = document.getElementById(resultsId);

  if (!query || query.trim().length < 1) {
    resultsEl.classList.add('hidden');
    return;
  }

  const lowerQuery = query.toLowerCase();
  const results = [];

  // Search cards
  boards.forEach(board => {
    board.cards.forEach(card => {
      if (card.title.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'card',
          id: card.id,
          name: card.title,
          location: board.name,
          color: cardColors[card.type] || '#888'
        });
      }
    });
  });

  // Search pins
  maps.forEach(map => {
    map.pins.forEach(pin => {
      if (pin.name.toLowerCase().includes(lowerQuery)) {
        results.push({
          type: 'pin',
          id: pin.id,
          parentId: map.id,
          name: pin.name,
          location: `📍 ${map.name}`,
          color: pin.color || '#ef4444'
        });
      }
    });
  });

  // Search chapters
  chapters.forEach(chapter => {
    const title = chapter.title || chapter.label;
    if (title.toLowerCase().includes(lowerQuery)) {
      results.push({
        type: 'chapter',
        id: chapter.id,
        name: title,
        location: '📝 Writing',
        color: '#d4a824'
      });
    }
  });

  // Search maps
  maps.forEach(map => {
    if (map.name.toLowerCase().includes(lowerQuery)) {
      results.push({
        type: 'map',
        id: map.id,
        name: map.name,
        location: '🗺️ Map',
        color: '#3b82f6'
      });
    }
  });

  // Search factions
  factions.forEach(fac => {
    if (fac.name.toLowerCase().includes(lowerQuery)) {
      results.push({
        type: 'faction',
        id: fac.id,
        name: fac.name,
        location: '⚔ Faction',
        color: fac.color || '#8b5cf6'
      });
    }
  });

  // Search contacts
  contacts.forEach(con => {
    if (con.name.toLowerCase().includes(lowerQuery)) {
      const conFac = factions.find(f => f.id === con.factionId);
      results.push({
        type: 'contact',
        id: con.id,
        name: con.name,
        location: conFac ? `👤 ${conFac.name}` : '👤 Independent',
        color: conFac ? conFac.color : '#666'
      });
    }
  });

  if (results.length === 0) {
    resultsEl.innerHTML = '<div class="search-result-empty">No results found</div>';
  } else {
    resultsEl.innerHTML = results.slice(0, 10).map(item => `
      <div class="search-result-item" data-type="${item.type}" data-id="${item.id}" data-parent-id="${item.parentId || ''}" data-name="${item.name}">
        <span class="search-result-color type-${item.type}" style="background: ${item.color}"></span>
        <span class="search-result-name">${item.name}</span>
        <span class="search-result-location">${item.location}</span>
      </div>
    `).join('');

    resultsEl.querySelectorAll('.search-result-item').forEach(item => {
      item.addEventListener('mousedown', (e) => {
        e.preventDefault();
        selectAssociationResult(item, contextType, resultsId);
      });
    });
  }

  resultsEl.classList.remove('hidden');
}

function selectAssociationResult(item, contextType, resultsId) {
  const targetType = item.dataset.type;
  const targetId = item.dataset.id;
  const targetParentId = item.dataset.parentId || null;
  const targetName = item.dataset.name;

  // Determine source based on context
  let sourceType, sourceId;

  if (contextType === 'pin' && editingPinId) {
    sourceType = 'pin';
    sourceId = editingPinId;
  } else if (contextType === 'card' && selectedCard) {
    sourceType = 'card';
    sourceId = selectedCard.id;
  } else if (contextType === 'chapter') {
    sourceType = 'chapter';
    sourceId = currentChapterId;
  } else if (contextType === 'faction' && selectedFactionId) {
    sourceType = 'faction';
    sourceId = selectedFactionId;
  } else if (contextType === 'contact' && selectedContactId) {
    sourceType = 'contact';
    sourceId = selectedContactId;
  }

  if (sourceType && sourceId && sourceId !== targetId) {
    addAssociation(sourceType, sourceId, targetType, targetId, targetParentId);

    // Re-render the associations list
    if (contextType === 'pin') {
      renderAssociationsList('pin', editingPinId, 'pinAssociationsList');
    } else if (contextType === 'card') {
      renderCardAssociationsList();
    } else if (contextType === 'chapter') {
      renderChapterAssociationsList();
    } else if (contextType === 'faction') {
      renderAssociationsList('faction', selectedFactionId, 'facDetailAssocList');
    } else if (contextType === 'contact') {
      renderAssociationsList('contact', selectedContactId, 'conDetailAssocList');
    }
  }

  // Clear search
  if (resultsId === 'pinAssociationSearchResults') {
    document.getElementById('pinAssociationSearch').value = '';
  } else if (resultsId === 'cardAssociationSearchResults') {
    document.getElementById('cardAssociationSearch').value = '';
  } else if (resultsId === 'chapterAssociationSearchResults') {
    document.getElementById('chapterAssociationSearch').value = '';
  } else if (resultsId === 'facAssociationSearchResults') {
    document.getElementById('facAssociationSearch').value = '';
  } else if (resultsId === 'conAssociationSearchResults') {
    document.getElementById('conAssociationSearch').value = '';
  }

  hideSearchResults(resultsId);
}

function renderAssociationsList(itemType, itemId, containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const assocs = getAssociationsFor(itemType, itemId);

  if (assocs.length === 0) {
    container.innerHTML = '<div class="no-associations">No associations</div>';
    return;
  }

  // Render association rows in the same visual language as connections (swatch + title + right action)
  container.innerHTML = assocs.map(a => {
    const info = getItemInfo(a.type, a.id);
    if (!info) return '';

    const escapedName = (info.name || 'Unknown').replace(/'/g, "\\'");
    const parentId = a.parentId || info.mapId || '';

    return `
      <div class="association-row" onclick="navigateToItem('${a.type}', '${a.id}', '${parentId}')">
        <span class="association-swatch type-${a.type}" style="background: ${info.color || '#888'}"></span>
        <span class="association-title">${info.name || 'Unknown'}</span>
        <span class="association-meta">${a.type}</span>
        <button class="association-remove" onclick="event.stopPropagation(); removeAssociationAndRefresh('${itemType}', '${itemId}', '${a.type}', '${a.id}', '${containerId}')">×</button>
      </div>
    `;
  }).filter(html => html).join('');
}

function removeAssociationAndRefresh(sourceType, sourceId, targetType, targetId, containerId) {
  removeAssociation(sourceType, sourceId, targetType, targetId);
  renderAssociationsList(sourceType, sourceId, containerId);
}

function renderCardAssociationsList() {
  if (!selectedCard) return;
  renderAssociationsList('card', selectedCard.id, 'cardAssociationsList');
}

// ============================================
// Create New Map
// ============================================
function createNewMap() {
  const newId = `map-${Date.now()}`;
  const newMap = {
    id: newId,
    name: `Map ${maps.length + 1}`,
    imageUrl: '',
    pins: [],
    scale: { pixels: 100, distance: 1, unit: 'miles' }
  };

  maps.push(newMap);
  currentMapId = newId;
  renderMapsList();
  updateMapView();
  updateMapStatusBar();

  // Open map editor to set image
  openMapEditorModal(newId);
}

function createAndEditNewMap() {
  const currentMap = getCurrentMap();
  if (currentMap) {
    // Map exists but has no image - open its editor
    openMapEditorModal(currentMap.id);
  } else {
    // No map at all - create one and open editor
    createNewMap();
  }
}

// ============================================
// Map Zoom Controls
// ============================================
function mapZoomHeight() {
  const mapImg = document.getElementById('mapImage');
  const mapCanvas = document.getElementById('mapCanvas');

  if (!mapImg.naturalHeight) return;

  const containerHeight = mapCanvas.clientHeight;
  const imageHeight = mapImg.naturalHeight;

  mapZoom = containerHeight / imageHeight;
  mapPanOffset = { x: (mapCanvas.clientWidth - mapImg.naturalWidth * mapZoom) / 2, y: 0 };
  applyMapTransform();
  document.getElementById('mapZoomLevel').textContent = `${Math.round(mapZoom * 100)}%`;
}

function mapZoomCenter() {
  const mapImg = document.getElementById('mapImage');
  const mapCanvas = document.getElementById('mapCanvas');

  if (!mapImg.naturalWidth || !mapImg.naturalHeight) return;

  const containerWidth = mapCanvas.clientWidth;
  const containerHeight = mapCanvas.clientHeight;
  const imageWidth = mapImg.naturalWidth * mapZoom;
  const imageHeight = mapImg.naturalHeight * mapZoom;

  mapPanOffset = {
    x: (containerWidth - imageWidth) / 2,
    y: (containerHeight - imageHeight) / 2
  };

  applyMapTransform();
}

// ============================================
// Context Menu Handlers
// ============================================
function openMapSidebarContextMenu(e, map) {
  closeAllContextMenus();
  contextMenuMap = map;

  const menu = document.getElementById('mapSidebarContextMenu');
  menu.classList.remove('hidden');
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
}

function openPinSidebarContextMenu(e, pin) {
  closeAllContextMenus();
  contextMenuPin = pin;

  const menu = document.getElementById('pinSidebarContextMenu');
  menu.classList.remove('hidden');
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
}

function openMapCanvasContextMenu(e) {
  closeAllContextMenus();
  contextMenuPosition = { x: e.clientX, y: e.clientY };

  const menu = document.getElementById('mapCanvasContextMenu');
  menu.classList.remove('hidden');
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
}

function closeAllContextMenus() {
  document.getElementById('contextMenu').classList.add('hidden');
  document.getElementById('pinContextMenu').classList.add('hidden');
  document.getElementById('mapSidebarContextMenu').classList.add('hidden');
  document.getElementById('pinSidebarContextMenu').classList.add('hidden');
  document.getElementById('mapCanvasContextMenu').classList.add('hidden');
  document.getElementById('combatantContextMenu')?.classList.add('hidden');
  document.getElementById('facContactContextMenu')?.classList.add('hidden');
  document.getElementById('tlContextMenu')?.classList.add('hidden');
  document.getElementById('evtContextMenu')?.classList.add('hidden');
  document.getElementById('chapterContextMenu')?.classList.add('hidden');
  document.getElementById('boardContextMenu')?.classList.add('hidden');
  document.getElementById('folderContextMenu')?.classList.add('hidden');
  document.getElementById('regionContextMenu')?.classList.add('hidden');
  const tableMenu = document.getElementById('tableContextMenu');
  if (tableMenu) tableMenu.classList.add('hidden');
  const columnMenu = document.getElementById('columnContextMenu');
  if (columnMenu) columnMenu.classList.add('hidden');
  contextMenuCard = null;
  contextMenuPin = null;
  contextMenuMap = null;
  contextMenuTable = null;
  contextMenuCell = null;
  contextMenuColumn = null;
  contextMenuColumns = null;
  ctxCombatantId = null;
  ctxFacItemId = null;
  ctxFacItemType = null;
}

function handleMapSidebarContextAction(e) {
  const action = e.target.dataset.action;
  if (!action || !contextMenuMap) return;

  switch(action) {
    case 'editMap':
      openMapEditorModal(contextMenuMap.id);
      break;
    case 'duplicateMap':
      duplicateMap(contextMenuMap.id);
      break;
    case 'renameMap':
      const input = document.querySelector(`.map-item[data-map-id="${contextMenuMap.id}"] .map-name`);
      if (input) {
        input.focus();
        input.select();
      }
      break;
    case 'deleteMap':
      deleteMap(contextMenuMap.id);
      break;
    case 'toggleHideMap':
      contextMenuMap.hidden = !contextMenuMap.hidden;
      renderMapsList();
      showNotif(contextMenuMap.hidden ? `${contextMenuMap.name} hidden` : `${contextMenuMap.name} visible`);
      break;
  }

  closeAllContextMenus();
}

function handlePinSidebarContextAction(e) {
  const action = e.target.dataset.action;
  if (!action || !contextMenuPin) return;

  switch(action) {
    case 'editPinSidebar':
      openPinEditorModal(contextMenuPin.id);
      break;
    case 'panToPinSidebar':
      panToPin(contextMenuPin.id);
      break;
    case 'duplicatePinSidebar':
      duplicatePin(contextMenuPin.id);
      break;
    case 'deletePinSidebar':
      deletePinById(contextMenuPin.id);
      break;
  }

  closeAllContextMenus();
}

function handleMapCanvasContextAction(e) {
  const action = e.target.dataset.action;
  if (!action) return;

  switch(action) {
    case 'addPinHere':
      const wrapper = document.getElementById('mapImageWrapper');
      const rect = wrapper.getBoundingClientRect();
      const x = ((contextMenuPosition.x - rect.left) / rect.width) * 100;
      const y = ((contextMenuPosition.y - rect.top) / rect.height) * 100;
      addPin(x, y);
      break;
    case 'measureFromHere':
      // Start measurement from context menu position
      const mapCanvas = document.getElementById('mapCanvas');
      const canvasRect = mapCanvas.getBoundingClientRect();
      const actualX = (contextMenuPosition.x - canvasRect.left - mapPanOffset.x) / mapZoom;
      const actualY = (contextMenuPosition.y - canvasRect.top - mapPanOffset.y) / mapZoom;
      measurementStart = { x: actualX, y: actualY };
      measurementEnd = null;
      document.getElementById('measurementDisplay').classList.remove('hidden');
      document.getElementById('measurementValue').textContent = 'Click another point';
      setMapTool('map-measure');
      break;
    case 'centerMap':
      mapZoomCenter();
      break;
    case 'fitToScreen':
      mapZoomFitBest();
      break;
  }

  closeAllContextMenus();
}

function mapZoomFitBest() {
  const mapImg = document.getElementById('mapImage');
  const mapCanvas = document.getElementById('mapCanvas');

  if (!mapImg.naturalWidth || !mapImg.naturalHeight) return;

  const containerWidth = mapCanvas.clientWidth;
  const containerHeight = mapCanvas.clientHeight;
  const imageWidth = mapImg.naturalWidth;
  const imageHeight = mapImg.naturalHeight;

  // Calculate zoom to fit both width and height
  const zoomWidth = containerWidth / imageWidth;
  const zoomHeight = containerHeight / imageHeight;
  mapZoom = Math.min(zoomWidth, zoomHeight) * 0.95; // 95% to leave some margin

  // Center the map
  mapPanOffset = {
    x: (containerWidth - imageWidth * mapZoom) / 2,
    y: (containerHeight - imageHeight * mapZoom) / 2
  };

  applyMapTransform();
  document.getElementById('mapZoomLevel').textContent = `${Math.round(mapZoom * 100)}%`;
}

function duplicateMap(mapId) {
  const sourceMap = maps.find(m => m.id === mapId);
  if (!sourceMap) return;

  const newMap = {
    ...JSON.parse(JSON.stringify(sourceMap)),
    id: `map-${Date.now()}`,
    name: `${sourceMap.name} (Copy)`,
    pins: sourceMap.pins.map(p => ({
      ...p,
      id: `pin-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
    }))
  };

  maps.push(newMap);
  renderMapsList();
  selectMap(newMap.id);
}

function duplicatePin(pinId) {
  const currentMap = getCurrentMap();
  if (!currentMap) return;

  const sourcePin = currentMap.pins.find(p => p.id === pinId);
  if (!sourcePin) return;

  const newPin = {
    ...JSON.parse(JSON.stringify(sourcePin)),
    id: `pin-${Date.now()}`,
    name: `${sourcePin.name} (Copy)`,
    x: sourcePin.x + 2,
    y: sourcePin.y + 2
  };

  currentMap.pins.push(newPin);
  renderPins();
  renderPinsList();
  selectPin(newPin.id);
}

function panToPin(pinId) {
  const currentMap = getCurrentMap();
  if (!currentMap) return;

  const pin = currentMap.pins.find(p => p.id === pinId);
  if (!pin) return;

  const mapCanvas = document.getElementById('mapCanvas');
  const mapImg = document.getElementById('mapImage');

  const pinX = (pin.x / 100) * mapImg.naturalWidth * mapZoom;
  const pinY = (pin.y / 100) * mapImg.naturalHeight * mapZoom;

  mapPanOffset = {
    x: mapCanvas.clientWidth / 2 - pinX,
    y: mapCanvas.clientHeight / 2 - pinY
  };

  applyMapTransform();
  selectPin(pinId);
}

// ============================================
// Columns Modal
// ============================================
function openColumnsModal() {
  saveEditorSelection();
  document.getElementById('columnsModal').classList.remove('hidden');
}

function closeColumnsModal() {
  document.getElementById('columnsModal').classList.add('hidden');
}

function insertColumns(layout) {
  restoreEditorSelection();

  const layouts = {
    '50-50': ['50%', '50%'],
    '33-33-33': ['33.33%', '33.33%', '33.33%'],
    '25-50-25': ['25%', '50%', '25%'],
    '30-70': ['30%', '70%'],
    '70-30': ['70%', '30%'],
    '25-25-25-25': ['25%', '25%', '25%', '25%']
  };

  const widths = layouts[layout] || ['50%', '50%'];

  let columnsHtml = '<p><br></p><div class="editor-columns borderless">';

  widths.forEach((width, i) => {
    columnsHtml += `<div class="editor-column" style="flex-basis: calc(${width} - 8px)" contenteditable="true">Column ${i + 1}</div>`;
  });

  columnsHtml += '</div><p><br></p>';

  document.execCommand('insertHTML', false, columnsHtml);
  saveCurrentChapter();
  closeColumnsModal();
}

// ============================================
// Table Context Menu
// ============================================
function handleTableContextMenu(e) {
  const table = e.target.closest('table');
  const cell = e.target.closest('td, th');

  if (!table || !cell) return;

  e.preventDefault();
  closeAllContextMenus();

  contextMenuTable = table;
  contextMenuCell = cell;

  const menu = document.getElementById('tableContextMenu');
  menu.classList.remove('hidden');
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
}

function handleTableContextAction(e) {
  const action = e.target.dataset.action;
  if (!action || !contextMenuTable) return;

  const row = contextMenuCell?.closest('tr');
  const rowIndex = row ? Array.from(contextMenuTable.rows).indexOf(row) : -1;
  const cellIndex = contextMenuCell ? contextMenuCell.cellIndex : -1;

  if (action === 'addRowAbove' && rowIndex >= 0) {
    const newRow = contextMenuTable.insertRow(rowIndex);
    const cols = contextMenuTable.rows[rowIndex + 1]?.cells.length || 2;
    for (let i = 0; i < cols; i++) {
      newRow.insertCell().textContent = '';
    }
  } else if (action === 'addRowBelow' && rowIndex >= 0) {
    const newRow = contextMenuTable.insertRow(rowIndex + 1);
    const cols = contextMenuTable.rows[rowIndex]?.cells.length || 2;
    for (let i = 0; i < cols; i++) {
      newRow.insertCell().textContent = '';
    }
  } else if (action === 'addColLeft' && cellIndex >= 0) {
    Array.from(contextMenuTable.rows).forEach(tr => {
      const cell = tr.insertCell(cellIndex);
      cell.textContent = '';
    });
  } else if (action === 'addColRight' && cellIndex >= 0) {
    Array.from(contextMenuTable.rows).forEach(tr => {
      const cell = tr.insertCell(cellIndex + 1);
      cell.textContent = '';
    });
  } else if (action === 'deleteRow' && row) {
    contextMenuTable.deleteRow(rowIndex);
  } else if (action === 'deleteCol' && cellIndex >= 0) {
    Array.from(contextMenuTable.rows).forEach(tr => {
      if (tr.cells[cellIndex]) tr.deleteCell(cellIndex);
    });
  } else if (action.startsWith('headerColor-')) {
    const color = action.replace('headerColor-', '');
    const headers = contextMenuTable.querySelectorAll('th');
    headers.forEach(th => {
      if (color === 'gold') {
        th.style.background = 'var(--gold-subtle)';
        th.style.color = 'var(--gold)';
      } else if (color === 'dark') {
        th.style.background = 'var(--bg-dark)';
        th.style.color = 'var(--text-primary)';
      } else if (color === 'none') {
        th.style.background = 'transparent';
        th.style.fontWeight = 'normal';
      } else {
        th.style.background = '';
        th.style.color = '';
      }
    });
  } else if (action.startsWith('borderStyle-')) {
    const style = action.replace('borderStyle-', '');
    if (style === 'none') {
      contextMenuTable.style.borderCollapse = 'collapse';
      contextMenuTable.querySelectorAll('td, th').forEach(cell => {
        cell.style.border = 'none';
      });
    } else if (style === 'dashed') {
      contextMenuTable.querySelectorAll('td, th').forEach(cell => {
        cell.style.borderStyle = 'dashed';
      });
    } else {
      contextMenuTable.querySelectorAll('td, th').forEach(cell => {
        cell.style.borderStyle = 'solid';
      });
    }
  } else if (action === 'deleteTable') {
    contextMenuTable.remove();
  }

  saveCurrentChapter();
  closeAllContextMenus();
}

// Initialize columns modal event listeners
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('closeColumnsModal')?.addEventListener('click', closeColumnsModal);
  document.getElementById('cancelColumns')?.addEventListener('click', closeColumnsModal);
  document.getElementById('columnsModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'columnsModal') closeColumnsModal();
  });

  document.querySelectorAll('.column-layout-btn').forEach(btn => {
    btn.addEventListener('click', () => insertColumns(btn.dataset.layout));
  });

  // Table context menu
  document.getElementById('writeEditor')?.addEventListener('contextmenu', (e) => {
    if (e.target.closest('table')) {
      handleTableContextMenu(e);
    } else if (e.target.closest('.editor-column')) {
      handleColumnContextMenu(e);
    }
  });

  document.getElementById('tableContextMenu')?.addEventListener('click', handleTableContextAction);
  document.getElementById('columnContextMenu')?.addEventListener('click', handleColumnContextAction);

  // Table resize functionality
  setupTableResize();
});

// Column context menu variables
let contextMenuColumn = null;
let contextMenuColumns = null;

function handleColumnContextMenu(e) {
  e.preventDefault();
  closeAllContextMenus();

  contextMenuColumn = e.target.closest('.editor-column');
  contextMenuColumns = e.target.closest('.editor-columns');

  const menu = document.getElementById('columnContextMenu');
  menu.classList.remove('hidden');
  menu.style.left = `${e.clientX}px`;
  menu.style.top = `${e.clientY}px`;
}

function handleColumnContextAction(e) {
  const action = e.target.dataset.action;
  if (!action || !contextMenuColumn) return;

  if (action.startsWith('colBorder-')) {
    const style = action.replace('colBorder-', '');
    if (style === 'all') {
      contextMenuColumn.style.border = '1px solid var(--border-color)';
    } else if (style === 'outer') {
      contextMenuColumn.style.border = '1px solid var(--border-color)';
      contextMenuColumn.style.borderRadius = 'var(--radius-md)';
    } else if (style === 'none') {
      contextMenuColumn.style.border = 'none';
    } else if (style === 'dashed') {
      contextMenuColumn.style.border = '1px dashed var(--border-color)';
    }
  } else if (action.startsWith('containerBorder-')) {
    const style = action.replace('containerBorder-', '');
    if (contextMenuColumns) {
      if (style === 'none') {
        contextMenuColumns.classList.add('borderless');
      } else {
        contextMenuColumns.classList.remove('borderless');
        if (style === 'dashed') contextMenuColumns.style.border = '1px dashed var(--border-light)';
        else if (style === 'solid') contextMenuColumns.style.border = '1px solid var(--border-color)';
      }
    }
  } else if (action.startsWith('colBg-')) {
    const bg = action.replace('colBg-', '');
    if (bg === 'none') {
      contextMenuColumn.style.background = 'transparent';
    } else if (bg === 'dark') {
      contextMenuColumn.style.background = 'var(--bg-dark)';
    } else if (bg === 'medium') {
      contextMenuColumn.style.background = 'var(--bg-medium)';
    } else if (bg === 'gold') {
      contextMenuColumn.style.background = 'rgba(212, 168, 36, 0.1)';
    }
  } else if (action === 'addColBefore' && contextMenuColumns) {
    const newCol = document.createElement('div');
    newCol.className = 'editor-column';
    newCol.contentEditable = 'true';
    newCol.style.flexBasis = contextMenuColumn.style.flexBasis;
    newCol.textContent = 'New column';
    contextMenuColumns.insertBefore(newCol, contextMenuColumn);
  } else if (action === 'addColAfter' && contextMenuColumns) {
    const newCol = document.createElement('div');
    newCol.className = 'editor-column';
    newCol.contentEditable = 'true';
    newCol.style.flexBasis = contextMenuColumn.style.flexBasis;
    newCol.textContent = 'New column';
    contextMenuColumn.after(newCol);
  } else if (action === 'deleteColumn') {
    contextMenuColumn.remove();
  } else if (action === 'deleteColumns' && contextMenuColumns) {
    contextMenuColumns.remove();
  }

  saveCurrentChapter();
  closeAllContextMenus();
}

function setupTableResize() {
  const editor = document.getElementById('writeEditor');
  if (!editor) return;

  let isResizingCol = false;
  let isResizingRow = false;
  let resizeTable = null;
  let resizeColIndex = -1;
  let resizeRow = null;
  let startX = 0;
  let startY = 0;
  let startWidths = [];
  let startHeight = 0;

  editor.addEventListener('mousedown', (e) => {
    const cell = e.target.closest('th, td');
    const row = e.target.closest('tr');
    const table = e.target.closest('table');

    if (cell && table) {
      const rect = cell.getBoundingClientRect();
      // Check if clicking on right edge for column resize
      if (e.clientX >= rect.right - 8) {
        isResizingCol = true;
        resizeTable = table;
        resizeColIndex = cell.cellIndex;
        startX = e.clientX;
        // Store widths for all cells in this column
        startWidths = Array.from(table.rows).map(r =>
          r.cells[resizeColIndex]?.offsetWidth || 0
        );
        e.preventDefault();
      }
    }

    if (row) {
      const rect = row.getBoundingClientRect();
      // Check if clicking on bottom edge for row resize
      if (e.clientY >= rect.bottom - 5) {
        isResizingRow = true;
        resizeRow = row;
        startY = e.clientY;
        startHeight = row.offsetHeight;
        e.preventDefault();
      }
    }
  });

  document.addEventListener('mousemove', (e) => {
    if (isResizingCol && resizeTable && resizeColIndex >= 0) {
      const diff = e.clientX - startX;
      // Apply width to ALL cells in the column
      Array.from(resizeTable.rows).forEach((row, i) => {
        const cell = row.cells[resizeColIndex];
        if (cell) {
          const newWidth = Math.max(50, startWidths[i] + diff);
          cell.style.width = newWidth + 'px';
        }
      });
    }

    if (isResizingRow && resizeRow) {
      const diff = e.clientY - startY;
      const newHeight = Math.max(30, startHeight + diff);
      Array.from(resizeRow.cells).forEach(cell => {
        cell.style.height = newHeight + 'px';
      });
    }
  });

  document.addEventListener('mouseup', () => {
    if (isResizingCol || isResizingRow) {
      saveCurrentChapter();
    }
    isResizingCol = false;
    isResizingRow = false;
    resizeTable = null;
    resizeColIndex = -1;
    resizeRow = null;
  });
}



document.addEventListener('DOMContentLoaded', () => {
  const clearBtn = document.getElementById('clearFormattingBtn');
  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      const editor = document.getElementById('writeEditor');
      if (!editor) return;
      editor.focus();

      // Remove inline formatting from selection
      document.execCommand('removeFormat');
      // Clear colors / highlight where possible
      document.execCommand('foreColor', false, '#f5ede0');
      document.execCommand('hiliteColor', false, 'transparent');

      // Remove links from selection
      document.execCommand('unlink');

      // Normalize spans with inline styles within selection (best-effort)
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      const frag = range.cloneContents();
      // If user selected nothing, do nothing
      if (!frag.textContent) return;
    });
  }

  // Auto-save tags: commit on blur, or when a comma is typed.
  const tagsInput = document.getElementById('detailTags');
  if (tagsInput) {
    tagsInput.addEventListener('blur', () => {
      updateSelectedCard();
      // refresh tag UI if you have any tag widgets later
      if (typeof renderCardAssociationsList === 'function') renderCardAssociationsList();
    });

    tagsInput.addEventListener('keyup', (e) => {
      if (e.key === ',' || e.key === 'Enter') {
        updateSelectedCard();
      }
    });
  }
});

document.addEventListener('keydown', (e) => {
  if (e.key === 'Delete' || e.key === 'Backspace') {
    if (selectedDestinationId) {
      destinationMarkers = destinationMarkers.filter(d => d.id !== selectedDestinationId);
      selectedDestinationId = null;
      renderDestinations();
      showNotif('Destination removed');
    }
  }
});


// ============================================
// Timeline System
// ============================================
let timelines = [];
let currentTimelineId = null;
let editingEventId = null;
let selectedEventId = null;
let tlViewMode = 'lanes';
let calGridMonth = 0;
let calGridYear = 1;
function setTlModeActive(activeId) {
  ['tlModeLanes','tlModeList','tlModeCalGrid','tlModeChronicle','tlModeAge'].forEach(id => {
    document.getElementById(id)?.classList.toggle('active', id === activeId);
  });
}
let tlZoom = 1;
let calViewMonth = 0;
let calViewYear = 1;
let calSelectedDay = null;
let ctxTimelineId = null;
let ctxEventId = null;
let ctxEventTlId = null;
let editingEventTags = [];
let tlPanning = false;
let tlPanStart = {x:0,y:0,scrollLeft:0,scrollTop:0};

const TL_COLORS = ['#3b82f6','#f43f5e','#22c55e','#f97316','#8b5cf6','#14b8a6','#eab308','#ec4899'];
const MOON_COLORS = ['#e2e8f0','#f43f5e','#a78bfa','#60a5fa','#34d399','#fbbf24','#fb923c','#f472b6'];

const CALENDAR_SYSTEMS = {
  gregorian: {
    name:'Gregorian', months:[
      {name:'January',days:31},{name:'February',days:28},{name:'March',days:31},
      {name:'April',days:30},{name:'May',days:31},{name:'June',days:30},
      {name:'July',days:31},{name:'August',days:31},{name:'September',days:30},
      {name:'October',days:31},{name:'November',days:30},{name:'December',days:31}
    ], weekdays:['Mon','Tue','Wed','Thu','Fri','Sat','Sun'],
    moons:[{name:'Moon',cycle:29.5,color:'#e2e8f0'}], yearLabel:'AD', era:''
  },
  harptos: {
    name:'Harptos (Forgotten Realms)', months:[
      {name:'Hammer',days:30},{name:'Midwinter ❄',days:1,festival:true},
      {name:'Alturiak',days:30},{name:'Ches',days:30},{name:'Tarsakh',days:30},
      {name:'Greengrass 🌿',days:1,festival:true},{name:'Mirtul',days:30},
      {name:'Kythorn',days:30},{name:'Flamerule',days:30},
      {name:'Midsummer ☀',days:1,festival:true},{name:'Eleasis',days:30},
      {name:'Eleint',days:30},{name:'Highharvestide 🍂',days:1,festival:true},
      {name:'Marpenoth',days:30},{name:'Uktar',days:30},
      {name:'Feast of the Moon 🌙',days:1,festival:true},{name:'Nightal',days:30}
    ], weekdays:['1st','2nd','3rd','4th','5th','6th','7th','8th','9th','10th'],
    moons:[{name:'Selûne',cycle:30.4,color:'#e2e8f0'}], yearLabel:'DR', era:'Dale Reckoning'
  },
  exandrian: {
    name:'Exandrian (Critical Role)', months:[
      {name:'Horisal',days:29},{name:'Misuthar',days:30},{name:'Dualahei',days:30},
      {name:'Thunsheer',days:31},{name:'Unndilar',days:28},{name:'Brussendar',days:31},
      {name:'Sydenstar',days:32},{name:'Fessuran',days:29},{name:"Quen'pillar",days:27},
      {name:'Cuersaar',days:29},{name:'Duscar',days:32}
    ], weekdays:['Mir','Gri','Whe','Con','Fol','Yul','Dal'],
    moons:[{name:'Catha',cycle:33,color:'#e2e8f0'},{name:'Ruidus',cycle:43,color:'#f43f5e'}],
    yearLabel:'PD', era:'Post-Divergence'
  },
  golarion: {
    name:'Golarion (Pathfinder)', months:[
      {name:'Abadius',days:31},{name:'Calistril',days:28},{name:'Pharast',days:31},
      {name:'Gozran',days:30},{name:'Desnus',days:31},{name:'Sarenith',days:30},
      {name:'Erastus',days:31},{name:'Arodus',days:31},{name:'Rova',days:30},
      {name:'Lamashan',days:31},{name:'Neth',days:30},{name:'Kuthona',days:31}
    ], weekdays:['Moon','Toil','Weal','Oath','Fire','Star','Sun'],
    moons:[{name:'Somal',cycle:29.5,color:'#fbbf24'}], yearLabel:'AR', era:'Absalom Reckoning'
  },
  eberron: {
    name:'Eberron', months:[
      {name:'Zarantyr',days:28},{name:'Olarune',days:28},{name:'Therendor',days:28},
      {name:'Eyre',days:28},{name:'Dravago',days:28},{name:'Nymm',days:28},
      {name:'Lharvion',days:28},{name:'Barrakas',days:28},{name:'Rhaan',days:28},
      {name:'Sypheros',days:28},{name:'Aryth',days:28},{name:'Vult',days:28}
    ], weekdays:['Sul','Mol','Zol','Wir','Zor','Far','Sar'],
    moons:[{name:'Zarantyr',cycle:28,color:'#60a5fa'},{name:'Olarune',cycle:35,color:'#a78bfa'},{name:'Therendor',cycle:42,color:'#34d399'},{name:'Rhaan',cycle:36,color:'#fbbf24'}],
    yearLabel:'YK', era:'Year of the Kingdom'
  },
  greyhawk: {
    name:'Greyhawk (Oerth)', months:[
      {name:'Fireseek',days:28},{name:'Needfest ❄',days:7,festival:true},
      {name:'Readying',days:28},{name:'Coldeven',days:28},
      {name:'Growfest 🌸',days:7,festival:true},{name:'Planting',days:28},
      {name:'Flocktime',days:28},{name:'Richfest ☀',days:7,festival:true},
      {name:'Reaping',days:28},{name:'Goodmonth',days:28},
      {name:'Brewfest 🍂',days:7,festival:true},{name:'Harvester',days:28},
      {name:'Patchwall',days:28},{name:"Ready'reat",days:28},{name:'Sunsebb',days:28}
    ], weekdays:['Star','Sun','Moon','Gods','Water','Earth','Free'],
    moons:[{name:'Luna',cycle:28,color:'#e2e8f0'},{name:'Celene',cycle:91,color:'#a78bfa'}],
    yearLabel:'CY', era:'Common Year'
  },
  custom: {
    name:'Custom', months: Array.from({length:12},(_,i)=>({name:`Month ${i+1}`,days:30})),
    weekdays:['D1','D2','D3','D4','D5','D6','D7'],
    moons:[{name:'Moon',cycle:30,color:'#e2e8f0'}], yearLabel:'', era:''
  }
};

function getCalendar(tl) { return tl.customCalendar || CALENDAR_SYSTEMS[tl.calendarType] || CALENDAR_SYSTEMS.gregorian; }
function getCalMoons(cal) { return cal.moons || []; }
function getYearDays(cal) { return cal.months.reduce((s,m)=>s+m.days,0); }
function formatEventDate(date, cal) {
  if (!date) return '?';
  const mName = (cal && cal.months && cal.months[date.month]) ? cal.months[date.month].name : ('Month ' + (date.month + 1));
  return `${mName} ${date.day}, Year ${date.year}`;
}
function getTotalDays(date, cal) {
  let total = (date.year - 1) * getYearDays(cal);
  for (let i = 0; i < date.month; i++) total += cal.months[i].days;
  total += date.day; return total;
}
function dateFromTotalDays(totalDays, cal) {
  const yd = getYearDays(cal); if (yd <= 0) return {year:1,month:0,day:1};
  let year = Math.floor((totalDays - 1) / yd) + 1;
  let rem = totalDays - (year - 1) * yd; let month = 0;
  while (month < cal.months.length && rem > cal.months[month].days) { rem -= cal.months[month].days; month++; }
  if (month >= cal.months.length) { month = cal.months.length - 1; rem = cal.months[month].days; }
  return { year, month, day: Math.max(1, rem) };
}
function getMoonPhase(dayCount, cycleDays) {
  if (!cycleDays || cycleDays <= 0) return {icon:'🌑',name:'New Moon',phase:0};
  const pct = (((dayCount % cycleDays) + cycleDays) % cycleDays) / cycleDays;
  if (pct < 0.0625) return {icon:'🌑',name:'New Moon',phase:pct};
  if (pct < 0.1875) return {icon:'🌒',name:'Waxing Crescent',phase:pct};
  if (pct < 0.3125) return {icon:'🌓',name:'First Quarter',phase:pct};
  if (pct < 0.4375) return {icon:'🌔',name:'Waxing Gibbous',phase:pct};
  if (pct < 0.5625) return {icon:'🌕',name:'Full Moon',phase:pct};
  if (pct < 0.6875) return {icon:'🌖',name:'Waning Gibbous',phase:pct};
  if (pct < 0.8125) return {icon:'🌗',name:'Last Quarter',phase:pct};
  if (pct < 0.9375) return {icon:'🌘',name:'Waning Crescent',phase:pct};
  return {icon:'🌑',name:'New Moon',phase:pct};
}
function getCurrentTimeline() { return timelines.find(t => t.id === currentTimelineId); }

// ---- CREATE / SELECT / DELETE ----
function createTimeline(calendarType) {
  const baseCal = CALENDAR_SYSTEMS[calendarType];
  const id = 'tl_' + Date.now() + '_' + Math.floor(Math.random()*1000);
  const tl = {
    id, name: baseCal.name.split('(')[0].trim() + ' Timeline', calendarType,
    customCalendar: JSON.parse(JSON.stringify(baseCal)),
    color: TL_COLORS[timelines.length % TL_COLORS.length], image: null, tags: [],
    currentDate: { year: 1, month: 0, day: 1 }, events: [], showMoon: true
  };
  timelines.push(tl); currentTimelineId = id; calViewMonth = 0; calViewYear = 1; selectedEventId = null;
  renderTimelineView(); showTlDetailsPanel(); showNotif('Timeline created'); return tl;
}
function selectTimeline(id) {
  currentTimelineId = id; selectedEventId = null;
  const tl = getCurrentTimeline();
  if (tl) { calViewMonth = tl.currentDate.month; calViewYear = tl.currentDate.year;
    document.getElementById('tlNameInput').value = tl.name;
    document.getElementById('tlCalendarBadge').textContent = getCalendar(tl).name; }
  renderTimelineView(); showTlDetailsPanel();
}
function deleteTimeline(id) {
  timelines = timelines.filter(t => t.id !== id);
  if (currentTimelineId === id) currentTimelineId = timelines.length > 0 ? timelines[0].id : null;
  selectedEventId = null; renderTimelineView(); if (getCurrentTimeline()) showTlDetailsPanel(); showNotif('Timeline deleted');
}
function duplicateTimeline(id) {
  const src = timelines.find(t=>t.id===id); if (!src) return;
  const dup = JSON.parse(JSON.stringify(src));
  dup.id = 'tl_'+Date.now()+'_'+Math.floor(Math.random()*1000);
  dup.name = src.name+' (Copy)'; dup.color = TL_COLORS[timelines.length%TL_COLORS.length];
  dup.events.forEach(e => { e.id = 'evt_'+Date.now()+'_'+Math.floor(Math.random()*10000); });
  timelines.push(dup); currentTimelineId = dup.id;
  renderTimelineView(); showTlDetailsPanel(); showNotif('Timeline duplicated');
}

// ---- RIGHT PANEL: TIMELINE DETAILS ----
function showTlDetailsPanel() {
  const tl = getCurrentTimeline(); if (!tl) return;
  document.getElementById('detailsPanel')?.classList.remove('collapsed');
  document.getElementById('emptyState')?.classList.add('hidden');
  document.getElementById('cardDetails')?.classList.add('hidden');
  document.getElementById('pinDetails')?.classList.add('hidden');
  document.getElementById('chapterDetails')?.classList.add('hidden');
  document.getElementById('tlDetails')?.classList.remove('hidden');
  document.getElementById('tlCalendarPanel')?.classList.remove('hidden');
  document.getElementById('tlEventDetail')?.classList.add('hidden');
  document.getElementById('tlDetailName').value = tl.name;
  document.getElementById('tlDetailCalBadge').textContent = getCalendar(tl).name;
  document.querySelectorAll('#tlDetailColorOptions .pin-color-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.color === tl.color));
  const img=document.getElementById('tlDetailImage'), noImg=document.getElementById('tlDetailNoImage'), rb=document.getElementById('tlRemoveImageBtn');
  if(tl.image){img.src=tl.image;img.style.display='';noImg.style.display='none';rb.style.display='';}
  else{img.style.display='none';noImg.style.display='';rb.style.display='none';}
  renderTlDetailTags();
}
function renderTlDetailTags() {
  const tl=getCurrentTimeline(), d=document.getElementById('tlDetailTagsDisplay'); if(!d)return; if(!tl){d.innerHTML='';return;}
  d.innerHTML=tl.tags.map(tag=>`<span class="chapter-tag-pill">${tag} <span class="chapter-tag-remove" onclick="removeTlDetailTag('${tag.replace(/'/g,"\\'")}')">×</span></span>`).join('');
}
function addTlDetailTagFromInput() {
  const tl=getCurrentTimeline(); if(!tl)return; const input=document.getElementById('tlDetailTagsInput');
  const tags=input.value.split(',').map(t=>t.trim().toLowerCase()).filter(t=>t&&!tl.tags.includes(t));
  tl.tags.push(...tags); input.value=''; renderTlDetailTags(); renderTlTags(); renderTimelinesList();
}
function removeTlDetailTag(tag) { const tl=getCurrentTimeline(); if(!tl)return; tl.tags=tl.tags.filter(t=>t!==tag); renderTlDetailTags(); renderTlTags(); }
function removeTlImage() { const tl=getCurrentTimeline(); if(!tl)return; tl.image=null; showTlDetailsPanel(); renderTimelineView(); showNotif('Image removed'); }

// ---- RIGHT PANEL: EVENT DETAIL ----
function showEventDetailsPanel(eventId, tlId) {
  selectedEventId = eventId;
  if (tlId && tlId !== currentTimelineId) { currentTimelineId = tlId; renderTimelinesList(); }
  const tl=getCurrentTimeline(); if(!tl)return; const evt=tl.events.find(e=>e.id===eventId); if(!evt)return;
  const cal=getCalendar(tl); const mName=cal.months[evt.date.month]?cal.months[evt.date.month].name:'';
  document.getElementById('tlDetails')?.classList.add('hidden');
  const detail=document.getElementById('tlEventDetail');
  if(detail){
    detail.classList.remove('hidden');
    document.getElementById('tlEvtColorBar').style.background=evt.color;
    document.getElementById('tlEvtTitle').textContent=evt.title;
    let ds=`Day ${evt.date.day} of ${mName}, Year ${evt.date.year} ${cal.yearLabel}`;
    if(evt.endDate){const em=cal.months[evt.endDate.month]?cal.months[evt.endDate.month].name:'';ds+=` → Day ${evt.endDate.day} of ${em}, Year ${evt.endDate.year}`;}
    document.getElementById('tlEvtDateLabel').textContent=ds;
    document.getElementById('tlEvtDesc').textContent=evt.description||'';
    document.getElementById('tlEvtEra').textContent=evt.era||'';
    const tagsEl=document.getElementById('tlEvtTags');
    if(tagsEl) tagsEl.innerHTML=(evt.tags&&evt.tags.length>0)?evt.tags.map(t=>`<span class="tl-list-tag">${t}</span>`).join(''):'';
  }
}
function selectTlEvent(eventId, tlId) { showEventDetailsPanel(eventId,tlId); if(tlViewMode==='lanes')renderLanesView();else if(tlViewMode==='list')renderListView();else if(tlViewMode==='calgrid')renderCalGridView(); renderCalendarGrid(); }
function deselectTlEvent() { selectedEventId=null; document.getElementById('tlEventDetail')?.classList.add('hidden'); document.getElementById('tlDetails')?.classList.remove('hidden'); showTlDetailsPanel(); }
function deleteSelectedEvent() { const tl=getCurrentTimeline(); if(!tl||!selectedEventId)return; tl.events=tl.events.filter(e=>e.id!==selectedEventId); deselectTlEvent(); renderTimelineView(); showNotif('Event deleted'); }

// ---- RENDER MASTER ----
function renderTimelineView() {
  renderTimelinesList(); renderTlTags();
  if(tlViewMode==='lanes') renderLanesView(); else if(tlViewMode==='list') renderListView(); else if(tlViewMode==='calgrid') renderCalGridView(); else if(tlViewMode==='chronicle') renderChronicleView(); else if(tlViewMode==='age') renderAgeView(); else if(tlViewMode==='relmap') renderRelmapView(); else if(tlViewMode==='gantt') renderGanttView(); else if(tlViewMode==='storyboard') renderStoryboardView();
  updateTimelineDateDisplay(); renderCalendarGrid(); updateCalendarMoon();
  const tl=getCurrentTimeline(), empty=document.getElementById('tlEmptyState'), lanes=document.getElementById('tlLanesView'), list=document.getElementById('tlListView'), calgrid=document.getElementById('tlCalGridView'), chronicle=document.getElementById('tlChronicleView'), age=document.getElementById('tlAgeView'), relmap=document.getElementById('tlRelmapView'), gantt=document.getElementById('tlGanttView'), storyboard=document.getElementById('tlStoryboardView');
  if(!tl||timelines.length===0){if(empty)empty.style.display='';if(lanes)lanes.style.display='none';if(list)list.style.display='none';if(calgrid)calgrid.style.display='none';if(chronicle)chronicle.style.display='none';if(age)age.style.display='none';if(relmap)relmap.style.display='none';if(gantt)gantt.style.display='none';if(storyboard)storyboard.style.display='none';}
  else{if(empty)empty.style.display='none';if(lanes)lanes.style.display=tlViewMode==='lanes'?'':'none';if(list)list.style.display=tlViewMode==='list'?'':'none';if(calgrid)calgrid.style.display=tlViewMode==='calgrid'?'':'none';if(chronicle)chronicle.style.display=tlViewMode==='chronicle'?'':'none';if(age)age.style.display=tlViewMode==='age'?'':'none';if(relmap)relmap.style.display=tlViewMode==='relmap'?'':'none';if(gantt)gantt.style.display=tlViewMode==='gantt'?'':'none';if(storyboard)storyboard.style.display=tlViewMode==='storyboard'?'':'none';}
}
function renderTimelinesList() {
  const c=document.getElementById('timelinesList'); if(!c)return;
  c.innerHTML=timelines.map(tl=>{const cal=getCalendar(tl),a=tl.id===currentTimelineId?' active':'',h=tl.hidden?' item-hidden':'';
    const ib=tl.image?`<div style="background-image:url(${tl.image});background-size:cover;background-position:center;position:absolute;inset:0;opacity:0.2;border-radius:var(--radius-sm);"></div>`:'';
    const hideBadge=tl.hidden?'<span class="hidden-badge-sm" title="Hidden">👁</span>':'';
    return`<div class="sidebar-item${a}${h}" onclick="selectTimeline('${tl.id}')" oncontextmenu="showTlContextMenu(event,'${tl.id}')" style="position:relative;overflow:hidden;border-left:3px solid ${tl.color};">${ib}${hideBadge}<span class="sidebar-item-name" style="position:relative;z-index:1;">${tl.name}</span><span class="sidebar-item-sub" style="position:relative;z-index:1;">${cal.name.split('(')[0].trim()} · ${tl.events.length} events</span></div>`;
  }).join('')||'<div class="empty-pins-message">No timelines yet</div>';
}
function renderTlTags() {
  const tl=getCurrentTimeline(),d=document.getElementById('tlTagsDisplay'); if(!d)return; if(!tl){d.innerHTML='';return;}
  d.innerHTML=tl.tags.map(tag=>`<span class="chapter-tag-pill">${tag} <span class="chapter-tag-remove" onclick="removeTlTag('${tag.replace(/'/g,"\\'")}')">×</span></span>`).join('');
}
function addTlTagFromInput() { const tl=getCurrentTimeline(); if(!tl)return; const i=document.getElementById('tlTagsInput'); const t=i.value.split(',').map(t=>t.trim().toLowerCase()).filter(t=>t&&!tl.tags.includes(t)); tl.tags.push(...t); i.value=''; renderTlTags(); renderTlDetailTags(); }
function removeTlTag(tag) { const tl=getCurrentTimeline(); if(!tl)return; tl.tags=tl.tags.filter(t=>t!==tag); renderTlTags(); renderTlDetailTags(); }

// ---- LANES VIEW ----
function renderLanesView() {
  if(timelines.length===0)return; const rulerEl=document.getElementById('tlRuler'),lanesEl=document.getElementById('tlLanes'); if(!rulerEl||!lanesEl)return;
  const activeTl=getCurrentTimeline()||timelines[0], activeCal=getCalendar(activeTl);
  let minDay=Infinity,maxDay=-Infinity;
  timelines.forEach(tl=>{const cal=getCalendar(tl),c=getTotalDays(tl.currentDate,cal); if(c<minDay)minDay=c; if(c>maxDay)maxDay=c;
    tl.events.forEach(evt=>{const ed=getTotalDays(evt.date,cal); if(ed<minDay)minDay=ed; if(ed>maxDay)maxDay=ed; if(evt.endDate){const eed=getTotalDays(evt.endDate,cal);if(eed>maxDay)maxDay=eed;}});});
  if(minDay===Infinity){minDay=1;maxDay=getYearDays(activeCal);}
  const pad=Math.max(30,Math.floor((maxDay-minDay)*0.1)); minDay-=pad; maxDay+=pad;
  const pxPerDay=Math.max(0.5,8*tlZoom),totalWidth=(maxDay-minDay)*pxPerDay+140;
  const yearDays=getYearDays(activeCal), pxPerYear=yearDays*pxPerDay;
  let rulerHtml='';
  if(pxPerYear<40){const sd=dateFromTotalDays(Math.max(1,minDay),activeCal),ed=dateFromTotalDays(maxDay,activeCal);for(let dec=Math.floor(sd.year/10)*10;dec<=Math.ceil(ed.year/10)*10;dec+=10){const ds=getTotalDays({year:dec,month:0,day:1},activeCal),de=getTotalDays({year:dec+10,month:0,day:1},activeCal),ss=Math.max(minDay,ds),se=Math.min(maxDay,de);if(se<=ss)continue;rulerHtml+=`<div class="tl-ruler-segment year-start" style="width:${(se-ss)*pxPerDay}px;">${dec}s ${activeCal.yearLabel}</div>`;}}
  else if(pxPerYear<120){const sd=dateFromTotalDays(Math.max(1,minDay),activeCal),ed=dateFromTotalDays(maxDay,activeCal);for(let y=sd.year;y<=ed.year+1;y++){const ys=getTotalDays({year:y,month:0,day:1},activeCal),ye=getTotalDays({year:y+1,month:0,day:1},activeCal),ss=Math.max(minDay,ys),se=Math.min(maxDay,ye);if(se<=ss)continue;rulerHtml+=`<div class="tl-ruler-segment year-start" style="width:${(se-ss)*pxPerDay}px;">Year ${y} ${activeCal.yearLabel}</div>`;}}
  else if(pxPerYear<400){const sd=dateFromTotalDays(Math.max(1,minDay),activeCal),ed=dateFromTotalDays(maxDay,activeCal);for(let y=sd.year;y<=ed.year+1;y++){const mc=activeCal.months.length,qs=Math.max(1,Math.floor(mc/4));for(let q=0;q<4;q++){const ms=q*qs,me=(q===3)?mc-1:(q+1)*qs-1;if(ms>=mc)break;const qsd=getTotalDays({year:y,month:ms,day:1},activeCal),ame=Math.min(me,mc-1),qed=getTotalDays({year:y,month:ame,day:activeCal.months[ame].days},activeCal),ss=Math.max(minDay,qsd),se=Math.min(maxDay,qed);if(se<=ss)continue;const w=(se-ss)*pxPerDay,iy=q===0;rulerHtml+=`<div class="tl-ruler-segment${iy?' year-start':''}" style="width:${w}px;">Q${q+1}${iy?' · Y'+y+' '+activeCal.yearLabel:''}</div>`;}}}
  else{let d=minDay;while(d<=maxDay){const dt=dateFromTotalDays(Math.max(1,d),activeCal),m=activeCal.months[dt.month],md=m?m.days:30,som=getTotalDays({year:dt.year,month:dt.month,day:1},activeCal),eom=som+md-1,ss=Math.max(d,som),se=Math.min(maxDay,eom),sw=(se-ss+1)*pxPerDay,iy=dt.month===0&&ss<=som+1,isF=m&&m.festival;rulerHtml+=`<div class="tl-ruler-segment${iy?' year-start':''}${isF?' festival':''}" style="width:${sw}px;">${m?m.name.split('(')[0].trim():'?'}${iy?' · Y'+dt.year:''}</div>`;d=eom+1;}}
  rulerEl.innerHTML=rulerHtml; rulerEl.style.paddingLeft='140px';
  let lanesHtml='';
  timelines.forEach(tl=>{const cal=getCalendar(tl),nowD=getTotalDays(tl.currentDate,cal);let eh='';
    [...tl.events].sort((a,b)=>getTotalDays(a.date,cal)-getTotalDays(b.date,cal)).forEach(evt=>{const ed=getTotalDays(evt.date,cal),x=(ed-minDay)*pxPerDay;let w=evt.endDate?Math.max(pxPerDay*2,(getTotalDays(evt.endDate,cal)-ed)*pxPerDay):Math.max(pxPerDay*3,80*tlZoom);const sel=evt.id===selectedEventId?' selected':'';
      eh+=`<div class="tl-lane-event${sel}${evt.hidden?' item-hidden':''}" style="left:${x}px;width:${w}px;background:${evt.color}cc;" onclick="selectTlEvent('${evt.id}','${tl.id}')" oncontextmenu="showEvtContextMenu(event,'${evt.id}','${tl.id}')" title="${evt.title}${evt.hidden?' (hidden)':''}"><span class="tl-lane-event-title">${evt.title}</span></div>`;});
    eh+=`<div class="tl-now-line" style="left:${(nowD-minDay)*pxPerDay}px;"></div>`;
    const ib=tl.image?`<div class="tl-lane-image" style="background-image:url(${tl.image});"></div>`:'';
    lanesHtml+=`<div class="tl-lane${tl.hidden?' item-hidden':''}" oncontextmenu="showTlContextMenu(event,'${tl.id}')">${ib}<div class="tl-lane-color" style="background:${tl.color};"></div><div class="tl-lane-label" onclick="selectTimeline('${tl.id}')"><div class="tl-lane-name">${tl.name}${tl.hidden?' 👁':''}</div><div class="tl-lane-cal">${getCalendar(tl).name.split('(')[0].trim()}</div></div><div class="tl-lane-track" style="width:${totalWidth-140}px;">${eh}</div></div>`;});
  lanesEl.innerHTML=lanesHtml;
}

// ---- LIST VIEW ----
function renderListView() {
  const c=document.getElementById('tlListScroll'); if(!c)return;
  const tl=getCurrentTimeline(); if(!tl){c.innerHTML='<div class="tl-no-events"><p>Select a timeline to view events.</p></div>';return;}
  const cal=getCalendar(tl),curD=getTotalDays(tl.currentDate,cal),events=[...tl.events].sort((a,b)=>getTotalDays(a.date,cal)-getTotalDays(b.date,cal));
  if(events.length===0){c.innerHTML='<div class="tl-no-events"><p>No events yet. Click <strong>+ Event</strong> to add one.</p></div>';return;}
  let html='',lmk='';
  events.forEach(evt=>{const ed=getTotalDays(evt.date,cal),md=cal.months[evt.date.month],mn=md?md.name:`Month ${evt.date.month+1}`,mk=`${evt.date.year}-${evt.date.month}`,ip=ed<curD,ic=ed===curD,sel=evt.id===selectedEventId?' selected':'';
    if(mk!==lmk){lmk=mk;html+=`<div class="tl-list-month"><div class="tl-list-month-line"></div><div class="tl-list-month-label">${mn.split('(')[0].trim()}<span class="tl-list-month-year"> · Year ${evt.date.year} ${cal.yearLabel}</span></div><div class="tl-list-month-line"></div></div>`;}
    let dl=`Day ${evt.date.day}`;if(evt.endDate){const em=cal.months[evt.endDate.month];dl+=` → Day ${evt.endDate.day} ${em?em.name.split('(')[0].trim():''} Y${evt.endDate.year}`;}if(evt.era)dl+=` · ${evt.era}`;
    const th=(evt.tags&&evt.tags.length>0)?`<div class="tl-list-tags">${evt.tags.map(t=>`<span class="tl-list-tag">${t}</span>`).join('')}</div>`:'';
    let dh='';if(evt.description){if(evt.description.length>200){dh=`<div class="tl-list-desc"><span class="tl-desc-truncated" id="desc_t_${evt.id}">${parseWikiLinks(evt.description.substring(0,200).trim())}…</span><span class="tl-desc-full hidden" id="desc_f_${evt.id}">${parseWikiLinks(evt.description)}</span> <button class="tl-read-more" onclick="event.stopPropagation();toggleReadMore('${evt.id}')">Read more</button></div>`;}else dh=`<div class="tl-list-desc">${parseWikiLinks(evt.description)}</div>`;}
    html+=`<div class="tl-list-event${ip?' past':''}${ic?' current':''}${evt.hidden?' item-hidden':''}"><div class="tl-list-node" style="background:${evt.color};"></div><div class="tl-list-card${sel}" style="border-left-color:${evt.color};" onclick="selectTlEvent('${evt.id}','${tl.id}')" oncontextmenu="showEvtContextMenu(event,'${evt.id}','${tl.id}')"><div class="tl-list-date" style="color:${evt.color};">${dl}</div><div class="tl-list-title">${evt.title}${evt.hidden?' 👁':''}</div>${dh}${th}</div></div>`;});
  c.innerHTML=html;
}
function toggleReadMore(evtId){const t=document.getElementById('desc_t_'+evtId),f=document.getElementById('desc_f_'+evtId),b=t?.parentElement?.querySelector('.tl-read-more');if(!t||!f||!b)return;const s=!f.classList.contains('hidden');if(s){f.classList.add('hidden');t.classList.remove('hidden');b.textContent='Read more';}else{f.classList.remove('hidden');t.classList.add('hidden');b.textContent='Show less';}}

// ---- CALENDAR GRID VIEW (full month view) ----
function renderCalGridView() {
  const tl = getCurrentTimeline(); if (!tl) return;
  const cal = getCalendar(tl);
  const body = document.getElementById('calGridBody');
  const titleEl = document.getElementById('calGridTitle');
  if (!body || !titleEl) return;

  // Sync calgrid to current date on first render
  if (calGridMonth >= cal.months.length) calGridMonth = tl.currentDate.month || 0;
  if (calGridYear < 1) calGridYear = tl.currentDate.year || 1;

  const month = cal.months[calGridMonth];
  if (!month) return;

  // Render header with month select and year input
  const monthOpts = cal.months.map((m, i) => `<option value="${i}"${i === calGridMonth ? ' selected' : ''}>${m.name}</option>`).join('');
  titleEl.innerHTML = `<select id="calGridMonthSelect" class="detail-input" style="width:auto;padding:2px 6px;font-size:13px;font-weight:600;background:var(--bg-lighter);border:1px solid var(--border-color);color:var(--text-primary);">${monthOpts}</select>
    <span style="margin:0 4px;color:var(--text-muted);">—</span>
    <span style="color:var(--text-muted);font-size:12px;">Year</span>
    <input type="number" id="calGridYearInput" value="${calGridYear}" min="1" class="detail-input" style="width:60px;padding:2px 6px;font-size:13px;font-weight:600;text-align:center;background:var(--bg-lighter);border:1px solid var(--border-color);color:var(--text-primary);" />
    <button class="btn secondary sm" style="padding:2px 8px;font-size:10px;margin-left:4px;" onclick="calGridMonth=getCurrentTimeline().currentDate.month;calGridYear=getCurrentTimeline().currentDate.year;renderCalGridView();">Today</button>`;
  document.getElementById('calGridMonthSelect').onchange = (e) => { calGridMonth = parseInt(e.target.value); renderCalGridView(); };
  document.getElementById('calGridYearInput').onchange = (e) => { calGridYear = Math.max(1, parseInt(e.target.value) || 1); renderCalGridView(); };

  const daysInMonth = month.days || 30;
  const daysOfWeek = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
  const curDate = tl.currentDate;
  const isCurrentMonth = curDate.month === calGridMonth && curDate.year === calGridYear;

  // Get events for this month+year (including range events that span into this month)
  const monthEvents = tl.events.filter(evt => {
    // Start date in this month
    if (evt.date.month === calGridMonth && evt.date.year === calGridYear) return true;
    // Has end date that extends into or through this month
    if (evt.endDate) {
      const startTotal = getTotalDays(evt.date, cal);
      const endTotal = getTotalDays(evt.endDate, cal);
      const monthStart = getTotalDays({year: calGridYear, month: calGridMonth, day: 1}, cal);
      const monthEnd = getTotalDays({year: calGridYear, month: calGridMonth, day: daysInMonth}, cal);
      if (startTotal <= monthEnd && endTotal >= monthStart) return true;
    }
    return false;
  });

  // Build header
  let html = daysOfWeek.map(d => `<div class="tl-calgrid-day-header">${d}</div>`).join('');

  // Determine start offset (simple: day 1 starts on a weekday based on total days)
  const totalDaysBefore = getTotalDays({year: calGridYear, month: calGridMonth, day: 1}, cal);
  const startWeekday = totalDaysBefore % 7;

  // Empty cells before month starts
  for (let i = 0; i < startWeekday; i++) {
    html += '<div class="tl-calgrid-cell empty"></div>';
  }

  // Day cells
  for (let d = 1; d <= daysInMonth; d++) {
    const isToday = isCurrentMonth && curDate.day === d;
    const dayTotal = getTotalDays({year: calGridYear, month: calGridMonth, day: d}, cal);
    const dayEvents = monthEvents.filter(evt => {
      const startTotal = getTotalDays(evt.date, cal);
      const endTotal = evt.endDate ? getTotalDays(evt.endDate, cal) : startTotal;
      return dayTotal >= startTotal && dayTotal <= endTotal;
    });
    const evtHtml = dayEvents.slice(0, 3).map(evt =>
      `<div class="tl-calgrid-evt${evt.hidden ? ' item-hidden' : ''}" style="background:${evt.color}cc;" onclick="event.stopPropagation();selectTlEvent('${evt.id}','${tl.id}')" title="${evt.title}">${evt.title}</div>`
    ).join('');
    const moreHtml = dayEvents.length > 3 ? `<div style="font-size:9px;color:var(--text-muted);">+${dayEvents.length - 3} more</div>` : '';
    html += `<div class="tl-calgrid-cell${isToday ? ' today' : ''}">
      <div class="tl-calgrid-daynum">${d}</div>
      ${evtHtml}${moreHtml}
    </div>`;
  }

  body.innerHTML = html;
}

// ---- CALENDAR GRID ----
function renderCalendarGrid() {
  const tl=getCurrentTimeline(),grid=document.getElementById('tlCalGrid'),title=document.getElementById('tlCalTitle');
  if(!grid||!tl){if(grid)grid.innerHTML='';return;} const cal=getCalendar(tl);
  if(calViewMonth>=cal.months.length)calViewMonth=0; const month=cal.months[calViewMonth]; if(!month)return;
  if(title)title.textContent=`${month.name} · Year ${calViewYear} ${cal.yearLabel}`;
  const wd=cal.weekdays||['D1','D2','D3','D4','D5','D6','D7'];
  let html=wd.map(w=>`<div class="tl-cal-weekday">${w}</div>`).join('');
  grid.style.gridTemplateColumns=`repeat(${wd.length}, 1fr)`;
  const fdt=getTotalDays({year:calViewYear,month:calViewMonth,day:1},cal), off=wd.length>0?(fdt-1)%wd.length:0;
  for(let i=0;i<off;i++)html+='<div class="tl-cal-day empty"></div>';
  const moons=getCalMoons(cal);
  for(let d=1;d<=month.days;d++){
    const isToday=tl.currentDate.month===calViewMonth&&tl.currentDate.year===calViewYear&&tl.currentDate.day===d;
    const isSel=calSelectedDay===d;
    const dayTotal=getTotalDays({year:calViewYear,month:calViewMonth,day:d},cal);
    const dayEvents=tl.events.filter(e=>{const s=getTotalDays(e.date,cal),en=e.endDate?getTotalDays(e.endDate,cal):s;return dayTotal>=s&&dayTotal<=en;});
    let cls='tl-cal-day';if(isToday)cls+=' today';if(isSel)cls+=' selected';if(dayEvents.length>0)cls+=' has-event';
    // Moon dots (colored, show for full/new moon)
    let moonDots='';
    moons.forEach(m=>{const p=getMoonPhase(dayTotal,m.cycle);if(p.name==='Full Moon'||p.name==='New Moon'){moonDots+=`<span class="tl-cal-day-moon" style="background:${m.color};${p.name==='New Moon'?'opacity:0.3;':''}"></span>`;}});
    const evtDot=dayEvents.length>0?`<span class="tl-cal-dot${dayEvents.length>1?' multi':''}" style="background:${dayEvents[0].color};"></span>`:'';
    const ttParts=moons.map(m=>{const p=getMoonPhase(dayTotal,m.cycle);return`${m.name}: ${p.name}`;}).join(' | ');
    html+=`<div class="${cls}" onclick="selectCalDay(${d})" title="${ttParts}"><span>${d}</span>${moonDots}${evtDot}</div>`;
  }
  grid.innerHTML=html;
}
function selectCalDay(day){calSelectedDay=day;renderCalendarGrid();renderCalDayEvents(day);}
function renderCalDayEvents(day){const tl=getCurrentTimeline(),list=document.getElementById('tlCalEventList');if(!list||!tl)return;const cal=getCalendar(tl),dt=getTotalDays({year:calViewYear,month:calViewMonth,day:day},cal);const evts=tl.events.filter(e=>{const s=getTotalDays(e.date,cal),en=e.endDate?getTotalDays(e.endDate,cal):s;return dt>=s&&dt<=en;});if(evts.length===0){list.innerHTML='<div class="empty-pins-message">No events on this day</div>';return;}list.innerHTML=evts.map(evt=>`<div class="tl-cal-evt-item${evt.id===selectedEventId?' selected':''}" style="border-left-color:${evt.color};" onclick="selectTlEvent('${evt.id}','${tl.id}')"><div class="tl-cal-evt-item-title">${evt.title}</div>${evt.description?`<div class="tl-cal-evt-item-desc">${evt.description.length>100?evt.description.substring(0,100)+'…':evt.description}</div>`:''}</div>`).join('');}

function updateCalendarMoon() {
  const tl=getCurrentTimeline(),moonEl=document.getElementById('tlCalMoon'); if(!moonEl)return; if(!tl){moonEl.innerHTML='';return;}
  const cal=getCalendar(tl), totalDays=getTotalDays(tl.currentDate,cal), moons=getCalMoons(cal);
  if(moons.length===0){moonEl.innerHTML='<div style="font-size:10px;color:var(--text-muted);padding:6px 0;">No moons configured</div>';return;}
  let html='<div class="tl-moon-legend">';
  moons.forEach(m=>{
    const p=getMoonPhase(totalDays,m.cycle);
    html+=`<div class="tl-moon-legend-item"><span class="tl-moon-dot" style="background:${m.color};${p.name==='Full Moon'?'box-shadow:0 0 8px '+m.color+';':''}${p.name==='New Moon'?'opacity:0.25;':''}"></span><span><strong>${m.name}</strong>: ${p.name}</span><span style="opacity:0.5">(${m.cycle}d)</span></div>`;
  });
  html+='</div>';
  moonEl.innerHTML=html;
}

function calNavMonth(dir){const tl=getCurrentTimeline();if(!tl)return;const cal=getCalendar(tl);calViewMonth+=dir;if(calViewMonth>=cal.months.length){calViewMonth=0;calViewYear++;}if(calViewMonth<0){calViewMonth=cal.months.length-1;calViewYear--;}calSelectedDay=null;renderCalendarGrid();document.getElementById('tlCalEventList').innerHTML='<div class="empty-pins-message">Click a day to see events</div>';}
function updateTimelineDateDisplay(){const tl=getCurrentTimeline(),me=document.getElementById('tlDateMain'),mo=document.getElementById('tlMoonDisplay');if(!tl){if(me)me.textContent='No timeline selected';if(mo)mo.innerHTML='';return;}const cal=getCalendar(tl),d=tl.currentDate,mn=cal.months[d.month]?cal.months[d.month].name.split('(')[0].trim():'?';if(me)me.textContent=`Day ${d.day} of ${mn}, Year ${d.year} ${cal.yearLabel}`;if(mo){const td=getTotalDays(d,cal),moons=getCalMoons(cal);mo.innerHTML=moons.map(m=>{const p=getMoonPhase(td,m.cycle);return`<div class="tl-moon-row"><span class="tl-moon-dot" style="background:${m.color};width:8px;height:8px;display:inline-block;border-radius:50;vertical-align:middle;margin-right:4px;"></span> ${m.name}: ${p.name}</div>`;}).join('');}}
function advanceDay(dir){const tl=getCurrentTimeline();if(!tl)return;const cal=getCalendar(tl),d=tl.currentDate;d.day+=dir;while(d.day>(cal.months[d.month]?.days||30)){d.day-=cal.months[d.month].days;d.month++;if(d.month>=cal.months.length){d.month=0;d.year++;}}while(d.day<1){d.month--;if(d.month<0){d.month=cal.months.length-1;d.year--;}d.day+=cal.months[d.month].days;}calViewMonth=d.month;calViewYear=d.year;renderTimelineView();}
function populateMonthSelects(){const tl=getCurrentTimeline();if(!tl)return;const cal=getCalendar(tl),h=cal.months.map((m,i)=>`<option value="${i}">${m.name}</option>`).join('');['eventMonth','eventEndMonth','setDateMonth'].forEach(id=>{const el=document.getElementById(id);if(el)el.innerHTML=h;});}

// ---- CONTEXT MENUS ----
function showTlContextMenu(e,tlId){e.preventDefault();e.stopPropagation();hideAllContextMenus();ctxTimelineId=tlId;const m=document.getElementById('tlContextMenu');m.classList.remove('hidden');positionContextMenu(m,e.clientX,e.clientY);}
function showEvtContextMenu(e,evtId,tlId){e.preventDefault();e.stopPropagation();hideAllContextMenus();ctxEventId=evtId;ctxEventTlId=tlId;const m=document.getElementById('evtContextMenu');m.classList.remove('hidden');positionContextMenu(m,e.clientX,e.clientY);}
function positionContextMenu(m,x,y){m.style.left=x+'px';m.style.top=y+'px';requestAnimationFrame(()=>{const r=m.getBoundingClientRect();if(r.right>window.innerWidth)m.style.left=(window.innerWidth-r.width-8)+'px';if(r.bottom>window.innerHeight)m.style.top=(window.innerHeight-r.height-8)+'px';});}
function hideAllContextMenus(){document.getElementById('tlContextMenu')?.classList.add('hidden');document.getElementById('evtContextMenu')?.classList.add('hidden');ctxTimelineId=null;ctxEventId=null;ctxEventTlId=null;closeAllContextMenus();}
function duplicateTimelineCtx(){if(ctxTimelineId)duplicateTimeline(ctxTimelineId);hideAllContextMenus();}
function deleteTimelineCtx(){if(ctxTimelineId)deleteTimeline(ctxTimelineId);hideAllContextMenus();}
function editCalendarCtx(){hideAllContextMenus();if(ctxTimelineId){currentTimelineId=ctxTimelineId;renderTimelinesList();}openCalendarEditor();}
function setTlImageCtx(){hideAllContextMenus();if(ctxTimelineId){currentTimelineId=ctxTimelineId;document.getElementById('tlImageInput').click();}}
function toggleHideTimelineCtx(){if(ctxTimelineId){const tl=timelines.find(t=>t.id===ctxTimelineId);if(tl){tl.hidden=!tl.hidden;renderTimelinesList();renderTimelinesView();showNotif(tl.hidden?'Timeline hidden':'Timeline visible');}}hideAllContextMenus();}
function toggleHideEventCtx(){if(ctxEventId&&ctxEventTlId){const tl=timelines.find(t=>t.id===ctxEventTlId);if(tl){const evt=tl.events.find(e=>e.id===ctxEventId);if(evt){evt.hidden=!evt.hidden;renderTimelinesView();showNotif(evt.hidden?'Event hidden':'Event visible');}}}hideAllContextMenus();}
function editEventCtx(){const e=ctxEventId,t=ctxEventTlId;hideAllContextMenus();if(t){currentTimelineId=t;renderTimelinesList();}if(e){populateMonthSelects();openEventEditor(e);}}
function duplicateEventCtx(){const ei=ctxEventId,ti=ctxEventTlId;hideAllContextMenus();if(!ti)return;const tl=timelines.find(t=>t.id===ti);if(!tl)return;const src=tl.events.find(e=>e.id===ei);if(!src)return;const dup=JSON.parse(JSON.stringify(src));dup.id='evt_'+Date.now()+'_'+Math.floor(Math.random()*10000);dup.title=src.title+' (Copy)';tl.events.push(dup);renderTimelineView();showNotif('Event duplicated');}
function moveEventToCurrentDateCtx(){const ei=ctxEventId,ti=ctxEventTlId;hideAllContextMenus();if(!ti)return;const tl=timelines.find(t=>t.id===ti);if(!tl)return;const evt=tl.events.find(e=>e.id===ei);if(!evt)return;evt.date={...tl.currentDate};if(evt.endDate)evt.endDate=null;renderTimelineView();showNotif('Event moved');}
function deleteEventCtx(){const ei=ctxEventId,ti=ctxEventTlId;hideAllContextMenus();if(!ti)return;const tl=timelines.find(t=>t.id===ti);if(!tl)return;tl.events=tl.events.filter(e=>e.id!==ei);if(selectedEventId===ei)deselectTlEvent();renderTimelineView();showNotif('Event deleted');}
function handleTlImageUpload(e){const tl=getCurrentTimeline();if(!tl)return;const file=e.target.files[0];if(!file)return;if(window.craftUploadImage){showNotif('Uploading image...');window.craftUploadImage(file).then(function(url){tl.image=url;renderTimelineView();showTlDetailsPanel();showNotif('Image uploaded');}).catch(function(err){console.error('Upload failed:',err);const r=new FileReader();r.onload=function(ev){tl.image=ev.target.result;renderTimelineView();showTlDetailsPanel();showNotif('Upload failed, using local');};r.readAsDataURL(file);});}else{const r=new FileReader();r.onload=function(ev){tl.image=ev.target.result;renderTimelineView();showTlDetailsPanel();showNotif('Image set');};r.readAsDataURL(file);}e.target.value='';}

// ---- EVENT EDITOR ----
function openEventEditor(eventId){const tl=getCurrentTimeline();if(!tl)return;populateMonthSelects();editingEventId=eventId||null;const evt=eventId?tl.events.find(e=>e.id===eventId):null;document.getElementById('eventEditorTitle').textContent=evt?'Edit Event':'Add Event';document.getElementById('eventTitle').value=evt?evt.title:'';document.getElementById('eventDay').value=evt?evt.date.day:(tl.currentDate.day||1);document.getElementById('eventMonth').value=evt?evt.date.month:(tl.currentDate.month||0);document.getElementById('eventYear').value=evt?evt.date.year:(tl.currentDate.year||1);document.getElementById('eventDesc').value=evt?(evt.description||''):'';document.getElementById('eventEra').value=evt?(evt.era||''):'';document.getElementById('deleteEventBtn').style.display=evt?'':'none';const hr=evt&&evt.endDate;document.getElementById('eventRangeToggle').checked=!!hr;document.getElementById('eventEndDateRow').style.display=hr?'':'none';document.getElementById('eventEndDay').value=hr?evt.endDate.day:(evt?evt.date.day:tl.currentDate.day||1);document.getElementById('eventEndMonth').value=hr?evt.endDate.month:(evt?evt.date.month:tl.currentDate.month||0);document.getElementById('eventEndYear').value=hr?evt.endDate.year:(evt?evt.date.year:tl.currentDate.year||1);const color=evt?evt.color:'#d4a824';document.querySelectorAll('#eventColorOptions .pin-color-btn').forEach(btn=>btn.classList.toggle('active',btn.dataset.color===color));editingEventTags=evt&&evt.tags?[...evt.tags]:[];document.getElementById('eventTagsInput').value='';renderEventTagPills();document.getElementById('eventEditorModal').classList.remove('hidden');}
function closeEventEditor(){document.getElementById('eventEditorModal').classList.add('hidden');editingEventId=null;editingEventTags=[];}
function renderEventTagPills(){const d=document.getElementById('eventTagsDisplay');if(!d)return;d.innerHTML=editingEventTags.map(tag=>`<span class="chapter-tag-pill">${tag} <span class="chapter-tag-remove" onclick="removeEventTag('${tag.replace(/'/g,"\\'")}')">×</span></span>`).join('');}
function addEventTagFromInput(){const i=document.getElementById('eventTagsInput'),t=i.value.split(',').map(t=>t.trim().toLowerCase()).filter(t=>t&&!editingEventTags.includes(t));editingEventTags.push(...t);i.value='';renderEventTagPills();}
function removeEventTag(tag){editingEventTags=editingEventTags.filter(t=>t!==tag);renderEventTagPills();}
function saveEvent(){const tl=getCurrentTimeline();if(!tl)return;const title=document.getElementById('eventTitle').value.trim();if(!title){showNotif('Event needs a title');return;}const date={day:parseInt(document.getElementById('eventDay').value)||1,month:parseInt(document.getElementById('eventMonth').value)||0,year:parseInt(document.getElementById('eventYear').value)||1};const hr=document.getElementById('eventRangeToggle').checked;let endDate=null;if(hr)endDate={day:parseInt(document.getElementById('eventEndDay').value)||1,month:parseInt(document.getElementById('eventEndMonth').value)||0,year:parseInt(document.getElementById('eventEndYear').value)||1};const desc=document.getElementById('eventDesc').value.trim(),era=document.getElementById('eventEra').value.trim(),ac=document.querySelector('#eventColorOptions .pin-color-btn.active'),color=ac?ac.dataset.color:'#d4a824',tags=[...editingEventTags];if(editingEventId){const evt=tl.events.find(e=>e.id===editingEventId);if(evt){evt.title=title;evt.date=date;evt.endDate=endDate;evt.description=desc;evt.color=color;evt.era=era;evt.tags=tags;}}else{tl.events.push({id:'evt_'+Date.now()+'_'+Math.floor(Math.random()*1000),title,date,endDate,description:desc,color,era,tags});}closeEventEditor();renderTimelineView();showNotif(editingEventId?'Event updated':'Event added');}
function deleteCurrentEvent(){const tl=getCurrentTimeline();if(!tl||!editingEventId)return;tl.events=tl.events.filter(e=>e.id!==editingEventId);closeEventEditor();if(selectedEventId===editingEventId)deselectTlEvent();renderTimelineView();showNotif('Event deleted');}
function applySetDate(){const tl=getCurrentTimeline();if(!tl)return;tl.currentDate={day:parseInt(document.getElementById('setDateDay').value)||1,month:parseInt(document.getElementById('setDateMonth').value)||0,year:parseInt(document.getElementById('setDateYear').value)||1};calViewMonth=tl.currentDate.month;calViewYear=tl.currentDate.year;document.getElementById('setDateModal').classList.add('hidden');renderTimelineView();showNotif('Date updated');}

// ---- CALENDAR EDITOR (with dynamic moons) ----
function openCalendarEditor(){
  const tl=getCurrentTimeline();if(!tl)return;
  if(!tl.customCalendar)tl.customCalendar=JSON.parse(JSON.stringify(CALENDAR_SYSTEMS[tl.calendarType]||CALENDAR_SYSTEMS.custom));
  const cal=tl.customCalendar;
  document.getElementById('calYearLabel').value=cal.yearLabel||'';
  document.getElementById('calEraName').value=cal.era||'';
  document.getElementById('calWeekdays').value=(cal.weekdays||[]).join(', ');
  renderCalMonthsEditor(cal.months);
  renderCalMoonsEditor(cal.moons||[]);
  document.getElementById('calendarEditorModal').classList.remove('hidden');
}
function closeCalendarEditor(){document.getElementById('calendarEditorModal').classList.add('hidden');}
function renderCalMonthsEditor(months){const c=document.getElementById('calMonthsEditor');c.innerHTML=months.map((m,i)=>`<div class="cal-month-row" data-index="${i}"><input type="text" class="popup-input cal-month-name" value="${m.name}" placeholder="Month name..." /><input type="number" class="popup-input cal-month-days" value="${m.days}" min="1" max="100" title="Days" /><button class="cal-month-festival${m.festival?' active':''}" title="Festival" onclick="toggleCalFestival(this)">★</button><button class="cal-month-remove" onclick="removeCalMonth(${i})">×</button></div>`).join('');}
function addCalendarMonth(){const c=document.getElementById('calMonthsEditor'),n=c.querySelectorAll('.cal-month-row').length;const div=document.createElement('div');div.className='cal-month-row';div.dataset.index=n;div.innerHTML=`<input type="text" class="popup-input cal-month-name" value="New Month" /><input type="number" class="popup-input cal-month-days" value="30" min="1" max="100" /><button class="cal-month-festival" onclick="toggleCalFestival(this)">★</button><button class="cal-month-remove" onclick="removeCalMonth(${n})">×</button>`;c.appendChild(div);}
function removeCalMonth(idx){const c=document.getElementById('calMonthsEditor'),rows=c.querySelectorAll('.cal-month-row');if(rows.length<=1){showNotif('Need at least one month');return;}rows[idx]?.remove();c.querySelectorAll('.cal-month-row').forEach((row,i)=>{row.dataset.index=i;const rb=row.querySelector('.cal-month-remove');if(rb)rb.setAttribute('onclick',`removeCalMonth(${i})`);});}
function toggleCalFestival(btn){btn.classList.toggle('active');}

// Dynamic moons editor
function renderCalMoonsEditor(moons){
  const c=document.getElementById('calMoonsEditor');
  c.innerHTML=moons.map((m,i)=>`<div class="cal-moon-row" data-index="${i}">
    <input type="color" class="cal-moon-color" value="${m.color||'#e2e8f0'}" title="Moon color" />
    <input type="text" class="popup-input" value="${m.name}" placeholder="Moon name..." style="flex:2;" />
    <input type="number" class="popup-input cal-moon-cycle-input" value="${m.cycle}" placeholder="Cycle" step="0.1" title="Cycle in days" />
    <button class="cal-month-remove" onclick="removeCalMoon(${i})" title="Remove">×</button>
  </div>`).join('');
}
function addCalendarMoon(){
  const c=document.getElementById('calMoonsEditor'),n=c.querySelectorAll('.cal-moon-row').length;
  const color=MOON_COLORS[n%MOON_COLORS.length];
  const div=document.createElement('div');div.className='cal-moon-row';div.dataset.index=n;
  div.innerHTML=`<input type="color" class="cal-moon-color" value="${color}" title="Moon color" /><input type="text" class="popup-input" value="New Moon" placeholder="Moon name..." style="flex:2;" /><input type="number" class="popup-input cal-moon-cycle-input" value="30" placeholder="Cycle" step="0.1" /><button class="cal-month-remove" onclick="removeCalMoon(${n})">×</button>`;
  c.appendChild(div);
}
function removeCalMoon(idx){
  const c=document.getElementById('calMoonsEditor'),rows=c.querySelectorAll('.cal-moon-row');
  rows[idx]?.remove();
  c.querySelectorAll('.cal-moon-row').forEach((row,i)=>{row.dataset.index=i;const rb=row.querySelector('.cal-month-remove');if(rb)rb.setAttribute('onclick',`removeCalMoon(${i})`);});
}

function saveCalendarEdits(){
  const tl=getCurrentTimeline();if(!tl)return;if(!tl.customCalendar)tl.customCalendar={};const cal=tl.customCalendar;
  cal.yearLabel=document.getElementById('calYearLabel').value.trim();
  cal.era=document.getElementById('calEraName').value.trim();
  cal.weekdays=document.getElementById('calWeekdays').value.split(',').map(w=>w.trim()).filter(w=>w);
  if(cal.weekdays.length===0)cal.weekdays=['D1','D2','D3','D4','D5','D6','D7'];
  // Months
  cal.months=[];document.querySelectorAll('#calMonthsEditor .cal-month-row').forEach(row=>{const name=row.querySelector('.cal-month-name').value.trim()||'Unnamed',days=parseInt(row.querySelector('.cal-month-days').value)||30,festival=row.querySelector('.cal-month-festival')?.classList.contains('active')||false;cal.months.push({name,days,festival});});
  if(cal.months.length===0)cal.months.push({name:'Month 1',days:30});
  // Moons (new unified format)
  cal.moons=[];document.querySelectorAll('#calMoonsEditor .cal-moon-row').forEach(row=>{const inputs=row.querySelectorAll('input');const color=inputs[0].value||'#e2e8f0',name=inputs[1].value.trim()||'Moon',cycle=parseFloat(inputs[2].value)||30;cal.moons.push({name,cycle,color});});
  cal.name=cal.name||CALENDAR_SYSTEMS[tl.calendarType]?.name||'Custom';
  if(tl.currentDate.month>=cal.months.length)tl.currentDate.month=0;
  if(tl.currentDate.day>cal.months[tl.currentDate.month].days)tl.currentDate.day=1;
  closeCalendarEditor();renderTimelineView();populateMonthSelects();showTlDetailsPanel();showNotif('Calendar updated');
}

// ---- Chronicle View ----
function renderChronicleView() {
  const el = document.getElementById('tlChronicleScroll');
  if (!el) return;
  const tl = getCurrentTimeline();
  if (!tl || !tl.events.length) { el.innerHTML = '<div class="tl-no-events"><p>No events to show.</p></div>'; return; }
  const cal = getCalendar(tl);
  const sorted = [...tl.events].sort((a, b) => getTotalDays(a.date, cal) - getTotalDays(b.date, cal));
  let html = '<div class="tl-chronicle-line">';
  sorted.forEach((evt, i) => {
    const side = i % 2 === 0 ? 'left' : 'right';
    const dateStr = formatEventDate(evt.date, cal);
    const eraBadge = evt.era ? `<span class="tl-chronicle-era" style="background:${evt.color}40;color:${evt.color}">${evt.era}</span>` : '';
    html += `<div class="tl-chronicle-item ${side}${evt.hidden ? ' item-hidden' : ''}" onclick="selectTlEvent('${evt.id}','${tl.id}')">
      <div class="tl-chronicle-dot" style="background:${evt.color}"></div>
      <div class="tl-chronicle-card">
        <div class="tl-chronicle-date">${dateStr}</div>
        ${eraBadge}
        <div class="tl-chronicle-title">${evt.title}</div>
        ${evt.description ? `<div class="tl-chronicle-desc">${evt.description.substring(0, 120)}${evt.description.length > 120 ? '…' : ''}</div>` : ''}
        ${evt.tags && evt.tags.length ? `<div class="tl-chronicle-tags">${evt.tags.map(t => `<span class="tl-tag-pill mini">${t}</span>`).join('')}</div>` : ''}
      </div>
    </div>`;
  });
  html += '</div>';
  el.innerHTML = html;
}

// ---- Age Tracker View ----
function renderAgeView() {
  const el = document.getElementById('tlAgeContent');
  if (!el) return;
  const tl = getCurrentTimeline();
  if (!tl) { el.innerHTML = '<div class="tl-no-events"><p>No timeline selected.</p></div>'; return; }
  const cal = getCalendar(tl);
  const sorted = [...tl.events].sort((a, b) => getTotalDays(a.date, cal) - getTotalDays(b.date, cal));

  // Group events by era
  const eras = {};
  sorted.forEach(evt => {
    const era = evt.era || 'Unclassified';
    if (!eras[era]) eras[era] = { events: [], color: evt.color };
    eras[era].events.push(evt);
  });

  // Also gather character cards from boards for cross-reference
  const characters = [];
  (typeof boards !== 'undefined' ? boards : []).forEach(b => {
    (b.cards || []).forEach(c => {
      if (c.type === 'character') characters.push({ name: c.title || 'Unknown', id: c.id });
    });
  });

  let html = '<div class="tl-age-tracker">';

  // Era summary header
  html += '<div class="tl-age-eras">';
  Object.entries(eras).forEach(([eraName, eraData]) => {
    const count = eraData.events.length;
    const first = eraData.events[0];
    const last = eraData.events[eraData.events.length - 1];
    const span = getTotalDays(last.date, cal) - getTotalDays(first.date, cal);
    html += `<div class="tl-age-era-card">
      <div class="tl-age-era-color" style="background:${eraData.color}"></div>
      <div class="tl-age-era-info">
        <div class="tl-age-era-name">${eraName}</div>
        <div class="tl-age-era-meta">${count} event${count !== 1 ? 's' : ''} · ${formatEventDate(first.date, cal)} → ${formatEventDate(last.date, cal)}</div>
      </div>
    </div>`;
  });
  html += '</div>';

  // Character mentions across events
  if (characters.length > 0) {
    html += '<div class="tl-age-section"><div class="tl-age-section-title">Character Activity</div>';
    html += '<div class="tl-age-char-grid">';
    characters.forEach(ch => {
      const mentions = sorted.filter(e => (e.title + ' ' + (e.description || '')).toLowerCase().includes(ch.name.toLowerCase()));
      if (mentions.length === 0) return;
      html += `<div class="tl-age-char-row">
        <span class="tl-age-char-name">${ch.name}</span>
        <span class="tl-age-char-count">${mentions.length} event${mentions.length !== 1 ? 's' : ''}</span>
        <div class="tl-age-char-dots">${mentions.map(m => `<span class="tl-age-dot" style="background:${m.color}" title="${m.title}"></span>`).join('')}</div>
      </div>`;
    });
    html += '</div></div>';
  }

  // Full event table
  html += '<div class="tl-age-section"><div class="tl-age-section-title">All Events</div>';
  html += '<table class="tl-age-table"><thead><tr><th>Date</th><th>Event</th><th>Era</th><th>Tags</th></tr></thead><tbody>';
  sorted.forEach(evt => {
    const dateStr = formatEventDate(evt.date, cal);
    html += `<tr class="${evt.hidden ? 'item-hidden' : ''}" onclick="selectTlEvent('${evt.id}','${tl.id}')" style="cursor:pointer">
      <td style="white-space:nowrap">${dateStr}</td>
      <td><span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${evt.color};margin-right:6px;"></span>${evt.title}</td>
      <td>${evt.era || '—'}</td>
      <td>${(evt.tags || []).map(t => `<span class="tl-tag-pill mini">${t}</span>`).join(' ')}</td>
    </tr>`;
  });
  html += '</tbody></table></div>';
  html += '</div>';
  el.innerHTML = html;
}

// ---- Relationship Map View ----
function renderRelmapView() {
  const nodesEl = document.getElementById('tlRelmapNodes');
  const svgEl = document.getElementById('tlRelmapSvg');
  if (!nodesEl || !svgEl) return;
  const tl = getCurrentTimeline();
  if (!tl || !tl.events.length) { nodesEl.innerHTML = '<div class="tl-no-events"><p>No events to map.</p></div>'; svgEl.innerHTML = ''; return; }
  const cal = getCalendar(tl);
  const sorted = [...tl.events].filter(e => !e.hidden || window.craftCanViewHidden).sort((a, b) => getTotalDays(a.date, cal) - getTotalDays(b.date, cal));
  if (!sorted.length) { nodesEl.innerHTML = '<div class="tl-no-events"><p>No visible events.</p></div>'; svgEl.innerHTML = ''; return; }

  nodesEl.innerHTML = '';
  svgEl.innerHTML = '';
  const container = nodesEl.parentElement;
  const cw = container.clientWidth || 800;
  const ch = container.clientHeight || 500;

  // Layout events in a grid
  const cols = Math.ceil(Math.sqrt(sorted.length * 1.5));
  const rows = Math.ceil(sorted.length / cols);
  const cellW = Math.max(160, (cw - 40) / cols);
  const cellH = Math.max(80, (ch - 40) / rows);
  const positions = [];

  sorted.forEach((evt, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = 20 + col * cellW + cellW / 2 - 60;
    const y = 20 + row * cellH + cellH / 2 - 25;
    positions.push({ x, y, evt });

    const node = document.createElement('div');
    node.className = 'tl-relmap-node' + (evt.hidden ? ' item-hidden' : '');
    node.style.left = x + 'px';
    node.style.top = y + 'px';
    node.style.borderColor = evt.color || 'var(--border-color)';
    node.innerHTML = `<div class="tl-relmap-node-title">${evt.title}</div>
      <div class="tl-relmap-node-date">${formatEventDate(evt.date, cal)}</div>
      ${evt.era ? `<div style="font-size:8px;color:${evt.color};margin-top:2px">${evt.era}</div>` : ''}`;
    node.addEventListener('click', () => selectTlEvent(evt.id, tl.id));
    nodesEl.appendChild(node);
  });

  // Draw connecting lines between sequential events
  for (let i = 0; i < positions.length - 1; i++) {
    const a = positions[i], b = positions[i + 1];
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', a.x + 60); line.setAttribute('y1', a.y + 25);
    line.setAttribute('x2', b.x + 60); line.setAttribute('y2', b.y + 25);
    line.setAttribute('stroke', a.evt.era && a.evt.era === b.evt.era ? (a.evt.color || '#555') : 'rgba(168,152,128,0.15)');
    line.setAttribute('stroke-width', a.evt.era && a.evt.era === b.evt.era ? '2' : '1');
    line.setAttribute('stroke-dasharray', a.evt.era && a.evt.era === b.evt.era ? '' : '4 4');
    svgEl.appendChild(line);
  }
  // Connect same-era events
  const eraGroups = {};
  positions.forEach(p => { if (p.evt.era) { if (!eraGroups[p.evt.era]) eraGroups[p.evt.era] = []; eraGroups[p.evt.era].push(p); } });
  Object.values(eraGroups).forEach(group => {
    for (let i = 0; i < group.length - 1; i++) {
      const a = group[i], b = group[i + 1];
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      line.setAttribute('x1', a.x + 60); line.setAttribute('y1', a.y + 25);
      line.setAttribute('x2', b.x + 60); line.setAttribute('y2', b.y + 25);
      line.setAttribute('stroke', a.evt.color || '#4ecdc4');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('opacity', '0.3');
      svgEl.appendChild(line);
    }
  });

  const maxX = Math.max(...positions.map(p => p.x + 140));
  const maxY = Math.max(...positions.map(p => p.y + 60));
  nodesEl.style.width = maxX + 'px';
  nodesEl.style.height = maxY + 'px';
  svgEl.style.width = maxX + 'px';
  svgEl.style.height = maxY + 'px';
}

// ---- GANTT VIEW ----
function renderGanttView() {
  const tl = getCurrentTimeline();
  const scroll = document.getElementById('tlGanttScroll');
  if (!tl || !scroll) return;
  const cal = getCalendar(tl);
  const events = tl.events.filter(e => !e.hidden);
  if (events.length === 0) { scroll.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No events to display</div>'; return; }
  // Calculate day numbers for sorting
  function dayNum(d) { 
    let total = (d.year || 0) * 365;
    for (let m = 0; m < (d.month || 0); m++) total += (cal.months[m]?.days || 30);
    total += (d.day || 1);
    return total;
  }
  const sorted = [...events].sort((a, b) => dayNum(a.date) - dayNum(b.date));
  const minDay = dayNum(sorted[0].date);
  const maxDay = Math.max(...sorted.map(e => e.endDate ? dayNum(e.endDate) : dayNum(e.date) + 1));
  const range = Math.max(maxDay - minDay, 1);
  const unitPx = Math.max(3, Math.min(20, 800 / range));
  const totalW = range * unitPx + 200;
  const rowH = 32;
  // Era groups
  const eras = [...new Set(sorted.map(e => e.era || 'Untagged'))];
  let html = `<div class="tl-gantt-chart" style="min-width:${totalW}px;position:relative;">`;
  // Ruler
  html += `<div class="tl-gantt-ruler" style="height:24px;border-bottom:1px solid var(--border-color);display:flex;align-items:flex-end;padding-left:160px;">`;
  const step = Math.max(1, Math.ceil(range / 20));
  for (let d = 0; d <= range; d += step) {
    const dayAbs = minDay + d;
    html += `<div style="position:absolute;left:${160 + d * unitPx}px;font-size:9px;color:var(--text-muted);white-space:nowrap;bottom:2px">Y${Math.floor(dayAbs/365)}</div>`;
  }
  html += '</div>';
  // Current day marker
  const todayD = dayNum(tl.currentDate) - minDay;
  if (todayD >= 0 && todayD <= range) {
    html += `<div style="position:absolute;left:${160 + todayD * unitPx}px;top:24px;bottom:0;width:2px;background:var(--gold);opacity:0.4;z-index:1;"></div>`;
  }
  // Rows grouped by era
  let row = 0;
  eras.forEach(era => {
    const eraEvents = sorted.filter(e => (e.era || 'Untagged') === era);
    html += `<div class="tl-gantt-era-label" style="padding:4px 8px;font-size:10px;font-weight:600;color:var(--gold);background:rgba(212,168,36,0.05);border-bottom:1px solid var(--border-color);">${era}</div>`;
    eraEvents.forEach(evt => {
      const startD = dayNum(evt.date) - minDay;
      const endD = evt.endDate ? (dayNum(evt.endDate) - minDay) : (startD + 1);
      const width = Math.max(unitPx, (endD - startD) * unitPx);
      const mName = cal.months[evt.date.month]?.name || '';
      html += `<div class="tl-gantt-row" style="height:${rowH}px;position:relative;border-bottom:1px solid rgba(168,152,128,0.06);" onclick="selectTlEvent('${evt.id}','${tl.id}')">
        <div class="tl-gantt-label" style="width:156px;padding:0 6px;font-size:10px;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;line-height:${rowH}px;position:absolute;left:0;top:0;">${evt.title}</div>
        <div class="tl-gantt-bar" style="position:absolute;left:${160 + startD * unitPx}px;top:6px;width:${width}px;height:${rowH - 12}px;background:${evt.color || '#4ecdc4'};border-radius:3px;opacity:0.85;cursor:pointer;"></div>
      </div>`;
      row++;
    });
  });
  html += '</div>';
  scroll.innerHTML = html;
}

// ---- PANNING & SCROLL ZOOM ----
function renderStoryboardView() {
  const tl = getCurrentTimeline();
  const scroll = document.getElementById('tlStoryboardScroll');
  if (!tl || !scroll) return;
  const cal = getCalendar(tl);
  const events = tl.events.filter(e => !e.hidden);
  if (events.length === 0) { scroll.innerHTML = '<div style="padding:40px;text-align:center;color:var(--text-muted);">No events to display</div>'; return; }
  
  function dayNum(d) { let total = (d.year || 0) * 365; for (let m = 0; m < (d.month || 0); m++) total += (cal.months[m]?.days || 30); total += (d.day || 1); return total; }
  const sorted = [...events].sort((a, b) => dayNum(a.date) - dayNum(b.date));
  
  // Group by era if eras exist
  const eras = [...new Set(sorted.map(e => e.era || ''))];
  const hasEras = eras.some(e => e !== '');
  
  let html = '<div class="tl-sb-grid">';
  
  if (hasEras) {
    eras.forEach(era => {
      const eraEvents = sorted.filter(e => (e.era || '') === era);
      if (eraEvents.length === 0) return;
      html += `<div class="tl-sb-era-header" style="grid-column:1/-1"><span style="color:${eraEvents[0].color || 'var(--gold)'}">${era || 'Untagged'}</span> <span style="opacity:0.4;font-size:10px">${eraEvents.length} event${eraEvents.length !== 1 ? 's' : ''}</span></div>`;
      eraEvents.forEach(evt => { html += buildStoryCard(evt, tl, cal); });
    });
  } else {
    sorted.forEach(evt => { html += buildStoryCard(evt, tl, cal); });
  }
  
  html += '</div>';
  scroll.innerHTML = html;
}

function buildStoryCard(evt, tl, cal) {
  const mName = cal.months[evt.date.month]?.name || '';
  const dateStr = `${mName} ${evt.date.day}, Year ${evt.date.year}`;
  const hasRange = evt.endDate && (evt.endDate.day !== evt.date.day || evt.endDate.month !== evt.date.month || evt.endDate.year !== evt.date.year);
  const endStr = hasRange ? ` → ${cal.months[evt.endDate.month]?.name || ''} ${evt.endDate.day}, Y${evt.endDate.year}` : '';
  const desc = evt.description || '';
  const truncDesc = desc.length > 200 ? desc.substring(0, 200) + '…' : desc;
  const tags = (evt.tags && evt.tags.length) ? evt.tags.map(t => `<span class="tl-sb-tag">${t}</span>`).join('') : '';
  
  return `<div class="tl-sb-card" onclick="selectTlEvent('${evt.id}','${tl.id}')" style="--card-accent:${evt.color || '#4ecdc4'}">
    <div class="tl-sb-accent" style="background:${evt.color || '#4ecdc4'}"></div>
    <div class="tl-sb-body">
      <div class="tl-sb-date">${dateStr}${endStr}</div>
      <div class="tl-sb-title">${evt.title}</div>
      ${truncDesc ? `<div class="tl-sb-desc">${truncDesc}</div>` : ''}
      ${evt.era ? `<div class="tl-sb-era" style="color:${evt.color || 'var(--gold)'}">${evt.era}</div>` : ''}
      ${tags ? `<div class="tl-sb-tags">${tags}</div>` : ''}
      ${hasRange ? '<div class="tl-sb-range-badge">Range Event</div>' : ''}
    </div>
  </div>`;
}

function initTlPan(){
  const scroll=document.getElementById('tlLanesScroll');if(!scroll)return;
  scroll.addEventListener('mousedown',(e)=>{if(e.target.closest('.tl-lane-event')||e.target.closest('.tl-lane-label'))return;if(e.button!==0&&e.button!==1)return;tlPanning=true;scroll.classList.add('panning');tlPanStart={x:e.clientX,y:e.clientY,scrollLeft:scroll.scrollLeft,scrollTop:scroll.scrollTop};e.preventDefault();});
  scroll.addEventListener('mousemove',(e)=>{if(!tlPanning)return;scroll.scrollLeft=tlPanStart.scrollLeft-(e.clientX-tlPanStart.x);scroll.scrollTop=tlPanStart.scrollTop-(e.clientY-tlPanStart.y);});
  scroll.addEventListener('mouseup',()=>{tlPanning=false;scroll.classList.remove('panning');});
  scroll.addEventListener('mouseleave',()=>{tlPanning=false;scroll.classList.remove('panning');});
  scroll.addEventListener('wheel',(e)=>{e.preventDefault();const oldZoom=tlZoom;if(e.deltaY<0)tlZoom=Math.min(6,tlZoom*1.2);else tlZoom=Math.max(0.05,tlZoom/1.2);document.getElementById('tlZoomLabel').textContent=Math.round(tlZoom*100)+'%';const rect=scroll.getBoundingClientRect(),mouseX=e.clientX-rect.left+scroll.scrollLeft-140,ratio=tlZoom/oldZoom;renderLanesView();requestAnimationFrame(()=>{scroll.scrollLeft=mouseX*ratio-(e.clientX-rect.left)+140;});},{passive:false});
}

// ---- TIMELINE INIT ----
document.addEventListener('DOMContentLoaded',()=>{
  document.getElementById('addTimelineBtn')?.addEventListener('click',()=>createTimeline('custom'));
  document.querySelectorAll('#timelineTemplates .template-btn').forEach(btn=>{btn.addEventListener('click',()=>{const ct=btn.dataset.calendar;if(ct)createTimeline(ct);});});
  document.getElementById('timelineTemplatesHeader')?.addEventListener('click',()=>{document.getElementById('timelineTemplatesHeader').classList.toggle('collapsed');document.getElementById('timelineTemplates').classList.toggle('hidden');});
  document.getElementById('addEventBtn')?.addEventListener('click',()=>{if(!getCurrentTimeline()){showNotif('Create a timeline first');return;}populateMonthSelects();openEventEditor(null);});
  document.getElementById('tlNameInput')?.addEventListener('input',(e)=>{const tl=getCurrentTimeline();if(tl){tl.name=e.target.value;renderTimelinesList();document.getElementById('tlDetailName').value=tl.name;}});
  document.getElementById('tlPrevDay')?.addEventListener('click',()=>advanceDay(-1));
  document.getElementById('tlNextDay')?.addEventListener('click',()=>advanceDay(1));
  document.getElementById('tlSetDateBtn')?.addEventListener('click',()=>{const tl=getCurrentTimeline();if(!tl)return;populateMonthSelects();document.getElementById('setDateMonth').value=tl.currentDate.month;document.getElementById('setDateDay').value=tl.currentDate.day;document.getElementById('setDateYear').value=tl.currentDate.year;document.getElementById('setDateModal').classList.remove('hidden');});
  ['eventEditorModal','setDateModal','calendarEditorModal'].forEach(id=>{document.getElementById(id)?.addEventListener('click',(e)=>{if(e.target.id===id){if(id==='eventEditorModal')closeEventEditor();else if(id==='calendarEditorModal')closeCalendarEditor();else e.target.classList.add('hidden');}});});
  document.getElementById('tlModeLanes')?.addEventListener('click',()=>{tlViewMode='lanes';setTlModeActive('tlModeLanes');renderTimelineView();});
  document.getElementById('tlModeList')?.addEventListener('click',()=>{tlViewMode='list';setTlModeActive('tlModeList');renderTimelineView();});
  document.getElementById('tlModeCalGrid')?.addEventListener('click',()=>{tlViewMode='calgrid';setTlModeActive('tlModeCalGrid');renderTimelineView();});
  document.getElementById('tlModeChronicle')?.addEventListener('click',()=>{tlViewMode='chronicle';setTlModeActive('tlModeChronicle');renderTimelineView();});
  document.getElementById('tlModeAge')?.addEventListener('click',()=>{tlViewMode='age';setTlModeActive('tlModeAge');renderTimelineView();});
  document.getElementById('tlModeRelmap')?.addEventListener('click',()=>{tlViewMode='relmap';setTlModeActive('tlModeRelmap');renderTimelineView();});
  document.getElementById('tlModeGantt')?.addEventListener('click',()=>{tlViewMode='gantt';setTlModeActive('tlModeGantt');renderTimelineView();});
  document.getElementById('tlModeStoryboard')?.addEventListener('click',()=>{tlViewMode='storyboard';setTlModeActive('tlModeStoryboard');renderTimelineView();});
  document.getElementById('calGridPrev')?.addEventListener('click',()=>{calGridMonth--;if(calGridMonth<0){calGridMonth=11;calGridYear--;}renderCalGridView();});
  document.getElementById('calGridNext')?.addEventListener('click',()=>{calGridMonth++;const tl=getCurrentTimeline();const cal=getCalendar(tl);if(calGridMonth>=cal.months.length){calGridMonth=0;calGridYear++;}renderCalGridView();});
  document.getElementById('tlZoomIn')?.addEventListener('click',()=>{tlZoom=Math.min(6,tlZoom*1.3);document.getElementById('tlZoomLabel').textContent=Math.round(tlZoom*100)+'%';if(tlViewMode==='lanes')renderLanesView();});
  document.getElementById('tlZoomOut')?.addEventListener('click',()=>{tlZoom=Math.max(0.05,tlZoom/1.3);document.getElementById('tlZoomLabel').textContent=Math.round(tlZoom*100)+'%';if(tlViewMode==='lanes')renderLanesView();});
  document.getElementById('tlCalPrev')?.addEventListener('click',()=>calNavMonth(-1));
  document.getElementById('tlCalNext')?.addEventListener('click',()=>calNavMonth(1));
  document.getElementById('eventRangeToggle')?.addEventListener('change',(e)=>{document.getElementById('eventEndDateRow').style.display=e.target.checked?'':'none';});
  const eti=document.getElementById('eventTagsInput');if(eti){eti.addEventListener('keydown',(e)=>{if(e.key==='Enter'||e.key===','){e.preventDefault();addEventTagFromInput();}});eti.addEventListener('blur',()=>{if(eti.value.trim())addEventTagFromInput();});}
  const tti=document.getElementById('tlTagsInput');if(tti){tti.addEventListener('keydown',(e)=>{if(e.key==='Enter'||e.key===','){e.preventDefault();addTlTagFromInput();}});tti.addEventListener('blur',()=>{if(tti.value.trim())addTlTagFromInput();});}
  const dti=document.getElementById('tlDetailTagsInput');if(dti){dti.addEventListener('keydown',(e)=>{if(e.key==='Enter'||e.key===','){e.preventDefault();addTlDetailTagFromInput();}});dti.addEventListener('blur',()=>{if(dti.value.trim())addTlDetailTagFromInput();});}
  document.getElementById('tlDetailName')?.addEventListener('input',(e)=>{const tl=getCurrentTimeline();if(tl){tl.name=e.target.value;renderTimelinesList();document.getElementById('tlNameInput').value=tl.name;}});
  document.querySelectorAll('#tlDetailColorOptions .pin-color-btn').forEach(btn=>{btn.addEventListener('click',()=>{const tl=getCurrentTimeline();if(!tl)return;tl.color=btn.dataset.color;document.querySelectorAll('#tlDetailColorOptions .pin-color-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');renderTimelineView();});});
  document.getElementById('editCalendarBtn')?.addEventListener('click',()=>{if(!getCurrentTimeline()){showNotif('Select a timeline first');return;}openCalendarEditor();});
  document.getElementById('tlImageInput')?.addEventListener('change',handleTlImageUpload);
  document.addEventListener('click',hideAllContextMenus);
  initTlPan();
});


// ============================================
// Combat Tracker (Full Page)
// ============================================
let combatants = [];
let combatRound = 0;
let combatTurnIndex = -1;
let combatActive = false;
let selectedCombatantId = null;
let multiSelectedCombatants = new Set();
let savedEncounters = [];
let initEditTargetId = null;
let claimAddTargetId = null;

const CONDITIONS_LIST = [
  {name:'Blinded',type:'debuff'},{name:'Charmed',type:'debuff'},{name:'Deafened',type:'debuff'},
  {name:'Frightened',type:'debuff'},{name:'Grappled',type:'debuff'},{name:'Incapacitated',type:'debuff'},
  {name:'Invisible',type:'buff'},{name:'Paralyzed',type:'debuff'},{name:'Petrified',type:'debuff'},
  {name:'Poisoned',type:'debuff'},{name:'Prone',type:'debuff'},{name:'Restrained',type:'debuff'},
  {name:'Stunned',type:'debuff'},{name:'Unconscious',type:'debuff'},{name:'Exhaustion',type:'debuff'},
  {name:'Concentrating',type:'buff'},{name:'Hasted',type:'buff'},{name:'Blessed',type:'buff'},
  {name:'Raging',type:'buff'},{name:'Flying',type:'buff'},{name:'Hidden',type:'buff'},
  {name:'Dodging',type:'buff'},{name:'Slowed',type:'debuff'},{name:'Silenced',type:'debuff'},
  {name:'Hexed',type:'debuff'},{name:'Inspired',type:'buff'}
];

function rollD(sides) { return Math.floor(Math.random() * sides) + 1; }
function rollInitiative(modifier) { return rollD(20) + (modifier || 0); }

function addCombatant() {
  const nameInput = document.getElementById('ctAddName');
  const initInput = document.getElementById('ctAddInit');
  const hpInput = document.getElementById('ctAddHP');
  const acInput = document.getElementById('ctAddAC');
  const hiddenCheck = document.getElementById('ctAddHidden');
  const name = nameInput.value.trim(); if (!name) { showNotif('Enter a name'); return; }
  const initMod = parseInt(initInput.value) || 0;
  const maxHP = parseInt(hpInput.value) || 0;
  const ac = parseInt(acInput.value) || 0;
  const startHidden = hiddenCheck ? hiddenCheck.checked : false;
  combatants.push({
    id: 'cb_' + Date.now() + '_' + Math.floor(Math.random()*1000),
    name, initMod, initRoll: 0, maxHP, currentHP: maxHP, tempHP: 0,
    ac, conditions: [], buffs: [], dead: false, hidden: startHidden,
    notes: '', color: `hsl(${Math.floor(Math.random()*360)},60%,45%)`
  });
  nameInput.value = ''; initInput.value = ''; hpInput.value = ''; if(acInput) acInput.value = '';
  nameInput.focus();
  renderCombatants(); updateTurnBar();
  showNotif(`${name} added to combat${startHidden ? ' (hidden)' : ''}`);
}

function clearAllCombatants() {
  if (combatants.length === 0) { showNotif('No combatants to clear'); return; }
  document.getElementById('combatClearModal').classList.remove('hidden');
}
function confirmClearEncounter() {
  document.getElementById('combatClearModal').classList.add('hidden');
  combatants = []; combatRound = 0; combatTurnIndex = -1; combatActive = false;
  selectedCombatantId = null; multiSelectedCombatants.clear();
  document.getElementById('ctRoundBadge').textContent = 'Not Started';
  document.getElementById('ctDetailCol')?.classList.add('hidden');
  renderCombatants(); updateTurnBar();
  showNotif('Encounter cleared');
}

function removeCombatant(id) {
  combatants = combatants.filter(c => c.id !== id);
  if (combatTurnIndex >= combatants.length) combatTurnIndex = Math.max(0, combatants.length - 1);
  if (selectedCombatantId === id) { selectedCombatantId = null; document.getElementById('ctDetailCol')?.classList.add('hidden'); }
  renderCombatants(); updateTurnBar();
}

function rollAllInitiative() {
  combatants.forEach(c => { c.initRoll = rollInitiative(c.initMod); });
  sortByInitiative(); showNotif('Initiative rolled');
}

function sortByInitiative() {
  const activeId = combatActive && combatants[combatTurnIndex] ? combatants[combatTurnIndex].id : null;
  combatants.sort((a, b) => b.initRoll - a.initRoll || b.initMod - a.initMod);
  if (activeId) combatTurnIndex = combatants.findIndex(c => c.id === activeId);
  renderCombatants();
}

function resetCombat() {
  combatRound = 0; combatTurnIndex = -1; combatActive = false;
  combatants.forEach(c => { c.currentHP = c.maxHP; c.tempHP = 0; c.dead = false; c.conditions = []; c.buffs = []; });
  document.getElementById('ctRoundBadge').textContent = 'Not Started';
  renderCombatants(); updateTurnBar(); showNotif('Combat reset');
}

function nextTurn() {
  if (combatants.length === 0) return;
  if (!combatActive) { combatActive = true; combatRound = 1; combatTurnIndex = 0; }
  else {
    let tries = 0;
    do { combatTurnIndex++; if (combatTurnIndex >= combatants.length) { combatTurnIndex = 0; combatRound++; } tries++; }
    while (combatants[combatTurnIndex]?.dead && tries < combatants.length * 2);
  }
  document.getElementById('ctRoundBadge').textContent = `Round ${combatRound}`;
  selectedCombatantId = combatants[combatTurnIndex]?.id || null;
  renderCombatants(); updateTurnBar(); showCombatantDetail();
  document.querySelector('.ct-combatant.active-turn')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function prevTurn() {
  if (!combatActive || combatants.length === 0) return;
  let tries = 0;
  do { combatTurnIndex--; if (combatTurnIndex < 0) { combatTurnIndex = combatants.length - 1; combatRound = Math.max(1, combatRound - 1); } tries++; }
  while (combatants[combatTurnIndex]?.dead && tries < combatants.length * 2);
  document.getElementById('ctRoundBadge').textContent = `Round ${combatRound}`;
  selectedCombatantId = combatants[combatTurnIndex]?.id || null;
  renderCombatants(); updateTurnBar(); showCombatantDetail();
}

function updateTurnBar() {
  const el = document.getElementById('ctTurnCurrent');
  if (!el) return;
  if (!combatActive || combatants.length === 0) {
    el.innerHTML = '<span class="ct-turn-label">Start combat to begin tracking</span>';
    return;
  }
  const c = combatants[combatTurnIndex];
  if (!c) return;
  const hpBar = c.maxHP > 0 ? `<div class="ct-turn-hp-mini"><div class="ct-turn-hp-fill" style="width:${Math.min(100,(c.currentHP/c.maxHP)*100)}%;background:${getHPColor(c)};"></div></div>` : '';
  el.innerHTML = `<span class="ct-turn-init-badge" style="border-color:${c.color};">${c.initRoll}</span>
    <div class="ct-turn-info"><span class="ct-turn-name">${c.name}</span>${hpBar}</div>
    <span class="ct-turn-round">Round ${combatRound}</span>`;
}

function getHPColor(c) {
  if (!c.maxHP) return '#666';
  const pct = c.currentHP / c.maxHP;
  return pct > 0.6 ? '#22c55e' : pct > 0.3 ? '#eab308' : '#f43f5e';
}

function selectCombatant(id, event) {
  if (event && event.altKey) {
    // Alt-click: deselect all
    multiSelectedCombatants.clear();
    selectedCombatantId = null;
    renderCombatants();
    const col = document.getElementById('ctDetailCol');
    if (col) col.classList.add('hidden');
    return;
  }
  if (event && event.shiftKey) {
    // Shift-click: range select — fill between last selected and this one
    if (selectedCombatantId && selectedCombatantId !== id) {
      const lastIdx = combatants.findIndex(c => c.id === selectedCombatantId);
      const thisIdx = combatants.findIndex(c => c.id === id);
      if (lastIdx !== -1 && thisIdx !== -1) {
        const start = Math.min(lastIdx, thisIdx);
        const end = Math.max(lastIdx, thisIdx);
        for (let i = start; i <= end; i++) {
          multiSelectedCombatants.add(combatants[i].id);
        }
      }
    } else {
      multiSelectedCombatants.add(id);
    }
    selectedCombatantId = id;
  } else {
    // Normal click: single select
    multiSelectedCombatants.clear();
    selectedCombatantId = id;
  }
  renderCombatants(); showCombatantDetail();
}

function showCombatantDetail() {
  const col = document.getElementById('ctDetailCol');

  // Multi-select mode
  if (multiSelectedCombatants.size > 1) {
    if (!col) return;
    col.classList.remove('hidden');
    const count = multiSelectedCombatants.size;
    document.getElementById('ctDetailName').innerHTML = `<span style="color:var(--gold);">⚡</span> ${count} combatants selected`;

    // Hide HP bar in multi-select
    const harmSec = document.querySelector('.ct-harm-section');
    if (harmSec) harmSec.style.display = 'none';

    // Conditions - show toggle for all selected
    const grid = document.getElementById('ctConditionsGrid');
    grid.innerHTML = CONDITIONS_LIST.map(cond => {
      const ids = [...multiSelectedCombatants];
      const allHave = ids.every(id => { const c = combatants.find(cb => cb.id === id); return c && c.conditions.includes(cond.name); });
      const someHave = ids.some(id => { const c = combatants.find(cb => cb.id === id); return c && c.conditions.includes(cond.name); });
      return `<button class="ct-cond-btn${allHave ? ' active' : ''}${someHave && !allHave ? ' partial' : ''}${cond.type === 'buff' ? ' buff' : ''}" onclick="toggleConditionMulti('${cond.name}')">${cond.name}</button>`;
    }).join('');

    // Buffs - show add for all
    const bl = document.getElementById('ctBuffsList');
    bl.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">Add buffs/debuffs to all selected combatants</div>';

    // Hide image upload & notes in multi
    const imgSec = document.getElementById('ctImageSection');
    if (imgSec) imgSec.style.display = 'none';
    const notesSec = document.querySelector('.ct-notes-section');
    if (notesSec) notesSec.style.display = 'none';
    return;
  }

  // Single-select mode
  const c = combatants.find(cb => cb.id === selectedCombatantId);
  if (!c || !col) { col?.classList.add('hidden'); return; }
  col.classList.remove('hidden');

  document.getElementById('ctDetailName').innerHTML = `<span style="color:${c.color};">●</span> ${c.name}${c.ac ? ` <span class="ct-detail-ac">AC ${c.ac}</span>` : ''}`;

  // Image upload
  const imgSec = document.getElementById('ctImageSection');
  if (imgSec) {
    imgSec.style.display = '';
    const imgPrev = document.getElementById('ctImagePreview');
    if (c.image) {
      imgPrev.innerHTML = `<img src="${c.image}" class="ct-detail-img" /><button class="ct-img-remove" onclick="removeCombatantImage()">×</button>`;
    } else {
      imgPrev.innerHTML = '<span style="font-size:11px;color:var(--text-muted);cursor:pointer;" onclick="document.getElementById(\'ctImageUpload\').click()">+ Add Image</span>';
    }
  }

  // HP bar
  const harmSec = document.querySelector('.ct-harm-section');
  if (c.maxHP > 0) {
    const pct = Math.min(100, (c.currentHP / c.maxHP) * 100);
    document.getElementById('ctHarmFillLg').style.width = pct + '%';
    document.getElementById('ctHarmFillLg').style.background = getHPColor(c);
    const tempStr = c.tempHP > 0 ? ` +${c.tempHP} temp` : '';
    document.getElementById('ctHarmNumbers').textContent = `${c.currentHP} / ${c.maxHP}${tempStr}`;
    if (harmSec) harmSec.style.display = '';
  } else {
    if (harmSec) harmSec.style.display = 'none';
  }

  // Conditions grid
  const grid = document.getElementById('ctConditionsGrid');
  grid.innerHTML = CONDITIONS_LIST.map(cond => {
    const active = c.conditions.includes(cond.name);
    return `<button class="ct-cond-btn${active ? ' active' : ''}${cond.type === 'buff' ? ' buff' : ''}" onclick="toggleCondition('${c.id}','${cond.name}')">${cond.name}</button>`;
  }).join('');

  // Buffs/Debuffs
  const bl = document.getElementById('ctBuffsList');
  bl.innerHTML = c.buffs.map((b, i) => `<div class="ct-buff-pill ${b.type}"><span>${b.type === 'buff' ? '▲' : '▼'} ${b.name}</span><span class="ct-buff-remove" onclick="removeBuff('${c.id}',${i})">×</span></div>`).join('') || '<div style="font-size:11px;color:var(--text-muted);">None active</div>';

  // Notes
  const notesSec = document.querySelector('.ct-notes-section');
  if (notesSec) notesSec.style.display = '';
  const notesArea = document.getElementById('ctNotesArea');
  notesArea.value = c.notes || '';
  notesArea.onblur = () => { c.notes = notesArea.value; };
}

function toggleCondition(id, condition) {
  const c = combatants.find(cb => cb.id === id);
  if (!c) return;
  if (c.conditions.includes(condition)) c.conditions = c.conditions.filter(co => co !== condition);
  else c.conditions.push(condition);
  renderCombatants(); if (selectedCombatantId === id) showCombatantDetail();
}

function toggleConditionMulti(condition) {
  const ids = [...multiSelectedCombatants];
  const allHave = ids.every(id => { const c = combatants.find(cb => cb.id === id); return c && c.conditions.includes(condition); });
  ids.forEach(id => {
    const c = combatants.find(cb => cb.id === id);
    if (!c) return;
    if (allHave) c.conditions = c.conditions.filter(co => co !== condition);
    else if (!c.conditions.includes(condition)) c.conditions.push(condition);
  });
  renderCombatants(); showCombatantDetail();
}

function addBuff() {
  const ids = multiSelectedCombatants.size > 1 ? [...multiSelectedCombatants] : [selectedCombatantId];
  const input = document.getElementById('ctBuffInput');
  const type = document.getElementById('ctBuffType').value;
  const name = input.value.trim(); if (!name) return;
  ids.forEach(id => {
    const c = combatants.find(cb => cb.id === id);
    if (c) c.buffs.push({ name, type });
  });
  input.value = '';
  renderCombatants(); showCombatantDetail();
}

function removeCombatantImage() {
  const c = combatants.find(cb => cb.id === selectedCombatantId);
  if (c) { c.image = null; renderCombatants(); showCombatantDetail(); }
}

function handleCombatantImageUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  uploadFileImage(file, (url) => {
    const c = combatants.find(cb => cb.id === selectedCombatantId);
    if (c) { c.image = url; renderCombatants(); showCombatantDetail(); }
  });
  e.target.value = '';
}

function removeBuff(id, index) {
  const c = combatants.find(cb => cb.id === id);
  if (!c) return;
  c.buffs.splice(index, 1);
  renderCombatants(); showCombatantDetail();
}

function ctDamage(amount) {
  const c = combatants.find(cb => cb.id === selectedCombatantId);
  if (!c) return;
  if (c.tempHP > 0) { const absorbed = Math.min(c.tempHP, amount); c.tempHP -= absorbed; amount -= absorbed; }
  c.currentHP = Math.max(0, c.currentHP - amount);
  if (c.currentHP <= 0) c.dead = true;
  renderCombatants(); showCombatantDetail();
}

function ctHeal(amount) {
  const c = combatants.find(cb => cb.id === selectedCombatantId);
  if (!c) return;
  c.currentHP = Math.min(c.maxHP || 9999, c.currentHP + amount);
  if (c.currentHP > 0) c.dead = false;
  renderCombatants(); showCombatantDetail();
}

// Initiative edit - site popup
function openInitEdit(id) {
  const c = combatants.find(cb => cb.id === id);
  if (!c) return;
  initEditTargetId = id;
  document.getElementById('initEditLabel').textContent = `Initiative for ${c.name}`;
  document.getElementById('initEditValue').value = c.initRoll;
  document.getElementById('initEditModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('initEditValue').select(), 50);
}
function confirmInitEdit() {
  const c = combatants.find(cb => cb.id === initEditTargetId);
  if (!c) return;
  c.initRoll = parseInt(document.getElementById('initEditValue').value) || 0;
  document.getElementById('initEditModal').classList.add('hidden');
  initEditTargetId = null;
  renderCombatants(); updateTurnBar();
}

function rerollInit(id) {
  const c = combatants.find(cb => cb.id === id);
  if (c) { c.initRoll = rollInitiative(c.initMod); renderCombatants(); updateTurnBar(); showNotif(`${c.name}: ${c.initRoll}`); }
}

function moveCombatant(id, dir) {
  const idx = combatants.findIndex(c => c.id === id);
  if (idx < 0) return;
  const newIdx = idx + dir;
  if (newIdx < 0 || newIdx >= combatants.length) return;
  const activeId = combatActive && combatants[combatTurnIndex] ? combatants[combatTurnIndex].id : null;
  [combatants[idx], combatants[newIdx]] = [combatants[newIdx], combatants[idx]];
  if (activeId) combatTurnIndex = combatants.findIndex(c => c.id === activeId);
  renderCombatants();
}

function toggleDead(id) {
  const c = combatants.find(cb => cb.id === id);
  if (!c) return;
  c.dead = !c.dead;
  if (c.dead) c.currentHP = 0; else if (c.currentHP <= 0) c.currentHP = 1;
  renderCombatants(); if (selectedCombatantId === id) showCombatantDetail();
}

function saveEncounter() {
  if (combatants.length === 0) { showNotif('No combatants to save'); return; }
  document.getElementById('encounterSaveName').value = '';
  document.getElementById('encounterSaveModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('encounterSaveName').focus(), 50);
}

function confirmSaveEncounter() {
  const name = document.getElementById('encounterSaveName').value.trim();
  if (!name) { showNotif('Enter an encounter name'); return; }
  const clearAfter = document.getElementById('encounterClearAfterSave')?.checked || false;
  savedEncounters.push({ name, combatants: JSON.parse(JSON.stringify(combatants.map(c => ({ name:c.name, initMod:c.initMod, maxHP:c.maxHP, ac:c.ac, color:c.color })))) });
  document.getElementById('encounterSaveModal').classList.add('hidden');
  renderEncountersSidebar(); showNotif('Encounter saved');
  if (clearAfter) {
    combatants = []; combatRound = 0; combatTurnIndex = -1; combatActive = false;
    selectedCombatantId = null; multiSelectedCombatants.clear();
    document.getElementById('ctRoundBadge').textContent = 'Not Started';
    document.getElementById('ctDetailCol')?.classList.add('hidden');
    renderCombatants(); updateTurnBar();
    showNotif('Encounter saved & cleared');
  }
}

function loadEncounter(idx) {
  const enc = savedEncounters[idx]; if (!enc) return;
  combatants = []; combatRound = 0; combatTurnIndex = -1; combatActive = false; selectedCombatantId = null;
  enc.combatants.forEach(c => {
    combatants.push({ ...c, id: 'cb_'+Date.now()+'_'+Math.floor(Math.random()*1000), initRoll: 0, currentHP: c.maxHP, tempHP: 0, conditions: [], buffs: [], dead: false, hidden: false, notes: '' });
  });
  document.getElementById('ctRoundBadge').textContent = 'Not Started';
  document.getElementById('ctDetailCol')?.classList.add('hidden');
  renderCombatants(); updateTurnBar(); showNotif(`Loaded: ${enc.name}`);
}

function deleteEncounter(idx) { savedEncounters.splice(idx, 1); renderEncountersSidebar(); }

function renderEncountersSidebar() {
  const el = document.getElementById('ctEncountersList'); if (!el) return;
  if (savedEncounters.length === 0) { el.innerHTML = '<div class="empty-pins-message">Save encounters for quick re-use</div>'; return; }
  el.innerHTML = savedEncounters.map((enc, i) => `<div class="sidebar-item" style="display:flex;justify-content:space-between;align-items:center;">
    <span class="sidebar-item-name" onclick="loadEncounter(${i})" style="cursor:pointer;flex:1;">${enc.name} <span style="opacity:0.5;font-size:10px;">(${enc.combatants.length})</span></span>
    <button class="icon-btn sm" onclick="deleteEncounter(${i})" title="Delete" style="flex-shrink:0;width:20px;height:20px;font-size:10px;">×</button>
  </div>`).join('');
}

function renderCombatants() {
  const list = document.getElementById('ctCombatantsList'); if (!list) return;
  if (combatants.length === 0) {
    list.innerHTML = '<div class="ct-empty"><p>No combatants</p><p style="opacity:0.5;font-size:12px;">Add creatures from the sidebar to begin</p></div>';
    return;
  }
  list.innerHTML = combatants.map((c, i) => {
    const isActive = combatActive && i === combatTurnIndex;
    const isSel = c.id === selectedCombatantId;
    const hpPct = c.maxHP > 0 ? Math.min(100, (c.currentHP / c.maxHP) * 100) : 100;
    const hpColor = getHPColor(c);

    // Condition tags - text only
    const condTags = c.conditions.length > 0 ? c.conditions.map(co => {
      const ci = CONDITIONS_LIST.find(cl => cl.name === co);
      const cls = ci && ci.type === 'buff' ? 'ct-status-tag buff' : 'ct-status-tag debuff';
      return `<span class="${cls}">${co}</span>`;
    }).join('') : '';

    const buffPills = c.buffs.length > 0 ? c.buffs.map(b => {
      const cls = b.type === 'buff' ? 'ct-buff-pill buff' : 'ct-buff-pill debuff';
      return `<span class="${cls}">${b.type === 'buff' ? '▲' : '▼'} ${b.name}</span>`;
    }).join('') : '';

    const isMultiSel = multiSelectedCombatants.has(c.id);
    const imgHtml = c.image ? `<img src="${c.image}" class="ct-combatant-img" alt="" />` : '';

    return `<div class="ct-combatant${isActive ? ' active-turn' : ''}${c.dead ? ' dead' : ''}${isSel ? ' selected' : ''}${isMultiSel ? ' multi-selected' : ''}${c.hidden ? ' ct-hidden' : ''}" onclick="selectCombatant('${c.id}', event)" oncontextmenu="showCombatantContextMenu(event,'${c.id}')">
      <div class="ct-turn-indicator"></div>
      ${c.hidden ? '<span class="hidden-badge" title="Hidden from players">👁</span>' : ''}
      ${imgHtml}
      <div class="ct-init-badge" onclick="event.stopPropagation();openInitEdit('${c.id}')" title="Init ${c.initRoll} (mod ${c.initMod>=0?'+':''}${c.initMod}) · Click to edit" style="border-color:${c.color};">${c.initRoll}</div>
      <div class="ct-combatant-info">
        <div class="ct-combatant-name-row">
          <span class="ct-combatant-name">${c.name}</span>
          ${c.ac ? `<span class="ct-ac-badge">🛡 ${c.ac}</span>` : ''}
          ${c.notes ? '<span class="ct-has-notes" title="Has GM notes">📝</span>' : ''}
        </div>
        ${c.maxHP > 0 ? `<div class="ct-hp-inline"><div class="ct-hp-track"><div class="ct-hp-fill" style="width:${hpPct}%;background:${hpColor};"></div></div><span class="ct-hp-text">${c.currentHP}/${c.maxHP}${c.tempHP>0?' +'+c.tempHP:''}</span></div>` : ''}
        ${condTags ? `<div class="ct-combatant-status">${condTags}</div>` : ''}
        ${buffPills ? `<div class="ct-combatant-buffs">${buffPills}</div>` : ''}
      </div>
      <div class="ct-combatant-actions">
        <button class="ct-action-btn" onclick="event.stopPropagation();rerollInit('${c.id}')" title="Reroll">🎲</button>
        <button class="ct-action-btn" onclick="event.stopPropagation();moveCombatant('${c.id}',-1)" title="Up">▲</button>
        <button class="ct-action-btn" onclick="event.stopPropagation();moveCombatant('${c.id}',1)" title="Down">▼</button>
        <button class="ct-action-btn" onclick="event.stopPropagation();toggleDead('${c.id}')" title="${c.dead?'Revive':'Kill'}">${c.dead?'💚':'💀'}</button>
        <button class="ct-action-btn danger" onclick="event.stopPropagation();removeCombatant('${c.id}')" title="Remove">✕</button>
      </div>
    </div>`;
  }).join('');
}

// ============================================

// ============================================

// ============================================

// ============================================
// View Settings System
// ============================================
const VIEW_CONFIG = [
  { key: 'board', label: 'Board', btnId: 'boardViewBtn' },
  { key: 'map', label: 'Map', btnId: 'mapViewBtn' },
  { key: 'write', label: 'Write', btnId: 'writeViewBtn' },
  { key: 'timeline', label: 'Timeline', btnId: 'timelineViewBtn' },
  { key: 'combat', label: 'Combat', btnId: 'combatViewBtn' },
  { key: 'factions', label: 'Connections', btnId: 'factionViewBtn' },
  { key: 'mindmap', label: 'Mind Map', btnId: 'mindmapViewBtn' },
  { key: 'soundboard', label: 'Soundscape', btnId: 'soundboardViewBtn' },
];
let viewSettings = null;
let settingsInitialized = false;

function initViewSettings() {
  const stored = localStorage.getItem('craftViewSettings');
  if (stored) {
    viewSettings = JSON.parse(stored);
    settingsInitialized = true;
    applyViewSettings();
  } else {
    // Default: all views enabled so nothing is hidden
    viewSettings = {};
    VIEW_CONFIG.forEach(v => { viewSettings[v.key] = true; });
    settingsInitialized = true;
    applyViewSettings();
    // Show settings popup for room owner so they can customize
    // Keep checking until craftIsOwner is determined (auth is async)
    let checks = 0;
    const checkOwner = setInterval(() => {
      checks++;
      if (window.craftIsOwner !== undefined || checks > 20) {
        clearInterval(checkOwner);
        if (window.craftIsOwner) window.openSettingsModal();
      }
    }, 250);
  }
}

function openSettingsModal() {
  const container = document.getElementById('settingsChecks');
  container.innerHTML = VIEW_CONFIG.map(v => {
    const checked = viewSettings[v.key] ? 'checked' : '';
    return `<label class="settings-check-row">
      <input type="checkbox" ${checked} data-view-key="${v.key}" onchange="toggleViewSetting('${v.key}', this.checked)" />
      <span class="settings-check-label">${v.label}</span>
      ${viewSettings[v.key] ? '<span class="settings-check-mark">✓</span>' : ''}
    </label>`;
  }).join('');
  document.getElementById('settingsModal').classList.remove('hidden');
}

function closeSettingsModal() {
  document.getElementById('settingsModal').classList.add('hidden');
  // Ensure at least one view is selected
  const anyOn = Object.values(viewSettings).some(v => v);
  if (!anyOn) { viewSettings.board = true; }
  localStorage.setItem('craftViewSettings', JSON.stringify(viewSettings));
  settingsInitialized = true;
  applyViewSettings();
}

function toggleViewSetting(key, checked) {
  viewSettings[key] = checked;
  localStorage.setItem('craftViewSettings', JSON.stringify(viewSettings));
  applyViewSettings();
  // Re-render the checkmarks
  const container = document.getElementById('settingsChecks');
  container.querySelectorAll('input[data-view-key]').forEach(inp => {
    const mark = inp.closest('.settings-check-row').querySelector('.settings-check-mark');
    if (inp.checked) {
      if (!mark) {
        const span = document.createElement('span');
        span.className = 'settings-check-mark';
        span.textContent = '✓';
        inp.closest('.settings-check-row').appendChild(span);
      }
    } else {
      if (mark) mark.remove();
    }
  });
}

function applyViewSettings() {
  VIEW_CONFIG.forEach(v => {
    const btn = document.getElementById(v.btnId);
    if (btn) btn.style.display = viewSettings[v.key] ? '' : 'none';
  });
  // If current view is hidden, switch to first visible
  if (viewSettings && !viewSettings[currentView]) {
    const first = VIEW_CONFIG.find(v => viewSettings[v.key]);
    if (first) switchView(first.key);
  }
}

// ============================================
// Combat Tracker View System
// ============================================
function switchCtView(view) {
  document.querySelectorAll('.ct-view-body').forEach(el => el.classList.add('hidden'));
  document.querySelectorAll('.ct-tab-btn').forEach(btn => btn.classList.toggle('active', btn.dataset.ctView === view));
  const viewMap = { tracker: 'ctTrackerView', reference: 'ctReferenceView', notes: 'ctNotesView', screen: 'ctScreenView' };
  const target = document.getElementById(viewMap[view]);
  if (target) target.classList.remove('hidden');
  if (view === 'reference') {
    loadRefContent('conditions', 'ctRefContent1');
    loadRefContent('actions', 'ctRefContent2');
  }
  if (view === 'screen') initScreenView();
}

function setCtLayout(layout) {
  document.querySelectorAll('.ct-layout-btn').forEach(b => b.classList.remove('active'));
  const btn = document.querySelector(`.ct-layout-btn[title="${layout === 'standard' ? 'Standard' : layout === 'wide' ? 'Wide List' : 'Focus'}"]`);
  if (btn) btn.classList.add('active');
  const grid = document.getElementById('ctMainGrid');
  if (!grid) return;
  grid.className = 'ct-main-grid layout-' + layout;
}

const REF_CONTENT = {
  conditions: `<h4 style="color:var(--gold);margin:0 0 8px">Conditions</h4>
    <div style="margin-bottom:6px"><b>Blinded</b> — Can't see. Attack rolls against have advantage. Own attacks have disadvantage.</div>
    <div style="margin-bottom:6px"><b>Charmed</b> — Can't attack the charmer. Charmer has advantage on social checks.</div>
    <div style="margin-bottom:6px"><b>Deafened</b> — Can't hear. Fails any ability check that requires hearing.</div>
    <div style="margin-bottom:6px"><b>Frightened</b> — Disadvantage on checks/attacks while source is in line of sight. Can't move closer.</div>
    <div style="margin-bottom:6px"><b>Grappled</b> — Speed becomes 0. Ends if grappler is incapacitated or forced apart.</div>
    <div style="margin-bottom:6px"><b>Incapacitated</b> — Can't take actions or reactions.</div>
    <div style="margin-bottom:6px"><b>Invisible</b> — Impossible to see without magic/special sense. Attack rolls against have disadvantage. Own attacks have advantage.</div>
    <div style="margin-bottom:6px"><b>Paralyzed</b> — Incapacitated. Can't move or speak. Auto-fail STR/DEX saves. Attacks have advantage. Hits within 5 ft are crits.</div>
    <div style="margin-bottom:6px"><b>Petrified</b> — Transformed to stone. Weight ×10. Incapacitated. Resistance to all damage.</div>
    <div style="margin-bottom:6px"><b>Poisoned</b> — Disadvantage on attack rolls and ability checks.</div>
    <div style="margin-bottom:6px"><b>Prone</b> — Disadvantage on attacks. Melee attacks against have advantage. Ranged attacks have disadvantage.</div>
    <div style="margin-bottom:6px"><b>Restrained</b> — Speed 0. Attack rolls have disadvantage. DEX saves have disadvantage. Attacks against have advantage.</div>
    <div style="margin-bottom:6px"><b>Stunned</b> — Incapacitated. Can't move. Speak only falteringly. Auto-fail STR/DEX saves. Attacks have advantage.</div>
    <div style="margin-bottom:6px"><b>Unconscious</b> — Incapacitated. Drop what held. Fall prone. Auto-fail STR/DEX saves. Attacks have advantage. Hits within 5 ft are crits.</div>`,
  actions: `<h4 style="color:var(--gold);margin:0 0 8px">Actions in Combat</h4>
    <div style="margin-bottom:6px"><b>Attack</b> — Melee or ranged attack against a target.</div>
    <div style="margin-bottom:6px"><b>Cast a Spell</b> — Cast a spell with a casting time of 1 action.</div>
    <div style="margin-bottom:6px"><b>Dash</b> — Gain extra movement equal to your speed.</div>
    <div style="margin-bottom:6px"><b>Disengage</b> — Movement doesn't provoke opportunity attacks.</div>
    <div style="margin-bottom:6px"><b>Dodge</b> — Attacks against you have disadvantage. DEX saves have advantage.</div>
    <div style="margin-bottom:6px"><b>Help</b> — Give an ally advantage on their next ability check or attack roll.</div>
    <div style="margin-bottom:6px"><b>Hide</b> — Make a DEX (Stealth) check to hide.</div>
    <div style="margin-bottom:6px"><b>Ready</b> — Prepare an action to trigger on a specific condition (uses reaction).</div>
    <div style="margin-bottom:6px"><b>Search</b> — Make a WIS (Perception) or INT (Investigation) check.</div>
    <div style="margin-bottom:6px"><b>Use an Object</b> — Interact with an object that requires your action.</div>
    <div style="margin-bottom:6px"><b>Grapple</b> — STR (Athletics) vs target's STR (Athletics) or DEX (Acrobatics).</div>
    <div style="margin-bottom:6px"><b>Shove</b> — Push target 5 ft away or knock prone. STR (Athletics) contest.</div>`,
  cover: `<h4 style="color:var(--gold);margin:0 0 8px">Cover Rules</h4>
    <div style="margin-bottom:6px"><b>Half Cover</b> — +2 AC and DEX saves. Obstacle blocks at least half of the target.</div>
    <div style="margin-bottom:6px"><b>Three-Quarters Cover</b> — +5 AC and DEX saves. About three-quarters blocked.</div>
    <div style="margin-bottom:6px"><b>Total Cover</b> — Can't be targeted directly. Completely concealed.</div>
    <h4 style="color:var(--gold);margin:12px 0 8px">Difficult Terrain</h4>
    <div style="margin-bottom:6px">Every foot of movement costs 1 extra foot.</div>
    <h4 style="color:var(--gold);margin:12px 0 8px">Concentration</h4>
    <div style="margin-bottom:6px">Taking damage: CON save (DC = 10 or half damage, whichever is higher). Incapacitation or death ends it.</div>`,
  custom: ''
};

function loadRefContent(type, targetId) {
  const el = document.getElementById(targetId);
  if (!el) return;
  if (type === 'custom') {
    const key = targetId + '_custom';
    el.innerHTML = `<textarea style="width:100%;height:100%;background:transparent;border:none;color:var(--text-primary);font-size:12px;line-height:1.6;resize:none;outline:none;" placeholder="Type your custom notes here..."
      oninput="this.dataset.saved=this.value">${el._customContent || ''}</textarea>`;
    const ta = el.querySelector('textarea');
    if (ta) ta.addEventListener('input', () => { el._customContent = ta.value; });
  } else {
    el.innerHTML = REF_CONTENT[type] || '<p>No content available.</p>';
  }
}

// Resizable reference panels
function initCtRefDivider() {
  const divider = document.getElementById('ctRefDivider');
  if (!divider) return;
  let dragging = false;
  divider.addEventListener('mousedown', (e) => {
    e.preventDefault();
    dragging = true;
    divider.classList.add('dragging');
    const grid = document.getElementById('ctRefGrid');
    const panel1 = document.getElementById('ctRefPanel1');
    const onMove = (me) => {
      if (!dragging) return;
      const rect = grid.getBoundingClientRect();
      const ratio = (me.clientX - rect.left) / rect.width;
      const clamped = Math.max(0.2, Math.min(0.8, ratio));
      panel1.style.flex = `0 0 ${clamped * 100}%`;
    };
    const onUp = () => {
      dragging = false;
      divider.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// Resizable combat tracker columns
function initCtResizeHandle() {
  const handle = document.getElementById('ctResizeHandle');
  if (!handle) return;
  handle.addEventListener('mousedown', (e) => {
    e.preventDefault();
    handle.classList.add('dragging');
    const grid = document.getElementById('ctMainGrid');
    const detailCol = document.getElementById('ctDetailCol');
    const onMove = (me) => {
      const rect = grid.getBoundingClientRect();
      const rightWidth = rect.right - me.clientX;
      const clamped = Math.max(200, Math.min(rect.width * 0.6, rightWidth));
      detailCol.style.width = clamped + 'px';
    };
    const onUp = () => {
      handle.classList.remove('dragging');
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  });
}

// DM Screen View (4-panel configurable dashboard)
let screenPanelContent = ['initiative', 'notes', 'conditions', 'custom'];
function initScreenView() {
  const container = document.getElementById('ctScreenGrid');
  if (!container) return;
  const panelTypes = [
    { id: 'initiative', label: 'Initiative Order' },
    { id: 'notes', label: 'Session Notes' },
    { id: 'conditions', label: 'Conditions' },
    { id: 'actions', label: 'Actions' },
    { id: 'cover', label: 'Cover & Rules' },
    { id: 'custom', label: 'Custom Notes' }
  ];
  container.innerHTML = '';
  screenPanelContent.forEach((type, i) => {
    const cell = document.createElement('div');
    cell.className = 'ct-screen-cell';
    const options = panelTypes.map(pt => `<option value="${pt.id}"${pt.id === type ? ' selected' : ''}>${pt.label}</option>`).join('');
    cell.innerHTML = `<div class="ct-screen-cell-header"><select class="toolbar-select" style="font-size:10px;padding:2px 4px;" onchange="updateScreenPanel(${i}, this.value)">${options}</select></div><div class="ct-screen-cell-body" id="screenPanel${i}"></div>`;
    container.appendChild(cell);
    fillScreenPanel(i, type);
  });
}

function updateScreenPanel(index, type) {
  screenPanelContent[index] = type;
  fillScreenPanel(index, type);
}

function fillScreenPanel(index, type) {
  const el = document.getElementById('screenPanel' + index);
  if (!el) return;
  if (type === 'initiative') {
    let html = '';
    const sorted = [...combatants].sort((a, b) => (b.initiative || 0) - (a.initiative || 0));
    sorted.forEach((c, i) => {
      const isCurrent = i === combatTurnIndex && combatRound > 0;
      html += `<div style="padding:3px 6px;${isCurrent ? 'background:rgba(212,168,36,0.15);border-radius:4px;' : ''}display:flex;justify-content:space-between;font-size:12px;">
        <span style="color:${isCurrent ? 'var(--gold)' : 'var(--text-primary)'}">${c.name}</span>
        <span style="color:var(--text-muted)">${c.initiative || '—'}</span>
      </div>`;
    });
    el.innerHTML = html || '<span style="color:var(--text-muted)">No combatants</span>';
  } else if (type === 'notes' || type === 'custom') {
    if (!el._textarea) {
      el.innerHTML = `<textarea placeholder="Type notes here..." style="width:100%;height:100%;background:transparent;border:none;color:var(--text-primary);font-size:12px;line-height:1.6;resize:none;outline:none;"></textarea>`;
      el._textarea = true;
    }
  } else {
    el.innerHTML = REF_CONTENT[type] || '<p>No content.</p>';
  }
}

// ============================================
// Combatant Context Menu
// ============================================
let ctxCombatantId = null;

function showCombatantContextMenu(e, id) {
  e.preventDefault();
  e.stopPropagation();
  closeAllContextMenus();
  ctxCombatantId = id;
  const menu = document.getElementById('combatantContextMenu');
  menu.classList.remove('hidden');
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
}

function handleCombatantContextAction(action) {
  const c = combatants.find(cb => cb.id === ctxCombatantId);
  if (!c) return;
  if (action === 'dupCombatant' || action === 'dupCombatant3' || action === 'dupCombatant5') {
    const count = action === 'dupCombatant3' ? 3 : action === 'dupCombatant5' ? 5 : 1;
    for (let i = 0; i < count; i++) {
      const dup = JSON.parse(JSON.stringify(c));
      dup.id = 'cb_'+Date.now()+'_'+Math.floor(Math.random()*10000);
      dup.name = c.name + ' ' + (combatants.filter(x => x.name.startsWith(c.name.replace(/ \d+$/,''))).length + 1);
      dup.initRoll = 0;
      dup.currentHP = dup.maxHP;
      dup.conditions = [];
      dup.buffs = [];
      dup.dead = false;
      combatants.push(dup);
    }
    showNotif(`Duplicated ${c.name} ×${count}`);
  } else if (action === 'toggleHideCombatant') {
    c.hidden = !c.hidden;
    showNotif(c.hidden ? `${c.name} hidden` : `${c.name} visible`);
  } else if (action === 'delCombatant') {
    combatants = combatants.filter(cb => cb.id !== ctxCombatantId);
    if (selectedCombatantId === ctxCombatantId) { selectedCombatantId = null; document.getElementById('ctDetailCol')?.classList.add('hidden'); }
    showNotif('Combatant removed');
  }
  closeAllContextMenus();
  renderCombatants(); updateTurnBar();
}

// ============================================
// Faction/Contact Context Menu
// ============================================
let ctxFacItemId = null;
let ctxFacItemType = null; // 'faction' or 'contact'

function showFacContactContextMenu(e, type, id) {
  e.preventDefault();
  e.stopPropagation();
  closeAllContextMenus();
  ctxFacItemId = id;
  ctxFacItemType = type;
  const menu = document.getElementById('facContactContextMenu');
  menu.classList.remove('hidden');
  menu.style.left = e.clientX + 'px';
  menu.style.top = e.clientY + 'px';
}

function handleFacContactContextAction(action) {
  if (action === 'dupFacItem') {
    if (ctxFacItemType === 'faction') {
      const f = factions.find(fc => fc.id === ctxFacItemId);
      if (f) {
        const dup = JSON.parse(JSON.stringify(f));
        dup.id = 'fac_'+Date.now();
        dup.name = f.name + ' (copy)';
        factions.push(dup);
        renderFactionGrid(); renderFactionsSidebar(); showNotif('Faction duplicated');
      }
    } else if (ctxFacItemType === 'contact') {
      const c = contacts.find(co => co.id === ctxFacItemId);
      if (c) {
        const dup = JSON.parse(JSON.stringify(c));
        dup.id = 'con_'+Date.now();
        dup.name = c.name + ' (copy)';
        contacts.push(dup);
        renderContactsGrid(); renderContactsSidebar(); showNotif('Contact duplicated');
      }
    } else if (ctxFacItemType === 'org') {
      duplicateOrg(ctxFacItemId);
    }
  } else if (action === 'toggleHideFacItem') {
    if (ctxFacItemType === 'faction') {
      const f = factions.find(fc => fc.id === ctxFacItemId);
      if (f) { f.hidden = !f.hidden; renderFactionGrid(); renderFactionsSidebar(); showNotif(f.hidden ? 'Faction hidden' : 'Faction visible'); }
    } else if (ctxFacItemType === 'contact') {
      const c = contacts.find(co => co.id === ctxFacItemId);
      if (c) { c.hidden = !c.hidden; renderContactsGrid(); renderContactsSidebar(); showNotif(c.hidden ? 'Contact hidden' : 'Contact visible'); }
    } else if (ctxFacItemType === 'org') {
      const o = organizations.find(x => x.id === ctxFacItemId);
      if (o) { o.hidden = !o.hidden; renderOrgsGrid(); renderOrgsSidebar(); showNotif(o.hidden ? 'Organization hidden' : 'Organization visible'); }
    }
  } else if (action === 'delFacItem') {
    if (ctxFacItemType === 'faction') deleteFaction(ctxFacItemId);
    else if (ctxFacItemType === 'contact') deleteContact(ctxFacItemId);
    else if (ctxFacItemType === 'org') deleteOrg(ctxFacItemId);
  }
  closeAllContextMenus();
}

// ============================================
// Factions & Contacts
// ============================================
let factions = [];
let contacts = [];
let organizations = [];
let selectedFactionId = null;
let selectedContactId = null;
let selectedOrgId = null;
let currentFacTab = 'factions';

const FACTION_STATUSES = ['Allied','Friendly','Neutral','Suspicious','Hostile','At War'];
const FACTION_TIERS = ['','Tier 0 (Weak)','Tier I','Tier II','Tier III','Tier IV','Tier V (Dominant)','Tier VI (Legendary)'];
const FAC_COLORS = ['#f43f5e','#3b82f6','#22c55e','#f97316','#8b5cf6','#14b8a6','#eab308','#ec4899','#6366f1','#84cc16'];
const CONTACT_TYPES = [
  {value:'contact',label:'Contact'},
  {value:'cohort',label:'Cohort / Ally'},
  {value:'informant',label:'Informant'},
  {value:'rival',label:'Rival'},
  {value:'patron',label:'Patron'},
  {value:'merchant',label:'Merchant'},
  {value:'agent',label:'Agent'},
  {value:'enforcer',label:'Enforcer'},
  {value:'scholar',label:'Scholar'},
  {value:'noble',label:'Noble'},
  {value:'spy',label:'Spy'},
  {value:'other',label:'Other'}
];
const REP_LEVELS = [
  {val:-3,label:'Hunted',color:'#dc2626'},
  {val:-2,label:'War',color:'#ef4444'},
  {val:-1,label:'Hostile',color:'#f97316'},
  {val:0,label:'Neutral',color:'#6b7280'},
  {val:1,label:'Favorable',color:'#3b82f6'},
  {val:2,label:'Friendly',color:'#22c55e'},
  {val:3,label:'Allied',color:'#a78bfa'}
];

// ---- Standalone Tag Functions (wired via addEventListener) ----
function addFacTagFromInput() {
  const input = document.getElementById('facDetailTagsInput');
  if (!input) return;
  const f = factions.find(fc => fc.id === selectedFactionId);
  if (!f) return;
  const raw = input.value.replace(/,/g, '').trim().toLowerCase();
  if (!raw) { input.value = ''; return; }
  if (!f.tags) f.tags = [];
  if (!f.tags.includes(raw)) {
    f.tags.push(raw);
  }
  input.value = '';
  renderFacDetailTags(); renderFactionGrid();
}

function addConTagFromInput() {
  const input = document.getElementById('conDetailTagsInput');
  if (!input) return;
  const c = contacts.find(co => co.id === selectedContactId);
  if (!c) return;
  const raw = input.value.replace(/,/g, '').trim().toLowerCase();
  if (!raw) { input.value = ''; return; }
  if (!c.tags) c.tags = [];
  if (!c.tags.includes(raw)) {
    c.tags.push(raw);
  }
  input.value = '';
  renderConDetailTags(); renderContactsGrid();
}

function renderFacDetailTags() {
  const el = document.getElementById('facDetailTagsDisplay');
  const f = factions.find(fc => fc.id === selectedFactionId);
  if (!el || !f) return;
  el.innerHTML = (f.tags||[]).map(t =>
    `<span class="chapter-tag-pill">${t}<button class="chapter-tag-remove" onclick="removeFacTag('${t.replace(/'/g,"\\'")}')">×</button></span>`
  ).join('');
}

function removeFacTag(tag) {
  const f = factions.find(fc => fc.id === selectedFactionId); if (!f) return;
  f.tags = (f.tags||[]).filter(t => t !== tag);
  renderFacDetailTags(); renderFactionGrid();
}

function renderConDetailTags() {
  const el = document.getElementById('conDetailTagsDisplay');
  const c = contacts.find(co => co.id === selectedContactId);
  if (!el || !c) return;
  el.innerHTML = (c.tags||[]).map(t =>
    `<span class="chapter-tag-pill">${t}<button class="chapter-tag-remove" onclick="removeConTag('${t.replace(/'/g,"\\'")}')">×</button></span>`
  ).join('');
}

function removeConTag(tag) {
  const c = contacts.find(co => co.id === selectedContactId); if (!c) return;
  c.tags = (c.tags||[]).filter(t => t !== tag);
  renderConDetailTags(); renderContactsGrid();
}

// ---- Read More Toggle ----
function toggleFacReadMore(id) {
  const el = document.getElementById('fac-desc-' + id);
  const btn = document.getElementById('fac-rm-' + id);
  if (!el || !btn) return;
  if (el.classList.contains('expanded')) {
    el.classList.remove('expanded');
    btn.textContent = 'Read more';
  } else {
    el.classList.add('expanded');
    btn.textContent = 'Show less';
  }
}

function toggleFacConnMore(facId) {
  const el = document.getElementById('fac-conn-more-' + facId);
  const btn = el?.nextElementSibling;
  if (!el) return;
  const isExpanded = !el.classList.contains('hidden');
  el.classList.toggle('hidden', isExpanded);
  if (btn && btn.classList.contains('fac-conn-toggle')) {
    const count = el.querySelectorAll('.fac-contact-row').length;
    btn.textContent = isExpanded ? `+${count} more ▾` : `Show less ▴`;
  }
}

function toggleConReadMore(id) {
  const el = document.getElementById('con-desc-' + id);
  const btn = document.getElementById('con-rm-' + id);
  if (!el || !btn) return;
  if (el.classList.contains('expanded')) {
    el.classList.remove('expanded');
    btn.textContent = 'Read more';
  } else {
    el.classList.add('expanded');
    btn.textContent = 'Show less';
  }
}

// ---- Sub-tab switching ----
function switchFacTab(tab) {
  currentFacTab = tab;
  document.getElementById('facTabFactions')?.classList.toggle('active', tab === 'factions');
  document.getElementById('facTabContacts')?.classList.toggle('active', tab === 'contacts');
  document.getElementById('facTabOrgs')?.classList.toggle('active', tab === 'orgs');
  document.getElementById('facBody')?.classList.toggle('hidden', tab !== 'factions');
  document.getElementById('facContactsBody')?.classList.toggle('hidden', tab !== 'contacts');
  document.getElementById('facOrgsBody')?.classList.toggle('hidden', tab !== 'orgs');
  document.getElementById('factionsListSection')?.classList.toggle('hidden', tab !== 'factions');
  document.getElementById('contactsListSection')?.classList.toggle('hidden', tab !== 'contacts');
  document.getElementById('orgsListSection')?.classList.toggle('hidden', tab !== 'orgs');

  if (tab === 'factions') {
    selectedContactId = null; selectedOrgId = null;
    renderFactionGrid(); renderFactionsSidebar();
    if (selectedFactionId) showFacDetail(); else showFacEmpty();
  } else if (tab === 'contacts') {
    selectedFactionId = null; selectedOrgId = null;
    renderContactsGrid(); renderContactsSidebar();
    if (selectedContactId) showContactDetail(); else showFacEmpty();
  } else if (tab === 'orgs') {
    selectedFactionId = null; selectedContactId = null;
    renderOrgsGrid(); renderOrgsSidebar();
    if (selectedOrgId) showOrgDetail(); else showFacEmpty();
  }
}

function showFacEmpty() {
  const get = id => document.getElementById(id);
  get('factionDetails')?.classList.add('hidden');
  get('contactDetails')?.classList.add('hidden');
  get('orgDetails')?.classList.add('hidden');
  get('cardDetails')?.classList.add('hidden');
  get('pinDetails')?.classList.add('hidden');
  get('chapterDetails')?.classList.add('hidden');
  get('tlDetails')?.classList.add('hidden');
  get('tlCalendarPanel')?.classList.add('hidden');
  get('emptyState')?.classList.remove('hidden');
}

// ---- Faction Create Popup ----
function openFactionCreateModal() {
  document.getElementById('facCreateName').value = '';
  document.getElementById('facCreateDesc').value = '';
  document.getElementById('facCreateTier').value = '';
  document.getElementById('facCreateStatus').value = 'Neutral';
  const cc = document.getElementById('facCreateColors');
  cc.innerHTML = FAC_COLORS.map((c, i) => `<button class="fac-color-btn${i===0?' active':''}" data-color="${c}" style="background:${c};" onclick="document.querySelectorAll('#facCreateColors .fac-color-btn').forEach(b=>b.classList.remove('active'));this.classList.add('active');"></button>`).join('');
  document.getElementById('factionCreateModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('facCreateName').focus(), 50);
}
function closeFactionCreateModal() { document.getElementById('factionCreateModal').classList.add('hidden'); }
function confirmFactionCreate() {
  const name = document.getElementById('facCreateName').value.trim();
  if (!name) { showNotif('Enter a faction name'); return; }
  const desc = document.getElementById('facCreateDesc').value.trim();
  const tier = document.getElementById('facCreateTier').value;
  const status = document.getElementById('facCreateStatus').value;
  const activeColor = document.querySelector('#facCreateColors .fac-color-btn.active');
  const color = activeColor ? activeColor.dataset.color : FAC_COLORS[factions.length % FAC_COLORS.length];
  factions.push({
    id: 'fac_'+Date.now(), name, color, reputation: 0, tier, status,
    description: desc, notes: '', claims: [], tags: [], image: null
  });
  closeFactionCreateModal();
  selectedFactionId = factions[factions.length-1].id;
  renderFactionGrid(); renderFactionsSidebar(); showFacDetail(); showNotif('Faction created');
}

// ---- Contact Create Popup ----
function openContactCreateModal() {
  document.getElementById('conCreateName').value = '';
  document.getElementById('conCreateRole').value = '';
  document.getElementById('conCreateDisp').value = 'Neutral';
  document.getElementById('conCreateType').value = 'contact';
  document.getElementById('conCreateNotes').value = '';
  const sel = document.getElementById('conCreateFaction');
  sel.innerHTML = '<option value="">— Independent —</option>' + factions.map(f => `<option value="${f.id}">${f.name}</option>`).join('');
  document.getElementById('contactCreateModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('conCreateName').focus(), 50);
}
function closeContactCreateModal() { document.getElementById('contactCreateModal').classList.add('hidden'); }
function confirmContactCreate() {
  const name = document.getElementById('conCreateName').value.trim();
  if (!name) { showNotif('Enter a contact name'); return; }
  contacts.push({
    id: 'con_'+Date.now(), name,
    factionId: document.getElementById('conCreateFaction').value,
    role: document.getElementById('conCreateRole').value.trim(),
    disposition: document.getElementById('conCreateDisp').value,
    type: document.getElementById('conCreateType').value,
    description: '', notes: document.getElementById('conCreateNotes').value.trim(),
    tags: [], image: null
  });
  closeContactCreateModal();
  renderFactionGrid(); renderContactsSidebar(); renderContactsGrid(); renderFactionsSidebar(); showNotif('Contact added');
}

function deleteFaction(id) {
  factions = factions.filter(f => f.id !== id);
  contacts.forEach(c => { if (c.factionId === id) c.factionId = ''; });
  if (selectedFactionId === id) { selectedFactionId = null; showFacEmpty(); }
  renderFactionGrid(); renderFactionsSidebar(); renderContactsSidebar(); renderContactsGrid(); showNotif('Faction deleted');
}

function deleteContact(id) {
  contacts = contacts.filter(c => c.id !== id);
  if (selectedContactId === id) { selectedContactId = null; showFacEmpty(); }
  renderFactionGrid(); renderContactsSidebar(); renderContactsGrid(); showNotif('Contact removed');
}

function getRepLevel(val) { return REP_LEVELS.find(r => r.val === val) || REP_LEVELS[3]; }

function setFactionRep(id, val) {
  const f = factions.find(fc => fc.id === id); if (!f) return;
  f.reputation = Math.max(-3, Math.min(3, val));
  renderFactionGrid(); renderFactionsSidebar();
  if (selectedFactionId === id) showFacDetail();
}

// Claims
function openClaimAdd(facId) {
  claimAddTargetId = facId;
  document.getElementById('claimAddInput').value = '';
  document.getElementById('claimAddModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('claimAddInput').focus(), 50);
}
function confirmClaimAdd() {
  const f = factions.find(fc => fc.id === claimAddTargetId); if (!f) return;
  const val = document.getElementById('claimAddInput').value.trim();
  if (!val) return;
  if (!f.claims) f.claims = [];
  f.claims.push(val);
  document.getElementById('claimAddModal').classList.add('hidden');
  claimAddTargetId = null;
  renderFactionGrid();
  if (selectedFactionId === f.id) showFacDetail();
}

function removeFactionClaim(facId, idx) {
  const f = factions.find(fc => fc.id === facId); if (!f) return;
  f.claims.splice(idx, 1);
  renderFactionGrid();
  if (selectedFactionId === facId) showFacDetail();
}

// ---- Image Upload ----
function handleFacImageUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  uploadFileImage(file, (url) => {
    const f = factions.find(fc => fc.id === selectedFactionId); if (!f) return;
    f.image = url;
    showFacDetail(); renderFactionGrid();
  });
  e.target.value = '';
}
function removeFacImage() {
  const f = factions.find(fc => fc.id === selectedFactionId); if (!f) return;
  f.image = null; showFacDetail(); renderFactionGrid();
}
function handleConImageUpload(e) {
  const file = e.target.files[0]; if (!file) return;
  uploadFileImage(file, (url) => {
    const c = contacts.find(co => co.id === selectedContactId); if (!c) return;
    c.image = url;
    showContactDetail(); renderContactsGrid();
  });
  e.target.value = '';
}
function removeConImage() {
  const c = contacts.find(co => co.id === selectedContactId); if (!c) return;
  c.image = null; showContactDetail(); renderContactsGrid();
}

// ---- Selection ----
function selectFaction(id) {
  selectedFactionId = id;
  renderFactionGrid(); renderFactionsSidebar(); showFacDetail();
}
function selectContact(id) {
  selectedContactId = id;
  renderContactsGrid(); renderContactsSidebar(); showContactDetail();
}

// ---- Show Faction Detail ----
function showFacDetail() {
  const f = factions.find(fc => fc.id === selectedFactionId);
  if (!f) { showFacEmpty(); return; }

  const get = id => document.getElementById(id);
  get('emptyState')?.classList.add('hidden');
  get('cardDetails')?.classList.add('hidden');
  get('pinDetails')?.classList.add('hidden');
  get('chapterDetails')?.classList.add('hidden');
  get('tlDetails')?.classList.add('hidden');
  get('tlCalendarPanel')?.classList.add('hidden');
  get('contactDetails')?.classList.add('hidden');
  get('factionDetails')?.classList.remove('hidden');
  get('detailsPanel')?.classList.remove('collapsed');

  // Color bar
  const bar = get('facDetailColorBar');
  if (bar) bar.style.background = f.color;

  // Image
  const img = get('facDetailImage');
  const noImg = get('facDetailNoImage');
  const removeBtn = get('facDetailRemoveImg');
  if (f.image) {
    img.src = f.image; img.classList.remove('hidden'); noImg.classList.add('hidden');
    removeBtn?.classList.remove('hidden');
  } else {
    img.classList.add('hidden'); noImg.classList.remove('hidden');
    removeBtn?.classList.add('hidden');
  }

  // Name
  const nameInput = get('facDetailName');
  nameInput.value = f.name;
  nameInput.onblur = () => { f.name = nameInput.value.trim() || f.name; renderFactionGrid(); renderFactionsSidebar(); };

  // Tier
  get('facDetailTier').value = f.tier || '';
  get('facDetailTier').onchange = function() { f.tier = this.value; renderFactionGrid(); renderFactionsSidebar(); };

  // Status
  get('facDetailStatus').value = f.status || 'Neutral';
  get('facDetailStatus').onchange = function() { f.status = this.value; renderFactionGrid(); };

  // Reputation
  const repTrack = get('facDetailRepTrack');
  const repLabel = get('facDetailRepLabel');
  const rep = getRepLevel(f.reputation);
  repTrack.innerHTML = REP_LEVELS.map(r =>
    `<div class="fac-rep-pip${r.val === f.reputation ? ' active' : ''}" style="${r.val === f.reputation ? 'background:'+r.color+';box-shadow:0 0 6px '+r.color+';' : ''}" onclick="setFactionRep('${f.id}',${r.val})" title="${r.label} (${r.val > 0 ? '+' : ''}${r.val})"></div>`
  ).join('');
  repLabel.style.color = rep.color;
  repLabel.textContent = `${rep.label} (${rep.val > 0 ? '+' : ''}${rep.val})`;

  // Description
  const descArea = get('facDetailDesc');
  descArea.value = f.description || '';
  descArea.onblur = () => { f.description = descArea.value; renderFactionGrid(); };

  // Tags - display only, input handler is permanent via addEventListener
  renderFacDetailTags();
  get('facDetailTagsInput').value = '';

  // Associations (real bidirectional system)
  get('facAssociationSearch').value = '';
  renderAssociationsList('faction', f.id, 'facDetailAssocList');

  // Claims
  renderFacDetailClaims(f);

  // Connections
  renderFacDetailConnections(f);

  // Notes
  const notesArea = get('facDetailNotes');
  notesArea.value = f.notes || '';
  notesArea.onblur = () => { f.notes = notesArea.value; };
}

function renderFacDetailClaims(f) {
  const el = document.getElementById('facDetailClaimsList');
  if (!el) return;
  el.innerHTML = (f.claims||[]).map((cl, i) =>
    `<span class="fac-claim">${cl}<span class="fac-claim-x" onclick="removeFactionClaim('${f.id}',${i})">×</span></span>`
  ).join('') || '<span style="font-size:11px;color:var(--text-muted);">None</span>';
}

function renderFacDetailConnections(f) {
  const el = document.getElementById('facDetailConnections');
  if (!el) return;
  const facConns = contacts.filter(c => c.factionId === f.id);
  if (facConns.length === 0) {
    el.innerHTML = '<div style="font-size:11px;color:var(--text-muted);margin-bottom:4px;">None</div>';
  } else {
    el.innerHTML = facConns.map(c => {
      const typeLabel = c.type === 'cohort' ? '⚔ ' : '';
      const typeBadge = c.type && c.type !== 'contact' ? `<span class="fac-type-badge">${c.type}</span>` : '';
      return `<div class="fac-contact-row"><span class="fac-contact-name">${typeLabel}${c.name}</span>${typeBadge}<span class="fac-contact-role">${c.role || '—'}</span><span class="fac-contact-disp ${c.disposition?.toLowerCase()||'neutral'}">${c.disposition||'Neutral'}</span></div>`;
    }).join('');
  }
}

// ---- Show Contact Detail ----
function showContactDetail() {
  const c = contacts.find(co => co.id === selectedContactId);
  if (!c) { showFacEmpty(); return; }

  const get = id => document.getElementById(id);
  get('emptyState')?.classList.add('hidden');
  get('cardDetails')?.classList.add('hidden');
  get('pinDetails')?.classList.add('hidden');
  get('chapterDetails')?.classList.add('hidden');
  get('tlDetails')?.classList.add('hidden');
  get('tlCalendarPanel')?.classList.add('hidden');
  get('factionDetails')?.classList.add('hidden');
  get('contactDetails')?.classList.remove('hidden');
  get('detailsPanel')?.classList.remove('collapsed');

  // Image
  const img = get('conDetailImage');
  const noImg = get('conDetailNoImage');
  const removeBtn = get('conDetailRemoveImg');
  if (c.image) {
    img.src = c.image; img.classList.remove('hidden'); noImg.classList.add('hidden');
    removeBtn?.classList.remove('hidden');
  } else {
    img.classList.add('hidden'); noImg.classList.remove('hidden');
    removeBtn?.classList.add('hidden');
  }

  get('conDetailName').value = c.name;
  get('conDetailName').onblur = function() { c.name = this.value.trim() || c.name; renderContactsGrid(); renderContactsSidebar(); renderFactionGrid(); };

  get('conDetailRole').value = c.role || '';
  get('conDetailRole').onblur = function() { c.role = this.value.trim(); renderContactsGrid(); renderContactsSidebar(); };

  const facSel = get('conDetailFaction');
  facSel.innerHTML = '<option value="">— Independent —</option>' + factions.map(f => `<option value="${f.id}"${c.factionId===f.id?' selected':''}>${f.name}</option>`).join('');
  facSel.value = c.factionId || '';
  facSel.onchange = function() { c.factionId = this.value; renderContactsGrid(); renderContactsSidebar(); renderFactionGrid(); };

  get('conDetailDisp').value = c.disposition || 'Neutral';
  get('conDetailDisp').onchange = function() { c.disposition = this.value; renderContactsGrid(); renderContactsSidebar(); renderFactionGrid(); };

  // Type text field
  const typeSel = get('conDetailType');
  typeSel.value = c.type || '';
  typeSel.oninput = function() { c.type = this.value; renderContactsGrid(); renderContactsSidebar(); renderFactionGrid(); };

  // Description
  get('conDetailDesc').value = c.description || '';
  get('conDetailDesc').onblur = function() { c.description = this.value; renderContactsGrid(); };

  // Tags - display only, input handler is permanent
  renderConDetailTags();
  get('conDetailTagsInput').value = '';

  // Associations
  get('conAssociationSearch').value = '';
  renderAssociationsList('contact', c.id, 'conDetailAssocList');

  // Notes
  get('conDetailNotes').value = c.notes || '';
  get('conDetailNotes').onblur = function() { c.notes = this.value; };
}

// ---- Sidebar Renders ----
function renderFactionsSidebar() {
  const el = document.getElementById('factionsList'); if (!el) return;
  if (factions.length === 0) { el.innerHTML = '<div class="empty-pins-message">No factions yet</div>'; return; }
  el.innerHTML = factions.map(f => {
    const rep = getRepLevel(f.reputation);
    const active = f.id === selectedFactionId ? ' active' : '';
    return `<div class="sidebar-item${active}${f.hidden ? ' item-hidden' : ''}" onclick="selectFaction('${f.id}')" oncontextmenu="showFacContactContextMenu(event,'faction','${f.id}')" style="border-left:3px solid ${f.color};position:relative;">
      ${f.hidden ? '<span class="hidden-badge-sm" title="Hidden">👁</span>' : ''}
      <span class="sidebar-item-name">${f.name}</span>
      <span class="sidebar-item-sub"><span style="color:${rep.color};">●</span> ${rep.label}${f.tier ? ' · '+f.tier : ''}</span>
      <button class="sidebar-del-btn" onclick="event.stopPropagation();deleteFaction('${f.id}')" title="Delete">×</button>
    </div>`;
  }).join('');
}

function renderContactsSidebar() {
  const el = document.getElementById('contactsList'); if (!el) return;
  if (contacts.length === 0) { el.innerHTML = '<div class="empty-pins-message">No contacts yet</div>'; return; }
  el.innerHTML = contacts.map(c => {
    const fac = factions.find(f => f.id === c.factionId);
    const active = c.id === selectedContactId ? ' active' : '';
    const typeLabel = c.type && c.type !== 'contact' ? c.type + ' · ' : '';
    return `<div class="sidebar-item${active}${c.hidden ? ' item-hidden' : ''}" onclick="selectContact('${c.id}')" oncontextmenu="showFacContactContextMenu(event,'contact','${c.id}')" style="border-left:3px solid ${fac ? fac.color : '#666'};position:relative;">
      ${c.hidden ? '<span class="hidden-badge-sm" title="Hidden">👁</span>' : ''}
      <span class="sidebar-item-name">${c.name}</span>
      <span class="sidebar-item-sub">${typeLabel}${c.role || 'Unknown role'}${fac ? ' · '+fac.name : ' · Independent'}</span>
      <button class="sidebar-del-btn" onclick="event.stopPropagation();deleteContact('${c.id}')" title="Delete">×</button>
    </div>`;
  }).join('');
}

// ---- Faction Grid ----
function renderFactionGrid() {
  const grid = document.getElementById('facGrid'); if (!grid) return;
  if (factions.length === 0) {
    grid.innerHTML = '<div class="fac-empty"><p>No factions yet</p><p style="opacity:0.5;font-size:12px;">Create factions from the sidebar to begin tracking</p></div>';
    return;
  }
  grid.innerHTML = factions.map(f => {
    const rep = getRepLevel(f.reputation);
    const facConnections = contacts.filter(c => c.factionId === f.id);
    const isSel = f.id === selectedFactionId;

    const repPips = REP_LEVELS.map(r =>
      `<div class="fac-rep-pip${r.val === f.reputation ? ' active' : ''}" style="${r.val === f.reputation ? 'background:'+r.color+';box-shadow:0 0 6px '+r.color+';' : ''}" onclick="event.stopPropagation();setFactionRep('${f.id}',${r.val})" title="${r.label} (${r.val > 0 ? '+' : ''}${r.val})"></div>`
    ).join('');

    const tagPills = (f.tags||[]).slice(0,5).map(t => `<span class="fac-tag-pill-sm">${t}</span>`).join('');
    const claimPills = (f.claims||[]).map(cl => `<span class="fac-claim-sm">${cl}</span>`).join('');

    // Description with read more (preserve newlines)
    let descHtml = '';
    if (f.description) {
      const safeDesc = parseWikiLinks(f.description.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'));
      const needsRM = f.description.length > 120;
      descHtml = `<div class="fac-card-desc${needsRM ? '' : ' expanded'}" id="fac-desc-${f.id}">${safeDesc}</div>`;
      if (needsRM) descHtml += `<button class="fac-read-more" id="fac-rm-${f.id}" onclick="event.stopPropagation();toggleFacReadMore('${f.id}')">Read more</button>`;
    }

    const connRows = facConnections.length > 0 ? facConnections.slice(0,3).map(c => {
      const typeIcon = c.type === 'cohort' ? '⚔ ' : '';
      return `<div class="fac-contact-row"><span class="fac-contact-name">${typeIcon}${c.name}</span>${c.type && c.type !== 'contact' ? '<span class="fac-type-badge">'+c.type+'</span>' : ''}<span class="fac-contact-role">${c.role || '—'}</span><span class="fac-contact-disp ${c.disposition?.toLowerCase()||'neutral'}">${c.disposition || 'Neutral'}</span></div>`;
    }).join('') + (facConnections.length > 3 ? `<div class="fac-conn-overflow hidden" id="fac-conn-more-${f.id}">${facConnections.slice(3).map(c => {
      const typeIcon = c.type === 'cohort' ? '⚔ ' : '';
      return `<div class="fac-contact-row"><span class="fac-contact-name">${typeIcon}${c.name}</span>${c.type && c.type !== 'contact' ? '<span class="fac-type-badge">'+c.type+'</span>' : ''}<span class="fac-contact-role">${c.role || '—'}</span><span class="fac-contact-disp ${c.disposition?.toLowerCase()||'neutral'}">${c.disposition || 'Neutral'}</span></div>`;
    }).join('')}</div><button class="fac-conn-toggle" onclick="event.stopPropagation();toggleFacConnMore('${f.id}')">+${facConnections.length-3} more ▾</button>` : '')
    : '<div style="font-size:11px;color:var(--text-muted);">None</div>';

    const imgHtml = f.image ? `<img src="${f.image}" class="fac-card-icon" alt="" />` : '';

    return `<div class="fac-card${isSel ? ' selected' : ''}${f.hidden ? ' item-hidden' : ''}" onclick="selectFaction('${f.id}')" oncontextmenu="showFacContactContextMenu(event,'faction','${f.id}')" style="--fac-color:${f.color};">
      ${f.hidden ? '<span class="hidden-badge-card" title="Hidden from players">👁</span>' : ''}
      <div class="fac-card-header">
        ${imgHtml}
        <div class="fac-card-color" style="background:${f.color};"></div>
        <div class="fac-card-title">
          <div class="fac-card-name">${f.name}</div>
          <div class="fac-card-meta">
            ${f.tier ? `<span class="fac-card-tier">${f.tier}</span>` : ''}
            <span class="fac-card-status">${f.status}</span>
          </div>
        </div>
      </div>
      <div class="fac-rep-section"><div class="fac-rep-track">${repPips}</div><div class="fac-rep-label" style="color:${rep.color};">${rep.label}</div></div>
      ${descHtml}
      ${tagPills || claimPills ? `<div class="fac-card-pills">${tagPills}${claimPills}</div>` : ''}
      <div class="fac-card-connections"><label class="fac-label">Connections <span style="opacity:0.5;">(${facConnections.length})</span></label>${connRows}</div>
      ${f.notes ? '<div class="fac-card-notes-indicator">📝 Has GM notes</div>' : ''}
    </div>`;
  }).join('');
}

// ---- Contacts Grid ----
function renderContactsGrid() {
  const grid = document.getElementById('facContactsGrid'); if (!grid) return;
  if (contacts.length === 0) {
    grid.innerHTML = '<div class="fac-empty"><p>No contacts yet</p><p style="opacity:0.5;font-size:12px;">Add contacts from the sidebar</p></div>';
    return;
  }
  grid.innerHTML = contacts.map(c => {
    const fac = factions.find(f => f.id === c.factionId);
    const isSel = c.id === selectedContactId;
    const typeIcon = c.type === 'cohort' ? '⚔ ' : '';
    const imgHtml = c.image ? `<img src="${c.image}" class="con-card-icon" alt="" />` : '';
    const tagPills = (c.tags||[]).slice(0,4).map(t => `<span class="fac-tag-pill-sm">${t}</span>`).join('');

    // Description with read more (preserve newlines)
    let descHtml = '';
    if (c.description) {
      const safeDesc = parseWikiLinks(c.description.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'));
      const needsRM = c.description.length > 80;
      descHtml = `<div class="fac-contact-card-notes${needsRM ? '' : ' expanded'}" id="con-desc-${c.id}">${safeDesc}</div>`;
      if (needsRM) descHtml += `<button class="fac-read-more" id="con-rm-${c.id}" onclick="event.stopPropagation();toggleConReadMore('${c.id}')">Read more</button>`;
    }

    return `<div class="fac-contact-card${isSel ? ' selected' : ''}${c.hidden ? ' item-hidden' : ''}" onclick="selectContact('${c.id}')" oncontextmenu="showFacContactContextMenu(event,'contact','${c.id}')" style="--fac-color:${fac ? fac.color : '#666'};">
      ${c.hidden ? '<span class="hidden-badge-card" title="Hidden from players">👁</span>' : ''}
      <div class="fac-contact-card-header">
        ${imgHtml}
        <div style="flex:1;">
          <div class="fac-contact-card-name">${typeIcon}${c.name}</div>
          <div class="fac-contact-card-meta">
            ${c.role ? `<span class="fac-contact-card-role">${c.role}</span>` : ''}
            ${fac ? `<span class="fac-contact-card-faction" style="color:${fac.color};">● ${fac.name}</span>` : '<span class="fac-contact-card-faction" style="color:#666;">Independent</span>'}
          </div>
        </div>
        <span class="fac-contact-disp ${c.disposition?.toLowerCase()||'neutral'}">${c.disposition || 'Neutral'}</span>
      </div>
      ${c.type && c.type !== 'contact' ? `<div class="fac-contact-card-type">${c.type}</div>` : ''}
      ${descHtml}
      ${tagPills ? `<div class="fac-card-pills" style="margin-top:4px;">${tagPills}</div>` : ''}
    </div>`;
  }).join('');
}

// ---- ORGANIZATIONS ----
function openOrgCreateModal() {
  document.getElementById('orgCreateName').value = '';
  document.getElementById('orgCreateType').value = '';
  document.getElementById('orgCreateLocation').value = '';
  document.getElementById('orgCreateLeader').value = '';
  window._orgCreateColor = '#6366f1';
  initSwatchPicker('orgCreateColorSwatches', '#6366f1', (c) => { window._orgCreateColor = c; });
  document.getElementById('orgCreateModal').classList.remove('hidden');
  setTimeout(() => document.getElementById('orgCreateName').focus(), 100);
}
function confirmCreateOrg() {
  const name = document.getElementById('orgCreateName').value.trim();
  if (!name) return;
  const org = {
    id: 'org_' + Date.now(),
    name,
    type: document.getElementById('orgCreateType').value.trim() || '',
    location: document.getElementById('orgCreateLocation').value.trim() || '',
    leader: document.getElementById('orgCreateLeader').value.trim() || '',
    color: window._orgCreateColor || '#6366f1',
    status: 'Active',
    influence: 'Local',
    description: '',
    goals: '',
    resources: '',
    notes: '',
    image: null,
    hidden: false,
    tags: []
  };
  organizations.push(org);
  document.getElementById('orgCreateModal').classList.add('hidden');
  selectedOrgId = org.id;
  renderOrgsGrid(); renderOrgsSidebar(); showOrgDetail();
  showNotif('Organization created');
}
function selectOrg(id) {
  selectedOrgId = id;
  renderOrgsGrid(); renderOrgsSidebar(); showOrgDetail();
}
function deleteOrg(id) {
  organizations = organizations.filter(o => o.id !== id);
  if (selectedOrgId === id) { selectedOrgId = null; showFacEmpty(); }
  renderOrgsGrid(); renderOrgsSidebar();
  showNotif('Organization deleted');
}
function duplicateOrg(id) {
  const o = organizations.find(x => x.id === id);
  if (!o) return;
  const dup = JSON.parse(JSON.stringify(o));
  dup.id = 'org_' + Date.now();
  dup.name += ' (Copy)';
  organizations.push(dup);
  selectedOrgId = dup.id;
  renderOrgsGrid(); renderOrgsSidebar(); showOrgDetail();
  showNotif('Organization duplicated');
}
function showOrgDetail() {
  const o = organizations.find(x => x.id === selectedOrgId);
  if (!o) return;
  const get = id => document.getElementById(id);
  // Hide others, show org
  get('factionDetails')?.classList.add('hidden');
  get('contactDetails')?.classList.add('hidden');
  get('cardDetails')?.classList.add('hidden');
  get('pinDetails')?.classList.add('hidden');
  get('chapterDetails')?.classList.add('hidden');
  get('tlDetails')?.classList.add('hidden');
  get('tlCalendarPanel')?.classList.add('hidden');
  get('emptyState')?.classList.add('hidden');
  get('orgDetails')?.classList.remove('hidden');

  get('orgDetailName').value = o.name;
  get('orgDetailName').oninput = () => { o.name = get('orgDetailName').value; renderOrgsGrid(); renderOrgsSidebar(); };
  get('orgDetailType').value = o.type || '';
  get('orgDetailType').oninput = () => { o.type = get('orgDetailType').value; renderOrgsGrid(); };
  get('orgDetailLeader').value = o.leader || '';
  get('orgDetailLeader').oninput = () => { o.leader = get('orgDetailLeader').value; };
  get('orgDetailLocation').value = o.location || '';
  get('orgDetailLocation').oninput = () => { o.location = get('orgDetailLocation').value; };
  get('orgDetailStatus').value = o.status || 'Active';
  get('orgDetailStatus').onchange = () => { o.status = get('orgDetailStatus').value; renderOrgsGrid(); };
  get('orgDetailInfluence').value = o.influence || 'Local';
  get('orgDetailInfluence').onchange = () => { o.influence = get('orgDetailInfluence').value; renderOrgsGrid(); };
  get('orgDetailDesc').value = o.description || '';
  get('orgDetailDesc').oninput = () => { o.description = get('orgDetailDesc').value; renderOrgsGrid(); };
  get('orgDetailGoals').value = o.goals || '';
  get('orgDetailGoals').oninput = () => { o.goals = get('orgDetailGoals').value; renderOrgsGrid(); };
  get('orgDetailResources').value = o.resources || '';
  get('orgDetailResources').oninput = () => { o.resources = get('orgDetailResources').value; renderOrgsGrid(); };
  get('orgDetailNotes').value = o.notes || '';
  get('orgDetailNotes').oninput = () => { o.notes = get('orgDetailNotes').value; };
  initSwatchPicker('orgDetailColorSwatches', o.color || '#6366f1', (c) => { o.color = c; renderOrgsGrid(); renderOrgsSidebar(); });

  // Image
  if (o.image) {
    get('orgDetailImage').src = o.image;
    get('orgDetailImage').classList.remove('hidden');
    get('orgDetailNoImage').classList.add('hidden');
    get('orgDetailRemoveImg')?.classList.remove('hidden');
  } else {
    get('orgDetailImage').classList.add('hidden');
    get('orgDetailNoImage').classList.remove('hidden');
    get('orgDetailRemoveImg')?.classList.add('hidden');
  }

  // Tags
  if (!o.tags) o.tags = [];
  renderOrgTags(o);
  const orgTagInput = get('orgDetailTagsInput');
  if (orgTagInput) orgTagInput.value = '';

  // Associations
  if (!o.associations) o.associations = [];
  renderOrgAssociations(o);
  const orgAssocSearch = get('orgAssociationSearch');
  if (orgAssocSearch) {
    orgAssocSearch.value = '';
    orgAssocSearch.oninput = () => handleOrgAssociationSearch(orgAssocSearch.value, o);
  }
}

function addOrgTagFromInput() {
  const input = document.getElementById('orgDetailTagsInput');
  if (!input) return;
  const o = organizations.find(x => x.id === selectedOrgId);
  if (!o) return;
  const raw = input.value.replace(/,/g, '').trim().toLowerCase();
  if (!raw) { input.value = ''; return; }
  if (!o.tags) o.tags = [];
  if (!o.tags.includes(raw)) {
    o.tags.push(raw);
  }
  input.value = '';
  renderOrgTags(o); renderOrgsGrid();
}

function renderOrgTags(o) {
  const el = document.getElementById('orgDetailTagsDisplay');
  if (!el || !o) return;
  el.innerHTML = (o.tags || []).map(t =>
    `<span class="chapter-tag-pill">${t}<button class="chapter-tag-remove" onclick="removeOrgTag('${o.id}','${t.replace(/'/g,"\\\'")}')">&times;</button></span>`
  ).join('');
}
function removeOrgTag(orgId, tag) {
  const o = organizations.find(x => x.id === orgId); if (!o) return;
  o.tags = (o.tags || []).filter(t => t !== tag);
  renderOrgTags(o); renderOrgsGrid();
}
function handleOrgAssociationSearch(query, org) {
  const resultsEl = document.getElementById('orgAssociationSearchResults');
  if (!resultsEl) return;
  const q = query.toLowerCase().trim();
  if (!q) { resultsEl.classList.add('hidden'); resultsEl.innerHTML = ''; return; }
  const matches = [];
  boards.forEach(b => (b.cards||[]).forEach(card => {
    if ((card.title||'').toLowerCase().includes(q)) matches.push({ type:'card', id:card.id, name:card.title, color: '#4ecdc4' });
  }));
  maps.forEach(m => (m.pins||[]).forEach(pin => {
    if ((pin.name||'').toLowerCase().includes(q)) matches.push({ type:'pin', id:pin.id, name:pin.name, color: pin.color, mapId: m.id });
  }));
  factions.forEach(f => { if ((f.name||'').toLowerCase().includes(q)) matches.push({ type:'faction', id:f.id, name:f.name, color: f.color }); });
  contacts.forEach(c => { if ((c.name||'').toLowerCase().includes(q)) matches.push({ type:'contact', id:c.id, name:c.name, color: '#888' }); });
  if (matches.length === 0) { resultsEl.classList.add('hidden'); return; }
  resultsEl.classList.remove('hidden');
  resultsEl.innerHTML = matches.slice(0,8).map(m =>
    `<div class="search-result-item" onclick="addOrgAssociation('${org.id}','${m.type}','${m.id}')"><span class="association-swatch type-${m.type}" style="background:${m.color}"></span><span class="search-result-name">${m.name}</span></div>`
  ).join('');
}
function addOrgAssociation(orgId, type, targetId) {
  const o = organizations.find(x => x.id === orgId); if (!o) return;
  if (!o.associations) o.associations = [];
  if (o.associations.some(a => a.type === type && a.id === targetId)) return;
  o.associations.push({ type, id: targetId });
  renderOrgAssociations(o);
  document.getElementById('orgAssociationSearch').value = '';
  document.getElementById('orgAssociationSearchResults').classList.add('hidden');
}
function removeOrgAssociation(orgId, type, targetId) {
  const o = organizations.find(x => x.id === orgId); if (!o) return;
  o.associations = (o.associations || []).filter(a => !(a.type === type && a.id === targetId));
  renderOrgAssociations(o);
}
function renderOrgAssociations(o) {
  const el = document.getElementById('orgDetailAssocList'); if (!el) return;
  if (!o.associations || o.associations.length === 0) { el.innerHTML = '<div style="font-size:11px;color:var(--text-muted);">No associations yet</div>'; return; }
  el.innerHTML = o.associations.map(a => {
    let name = '?', color = '#888';
    if (a.type === 'card') { const c = boards.flatMap(b=>b.cards).find(c=>c.id===a.id); if(c){name=c.title;color='#4ecdc4';} }
    else if (a.type === 'pin') { const p = maps.flatMap(m=>m.pins).find(p=>p.id===a.id); if(p){name=p.name;color=p.color;} }
    else if (a.type === 'faction') { const f = factions.find(f=>f.id===a.id); if(f){name=f.name;color=f.color;} }
    else if (a.type === 'contact') { const c = contacts.find(c=>c.id===a.id); if(c){name=c.name;} }
    return `<div class="association-item"><span class="association-swatch type-${a.type}" style="background:${color}"></span><span class="association-name">${name}</span><button class="association-remove" onclick="removeOrgAssociation('${o.id}','${a.type}','${a.id}')">×</button></div>`;
  }).join('');
}
function renderOrgsSidebar() {
  const list = document.getElementById('orgsList'); if (!list) return;
  if (organizations.length === 0) { list.innerHTML = '<div class="empty-pins-message">No organizations yet</div>'; return; }
  list.innerHTML = organizations.map(o => {
    const sel = o.id === selectedOrgId ? ' active' : '';
    const h = o.hidden ? ' item-hidden' : '';
    return `<div class="sidebar-item${sel}${h}" onclick="selectOrg('${o.id}')" oncontextmenu="showFacContactContextMenu(event,'org','${o.id}')" style="border-left:3px solid ${o.color};position:relative;">
      ${o.hidden ? '<span class="hidden-badge-sm" title="Hidden">👁</span>' : ''}
      <button class="sidebar-del-btn" onclick="event.stopPropagation();deleteOrg('${o.id}')" title="Delete">×</button>
      <span class="sidebar-item-name">${o.name}</span>
      <span class="sidebar-item-sub">${o.type || 'Organization'}${o.status ? ' · ' + o.status : ''}</span>
    </div>`;
  }).join('');
}
function renderOrgsGrid() {
  const grid = document.getElementById('facOrgsGrid'); if (!grid) return;
  if (organizations.length === 0) {
    grid.innerHTML = '<div class="fac-empty"><p>No organizations yet</p><p style="opacity:0.5;font-size:12px;">Add organizations from the sidebar to track guilds, companies, churches, etc.</p></div>';
    return;
  }
  grid.innerHTML = organizations.map(o => {
    const isSel = o.id === selectedOrgId;
    const tagsHtml = (o.tags || []).slice(0,4).map(t => `<span class="card-tag">${t}</span>`).join('');

    // Description with read more
    let descHtml = '';
    if (o.description) {
      const safeDesc = parseWikiLinks(o.description.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'));
      const needsRM = o.description.length > 120;
      descHtml = `<div class="fac-card-desc${needsRM ? '' : ' expanded'}" id="org-desc-${o.id}">${safeDesc}</div>`;
      if (needsRM) descHtml += `<button class="fac-read-more" onclick="event.stopPropagation();toggleOrgReadMore('${o.id}','desc')">Read more</button>`;
    }

    // Goals with read more
    let goalsHtml = '';
    if (o.goals) {
      const safeGoals = parseWikiLinks(o.goals.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'));
      const needsRM = o.goals.length > 80;
      goalsHtml = `<div style="margin-top:3px;"><span style="color:var(--gold);font-weight:600;font-size:10px;">Goals:</span>
        <div class="fac-card-desc${needsRM ? '' : ' expanded'}" id="org-goals-${o.id}" style="font-size:10px;color:var(--text-muted);">${safeGoals}</div>
        ${needsRM ? `<button class="fac-read-more" onclick="event.stopPropagation();toggleOrgReadMore('${o.id}','goals')">Read more</button>` : ''}</div>`;
    }

    // Resources with read more
    let resHtml = '';
    if (o.resources) {
      const safeRes = parseWikiLinks(o.resources.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\n/g,'<br>'));
      const needsRM = o.resources.length > 80;
      resHtml = `<div style="margin-top:2px;"><span style="color:#4ecdc4;font-weight:600;font-size:10px;">Resources:</span>
        <div class="fac-card-desc${needsRM ? '' : ' expanded'}" id="org-res-${o.id}" style="font-size:10px;color:var(--text-muted);">${safeRes}</div>
        ${needsRM ? `<button class="fac-read-more" onclick="event.stopPropagation();toggleOrgReadMore('${o.id}','res')">Read more</button>` : ''}</div>`;
    }

    return `<div class="fac-card${isSel ? ' selected' : ''}${o.hidden ? ' item-hidden' : ''}" onclick="selectOrg('${o.id}')" oncontextmenu="showFacContactContextMenu(event,'org','${o.id}')" style="border-top:3px solid ${o.color};">
      ${o.hidden ? '<span class="hidden-badge-card" title="Hidden">\ud83d\udc41</span>' : ''}
      ${o.image ? `<img src="${o.image}" style="width:100%;height:80px;object-fit:cover;border-radius:var(--radius-sm);margin-bottom:6px;" />` : ''}
      <div class="fac-card-name">${o.name}</div>
      <div class="fac-card-meta">${o.type ? o.type + ' \u00b7 ' : ''}${o.status || 'Active'}</div>
      ${o.leader ? `<div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">\ud83d\udc64 ${o.leader}</div>` : ''}
      ${o.location ? `<div style="font-size:11px;color:var(--text-secondary);">\ud83d\udccd ${o.location}</div>` : ''}
      ${o.influence ? `<div style="font-size:10px;color:var(--text-muted);margin-top:2px;">Influence: ${o.influence}</div>` : ''}
      ${descHtml}
      ${goalsHtml}
      ${resHtml}
      ${tagsHtml ? `<div class="card-tags" style="margin-top:4px;">${tagsHtml}</div>` : ''}
    </div>`;
  }).join('');
}

function toggleOrgReadMore(orgId, field) {
  const el = document.getElementById(`org-${field}-${orgId}`);
  const btn = el?.nextElementSibling;
  if (!el) return;
  el.classList.toggle('expanded');
  if (btn && btn.classList.contains('fac-read-more')) {
    btn.textContent = el.classList.contains('expanded') ? 'Show less' : 'Read more';
  }
}
// ============================================
// Mind Map System
// ============================================
let mmNodes = [];
let mmEdges = [];
let mmSelectedNode = null;
let mmDragging = null;
let mmDragOffset = { x: 0, y: 0 };
let mmIsPanning = false;
let mmPanStart = { x: 0, y: 0 };
let mmNodeColors = {};
let mmAnimFrame = null;
let mmPhysicsActive = false;

// Physics settings (tunable via sliders)
let mmSettings = {
  repulsion: 5000,
  attraction: 0.008,
  damping: 0.85,
  centerGravity: 0.002,
  linkDistance: 160,
};

function buildMindMapData() {
  const tagItems = {};
  const tagPairs = {};

  function addTags(tags, item) {
    if (!tags || !tags.length) return;
    const normTags = (Array.isArray(tags) ? tags : String(tags).split(',').map(t => t.trim())).map(t => t.toLowerCase()).filter(Boolean);
    normTags.forEach(tag => {
      if (!tagItems[tag]) tagItems[tag] = [];
      tagItems[tag].push(item);
    });
    for (let i = 0; i < normTags.length; i++) {
      for (let j = i + 1; j < normTags.length; j++) {
        const key = [normTags[i], normTags[j]].sort().join('|');
        tagPairs[key] = (tagPairs[key] || 0) + 1;
      }
    }
  }

  boards.forEach(b => (b.cards || []).forEach(c => addTags(c.tags, { type: 'card', id: c.id, name: c.title || 'Untitled', color: '#4ecdc4', boardId: b.id })));
  maps.forEach(m => (m.pins || []).forEach(p => addTags(p.tags, { type: 'pin', id: p.id, name: p.name || 'Unnamed', color: p.color, mapId: m.id })));
  chapters.forEach(ch => addTags(ch.tags, { type: 'chapter', id: ch.id, name: ch.title || 'Untitled', color: '#a78bfa' }));
  timelines.forEach(tl => {
    addTags(tl.tags, { type: 'timeline', id: tl.id, name: tl.name, color: tl.color });
    (tl.events || []).forEach(evt => addTags(evt.tags, { type: 'event', id: evt.id, name: evt.title, color: evt.color, timelineId: tl.id }));
  });
  factions.forEach(f => addTags(f.tags, { type: 'faction', id: f.id, name: f.name, color: f.color }));
  contacts.forEach(c => addTags(c.tags, { type: 'contact', id: c.id, name: c.name, color: '#888' }));
  organizations.forEach(o => addTags(o.tags, { type: 'org', id: o.id, name: o.name, color: o.color }));
  maps.forEach(m => (m.regions || []).forEach(r => addTags(r.tags, { type: 'region', id: r.id, name: r.name || 'Unnamed Region', color: r.fillColor, mapId: m.id })));

  const tags = Object.keys(tagItems);
  const maxCount = Math.max(1, ...tags.map(t => tagItems[t].length));
  const nodes = tags.map((tag, i) => ({
    id: 'mm-' + tag.replace(/[^a-z0-9]/g, '_'),
    tag,
    x: 0, y: 0,
    vx: 0, vy: 0,
    size: 30 + (tagItems[tag].length / maxCount) * 50,
    color: mmNodeColors[tag] || generateMmColor(i),
    items: tagItems[tag]
  }));

  const edges = [];
  Object.keys(tagPairs).forEach(key => {
    const [a, b] = key.split('|');
    const fromNode = nodes.find(n => n.tag === a);
    const toNode = nodes.find(n => n.tag === b);
    if (fromNode && toNode) {
      edges.push({ from: fromNode.id, to: toNode.id, weight: tagPairs[key] });
    }
  });

  return { nodes, edges };
}

function generateMmColor(index) {
  const palette = ['#4ecdc4','#f43f5e','#8b5cf6','#f59e0b','#22c55e','#3b82f6','#ec4899','#14b8a6','#ef4444','#a78bfa','#06b6d4','#84cc16'];
  return palette[index % palette.length];
}

function renderMindMap() {
  if (mmAnimFrame) { cancelAnimationFrame(mmAnimFrame); mmAnimFrame = null; }

  const data = buildMindMapData();

  // Preserve positions & colors from existing nodes
  const oldPos = {};
  mmNodes.forEach(n => { oldPos[n.tag] = { x: n.x, y: n.y, vx: n.vx, vy: n.vy, pinned: n._pinned }; });

  mmNodes = data.nodes;
  mmEdges = data.edges;

  const svg = document.getElementById('mindmapCanvas');
  if (!svg) return;
  const w = svg.clientWidth || 800;
  const h = svg.clientHeight || 600;

  mmNodes.forEach((n, i) => {
    if (mmNodeColors[n.tag]) n.color = mmNodeColors[n.tag];
    if (oldPos[n.tag]) {
      n.x = oldPos[n.tag].x; n.y = oldPos[n.tag].y;
      n.vx = oldPos[n.tag].vx || 0; n.vy = oldPos[n.tag].vy || 0;
      n._pinned = oldPos[n.tag].pinned;
    } else {
      const angle = (i / Math.max(1, mmNodes.length)) * Math.PI * 4;
      const radius = 80 + i * 18;
      n.x = w / 2 + Math.cos(angle) * radius;
      n.y = h / 2 + Math.sin(angle) * radius;
      n.vx = (Math.random() - 0.5) * 2;
      n.vy = (Math.random() - 0.5) * 2;
    }
  });

  // Set initial viewBox
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);

  mmPhysicsActive = true;
  mmPhysicsTick();
}

function mmPhysicsTick() {
  if (!mmPhysicsActive) return;

  const svg = document.getElementById('mindmapCanvas');
  if (!svg || currentView !== 'mindmap') { mmPhysicsActive = false; return; }

  const vb = svg.viewBox.baseVal;
  const cx = vb.x + vb.width / 2;
  const cy = vb.y + vb.height / 2;
  const { repulsion, attraction, damping, centerGravity, linkDistance } = mmSettings;

  let totalEnergy = 0;

  // Forces
  for (let i = 0; i < mmNodes.length; i++) {
    const a = mmNodes[i];
    if (a._pinned || a === mmDragging) continue;

    let fx = 0, fy = 0;

    // Repulsion from all other nodes
    for (let j = 0; j < mmNodes.length; j++) {
      if (i === j) continue;
      const b = mmNodes[j];
      const dx = a.x - b.x;
      const dy = a.y - b.y;
      const dist = Math.max(5, Math.hypot(dx, dy));
      const force = repulsion / (dist * dist);
      fx += (dx / dist) * force;
      fy += (dy / dist) * force;
    }

    // Attraction along edges
    mmEdges.forEach(e => {
      let other = null;
      if (e.from === a.id) other = mmNodes.find(n => n.id === e.to);
      else if (e.to === a.id) other = mmNodes.find(n => n.id === e.from);
      if (!other) return;
      const dx = other.x - a.x;
      const dy = other.y - a.y;
      const dist = Math.hypot(dx, dy);
      const ideal = linkDistance + (a.size + other.size) * 0.5;
      const force = (dist - ideal) * attraction * (e.weight || 1);
      fx += (dx / Math.max(1, dist)) * force;
      fy += (dy / Math.max(1, dist)) * force;
    });

    // Center gravity
    fx += (cx - a.x) * centerGravity;
    fy += (cy - a.y) * centerGravity;

    a.vx = (a.vx + fx) * damping;
    a.vy = (a.vy + fy) * damping;
    totalEnergy += a.vx * a.vx + a.vy * a.vy;
  }

  // Apply velocities
  mmNodes.forEach(n => {
    if (n._pinned || n === mmDragging) return;
    n.x += n.vx;
    n.y += n.vy;
  });

  drawMindMap();

  // Keep running if there's energy (slow down if settled)
  if (totalEnergy > 0.01) {
    mmAnimFrame = requestAnimationFrame(mmPhysicsTick);
  } else {
    mmPhysicsActive = false;
  }
}

function nudgePhysics() {
  if (!mmPhysicsActive) {
    mmPhysicsActive = true;
    mmPhysicsTick();
  }
}

function drawMindMap() {
  const edgesG = document.getElementById('mindmapEdges');
  const nodesG = document.getElementById('mindmapNodes');
  if (!edgesG || !nodesG) return;
  edgesG.innerHTML = '';
  nodesG.innerHTML = '';

  // Edges
  mmEdges.forEach(e => {
    const from = mmNodes.find(n => n.id === e.from);
    const to = mmNodes.find(n => n.id === e.to);
    if (!from || !to) return;
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
    line.setAttribute('x1', from.x); line.setAttribute('y1', from.y);
    line.setAttribute('x2', to.x); line.setAttribute('y2', to.y);
    line.setAttribute('stroke', 'rgba(255,255,255,0.1)');
    line.setAttribute('stroke-width', Math.max(1, e.weight * 1.5));
    edgesG.appendChild(line);
  });

  // Hex nodes
  mmNodes.forEach(n => {
    const g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    g.setAttribute('data-tag', n.tag);
    g.setAttribute('class', `mm-node${n === mmSelectedNode ? ' selected' : ''}`);
    g.style.cursor = 'grab';

    // Glow filter for selected
    if (n === mmSelectedNode) {
      const glow = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      glow.setAttribute('d', createHexPath(n.x, n.y, n.size + 4));
      glow.setAttribute('fill', 'none');
      glow.setAttribute('stroke', n.color);
      glow.setAttribute('stroke-width', '2');
      glow.setAttribute('opacity', '0.4');
      glow.setAttribute('class', 'mm-glow');
      g.appendChild(glow);
    }

    const hex = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    hex.setAttribute('d', createHexPath(n.x, n.y, n.size));
    hex.setAttribute('fill', n.color);
    hex.setAttribute('fill-opacity', n === mmSelectedNode ? '0.4' : '0.2');
    hex.setAttribute('stroke', n.color);
    hex.setAttribute('stroke-width', n === mmSelectedNode ? 2.5 : 1.2);
    g.appendChild(hex);

    // Tag name
    const text = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    text.setAttribute('x', n.x); text.setAttribute('y', n.y - 4);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', '#fff');
    text.setAttribute('font-size', Math.max(9, Math.min(14, n.size * 0.3)));
    text.setAttribute('font-weight', '600');
    text.setAttribute('pointer-events', 'none');
    text.textContent = n.tag.length > 12 ? n.tag.substring(0, 11) + '\u2026' : n.tag;
    g.appendChild(text);

    // Count
    const ct = document.createElementNS('http://www.w3.org/2000/svg', 'text');
    ct.setAttribute('x', n.x); ct.setAttribute('y', n.y + Math.max(8, n.size * 0.22));
    ct.setAttribute('text-anchor', 'middle');
    ct.setAttribute('dominant-baseline', 'middle');
    ct.setAttribute('fill', 'rgba(255,255,255,0.45)');
    ct.setAttribute('font-size', Math.max(8, n.size * 0.2));
    ct.setAttribute('pointer-events', 'none');
    ct.textContent = n.items.length + (n.items.length === 1 ? ' item' : ' items');
    g.appendChild(ct);

    // Mouse events
    g.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      e.preventDefault();
      if (e.button !== 0) return;
      selectMmNode(n);
      mmDragging = n;
      document.body.classList.add('mm-dragging');
      const svgEl = document.getElementById('mindmapCanvas');
      const pt = svgEl.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const svgP = pt.matrixTransform(svgEl.getScreenCTM().inverse());
      mmDragOffset = { x: svgP.x - n.x, y: svgP.y - n.y };
    });

    nodesG.appendChild(g);
  });
}

function createHexPath(cx, cy, size) {
  const pts = [];
  for (let i = 0; i < 6; i++) {
    const angle = (Math.PI / 3) * i - Math.PI / 6;
    pts.push(`${cx + size * Math.cos(angle)},${cy + size * Math.sin(angle)}`);
  }
  return `M ${pts.join(' L ')} Z`;
}

function selectMmNode(node) {
  mmSelectedNode = node;

  const dp = document.getElementById('detailsPanel');
  dp?.classList.remove('collapsed');
  ['emptyState','cardDetails','pinDetails','chapterDetails','factionDetails','contactDetails','orgDetails','tlDetails','tlCalendarPanel'].forEach(id => {
    document.getElementById(id)?.classList.add('hidden');
  });
  document.getElementById('mindmapDetails')?.classList.remove('hidden');
  document.getElementById('mindmapSettings')?.classList.remove('hidden');

  document.getElementById('mmDetailTagName').textContent = '#' + node.tag;
  document.getElementById('mmDetailCount').textContent = `${node.items.length} item${node.items.length !== 1 ? 's' : ''} tagged`;

  initSwatchPicker('mmHexColorSwatches', node.color, (c) => {
    node.color = c;
    mmNodeColors[node.tag] = c;
    drawMindMap();
  });

  const list = document.getElementById('mmItemsList');
  const typeIcons = { card: '\ud83d\udccb', pin: '\ud83d\udccd', chapter: '\ud83d\udcd6', timeline: '\u23f3', event: '\ud83d\udcc5', faction: '\u2694\ufe0f', contact: '\ud83d\udc64', org: '\ud83c\udfdb\ufe0f', region: '\ud83d\uddfa\ufe0f' };
  list.innerHTML = node.items.map((item, idx) =>
    `<div class="mm-item" onclick="mmNavigateToItem(${idx})" style="cursor:pointer;">
      <span class="mm-item-icon">${typeIcons[item.type] || '\u2022'}</span>
      <span class="mm-item-name">${item.name}</span>
      <span class="mm-item-type">${item.type}</span>
    </div>`
  ).join('');
  window._mmSelectedItems = node.items;
}

function mmNavigateToItem(idx) {
  const item = window._mmSelectedItems?.[idx];
  if (!item) return;
  navigateToEntity(item.type, item.id, item.mapId || item.boardId || item.timelineId);
}

function mmResetLayout() {
  const svg = document.getElementById('mindmapCanvas');
  const w = svg?.clientWidth || 800;
  const h = svg?.clientHeight || 600;
  mmNodes.forEach((n, i) => {
    const angle = (i / Math.max(1, mmNodes.length)) * Math.PI * 4;
    const radius = 80 + i * 18;
    n.x = w / 2 + Math.cos(angle) * radius;
    n.y = h / 2 + Math.sin(angle) * radius;
    n.vx = (Math.random() - 0.5) * 4;
    n.vy = (Math.random() - 0.5) * 4;
    n._pinned = false;
  });
  nudgePhysics();
}

function mmShakeNodes() {
  mmNodes.forEach(n => {
    if (!n._pinned) {
      n.vx += (Math.random() - 0.5) * 8;
      n.vy += (Math.random() - 0.5) * 8;
    }
  });
  nudgePhysics();
}

function initMindMapEvents() {
  const svg = document.getElementById('mindmapCanvas');
  if (!svg) return;

  svg.addEventListener('mousedown', (e) => {
    if (e.target === svg || e.target.tagName === 'svg') {
      mmIsPanning = true;
      mmPanStart = { x: e.clientX, y: e.clientY };
      mmSelectedNode = null;
      document.body.classList.add('mm-dragging');
      document.getElementById('mindmapDetails')?.classList.add('hidden');
      document.getElementById('mindmapSettings')?.classList.remove('hidden');
      drawMindMap();
    }
  });

  // Use document-level move/up so dragging works even if cursor leaves the SVG
  document.addEventListener('mousemove', (e) => {
    if (!mmDragging && !mmIsPanning) return;
    const ctm = svg.getScreenCTM();
    if (!ctm) return;

    if (mmDragging) {
      e.preventDefault();
      const pt = svg.createSVGPoint();
      pt.x = e.clientX; pt.y = e.clientY;
      const svgP = pt.matrixTransform(ctm.inverse());
      const nx = svgP.x - mmDragOffset.x;
      const ny = svgP.y - mmDragOffset.y;
      mmDragging.vx = (nx - mmDragging.x) * 0.6;
      mmDragging.vy = (ny - mmDragging.y) * 0.6;
      mmDragging.x = nx;
      mmDragging.y = ny;
      nudgePhysics();
    } else if (mmIsPanning) {
      const vb = svg.viewBox.baseVal;
      const scale = vb.width / svg.clientWidth;
      vb.x -= (e.clientX - mmPanStart.x) * scale;
      vb.y -= (e.clientY - mmPanStart.y) * scale;
      mmPanStart = { x: e.clientX, y: e.clientY };
    }
  });

  document.addEventListener('mouseup', () => {
    if (mmDragging) {
      mmDragging = null;
      nudgePhysics();
    }
    if (mmIsPanning || mmDragging !== null) {
      mmIsPanning = false;
    }
    document.body.classList.remove('mm-dragging');
  });

  svg.addEventListener('wheel', (e) => {
    e.preventDefault();
    const vb = svg.viewBox.baseVal;
    const factor = e.deltaY > 0 ? 1.08 : 0.92;
    const pt = svg.createSVGPoint();
    pt.x = e.clientX; pt.y = e.clientY;
    const svgP = pt.matrixTransform(svg.getScreenCTM().inverse());
    vb.x = svgP.x - (svgP.x - vb.x) * factor;
    vb.y = svgP.y - (svgP.y - vb.y) * factor;
    vb.width *= factor;
    vb.height *= factor;
  });

  document.getElementById('mmResetLayout')?.addEventListener('click', mmResetLayout);
  document.getElementById('mmShakeBtn')?.addEventListener('click', mmShakeNodes);
  document.getElementById('mmZoomFit')?.addEventListener('click', () => {
    if (mmNodes.length === 0) return;
    const pad = 80;
    const minX = Math.min(...mmNodes.map(n => n.x - n.size));
    const maxX = Math.max(...mmNodes.map(n => n.x + n.size));
    const minY = Math.min(...mmNodes.map(n => n.y - n.size));
    const maxY = Math.max(...mmNodes.map(n => n.y + n.size));
    svg.setAttribute('viewBox', `${minX - pad} ${minY - pad} ${maxX - minX + pad * 2} ${maxY - minY + pad * 2}`);
  });

  // Sliders
  const sliderDefs = [
    { id: 'mmRepulsion', key: 'repulsion', min: 500, max: 20000 },
    { id: 'mmAttraction', key: 'attraction', min: 0.001, max: 0.03 },
    { id: 'mmDamping', key: 'damping', min: 0.5, max: 0.98 },
    { id: 'mmGravity', key: 'centerGravity', min: 0, max: 0.01 },
    { id: 'mmLinkDist', key: 'linkDistance', min: 60, max: 400 },
  ];
  sliderDefs.forEach(def => {
    const el = document.getElementById(def.id);
    if (el) {
      el.addEventListener('input', () => {
        mmSettings[def.key] = parseFloat(el.value);
        nudgePhysics();
      });
    }
  });
}

// ============================================
// Global Search System
// ============================================
function openSearch() {
  const overlay = document.getElementById('searchOverlay');
  overlay.classList.remove('hidden');
  const input = document.getElementById('searchInput');
  input.value = '';
  input.focus();
  document.getElementById('searchResults').innerHTML = '<div class="search-hint">Start typing to search across all your content...</div>';
}
function closeSearch() {
  document.getElementById('searchOverlay').classList.add('hidden');
}
function highlightMatch(text, query) {
  if (!query) return text;
  const esc = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.replace(new RegExp(`(${esc})`, 'gi'), '<span class="search-match">$1</span>');
}
function performSearch(query) {
  const q = query.toLowerCase().trim();
  const results = document.getElementById('searchResults');
  if (!q) {
    results.innerHTML = '<div class="search-hint">Start typing to search across all your content...</div>';
    return;
  }

  const matches = [];
  const matchesField = (val) => val && val.toLowerCase().includes(q);
  const matchesArr = (arr) => arr && arr.some(t => t.toLowerCase().includes(q));

  // Board cards
  boards.forEach(b => {
    (b.cards || []).forEach(card => {
      if (matchesField(card.title) || matchesField(card.description) || matchesArr(card.tags) || matchesField(card.category)) {
        const tagMatch = (card.tags || []).filter(t => t.toLowerCase().includes(q));
        matches.push({
          type: 'card', icon: '📋', label: 'Board Card',
          name: card.title || 'Untitled',
          meta: [card.category, b.name].filter(Boolean).join(' · '),
          tags: tagMatch,
          action: () => { navigateToView('board'); setTimeout(() => { selectBoard(b.id); setTimeout(() => { const el = document.querySelector(`.card[data-id="${card.id}"]`); if (el) { el.click(); el.scrollIntoView({behavior:'smooth',block:'center'}); } }, 100); }, 50); }
        });
      }
    });
  });

  // Map pins
  maps.forEach(m => {
    (m.pins || []).forEach(pin => {
      if (matchesField(pin.name) || matchesField(pin.description) || matchesArr(pin.tags)) {
        const tagMatch = (pin.tags || []).filter(t => t.toLowerCase().includes(q));
        matches.push({
          type: 'pin', icon: '📍', label: 'Map Pin',
          name: pin.name || 'Unnamed Pin',
          meta: m.name || 'Map',
          tags: tagMatch,
          action: () => { navigateToView('map'); setTimeout(() => { selectMap(m.id); setTimeout(() => { selectPin(pin.id); panToPin(pin.id); }, 100); }, 50); }
        });
      }
    });
  });

  // Chapters
  chapters.forEach(ch => {
    if (matchesField(ch.title) || matchesField(ch.body) || matchesArr(ch.tags)) {
      const tagMatch = (ch.tags || []).filter(t => t.toLowerCase().includes(q));
      matches.push({
        type: 'chapter', icon: '📖', label: 'Chapter',
        name: ch.title || 'Untitled',
        meta: (ch.body || '').substring(0, 60).replace(/\n/g, ' '),
        tags: tagMatch,
        action: () => { navigateToView('write'); setTimeout(() => { selectChapter(ch.id); }, 50); }
      });
    }
  });

  // Timelines
  timelines.forEach(tl => {
    if (matchesField(tl.name) || matchesArr(tl.tags)) {
      const tagMatch = (tl.tags || []).filter(t => t.toLowerCase().includes(q));
      matches.push({
        type: 'timeline', icon: '⏳', label: 'Timeline',
        name: tl.name,
        meta: `${tl.events.length} events`,
        tags: tagMatch,
        action: () => { navigateToView('timeline'); setTimeout(() => { selectTimeline(tl.id); }, 50); }
      });
    }
    // Timeline events
    (tl.events || []).forEach(evt => {
      if (matchesField(evt.title) || matchesField(evt.description) || matchesArr(evt.tags)) {
        const tagMatch = (evt.tags || []).filter(t => t.toLowerCase().includes(q));
        matches.push({
          type: 'event', icon: '📅', label: 'Event',
          name: evt.title,
          meta: tl.name,
          tags: tagMatch,
          action: () => { navigateToView('timeline'); setTimeout(() => { selectTimeline(tl.id); setTimeout(() => selectTlEvent(evt.id, tl.id), 100); }, 50); }
        });
      }
    });
  });

  // Factions
  factions.forEach(f => {
    if (matchesField(f.name) || matchesField(f.description) || matchesArr(f.tags)) {
      const tagMatch = (f.tags || []).filter(t => t.toLowerCase().includes(q));
      matches.push({
        type: 'faction', icon: '⚔️', label: 'Faction',
        name: f.name,
        meta: f.motto || '',
        tags: tagMatch,
        action: () => { navigateToView('factions'); setTimeout(() => { switchFacTab('factions'); selectedFactionId = f.id; renderFactionGrid(); renderFactionsSidebar(); showFacDetail(); }, 50); }
      });
    }
  });

  // Contacts
  contacts.forEach(c => {
    if (matchesField(c.name) || matchesField(c.role) || matchesField(c.description) || matchesArr(c.tags) || matchesField(c.type)) {
      const tagMatch = (c.tags || []).filter(t => t.toLowerCase().includes(q));
      const fac = factions.find(f => f.id === c.factionId);
      matches.push({
        type: 'contact', icon: '👤', label: 'Contact',
        name: c.name,
        meta: [c.role, fac?.name].filter(Boolean).join(' · '),
        tags: tagMatch,
        action: () => { navigateToView('factions'); setTimeout(() => { switchFacTab('contacts'); selectedContactId = c.id; renderContactsGrid(); renderContactsSidebar(); showContactDetail(); }, 50); }
      });
    }
  });

  // Organizations
  organizations.forEach(o => {
    if (matchesField(o.name) || matchesField(o.type) || matchesField(o.description) || matchesField(o.leader) || matchesField(o.location) || matchesField(o.goals) || matchesArr(o.tags)) {
      const tagMatch = (o.tags || []).filter(t => t.toLowerCase().includes(q));
      matches.push({
        type: 'org', icon: '🏛️', label: 'Organization',
        name: o.name,
        meta: [o.type, o.status].filter(Boolean).join(' · '),
        tags: tagMatch,
        action: () => { navigateToView('factions'); setTimeout(() => { switchFacTab('orgs'); selectedOrgId = o.id; renderOrgsGrid(); renderOrgsSidebar(); showOrgDetail(); }, 50); }
      });
    }
  });

  // Map Regions
  maps.forEach(m => {
    (m.regions || []).forEach(reg => {
      if (matchesField(reg.name) || matchesArr(reg.tags)) {
        const tagMatch = (reg.tags || []).filter(t => t.toLowerCase().includes(q));
        matches.push({
          type: 'region', icon: '🗺️', label: 'Region',
          name: reg.name || 'Unnamed Region',
          meta: m.name || 'Map',
          tags: tagMatch,
          action: () => { navigateToView('map'); setTimeout(() => { selectMap(m.id); setTimeout(() => selectRegion(reg.id), 100); }, 50); }
        });
      }
    });
  });

  // Combatants
  combatants.forEach(c => {
    if (matchesField(c.name) || matchesField(c.notes) || c.conditions.some(co => co.toLowerCase().includes(q)) || c.buffs.some(b => b.name.toLowerCase().includes(q))) {
      matches.push({
        type: 'combatant', icon: '⚔', label: 'Combatant',
        name: c.name,
        meta: [c.conditions.length ? c.conditions.join(', ') : '', c.notes ? 'Has notes' : ''].filter(Boolean).join(' · '),
        tags: [],
        action: () => { navigateToView('combat'); setTimeout(() => { selectedCombatantId = c.id; multiSelectedCombatants.clear(); renderCombatants(); showCombatantDetail(); }, 50); }
      });
    }
  });

  // Render results
  if (matches.length === 0) {
    results.innerHTML = `<div class="search-no-results">No results found for "${q}"</div>`;
    return;
  }

  // Group by type
  const groups = {};
  const groupOrder = ['card','pin','region','chapter','timeline','event','faction','contact','org','combatant'];
  matches.forEach(m => {
    if (!groups[m.type]) groups[m.type] = [];
    groups[m.type].push(m);
  });

  let html = '';
  groupOrder.forEach(type => {
    const group = groups[type];
    if (!group || group.length === 0) return;
    const first = group[0];
    html += `<div class="search-group-label">${first.label}s (${group.length})</div>`;
    group.forEach((item, idx) => {
      const tagHtml = item.tags.slice(0, 3).map(t => `<span class="search-result-tag">${highlightMatch(t, q)}</span>`).join('');
      html += `<div class="search-result-item" data-search-idx="${type}-${idx}" onclick="searchNavigate('${type}',${idx})">
        <div class="search-result-icon">${item.icon}</div>
        <div class="search-result-info">
          <div class="search-result-name">${highlightMatch(item.name, q)}</div>
          ${item.meta ? `<div class="search-result-meta">${item.meta}</div>` : ''}
        </div>
        ${tagHtml ? `<div class="search-result-tags">${tagHtml}</div>` : ''}
      </div>`;
    });
  });

  results.innerHTML = html;

  // Store actions for click handling
  window._searchActions = matches;
  window._searchGroups = groups;
}

function searchNavigate(type, idx) {
  const groups = window._searchGroups;
  if (!groups || !groups[type] || !groups[type][idx]) return;
  const item = groups[type][idx];
  closeSearch();
  item.action();
}

function navigateToView(viewName) {
  const viewMap = { board: 'board', map: 'map', write: 'write', timeline: 'timeline', combat: 'combat', factions: 'factions', mindmap: 'mindmap' };
  const target = viewMap[viewName];
  if (!target) return;
  const btn = document.querySelector(`.view-toggle-btn[data-view="${target}"]`);
  if (btn) btn.click();
}

// ---- INIT LISTENERS ----
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('ctNextTurn')?.addEventListener('click', nextTurn);
  document.getElementById('ctPrevTurn')?.addEventListener('click', prevTurn);
  document.getElementById('ctRollAllInit')?.addEventListener('click', rollAllInitiative);
  document.getElementById('ctSortInit')?.addEventListener('click', sortByInitiative);
  document.getElementById('ctResetCombat')?.addEventListener('click', resetCombat);
  document.getElementById('ctAddBtn')?.addEventListener('click', addCombatant);
  document.getElementById('ctClearAll')?.addEventListener('click', clearAllCombatants);

  // Initialize resizable panels
  initCtRefDivider();
  initCtResizeHandle();

  // Ability card detail listeners
  ['abilityType','abilityLevel','abilityCost','abilityRange','abilityDuration','abilityUseType','abilityMaxUses','abilityDesc'].forEach(id => {
    document.getElementById(id)?.addEventListener('input', () => {
      if (!selectedCard) return;
      const board = getCurrentBoard();
      const cd = board?.cards.find(c => c.id === selectedCard.id);
      if (!cd) return;
      const el = document.getElementById(id);
      if (id === 'abilityDesc') cd.description = el.value;
      else if (id === 'abilityMaxUses') cd[id] = parseInt(el.value) || 1;
      else cd[id] = el.value;
      refreshCardElement(cd);
    });
  });
  document.getElementById('ctAddName')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') addCombatant(); });
  document.getElementById('ctSaveEncounter')?.addEventListener('click', saveEncounter);
  document.getElementById('encounterSaveName')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') confirmSaveEncounter();
  });
  document.getElementById('addFactionBtn')?.addEventListener('click', openFactionCreateModal);
  document.getElementById('addContactBtn')?.addEventListener('click', openContactCreateModal);
  document.getElementById('addOrgBtn')?.addEventListener('click', openOrgCreateModal);

  // Quick Generators with Custom Tables
  const GEN_TABLES = {
    faction: ['The Iron Covenant', 'Crimson Veil', 'Order of the Ashen Crown', 'The Verdant Circle', 'Shadow Syndicate', 'Silver Talon Company', 'The Obsidian Hand', 'Dawn Wardens', 'The Pale Court', 'Blackthorn Pact', 'Seekers of the Lost Flame', 'The Gilded Serpent', 'Storm Brotherhood', 'Children of the Abyss', 'The Jade Accord', 'Hollow Crown Collective', 'Nightbloom Society', 'The Amber Legion', 'Frost Sentinels', 'Dusk Reapers'],
    npc: ['Aldric Thorn', 'Sera Nighthollow', 'Bjorn Ironfist', 'Lysara Dawnwhisper', 'Gavriel Ashford', 'Mira Stonewell', 'Dorian Blackwood', 'Elara Sunshadow', 'Kael Emberstrike', 'Yseult Ravenmoor', 'Rowan Deepcrest', 'Thessa Greyveil', 'Harken Coldforge', 'Nyx Silverbane', 'Orion Duskwalker', 'Faye Willowmere', 'Silas Grimshaw', 'Celeste Thornwick', 'Raven Ashmore', 'Lucian Dreadmoor'],
    disposition: ['Friendly', 'Hostile', 'Cautious', 'Indifferent', 'Suspicious', 'Fearful', 'Eager to please', 'Manipulative', 'Respectful', 'Contemptuous', 'Secretive', 'Welcoming', 'Greedy', 'Protective', 'Treacherous'],
    motivation: ['Power and control', 'Revenge for a past wrong', 'Protecting their family', 'Amassing wealth', 'Religious devotion', 'Knowledge and forbidden lore', 'Survival at any cost', 'Restoring lost honor', 'Escaping a dark past', 'Political dominance', 'True love', 'Overthrowing tyranny', 'Fulfilling a prophecy', 'Redemption', 'Building a legacy'],
    org: ['The Merchant\'s Consortium', 'Holy Order of St. Maren', 'Arcane Research Institute', 'Thieves\' Brotherhood', 'The Explorer\'s Guild', 'Royal Guard Regiment', 'The Alchemists\' Union', 'Seafarers\' Alliance', 'The Artisan Collective', 'Bounty Hunters\' League', 'The Scholarly Archive', 'Mercenary Company', 'Temple of the Eternal', 'The Underground Network', 'Rangers of the Wilds'],
    location: ['The Scarlet Citadel', 'Whisperwood Manor', 'Ironhold Keep', 'Shadowfen Trading Post', 'The Gilded Spire', 'Ravencrest Tower', 'Dusthaven Outpost', 'The Crystal Vault', 'Moonrise Sanctuary', 'Blackmire Stronghold', 'Stormwatch Bastion', 'The Hollow Library', 'Sunfire Cathedral', 'Driftwood Tavern', 'The Ember Forge'],
    trait: ['Compulsive liar', 'Overly generous', 'Paranoid about strangers', 'Speaks in riddles', 'Collects unusual objects', 'Never breaks a promise', 'Terrified of magic', 'Laughs at inappropriate times', 'Obsessed with cleanliness', 'Can\'t resist a gamble', 'Whispers when angry', 'Fiercely loyal', 'Chronic procrastinator', 'Always has a plan B', 'Trusts animals more than people'],
    occupation: ['Blacksmith', 'Herbalist', 'Spy', 'Merchant prince', 'Street performer', 'Grave digger', 'Cartographer', 'Ship captain', 'Bounty hunter', 'Apothecary', 'Scribe', 'Gladiator', 'Court advisor', 'Smuggler', 'Innkeeper', 'Assassin', 'Healer', 'Tax collector', 'Locksmith', 'Monster hunter'],
    secret: ['Is secretly a shapeshifter', 'Murdered their sibling', 'Works as a double agent', 'Owes a massive debt to a dragon', 'Is heir to a fallen kingdom', 'Stole a powerful artifact', 'Has a terminal illness', 'Is being blackmailed', 'Witnessed an atrocity and said nothing', 'Made a pact with a fiend', 'Is hiding a fugitive', 'Embezzles from their employer', 'Was once a different person entirely', 'Knows the location of a great treasure', 'Is plotting a coup'],
    orgGoal: ['Monopolize trade routes across the continent', 'Uncover and preserve ancient arcane knowledge', 'Overthrow the current ruling dynasty', 'Protect the realm from extraplanar threats', 'Establish a network of safe houses for the persecuted', 'Control the flow of information throughout the kingdom', 'Broker lasting peace between warring nations', 'Amass enough wealth to buy political sovereignty', 'Develop forbidden magical techniques', 'Unite the scattered clans under one banner', 'Eradicate a rival organization completely', 'Discover a cure for a spreading magical plague', 'Infiltrate every major court in the known world', 'Build a standing army loyal only to the organization', 'Reclaim ancestral lands lost in a previous war'],
    orgResource: ['A vast underground vault of gold and gemstones', 'A network of loyal informants in every major city', 'An elite corps of trained soldiers and assassins', 'Access to rare spell components and enchanted artifacts', 'Political connections reaching into the royal court', 'A fleet of merchant vessels and trade caravans', 'Hidden safehouses and bolt-holes across the realm', 'Exclusive mining rights to a rich vein of rare ore', 'A legendary library of forbidden knowledge', 'Blackmail material on several powerful nobles', 'A fortified headquarters in a strategic location', 'Allied monsters or summoned creatures', 'A monopoly on a crucial trade commodity', 'Ancient relics of immense magical power', 'Trained beasts and war animals'],
    orgDesc: ['Founded decades ago by a cabal of disgraced nobles seeking to reclaim their lost influence, the organization has grown into a sprawling network that operates in the shadows of legitimate society. Their agents are embedded in merchant guilds, taverns, and even temples, gathering intelligence and pulling strings. Despite their secretive nature, they maintain a strict code of honor among their members and are known to punish betrayal with swift and final justice.',
    'What began as a small fellowship of scholars and researchers has evolved into one of the most formidable institutions in the realm. Their members travel far and wide, cataloging dangerous creatures, mapping uncharted territories, and recovering lost artifacts. They maintain a vast archive in their central headquarters and fund expeditions through a combination of patron donations and the sale of rare discoveries.',
    'This tightly-knit organization traces its roots to a legendary figure who united several feuding factions under a common cause. Members undergo rigorous training and initiation rites, forging bonds of loyalty that endure for life. They operate openly in some regions while maintaining a covert presence in others, adapting their methods to local politics and customs. Their reputation precedes them — allies welcome their aid while enemies fear their reach.',
    'Born from necessity during a time of great upheaval, this group started as a mutual aid society for displaced refugees and veterans. Over the years, it has transformed into a powerful coalition with economic and military influence. They control several strategic trade posts and maintain a private militia. Despite their growing power, they remain committed to their founding principles of protecting the vulnerable and opposing tyranny.',
    'Operating under a veneer of respectability, this organization presents itself as a charitable brotherhood dedicated to community service and religious devotion. Behind closed doors, however, its inner circle pursues far more ambitious goals. They broker deals between rival powers, manipulate markets to their advantage, and maintain a secret hierarchy that few outsiders ever glimpse. Their public works projects and generous donations ensure they remain above suspicion.',
    'A relatively young but rapidly growing organization, founded by a charismatic leader with a vision for transforming the established order. They recruit heavily from the ranks of the discontented — failed apprentices, disinherited heirs, and ambitious commoners seeking advancement. Their decentralized cell structure makes them difficult to infiltrate or dismantle, and their willingness to employ unconventional methods has earned them both admirers and enemies in equal measure.']
  };

  // Custom user-defined tables per connection tab (saved in room state)
  window._facCustomTables = window._facCustomTables || { factions: [], contacts: [], orgs: [] };

  function rollGenerator(type) {
    if (type.startsWith('custom_')) {
      const key = type.replace('custom_', '');
      const entries = window._facCustomTables[key] || [];
      if (!entries.length) return 'No custom entries yet — add some above';
      return entries[Math.floor(Math.random() * entries.length)];
    }
    const table = GEN_TABLES[type];
    if (!table || !table.length) return 'No table found';
    return table[Math.floor(Math.random() * table.length)];
  }

  function updateCustomCount(tab) {
    const el = document.getElementById(tab + 'CustomCount');
    const entries = window._facCustomTables[tab === 'fac' ? 'factions' : tab === 'contact' ? 'contacts' : 'orgs'] || [];
    if (el) el.textContent = entries.length ? entries.length + ' custom ' + (entries.length === 1 ? 'entry' : 'entries') : '';
  }

  function addGenResultToTab(tabKey, overrideName) {
    const ts = Date.now();
    if (tabKey === 'factions') {
      const name = overrideName || rollGenerator('faction');
      const tier = ['I','II','III','IV','V'][Math.floor(Math.random()*5)];
      const statuses = ['Rising','Stable','Declining','At War','Hidden','Allied'];
      const status = statuses[Math.floor(Math.random()*statuses.length)];
      const color = FAC_COLORS[Math.floor(Math.random()*FAC_COLORS.length)];
      const desc = rollGenerator('motivation');
      const rep = Math.floor(Math.random()*11) - 5; // -5 to 5
      factions.push({
        id: 'fac_'+ts, name, color, reputation: rep, tier, status,
        description: desc, notes: rollGenerator('secret'), claims: [], tags: [], image: null
      });
      selectedFactionId = factions[factions.length-1].id;
      renderFactionGrid(); renderFactionsSidebar(); showFacDetail();
      showNotif('Generated faction: ' + name);
    } else if (tabKey === 'contacts') {
      const name = overrideName || rollGenerator('npc');
      const disp = rollGenerator('disposition');
      const role = rollGenerator('occupation');
      const types = ['contact','ally','enemy','rival','patron','informant'];
      const type = types[Math.floor(Math.random()*types.length)];
      const facId = factions.length > 0 && Math.random() > 0.4 ? factions[Math.floor(Math.random()*factions.length)].id : '';
      contacts.push({
        id: 'con_'+ts, name, factionId: facId, role, disposition: disp, type,
        description: rollGenerator('trait'), notes: rollGenerator('secret'),
        tags: [], image: null
      });
      selectedContactId = contacts[contacts.length-1].id;
      renderFactionGrid(); renderContactsSidebar(); renderContactsGrid(); renderFactionsSidebar(); showContactDetail();
      showNotif('Generated contact: ' + name);
    } else if (tabKey === 'orgs') {
      const name = overrideName || rollGenerator('org');
      const orgTypes = ['Guild','Order','Company','Alliance','Syndicate','Council','Brotherhood','Circle'];
      const orgType = orgTypes[Math.floor(Math.random()*orgTypes.length)];
      const color = FAC_COLORS[Math.floor(Math.random()*FAC_COLORS.length)];
      const statuses = ['Active','Growing','Declining','Secretive','At War','Dormant','Thriving','Fractured'];
      const status = statuses[Math.floor(Math.random()*statuses.length)];
      const influences = ['Local','Regional','National','Continental','Global','Underground','Niche'];
      const influence = influences[Math.floor(Math.random()*influences.length)];
      organizations.push({
        id: 'org_'+ts, name, type: orgType, color,
        description: rollGenerator('orgDesc'),
        goals: rollGenerator('orgGoal'),
        influence: influence,
        status: status,
        resources: rollGenerator('orgResource'),
        headquarters: rollGenerator('location'),
        leader: rollGenerator('npc'),
        notes: rollGenerator('secret'), image: null, hidden: false, tags: [],
        associations: []
      });
      selectedOrgId = organizations[organizations.length-1].id;
      renderOrgsGrid(); renderOrgsSidebar(); showOrgDetail();
      showNotif('Generated org: ' + name);
    }
    if (typeof window.craftSchedulePush === 'function') window.craftSchedulePush();
  }

  function wireGenerator(prefix, selectId, resultId, customSectionId, customInputId, customAddId, addToBoardId, tableKey) {
    const select = document.getElementById(selectId);
    const customSection = document.getElementById(customSectionId);
    const rollBtn = document.getElementById(prefix + 'GenRollBtn');
    const addBtn = document.getElementById(addToBoardId);
    const useNameBtn = document.getElementById(prefix + 'UseNameBtn');

    // Name-type selectors that allow "Generate with this name"
    const nameTypes = { factions: ['faction','npc','org'], contacts: ['npc'], orgs: ['org','faction'] };

    // Show/hide custom section based on dropdown
    select?.addEventListener('change', () => {
      const isCustom = select.value.startsWith('custom_');
      customSection?.classList.toggle('hidden', !isCustom);
      if (isCustom) updateCustomCount(prefix);
    });

    // Add custom entry
    document.getElementById(customAddId)?.addEventListener('click', () => {
      const input = document.getElementById(customInputId);
      const val = input?.value.trim();
      if (!val) return;
      if (!window._facCustomTables[tableKey]) window._facCustomTables[tableKey] = [];
      window._facCustomTables[tableKey].push(val);
      input.value = '';
      updateCustomCount(prefix);
      showNotif('Entry added');
      if (typeof window.craftSchedulePush === 'function') window.craftSchedulePush();
    });
    document.getElementById(customInputId)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') document.getElementById(customAddId)?.click();
    });

    // Roll
    let _lastRolledResult = '';
    rollBtn?.addEventListener('click', () => {
      const type = select?.value || 'faction';
      const result = rollGenerator(type);
      _lastRolledResult = result;
      const el = document.getElementById(resultId);
      if (el) {
        el.textContent = result;
        el.style.display = 'block';
        el.style.animation = 'none';
        el.offsetHeight;
        el.style.animation = 'fadeIn 0.2s ease';
      }
      // Show "Generate with this name" only if the rolled type is a name type
      const isNameType = (nameTypes[tableKey] || []).includes(type);
      if (useNameBtn && result && !result.startsWith('No ')) {
        if (isNameType) {
          useNameBtn.textContent = '✨ Generate Entry as "' + (result.length > 25 ? result.substring(0,25) + '…' : result) + '"';
          useNameBtn.classList.remove('hidden');
        } else {
          useNameBtn.classList.add('hidden');
        }
      }
    });

    // "Generate with this name" button
    useNameBtn?.addEventListener('click', () => {
      if (_lastRolledResult && !_lastRolledResult.startsWith('No ')) {
        addGenResultToTab(tableKey, _lastRolledResult);
        useNameBtn.classList.add('hidden');
        _lastRolledResult = '';
      }
    });

    // Add to tab (creates a full entity with random name)
    addBtn?.addEventListener('click', () => {
      addGenResultToTab(tableKey);
    });
  }

  wireGenerator('fac', 'facGenType', 'facGenResult', 'facCustomSection', 'facCustomInput', 'facCustomAdd', 'facAddToBoard', 'factions');
  wireGenerator('contact', 'contactGenType', 'contactGenResult', 'contactCustomSection', 'contactCustomInput', 'contactCustomAdd', 'contactAddToBoard', 'contacts');
  wireGenerator('org', 'orgGenType', 'orgGenResult', 'orgCustomSection', 'orgCustomInput', 'orgCustomAdd', 'orgAddToBoard', 'orgs');

  document.getElementById('facDetailAddClaim')?.addEventListener('click', () => { if (selectedFactionId) openClaimAdd(selectedFactionId); });
  document.getElementById('facDetailDelete')?.addEventListener('click', () => { if (selectedFactionId) deleteFaction(selectedFactionId); });
  document.getElementById('conDetailDelete')?.addEventListener('click', () => { if (selectedContactId) deleteContact(selectedContactId); });
  document.getElementById('orgDetailDelete')?.addEventListener('click', () => { if (selectedOrgId) deleteOrg(selectedOrgId); });

  // Image uploads
  document.getElementById('facDetailUploadBtn')?.addEventListener('click', () => document.getElementById('facImageInput').click());
  document.getElementById('facImageInput')?.addEventListener('change', handleFacImageUpload);
  document.getElementById('facDetailRemoveImg')?.addEventListener('click', removeFacImage);
  document.getElementById('conDetailUploadBtn')?.addEventListener('click', () => document.getElementById('conImageInput').click());
  document.getElementById('conImageInput')?.addEventListener('change', handleConImageUpload);
  document.getElementById('conDetailRemoveImg')?.addEventListener('click', removeConImage);
  document.getElementById('orgImageBtn')?.addEventListener('click', () => document.getElementById('orgImageUpload').click());
  document.getElementById('orgImageUpload')?.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const o = organizations.find(x => x.id === selectedOrgId); if (!o) return;
    uploadFileImage(file, (url) => { o.image = url; renderOrgsGrid(); showOrgDetail(); });
    e.target.value = '';
  });
  document.getElementById('orgDetailRemoveImg')?.addEventListener('click', () => {
    const o = organizations.find(x => x.id === selectedOrgId); if (!o) return;
    o.image = null; renderOrgsGrid(); showOrgDetail(); showNotif('Image removed');
    if (typeof window.craftSchedulePush === 'function') window.craftSchedulePush();
  });

  // Sort buttons
  document.getElementById('sortFactionsBtn')?.addEventListener('click', () => {
    factions.sort((a,b) => a.name.localeCompare(b.name));
    renderFactionGrid(); renderFactionsSidebar(); showNotif('Factions sorted A-Z');
    if (typeof window.craftSchedulePush === 'function') window.craftSchedulePush();
  });
  document.getElementById('sortContactsBtn')?.addEventListener('click', () => {
    contacts.sort((a,b) => a.name.localeCompare(b.name));
    renderContactsGrid(); renderContactsSidebar(); renderFactionGrid(); showNotif('Contacts sorted A-Z');
    if (typeof window.craftSchedulePush === 'function') window.craftSchedulePush();
  });
  document.getElementById('sortOrgsBtn')?.addEventListener('click', () => {
    organizations.sort((a,b) => a.name.localeCompare(b.name));
    renderOrgsGrid(); renderOrgsSidebar(); showNotif('Organizations sorted A-Z');
    if (typeof window.craftSchedulePush === 'function') window.craftSchedulePush();
  });

  // Pin image upload
  document.getElementById('pinImageUploadBtn')?.addEventListener('click', () => document.getElementById('pinImageInput').click());
  document.getElementById('pinImageInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0]; if (!file) return;
    const currentMap = getCurrentMap(); if (!currentMap || !editingPinId) return;
    const pin = currentMap.pins.find(p => p.id === editingPinId); if (!pin) return;
    uploadFileImage(file, (url) => {
      pin.image = url;
      document.getElementById('pinEditorImage').src = url;
      document.getElementById('pinEditorImage').classList.remove('hidden');
      document.getElementById('pinEditorNoImage').classList.add('hidden');
      document.getElementById('pinImageRemoveBtn').classList.remove('hidden');
    });
    e.target.value = '';
  });
  document.getElementById('pinImageRemoveBtn')?.addEventListener('click', () => {
    const currentMap = getCurrentMap(); if (!currentMap || !editingPinId) return;
    const pin = currentMap.pins.find(p => p.id === editingPinId); if (!pin) return;
    pin.image = null;
    document.getElementById('pinEditorImage').classList.add('hidden');
    document.getElementById('pinEditorNoImage').classList.remove('hidden');
    document.getElementById('pinImageRemoveBtn').classList.add('hidden');
  });

  // ---- FACTION TAGS (permanent listeners like timeline tags) ----
  const fti = document.getElementById('facDetailTagsInput');
  if (fti) {
    fti.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addFacTagFromInput(); }
    });
    fti.addEventListener('blur', () => { if (fti.value.trim()) addFacTagFromInput(); });
  }

  // ---- CONTACT TAGS (permanent listeners) ----
  const cti = document.getElementById('conDetailTagsInput');
  if (cti) {
    cti.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addConTagFromInput(); }
    });
    cti.addEventListener('blur', () => { if (cti.value.trim()) addConTagFromInput(); });
  }

  // ---- ORG TAGS (permanent listeners) ----
  const oti = document.getElementById('orgDetailTagsInput');
  if (oti) {
    oti.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addOrgTagFromInput(); }
    });
    oti.addEventListener('blur', () => { if (oti.value.trim()) addOrgTagFromInput(); });
  }

  // ---- REGION TAGS (permanent listeners) ----
  const rti = document.getElementById('regionDetailTagsInput');
  if (rti) {
    rti.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addRegionTagFromInput(); }
    });
    rti.addEventListener('blur', () => { if (rti.value.trim()) addRegionTagFromInput(); });
  }

  // Association searches (wired into the real system)
  const facAssocSearch = document.getElementById('facAssociationSearch');
  if (facAssocSearch) {
    facAssocSearch.addEventListener('input', (e) => handleAssociationSearch(e.target.value, 'facAssociationSearchResults', 'faction'));
    facAssocSearch.addEventListener('focus', (e) => handleAssociationSearch(e.target.value, 'facAssociationSearchResults', 'faction'));
    facAssocSearch.addEventListener('blur', () => setTimeout(() => hideSearchResults('facAssociationSearchResults'), 200));
  }
  const conAssocSearch = document.getElementById('conAssociationSearch');
  if (conAssocSearch) {
    conAssocSearch.addEventListener('input', (e) => handleAssociationSearch(e.target.value, 'conAssociationSearchResults', 'contact'));
    conAssocSearch.addEventListener('focus', (e) => handleAssociationSearch(e.target.value, 'conAssociationSearchResults', 'contact'));
    conAssocSearch.addEventListener('blur', () => setTimeout(() => hideSearchResults('conAssociationSearchResults'), 200));
  }

  // Modal overlay click-to-close
  ['initEditModal','factionCreateModal','contactCreateModal','claimAddModal','combatClearModal'].forEach(id => {
    document.getElementById(id)?.addEventListener('click', (e) => { if (e.target.id === id) e.target.classList.add('hidden'); });
  });
  document.getElementById('initEditValue')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmInitEdit(); });
  document.getElementById('claimAddInput')?.addEventListener('keydown', (e) => { if (e.key === 'Enter') confirmClaimAdd(); });

  // Multiview DM Screen
  document.getElementById('multiviewBtn')?.addEventListener('click', openMultiview);
  document.getElementById('multiviewClose')?.addEventListener('click', closeMultiview);
  document.querySelectorAll('.mv-layout-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mv-layout-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      document.getElementById('multiviewGrid').setAttribute('data-layout', btn.dataset.layout);
      // Reset custom resize and re-init handles
      const grid = document.getElementById('multiviewGrid');
      grid.style.gridTemplateColumns = '';
      grid.style.gridTemplateRows = '';
      setTimeout(initMvResizeHandles, 50);
    });
  });
  document.querySelectorAll('.mv-panel-select').forEach(sel => {
    sel.addEventListener('change', (e) => {
      const panel = e.target.closest('.mv-panel');
      const idx = panel.dataset.panel;
      loadMVPanel(idx, e.target.value);
    });
  });
});

// ============================================
// Swatch Color Picker Utility
// ============================================
const SWATCH_COLORS = [
  '#ef4444','#f97316','#eab308','#22c55e','#14b8a6',
  '#4ecdc4','#3b82f6','#6366f1','#8b5cf6','#ec4899',
  '#f43f5e','#ffffff','#94a3b8','#64748b'
];

function initSwatchPicker(containerId, currentColor, onChange) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

  const normalColor = (currentColor || '#4ecdc4').toLowerCase();
  const isPreset = SWATCH_COLORS.some(c => c === normalColor);

  SWATCH_COLORS.forEach(color => {
    const btn = document.createElement('button');
    btn.className = 'swatch-btn' + (color === normalColor ? ' active' : '');
    btn.style.background = color;
    if (color === '#ffffff') btn.style.border = '2px solid var(--border-color)';
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      container.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('active'));
      container.querySelector('.swatch-custom-wrap')?.classList.remove('active');
      btn.classList.add('active');
      if (onChange) onChange(color);
    });
    container.appendChild(btn);
  });

  // Custom color input
  const wrap = document.createElement('div');
  wrap.className = 'swatch-custom-wrap' + (!isPreset ? ' active' : '');
  const display = document.createElement('div');
  display.className = 'swatch-custom-display';
  if (!isPreset) {
    display.style.background = normalColor;
    display.style.borderColor = '#fff';
    display.textContent = '';
  } else {
    display.textContent = '+';
  }
  const input = document.createElement('input');
  input.type = 'color';
  input.className = 'swatch-custom-input';
  input.value = normalColor;
  
  input.addEventListener('input', () => {
    container.querySelectorAll('.swatch-btn').forEach(b => b.classList.remove('active'));
    wrap.classList.add('active');
    display.style.background = input.value;
    display.style.borderColor = '#fff';
    display.textContent = '';
    if (onChange) onChange(input.value);
  });
  wrap.appendChild(display);
  wrap.appendChild(input);
  container.appendChild(wrap);
}


// ============================================
// Multiview DM Screen
// ============================================
let multiviewActive = false;
const mvOriginalParents = {};
const mvPanelState = [{}, {}, {}, {}]; // { viewType, itemId }
const mvPanelNotes = ['', '', '', ''];
let mvSavedState = null; // Remember last state for reopen
let mvSavedLayout = null;

const MV_VIEW_IDS = {
  board: 'boardView',
  map: 'mapView',
  write: 'writeView',
  timeline: 'timelineView',
  combat: 'combatView',
  factions: 'factionView',
  soundboard: 'soundboardView',
  mindmap: 'mindmapView'
};

function openMultiview() {
  multiviewActive = true;
  document.getElementById('multiviewOverlay').classList.remove('hidden');

  if (mvSavedState) {
    // Restore layout
    if (mvSavedLayout) {
      document.getElementById('multiviewGrid').setAttribute('data-layout', mvSavedLayout);
      document.querySelectorAll('.mv-layout-btn').forEach(b => b.classList.toggle('active', b.dataset.layout === mvSavedLayout));
    }
    // Restore previous session
    mvSavedState.forEach((saved, i) => {
      mvPanelState[i] = {};
      const panel = document.querySelector(`.mv-panel[data-panel="${i}"]`);
      if (!panel) return;
      panel.querySelector('.mv-panel-select').value = '';
      panel.querySelector('.mv-panel-nav').classList.add('hidden');
      panel.querySelector('.mv-panel-nav').innerHTML = '';
      panel.querySelector('.mv-panel-body').innerHTML = '<div class="mv-panel-empty">Select a view above</div>';
    });
    mvSavedState.forEach((saved, i) => {
      if (saved.viewType) {
        const panel = document.querySelector(`.mv-panel[data-panel="${i}"]`);
        if (panel) panel.querySelector('.mv-panel-select').value = saved.viewType;
        loadMVPanel(i, saved.viewType);
        // Switch to saved item if different from first
        if (saved.itemId && mvPanelState[i].itemId !== saved.itemId) {
          mvSwitchToItem(i, saved.viewType, saved.itemId);
        }
      }
    });
    mvSavedState = null;
  } else {
    // Fresh open
    mvPanelState.forEach((s, i) => {
      mvPanelState[i] = {};
      const panel = document.querySelector(`.mv-panel[data-panel="${i}"]`);
      if (panel) {
        panel.querySelector('.mv-panel-select').value = '';
        panel.querySelector('.mv-panel-nav').classList.add('hidden');
        panel.querySelector('.mv-panel-nav').innerHTML = '';
        panel.querySelector('.mv-panel-body').innerHTML = '<div class="mv-panel-empty">Select a view above</div>';
      }
    });
  }
  setTimeout(initMvResizeHandles, 100);
}

function closeMultiview() {
  // Save current state before closing
  mvSavedState = mvPanelState.map(s => ({ viewType: s.viewType || null, itemId: s.itemId || null }));
  mvSavedLayout = document.getElementById('multiviewGrid').getAttribute('data-layout');

  // Return all borrowed views to their original parents
  for (const [viewKey, parentInfo] of Object.entries(mvOriginalParents)) {
    const viewEl = document.getElementById(MV_VIEW_IDS[viewKey]);
    if (viewEl && parentInfo) {
      parentInfo.parent.insertBefore(viewEl, parentInfo.sibling);
      viewEl.classList.add('hidden');
      viewEl.style.position = '';
      viewEl.style.inset = '';
      viewEl.classList.remove('mv-embedded');
    }
  }
  Object.keys(mvOriginalParents).forEach(k => delete mvOriginalParents[k]);

  // Safety: find any view elements still stuck inside panels and return them
  document.querySelectorAll('.mv-panel-body .mv-embedded').forEach(el => {
    el.classList.add('hidden');
    el.style.position = '';
    el.style.inset = '';
    el.classList.remove('mv-embedded');
    // Move back to main-content
    const mainContent = document.querySelector('.main-content');
    if (mainContent) mainContent.appendChild(el);
  });

  mvPanelState.forEach((s, i) => { mvPanelState[i] = {}; });
  multiviewActive = false;
  document.getElementById('multiviewOverlay').classList.add('hidden');
  // Re-show the current view
  const activeBtn = document.querySelector('.view-toggle-btn.active');
  if (activeBtn) switchView(activeBtn.dataset.view);
}

function loadMVPanel(panelIdx, viewType) {
  const panel = document.querySelector(`.mv-panel[data-panel="${panelIdx}"]`);
  if (!panel) return;

  // Skip if same view already loaded in this panel
  if (mvPanelState[panelIdx].viewType === viewType && viewType) return;

  const nav = panel.querySelector('.mv-panel-nav');
  const body = panel.querySelector('.mv-panel-body');

  // Return previous view from this panel
  const prev = mvPanelState[panelIdx].viewType;
  if (prev && mvOriginalParents[prev]) {
    const viewEl = document.getElementById(MV_VIEW_IDS[prev]);
    if (viewEl) {
      const info = mvOriginalParents[prev];
      info.parent.insertBefore(viewEl, info.sibling);
      viewEl.classList.add('hidden');
      viewEl.style.position = '';
      viewEl.style.inset = '';
      viewEl.classList.remove('mv-embedded');
      delete mvOriginalParents[prev];
    }
  }

  mvPanelState[panelIdx] = { viewType, itemId: null };

  if (!viewType) {
    nav.classList.add('hidden');
    nav.innerHTML = '';
    body.innerHTML = '<div class="mv-panel-empty">Select a view above</div>';
    return;
  }

  // If another panel already has this view, return it to original parent first then clear that panel
  const existingIdx = mvPanelState.findIndex((s, i) => s.viewType === viewType && i !== parseInt(panelIdx));
  if (existingIdx >= 0) {
    // Return the view element to its original parent BEFORE clearing the panel
    if (mvOriginalParents[viewType]) {
      const existingViewEl = document.getElementById(MV_VIEW_IDS[viewType]);
      if (existingViewEl) {
        const info = mvOriginalParents[viewType];
        info.parent.insertBefore(existingViewEl, info.sibling);
        existingViewEl.classList.add('hidden');
        existingViewEl.style.position = '';
        existingViewEl.style.inset = '';
        existingViewEl.classList.remove('mv-embedded');
        delete mvOriginalParents[viewType];
      }
    }
    const otherPanel = document.querySelector(`.mv-panel[data-panel="${existingIdx}"]`);
    if (otherPanel) {
      otherPanel.querySelector('.mv-panel-nav').classList.add('hidden');
      otherPanel.querySelector('.mv-panel-nav').innerHTML = '';
      otherPanel.querySelector('.mv-panel-body').innerHTML = '<div class="mv-panel-empty">Select a view above</div>';
      otherPanel.querySelector('.mv-panel-select').value = '';
    }
    mvPanelState[existingIdx] = {};
  }

  // Handle DM-screen-only views (no real view element to move)
  if (viewType === 'dice_log' || viewType === 'notes') {
    nav.classList.add('hidden');
    nav.innerHTML = '';
    if (viewType === 'dice_log') {
      body.innerHTML = `<div class="mv-special-view mv-dice-log" style="padding:10px;overflow-y:auto;height:100%">
        <div style="font-size:11px;font-weight:600;color:var(--gold);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.5px">Dice Log</div>
        <div class="mv-dice-log-entries" id="mvDiceLog${panelIdx}"></div>
      </div>`;
      const logEl = document.getElementById('mvDiceLog' + panelIdx);
      if (logEl && typeof diceHistory !== 'undefined') {
        logEl.innerHTML = diceHistory.slice().reverse().map(r =>
          `<div style="padding:4px 0;border-bottom:1px solid rgba(168,152,128,0.08);font-size:11px;display:flex;justify-content:space-between">
            <span style="color:var(--text-secondary)">${r.notation || '?'}</span>
            <span style="color:var(--gold);font-weight:600">${r.total != null ? r.total : r.result || '?'}</span>
          </div>`
        ).join('') || '<div style="color:var(--text-muted);font-size:11px;text-align:center;padding:20px">No dice rolled yet</div>';
      }
    } else {
      const savedNotes = mvPanelNotes[panelIdx] || '';
      body.innerHTML = `<div class="mv-special-view" style="padding:8px;height:100%;display:flex;flex-direction:column">
        <div style="font-size:11px;font-weight:600;color:var(--gold);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px">Quick Notes</div>
        <textarea class="mv-notes-pad" id="mvNotes${panelIdx}" placeholder="Type notes here..." style="flex:1;width:100%;resize:none;background:rgba(0,0,0,0.3);border:1px solid var(--border-color);border-radius:6px;color:var(--text-primary);font-family:inherit;font-size:12px;padding:8px;outline:none">${savedNotes}</textarea>
      </div>`;
      const ta = document.getElementById('mvNotes' + panelIdx);
      if (ta) ta.addEventListener('input', () => { mvPanelNotes[panelIdx] = ta.value; });
    }
    return;
  }

  // Grab the real view element
  const viewEl = document.getElementById(MV_VIEW_IDS[viewType]);
  if (!viewEl) {
    nav.classList.add('hidden');
    body.innerHTML = '<div class="mv-panel-empty">View not found</div>';
    return;
  }

  // Save original DOM location
  if (!mvOriginalParents[viewType]) {
    mvOriginalParents[viewType] = {
      parent: viewEl.parentNode,
      sibling: viewEl.nextSibling
    };
  }

  // Move into panel body
  body.innerHTML = '';
  viewEl.classList.remove('hidden');
  viewEl.classList.add('mv-embedded');
  viewEl.style.position = 'absolute';
  viewEl.style.inset = '0';
  body.appendChild(viewEl);

  // Build sidebar nav with item list
  const navItems = getMVNavItems(viewType);
  if (navItems.length > 1) {
    nav.classList.remove('hidden');
    renderMVNav(panelIdx, viewType, navItems);
  } else {
    nav.classList.add('hidden');
    nav.innerHTML = '';
  }

  // Trigger re-render - pick first selectable (non-folder) item
  const firstSelectable = navItems.find(i => !i.isFolder);
  mvSwitchToItem(panelIdx, viewType, firstSelectable ? firstSelectable.id : null);
}

function getMVNavItems(viewType) {
  const canSeeHidden = !!window.craftCanViewHidden;
  switch (viewType) {
    case 'board': return boards.filter(b => canSeeHidden || !b.hidden).map(b => ({ id: b.id, name: b.name || 'Untitled Board' }));
    case 'map': return maps.filter(m => canSeeHidden || !m.hidden).map(m => ({ id: m.id, name: m.name || 'Untitled Map' }));
    case 'write': {
      const items = [];
      // Add folders with their chapters nested
      chapterFolders.forEach(folder => {
        if (!canSeeHidden && folder.hidden) return;
        items.push({ id: 'folder:' + folder.id, name: '📁 ' + (folder.name || 'Folder'), isFolder: true, folderId: folder.id });
        const folderChapters = chapters.filter(c => c.folderId === folder.id);
        folderChapters.forEach(c => {
          if (!canSeeHidden && (c.hidden || folder.hidden)) return;
          items.push({ id: c.id, name: '   ' + (c.title || 'Untitled'), inFolder: true });
        });
      });
      // Unfiled chapters
      chapters.filter(c => !c.folderId).forEach(c => {
        if (!canSeeHidden && c.hidden) return;
        items.push({ id: c.id, name: c.title || 'Untitled' });
      });
      return items;
    }
    case 'timeline': return timelines.filter(t => canSeeHidden || !t.hidden).map(t => ({ id: t.id, name: t.name || 'Untitled' }));
    default: return [];
  }
}

function renderMVNav(panelIdx, viewType, items) {
  const panel = document.querySelector(`.mv-panel[data-panel="${panelIdx}"]`);
  const nav = panel.querySelector('.mv-panel-nav');
  const currentId = mvPanelState[panelIdx].itemId;

  nav.innerHTML = items.map(item => {
    if (item.isFolder) {
      return `<div class="mv-nav-item mv-nav-folder" data-folder-id="${item.folderId}">
        <span class="mv-nav-label">${item.name}</span>
      </div>`;
    }
    return `<div class="mv-nav-item ${item.id === currentId ? 'active' : ''}${item.inFolder ? ' mv-nav-indented' : ''}" data-id="${item.id}">
      <span class="mv-nav-label">${item.name}</span>
    </div>`;
  }).join('');

  nav.querySelectorAll('.mv-nav-item:not(.mv-nav-folder)').forEach(el => {
    el.addEventListener('click', () => {
      nav.querySelectorAll('.mv-nav-item').forEach(n => n.classList.remove('active'));
      el.classList.add('active');
      mvSwitchToItem(panelIdx, viewType, el.dataset.id);
    });
  });
}

function mvSwitchToItem(panelIdx, viewType, itemId) {
  mvPanelState[panelIdx].itemId = itemId;

  // Highlight in nav
  const panel = document.querySelector(`.mv-panel[data-panel="${panelIdx}"]`);
  if (panel) {
    panel.querySelectorAll('.mv-nav-item').forEach(el => {
      el.classList.toggle('active', el.dataset.id === itemId);
    });
  }

  switch (viewType) {
    case 'board':
      if (itemId) selectBoard(itemId);
      setTimeout(() => { if (typeof renderCards === 'function') renderCards(); renderConnections(); }, 50);
      break;
    case 'map':
      if (itemId) selectMap(itemId);
      setTimeout(() => { renderPins(); renderRegions(); applyMapTransform(); }, 50);
      break;
    case 'write':
      if (itemId) selectChapter(itemId);
      else if (currentChapterId) selectChapter(currentChapterId);
      break;
    case 'timeline':
      if (itemId) selectTimeline(itemId);
      setTimeout(() => { if (typeof renderTimelineView === 'function') renderTimelineView(); }, 50);
      break;
    case 'combat':
      setTimeout(() => { if (typeof renderCombatants === 'function') renderCombatants(); }, 50);
      break;
    case 'factions':
      // Show as-is
      break;
    case 'soundboard':
      // Init soundboard if not already done
      setTimeout(() => {
        const sbView = document.getElementById('soundboardView');
        if (sbView && !sbView._inited && typeof initSoundboard === 'function') {
          initSoundboard();
          sbView._inited = true;
        }
      }, 50);
      break;
  }
}


// ============================================
// Write: First-Line Indent Toggle
// ============================================

// DM Screen Resize Handles
function initMvResizeHandles() {
  const grid = document.getElementById('multiviewGrid');
  if (!grid) return;
  grid.querySelectorAll('.mv-panel-resize-h, .mv-panel-resize-v').forEach(el => el.remove());
  const panels = grid.querySelectorAll('.mv-panel');
  panels.forEach(panel => {
    const hHandle = document.createElement('div');
    hHandle.className = 'mv-panel-resize-h';
    panel.appendChild(hHandle);
    const vHandle = document.createElement('div');
    vHandle.className = 'mv-panel-resize-v';
    panel.appendChild(vHandle);
    hHandle.addEventListener('mousedown', (e) => startMvResize(e, 'col', panel, grid));
    vHandle.addEventListener('mousedown', (e) => startMvResize(e, 'row', panel, grid));
  });
}

function startMvResize(e, axis, panel, grid) {
  e.preventDefault();
  e.stopPropagation();
  const rect = grid.getBoundingClientRect();
  const startX = e.clientX;
  const startY = e.clientY;
  const style = getComputedStyle(grid);
  const cols = style.gridTemplateColumns.split(' ').map(parseFloat);
  const rows = style.gridTemplateRows.split(' ').map(parseFloat);
  const totalW = rect.width;
  const totalH = rect.height;
  // Find which column/row this panel occupies
  const panelRect = panel.getBoundingClientRect();
  let colIdx = -1, rowIdx = -1;
  if (axis === 'col') {
    let acc = rect.left;
    for (let i = 0; i < cols.length; i++) { acc += cols[i]; if (Math.abs(acc - (panelRect.right)) < 20) { colIdx = i; break; } }
    if (colIdx < 0 || colIdx >= cols.length - 1) return;
  } else {
    let acc = rect.top;
    for (let i = 0; i < rows.length; i++) { acc += rows[i]; if (Math.abs(acc - (panelRect.bottom)) < 20) { rowIdx = i; break; } }
    if (rowIdx < 0 || rowIdx >= rows.length - 1) return;
  }
  const overlay = document.createElement('div');
  overlay.style.cssText = 'position:fixed;inset:0;z-index:100000;cursor:' + (axis === 'col' ? 'col-resize' : 'row-resize');
  document.body.appendChild(overlay);
  function onMove(ev) {
    if (axis === 'col' && colIdx >= 0) {
      const dx = ev.clientX - startX;
      const newA = Math.max(60, cols[colIdx] + dx);
      const newB = Math.max(60, cols[colIdx + 1] - dx);
      const frA = newA / totalW;
      const frB = newB / totalW;
      const newCols = [...cols]; newCols[colIdx] = newA; newCols[colIdx + 1] = newB;
      grid.style.gridTemplateColumns = newCols.map(c => (c / totalW) + 'fr').join(' ');
    } else if (axis === 'row' && rowIdx >= 0) {
      const dy = ev.clientY - startY;
      const newA = Math.max(40, rows[rowIdx] + dy);
      const newB = Math.max(40, rows[rowIdx + 1] - dy);
      const newRows = [...rows]; newRows[rowIdx] = newA; newRows[rowIdx + 1] = newB;
      grid.style.gridTemplateRows = newRows.map(r => (r / totalH) + 'fr').join(' ');
    }
  }
  function onUp() {
    overlay.remove();
    document.removeEventListener('mousemove', onMove);
    document.removeEventListener('mouseup', onUp);
  }
  document.addEventListener('mousemove', onMove);
  document.addEventListener('mouseup', onUp);
}
let writeIndentMode = false;
let writeJustifyMode = false;

function toggleFirstLineIndent() {
  writeIndentMode = !writeIndentMode;
  const editor = document.getElementById('writeEditor');
  const btn = document.getElementById('indentToggleBtn');
  if (writeIndentMode) {
    // Wrap any bare text nodes in <div> so indent CSS catches them
    normalizeEditorBlocks(editor);
    editor.classList.add('indent-mode');
    btn.classList.add('active');
  } else {
    editor.classList.remove('indent-mode');
    btn.classList.remove('active');
  }
  editor.focus();
  saveCurrentChapter();
}

function toggleJustify() {
  writeJustifyMode = !writeJustifyMode;
  const editor = document.getElementById('writeEditor');
  const btn = document.getElementById('justifyToggleBtn');
  if (writeJustifyMode) {
    editor.classList.add('justify-mode');
    btn.classList.add('active');
  } else {
    editor.classList.remove('justify-mode');
    btn.classList.remove('active');
  }
  editor.focus();
  saveCurrentChapter();
}

function normalizeEditorBlocks(editor) {
  // Walk top-level child nodes; wrap bare text/inline nodes in <div>
  const blockTags = new Set(['DIV','P','H1','H2','H3','H4','H5','H6','UL','OL','BLOCKQUOTE','TABLE','HR','FIGURE','PRE']);
  const children = Array.from(editor.childNodes);
  let pendingInline = [];

  function flushInline() {
    if (!pendingInline.length) return;
    // Only wrap if there's actual text content
    const hasText = pendingInline.some(n => n.textContent.trim().length > 0);
    if (hasText) {
      const wrapper = document.createElement('div');
      pendingInline[0].parentNode.insertBefore(wrapper, pendingInline[0]);
      pendingInline.forEach(n => wrapper.appendChild(n));
    }
    pendingInline = [];
  }

  children.forEach(node => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.textContent.trim()) pendingInline.push(node);
      else pendingInline.push(node); // keep whitespace with group
    } else if (node.nodeType === Node.ELEMENT_NODE) {
      if (blockTags.has(node.tagName)) {
        flushInline();
      } else if (node.tagName === 'BR' && pendingInline.length === 0) {
        // Standalone BR at top level, skip
      } else {
        pendingInline.push(node); // inline elements like <span>, <strong>, <a>
      }
    }
  });
  flushInline();
}

// ============================================
// Write: Thesaurus (Datamuse API)
// ============================================
let thesaurusPopup = null;
let thesWord = null;

function getSelectedWord() {
  const sel = window.getSelection();
  if (!sel.rangeCount || sel.isCollapsed) return null;
  const text = sel.toString().trim();
  if (!text) return null;
  return text.split(/\s+/)[0];
}

function openThesaurus(e) {
  const word = getSelectedWord();
  if (!word) { showNotif('Select a word first'); return; }
  thesWord = word;
  showThesaurusAt(word, e?.clientX || window.innerWidth / 2, e?.clientY || 200);
}

function showThesaurusAt(word, x, y) {
  closeThesaurus();
  thesWord = word;

  const popup = document.createElement('div');
  popup.className = 'thesaurus-popup';
  popup.style.left = Math.min(x, window.innerWidth - 340) + 'px';
  popup.style.top = Math.min(y, window.innerHeight - 420) + 'px';
  popup.style.userSelect = 'none';
  popup.style.webkitUserSelect = 'none';
  popup.innerHTML = `
    <div class="thesaurus-header">
      <h4>"${word}"</h4>
      <button class="thesaurus-close" id="thesClose">&times;</button>
    </div>
    <div class="thesaurus-tabs">
      <button class="thesaurus-tab active" data-type="def">Definition</button>
      <button class="thesaurus-tab" data-type="syn">Synonyms</button>
      <button class="thesaurus-tab" data-type="sim">Similar</button>
      <button class="thesaurus-tab" data-type="ant">Antonyms</button>
      <button class="thesaurus-tab" data-type="rel">Related</button>
    </div>
    <div class="thesaurus-body"><div class="thesaurus-loading">Loading...</div></div>
    <div class="thesaurus-preview" id="thesPreview" style="display:none;"></div>
  `;

  ['mousedown','pointerdown','selectstart'].forEach(evt => {
    popup.addEventListener(evt, (e) => e.preventDefault());
  });

  document.body.appendChild(popup);
  thesaurusPopup = popup;

  popup.querySelector('#thesClose').addEventListener('click', closeThesaurus);
  popup.querySelectorAll('.thesaurus-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      popup.querySelectorAll('.thesaurus-tab').forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const preview = popup.querySelector('#thesPreview');
      if (preview) preview.style.display = 'none';
      popup.querySelector('.thesaurus-body').style.display = '';
      if (tab.dataset.type === 'def') {
        fetchThesaurusDefinition(word, popup.querySelector('.thesaurus-body'));
      } else {
        fetchThesaurusResults(word, tab.dataset.type, popup.querySelector('.thesaurus-body'));
      }
    });
  });

  fetchThesaurusDefinition(word, popup.querySelector('.thesaurus-body'));
  setTimeout(() => document.addEventListener('mousedown', thesaurusOutsideClick), 100);
}

function thesaurusOutsideClick(e) {
  if (thesaurusPopup && !thesaurusPopup.contains(e.target)) closeThesaurus();
}

function closeThesaurus() {
  if (thesaurusPopup) { thesaurusPopup.remove(); thesaurusPopup = null; }
  // DON'T clear thesWord here - the replace handler needs it
  document.removeEventListener('mousedown', thesaurusOutsideClick);
}

// Match the capitalization pattern of the original word
function matchCase(original, replacement) {
  if (!original || !replacement) return replacement;
  // ALL CAPS
  if (original === original.toUpperCase() && original.length > 1) return replacement.toUpperCase();
  // Title Case (first letter uppercase, rest lowercase)
  if (original[0] === original[0].toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1).toLowerCase();
  }
  // all lowercase
  if (original === original.toLowerCase()) return replacement.toLowerCase();
  // Default: return as-is
  return replacement;
}

function doThesaurusReplace(newWord, originalWord) {
  const target = originalWord || thesWord;
  if (!target) return false;
  const editor = document.getElementById('writeEditor');
  if (!editor) return false;

  // Match the capitalization of the original word
  newWord = matchCase(target, newWord);

  // Strategy 1: Walk text nodes for exact match
  const walker = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
  while (walker.nextNode()) {
    const tn = walker.currentNode;
    const idx = tn.textContent.indexOf(target);
    if (idx !== -1) {
      tn.textContent = tn.textContent.substring(0, idx) + newWord + tn.textContent.substring(idx + target.length);
      saveCurrentChapter();
      thesWord = null;
      return true;
    }
  }

  // Strategy 2: Normalize non-breaking spaces and try again
  const walker2 = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
  const normalizedTarget = target.replace(/\u00a0/g, ' ');
  while (walker2.nextNode()) {
    const tn = walker2.currentNode;
    const normalized = tn.textContent.replace(/\u00a0/g, ' ');
    const idx = normalized.indexOf(normalizedTarget);
    if (idx !== -1) {
      const before = tn.textContent.substring(0, idx);
      const after = tn.textContent.substring(idx + target.length);
      tn.textContent = before + newWord + after;
      saveCurrentChapter();
      thesWord = null;
      return true;
    }
  }

  // Strategy 3: Case-insensitive text node walk
  const walker3 = document.createTreeWalker(editor, NodeFilter.SHOW_TEXT, null);
  const lowerTarget = target.toLowerCase();
  while (walker3.nextNode()) {
    const tn = walker3.currentNode;
    const idx = tn.textContent.toLowerCase().indexOf(lowerTarget);
    if (idx !== -1) {
      tn.textContent = tn.textContent.substring(0, idx) + newWord + tn.textContent.substring(idx + target.length);
      saveCurrentChapter();
      thesWord = null;
      return true;
    }
  }

  // Strategy 4: innerHTML text-only replacement (avoids replacing inside tags/attributes)
  // Build regex that matches the word only in text content (after > or at start)
  const escaped = target.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const html = editor.innerHTML;
  // Match word that's NOT inside an HTML tag
  const parts = html.split(/(<[^>]+>)/);
  let found = false;
  for (let i = 0; i < parts.length; i++) {
    // Only process text parts (odd indices are tags after split)
    if (!parts[i].startsWith('<')) {
      const idx = parts[i].indexOf(target);
      if (idx !== -1) {
        parts[i] = parts[i].substring(0, idx) + newWord + parts[i].substring(idx + target.length);
        found = true;
        break;
      }
    }
  }
  if (found) {
    editor.innerHTML = parts.join('');
    saveCurrentChapter();
    thesWord = null;
    return true;
  }

  // Strategy 5: Same as 4 but case-insensitive
  for (let i = 0; i < parts.length; i++) {
    if (!parts[i].startsWith('<')) {
      const idx = parts[i].toLowerCase().indexOf(lowerTarget);
      if (idx !== -1) {
        parts[i] = parts[i].substring(0, idx) + newWord + parts[i].substring(idx + target.length);
        found = true;
        break;
      }
    }
  }
  if (found) {
    editor.innerHTML = parts.join('');
    saveCurrentChapter();
    thesWord = null;
    return true;
  }

  thesWord = null;
  return false;
}

// Preview a synonym's definition before committing
function showWordPreview(clickedWord, origWord) {
  const preview = thesaurusPopup?.querySelector('#thesPreview');
  const body = thesaurusPopup?.querySelector('.thesaurus-body');
  if (!preview || !body) return;
  body.style.display = 'none';
  preview.style.display = '';
  preview.innerHTML = '<div class="thesaurus-loading">Loading definition...</div>';

  // Capture the original word now, before any async operation
  const capturedOriginal = origWord || thesWord;

  fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(clickedWord)}`)
    .then(r => r.ok ? r.json() : Promise.reject('not found'))
    .then(data => { renderPreview(preview, body, clickedWord, capturedOriginal, data); })
    .catch(() => { renderPreview(preview, body, clickedWord, capturedOriginal, null); });
}

function renderPreview(preview, body, clickedWord, origWord, data) {
  let html = `<div class="thes-preview-word">${clickedWord}</div>`;

  if (data && data.length) {
    const entry = data[0];
    if (entry.phonetic) {
      html += `<div class="thes-preview-phonetic">${entry.phonetic}</div>`;
    }
    (entry.meanings || []).forEach(m => {
      html += `<div class="thes-preview-pos">${m.partOfSpeech}</div>`;
      (m.definitions || []).slice(0, 2).forEach((d, i) => {
        html += `<div class="thes-preview-def">${i+1}. ${d.definition}</div>`;
        if (d.example) html += `<div class="thes-preview-example">"${d.example}"</div>`;
      });
    });
  } else {
    html += '<div class="thes-preview-def" style="color:var(--text-muted);">No definition available</div>';
  }

  html += `<div class="thes-preview-actions">
    <button class="thes-preview-back" id="thesBack">Back</button>
    <button class="thes-preview-use" id="thesUse">Use "${clickedWord}"</button>
  </div>`;

  preview.innerHTML = html;
  preview.querySelector('#thesBack').addEventListener('click', () => {
    preview.style.display = 'none';
    body.style.display = '';
  });
  preview.querySelector('#thesUse').addEventListener('click', () => {
    if (doThesaurusReplace(clickedWord, origWord)) {
      showNotif(`Replaced with "${clickedWord}"`);
    } else {
      showNotif('Could not find word to replace');
    }
    closeThesaurus();
    thesWord = null;
  });
}

async function fetchThesaurusDefinition(word, container) {
  container.innerHTML = '<div class="thesaurus-loading">Looking up...</div>';
  try {
    const res = await fetch(`https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`);
    if (!res.ok) { container.innerHTML = '<div class="thesaurus-none">No definition found</div>'; return; }
    const data = await res.json();
    if (!data.length) { container.innerHTML = '<div class="thesaurus-none">No definition found</div>'; return; }

    let html = '';
    const entry = data[0];

    if (entry.phonetic) {
      html += `<div style="padding:6px 14px 2px;font-size:12px;color:var(--text-muted);font-style:italic;">${entry.phonetic}</div>`;
    }

    (entry.meanings || []).forEach(meaning => {
      html += `<div style="padding:6px 14px 2px;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.5px;color:var(--gold);">${meaning.partOfSpeech}</div>`;
      (meaning.definitions || []).slice(0, 3).forEach((def, i) => {
        html += `<div style="padding:2px 14px 2px 22px;font-size:12px;color:var(--text-secondary);line-height:1.5;">${i + 1}. ${def.definition}</div>`;
        if (def.example) {
          html += `<div style="padding:1px 14px 4px 30px;font-size:11px;color:var(--text-muted);font-style:italic;">"${def.example}"</div>`;
        }
      });
      if (meaning.synonyms?.length) {
        html += `<div style="padding:4px 14px 2px 22px;font-size:10px;color:var(--text-muted);">Synonyms: <span style="color:var(--text-secondary);">${meaning.synonyms.slice(0,6).join(', ')}</span></div>`;
      }
      if (meaning.antonyms?.length) {
        html += `<div style="padding:2px 14px 4px 22px;font-size:10px;color:var(--text-muted);">Antonyms: <span style="color:var(--text-secondary);">${meaning.antonyms.slice(0,6).join(', ')}</span></div>`;
      }
    });

    if (!html) { container.innerHTML = '<div class="thesaurus-none">No definition found</div>'; return; }
    container.innerHTML = html;
  } catch (err) {
    container.innerHTML = '<div class="thesaurus-none">Failed to fetch definition</div>';
  }
}

async function fetchThesaurusResults(word, type, container) {
  container.innerHTML = '<div class="thesaurus-loading">Searching...</div>';
  const endpoints = {
    syn: `https://api.datamuse.com/words?rel_syn=${encodeURIComponent(word)}&max=30`,
    sim: `https://api.datamuse.com/words?ml=${encodeURIComponent(word)}&max=30`,
    ant: `https://api.datamuse.com/words?rel_ant=${encodeURIComponent(word)}&max=30`,
    rel: `https://api.datamuse.com/words?rel_trg=${encodeURIComponent(word)}&max=30`
  };
  try {
    const res = await fetch(endpoints[type]);
    const data = await res.json();
    if (!data.length) { container.innerHTML = '<div class="thesaurus-none">No results found</div>'; return; }
    container.innerHTML = data.map(w =>
      `<div class="thesaurus-word" data-word="${w.word}">${w.word}</div>`
    ).join('');
    // Capture word now for the closure
    const capturedWord = thesWord;
    container.querySelectorAll('.thesaurus-word').forEach(el => {
      el.addEventListener('click', () => showWordPreview(el.dataset.word, capturedWord));
    });
  } catch (err) {
    container.innerHTML = '<div class="thesaurus-none">Failed to fetch results</div>';
  }
}

function handleEditorContextMenu(e) {
  e.preventDefault();

  // If text is selected, open thesaurus
  const selectedWord = getSelectedWord();
  if (selectedWord) {
    thesWord = selectedWord;
    showThesaurusAt(selectedWord, e.clientX, e.clientY);
    return;
  }

  // No selection: get word under cursor and offer spell check
  const wordInfo = getWordUnderCursor();
  if (wordInfo && wordInfo.word.length > 1) {
    showSpellCheckMenu(wordInfo, e.clientX, e.clientY);
  }
}

// Get the word under the text cursor position
function getWordUnderCursor() {
  const sel = window.getSelection();
  if (!sel.rangeCount) return null;
  const range = sel.getRangeAt(0);
  const node = range.startContainer;
  if (node.nodeType !== Node.TEXT_NODE) return null;

  const text = node.textContent;
  const offset = range.startOffset;

  // Find word boundaries around the cursor
  let start = offset;
  let end = offset;
  const wordChars = /[a-zA-Z'\u2019\-]/;

  while (start > 0 && wordChars.test(text[start - 1])) start--;
  while (end < text.length && wordChars.test(text[end])) end++;

  if (start === end) return null;
  const word = text.substring(start, end);
  if (!word || word.length < 2) return null;

  return { word, node, start, end };
}

let spellCheckPopup = null;

function closeSpellCheck() {
  if (spellCheckPopup) { spellCheckPopup.remove(); spellCheckPopup = null; }
  document.removeEventListener('mousedown', spellCheckOutsideClick);
}

function spellCheckOutsideClick(e) {
  if (spellCheckPopup && !spellCheckPopup.contains(e.target)) closeSpellCheck();
}

async function showSpellCheckMenu(wordInfo, x, y) {
  closeSpellCheck();
  closeThesaurus();

  const popup = document.createElement('div');
  popup.className = 'spellcheck-popup';
  popup.style.left = Math.min(x, window.innerWidth - 220) + 'px';
  popup.style.top = Math.min(y, window.innerHeight - 200) + 'px';
  popup.innerHTML = '<div class="spellcheck-loading">Checking...</div>';

  ['mousedown','pointerdown','selectstart'].forEach(evt => {
    popup.addEventListener(evt, (e) => e.preventDefault());
  });

  document.body.appendChild(popup);
  spellCheckPopup = popup;

  try {
    // Use Datamuse spell suggestion API
    const res = await fetch(`https://api.datamuse.com/words?sp=${encodeURIComponent(wordInfo.word)}&max=8`);
    const data = await res.json();

    // Filter: remove exact match, keep close matches
    const suggestions = data
      .filter(w => w.word.toLowerCase() !== wordInfo.word.toLowerCase())
      .slice(0, 5);

    if (!suggestions.length) {
      popup.innerHTML = `
        <div class="spellcheck-header">No suggestions</div>
        <div class="spellcheck-word-display">"${wordInfo.word}" looks correct</div>
        <div class="spellcheck-divider"></div>
        <div class="spellcheck-item spellcheck-action" id="scThesaurus">Thesaurus</div>
      `;
    } else {
      let html = `<div class="spellcheck-header">Did you mean...</div>`;
      suggestions.forEach(s => {
        const display = matchCase(wordInfo.word, s.word);
        html += `<div class="spellcheck-item spellcheck-suggestion" data-word="${s.word}">${display}</div>`;
      });
      html += `<div class="spellcheck-divider"></div>`;
      html += `<div class="spellcheck-item spellcheck-action" id="scThesaurus">Thesaurus</div>`;
      popup.innerHTML = html;

      popup.querySelectorAll('.spellcheck-suggestion').forEach(el => {
        el.addEventListener('click', () => {
          const newWord = matchCase(wordInfo.word, el.dataset.word);
          // Replace directly in the text node
          const text = wordInfo.node.textContent;
          if (wordInfo.node.parentNode && text.substring(wordInfo.start, wordInfo.end) === wordInfo.word) {
            wordInfo.node.textContent = text.substring(0, wordInfo.start) + newWord + text.substring(wordInfo.end);
          } else {
            // Fallback: search the node
            const idx = wordInfo.node.textContent.indexOf(wordInfo.word);
            if (idx !== -1) {
              const t = wordInfo.node.textContent;
              wordInfo.node.textContent = t.substring(0, idx) + newWord + t.substring(idx + wordInfo.word.length);
            }
          }
          saveCurrentChapter();
          showNotif(`Corrected to "${newWord}"`);
          closeSpellCheck();
        });
      });
    }

    // Thesaurus option: select the word and open thesaurus
    popup.querySelector('#scThesaurus')?.addEventListener('click', () => {
      // Select the word in the editor
      const range = document.createRange();
      range.setStart(wordInfo.node, wordInfo.start);
      range.setEnd(wordInfo.node, wordInfo.end);
      const sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(range);

      closeSpellCheck();
      thesWord = wordInfo.word;
      showThesaurusAt(wordInfo.word, x, y);
    });

  } catch (err) {
    popup.innerHTML = '<div class="spellcheck-header">Could not check spelling</div>';
  }

  setTimeout(() => document.addEventListener('mousedown', spellCheckOutsideClick), 100);
}

// ============================================
// Write: Export Document
// ============================================
function openExportModal() {
  saveCurrentChapter();
  closeAllContextMenus();
  const overlay = document.createElement('div');
  overlay.className = 'sb-yt-overlay';
  const popup = document.createElement('div');
  popup.className = 'sb-yt-popup';
  popup.style.width = '380px';
  popup.innerHTML = `
    <h3 style="margin:0 0 14px;">Export Writing</h3>
    <div class="export-scope">
      <label><input type="radio" name="exportScope" value="current" checked /> Current chapter only</label>
      <label><input type="radio" name="exportScope" value="all" /> All chapters</label>
    </div>
    <div class="export-options">
      <div class="export-option" data-format="docx">
        <div class="export-option-left"><span class="export-option-name">Word Document</span><span class="export-option-desc">Compatible with Microsoft Word, Google Docs import</span></div>
        <span class="export-option-ext">.docx</span>
      </div>
      <div class="export-option" data-format="html">
        <div class="export-option-left"><span class="export-option-name">HTML Document</span><span class="export-option-desc">Opens in any browser, paste into Google Docs</span></div>
        <span class="export-option-ext">.html</span>
      </div>
      <div class="export-option" data-format="md">
        <div class="export-option-left"><span class="export-option-name">Markdown</span><span class="export-option-desc">For wikis, GitHub, Obsidian, static sites</span></div>
        <span class="export-option-ext">.md</span>
      </div>
      <div class="export-option" data-format="txt">
        <div class="export-option-left"><span class="export-option-name">Plain Text</span><span class="export-option-desc">No formatting, universal compatibility</span></div>
        <span class="export-option-ext">.txt</span>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);
  document.body.appendChild(popup);
  overlay.addEventListener('click', () => { overlay.remove(); popup.remove(); });
  popup.querySelectorAll('.export-option').forEach(opt => {
    opt.addEventListener('click', () => {
      const format = opt.dataset.format;
      const scope = popup.querySelector('input[name="exportScope"]:checked').value;
      overlay.remove(); popup.remove();
      doExport(format, scope);
    });
  });
}

function doExport(format, scope) {
  saveCurrentChapter();
  let chaptersToExport;
  if (scope === 'current') {
    const ch = chapters.find(c => c.id === currentChapterId);
    chaptersToExport = ch ? [ch] : [];
  } else {
    chaptersToExport = [...chapters];
  }
  if (!chaptersToExport.length) { showNotif('Nothing to export'); return; }

  const projectTitle = chaptersToExport.length === 1 ? chaptersToExport[0].title : 'Writing Project';

  if (format === 'docx') exportAsDocx(chaptersToExport, projectTitle);
  else if (format === 'html') exportAsHtml(chaptersToExport, projectTitle);
  else if (format === 'md') exportAsMarkdown(chaptersToExport, projectTitle);
  else if (format === 'txt') exportAsText(chaptersToExport, projectTitle);
}

function exportAsDocx(chaps, title) {
  // Use Word-compatible HTML with MSO namespace for .docx opening
  let html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40"><head><meta charset="utf-8"><title>${title}</title><!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]--><style>body{font-family:'Times New Roman',serif;font-size:12pt;line-height:1.6;color:#000;margin:1in;}h1{font-size:18pt;font-weight:bold;margin:18pt 0 12pt;}h2{font-size:14pt;font-weight:bold;margin:14pt 0 10pt;}h3{font-size:12pt;font-weight:bold;margin:12pt 0 8pt;}p{margin:0 0 6pt;}</style></head><body>`;
  chaps.forEach((ch, i) => {
    if (i > 0) html += '<br clear="all" style="page-break-before:always">';
    if (ch.label) html += `<p style="font-size:10pt;color:#666;">${ch.label}</p>`;
    html += `<h1>${ch.title || 'Untitled'}</h1>`;
    html += cleanHtmlForExport(ch.content || '');
  });
  html += '</body></html>';
  downloadFile(html, sanitizeFilename(title) + '.doc', 'application/msword');
  showNotif('Exported as Word document');
}

function exportAsHtml(chaps, title) {
  let html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${title}</title><style>body{max-width:700px;margin:40px auto;font-family:Georgia,serif;font-size:16px;line-height:1.8;color:#333;padding:0 20px;}h1{font-size:28px;border-bottom:2px solid #eee;padding-bottom:8px;}h2{font-size:22px;}h3{font-size:18px;}blockquote{border-left:3px solid #ccc;margin:1em 0;padding:0.5em 1em;color:#555;}img{max-width:100%;height:auto;}</style></head><body>`;
  chaps.forEach((ch, i) => {
    if (i > 0) html += '<hr style="margin:40px 0;">';
    if (ch.label) html += `<p style="font-size:12px;color:#999;text-transform:uppercase;letter-spacing:1px;">${ch.label}</p>`;
    html += `<h1>${ch.title || 'Untitled'}</h1>`;
    html += cleanHtmlForExport(ch.content || '');
  });
  html += '</body></html>';
  downloadFile(html, sanitizeFilename(title) + '.html', 'text/html');
  showNotif('Exported as HTML');
}

function exportAsMarkdown(chaps, title) {
  let md = '';
  chaps.forEach((ch, i) => {
    if (i > 0) md += '\n\n---\n\n';
    if (ch.label) md += `*${ch.label}*\n\n`;
    md += `# ${ch.title || 'Untitled'}\n\n`;
    md += htmlToMarkdown(ch.content || '');
  });
  downloadFile(md, sanitizeFilename(title) + '.md', 'text/markdown');
  showNotif('Exported as Markdown');
}

function exportAsText(chaps, title) {
  let txt = '';
  chaps.forEach((ch, i) => {
    if (i > 0) txt += '\n\n========================================\n\n';
    if (ch.label) txt += ch.label + '\n';
    txt += (ch.title || 'Untitled') + '\n\n';
    const temp = document.createElement('div');
    temp.innerHTML = ch.content || '';
    txt += temp.textContent || temp.innerText || '';
  });
  downloadFile(txt, sanitizeFilename(title) + '.txt', 'text/plain');
  showNotif('Exported as plain text');
}

function cleanHtmlForExport(html) {
  // Strip editor-specific classes, dice badges, image wrappers etc
  const temp = document.createElement('div');
  temp.innerHTML = html;
  temp.querySelectorAll('.dice-roll-badge').forEach(el => {
    el.outerHTML = `<span>[${el.textContent}]</span>`;
  });
  temp.querySelectorAll('.editor-image-wrapper').forEach(wrapper => {
    const img = wrapper.querySelector('img');
    if (img) wrapper.outerHTML = img.outerHTML;
  });
  return temp.innerHTML;
}

function htmlToMarkdown(html) {
  const temp = document.createElement('div');
  temp.innerHTML = html;
  let md = '';
  function walk(node) {
    if (node.nodeType === 3) { md += node.textContent; return; }
    if (node.nodeType !== 1) return;
    const tag = node.tagName.toLowerCase();
    if (tag === 'h1') { md += '# '; node.childNodes.forEach(walk); md += '\n\n'; }
    else if (tag === 'h2') { md += '## '; node.childNodes.forEach(walk); md += '\n\n'; }
    else if (tag === 'h3') { md += '### '; node.childNodes.forEach(walk); md += '\n\n'; }
    else if (tag === 'p' || tag === 'div') { node.childNodes.forEach(walk); md += '\n\n'; }
    else if (tag === 'br') { md += '\n'; }
    else if (tag === 'strong' || tag === 'b') { md += '**'; node.childNodes.forEach(walk); md += '**'; }
    else if (tag === 'em' || tag === 'i') { md += '*'; node.childNodes.forEach(walk); md += '*'; }
    else if (tag === 'blockquote') { md += '> '; node.childNodes.forEach(walk); md += '\n\n'; }
    else if (tag === 'ul') { node.querySelectorAll(':scope > li').forEach(li => { md += '- ' + li.textContent.trim() + '\n'; }); md += '\n'; }
    else if (tag === 'ol') { let n = 1; node.querySelectorAll(':scope > li').forEach(li => { md += n + '. ' + li.textContent.trim() + '\n'; n++; }); md += '\n'; }
    else if (tag === 'a') { md += '['; node.childNodes.forEach(walk); md += `](${node.href})`; }
    else if (tag === 'img') { md += `![](${node.src})`; }
    else { node.childNodes.forEach(walk); }
  }
  temp.childNodes.forEach(walk);
  return md.replace(/\n{3,}/g, '\n\n').trim();
}

function sanitizeFilename(name) { return (name || 'document').replace(/[^a-zA-Z0-9 _-]/g, '').trim() || 'document'; }

function downloadFile(content, filename, mimeType) {
  const blob = new Blob([content], { type: mimeType + ';charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 100);
}


// ============================================
// Site Dialogs (replaces browser prompt/confirm)
// ============================================
function sitePrompt(title, placeholder, defaultVal) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'site-dialog-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'site-dialog';
    dialog.innerHTML = `
      <div class="site-dialog-header">${title}</div>
      <div class="site-dialog-body">
        <input type="text" class="site-dialog-input" placeholder="${placeholder || ''}" value="${defaultVal || ''}" />
      </div>
      <div class="site-dialog-footer">
        <button class="site-dialog-btn cancel">Cancel</button>
        <button class="site-dialog-btn confirm">OK</button>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    const input = dialog.querySelector('.site-dialog-input');
    input.focus();
    input.select();
    function close(val) { overlay.remove(); resolve(val); }
    dialog.querySelector('.cancel').addEventListener('click', () => close(null));
    dialog.querySelector('.confirm').addEventListener('click', () => close(input.value.trim() || null));
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') close(input.value.trim() || null);
      if (e.key === 'Escape') close(null);
    });
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(null); });
  });
}

function siteConfirm(title, message, confirmLabel, isDanger) {
  return new Promise((resolve) => {
    const overlay = document.createElement('div');
    overlay.className = 'site-dialog-overlay';
    const dialog = document.createElement('div');
    dialog.className = 'site-dialog';
    dialog.innerHTML = `
      <div class="site-dialog-header">${title}</div>
      <div class="site-dialog-body"><p>${message}</p></div>
      <div class="site-dialog-footer">
        <button class="site-dialog-btn cancel">Cancel</button>
        <button class="site-dialog-btn ${isDanger ? 'danger' : 'confirm'}">${confirmLabel || 'OK'}</button>
      </div>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);
    function close(val) { overlay.remove(); resolve(val); }
    dialog.querySelector('.cancel').addEventListener('click', () => close(false));
    dialog.querySelector('.site-dialog-btn:not(.cancel)').addEventListener('click', () => close(true));
    overlay.addEventListener('click', (e) => { if (e.target === overlay) close(false); });
    document.addEventListener('keydown', function esc(e) {
      if (e.key === 'Escape') { close(false); document.removeEventListener('keydown', esc); }
    });
  });
}


// ============================================
// Soundscape - Ambient Audio Engine
// ============================================

let sbAudioCtx = null;
let sbMasterGain = null;
let sbMasterVol = 0.7;
let sbPersonalVol = parseFloat(localStorage.getItem('sbPersonalVol') || '1');
let sbSoundscapes = [];
let sbPlaylists = []; // { id, name, soundIds[] }
let sbActiveChannels = {};
let sbCurrentCat = 'all';
let sbCustomSounds = [];
let sbYtPopupOpen = false;
let sbActiveScapeId = null;
let sbActivePlaylistId = null;

// MultiView integration
let mvConnected = false;
let mvApiBase = '';
let mvToken = '';
let mvUser = null;
let mvRooms = [];

// ─── ALL NEW Sound Library ───
// ─── Sound Library (user-populated via Freesound, upload, YouTube) ───
const SB_SOUNDS = [];

// Category definitions for UI
const SB_CATEGORIES = [
  { id: 'all', label: 'All' },
  { id: 'tavern', label: 'Tavern & Inn' },
  { id: 'dungeon', label: 'Dungeon & Cave' },
  { id: 'forest', label: 'Forest & Wild' },
  { id: 'town', label: 'Town & Village' },
  { id: 'combat', label: 'Battle & Combat' },
  { id: 'ocean', label: 'Ocean & Water' },
  { id: 'castle', label: 'Castle & Ruins' },
  { id: 'tense', label: 'Tense' },
  { id: 'peaceful', label: 'Peaceful' },
  { id: 'mysterious', label: 'Mysterious' },
  { id: 'epic', label: 'Epic' },
  { id: 'dark', label: 'Dark' },
  { id: 'custom', label: 'Custom' }
];

let sbFreesoundKey = localStorage.getItem('freesoundApiKey') || '';

function sbEnsureCtx(){if(!sbAudioCtx){sbAudioCtx=new(window.AudioContext||window.webkitAudioContext)();sbMasterGain=sbAudioCtx.createGain();sbMasterGain.gain.value=sbMasterVol*sbPersonalVol;sbMasterGain.connect(sbAudioCtx.destination);}if(sbAudioCtx.state==='suspended')sbAudioCtx.resume();}

// Play audio from file (data URL)
function sbCreateFile(def){sbEnsureCtx();const a=new Audio();a.src=def.fileDataUrl;a.loop=true;a.crossOrigin='anonymous';a.onended=function(){a.currentTime=0;a.play().catch(()=>{});};const s=sbAudioCtx.createMediaElementSource(a);const g=sbAudioCtx.createGain();g.gain.value=def.baseGain;s.connect(g);g.connect(sbMasterGain);a.play().catch(()=>{});return{gainNode:g,audioEl:a,stop(){a.pause();a.currentTime=0;g.disconnect();}};}

// Play audio from remote URL (Freesound previews, etc.)
function sbCreateUrl(def){sbEnsureCtx();const a=new Audio();a.src=def.audioUrl;a.loop=true;a.onended=function(){a.currentTime=0;a.play().catch(()=>{});};const g=sbAudioCtx.createGain();g.gain.value=def.baseGain;g.connect(sbMasterGain);try{a.crossOrigin='anonymous';const s=sbAudioCtx.createMediaElementSource(a);s.connect(g);a.play().catch(()=>{a.removeAttribute('crossOrigin');a.load();a.play().catch(()=>{});});}catch(e){a.removeAttribute('crossOrigin');a.load();a.play().catch(()=>{});}return{gainNode:g,audioEl:a,stop(){a.pause();a.currentTime=0;try{g.disconnect();}catch(e){}}};}

// Play YouTube audio via hidden iframe
function sbCreateYt(def){sbEnsureCtx();let c=document.getElementById('sbYtPlayers');if(!c){c=document.createElement('div');c.id='sbYtPlayers';c.className='sb-yt-hidden-player';document.body.appendChild(c);}const iframe=document.createElement('iframe');const v=def.ytVideoId;iframe.id='sb-yt-'+def.id;iframe.width='1';iframe.height='1';iframe.allow='autoplay';iframe.src=`https://www.youtube.com/embed/${v}?autoplay=1&loop=1&playlist=${v}&enablejsapi=1&controls=0`;c.appendChild(iframe);const g=sbAudioCtx.createGain();g.gain.value=def.baseGain;g.connect(sbMasterGain);return{gainNode:g,iframe,stop(){iframe.remove();g.disconnect();}};}

function sbGetAll(){return[...SB_SOUNDS,...sbCustomSounds];}
function sbStart(id){sbEnsureCtx();if(sbActiveChannels[id]?.playing)return;const def=sbGetAll().find(s=>s.id===id);if(!def)return;let snd;if(def.type==='file')snd=sbCreateFile(def);else if(def.type==='url')snd=sbCreateUrl(def);else if(def.type==='youtube')snd=sbCreateYt(def);else return;const vol=sbActiveChannels[id]?.volume??70;sbActiveChannels[id]={sound:snd,playing:true,volume:vol,def};sbSetVol(id,vol);sbUpdateTile(id);}
function sbStop(id){const ch=sbActiveChannels[id];if(!ch)return;ch.sound.stop();delete sbActiveChannels[id];sbUpdateTile(id);}
function sbToggle(id){if(sbActiveChannels[id]?.playing)sbStop(id);else sbStart(id);}
function sbSetVol(id,val){const ch=sbActiveChannels[id];if(!ch)return;ch.volume=val;const bg=ch.def.baseGain;if((ch.def.type==='file'||ch.def.type==='url')&&ch.sound.audioEl){ch.sound.audioEl.volume=val/100;ch.sound.gainNode.gain.setTargetAtTime(bg,sbAudioCtx.currentTime,.02);}else{ch.sound.gainNode.gain.setTargetAtTime(bg*(val/100),sbAudioCtx.currentTime,.02);}}
function sbSetMaster(val){sbMasterVol=val/100;if(sbMasterGain)sbMasterGain.gain.setTargetAtTime(sbMasterVol*sbPersonalVol,sbAudioCtx.currentTime,.02);}
function sbSetPersonal(val){sbPersonalVol=val/100;localStorage.setItem('sbPersonalVol',sbPersonalVol.toString());if(sbMasterGain)sbMasterGain.gain.setTargetAtTime(sbMasterVol*sbPersonalVol,sbAudioCtx.currentTime,.02);}
function sbPlayAll(){sbGetAll().forEach(s=>{const t=document.querySelector(`.sb-tile[data-id="${s.id}"]`);if(t&&t.classList.contains('was-active')){sbStart(s.id);t.classList.remove('was-active');}});}
function sbStopAll(){Object.keys(sbActiveChannels).forEach(id=>{const t=document.querySelector(`.sb-tile[data-id="${id}"]`);if(t)t.classList.add('was-active');sbStop(id);});}

// ─── Upload & YouTube ───
function sbHandleFileUpload(files){
  Array.from(files).forEach(f=>{
    const r=new FileReader();
    r.onload=function(e){
      const id='custom_'+Date.now()+'_'+Math.random().toString(36).substr(2,5);
      const nm=f.name.replace(/\.[^.]+$/,'');
      sbShowAddDialog(nm,'custom',function(name,cat){
        sbCustomSounds.push({id,name,cat,type:'file',fileDataUrl:e.target.result,baseGain:0.5});
        sbRenderChannels();showNotif(`Added "${name}"`);
      });
    };r.readAsDataURL(f);
  });
}

// Universal add dialog: name + category in one popup
function sbShowAddDialog(defaultName,defaultCat,onConfirm){
  const cats=SB_CATEGORIES.filter(c=>c.id!=='all');
  const ov=document.createElement('div');ov.className='site-dialog-overlay';
  const d=document.createElement('div');d.className='site-dialog';d.style.maxWidth='400px';
  d.innerHTML=`<div class="site-dialog-title">Add Sound</div>
    <input type="text" class="site-dialog-input" id="sbAddName" value="${defaultName.replace(/"/g,'&quot;')}" placeholder="Sound name..." style="margin-bottom:10px;" />
    <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;padding:0 18px;">Category</div>
    <div class="sb-cat-picker">${cats.map(c=>`<button class="sb-cat-pick-btn${c.id===defaultCat?' selected':''}" data-cat="${c.id}">${c.label}</button>`).join('')}</div>
    <div class="site-dialog-actions">
      <button class="site-dialog-btn" id="sbAddCancel">Cancel</button>
      <button class="site-dialog-btn confirm" id="sbAddConfirm">Add</button>
    </div>`;
  ov.appendChild(d);
  document.body.appendChild(ov);
  let selectedCat=defaultCat;
  d.querySelectorAll('.sb-cat-pick-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      d.querySelectorAll('.sb-cat-pick-btn').forEach(b=>b.classList.remove('selected'));
      btn.classList.add('selected');selectedCat=btn.dataset.cat;
    });
  });
  const nameInput=d.querySelector('#sbAddName');
  nameInput.focus();nameInput.select();
  const close=()=>{ov.remove();};
  const confirm=()=>{const name=nameInput.value.trim()||defaultName;close();onConfirm(name,selectedCat);};
  d.querySelector('#sbAddConfirm').addEventListener('click',confirm);
  d.querySelector('#sbAddCancel').addEventListener('click',close);
  ov.addEventListener('click',(e)=>{if(e.target===ov)close();});
  nameInput.addEventListener('keydown',e=>{if(e.key==='Enter')confirm();if(e.key==='Escape')close();});
}

// ─── Freesound Browser ───
let sbFsPreviewAudio=null;

function sbOpenFreesoundBrowser(){
  if(sbYtPopupOpen)return;sbYtPopupOpen=true;
  const ov=document.createElement('div');ov.className='sb-yt-overlay';
  const pp=document.createElement('div');pp.className='sb-yt-popup sb-fs-browser';
  pp.innerHTML=`
    <div class="sb-fs-header">
      <h3>Browse Freesound</h3>
      <button class="sb-fs-close" id="sbFsClose">&times;</button>
    </div>
    <div class="sb-fs-key-row" id="sbFsKeyRow">
      <div style="font-size:11px;color:var(--text-muted);margin-bottom:6px;">
        Enter your free <a href="https://freesound.org/apiv2/apply/" target="_blank" style="color:var(--gold);">Freesound API key</a> to search
      </div>
      <div style="display:flex;gap:6px;">
        <input type="text" id="sbFsKeyInput" placeholder="Freesound API key..." value="${sbFreesoundKey}" style="flex:1;" />
        <button class="btn primary sm" id="sbFsKeySave">Save</button>
      </div>
    </div>
    <div class="sb-fs-search">
      <input type="text" id="sbFsQuery" placeholder="Search sounds... (e.g. tavern ambience, rain, dungeon)" />
      <button class="btn primary sm" id="sbFsSearchBtn">Search</button>
    </div>
    <div class="sb-fs-filters">
      <select id="sbFsDuration">
        <option value="">Any duration</option>
        <option value="0,30">Under 30s</option>
        <option value="30,120">30s – 2min</option>
        <option value="120,600" selected>2 – 10min</option>
        <option value="600,*">Over 10min</option>
      </select>
      <select id="sbFsSort">
        <option value="score">Relevance</option>
        <option value="rating_desc">Top rated</option>
        <option value="downloads_desc">Most downloaded</option>
        <option value="duration_desc">Longest first</option>
      </select>
    </div>
    <div class="sb-fs-results" id="sbFsResults">
      <div class="sb-fs-empty">Search for ambient sounds, music, and effects from Freesound's CC0 library</div>
    </div>
    <div class="sb-fs-paging hidden" id="sbFsPaging">
      <button class="btn secondary sm" id="sbFsPrev" disabled>← Prev</button>
      <span id="sbFsPageInfo" style="font-size:11px;color:var(--text-muted);"></span>
      <button class="btn secondary sm" id="sbFsNext" disabled>Next →</button>
    </div>`;
  document.body.appendChild(ov);document.body.appendChild(pp);
  ov.addEventListener('click',()=>{sbStopFsPreview();sbCloseYtPopup();});
  pp.querySelector('#sbFsClose').addEventListener('click',()=>{sbStopFsPreview();sbCloseYtPopup();});

  // Key management
  const keyRow=pp.querySelector('#sbFsKeyRow');
  if(sbFreesoundKey)keyRow.classList.add('sb-fs-key-saved');
  pp.querySelector('#sbFsKeySave').addEventListener('click',()=>{
    const k=pp.querySelector('#sbFsKeyInput').value.trim();
    if(!k){showNotif('Enter an API key');return;}
    sbFreesoundKey=k;localStorage.setItem('freesoundApiKey',k);
    keyRow.classList.add('sb-fs-key-saved');showNotif('API key saved');
  });

  // Search
  let fsPage=1,fsTotalPages=1;
  const doSearch=(page)=>{
    if(!sbFreesoundKey){showNotif('Set your Freesound API key first');keyRow.classList.remove('sb-fs-key-saved');return;}
    const q=pp.querySelector('#sbFsQuery').value.trim();
    if(!q)return;
    fsPage=page||1;
    const dur=pp.querySelector('#sbFsDuration').value;
    const sort=pp.querySelector('#sbFsSort').value;
    let filter='';
    if(dur){const parts=dur.split(',');filter=`duration:[${parts[0]} TO ${parts[1]==='*'?'*':parts[1]}]`;}
    const res=pp.querySelector('#sbFsResults');
    res.innerHTML='<div class="sb-fs-loading">Searching Freesound...</div>';
    const url=`https://freesound.org/apiv2/search/text/?query=${encodeURIComponent(q)}&fields=id,name,description,duration,previews,tags,avg_rating,num_downloads,username&page_size=12&page=${fsPage}&sort=${sort}${filter?'&filter='+encodeURIComponent(filter):''}&token=${sbFreesoundKey}`;
    fetch(url).then(r=>{if(!r.ok)throw new Error('API error '+r.status);return r.json();}).then(data=>{
      fsTotalPages=Math.ceil((data.count||0)/12);
      if(!data.results||!data.results.length){res.innerHTML='<div class="sb-fs-empty">No results found. Try different search terms.</div>';pp.querySelector('#sbFsPaging').classList.add('hidden');return;}
      res.innerHTML=data.results.map(s=>{
        const dur=s.duration?formatSbDuration(s.duration):'';
        const rating=s.avg_rating?'★'.repeat(Math.round(s.avg_rating)):'';
        const tags=(s.tags||[]).slice(0,4).join(', ');
        return`<div class="sb-fs-item" data-id="${s.id}">
          <div class="sb-fs-item-main">
            <div class="sb-fs-item-name">${s.name}</div>
            <div class="sb-fs-item-meta"><span>${dur}</span><span>${rating}</span><span>${s.username}</span></div>
            <div class="sb-fs-item-tags">${tags}</div>
          </div>
          <div class="sb-fs-item-actions">
            <button class="sb-fs-preview-btn" data-preview="${s.previews?.['preview-lq-mp3']||s.previews?.['preview-hq-mp3']||''}" title="Preview">▶</button>
            <button class="sb-fs-add-btn" data-id="${s.id}" data-name="${s.name.replace(/"/g,'&quot;')}" data-url="${s.previews?.['preview-hq-mp3']||s.previews?.['preview-lq-mp3']||''}" data-dur="${s.duration||0}" title="Add to library">+ Add</button>
          </div>
        </div>`;
      }).join('');
      // Paging
      const pg=pp.querySelector('#sbFsPaging');pg.classList.remove('hidden');
      pp.querySelector('#sbFsPageInfo').textContent=`Page ${fsPage} of ${fsTotalPages} (${data.count} results)`;
      pp.querySelector('#sbFsPrev').disabled=(fsPage<=1);
      pp.querySelector('#sbFsNext').disabled=(fsPage>=fsTotalPages);
      // Preview buttons
      res.querySelectorAll('.sb-fs-preview-btn').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const url=btn.dataset.preview;if(!url)return;
          if(sbFsPreviewAudio&&!sbFsPreviewAudio.paused){sbStopFsPreview();if(btn.classList.contains('previewing')){btn.classList.remove('previewing');btn.textContent='▶';return;}}
          res.querySelectorAll('.sb-fs-preview-btn').forEach(b=>{b.classList.remove('previewing');b.textContent='▶';});
          sbFsPreviewAudio=new Audio(url);sbFsPreviewAudio.volume=0.5;
          sbFsPreviewAudio.play().catch(()=>{});
          btn.classList.add('previewing');btn.textContent='⏸';
          sbFsPreviewAudio.addEventListener('ended',()=>{btn.classList.remove('previewing');btn.textContent='▶';});
        });
      });
      // Add buttons
      res.querySelectorAll('.sb-fs-add-btn').forEach(btn=>{
        btn.addEventListener('click',()=>{
          const name=btn.dataset.name,audioUrl=btn.dataset.url;
          if(!audioUrl){showNotif('No preview URL available');return;}
          const id='fs_'+btn.dataset.id+'_'+Date.now();
          if(sbCustomSounds.find(s=>s.audioUrl===audioUrl)){showNotif('Already in library');return;}
          sbCustomSounds.push({id,name,cat:'custom',type:'url',audioUrl,baseGain:0.5});
          btn.textContent='Added';btn.disabled=true;btn.style.color='var(--gold)';btn.style.borderColor='var(--gold)';
          sbRenderChannels();showNotif(`Added "${name}"`);
        });
      });
    }).catch(err=>{
      res.innerHTML=`<div class="sb-fs-empty" style="color:var(--danger);">Error: ${err.message}. Check your API key.</div>`;
    });
  };
  pp.querySelector('#sbFsSearchBtn').addEventListener('click',()=>doSearch(1));
  pp.querySelector('#sbFsQuery').addEventListener('keydown',e=>{if(e.key==='Enter')doSearch(1);});
  pp.querySelector('#sbFsPrev').addEventListener('click',()=>{if(fsPage>1)doSearch(fsPage-1);});
  pp.querySelector('#sbFsNext').addEventListener('click',()=>{if(fsPage<fsTotalPages)doSearch(fsPage+1);});
  pp.querySelector('#sbFsQuery').focus();
}

function sbStopFsPreview(){if(sbFsPreviewAudio){sbFsPreviewAudio.pause();sbFsPreviewAudio.currentTime=0;sbFsPreviewAudio=null;}}

function formatSbDuration(secs){
  const m=Math.floor(secs/60),s=Math.floor(secs%60);
  return m>0?`${m}:${s.toString().padStart(2,'0')}`:`${s}s`;
}
function sbOpenYoutubePopup(){if(sbYtPopupOpen)return;sbYtPopupOpen=true;const ov=document.createElement('div');ov.className='sb-yt-overlay';const pp=document.createElement('div');pp.className='sb-yt-popup';const catOpts=SB_CATEGORIES.filter(c=>c.id!=='all').map(c=>`<option value="${c.id}"${c.id==='custom'?' selected':''}>${c.label}</option>`).join('');pp.innerHTML=`<h3>Add YouTube Audio</h3><input type="text" id="sbYtUrl" placeholder="Paste YouTube URL..." /><input type="text" id="sbYtName" placeholder="Name (optional)" /><select id="sbYtCat" style="width:100%;padding:8px 10px;margin-bottom:10px;background:var(--bg-dark);border:1px solid var(--border-color);border-radius:var(--radius-sm);color:var(--text-secondary);font-size:12px;">${catOpts}</select><div class="sb-yt-actions"><button class="btn secondary sm" id="sbYtCancel">Cancel</button><button class="btn primary sm" id="sbYtAdd">Add</button></div>`;document.body.appendChild(ov);document.body.appendChild(pp);ov.addEventListener('click',sbCloseYtPopup);pp.querySelector('#sbYtCancel').addEventListener('click',sbCloseYtPopup);pp.querySelector('#sbYtAdd').addEventListener('click',()=>{const url=pp.querySelector('#sbYtUrl').value.trim(),name=pp.querySelector('#sbYtName').value.trim(),cat=pp.querySelector('#sbYtCat').value;if(!url)return;const m=url.match(/(?:v=|\/embed\/|youtu\.be\/|\/v\/|\/watch\?.*v=)([a-zA-Z0-9_-]{11})/);if(!m){showNotif('Could not parse YouTube URL');return;}const vid=m[1],dn=name||'YouTube: '+vid,id='yt_'+Date.now()+'_'+vid;sbCustomSounds.push({id,name:dn,cat,type:'youtube',ytVideoId:vid,baseGain:0.5});sbCloseYtPopup();sbRenderChannels();showNotif(`Added "${dn}"`);});pp.querySelector('#sbYtUrl').focus();}
function sbCloseYtPopup(){sbYtPopupOpen=false;document.querySelector('.sb-yt-overlay')?.remove();document.querySelector('.sb-yt-popup')?.remove();}

// ─── MultiView Integration (kept from previous) ───
function sbOpenMvConnect(){
  // Use existing auth to browse playlists directly (no separate login needed)
  const token = localStorage.getItem('mv_token');
  if (!token) { showNotif('Please log in to import from your playlists'); return; }
  if (sbYtPopupOpen) return;
  sbYtPopupOpen = true;

  // Create modal matching video room ImportPlaylistModal design
  const ov = document.createElement('div');
  ov.className = 'popup-overlay';
  ov.style.cssText = 'display:flex;align-items:center;justify-content:center;position:fixed;inset:0;z-index:10000;background:rgba(0,0,0,0.7);';
  
  const modal = document.createElement('div');
  modal.className = 'popup-modal';
  modal.style.cssText = 'width:520px;max-height:75vh;display:flex;flex-direction:column;background:var(--bg-dark,#0a0a0a);border:1px solid var(--border-color,#252015);border-radius:12px;box-shadow:0 24px 80px rgba(0,0,0,0.6);';
  
  modal.innerHTML = `
    <div class="popup-header" style="flex-shrink:0;padding:16px 20px;border-bottom:1px solid var(--border-color,#252015);display:flex;align-items:center;justify-content:space-between;">
      <h3 style="font-family:Cinzel,serif;font-size:16px;color:var(--gold,#d4a824);margin:0;">Import from My Rooms</h3>
      <button class="icon-btn" id="sbImportClose" style="background:none;border:none;color:var(--text-muted);cursor:pointer;font-size:18px;padding:4px 8px;">&times;</button>
    </div>
    <div id="sbImportBody" style="flex:1;overflow-y:auto;padding:16px 20px;">
      <div style="text-align:center;color:var(--text-muted);padding:24px;font-size:13px;">Loading your playlists...</div>
    </div>
    <div style="flex-shrink:0;padding:12px 20px;border-top:1px solid var(--border-color,#252015);display:flex;justify-content:flex-end;gap:8px;">
      <button class="btn secondary sm" id="sbImportCancel">Close</button>
    </div>
  `;
  
  ov.appendChild(modal);
  document.body.appendChild(ov);
  
  function closeModal() { ov.remove(); sbYtPopupOpen = false; }
  ov.addEventListener('click', e => { if (e.target === ov) closeModal(); });
  modal.querySelector('#sbImportClose').addEventListener('click', closeModal);
  modal.querySelector('#sbImportCancel').addEventListener('click', closeModal);
  
  // Fetch playlists
  fetch('/api/rooms/my-playlists', {
    headers: { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' }
  })
  .then(r => r.json())
  .then(d => {
    const rooms = d.rooms || [];
    const body = modal.querySelector('#sbImportBody');
    
    if (!rooms.length) {
      body.innerHTML = '<div style="text-align:center;padding:32px 16px;"><p style="color:var(--text-secondary);font-size:13px;margin:0 0 6px;">No rooms with playlists found.</p><p style="color:var(--text-muted);font-size:11px;margin:0;">Create playlists in your video rooms to import songs here.</p></div>';
      return;
    }
    
    body.innerHTML = '<p style="font-size:11px;color:var(--text-muted);margin:0 0 12px;">Select songs from your video room playlists to add as soundscape audio:</p><div id="sbImportRooms"></div>';
    const container = body.querySelector('#sbImportRooms');
    
    rooms.forEach(rm => {
      const pls = rm.playlists || [];
      if (!pls.length) return;
      
      const roomEl = document.createElement('div');
      roomEl.style.cssText = 'margin-bottom:4px;border:1px solid var(--border-color,#252015);border-radius:8px;overflow:hidden;';
      
      // Room header
      const roomHeader = document.createElement('div');
      roomHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 14px;cursor:pointer;background:var(--bg-medium,#111);transition:background 0.15s;';
      roomHeader.innerHTML = `<div style="display:flex;align-items:center;gap:8px;"><span class="sb-imp-arrow" style="color:var(--text-muted);font-size:10px;transition:transform 0.2s;">&#9656;</span><span style="font-size:13px;font-weight:600;color:var(--text-primary,#f5ede0);">${rm.name || 'Room'}</span></div><span style="font-size:11px;color:var(--text-muted);">${pls.length} playlist${pls.length !== 1 ? 's' : ''}</span>`;
      roomHeader.addEventListener('mouseenter', () => { roomHeader.style.background = 'var(--bg-light,#181818)'; });
      roomHeader.addEventListener('mouseleave', () => { roomHeader.style.background = 'var(--bg-medium,#111)'; });
      
      const roomBody = document.createElement('div');
      roomBody.style.cssText = 'display:none;border-top:1px solid var(--border-color,#252015);';
      
      roomHeader.addEventListener('click', () => {
        const vis = roomBody.style.display !== 'none';
        roomBody.style.display = vis ? 'none' : 'block';
        roomHeader.querySelector('.sb-imp-arrow').innerHTML = vis ? '&#9656;' : '&#9662;';
      });
      
      // Playlists
      pls.forEach(pl => {
        const vs = pl.videos || [];
        const plEl = document.createElement('div');
        plEl.style.cssText = 'border-bottom:1px solid rgba(255,255,255,0.03);';
        
        const plHeader = document.createElement('div');
        plHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:8px 14px 8px 28px;cursor:pointer;transition:background 0.15s;';
        plHeader.innerHTML = `<div style="display:flex;align-items:center;gap:6px;"><span class="sb-imp-pl-arrow" style="color:var(--text-muted);font-size:9px;">&#9656;</span><span style="font-size:12px;color:var(--text-secondary,#a89880);">${pl.name || 'Playlist'}</span></div><span style="font-size:10px;color:var(--text-muted);">${vs.length} song${vs.length !== 1 ? 's' : ''}</span>`;
        plHeader.addEventListener('mouseenter', () => { plHeader.style.background = 'rgba(255,255,255,0.02)'; });
        plHeader.addEventListener('mouseleave', () => { plHeader.style.background = 'transparent'; });
        
        const plBody = document.createElement('div');
        plBody.style.cssText = 'display:none;padding:2px 0;';
        
        plHeader.addEventListener('click', () => {
          const vis = plBody.style.display !== 'none';
          plBody.style.display = vis ? 'none' : 'block';
          plHeader.querySelector('.sb-imp-pl-arrow').innerHTML = vis ? '&#9656;' : '&#9662;';
        });
        
        // Individual songs
        vs.forEach(v => {
          const songEl = document.createElement('div');
          songEl.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:5px 14px 5px 48px;transition:background 0.1s;';
          songEl.addEventListener('mouseenter', () => { songEl.style.background = 'rgba(212,168,36,0.04)'; });
          songEl.addEventListener('mouseleave', () => { songEl.style.background = 'transparent'; });
          
          const titleSpan = document.createElement('span');
          titleSpan.style.cssText = 'flex:1;font-size:11px;color:var(--text-secondary,#a89880);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding-right:8px;';
          titleSpan.textContent = v.title || v.url || 'Untitled';
          
          const addBtn = document.createElement('button');
          addBtn.style.cssText = 'flex-shrink:0;padding:3px 10px;border:1px solid var(--border-color,#252015);border-radius:6px;background:none;color:var(--text-muted,#605545);cursor:pointer;font-size:10px;transition:all 0.15s;';
          addBtn.textContent = '+ Add';
          addBtn.addEventListener('mouseenter', () => { if (!addBtn.disabled) { addBtn.style.borderColor = 'var(--gold,#d4a824)'; addBtn.style.color = 'var(--gold,#d4a824)'; } });
          addBtn.addEventListener('mouseleave', () => { if (!addBtn.disabled) { addBtn.style.borderColor = 'var(--border-color,#252015)'; addBtn.style.color = 'var(--text-muted,#605545)'; } });
          
          addBtn.addEventListener('click', () => {
            const url = v.url || '';
            const title = v.title || '';
            const m = url.match(/(?:v=|\/embed\/|youtu\.be\/|\/v\/|\/watch\?.*v=)([a-zA-Z0-9_-]{11})/);
            if (!m) { showNotif('Not a YouTube video'); return; }
            const vid = m[1], id = 'mv_' + Date.now() + '_' + vid;
            if (sbCustomSounds.find(s => s.ytVideoId === vid)) { showNotif('Already added'); return; }
            sbCustomSounds.push({ id, name: title || 'MV: ' + vid, cat: 'custom', type: 'youtube', ytVideoId: vid, baseGain: 0.5 });
            addBtn.textContent = 'Added';
            addBtn.disabled = true;
            addBtn.style.color = 'var(--gold,#d4a824)';
            addBtn.style.borderColor = 'var(--gold,#d4a824)';
            addBtn.style.opacity = '0.6';
            sbRenderChannels();
          });
          
          songEl.appendChild(titleSpan);
          songEl.appendChild(addBtn);
          plBody.appendChild(songEl);
        });
        
        plEl.appendChild(plHeader);
        plEl.appendChild(plBody);
        roomBody.appendChild(plEl);
      });
      
      roomEl.appendChild(roomHeader);
      roomEl.appendChild(roomBody);
      container.appendChild(roomEl);
    });
  })
  .catch(e => {
    modal.querySelector('#sbImportBody').innerHTML = `<div style="text-align:center;color:var(--danger,#ef4444);padding:24px;font-size:12px;">Failed to load playlists: ${e.message}</div>`;
  });
}

// Legacy alias
async function sbOpenMvBrowse() { sbOpenMvConnect(); }

// ─── Remove Custom ───
function sbRemoveCustom(id){sbStop(id);sbCustomSounds=sbCustomSounds.filter(s=>s.id!==id);sbSoundscapes.forEach(sc=>{delete sc.mix[id];});sbPlaylists.forEach(pl=>{pl.soundIds=pl.soundIds.filter(sid=>sid!==id);});sbRenderChannels();sbRenderSidebar();showNotif('Sound removed');}

// ─── Soundscapes (Save/Load/Delete) ───
async function sbSaveSoundscape(){const name=await sitePrompt('Save Soundscape','Enter a name for this soundscape...');if(!name)return;const mix={};Object.entries(sbActiveChannels).forEach(([id,ch])=>{mix[id]={volume:ch.volume};});if(!Object.keys(mix).length){showNotif('No active sounds to save');return;}const i=sbSoundscapes.findIndex(s=>s.name===name);if(i>=0){sbSoundscapes[i].mix=mix;sbSoundscapes[i].masterVol=sbMasterVol*100;sbActiveScapeId=sbSoundscapes[i].id;}else{const newId='sc_'+Date.now();sbSoundscapes.push({id:newId,name,mix,masterVol:sbMasterVol*100});sbActiveScapeId=newId;}sbActivePlaylistId=null;sbRenderSidebar();showNotif(`Saved "${name}"`);}
function sbUpdateActiveVolumes(){if(sbActiveScapeId){const sc=sbSoundscapes.find(s=>s.id===sbActiveScapeId);if(sc){Object.entries(sbActiveChannels).forEach(([id,ch])=>{sc.mix[id]={volume:ch.volume};});sc.masterVol=sbMasterVol*100;sbRenderSidebar();showNotif('Soundscape volumes updated');return;}}if(sbActivePlaylistId){const pl=sbPlaylists.find(p=>p.id===sbActivePlaylistId);if(pl){if(!pl.volumes)pl.volumes={};Object.entries(sbActiveChannels).forEach(([id,ch])=>{if(pl.soundIds.includes(id))pl.volumes[id]=ch.volume;});sbRenderSidebar();showNotif('Playlist volumes updated');return;}}showNotif('No active soundscape or playlist to update');}
function sbLoadSoundscape(scId){const sc=sbSoundscapes.find(s=>s.id===scId);if(!sc)return;Object.keys(sbActiveChannels).forEach(id=>sbStop(id));if(sc.masterVol!==undefined){sbMasterVol=sc.masterVol/100;document.getElementById('sbMasterVol').value=sc.masterVol;document.getElementById('sbMasterVolVal').textContent=Math.round(sc.masterVol)+'%';if(sbMasterGain)sbMasterGain.gain.value=sbMasterVol;}Object.entries(sc.mix).forEach(([id,cfg])=>{if(!sbGetAll().find(s=>s.id===id))return;sbActiveChannels[id]={volume:cfg.volume};sbStart(id);const sl=document.querySelector(`.sb-tile[data-id="${id}"] .sb-tile-vol`);const vl=document.querySelector(`.sb-tile[data-id="${id}"] .sb-tile-vol-val`);if(sl)sl.value=cfg.volume;if(vl)vl.textContent=cfg.volume+'%';});sbActiveScapeId=scId;sbActivePlaylistId=null;sbRenderSidebar();showNotif(`Loaded "${sc.name}"`);}

async function sbDeleteSoundscape(scId){const sc=sbSoundscapes.find(s=>s.id===scId);if(!sc)return;const ok=await siteConfirm('Delete Soundscape',`Are you sure you want to delete "${sc.name}"? This cannot be undone.`,'Delete',true);if(!ok)return;sbSoundscapes=sbSoundscapes.filter(s=>s.id!==scId);if(sbActiveScapeId===scId)sbActiveScapeId=null;sbRenderSidebar();showNotif(`Deleted "${sc.name}"`);}

// ─── Playlists (Collections of Sound IDs) ───
async function sbAddPlaylist(){const name=await sitePrompt('New Playlist','Enter a name for this playlist...');if(!name)return;sbPlaylists.push({id:'pl_'+Date.now(),name,soundIds:[]});sbRenderSidebar();showNotif(`Created "${name}"`);}
async function sbDeletePlaylist(plId){const pl=sbPlaylists.find(p=>p.id===plId);if(!pl)return;const ok=await siteConfirm('Delete Playlist',`Are you sure you want to delete "${pl.name}"? This cannot be undone.`,'Delete',true);if(!ok)return;sbPlaylists=sbPlaylists.filter(p=>p.id!==plId);sbRenderSidebar();showNotif(`Deleted "${pl.name}"`);}
function sbAddToPlaylist(plId,soundId){const pl=sbPlaylists.find(p=>p.id===plId);if(!pl)return;if(!pl.volumes)pl.volumes={};if(!pl.soundIds.includes(soundId)){pl.soundIds.push(soundId);const ch=sbActiveChannels[soundId];pl.volumes[soundId]=ch?.volume??70;sbRenderSidebar();showNotif('Added to playlist');}else{showNotif('Already in playlist');}}
function sbRemoveFromPlaylist(plId,soundId){const pl=sbPlaylists.find(p=>p.id===plId);if(!pl)return;pl.soundIds=pl.soundIds.filter(id=>id!==soundId);sbRenderSidebar();}
function sbPlayPlaylist(plId){const pl=sbPlaylists.find(p=>p.id===plId);if(!pl)return;Object.keys(sbActiveChannels).forEach(id=>sbStop(id));if(!pl.volumes)pl.volumes={};pl.soundIds.forEach(id=>{const vol=pl.volumes[id]??70;sbActiveChannels[id]={volume:vol};sbStart(id);const sl=document.querySelector(`.sb-tile[data-id="${id}"] .sb-tile-vol`);const vl=document.querySelector(`.sb-tile[data-id="${id}"] .sb-tile-vol-val`);if(sl)sl.value=vol;if(vl)vl.textContent=vol+'%';});sbActivePlaylistId=plId;sbRenderSidebar();showNotif(`Playing "${pl.name}"`);}

// ─── Sidebar Rendering ───
function sbRenderSidebar(){
  const scList=document.getElementById('sbScapeList');
  const plList=document.getElementById('sbPlaylistList');
  if(!scList||!plList)return;
  const allSounds=sbGetAll();
  const getName=(id)=>{const s=allSounds.find(x=>x.id===id);return s?s.name:id;};
  // Soundscapes
  if(!sbSoundscapes.length){scList.innerHTML='<div class="sb-sidebar-empty">No saved soundscapes</div>';}
  else{scList.innerHTML=sbSoundscapes.map(sc=>{const cnt=Object.keys(sc.mix).length;const active=sc.id===sbActiveScapeId?' active':'';
    let detail='';
    Object.entries(sc.mix).forEach(([id,cfg])=>{
      detail+=`<div class="sb-mix-row" data-sc="${sc.id}" data-sid="${id}"><span class="sb-mix-name">${getName(id)}</span><input type="range" class="sb-mix-vol" min="0" max="100" value="${cfg.volume}" /><span class="sb-mix-val">${cfg.volume}%</span></div>`;
    });
    return`<div class="sb-sidebar-item${active}" data-sc="${sc.id}"><div class="sb-si-header"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${sc.name}</span><span class="sb-si-count">${cnt}</span><span class="sb-si-actions"><button class="sb-si-btn sb-si-play" data-sc="${sc.id}" title="Load">▶</button><button class="sb-si-btn" data-scupd="${sc.id}" title="Save current volumes">↻</button><button class="sb-si-btn" data-scdel="${sc.id}" title="Delete">×</button></span></div><div class="sb-mix-detail" style="display:none;">${detail||'<div class="sb-sidebar-empty">Empty mix</div>'}</div></div>`;
  }).join('');}
  // Soundscape events
  scList.querySelectorAll('.sb-si-header').forEach(hdr=>{hdr.addEventListener('click',e=>{if(e.target.closest('.sb-si-btn'))return;const item=hdr.closest('.sb-sidebar-item');const det=item.querySelector('.sb-mix-detail');if(det)det.style.display=det.style.display==='none'?'block':'none';});});
  scList.querySelectorAll('.sb-si-play[data-sc]').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();sbLoadSoundscape(btn.dataset.sc);});});
  scList.querySelectorAll('[data-scdel]').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();sbDeleteSoundscape(btn.dataset.scdel);});});
  scList.querySelectorAll('[data-scupd]').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();const sc=sbSoundscapes.find(s=>s.id===btn.dataset.scupd);if(!sc)return;Object.entries(sbActiveChannels).forEach(([id,ch])=>{sc.mix[id]={volume:ch.volume};});sc.masterVol=sbMasterVol*100;sbRenderSidebar();showNotif(`Updated "${sc.name}" volumes`);});});
  scList.querySelectorAll('.sb-mix-vol').forEach(sl=>{sl.addEventListener('input',()=>{const row=sl.closest('.sb-mix-row');const scId=row.dataset.sc,sid=row.dataset.sid;const v=parseInt(sl.value);row.querySelector('.sb-mix-val').textContent=v+'%';const sc=sbSoundscapes.find(s=>s.id===scId);if(sc&&sc.mix[sid])sc.mix[sid].volume=v;if(sbActiveChannels[sid])sbSetVol(sid,v);});});
  // Playlists
  if(!sbPlaylists.length){plList.innerHTML='<div class="sb-sidebar-empty">No playlists yet</div>';}
  else{plList.innerHTML=sbPlaylists.map(pl=>{const cnt=pl.soundIds.length;const active=pl.id===sbActivePlaylistId?' active':'';if(!pl.volumes)pl.volumes={};
    let detail='';
    pl.soundIds.forEach(id=>{
      const vol=pl.volumes[id]??70;
      detail+=`<div class="sb-mix-row" data-pl="${pl.id}" data-sid="${id}"><span class="sb-mix-name">${getName(id)}</span><input type="range" class="sb-mix-vol" min="0" max="100" value="${vol}" /><span class="sb-mix-val">${vol}%</span><button class="sb-mix-rm" data-plrm="${pl.id}" data-sidrm="${id}" title="Remove">×</button></div>`;
    });
    return`<div class="sb-sidebar-item${active}" data-pl="${pl.id}"><div class="sb-si-header"><span style="flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${pl.name}</span><span class="sb-si-count">${cnt}</span><span class="sb-si-actions"><button class="sb-si-btn sb-si-play" data-plplay="${pl.id}" title="Play all">▶</button><button class="sb-si-btn" data-plupd="${pl.id}" title="Save current volumes">↻</button><button class="sb-si-btn" data-pldel="${pl.id}" title="Delete">×</button></span></div><div class="sb-mix-detail" style="display:none;">${detail||'<div class="sb-sidebar-empty">No sounds</div>'}</div></div>`;
  }).join('');}
  // Playlist events
  plList.querySelectorAll('.sb-si-header').forEach(hdr=>{hdr.addEventListener('click',e=>{if(e.target.closest('.sb-si-btn'))return;const item=hdr.closest('.sb-sidebar-item');const det=item.querySelector('.sb-mix-detail');if(det)det.style.display=det.style.display==='none'?'block':'none';});});
  plList.querySelectorAll('[data-plplay]').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();sbPlayPlaylist(btn.dataset.plplay);});});
  plList.querySelectorAll('[data-pldel]').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();sbDeletePlaylist(btn.dataset.pldel);});});
  plList.querySelectorAll('[data-plupd]').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();const pl=sbPlaylists.find(p=>p.id===btn.dataset.plupd);if(!pl)return;if(!pl.volumes)pl.volumes={};Object.entries(sbActiveChannels).forEach(([id,ch])=>{if(pl.soundIds.includes(id))pl.volumes[id]=ch.volume;});sbRenderSidebar();showNotif(`Updated "${pl.name}" volumes`);});});
  plList.querySelectorAll('.sb-mix-vol').forEach(sl=>{sl.addEventListener('input',()=>{const row=sl.closest('.sb-mix-row');const plId=row.dataset.pl,sid=row.dataset.sid;const v=parseInt(sl.value);row.querySelector('.sb-mix-val').textContent=v+'%';const pl=sbPlaylists.find(p=>p.id===plId);if(pl){if(!pl.volumes)pl.volumes={};pl.volumes[sid]=v;}if(sbActiveChannels[sid])sbSetVol(sid,v);});});
  plList.querySelectorAll('.sb-mix-rm').forEach(btn=>{btn.addEventListener('click',e=>{e.stopPropagation();sbRemoveFromPlaylist(btn.dataset.plrm,btn.dataset.sidrm);});});
}

// ─── Tile Context Menu: Add to Playlist ───
function sbShowTileMenu(e,soundId){
  e.preventDefault();e.stopPropagation();
  closeAllContextMenus();
  const def=sbGetAll().find(s=>s.id===soundId);if(!def)return;
  const menu=document.createElement('div');
  menu.className='context-menu';menu.style.left=Math.min(e.clientX,window.innerWidth-180)+'px';menu.style.top=Math.min(e.clientY,window.innerHeight-200)+'px';

  let html='';
  // Rename
  html+=`<div class="context-menu-item" data-action="rename">Rename</div>`;
  // Change category
  html+=`<div class="context-menu-item" data-action="category">Change Category</div>`;
  // Divider
  if(sbPlaylists.length) html+=`<div style="height:1px;background:var(--border-color);margin:4px 0;"></div>`;
  // Playlists
  if(sbPlaylists.length){
    html+=`<div class="context-menu-label" style="padding:4px 10px;font-size:10px;color:var(--text-muted);text-transform:uppercase;">Add to playlist</div>`;
    html+=sbPlaylists.map(pl=>`<div class="context-menu-item" data-action="playlist" data-pl="${pl.id}">${pl.name}</div>`).join('');
  }
  menu.innerHTML=html;
  document.body.appendChild(menu);

  menu.querySelectorAll('.context-menu-item').forEach(item=>{
    item.addEventListener('click',()=>{
      const action=item.dataset.action;
      menu.remove();
      if(action==='rename') sbRenameTile(soundId);
      else if(action==='category') sbChangeTileCategory(soundId);
      else if(action==='playlist') sbAddToPlaylist(item.dataset.pl,soundId);
    });
  });
  setTimeout(()=>document.addEventListener('click',function rm(){menu.remove();document.removeEventListener('click',rm);},{once:true}),10);
}

function sbRenameTile(soundId){
  const def=sbCustomSounds.find(s=>s.id===soundId)||SB_SOUNDS.find(s=>s.id===soundId);
  if(!def)return;
  sitePrompt('Rename Sound','Enter a new name...',def.name).then(name=>{
    if(!name)return;
    def.name=name;
    sbRenderChannels();showNotif(`Renamed to "${name}"`);
  });
}

function sbChangeTileCategory(soundId){
  const def=sbCustomSounds.find(s=>s.id===soundId)||SB_SOUNDS.find(s=>s.id===soundId);
  if(!def)return;
  const cats=SB_CATEGORIES.filter(c=>c.id!=='all');
  const ov=document.createElement('div');ov.className='site-dialog-overlay';
  const d=document.createElement('div');d.className='site-dialog';d.style.maxWidth='380px';
  d.innerHTML=`<div class="site-dialog-title">Change Category</div>
    <div style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;padding:0 18px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${def.name}</div>
    <div class="sb-cat-picker">${cats.map(c=>`<button class="sb-cat-pick-btn${c.id===def.cat?' selected':''}" data-cat="${c.id}">${c.label}</button>`).join('')}</div>
    <div class="site-dialog-actions"><button class="site-dialog-btn" id="sbCatClose">Cancel</button></div>`;
  ov.appendChild(d);
  document.body.appendChild(ov);
  const close=()=>{ov.remove();};
  d.querySelectorAll('.sb-cat-pick-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      def.cat=btn.dataset.cat;
      close();sbRenderChannels();showNotif(`Moved to "${btn.textContent}"`);
    });
  });
  d.querySelector('#sbCatClose').addEventListener('click',close);
  ov.addEventListener('click',(e)=>{if(e.target===ov)close();});
}

// ─── UI Rendering ───
function sbRenderChannels(){
  const c=document.getElementById('sbChannels');if(!c)return;c.innerHTML='';
  const all=sbGetAll();const sounds=sbCurrentCat==='all'?all:all.filter(s=>s.cat===sbCurrentCat);
  if(!all.length){c.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:50px 20px;font-size:13px;"><div style="font-size:24px;margin-bottom:12px;">🎵</div><div style="margin-bottom:6px;">Your sound library is empty</div><div style="font-size:11px;">Use <strong>Browse</strong> to search Freesound, <strong>Upload</strong> audio files, or add <strong>YouTube</strong> audio</div></div>';return;}
  if(!sounds.length){c.innerHTML='<div style="grid-column:1/-1;text-align:center;color:var(--text-muted);padding:40px;font-size:13px;">No sounds in this category</div>';return;}
  sounds.forEach(def=>{const isP=!!sbActiveChannels[def.id]?.playing;const vol=sbActiveChannels[def.id]?.volume??70;
    const t=document.createElement('div');t.className=`sb-tile${isP?' playing':''}${def.type==='youtube'?' yt-tile':''}`;t.dataset.id=def.id;
    let badge='';if(def.type==='file')badge='<span class="sb-tile-type">File</span>';else if(def.type==='youtube')badge='<span class="sb-tile-type">YT</span>';else if(def.type==='url')badge='<span class="sb-tile-type">Web</span>';
    t.innerHTML=`<div class="sb-tile-header"><span class="sb-tile-name" title="${def.name}">${def.name}</span>${badge}<span class="sb-tile-cat">${def.cat}</span><button class="sb-tile-remove" title="Remove">&times;</button></div><div class="sb-tile-controls"><button class="sb-tile-play" title="${isP?'Stop':'Play'}">${isP?'<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>':'<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>'}</button><input type="range" class="sb-tile-vol" min="0" max="100" value="${vol}" /><span class="sb-tile-vol-val">${vol}%</span></div>`;
    t.querySelector('.sb-tile-play').addEventListener('click',()=>sbToggle(def.id));
    const sl=t.querySelector('.sb-tile-vol'),vl=t.querySelector('.sb-tile-vol-val');
    sl.addEventListener('input',()=>{const v=parseInt(sl.value);vl.textContent=v+'%';if(sbActiveChannels[def.id])sbSetVol(def.id,v);});
    t.querySelector('.sb-tile-remove')?.addEventListener('click',e=>{e.stopPropagation();sbRemoveCustom(def.id);});
    t.addEventListener('contextmenu',e=>sbShowTileMenu(e,def.id));
    c.appendChild(t);
  });
}

function sbUpdateTile(id){const t=document.querySelector(`.sb-tile[data-id="${id}"]`);if(!t)return;const isP=!!sbActiveChannels[id]?.playing;t.classList.toggle('playing',isP);const b=t.querySelector('.sb-tile-play');if(b){b.innerHTML=isP?'<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><rect x="4" y="4" width="16" height="16" rx="2"/></svg>':'<svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor"><polygon points="5,3 19,12 5,21"/></svg>';}}

// ─── Init ───
function initSoundboard(){
  document.getElementById('sbPlayAll')?.addEventListener('click',sbPlayAll);
  document.getElementById('sbStopAll')?.addEventListener('click',sbStopAll);
  document.getElementById('sbMasterVol')?.addEventListener('input',e=>{const v=parseInt(e.target.value);document.getElementById('sbMasterVolVal').textContent=v+'%';sbSetMaster(v);});
  document.getElementById('sbPersonalVol')?.addEventListener('input',e=>{const v=parseInt(e.target.value);document.getElementById('sbPersonalVolVal').textContent=v+'%';sbSetPersonal(v);});
  // Init personal volume from localStorage
  const pvSlider=document.getElementById('sbPersonalVol'),pvVal=document.getElementById('sbPersonalVolVal');
  if(pvSlider){pvSlider.value=Math.round(sbPersonalVol*100);if(pvVal)pvVal.textContent=Math.round(sbPersonalVol*100)+'%';}
  document.getElementById('sbScapeSave')?.addEventListener('click',sbSaveSoundscape);
  document.getElementById('sbPlaylistAdd')?.addEventListener('click',sbAddPlaylist);
  document.getElementById('sbUploadBtn')?.addEventListener('click',()=>document.getElementById('sbFileInput')?.click());
  document.getElementById('sbFileInput')?.addEventListener('change',e=>{if(e.target.files.length)sbHandleFileUpload(e.target.files);e.target.value='';});
  document.getElementById('sbYoutubeBtn')?.addEventListener('click',sbOpenYoutubePopup);
  document.getElementById('sbMvConnectBtn')?.addEventListener('click',sbOpenMvConnect);
  document.getElementById('sbBrowseBtn')?.addEventListener('click',sbOpenFreesoundBrowser);
  document.querySelectorAll('.sb-cat-btn').forEach(btn=>{btn.addEventListener('click',()=>{document.querySelectorAll('.sb-cat-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');sbCurrentCat=btn.dataset.cat;sbRenderChannels();});});
  sbRenderChannels();sbRenderSidebar();
}

// ============================================
// State Bridge for Sync
// ============================================

window.craftGetState = function() {
  // Save current chapter content + indent/justify state before serializing
  if (typeof saveCurrentChapter === 'function') saveCurrentChapter();
  return {
    boards: JSON.parse(JSON.stringify(boards)),
    currentBoardId: currentBoardId,
    maps: JSON.parse(JSON.stringify(maps)),
    currentMapId: currentMapId,
    chapters: JSON.parse(JSON.stringify(chapters)),
    chapterFolders: JSON.parse(JSON.stringify(chapterFolders)),
    currentChapterId: currentChapterId,
    associations: JSON.parse(JSON.stringify(associations)),
    destinationMarkers: JSON.parse(JSON.stringify(destinationMarkers)),
    currentView: currentView,
    diceHistory: JSON.parse(JSON.stringify(diceHistory)),
    viewSettings: viewSettings ? JSON.parse(JSON.stringify(viewSettings)) : null,
    // Timeline
    timelines: JSON.parse(JSON.stringify(timelines)),
    currentTimelineId: currentTimelineId,
    // Combat
    combatants: JSON.parse(JSON.stringify(combatants)),
    combatRound: combatRound,
    combatTurnIndex: combatTurnIndex,
    combatActive: combatActive,
    savedEncounters: JSON.parse(JSON.stringify(savedEncounters)),
    // Factions
    factions: JSON.parse(JSON.stringify(factions)),
    contacts: JSON.parse(JSON.stringify(contacts)),
    organizations: JSON.parse(JSON.stringify(organizations)),
    facCustomTables: JSON.parse(JSON.stringify(window._facCustomTables || { factions: [], contacts: [], orgs: [] })),
    // Mind Map
    mmNodes: JSON.parse(JSON.stringify(mmNodes)),
    mmEdges: JSON.parse(JSON.stringify(mmEdges)),
    // Soundscape
    sbSoundscapes: JSON.parse(JSON.stringify(sbSoundscapes)),
    sbPlaylists: JSON.parse(JSON.stringify(sbPlaylists)),
    sbCustomSounds: sbCustomSounds.filter(s => s.type !== 'file').map(s => JSON.parse(JSON.stringify(s))),
    sbActiveMix: (function() {
      try {
        var mix = {};
        Object.entries(sbActiveChannels).forEach(function([id, ch]) {
          if (ch && ch.playing) mix[id] = { volume: ch.volume };
        });
        return mix;
      } catch(e) { return {}; }
    })(),
    sbMasterVol: Math.round(sbMasterVol * 100),
  };
};

window.craftSetState = function(state, skipRender) {
  if (!state) return;
  
  // Core data - currentView and viewSettings are NEVER synced (local only)
  if (state.boards) boards = state.boards;
  if (state.currentBoardId) currentBoardId = state.currentBoardId;
  if (state.maps) maps = state.maps;
  if (state.currentMapId) currentMapId = state.currentMapId;
  if (state.chapters) chapters = state.chapters;
  if (state.chapterFolders) chapterFolders = state.chapterFolders;
  if (state.currentChapterId) currentChapterId = state.currentChapterId;
  if (state.associations) associations = state.associations;
  if (state.destinationMarkers) destinationMarkers = state.destinationMarkers;
  if (state.diceHistory) diceHistory = state.diceHistory;
  
  // Timeline
  if (state.timelines) timelines = state.timelines;
  if (state.currentTimelineId !== undefined) currentTimelineId = state.currentTimelineId;
  
  // Combat
  if (state.combatants) combatants = state.combatants;
  if (state.combatRound !== undefined) combatRound = state.combatRound;
  if (state.combatTurnIndex !== undefined) combatTurnIndex = state.combatTurnIndex;
  if (state.combatActive !== undefined) combatActive = state.combatActive;
  if (state.savedEncounters) savedEncounters = state.savedEncounters;
  
  // Factions
  if (state.factions) factions = state.factions;
  if (state.contacts) contacts = state.contacts;
  if (state.organizations) organizations = state.organizations;
  if (state.facCustomTables) window._facCustomTables = state.facCustomTables;
  
  // Mind Map
  if (state.mmNodes) mmNodes = state.mmNodes;
  if (state.mmEdges) mmEdges = state.mmEdges;
  
  // Soundscape data
  if (state.sbSoundscapes) sbSoundscapes = state.sbSoundscapes;
  if (state.sbPlaylists) sbPlaylists = state.sbPlaylists;
  if (state.sbCustomSounds) {
    const localFiles = sbCustomSounds.filter(s => s.type === 'file');
    const synced = state.sbCustomSounds || [];
    sbCustomSounds = [...localFiles, ...synced];
  }
  
  // Sound playback sync (try/catch to never break rendering)
  try {
    if (state.sbActiveMix !== undefined && !window.craftIsOwner) {
      const mix = state.sbActiveMix || {};
      const currentIds = new Set(Object.keys(sbActiveChannels).filter(id => sbActiveChannels[id] && sbActiveChannels[id].playing));
      const targetIds = new Set(Object.keys(mix));
      currentIds.forEach(id => { if (!targetIds.has(id)) sbStop(id); });
      targetIds.forEach(id => {
        const def = sbGetAll().find(s => s.id === id);
        if (!def) return;
        if (!currentIds.has(id)) { sbActiveChannels[id] = { volume: mix[id].volume }; sbStart(id); }
        sbSetVol(id, mix[id].volume);
      });
    }
    if (state.sbMasterVol !== undefined && !window.craftIsOwner && sbMasterGain && sbAudioCtx) {
      sbMasterVol = state.sbMasterVol / 100;
      sbMasterGain.gain.setTargetAtTime(sbMasterVol * sbPersonalVol, sbAudioCtx.currentTime, 0.02);
      const ms = document.getElementById('sbMasterVol'), mv = document.getElementById('sbMasterVolVal');
      if (ms) ms.value = state.sbMasterVol;
      if (mv) mv.textContent = Math.round(state.sbMasterVol) + '%';
    }
  } catch(e) { console.warn('Sound sync (non-fatal):', e); }
  
  if (!skipRender) {
    try {
      // Users without hidden access: auto-switch away from hidden containers
      if (!window.craftCanViewHidden) {
        const curMap = maps.find(m => m.id === currentMapId);
        if (curMap && curMap.hidden) {
          const vis = maps.find(m => !m.hidden);
          if (vis) currentMapId = vis.id;
        }
        if (typeof chapters !== 'undefined') {
          const curCh = chapters.find(c => c.id === currentChapterId);
          if (curCh && curCh.hidden) {
            const vis = chapters.find(c => !c.hidden);
            if (vis) currentChapterId = vis.id;
          }
        }
        if (typeof timelines !== 'undefined') {
          const curTl = timelines.find(t => t.id === currentTimelineId);
          if (curTl && curTl.hidden) {
            const vis = timelines.find(t => !t.hidden);
            if (vis) currentTimelineId = vis.id;
          }
        }
      }

      // Always render sidebar lists for all tabs
      renderBoardsList();
      renderMapsList();
      renderChaptersList();

      // Restore indent/justify for current chapter after state load
      if (currentChapterId) {
        const curChap = chapters.find(c => c.id === currentChapterId);
        if (curChap) {
          writeIndentMode = !!curChap.indentMode;
          writeJustifyMode = !!curChap.justifyMode;
          const editor = document.getElementById('writeEditor');
          if (editor) {
            editor.classList.toggle('indent-mode', writeIndentMode);
            editor.classList.toggle('justify-mode', writeJustifyMode);
          }
          const indentBtn = document.getElementById('indentToggleBtn');
          const justifyBtn = document.getElementById('justifyToggleBtn');
          if (indentBtn) indentBtn.classList.toggle('active', writeIndentMode);
          if (justifyBtn) justifyBtn.classList.toggle('active', writeJustifyMode);
        }
      }
      if (typeof renderTimelinesList === 'function') renderTimelinesList();
      if (typeof renderFactionsSidebar === 'function') renderFactionsSidebar();
      
      // Render current view content
      if (currentView === 'board') { updateCanvas(); }
      if (currentView === 'write' && currentChapterId) {
        // Must call selectChapter to properly restore editor content + indent/justify
        selectChapter(currentChapterId);
      }
      if (currentView === 'map') {
        if (typeof updateMapView === 'function') {
          updateMapView();
          // Delayed re-render for regions (SVG needs layout dimensions)
          requestAnimationFrame(() => { if (typeof renderRegions === 'function') renderRegions(); });
        }
      }
      if (currentView === 'timeline') { if (typeof renderTimelineView === 'function') renderTimelineView(); }
      if (currentView === 'combat') { if (typeof renderCombatants === 'function') renderCombatants(); }
      if (currentView === 'factions') { if (typeof renderFactionGrid === 'function') renderFactionGrid(); }
      if (currentView === 'mindmap') { if (typeof renderMindMap === 'function') renderMindMap(); }
      if (currentView === 'soundboard') { if (typeof sbRenderChannels === 'function') sbRenderChannels(); if (typeof sbRenderSidebar === 'function') sbRenderSidebar(); }
      
      applyViewSettings();
    } catch(e) {
      console.warn('craftSetState render error:', e);
    }
  }
};

// Expose view settings to craft-app.js
window.VIEW_CONFIG = VIEW_CONFIG;
Object.defineProperty(window, 'viewSettings', {
  get: function() { return viewSettings; },
  set: function(v) { viewSettings = v; }
});
window.toggleViewSetting = toggleViewSetting;
window.applyViewSettings = applyViewSettings;

// Signal that craft room is ready
// Strip all native title attributes to prevent browser tooltips showing domain info
(function stripTitles() {
  document.querySelectorAll('[title]').forEach(el => {
    if (el.tagName !== 'IFRAME') el.removeAttribute('title');
  });
  let pending = false;
  const obs = new MutationObserver(() => {
    if (pending) return;
    pending = true;
    requestAnimationFrame(() => {
      document.querySelectorAll('[title]').forEach(el => {
        if (el.tagName !== 'IFRAME') el.removeAttribute('title');
      });
      pending = false;
    });
  });
  obs.observe(document.body, { childList: true, subtree: true });
})();

// ============================================
// Permission Denial System
// ============================================
(function() {
  let _permDenyTimer = null;
  function showPermissionDenied(action) {
    if (_permDenyTimer) clearTimeout(_permDenyTimer);
    const msg = action === 'delete' ? 'You do not have permission to delete this item'
      : action === 'toggle' ? 'You do not have permission to change this setting'
      : 'You do not have permission to edit this room';
    showNotif(msg);
    _permDenyTimer = setTimeout(() => { _permDenyTimer = null; }, 1500);
  }

  // Intercept edit attempts from viewers via capture-phase listener on dashboard
  const dash = document.querySelector('.dashboard');
  if (dash) {
    dash.addEventListener('mousedown', function(e) {
      if (window.craftMyRole && window.craftMyRole !== 'viewer') return;
      if (window.craftMyRole === undefined) return; // Not loaded yet

      const t = e.target;
      const tag = t.tagName;

      // ALWAYS allow: navigation, view switching, soundscape playback, connected bar, scrolling
      if (t.closest('.view-toggle-btn') || t.closest('.zoom-controls') ||
          t.closest('.mv-panel-header') || t.closest('.mv-nav-item') ||
          t.closest('.chapter-item') || t.closest('.board-item') ||
          t.closest('.map-item') || t.closest('.fac-sub-tab') ||
          t.closest('.sb-cat-btn') || t.closest('.sb-tile-play') ||
          t.closest('.sb-tile-vol') || t.closest('#sbPersonalVol') ||
          t.closest('.connected-header') || t.closest('.user-badge') ||
          t.closest('.craft-connected-section') || t.closest('.fac-card') ||
          t.closest('.contact-card') || t.closest('.org-card') ||
          t.closest('.tl-event') || t.closest('.map-pin') ||
          t.closest('.destination-marker') || t.closest('.mm-node')) return;

      const isInteractive = (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' ||
        t.isContentEditable || t.closest('[contenteditable="true"]') ||
        t.classList.contains('delete-item-btn') ||
        t.closest('.context-menu-item') || t.closest('.tool-btn') ||
        t.closest('.canvas-tools') ||
        t.closest('.write-tool-btn') || t.closest('.add-btn-full') ||
        t.closest('.toolbar-select') || t.closest('.detail-input') ||
        t.closest('.map-tool-btn') ||
        (tag === 'BUTTON' && !t.closest('.mv-panel-header') && !t.closest('.zoom-controls') && !t.closest('.view-toggle-btn') && !t.closest('.sb-tile')));

      if (isInteractive) {
        e.preventDefault();
        e.stopPropagation();
        const act = t.classList.contains('delete-item-btn') || t.closest('.danger') ? 'delete'
          : (tag === 'INPUT' && t.type === 'checkbox') || tag === 'SELECT' ? 'toggle' : 'edit';
        showPermissionDenied(act);
      }
    }, true);

    // Also block contenteditable input and form typing
    dash.addEventListener('keydown', function(e) {
      if (window.craftMyRole && window.craftMyRole !== 'viewer') return;
      if (window.craftMyRole === undefined) return;

      const t = e.target;
      if (t.isContentEditable || t.closest('[contenteditable="true"]') ||
          t.tagName === 'INPUT' || t.tagName === 'TEXTAREA') {
        // Allow navigation keys
        if (['Tab', 'Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.key)) return;
        e.preventDefault();
        showPermissionDenied('edit');
      }
    }, true);

    // Block drag operations for viewers
    dash.addEventListener('dragstart', function(e) {
      if (window.craftMyRole && window.craftMyRole !== 'viewer') return;
      if (window.craftMyRole === undefined) return;
      e.preventDefault();
      showPermissionDenied('edit');
    }, true);

    // Block change events on selects/checkboxes for viewers
    dash.addEventListener('change', function(e) {
      if (window.craftMyRole && window.craftMyRole !== 'viewer') return;
      if (window.craftMyRole === undefined) return;
      const t = e.target;
      if (t.tagName === 'SELECT' || (t.tagName === 'INPUT' && (t.type === 'checkbox' || t.type === 'radio' || t.type === 'range' || t.type === 'color'))) {
        // Allow soundboard personal volume
        if (t.closest('.sb-tile') || t.id === 'sbPersonalVol') return;
        e.preventDefault();
        e.stopPropagation();
        showPermissionDenied('toggle');
      }
    }, true);
  }
})();

window.craftReady = true;
if (window.onCraftReady) window.onCraftReady();
