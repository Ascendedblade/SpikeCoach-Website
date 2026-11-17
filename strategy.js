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
      return { agentId: null, mapPos: null, abilityPlacements: [] };
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
      syncMapScene();
    }

    function removeAbilityFromMap(teamId, slotIndex, abilityId) {
      var slot = getTeam(teamId).slots[slotIndex];
      if (!slot || !slot.abilityPlacements) return;
      slot.abilityPlacements = slot.abilityPlacements.filter(function(p) { return p.id !== abilityId; });
      removeArrowsForAbility(teamId, slotIndex, abilityId);
      if (isSameMapSelection(state.mapSelection, 'ability', teamId, slotIndex, abilityId)) {
        state.mapSelection = null;
      }
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
      var rect = dom.minimapContainer.getBoundingClientRect();
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
      var slot = getTeam(teamId).slots[slotIndex];
      slot.agentId = agentId;
      slot.mapPos = null;
      closeAgentPicker();
      renderAllSlots();
    }

    function clearSlot(teamId, slotIndex) {
      if (isMapMarkerFocused(teamId, slotIndex) ||
          (state.mapSelection && state.mapSelection.teamId === teamId && state.mapSelection.slotIndex === slotIndex)) {
        clearMapSelection();
      }
      removeArrowsForSlot(teamId, slotIndex);
      getTeam(teamId).slots[slotIndex] = createEmptySlot();
      closeAgentPicker();
      renderAllSlots();
    }

    function setSlotMapPos(teamId, slotIndex, mapPos) {
      getTeam(teamId).slots[slotIndex].mapPos = mapPos;
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
        var rectAb = dom.minimapContainer.getBoundingClientRect();
        var insideAb = e.clientX >= rectAb.left && e.clientX <= rectAb.right &&
          e.clientY >= rectAb.top && e.clientY <= rectAb.bottom;
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
      endDrag();
    }

    function startSlotToMapDrag(e, teamId, slotIndex, slotButton) {
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
      return {
        version: 1,
        mapName: state.mapName,
        teams: state.teams,
        arrows: state.arrows,
        spike: state.spike
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

    function openMap(mapName) {
      state.mapName = mapName;
      resetTeams();
      dom.analyzeContainer.style.display = 'none';
      dom.minimapView.style.display = 'block';
      dom.mapTitle.textContent = mapName;
      dom.minimapImage.src = 'Map_minimaps/' + mapName + '_minimap.webp';
      closeAgentPicker();
      renderAllSlots();
    }

    function closeMap() {
      dom.minimapView.style.display = 'none';
      dom.analyzeContainer.style.display = 'block';
      closeAgentPicker();
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
        if (!dom.minimapView || dom.minimapView.style.display === 'none') return;
        if (e.key !== 'Delete' && e.key !== 'Backspace') return;
        if (isEditableTarget(document.activeElement)) return;
        if (!state.mapSelection) return;
        e.preventDefault();
        deleteSelectedMapItem();
      });

      resetTeams();
      bindMapSelector();
      bindPicker();
    }

    return {
      init: init,
      openMap: openMap,
      showMapPicker: closeMap,
      exportStrategyBoardPNG: exportStrategyBoardPNG,
      serializeStrategy: serializeStrategy,
      layers: layers,
      getState: function() { return state; }
    };
  })();

window.StrategyPlanner = StrategyPlanner;
