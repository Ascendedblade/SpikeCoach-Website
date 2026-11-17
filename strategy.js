// Strategy page. Uses the shared Firebase module from firebase-auth.js.
// Do not call initializeApp here.
import { spikeAuth } from "./firebase-auth.js";

var strategyStarted = false;

function showOnly(name) {
  ["strategy-loading", "strategy-locked", "strategy-verify", "strategy-app"].forEach(function(id) {
    var el = document.getElementById(id);
    if (el) el.hidden = id !== name;
  });
}

function loadAbilityManifest() {
  if (window.AGENT_ABILITY_MANIFEST) return Promise.resolve();
  return new Promise(function(resolve, reject) {
    var script = document.createElement("script");
    script.src = "agent-abilities-manifest.js";
    script.onload = function() { resolve(); };
    script.onerror = function() { reject(new Error("manifest")); };
    document.body.appendChild(script);
  });
}

function revealMapArt() {
  document.querySelectorAll("#analyzeMapsGrid img[data-src]").forEach(function(img) {
    if (!img.getAttribute("src")) img.src = img.getAttribute("data-src");
  });
}

function setSignedInLabel(user) {
  var nameEl = document.getElementById("strategy-user");
  if (!nameEl) return;
  if (user && user.displayName) {
    nameEl.hidden = false;
    nameEl.textContent = user.displayName;
  } else {
    nameEl.hidden = true;
    nameEl.textContent = "";
  }
}

function openStrategy(user) {
  setSignedInLabel(user);
  showOnly("strategy-app");
  if (strategyStarted) return;
  strategyStarted = true;
  revealMapArt();
  loadAbilityManifest().catch(function() {}).then(function() {
    if (window.StrategyPlanner && window.StrategyPlanner.init) window.StrategyPlanner.init();
  });
}

function renderStrategyGate(user) {
  if (!user) {
    setSignedInLabel(null);
    showOnly("strategy-locked");
    return;
  }
  if (!user.emailVerified) {
    var emailEl = document.getElementById("strategy-verify-email");
    if (emailEl) emailEl.textContent = user.email || "your email";
    setSignedInLabel(null);
    showOnly("strategy-verify");
    return;
  }
  openStrategy(user);
}

document.getElementById("strategy-verify-check").addEventListener("click", function() {
  var user = spikeAuth.auth.currentUser;
  var message = document.getElementById("strategy-verify-message");
  if (!user) return;
  spikeAuth.reloadUser(user).then(function(fresh) {
    if (fresh && fresh.emailVerified) {
      renderStrategyGate(fresh);
      return;
    }
    if (message) {
      message.hidden = false;
      message.textContent = "Email is not verified yet. Open the link in your inbox, then try again.";
      message.classList.add("auth-message--error");
    }
  }).catch(function() {
    if (message) {
      message.hidden = false;
      message.textContent = "Something went wrong. Try again.";
      message.classList.add("auth-message--error");
    }
  });
});

document.getElementById("strategy-verify-resend").addEventListener("click", function() {
  var user = spikeAuth.auth.currentUser;
  var message = document.getElementById("strategy-verify-message");
  if (!user) return;
  spikeAuth.sendVerification(user).then(function() {
    if (message) {
      message.hidden = false;
      message.textContent = "Verification email sent again.";
      message.classList.remove("auth-message--error");
    }
  }).catch(function() {
    if (message) {
      message.hidden = false;
      message.textContent = "Something went wrong. Try again.";
      message.classList.add("auth-message--error");
    }
  });
});

document.getElementById("strategy-verify-back").addEventListener("click", function() {
  spikeAuth.signOut().catch(function() {}).then(function() {
    window.location.href = "account.html?mode=signin&redirect=strategy";
  });
});

document.getElementById("strategy-verify-different").addEventListener("click", function() {
  spikeAuth.signOut().catch(function() {}).then(function() {
    window.location.href = "account.html?mode=signup&redirect=strategy";
  });
});

document.addEventListener("spikecoach-auth", function(event) {
  renderStrategyGate(event.detail && event.detail.user);
});

  var StrategyPlanner = (function() {
    var TEAM_IDS = ['blue', 'red'];
    var SLOTS_PER_TEAM = 5;
    var MAP_POS_MIN = 6;
    var MAP_POS_MAX = 94;

    var VALORANT_AGENTS = [
      { id: 'Astra', label: 'Astra' }, { id: 'Breach', label: 'Breach' }, { id: 'Brimstone', label: 'Brimstone' },
      { id: 'Chamber', label: 'Chamber' }, { id: 'Clove', label: 'Clove' }, { id: 'Cypher', label: 'Cypher' },
      { id: 'Deadlock', label: 'Deadlock' }, { id: 'Fade', label: 'Fade' }, { id: 'Gekko', label: 'Gekko' },
      { id: 'Harbor', label: 'Harbor' }, { id: 'Iso', label: 'Iso' }, { id: 'Jett', label: 'Jett' },
      { id: 'KAYO', label: 'KAY/O' }, { id: 'Killjoy', label: 'Killjoy' }, { id: 'Miks', label: 'Miks' },
      { id: 'Neon', label: 'Neon' },
      { id: 'Omen', label: 'Omen' }, { id: 'Phoenix', label: 'Phoenix' }, { id: 'Raze', label: 'Raze' },
      { id: 'Reyna', label: 'Reyna' }, { id: 'Sage', label: 'Sage' }, { id: 'Skye', label: 'Skye' },
      { id: 'Sova', label: 'Sova' }, { id: 'Tejo', label: 'Tejo' }, { id: 'Veto', label: 'Veto' },
      { id: 'Viper', label: 'Viper' }, { id: 'Vyse', label: 'Vyse' }, { id: 'Waylay', label: 'Waylay' },
      { id: 'Yoru', label: 'Yoru' }
    ];

    var dom = {};
    var state = {
      mapName: null,
      teams: {},
      picker: { teamId: null, slotIndex: null },
      focusedMapAgent: null,
      mapSelection: null,
      arrows: [],
      spike: null,
      drag: null,
      arrowMode: false
    };
    var SPIKE_ICON_SRC = 'Other_images/Spike_nobg.png';
    var SEQUENCE_COUNT = 8;
    var PLAYBACK_CONFIG = {
      transitionDuration: 1000,
      pauseDuration: 500
    };
    var sequences = [];
    var sequenceTouched = [];
    var activeSequence = 0;
    var playback = {
      running: false,
      paused: false,
      token: 0,
      timer: null,
      fadeTimer: null,
      playable: [],
      step: 0,
      transitionEndsAt: 0
    };
    var ZOOM_LEVELS = [1, 1.25, 1.5, 1.75, 2, 2.25, 2.5];
    var mapView = { scale: 1, panX: 0, panY: 0 };
    var panDrag = null;
    var deleteReturnFocus = null;

    // Future: ability icons, arrows, annotations — render into strategyMapLayer or sibling SVG
    var layers = {
      markers: null,
      abilities: null,
      arrows: null,
      annotations: null
    };

    function agentIconSrc(agentId) {
      if (window.valorantAgentIconPath) return window.valorantAgentIconPath(agentId);
      return 'Agent_Icons/' + agentId + '_icon.webp';
    }

    function getAgentAbilities(agentId) {
      var manifest = window.AGENT_ABILITY_MANIFEST || {};
      return manifest[agentId] || [];
    }

    function isMapMarkerFocused(teamId, slotIndex) {
      return state.focusedMapAgent &&
        state.focusedMapAgent.teamId === teamId &&
        state.focusedMapAgent.slotIndex === slotIndex;
    }

    function isSameMapSelection(sel, type, teamId, slotIndex, abilityId) {
      if (!sel || sel.type !== type || sel.teamId !== teamId || sel.slotIndex !== slotIndex) return false;
      if (type === 'ability') return sel.abilityId === abilityId;
      return true;
    }

    function setMapSelection(selection) {
      state.mapSelection = selection;
      if (selection && selection.type === 'agent') {
        state.focusedMapAgent = { teamId: selection.teamId, slotIndex: selection.slotIndex };
      } else {
        state.focusedMapAgent = null;
      }
      renderAllSlots();
      syncMapScene();
    }

    function clearMapSelection() {
      state.mapSelection = null;
      state.focusedMapAgent = null;
      renderAllSlots();
      syncMapScene();
    }

    function toggleMapMarkerFocus(teamId, slotIndex) {
      if (isMapMarkerFocused(teamId, slotIndex)) {
        clearMapSelection();
      } else {
        setMapSelection({ type: 'agent', teamId: teamId, slotIndex: slotIndex });
      }
    }

    function clearMapMarkerFocus() {
      if (!state.focusedMapAgent && !state.mapSelection) return;
      clearMapSelection();
    }

    function createEmptySlot() {
      return { instanceId: null, agentId: null, mapPos: null, abilityPlacements: [] };
    }

    function genMapItemId(prefix) {
      return prefix + '-' + Math.random().toString(36).slice(2, 10);
    }

    function getAnchorMapPct(anchor) {
      if (!anchor) return null;
      var slot = getTeam(anchor.teamId).slots[anchor.slotIndex];
      if (!slot) return null;
      if (anchor.type === 'agent' || anchor.type === 'ability-tray') {
        return slot.mapPos ? { x: slot.mapPos.x, y: slot.mapPos.y } : null;
      }
      if (anchor.type === 'ability') {
        for (var i = 0; i < slot.abilityPlacements.length; i++) {
          var pl = slot.abilityPlacements[i];
          if (pl.id === anchor.abilityId) return pl.mapPos ? { x: pl.mapPos.x, y: pl.mapPos.y } : null;
        }
      }
      return null;
    }

    function resolveArrowStart(arrow) {
      if (arrow.anchor) {
        var anchored = getAnchorMapPct(arrow.anchor);
        if (anchored) return anchored;
      }
      return arrow.startPct;
    }

    function removeArrowsForSlot(teamId, slotIndex) {
      state.arrows = state.arrows.filter(function(arrow) {
        if (!arrow.anchor) return true;
        return !(arrow.anchor.teamId === teamId && arrow.anchor.slotIndex === slotIndex);
      });
    }

    function removeArrowsForAbility(teamId, slotIndex, abilityId) {
      state.arrows = state.arrows.filter(function(arrow) {
        if (!arrow.anchor) return true;
        if (arrow.anchor.type !== 'ability') return true;
        return !(arrow.anchor.teamId === teamId &&
          arrow.anchor.slotIndex === slotIndex &&
          arrow.anchor.abilityId === abilityId);
      });
    }

    function isInsideMapClient(clientX, clientY) {
      var rect = dom.minimapContainer.getBoundingClientRect();
      return clientX >= rect.left && clientX <= rect.right &&
        clientY >= rect.top && clientY <= rect.bottom;
    }

    function removeAgentFromMap(teamId, slotIndex) {
      if (playback.running) return;
      var slot = getTeam(teamId).slots[slotIndex];
      if (!slot || !slot.mapPos) return;
      slot.mapPos = null;
      slot.abilityPlacements = [];
      removeArrowsForSlot(teamId, slotIndex);
      if (state.mapSelection && state.mapSelection.type === 'agent' &&
          state.mapSelection.teamId === teamId && state.mapSelection.slotIndex === slotIndex) {
        clearMapSelection();
      } else if (state.mapSelection && state.mapSelection.type === 'ability' &&
          state.mapSelection.teamId === teamId && state.mapSelection.slotIndex === slotIndex) {
        clearMapSelection();
      }
      noteEdit();
      syncMapScene();
    }

    function removeAbilityFromMap(teamId, slotIndex, abilityId) {
      if (playback.running) return;
      var slot = getTeam(teamId).slots[slotIndex];
      if (!slot || !slot.abilityPlacements) return;
      slot.abilityPlacements = slot.abilityPlacements.filter(function(p) { return p.id !== abilityId; });
      removeArrowsForAbility(teamId, slotIndex, abilityId);
      if (isSameMapSelection(state.mapSelection, 'ability', teamId, slotIndex, abilityId)) {
        state.mapSelection = null;
      }
      noteEdit();
      syncMapScene();
    }

    function deleteSelectedMapItem() {
      var sel = state.mapSelection;
      if (!sel) return;
      if (sel.type === 'agent') removeAgentFromMap(sel.teamId, sel.slotIndex);
      else if (sel.type === 'ability') removeAbilityFromMap(sel.teamId, sel.slotIndex, sel.abilityId);
      else if (sel.type === 'team-slot') clearSlot(sel.teamId, sel.slotIndex);
    }

    function isEditableTarget(el) {
      if (!el) return false;
      var tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
    }

    function createEmptyTeamState() {
      var slots = [];
      for (var i = 0; i < SLOTS_PER_TEAM; i++) slots.push(createEmptySlot());
      return { slots: slots };
    }

    function resetTeams() {
      state.teams = { blue: createEmptyTeamState(), red: createEmptyTeamState() };
      clearMapSelection();
      state.arrows = [];
      state.spike = null;
    }

    function clampMapPct(n) {
      return Math.min(MAP_POS_MAX, Math.max(MAP_POS_MIN, n));
    }

    function getTeam(teamId) {
      return state.teams[teamId];
    }

    function slotKey(teamId, slotIndex) {
      return teamId + '-' + slotIndex;
    }

    function isAgentOnTeam(teamId, agentId, ignoreSlotIndex) {
      var team = getTeam(teamId);
      if (!team) return false;
      for (var i = 0; i < team.slots.length; i++) {
        if (ignoreSlotIndex !== undefined && i === ignoreSlotIndex) continue;
        if (team.slots[i].agentId === agentId) return true;
      }
      return false;
    }

    function clientToMapPercent(clientX, clientY) {
      var surface = dom.mapContent || dom.minimapContainer;
      var rect = surface.getBoundingClientRect();
      if (!rect.width || !rect.height) return { x: 50, y: 50 };
      var x = ((clientX - rect.left) / rect.width) * 100;
      var y = ((clientY - rect.top) / rect.height) * 100;
      return { x: clampMapPct(x), y: clampMapPct(y) };
    }

    function renderAllSlots() {
      TEAM_IDS.forEach(function(teamId) {
        var container = teamId === 'blue' ? dom.blueSlots : dom.redSlots;
        if (!container) return;
        container.innerHTML = '';
        var team = getTeam(teamId);
        team.slots.forEach(function(slot, index) {
          container.appendChild(buildSlotElement(teamId, index, slot));
        });
      });
      syncMapScene();
    }

    function buildSlotElement(teamId, slotIndex, slot) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'strategy-agent-slot' +
        (slot.agentId ? ' is-filled' : ' is-empty') +
        (isSameMapSelection(state.mapSelection, 'team-slot', teamId, slotIndex) ? ' is-selected' : '');
      btn.dataset.team = teamId;
      btn.dataset.slot = String(slotIndex);
      btn.setAttribute('aria-label', slot.agentId ? slot.agentId + ' slot' : 'Empty agent slot');

      if (slot.agentId) {
        var img = document.createElement('img');
        img.src = agentIconSrc(slot.agentId);
        img.alt = slot.agentId;
        img.draggable = false;
        btn.appendChild(img);
        btn.title = 'Click to select · double-click to change · drag onto map · drag off map to delete';
      } else {
        btn.innerHTML = '<span class="strategy-slot-plus">+</span>';
        btn.title = 'Select agent';
      }

      btn.addEventListener('click', function() {
        if (btn.dataset.suppressClick === '1') {
          btn.dataset.suppressClick = '0';
          return;
        }
        if (!slot.agentId) {
          openAgentPicker(teamId, slotIndex);
          return;
        }
        if (isSameMapSelection(state.mapSelection, 'team-slot', teamId, slotIndex)) {
          clearMapSelection();
        } else {
          setMapSelection({ type: 'team-slot', teamId: teamId, slotIndex: slotIndex });
        }
      });

      btn.addEventListener('dblclick', function(e) {
        e.preventDefault();
        if (slot.agentId) openAgentPicker(teamId, slotIndex);
      });

      if (slot.agentId) {
        btn.addEventListener('pointerdown', function(e) {
          if (e.button !== 0) return;
          startSlotToMapDrag(e, teamId, slotIndex, btn);
        });
      }

      return btn;
    }

    function syncMapScene() {
      if (!dom.entitiesLayer) return;
      dom.entitiesLayer.innerHTML = '';
      TEAM_IDS.forEach(function(teamId) {
        getTeam(teamId).slots.forEach(function(slot, slotIndex) {
          if (!slot.abilityPlacements) slot.abilityPlacements = [];
          if (slot.agentId && slot.mapPos) {
            dom.entitiesLayer.appendChild(buildMapMarkerElement(teamId, slotIndex, slot));
          }
          slot.abilityPlacements.forEach(function(placement) {
            dom.entitiesLayer.appendChild(buildAbilityMapMarker(teamId, slotIndex, placement));
          });
        });
      });
      if (state.spike && state.spike.mapPos) {
        dom.entitiesLayer.appendChild(buildSpikeMapMarker(state.spike));
      }
      syncArrows();
    }

    function buildSpikeMapMarker(spike) {
      var el = document.createElement('div');
      el.className = 'strategy-spike-map-marker';
      el.style.left = spike.mapPos.x + '%';
      el.style.top = spike.mapPos.y + '%';
      el.title = 'Spike · drag to move · drag off the map to remove';
      var img = document.createElement('img');
      img.src = SPIKE_ICON_SRC;
      img.alt = 'Spike';
      img.draggable = false;
      el.appendChild(img);
      el.addEventListener('pointerdown', function(e) {
        e.stopPropagation();
        if (e.button !== 0) return;
        startSpikeMapDrag(e, el);
      });
      return el;
    }

    function startSpikeTrayDrag(e) {
      if (playback.running) return;
      if (e.button !== 0) return;
      e.preventDefault();
      var ghost = document.createElement('div');
      ghost.className = 'strategy-spike-ghost';
      ghost.innerHTML = '<img src="' + SPIKE_ICON_SRC + '" alt="">';
      document.body.appendChild(ghost);
      ghost.style.left = e.clientX + 'px';
      ghost.style.top = e.clientY + 'px';
      state.drag = {
        mode: 'spike-tray',
        ghost: ghost,
        startX: e.clientX,
        startY: e.clientY,
        moved: false
      };
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', onDragEnd);
      document.addEventListener('pointercancel', onDragEnd);
    }

    function startSpikeMapDrag(e, el) {
      e.preventDefault();
      state.drag = {
        mode: 'spike-map',
        el: el,
        ghost: null,
        startX: e.clientX,
        startY: e.clientY,
        moved: false
      };
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', onDragEnd);
      document.addEventListener('pointercancel', onDragEnd);
    }

    function bindIconContextMenu(el) {
      el.addEventListener('contextmenu', function(e) {
        e.preventDefault();
      });
    }

    function buildAbilityTray(agentId, teamId, slotIndex) {
      var tray = document.createElement('div');
      tray.className = 'strategy-ability-tray';
      tray.addEventListener('click', function(e) { e.stopPropagation(); });

      var abilities = getAgentAbilities(agentId);
      if (!abilities.length) {
        var empty = document.createElement('span');
        empty.className = 'strategy-ability-empty';
        empty.textContent = 'No abilities';
        tray.appendChild(empty);
        return tray;
      }

      abilities.forEach(function(ability) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'strategy-ability-btn';
        btn.title = ability.label + ' · drag to map · right-click for arrow';
        btn.dataset.abilitySrc = ability.src;
        var img = document.createElement('img');
        img.src = ability.src;
        img.alt = ability.label;
        btn.appendChild(img);
        var label = document.createElement('span');
        label.textContent = ability.label;
        btn.appendChild(label);

        btn.addEventListener('pointerdown', function(e) {
          e.stopPropagation();
          if ((e.button === 2) || (state.arrowMode && e.button === 0)) {
            e.preventDefault();
            startArrowDraft(e, {
              type: 'ability-tray',
              teamId: teamId,
              slotIndex: slotIndex
            }, teamId);
            return;
          }
          if (e.button !== 0) return;
          startAbilityTrayDrag(e, teamId, slotIndex, ability, btn);
        });

        bindIconContextMenu(btn);
        tray.appendChild(btn);
      });

      return tray;
    }

    function buildAbilityMapMarker(teamId, slotIndex, placement) {
      var el = document.createElement('div');
      el.className = 'strategy-ability-map-marker team-' + teamId +
        (isSameMapSelection(state.mapSelection, 'ability', teamId, slotIndex, placement.id) ? ' is-selected' : '');
      el.style.left = placement.mapPos.x + '%';
      el.style.top = placement.mapPos.y + '%';
      el.dataset.abilityId = placement.id;
      el.title = placement.label + ' · drag to move · right-click for arrow';

      var img = document.createElement('img');
      img.src = placement.src;
      img.alt = placement.label;
      img.draggable = false;
      el.appendChild(img);

      el.addEventListener('pointerdown', function(e) {
        e.stopPropagation();
        if ((e.button === 2) || (state.arrowMode && e.button === 0)) {
          e.preventDefault();
          startArrowDraft(e, {
            type: 'ability',
            teamId: teamId,
            slotIndex: slotIndex,
            abilityId: placement.id
          }, teamId);
          return;
        }
        if (e.button !== 0) return;
        startAbilityMapDrag(e, teamId, slotIndex, placement.id, el);
      });

      bindIconContextMenu(el);
      return el;
    }

    function buildMapMarkerElement(teamId, slotIndex, slot) {
      var group = document.createElement('div');
      group.className = 'strategy-marker-group' + (isMapMarkerFocused(teamId, slotIndex) ? ' is-focused' : '');
      group.dataset.team = teamId;
      group.dataset.slot = String(slotIndex);
      group.style.left = slot.mapPos.x + '%';
      group.style.top = slot.mapPos.y + '%';

      var el = document.createElement('div');
      el.className = 'agent-marker strategy-map-marker team-' + teamId;
      el.setAttribute('role', 'button');
      el.setAttribute('aria-label', slot.agentId + ' on map. Click for abilities.');

      var img = document.createElement('img');
      img.src = agentIconSrc(slot.agentId);
      img.alt = slot.agentId;
      img.draggable = false;
      el.appendChild(img);

      el.addEventListener('pointerdown', function(e) {
        e.stopPropagation();
        if ((e.button === 2) || (state.arrowMode && e.button === 0)) {
          e.preventDefault();
          startArrowDraft(e, {
            type: 'agent',
            teamId: teamId,
            slotIndex: slotIndex
          }, teamId);
          return;
        }
        if (e.button !== 0) return;
        startMapMarkerDrag(e, teamId, slotIndex, group);
      });

      bindIconContextMenu(el);
      group.appendChild(el);

      if (isMapMarkerFocused(teamId, slotIndex)) {
        group.appendChild(buildAbilityTray(slot.agentId, teamId, slotIndex));
      }

      return group;
    }

    function ensureArrowDefs() {
      if (dom.arrowSvg.querySelector('defs')) return;
      var defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
      var marker = document.createElementNS('http://www.w3.org/2000/svg', 'marker');
      marker.setAttribute('id', 'strategyArrowHead');
      marker.setAttribute('markerWidth', '4');
      marker.setAttribute('markerHeight', '4');
      marker.setAttribute('refX', '3.2');
      marker.setAttribute('refY', '2');
      marker.setAttribute('orient', 'auto');
      var path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('d', 'M0,0 L4,2 L0,4 Z');
      path.setAttribute('fill', 'currentColor');
      marker.appendChild(path);
      defs.appendChild(marker);
      dom.arrowSvg.appendChild(defs);
    }

    function syncArrows() {
      if (!dom.arrowSvg) return;
      dom.arrowSvg.querySelectorAll('.strategy-arrow-shape').forEach(function(n) { n.remove(); });
      ensureArrowDefs();

      state.arrows.forEach(function(arrow) {
        var start = resolveArrowStart(arrow);
        if (!start || !arrow.endPct) return;
        var color = arrow.teamId === 'blue' ? '#5dade2' : '#ec7063';
        var g = document.createElementNS('http://www.w3.org/2000/svg', 'g');
        g.setAttribute('class', 'strategy-arrow-shape');
        g.dataset.arrowId = arrow.id;

        var hit = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        hit.setAttribute('class', 'strategy-arrow-hit');
        hit.setAttribute('x1', start.x);
        hit.setAttribute('y1', start.y);
        hit.setAttribute('x2', arrow.endPct.x);
        hit.setAttribute('y2', arrow.endPct.y);

        var line = document.createElementNS('http://www.w3.org/2000/svg', 'line');
        line.setAttribute('class', 'strategy-arrow-line');
        line.setAttribute('x1', start.x);
        line.setAttribute('y1', start.y);
        line.setAttribute('x2', arrow.endPct.x);
        line.setAttribute('y2', arrow.endPct.y);
        line.setAttribute('stroke', color);
        line.setAttribute('marker-end', 'url(#strategyArrowHead)');

        var endCap = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        endCap.setAttribute('class', 'strategy-arrow-end');
        endCap.setAttribute('cx', arrow.endPct.x);
        endCap.setAttribute('cy', arrow.endPct.y);
        endCap.setAttribute('r', '1.4');
        endCap.setAttribute('fill', color);

        hit.addEventListener('pointerdown', function(e) {
          if (e.button !== 0) return;
          e.stopPropagation();
          startArrowMove(e, arrow.id);
        });
        endCap.addEventListener('pointerdown', function(e) {
          if (e.button !== 0) return;
          e.stopPropagation();
          startArrowEndDrag(e, arrow.id);
        });

        g.appendChild(hit);
        g.appendChild(line);
        g.appendChild(endCap);
        dom.arrowSvg.appendChild(g);
      });
    }

    function setSlotAgent(teamId, slotIndex, agentId) {
      if (playback.running) return;
      var slot = getTeam(teamId).slots[slotIndex];
      slot.instanceId = genMapItemId('agent');
      slot.agentId = agentId;
      slot.mapPos = null;
      slot.abilityPlacements = [];
      noteEdit();
      closeAgentPicker();
      renderAllSlots();
    }

    function clearSlot(teamId, slotIndex) {
      if (playback.running) return;
      if (isMapMarkerFocused(teamId, slotIndex) ||
          (state.mapSelection && state.mapSelection.teamId === teamId && state.mapSelection.slotIndex === slotIndex)) {
        clearMapSelection();
      }
      removeArrowsForSlot(teamId, slotIndex);
      getTeam(teamId).slots[slotIndex] = createEmptySlot();
      noteEdit();
      closeAgentPicker();
      renderAllSlots();
    }

    function setSlotMapPos(teamId, slotIndex, mapPos) {
      if (playback.running) return;
      getTeam(teamId).slots[slotIndex].mapPos = mapPos;
      noteEdit();
      syncMapScene();
    }

    function findAbilityPlacement(teamId, slotIndex, abilityId) {
      var slot = getTeam(teamId).slots[slotIndex];
      for (var i = 0; i < slot.abilityPlacements.length; i++) {
        if (slot.abilityPlacements[i].id === abilityId) return slot.abilityPlacements[i];
      }
      return null;
    }

    function detachArrowIfAnchored(arrow) {
      if (!arrow.anchor) return;
      var start = resolveArrowStart(arrow);
      arrow.startPct = { x: start.x, y: start.y };
      arrow.anchor = null;
    }

    function openAgentPicker(teamId, slotIndex) {
      if (playback.running) return;
      state.picker.teamId = teamId;
      state.picker.slotIndex = slotIndex;
      var slot = getTeam(teamId).slots[slotIndex];
      var teamLabel = teamId === 'blue' ? 'Blue' : 'Red';
      dom.pickerTitle.textContent = 'Select agent · ' + teamLabel + ' slot ' + (slotIndex + 1);
      dom.pickerRemove.hidden = !slot.agentId;
      dom.pickerGrid.innerHTML = '';

      VALORANT_AGENTS.forEach(function(agent) {
        var taken = isAgentOnTeam(teamId, agent.id, slotIndex);
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'strategy-agent-pick' + (taken ? ' is-disabled' : '') + (slot.agentId === agent.id ? ' is-current' : '');
        btn.disabled = taken;
        btn.dataset.agentId = agent.id;
        btn.innerHTML = '<img src="' + agentIconSrc(agent.id) + '" alt=""><span>' + agent.label + '</span>';
        btn.addEventListener('click', function() {
          if (taken) return;
          setSlotAgent(teamId, slotIndex, agent.id);
        });
        dom.pickerGrid.appendChild(btn);
      });

      dom.picker.hidden = false;
    }

    function closeAgentPicker() {
      state.picker.teamId = null;
      state.picker.slotIndex = null;
      dom.picker.hidden = true;
    }

    function endDrag() {
      if (!state.drag) return;
      if (state.drag.previewLine && state.drag.previewLine.parentNode) {
        state.drag.previewLine.parentNode.removeChild(state.drag.previewLine);
      }
      if (state.drag.ghost && state.drag.ghost.parentNode) {
        state.drag.ghost.parentNode.removeChild(state.drag.ghost);
      }
      document.removeEventListener('pointermove', onDragMove);
      document.removeEventListener('pointerup', onDragEnd);
      document.removeEventListener('pointercancel', onDragEnd);
      state.drag = null;
      syncArrows();
    }

    function onDragMove(e) {
      if (!state.drag) return;
      var d = state.drag;
      if (d.startX !== undefined) {
        var dx = e.clientX - d.startX;
        var dy = e.clientY - d.startY;
        if (Math.hypot(dx, dy) > 4) d.moved = true;
      }
      if (d.ghost) {
        d.ghost.style.left = e.clientX + 'px';
        d.ghost.style.top = e.clientY + 'px';
      }
      if (d.mode === 'marker') {
        if (!isInsideMapClient(e.clientX, e.clientY)) return;
        var pos = clientToMapPercent(e.clientX, e.clientY);
        var slot = getTeam(d.teamId).slots[d.slotIndex];
        slot.mapPos = pos;
        if (d.groupEl) {
          d.groupEl.style.left = pos.x + '%';
          d.groupEl.style.top = pos.y + '%';
        }
        syncArrows();
      }
      if (d.mode === 'ability-map') {
        if (!isInsideMapClient(e.clientX, e.clientY)) return;
        var abPos = clientToMapPercent(e.clientX, e.clientY);
        var placement = findAbilityPlacement(d.teamId, d.slotIndex, d.abilityId);
        if (placement) placement.mapPos = abPos;
        if (d.el) {
          d.el.style.left = abPos.x + '%';
          d.el.style.top = abPos.y + '%';
        }
        syncArrows();
      }
      if (d.mode === 'spike-map') {
        if (!isInsideMapClient(e.clientX, e.clientY)) return;
        var spikePos = clientToMapPercent(e.clientX, e.clientY);
        if (state.spike) state.spike.mapPos = spikePos;
        if (d.el) {
          d.el.style.left = spikePos.x + '%';
          d.el.style.top = spikePos.y + '%';
        }
      }
      if (d.mode === 'arrow-draft') {
        d.endPct = clientToMapPercent(e.clientX, e.clientY);
        if (d.previewLine) {
          d.previewLine.setAttribute('x2', d.endPct.x);
          d.previewLine.setAttribute('y2', d.endPct.y);
        }
      }
      if (d.mode === 'arrow-move' || d.mode === 'arrow-end') {
        var arrow = state.arrows.find(function(a) { return a.id === d.arrowId; });
        if (!arrow) return;
        var cur = clientToMapPercent(e.clientX, e.clientY);
        if (!d.lastPct) d.lastPct = cur;
        var delta = { x: cur.x - d.lastPct.x, y: cur.y - d.lastPct.y };
        d.lastPct = cur;
        if (d.mode === 'arrow-end') {
          if (!arrow.endPct) arrow.endPct = { x: cur.x, y: cur.y };
          arrow.endPct.x = clampMapPct(arrow.endPct.x + delta.x);
          arrow.endPct.y = clampMapPct(arrow.endPct.y + delta.y);
        } else {
          if (!arrow.startPct) {
            var s = resolveArrowStart(arrow);
            arrow.startPct = { x: s.x, y: s.y };
          }
          if (!arrow.endPct) return;
          arrow.startPct.x = clampMapPct(arrow.startPct.x + delta.x);
          arrow.startPct.y = clampMapPct(arrow.startPct.y + delta.y);
          arrow.endPct.x = clampMapPct(arrow.endPct.x + delta.x);
          arrow.endPct.y = clampMapPct(arrow.endPct.y + delta.y);
        }
        syncArrows();
      }
    }

    function onDragEnd(e) {
      if (!state.drag) return;
      var d = state.drag;
      if (d.mode === 'slot') {
        if (d.moved && d.slotButton) d.slotButton.dataset.suppressClick = '1';
        var inside = isInsideMapClient(e.clientX, e.clientY);
        if (d.moved) {
          if (inside) {
            setSlotMapPos(d.teamId, d.slotIndex, clientToMapPercent(e.clientX, e.clientY));
          } else {
            clearSlot(d.teamId, d.slotIndex);
          }
        }
      }
      if (d.mode === 'ability-tray') {
        if (d.moved && d.trayButton) d.trayButton.dataset.suppressClick = '1';
        var insideAb = isInsideMapClient(e.clientX, e.clientY);
        if (insideAb && d.moved) {
          getTeam(d.teamId).slots[d.slotIndex].abilityPlacements.push({
            id: genMapItemId('ab'),
            src: d.ability.src,
            label: d.ability.label,
            mapPos: clientToMapPercent(e.clientX, e.clientY)
          });
          syncMapScene();
        }
      }
      if (d.mode === 'marker') {
        if (d.moved) {
          if (isInsideMapClient(e.clientX, e.clientY)) clearMapMarkerFocus();
          else removeAgentFromMap(d.teamId, d.slotIndex);
        } else {
          toggleMapMarkerFocus(d.teamId, d.slotIndex);
        }
      }
      if (d.mode === 'ability-map') {
        if (d.moved) {
          if (!isInsideMapClient(e.clientX, e.clientY)) {
            removeAbilityFromMap(d.teamId, d.slotIndex, d.abilityId);
          } else {
            syncMapScene();
          }
        } else {
          setMapSelection({
            type: 'ability',
            teamId: d.teamId,
            slotIndex: d.slotIndex,
            abilityId: d.abilityId
          });
          syncMapScene();
        }
      }
      if (d.mode === 'spike-tray') {
        if (d.moved && isInsideMapClient(e.clientX, e.clientY)) {
          state.spike = { mapPos: clientToMapPercent(e.clientX, e.clientY) };
          syncMapScene();
        }
      }
      if (d.mode === 'spike-map') {
        if (d.moved && !isInsideMapClient(e.clientX, e.clientY)) {
          state.spike = null;
          syncMapScene();
        }
      }
      if (d.mode === 'arrow-draft') {
        if (d.moved && d.endPct && d.startPct) {
          state.arrows.push({
            id: genMapItemId('arr'),
            teamId: d.teamId,
            anchor: d.anchor,
            startPct: { x: d.startPct.x, y: d.startPct.y },
            endPct: { x: d.endPct.x, y: d.endPct.y }
          });
        }
      }
      if (sequenceDragChanged(d, e)) noteEdit();
      endDrag();
    }

    function startSlotToMapDrag(e, teamId, slotIndex, slotButton) {
      if (playback.running) return;
      e.preventDefault();
      var slot = getTeam(teamId).slots[slotIndex];
      if (!slot.agentId) return;

      var ghost = document.createElement('div');
      ghost.className = 'strategy-drag-ghost team-' + teamId;
      ghost.innerHTML = '<img src="' + agentIconSrc(slot.agentId) + '" alt="">';
      document.body.appendChild(ghost);
      ghost.style.left = e.clientX + 'px';
      ghost.style.top = e.clientY + 'px';

      state.drag = {
        mode: 'slot',
        teamId: teamId,
        slotIndex: slotIndex,
        ghost: ghost,
        slotButton: slotButton,
        startX: e.clientX,
        startY: e.clientY,
        moved: false
      };
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', onDragEnd);
      document.addEventListener('pointercancel', onDragEnd);
    }

    function startMapMarkerDrag(e, teamId, slotIndex, groupEl) {
      if (playback.running) return;
      e.preventDefault();
      var slot = getTeam(teamId).slots[slotIndex];
      if (!slot.agentId || !slot.mapPos) return;

      state.drag = {
        mode: 'marker',
        teamId: teamId,
        slotIndex: slotIndex,
        groupEl: groupEl,
        ghost: null,
        startX: e.clientX,
        startY: e.clientY,
        moved: false
      };
      if (e.currentTarget.setPointerCapture) {
        e.currentTarget.setPointerCapture(e.pointerId);
      }
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', onDragEnd);
      document.addEventListener('pointercancel', onDragEnd);
    }

    function startAbilityTrayDrag(e, teamId, slotIndex, ability, trayButton) {
      if (playback.running) return;
      e.preventDefault();
      var slot = getTeam(teamId).slots[slotIndex];
      if (!slot.mapPos) return;

      var ghost = document.createElement('div');
      ghost.className = 'strategy-drag-ghost strategy-ability-ghost team-' + teamId;
      ghost.innerHTML = '<img src="' + ability.src + '" alt="">';
      document.body.appendChild(ghost);
      ghost.style.left = e.clientX + 'px';
      ghost.style.top = e.clientY + 'px';

      state.drag = {
        mode: 'ability-tray',
        teamId: teamId,
        slotIndex: slotIndex,
        ability: ability,
        trayButton: trayButton,
        ghost: ghost,
        startX: e.clientX,
        startY: e.clientY,
        moved: false
      };
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', onDragEnd);
      document.addEventListener('pointercancel', onDragEnd);
    }

    function startAbilityMapDrag(e, teamId, slotIndex, abilityId, el) {
      if (playback.running) return;
      e.preventDefault();
      state.drag = {
        mode: 'ability-map',
        teamId: teamId,
        slotIndex: slotIndex,
        abilityId: abilityId,
        el: el,
        startX: e.clientX,
        startY: e.clientY,
        moved: false
      };
      if (el.setPointerCapture) el.setPointerCapture(e.pointerId);
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', onDragEnd);
      document.addEventListener('pointercancel', onDragEnd);
    }

    function startArrowDraft(e, anchor, teamId) {
      if (playback.running) return;
      var start = getAnchorMapPct(anchor);
      if (!start) return;

      ensureArrowDefs();
      var preview = document.createElementNS('http://www.w3.org/2000/svg', 'line');
      preview.setAttribute('class', 'strategy-arrow-line strategy-arrow-preview');
      preview.setAttribute('x1', start.x);
      preview.setAttribute('y1', start.y);
      preview.setAttribute('x2', start.x);
      preview.setAttribute('y2', start.y);
      preview.setAttribute('stroke', teamId === 'blue' ? '#5dade2' : '#ec7063');
      preview.setAttribute('marker-end', 'url(#strategyArrowHead)');
      dom.arrowSvg.appendChild(preview);

      state.drag = {
        mode: 'arrow-draft',
        teamId: teamId,
        anchor: anchor,
        startPct: { x: start.x, y: start.y },
        endPct: { x: start.x, y: start.y },
        previewLine: preview,
        startX: e.clientX,
        startY: e.clientY,
        moved: false
      };
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', onDragEnd);
      document.addEventListener('pointercancel', onDragEnd);
    }

    function startArrowMove(e, arrowId) {
      if (playback.running) return;
      var arrow = state.arrows.find(function(a) { return a.id === arrowId; });
      if (!arrow) return;
      detachArrowIfAnchored(arrow);
      state.drag = {
        mode: 'arrow-move',
        arrowId: arrowId,
        startX: e.clientX,
        startY: e.clientY,
        lastPct: clientToMapPercent(e.clientX, e.clientY),
        moved: false
      };
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', onDragEnd);
      document.addEventListener('pointercancel', onDragEnd);
    }

    function startArrowEndDrag(e, arrowId) {
      if (playback.running) return;
      var arrow = state.arrows.find(function(a) { return a.id === arrowId; });
      if (!arrow) return;
      detachArrowIfAnchored(arrow);
      state.drag = {
        mode: 'arrow-end',
        arrowId: arrowId,
        startX: e.clientX,
        startY: e.clientY,
        lastPct: clientToMapPercent(e.clientX, e.clientY),
        moved: false
      };
      document.addEventListener('pointermove', onDragMove);
      document.addEventListener('pointerup', onDragEnd);
      document.addEventListener('pointercancel', onDragEnd);
    }

    function getStrategyExportFilename() {
      var map = (state.mapName || 'Map').replace(/[^\w\-]+/g, '_');
      return 'SpikeCoach_' + map + '_Strategy.png';
    }

    function serializeStrategy() {
      saveActiveSequence();
      return {
        version: 2,
        mapName: state.mapName,
        activeSequence: activeSequence,
        sequences: sequences.map(function(seq, index) {
          return {
            touched: !!sequenceTouched[index],
            teams: seq.teams,
            arrows: seq.arrows,
            spike: seq.spike
          };
        })
      };
    }

    function iconBySrc(src, loaded) {
      for (var i = 0; i < loaded.length; i++) {
        if (loaded[i].src === src) return loaded[i].image;
      }
      return null;
    }

    function loadExportImage(src) {
      return new Promise(function(resolve) {
        var image = new Image();
        image.onload = function() { resolve({ src: src, image: image }); };
        image.onerror = function() { resolve({ src: src, image: null }); };
        image.src = src;
      });
    }

    function drawArrowHead(ctx, from, to, color, size) {
      var angle = Math.atan2(to.y - from.y, to.x - from.x);
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(to.x, to.y);
      ctx.lineTo(to.x - size * Math.cos(angle - 0.45), to.y - size * Math.sin(angle - 0.45));
      ctx.lineTo(to.x - size * Math.cos(angle + 0.45), to.y - size * Math.sin(angle + 0.45));
      ctx.closePath();
      ctx.fill();
    }

    function exportStrategyBoardPNG() {
      if (!dom.minimapImage || !state.mapName) return;
      var mapImg = dom.minimapImage;
      if (!mapImg.naturalWidth) {
        window.alert('Could not export strategy. Try again after the map finishes loading.');
        return;
      }

      var btn = dom.downloadBtn;
      if (btn) {
        btn.disabled = true;
        btn.textContent = 'Exporting…';
      }

      var sources = [];
      function queue(src) {
        if (src && sources.indexOf(src) === -1) sources.push(src);
      }
      TEAM_IDS.forEach(function(teamId) {
        getTeam(teamId).slots.forEach(function(slot) {
          if (slot.agentId) queue(agentIconSrc(slot.agentId));
          (slot.abilityPlacements || []).forEach(function(placement) { queue(placement.src); });
        });
      });
      if (state.spike) queue(SPIKE_ICON_SRC);

      Promise.all(sources.map(loadExportImage)).then(function(loaded) {
        var canvas = document.createElement('canvas');
        canvas.width = mapImg.naturalWidth;
        canvas.height = mapImg.naturalHeight;
        var ctx = canvas.getContext('2d');
        ctx.drawImage(mapImg, 0, 0, canvas.width, canvas.height);

        function point(pct) {
          return { x: (pct.x / 100) * canvas.width, y: (pct.y / 100) * canvas.height };
        }

        state.arrows.forEach(function(arrow) {
          var start = resolveArrowStart(arrow);
          if (!start || !arrow.endPct) return;
          var a = point(start);
          var b = point(arrow.endPct);
          var color = arrow.teamId === 'blue' ? '#5dade2' : '#ec7063';
          ctx.strokeStyle = color;
          ctx.lineWidth = Math.max(3, canvas.width * 0.0045);
          ctx.lineCap = 'round';
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
          drawArrowHead(ctx, a, b, color, Math.max(12, canvas.width * 0.02));
        });

        TEAM_IDS.forEach(function(teamId) {
          getTeam(teamId).slots.forEach(function(slot) {
            (slot.abilityPlacements || []).forEach(function(placement) {
              if (!placement.mapPos) return;
              var p = point(placement.mapPos);
              var size = Math.max(28, canvas.width * 0.045);
              ctx.fillStyle = 'rgba(15, 25, 35, 0.9)';
              ctx.strokeStyle = teamId === 'blue' ? '#5dade2' : '#ec7063';
              ctx.lineWidth = 2;
              ctx.beginPath();
              ctx.rect(p.x - size / 2, p.y - size / 2, size, size);
              ctx.fill();
              ctx.stroke();
              var icon = iconBySrc(placement.src, loaded);
              if (icon) ctx.drawImage(icon, p.x - size * 0.38, p.y - size * 0.38, size * 0.76, size * 0.76);
            });
          });
        });

        TEAM_IDS.forEach(function(teamId) {
          getTeam(teamId).slots.forEach(function(slot) {
            if (!slot.agentId || !slot.mapPos) return;
            var p = point(slot.mapPos);
            var radius = Math.max(16, canvas.width * 0.028);
            ctx.beginPath();
            ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
            ctx.fillStyle = teamId === 'blue' ? '#2980b9' : '#c0392b';
            ctx.fill();
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(255,255,255,0.85)';
            ctx.stroke();
            var icon = iconBySrc(agentIconSrc(slot.agentId), loaded);
            if (icon) {
              ctx.save();
              ctx.beginPath();
              ctx.arc(p.x, p.y, radius - 2, 0, Math.PI * 2);
              ctx.clip();
              ctx.drawImage(icon, p.x - radius + 2, p.y - radius + 2, (radius - 2) * 2, (radius - 2) * 2);
              ctx.restore();
            }
          });
        });

        if (state.spike && state.spike.mapPos) {
          var spikeIcon = iconBySrc(SPIKE_ICON_SRC, loaded);
          var sp = point(state.spike.mapPos);
          var spikeSize = Math.max(26, canvas.width * 0.04);
          if (spikeIcon) ctx.drawImage(spikeIcon, sp.x - spikeSize / 2, sp.y - spikeSize / 2, spikeSize, spikeSize);
        }

        canvas.toBlob(function(blob) {
          if (!blob) {
            window.alert('Could not export strategy. Try again after the map finishes loading.');
            return;
          }
          var url = URL.createObjectURL(blob);
          var link = document.createElement('a');
          link.href = url;
          link.download = getStrategyExportFilename();
          document.body.appendChild(link);
          link.click();
          link.remove();
          URL.revokeObjectURL(url);
        }, 'image/png');
      }).catch(function() {
        window.alert('Could not export strategy. Try again after the map finishes loading.');
      }).then(function() {
        if (btn) {
          btn.disabled = false;
          btn.textContent = 'Download Strategy';
        }
      });
    }

    function minimapSrc(mapName) {
      var pngMaps = { Summit: true, Lotus: true };
      var ext = pngMaps[mapName] ? 'png' : 'webp';
      return 'Map_minimaps/' + mapName + '_minimap.' + ext;
    }

    function openMap(mapName) {
      haltPlayback();
      state.mapName = mapName;
      initTimelineBlank();
      resetTeams();
      dom.analyzeContainer.style.display = 'none';
      dom.minimapView.style.display = 'block';
      dom.mapTitle.textContent = mapName;
      dom.minimapImage.src = minimapSrc(mapName);
      closeAgentPicker();
      resetMapView();
      renderAllSlots();
      updateTimelineUI();
    }

    function closeMap() {
      dom.minimapView.style.display = 'none';
      dom.analyzeContainer.style.display = 'block';
      closeAgentPicker();
      closeDeleteDialog();
      endPan();
      endDrag();
    }

    function bindMapSelector() {
      dom.mapItems.forEach(function(item) {
    item.addEventListener('click', function() {
          openMap(this.dataset.map);
    });
  });
      if (dom.backBtn) dom.backBtn.addEventListener('click', closeMap);
    }

    function bindPicker() {
      dom.pickerClose.addEventListener('click', closeAgentPicker);
      dom.pickerBackdrop.addEventListener('click', closeAgentPicker);
      dom.pickerRemove.addEventListener('click', function() {
        if (state.picker.teamId === null) return;
        clearSlot(state.picker.teamId, state.picker.slotIndex);
      });
    }

    function deepClone(value) {
      return JSON.parse(JSON.stringify(value));
    }

    function scalePos(pos, toNormalized) {
      if (!pos) return null;
      var factor = toNormalized ? 0.01 : 100;
      return { x: pos.x * factor, y: pos.y * factor };
    }

    function convertTeams(teams, toNormalized) {
      var copy = deepClone(teams);
      TEAM_IDS.forEach(function(teamId) {
        copy[teamId].slots.forEach(function(slot) {
          slot.mapPos = scalePos(slot.mapPos, toNormalized);
          (slot.abilityPlacements || []).forEach(function(placement) {
            placement.mapPos = scalePos(placement.mapPos, toNormalized);
          });
        });
      });
      return copy;
    }

    function convertArrows(arrows, toNormalized) {
      return deepClone(arrows || []).map(function(arrow) {
        arrow.startPct = scalePos(arrow.startPct, toNormalized);
        arrow.endPct = scalePos(arrow.endPct, toNormalized);
        return arrow;
      });
    }

    function convertSpike(spike, toNormalized) {
      if (!spike || !spike.mapPos) return null;
      return { mapPos: scalePos(spike.mapPos, toNormalized) };
    }

    function emptySequence() {
      return {
        teams: { blue: createEmptyTeamState(), red: createEmptyTeamState() },
        arrows: [],
        spike: null
      };
    }

    function initTimelineBlank() {
      sequences = [];
      sequenceTouched = [];
      for (var i = 0; i < SEQUENCE_COUNT; i++) {
        sequences.push(emptySequence());
        sequenceTouched.push(false);
      }
      activeSequence = 0;
    }

    function noteEdit() {
      if (playback.running) return;
      sequenceTouched[activeSequence] = true;
      updateTimelineUI();
    }

    function sequenceDragChanged(d, e) {
      if (!d || !d.moved) return false;
      if (d.mode === 'ability-tray' || d.mode === 'spike-tray') return isInsideMapClient(e.clientX, e.clientY);
      return d.mode === 'slot' || d.mode === 'marker' || d.mode === 'ability-map' ||
        d.mode === 'spike-map' || d.mode === 'arrow-draft' || d.mode === 'arrow-move' || d.mode === 'arrow-end';
    }

    function snapshotEditor() {
      return {
        teams: convertTeams(state.teams, true),
        arrows: convertArrows(state.arrows, true),
        spike: convertSpike(state.spike, true)
      };
    }

    function saveActiveSequence() {
      if (playback.running || !sequences.length) return;
      sequences[activeSequence] = snapshotEditor();
    }

    function loadSequence(index) {
      var seq = sequences[index] || emptySequence();
      state.teams = convertTeams(seq.teams, false);
      state.arrows = convertArrows(seq.arrows, false);
      state.spike = convertSpike(seq.spike, false);
      state.mapSelection = null;
      state.focusedMapAgent = null;
      closeAgentPicker();
      renderAllSlots();
    }

    function nearestTouchedBefore(index) {
      for (var i = index - 1; i >= 0; i--) {
        if (sequenceTouched[i]) return i;
      }
      return null;
    }

    function selectSequence(index) {
      if (playback.running) haltPlayback();
      if (index === activeSequence) {
        updateTimelineUI();
        return;
      }
      saveActiveSequence();
      if (!sequenceTouched[index]) {
        var source = nearestTouchedBefore(index);
        if (source !== null) {
          sequences[index] = deepClone(sequences[source]);
          sequenceTouched[index] = true;
        }
      }
      activeSequence = index;
      loadSequence(index);
      updateTimelineUI();
    }

    function duplicatePrevious() {
      if (playback.running || activeSequence === 0) return;
      sequences[activeSequence] = deepClone(sequences[activeSequence - 1]);
      sequenceTouched[activeSequence] = true;
      loadSequence(activeSequence);
      updateTimelineUI();
    }

    function playableIndices() {
      saveActiveSequence();
      var list = [];
      for (var i = 0; i < SEQUENCE_COUNT; i++) {
        if (sequenceTouched[i]) list.push(i);
      }
      return list;
    }

    function clearPlaybackTimer() {
      if (playback.timer) {
        window.clearTimeout(playback.timer);
        playback.timer = null;
      }
    }

    function clearFadeTimer() {
      if (playback.fadeTimer) {
        window.clearTimeout(playback.fadeTimer);
        playback.fadeTimer = null;
      }
    }

    function showPlaybackLayer(on) {
      if (!dom.playbackLayer) return;
      dom.playbackLayer.hidden = !on;
      if (dom.entitiesLayer) dom.entitiesLayer.style.visibility = on ? 'hidden' : '';
      if (dom.arrowSvg) dom.arrowSvg.style.visibility = on ? 'hidden' : '';
      if (!on) dom.playbackLayer.innerHTML = '';
    }

    function haltPlayback() {
      playback.token += 1;
      clearPlaybackTimer();
      clearFadeTimer();
      playback.running = false;
      playback.paused = false;
      playback.playable = [];
      playback.step = 0;
      showPlaybackLayer(false);
      if (dom.workspace) dom.workspace.classList.remove('is-playing');
    }

    function indexById(list) {
      var map = {};
      list.forEach(function(item) { map[item.id] = item; });
      return map;
    }

    function collectAgents(seq) {
      var list = [];
      if (!seq) return list;
      TEAM_IDS.forEach(function(teamId) {
        seq.teams[teamId].slots.forEach(function(slot) {
          if (!slot.instanceId || !slot.agentId || !slot.mapPos) return;
          list.push({
            id: slot.instanceId,
            teamId: teamId,
            character: slot.agentId,
            x: slot.mapPos.x,
            y: slot.mapPos.y
          });
        });
      });
      return list;
    }

    function collectAbilities(seq) {
      var list = [];
      if (!seq) return list;
      TEAM_IDS.forEach(function(teamId) {
        seq.teams[teamId].slots.forEach(function(slot) {
          (slot.abilityPlacements || []).forEach(function(placement) {
            if (!placement.id || !placement.mapPos) return;
            list.push({
              id: placement.id,
              teamId: teamId,
              src: placement.src,
              label: placement.label,
              x: placement.mapPos.x,
              y: placement.mapPos.y
            });
          });
        });
      });
      return list;
    }

    function collectSpike(seq) {
      if (!seq || !seq.spike || !seq.spike.mapPos) return [];
      return [{ id: 'spike', x: seq.spike.mapPos.x, y: seq.spike.mapPos.y }];
    }

    function placePlayMarker(el, x, y, animate) {
      if (animate) el.classList.remove('is-instant');
      else el.classList.add('is-instant');
      el.style.left = (x * 100) + '%';
      el.style.top = (y * 100) + '%';
    }

    function buildPlayAgent(item) {
      var el = document.createElement('div');
      el.className = 'strategy-play-marker strategy-play-agent team-' + item.teamId;
      var img = document.createElement('img');
      img.src = agentIconSrc(item.character);
      img.alt = '';
      img.draggable = false;
      el.appendChild(img);
      return el;
    }

    function buildPlayAbility(item) {
      var el = document.createElement('div');
      el.className = 'strategy-play-marker strategy-play-ability team-' + item.teamId;
      var img = document.createElement('img');
      img.src = item.src;
      img.alt = item.label || '';
      img.draggable = false;
      el.appendChild(img);
      return el;
    }

    function buildPlaySpike() {
      var el = document.createElement('div');
      el.className = 'strategy-play-marker strategy-play-spike';
      var img = document.createElement('img');
      img.src = SPIKE_ICON_SRC;
      img.alt = '';
      img.draggable = false;
      el.appendChild(img);
      return el;
    }

    function markerNode(kind, id) {
      return dom.playbackLayer.querySelector('[data-kind="' + kind + '"][data-play-id="' + id + '"]');
    }

    function syncPlayMarkers(kind, fromMap, toMap, animate, build) {
      var removals = [];
      Object.keys(toMap).forEach(function(id) {
        var next = toMap[id];
        var prev = fromMap[id];
        var el = markerNode(kind, id);
        if (!el) {
          el = build(next);
          el.dataset.kind = kind;
          el.dataset.playId = id;
          dom.playbackLayer.appendChild(el);
        } else if (kind === 'agent' && el.firstChild && next.character) {
          el.firstChild.src = agentIconSrc(next.character);
          el.className = 'strategy-play-marker strategy-play-agent team-' + next.teamId;
        }
        if (prev && animate) {
          placePlayMarker(el, prev.x, prev.y, false);
          el.style.opacity = '1';
          void el.offsetWidth;
          placePlayMarker(el, next.x, next.y, true);
          el.style.opacity = '1';
        } else if (!prev && animate) {
          placePlayMarker(el, next.x, next.y, false);
          el.style.opacity = '0';
          void el.offsetWidth;
          el.classList.remove('is-instant');
          el.style.opacity = '1';
        } else {
          placePlayMarker(el, next.x, next.y, false);
          el.style.opacity = '1';
        }
      });
      Object.keys(fromMap).forEach(function(id) {
        if (toMap[id]) return;
        var el = markerNode(kind, id);
        if (!el) return;
        if (animate) {
          el.classList.remove('is-instant');
          el.style.opacity = '0';
          removals.push(el);
        } else if (el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
      Array.prototype.forEach.call(dom.playbackLayer.querySelectorAll('[data-kind="' + kind + '"]'), function(el) {
        if (!toMap[el.dataset.playId] && !fromMap[el.dataset.playId] && el.parentNode) {
          el.parentNode.removeChild(el);
        }
      });
      return removals;
    }

    function renderPlaybackFrame(toIndex, fromIndex, animate) {
      var fromSeq = fromIndex === null || fromIndex === undefined ? null : sequences[fromIndex];
      var toSeq = sequences[toIndex];
      var removals = [];
      removals = removals.concat(syncPlayMarkers('agent', indexById(collectAgents(fromSeq)), indexById(collectAgents(toSeq)), animate, buildPlayAgent));
      removals = removals.concat(syncPlayMarkers('ability', indexById(collectAbilities(fromSeq)), indexById(collectAbilities(toSeq)), animate, buildPlayAbility));
      removals = removals.concat(syncPlayMarkers('spike', indexById(collectSpike(fromSeq)), indexById(collectSpike(toSeq)), animate, buildPlaySpike));
      clearFadeTimer();
      if (removals.length) {
        var token = playback.token;
        playback.fadeTimer = window.setTimeout(function() {
          if (token !== playback.token) return;
          removals.forEach(function(el) {
            if (el.parentNode) el.parentNode.removeChild(el);
          });
        }, PLAYBACK_CONFIG.transitionDuration);
      }
    }

    function shownSequenceIndex() {
      if (playback.running && playback.playable.length) return playback.playable[playback.step];
      return activeSequence;
    }

    function finishPlayback(index) {
      haltPlayback();
      activeSequence = index;
      loadSequence(index);
      updateTimelineUI();
    }

    function advancePlayback(token) {
      if (token !== playback.token || !playback.running || playback.paused) return;
      if (playback.step >= playback.playable.length - 1) {
        finishPlayback(playback.playable[playback.step]);
        return;
      }
      var fromIndex = playback.playable[playback.step];
      playback.step += 1;
      var toIndex = playback.playable[playback.step];
      renderPlaybackFrame(toIndex, fromIndex, true);
      playback.transitionEndsAt = Date.now() + PLAYBACK_CONFIG.transitionDuration;
      updateTimelineUI();
      playback.timer = window.setTimeout(function() {
        advancePlayback(token);
      }, PLAYBACK_CONFIG.transitionDuration + PLAYBACK_CONFIG.pauseDuration);
    }

    function startPlayback() {
      if (playback.running && playback.paused) {
        playback.paused = false;
        var token = playback.token;
        var wait = Math.max(0, playback.transitionEndsAt - Date.now());
        clearPlaybackTimer();
        playback.timer = window.setTimeout(function() {
          advancePlayback(token);
        }, wait);
        updateTimelineUI();
        return;
      }
      if (playback.running) return;
      var list = playableIndices();
      if (!list.length) return;
      var startAt = list.indexOf(activeSequence);
      if (startAt < 0) startAt = 0;
      playback.running = true;
      playback.paused = false;
      playback.playable = list;
      playback.step = startAt;
      playback.token += 1;
      var token = playback.token;
      if (dom.workspace) dom.workspace.classList.add('is-playing');
      showPlaybackLayer(true);
      renderPlaybackFrame(list[startAt], null, false);
      updateTimelineUI();
      if (startAt >= list.length - 1) {
        finishPlayback(list[startAt]);
        return;
      }
      playback.transitionEndsAt = Date.now();
      playback.timer = window.setTimeout(function() {
        advancePlayback(token);
      }, PLAYBACK_CONFIG.pauseDuration);
    }

    function pausePlayback() {
      if (!playback.running || playback.paused) return;
      playback.paused = true;
      clearPlaybackTimer();
      updateTimelineUI();
    }

    function restartPlayback() {
      haltPlayback();
      saveActiveSequence();
      activeSequence = 0;
      loadSequence(0);
      updateTimelineUI();
    }

    function updateTimelineUI() {
      if (!dom.sequenceList) return;
      var shown = shownSequenceIndex();
      Array.prototype.forEach.call(dom.sequenceList.children, function(btn) {
        var index = Number(btn.dataset.sequence);
        btn.classList.toggle('is-selected', index === activeSequence && !playback.running);
        btn.classList.toggle('is-current', index === shown);
        btn.classList.toggle('has-data', !!sequenceTouched[index]);
        btn.setAttribute('aria-selected', index === shown ? 'true' : 'false');
      });
      if (dom.duplicateBtn) dom.duplicateBtn.disabled = playback.running || activeSequence === 0;
      if (dom.playBtn) dom.playBtn.disabled = playback.running && !playback.paused;
      if (dom.pauseBtn) dom.pauseBtn.disabled = !playback.running || playback.paused;
    }

    function bindTimeline() {
      if (!dom.sequenceList) return;
      dom.sequenceList.innerHTML = '';
      for (var i = 0; i < SEQUENCE_COUNT; i++) {
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'strategy-sequence-btn';
        btn.dataset.sequence = String(i);
        btn.textContent = String(i + 1);
        btn.setAttribute('role', 'tab');
        btn.setAttribute('aria-label', 'Sequence ' + (i + 1));
        btn.addEventListener('click', function() {
          selectSequence(Number(this.dataset.sequence));
        });
        dom.sequenceList.appendChild(btn);
      }
      if (dom.duplicateBtn) dom.duplicateBtn.addEventListener('click', duplicatePrevious);
      if (dom.playBtn) dom.playBtn.addEventListener('click', startPlayback);
      if (dom.pauseBtn) dom.pauseBtn.addEventListener('click', pausePlayback);
      if (dom.restartBtn) dom.restartBtn.addEventListener('click', restartPlayback);
    }

    function applySerializedStrategy(data) {
      if (!data) return;
      haltPlayback();
      initTimelineBlank();
      if (data.version === 1 && data.teams) {
        sequences[0] = {
          teams: convertTeams(data.teams, true),
          arrows: convertArrows(data.arrows, true),
          spike: convertSpike(data.spike, true)
        };
        sequenceTouched[0] = true;
        activeSequence = 0;
        if (data.mapName) state.mapName = data.mapName;
        loadSequence(0);
        updateTimelineUI();
        return;
      }
      var incoming = data.sequences || [];
      for (var i = 0; i < SEQUENCE_COUNT; i++) {
        var src = incoming[i];
        if (!src) continue;
        sequences[i] = {
          teams: src.teams || emptySequence().teams,
          arrows: src.arrows || [],
          spike: src.spike || null
        };
        sequenceTouched[i] = !!src.touched;
      }
      activeSequence = Math.max(0, Math.min(SEQUENCE_COUNT - 1, data.activeSequence || 0));
      if (data.mapName) state.mapName = data.mapName;
      loadSequence(activeSequence);
      updateTimelineUI();
    }

    function clampPan() {
      var min = 1 - mapView.scale;
      mapView.panX = Math.min(0, Math.max(min, mapView.panX));
      mapView.panY = Math.min(0, Math.max(min, mapView.panY));
    }

    function applyMapView() {
      clampPan();
      if (dom.mapContent) {
        dom.mapContent.style.transform =
          'translate(' + (mapView.panX * 100) + '%, ' + (mapView.panY * 100) + '%) scale(' + mapView.scale + ')';
      }
      if (dom.minimapContainer) dom.minimapContainer.classList.toggle('is-zoomed', mapView.scale > 1);
      if (dom.zoomLevel) {
        var pct = Math.round(mapView.scale * 100);
        dom.zoomLevel.textContent = pct + '%';
        dom.zoomLevel.setAttribute('aria-label', 'Zoom ' + pct + ' percent. Activate to reset to 100 percent');
      }
      if (dom.zoomOut) dom.zoomOut.disabled = mapView.scale <= ZOOM_LEVELS[0];
      if (dom.zoomIn) dom.zoomIn.disabled = mapView.scale >= ZOOM_LEVELS[ZOOM_LEVELS.length - 1];
    }

    function zoomAt(nextScale, clientX, clientY) {
      var viewport = dom.minimapContainer;
      var view = viewport ? viewport.getBoundingClientRect() : null;
      var anchorX = clientX;
      var anchorY = clientY;
      if (view && (anchorX == null || anchorY == null)) {
        anchorX = view.left + view.width / 2;
        anchorY = view.top + view.height / 2;
      }
      if (view && view.width && view.height && anchorX != null && anchorY != null) {
        var nx = (anchorX - view.left) / view.width;
        var ny = (anchorY - view.top) / view.height;
        var cx = (nx - mapView.panX) / mapView.scale;
        var cy = (ny - mapView.panY) / mapView.scale;
        mapView.scale = nextScale;
        mapView.panX = nx - cx * nextScale;
        mapView.panY = ny - cy * nextScale;
      } else {
        mapView.scale = nextScale;
      }
      applyMapView();
    }

    function nearestZoomIndex() {
      var index = 0;
      var best = Infinity;
      ZOOM_LEVELS.forEach(function(level, i) {
        var distance = Math.abs(level - mapView.scale);
        if (distance < best) {
          best = distance;
          index = i;
        }
      });
      return index;
    }

    function stepZoom(direction, clientX, clientY) {
      var index = nearestZoomIndex() + direction;
      if (index < 0) index = 0;
      if (index > ZOOM_LEVELS.length - 1) index = ZOOM_LEVELS.length - 1;
      zoomAt(ZOOM_LEVELS[index], clientX, clientY);
    }

    function resetMapView() {
      mapView.scale = 1;
      mapView.panX = 0;
      mapView.panY = 0;
      applyMapView();
    }

    function endPan() {
      panDrag = null;
      if (dom.minimapContainer) dom.minimapContainer.classList.remove('is-panning');
      document.removeEventListener('pointermove', onPanMove);
      document.removeEventListener('pointerup', endPan);
      document.removeEventListener('pointercancel', endPan);
    }

    function onPanMove(e) {
      if (!panDrag || !dom.minimapContainer) return;
      var rect = dom.minimapContainer.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      mapView.panX = panDrag.panX + (e.clientX - panDrag.x) / rect.width;
      mapView.panY = panDrag.panY + (e.clientY - panDrag.y) / rect.height;
      applyMapView();
    }

    function isStrategyObjectTarget(target) {
      if (!target || !target.closest) return false;
      return !!target.closest(
        '.strategy-marker-group, .agent-marker, .strategy-ability-map-marker, .strategy-ability-btn, .strategy-spike-map-marker, .strategy-arrow-hit, .strategy-arrow-end'
      );
    }

    function startPan(e) {
      if (e.button !== 0) return;
      if (mapView.scale <= 1) return;
      if (state.drag || panDrag) return;
      if (isStrategyObjectTarget(e.target)) return;
      e.preventDefault();
      panDrag = {
        x: e.clientX,
        y: e.clientY,
        panX: mapView.panX,
        panY: mapView.panY
      };
      if (dom.minimapContainer) dom.minimapContainer.classList.add('is-panning');
      document.addEventListener('pointermove', onPanMove);
      document.addEventListener('pointerup', endPan);
      document.addEventListener('pointercancel', endPan);
    }

    function onMapWheel(e) {
      if (!dom.minimapContainer) return;
      e.preventDefault();
      var horizontal = Math.abs(e.deltaX) > Math.abs(e.deltaY) && !e.ctrlKey && !e.metaKey;
      if (horizontal && mapView.scale > 1) {
        var rect = dom.minimapContainer.getBoundingClientRect();
        if (!rect.width || !rect.height) return;
        mapView.panX -= e.deltaX / rect.width;
        mapView.panY -= e.deltaY / rect.height;
        applyMapView();
        return;
      }
      stepZoom(e.deltaY > 0 ? -1 : 1, e.clientX, e.clientY);
    }

    function openDeleteDialog() {
      if (!dom.deleteDialog) return;
      deleteReturnFocus = document.activeElement;
      dom.deleteDialog.hidden = false;
      if (dom.deleteCancel) dom.deleteCancel.focus();
    }

    function closeDeleteDialog() {
      if (!dom.deleteDialog || dom.deleteDialog.hidden) return;
      dom.deleteDialog.hidden = true;
      if (deleteReturnFocus && deleteReturnFocus.focus) deleteReturnFocus.focus();
      deleteReturnFocus = null;
    }

    function deleteEverything() {
      closeDeleteDialog();
      endPan();
      endDrag();
      haltPlayback();
      closeAgentPicker();
      initTimelineBlank();
      resetTeams();
      updateTimelineUI();
    }

    function onDeleteDialogKeydown(e) {
      if (!dom.deleteDialog || dom.deleteDialog.hidden) return false;
      if (e.key === 'Escape') {
        e.preventDefault();
        closeDeleteDialog();
        return true;
      }
      if (e.key !== 'Tab') return true;
      var first = dom.deleteCancel;
      var last = dom.deleteConfirm;
      if (!first || !last) return true;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
      return true;
    }

    function bindMapView() {
      dom.mapContent = document.getElementById('strategyMapContent');
      dom.zoomOut = document.getElementById('strategyZoomOut');
      dom.zoomIn = document.getElementById('strategyZoomIn');
      dom.zoomLevel = document.getElementById('strategyZoomLevel');
      dom.resetViewBtn = document.getElementById('strategyResetView');
      dom.deleteEverythingBtn = document.getElementById('strategyDeleteEverything');
      dom.deleteDialog = document.getElementById('strategyDeleteDialog');
      dom.deleteCancel = document.getElementById('strategyDeleteCancel');
      dom.deleteConfirm = document.getElementById('strategyDeleteConfirm');
      dom.deleteBackdrop = document.getElementById('strategyDeleteBackdrop');
      if (dom.zoomOut) dom.zoomOut.addEventListener('click', function() { stepZoom(-1); });
      if (dom.zoomIn) dom.zoomIn.addEventListener('click', function() { stepZoom(1); });
      if (dom.zoomLevel) dom.zoomLevel.addEventListener('click', resetMapView);
      if (dom.resetViewBtn) dom.resetViewBtn.addEventListener('click', resetMapView);
      if (dom.deleteEverythingBtn) dom.deleteEverythingBtn.addEventListener('click', openDeleteDialog);
      if (dom.deleteCancel) dom.deleteCancel.addEventListener('click', closeDeleteDialog);
      if (dom.deleteBackdrop) dom.deleteBackdrop.addEventListener('click', closeDeleteDialog);
      if (dom.deleteConfirm) dom.deleteConfirm.addEventListener('click', deleteEverything);
      if (dom.minimapContainer) {
        dom.minimapContainer.addEventListener('pointerdown', startPan);
        dom.minimapContainer.addEventListener('wheel', onMapWheel, { passive: false });
      }
      applyMapView();
    }

    function init() {
      dom.analyzeContainer = document.querySelector('#strategySection .strategy-maps-container');
      dom.minimapView = document.getElementById('analyzeMinimapView');
      dom.backBtn = document.getElementById('backToAnalyzeList');
      dom.mapItems = document.querySelectorAll('#analyzeMapsGrid .map-card');
      dom.minimapContainer = document.getElementById('strategyExportRoot');
      dom.exportRoot = dom.minimapContainer;
      dom.downloadBtn = document.getElementById('strategyDownloadBtn');
      dom.spikeSource = document.getElementById('strategySpikeSource');
      dom.minimapImage = document.getElementById('minimapImage');
      dom.mapTitle = document.getElementById('analyzeMapTitle');
      dom.mapLayer = document.getElementById('strategyMapLayer');
      dom.entitiesLayer = document.getElementById('strategyEntitiesLayer');
      dom.arrowSvg = document.getElementById('strategyArrowSvg');
      dom.blueSlots = document.getElementById('strategyBlueSlots');
      dom.redSlots = document.getElementById('strategyRedSlots');
      dom.picker = document.getElementById('strategyAgentPicker');
      dom.pickerBackdrop = document.getElementById('strategyAgentPickerBackdrop');
      dom.pickerClose = document.getElementById('strategyAgentPickerClose');
      dom.pickerRemove = document.getElementById('strategyAgentRemoveBtn');
      dom.pickerGrid = document.getElementById('strategyAgentPickerGrid');
      dom.pickerTitle = document.getElementById('strategyAgentPickerTitle');

      layers.markers = dom.entitiesLayer;
      layers.abilities = dom.entitiesLayer;
      layers.arrows = dom.arrowSvg;

      dom.mapLayer.addEventListener('contextmenu', function(e) { e.preventDefault(); });
      dom.minimapContainer.addEventListener('contextmenu', function(e) { e.preventDefault(); });

      dom.mapLayer.addEventListener('pointerdown', function(e) {
        if (e.target === dom.mapLayer || e.target === dom.entitiesLayer || e.target === dom.arrowSvg) {
          clearMapMarkerFocus();
        }
      });
      dom.minimapContainer.addEventListener('pointerdown', function(e) {
        if (e.target === dom.minimapImage) clearMapMarkerFocus();
      });

      dom.arrowModeBtn = document.getElementById('strategyArrowModeBtn');
      if (dom.arrowModeBtn) {
        dom.arrowModeBtn.addEventListener('click', function() {
          if (playback.running) return;
          state.arrowMode = !state.arrowMode;
          dom.arrowModeBtn.classList.toggle('is-active', state.arrowMode);
          dom.arrowModeBtn.setAttribute('aria-pressed', state.arrowMode ? 'true' : 'false');
        });
      }

      if (dom.downloadBtn) {
        dom.downloadBtn.addEventListener('click', exportStrategyBoardPNG);
      }
      if (dom.spikeSource) {
        dom.spikeSource.addEventListener('pointerdown', startSpikeTrayDrag);
        dom.spikeSource.addEventListener('dragstart', function(e) { e.preventDefault(); });
      }

      document.addEventListener('keydown', function(e) {
        if (onDeleteDialogKeydown(e)) return;
        if (playback.running) return;
        if (!dom.minimapView || dom.minimapView.style.display === 'none') return;
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        if (isEditableTarget(document.activeElement)) return;
        if (!state.mapSelection) return;
        e.preventDefault();
        deleteSelectedMapItem();
      });

      dom.workspace = document.getElementById('strategySection');
      dom.playbackLayer = document.getElementById('strategyPlaybackLayer');
      dom.sequenceList = document.getElementById('strategySequenceList');
      dom.duplicateBtn = document.getElementById('strategyDuplicateBtn');
      dom.playBtn = document.getElementById('strategyPlayBtn');
      dom.pauseBtn = document.getElementById('strategyPauseBtn');
      dom.restartBtn = document.getElementById('strategyRestartBtn');
      if (dom.playbackLayer) {
        dom.playbackLayer.style.setProperty('--strategy-move', PLAYBACK_CONFIG.transitionDuration + 'ms');
      }
      initTimelineBlank();
      resetTeams();
      bindMapView();
      bindTimeline();
      bindMapSelector();
      bindPicker();
      updateTimelineUI();
    }

    return {
      init: init,
      openMap: openMap,
      showMapPicker: closeMap,
      exportStrategyBoardPNG: exportStrategyBoardPNG,
      serializeStrategy: serializeStrategy,
      applySerializedStrategy: applySerializedStrategy,
      layers: layers,
      getState: function() { return state; }
    };
  })();

window.StrategyPlanner = StrategyPlanner;
