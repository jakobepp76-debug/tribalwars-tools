// ==UserScript==
// @name         FarmGod DE PRO V9.8a FAST+ CLEAN UI
// @namespace    https://example.com/
// @version      9.8.1
// @description  Zielbasierte Farm-Planung mit Ziel-Limit, Einheiten-Reserve, schnellerem Distanzfilter, Arrival-Memory, Blacklist, Fortress-Filter, Hard Reset und Auto-Helper
// @author       angepasst
// @match        *://*.die-staemme.de/*
// @match        *://*.tribalwars.*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const FG = {
    name: 'FarmGod DE PRO V9.8a FAST+ CLEAN UI',
    debug: false,
    onlyScreen: 'am_farm',
    waitMs: 300,
    maxWait: 60,

    maxPlannedPerCycle: 3000,
    defaultIntervalMinutes: 6,
    defaultDistance: 25,
    defaultMaxPerTarget: 25,

    helperCycleMinMinutes: 10,
    helperCycleMaxMinutes: 25,
    helperClickDelayMinMs: 130,
    helperClickDelayMaxMs: 170,
    helperBreakEverySends: 50,
    helperBreakMinMs: 800,
    helperBreakMaxMs: 1500,

    progressBarId: 'FarmGodProgessbar',
    fortressBonusType: 33,

    manualBlockedCoords: ['407|562'],
    manualBlockedTargetIds: [],
    manualBlockedOriginCoords: [],

    storage: {
      options: 'fg_pro_v981_options',
      unitSpeeds: 'fg_pro_v981_unit_speeds',
      helperEnabled: 'fg_pro_v981_helper_enabled',
      blockedCoords: 'fg_pro_v981_blocked_coords',
      blockedTargetIds: 'fg_pro_v981_blocked_target_ids',
      blockedOriginCoords: 'fg_pro_v981_blocked_origin_coords',
      arrivalMemory: 'fg_pro_v981_arrival_memory'
    },

    resetKeys: [
      'fg_pro_v981_options',
      'fg_pro_v981_unit_speeds',
      'fg_pro_v981_helper_enabled',
      'fg_pro_v981_blocked_coords',
      'fg_pro_v981_blocked_target_ids',
      'fg_pro_v981_blocked_origin_coords',
      'fg_pro_v981_arrival_memory'
    ]
  };

  const Log = {
    info(...args) {
      if (FG.debug) console.log(`[${FG.name}]`, ...args);
    },
    warn(...args) {
      if (FG.debug) console.warn(`[${FG.name}]`, ...args);
    },
    error(...args) {
      console.error(`[${FG.name}]`, ...args);
    }
  };

  const Util = {
    isFarmPage() {
      try {
        const url = new URL(window.location.href);
        return url.searchParams.get('screen') === FG.onlyScreen;
      } catch {
        return false;
      }
    },

    normalizeCoord(coord) {
      return String(coord || '').replace('/', '|').trim();
    },

    isValidCoord(coord) {
      return /^\d{1,3}\|\d{1,3}$/.test(Util.normalizeCoord(coord));
    },

    parseCoordList(text) {
      const found = String(text || '').match(/\d{1,3}\|\d{1,3}/g) || [];
      return Array.from(new Set(found.map(Util.normalizeCoord)));
    },

    toNumber(value) {
      return parseFloat(value) || 0;
    },

    toInt(value, fallback = 0) {
      const n = parseInt(value, 10);
      return Number.isFinite(n) ? n : fallback;
    },

    extractCoord(text) {
      const matches = String(text || '').match(/\d{1,3}\|\d{1,3}/g);
      return matches ? matches[matches.length - 1] : null;
    },

    coordToObject(coord) {
      const c = Util.normalizeCoord(coord);
      const m = c.match(/(\d{1,3})\|(\d{1,3})/);
      if (!m) return null;
      return { x: parseInt(m[1], 10), y: parseInt(m[2], 10) };
    },

    distance(a, b) {
      const ca = typeof a === 'string' ? Util.coordToObject(a) : a;
      const cb = typeof b === 'string' ? Util.coordToObject(b) : b;
      if (!ca || !cb) return Infinity;
      return Math.hypot(ca.x - cb.x, ca.y - cb.y);
    },

    subtractArrays(array1, array2) {
      if (!Array.isArray(array1) || !Array.isArray(array2)) return false;
      if (array1.length !== array2.length) return false;
      const result = array1.map((val, i) => val - array2[i]);
      return result.some((v) => v < 0) ? false : result;
    },

    getAllowedUnits() {
      const skipUnits = ['ram', 'catapult', 'knight', 'snob', 'militia'];
      return (window.game_data.units || []).filter((u) => !skipUnits.includes(u));
    },

    getServerTimestamp() {
      try {
        if (window.Timing && typeof window.Timing.getCurrentServerTime === 'function') {
          return window.Timing.getCurrentServerTime();
        }
      } catch {}

      const match = window.$('#serverTime').closest('p').text().match(/\d+/g);
      if (!match || match.length < 6) return Date.now();
      const [hour, min, sec, day, month, year] = match;
      return new Date(year, month - 1, day, hour, min, sec).getTime();
    },

    timestampFromTwString(timestr) {
      let d = window.$('#serverDate').text().split('/').map((x) => +x);

      const todayPattern = new RegExp(
        window.lang['aea2b0aa9ae1534226518faaefffdaad'].replace('%s', '([\\d+|:]+)')
      ).exec(timestr);

      const tomorrowPattern = new RegExp(
        window.lang['57d28d1b211fddbb7a499ead5bf23079'].replace('%s', '([\\d+|:]+)')
      ).exec(timestr);

      const laterDatePattern = new RegExp(
        window.lang['0cb274c906d622fa8ce524bcfbb7552d']
          .replace('%1', '([\\d+|\\.]+)')
          .replace('%2', '([\\d+|:]+)')
      ).exec(timestr);

      let t, date;

      if (todayPattern !== null) {
        t = todayPattern[1].split(':');
        date = new Date(d[2], d[1] - 1, d[0], t[0], t[1], t[2], t[3] || 0);
      } else if (tomorrowPattern !== null) {
        t = tomorrowPattern[1].split(':');
        date = new Date(d[2], d[1] - 1, d[0] + 1, t[0], t[1], t[2], t[3] || 0);
      } else if (laterDatePattern !== null) {
        d = (laterDatePattern[1] + d[2]).split('.').map((x) => +x);
        t = laterDatePattern[2].split(':');
        date = new Date(d[2], d[1] - 1, d[0], t[0], t[1], t[2], t[3] || 0);
      } else {
        return Date.now();
      }

      return date.getTime();
    },

    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    getSavedOptions() {
      return JSON.parse(localStorage.getItem(FG.storage.options) || 'null') || {
        optionGroup: 0,
        optionDistance: FG.defaultDistance,
        optionInterval: 6,
        optionMaxPerTarget: FG.defaultMaxPerTarget,
        reserve: {}
      };
    },

    normalizeReserveObject(raw, allowedUnits) {
      const result = {};
      (allowedUnits || []).forEach((unit) => {
        result[unit] = Math.max(0, Util.toInt(raw?.[unit], 0));
      });
      return result;
    },

    saveOptions(options) {
      localStorage.setItem(FG.storage.options, JSON.stringify(options));
    },

    getRandomInt(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    getBlockedCoords() {
      try {
        const saved = JSON.parse(localStorage.getItem(FG.storage.blockedCoords) || '[]');
        return new Set([
          ...(Array.isArray(saved) ? saved : []),
          ...(Array.isArray(FG.manualBlockedCoords) ? FG.manualBlockedCoords : [])
        ].map(Util.normalizeCoord));
      } catch {
        return new Set((FG.manualBlockedCoords || []).map(Util.normalizeCoord));
      }
    },

    saveBlockedCoords(set) {
      localStorage.setItem(FG.storage.blockedCoords, JSON.stringify(Array.from(set)));
    },

    setBlockedCoords(coords) {
      const normalized = Array.from(new Set((coords || []).map(Util.normalizeCoord).filter(Util.isValidCoord)));
      localStorage.setItem(FG.storage.blockedCoords, JSON.stringify(normalized));
    },

    addBlockedCoord(coord) {
      const c = Util.normalizeCoord(coord);
      if (!c) return;
      const blocked = Util.getBlockedCoords();
      blocked.add(c);
      Util.saveBlockedCoords(blocked);
    },

    getBlockedTargetIds() {
      try {
        const saved = JSON.parse(localStorage.getItem(FG.storage.blockedTargetIds) || '[]');
        return new Set([
          ...(Array.isArray(saved) ? saved : []),
          ...(Array.isArray(FG.manualBlockedTargetIds) ? FG.manualBlockedTargetIds : [])
        ].map((x) => String(x)));
      } catch {
        return new Set((FG.manualBlockedTargetIds || []).map((x) => String(x)));
      }
    },

    saveBlockedTargetIds(set) {
      localStorage.setItem(FG.storage.blockedTargetIds, JSON.stringify(Array.from(set)));
    },

    addBlockedTargetId(id) {
      if (id === undefined || id === null || id === '') return;
      const blocked = Util.getBlockedTargetIds();
      blocked.add(String(id));
      Util.saveBlockedTargetIds(blocked);
    },

    getBlockedOriginCoords() {
      try {
        const saved = JSON.parse(localStorage.getItem(FG.storage.blockedOriginCoords) || '[]');
        return new Set([
          ...(Array.isArray(saved) ? saved : []),
          ...(Array.isArray(FG.manualBlockedOriginCoords) ? FG.manualBlockedOriginCoords : [])
        ].map(Util.normalizeCoord));
      } catch {
        return new Set((FG.manualBlockedOriginCoords || []).map(Util.normalizeCoord));
      }
    },

    saveBlockedOriginCoords(set) {
      localStorage.setItem(FG.storage.blockedOriginCoords, JSON.stringify(Array.from(set)));
    },

    setBlockedOriginCoords(coords) {
      const normalized = Array.from(new Set((coords || []).map(Util.normalizeCoord).filter(Util.isValidCoord)));
      localStorage.setItem(FG.storage.blockedOriginCoords, JSON.stringify(normalized));
    },

    clearBlacklist() {
      localStorage.setItem(FG.storage.blockedCoords, '[]');
      localStorage.setItem(FG.storage.blockedTargetIds, '[]');
      localStorage.setItem(FG.storage.blockedOriginCoords, '[]');
    },

    shouldBlacklistError(err) {
      const text = typeof err === 'string' ? err : JSON.stringify(err || '');
      return /festung|fortress|ungültig|invalid|kein barbarendorf|nicht geplündert|cannot be plundered|special/i.test(text);
    },

    isSessionExpired() {
      const href = String(window.location.href || '').toLowerCase();
      const bodyText = String(document.body?.innerText || '').toLowerCase();

      const urlIndicators = ['sid_invalid', 'login.php', 'logged_out'];
      const textIndicators = [
        'sitzung abgelaufen',
        'session expired',
        'bitte logge dich ein',
        'please log in',
        'login',
        'anmelden'
      ];

      if (urlIndicators.some((x) => href.includes(x))) return true;
      if (textIndicators.some((x) => bodyText.includes(x))) return true;

      const missingCoreElements =
        !document.querySelector('#serverTime') &&
        !document.querySelector('#am_widget_Farm') &&
        !document.querySelector('#content_value');

      if (missingCoreElements) {
        const looksLikeLogin =
          !!document.querySelector('form[action*="login"]') ||
          !!document.querySelector('input[type="password"]');
        if (looksLikeLogin) return true;
      }

      return false;
    },

    formatTime(tsSec) {
      const d = new Date(tsSec * 1000);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const ss = String(d.getSeconds()).padStart(2, '0');
      return `${hh}:${mm}:${ss}`;
    },

    hardResetAll() {
      FG.resetKeys.forEach((key) => localStorage.removeItem(key));
    },

    getArrivalMemory() {
      try {
        return JSON.parse(localStorage.getItem(FG.storage.arrivalMemory) || '{}') || {};
      } catch {
        return {};
      }
    },

    saveArrivalMemory(memory) {
      localStorage.setItem(FG.storage.arrivalMemory, JSON.stringify(memory));
    },

    purgeOldArrivalMemory(memory, serverTime) {
      const cleaned = {};
      Object.keys(memory || {}).forEach((coord) => {
        const arr = Array.isArray(memory[coord]) ? memory[coord] : [];
        const filtered = arr
          .filter((ts) => Number.isFinite(ts) && ts > serverTime)
          .sort((a, b) => a - b);
        if (filtered.length) cleaned[coord] = filtered;
      });
      return cleaned;
    },

    clearArrivalMemory() {
      localStorage.removeItem(FG.storage.arrivalMemory);
    }
  };

  const I18N = {
    de: {
      missingFeatures: 'Das Script benötigt Premium und den Farm-Assistenten!',
      optionsTitle: 'FarmGod Pro Optionen',
      optionsHint:
        '<b>V9.8a FAST+ CLEAN UI:</b><br>- Ziel-Limit pro BB-Dorf<br>- Einheiten-Reserve pro Herkunftsdorf<br>- schnellerer Distanz-Vorfilter<br>- keine Ziel-Zwischenzeilen im UI',
      group: 'Aus welcher Gruppe soll gefarmt werden:',
      distance: 'Maximale Laufdistanz in Feldern:',
      timeInterval: 'Minimaler Abstand pro BB-Dorf (Minuten):',
      maxPerTarget: 'Maximale Angriffe pro BB-Dorf:',
      reserveTitle: 'Mindestreserve pro Herkunftsdorf:',
      button: 'Farmen planen',
      noFarms: 'Mit den aktuellen Einstellungen konnten keine Farmergebnisse gefunden werden.',
      origin: 'Herkunft',
      target: 'Ziel',
      fields: 'Felder',
      farm: 'Farm',
      template: 'Vorlage',
      status: 'Status',
      interval: 'Abstand',
      arrival: 'Ankunft',
      sendError: 'Fehler: Farm konnte nicht gesendet werden!',
      loading: 'Daten werden geladen...',
      helperTitle: 'FarmGod Helper',
      helperOpen: 'FarmGod öffnen',
      helperStart: 'Auto-Helper starten',
      helperStop: 'Auto-Helper stoppen',
      helperIdle: 'Bereit',
      helperStarting: 'Starte...',
      helperStopping: 'Stoppe...',
      helperBot: 'Bot-Schutz erkannt',
      helperSession: 'Sitzung abgelaufen',
      helperRunning: 'Sende Farmen...',
      helperNoRows: 'Keine Farmen vorhanden',
      blacklistOpen: 'Blacklist Manager',
      blacklistClear: 'Blacklist leeren',
      hardReset: 'Hard Reset',
      hardResetDone: 'FarmGod wurde komplett zurückgesetzt.',
      blacklistTitle: 'FarmGod Blacklist Manager',
      blacklistTargets: 'Ziel-Koordinaten blockieren',
      blacklistOrigins: 'Eigene Herkunftsdörfer blockieren',
      blacklistHint: 'Mehrere Koordinaten einfach einfügen. Erkannt werden alle Werte im Format 000|000.',
      blacklistIds: 'Automatisch blockierte Ziel-IDs (nur Anzeige)',
      blacklistSave: 'Speichern',
      clearMemory: 'Arrival Memory löschen'
    }
  };

  const Loader = {
    _seenFarmPages: new Set(),

    async ensureUnitSpeeds() {
      const cached = JSON.parse(localStorage.getItem(FG.storage.unitSpeeds) || 'null');
      if (cached) return cached;

      const unitSpeeds = {};
      const xml = await window.$.get('/interface.php?func=get_unit_info');

      window.$(xml).find('config').children().each((i, el) => {
        unitSpeeds[window.$(el).prop('nodeName')] = Util.toNumber(window.$(el).find('speed').text());
      });

      localStorage.setItem(FG.storage.unitSpeeds, JSON.stringify(unitSpeeds));
      return unitSpeeds;
    },

    async buildGroupSelect(selectedId) {
      const groups = await window.$.get(
        window.TribalWars.buildURL('GET', 'groups', { ajax: 'load_group_menu' })
      );

      let html = `<select class="fg-option-group">`;
      groups.result.forEach((val) => {
        if (val.type === 'separator') {
          html += `<option disabled=""></option>`;
        } else {
          html += `<option value="${val.group_id}" ${val.group_id == selectedId ? 'selected' : ''}>${val.name}</option>`;
        }
      });
      html += `</select>`;
      return html;
    },

    async processAllPages(url, processorFn) {
      const isFarm = url.includes('screen=am_farm');
      if (isFarm) this._seenFarmPages = new Set();

      const processPage = async (page) => {
        const pageParam = isFarm ? `&Farm_page=${page}` : `&page=${page}`;
        const html = await window.$.ajax({ url: url + pageParam });
        const $html = window.$(html);

        processorFn($html);

        if (isFarm) {
          const $rows = $html.find('#plunder_list tr[id^="village_"]');
          const rowIds = $rows.map((_, el) => el.id).get();
          const signature = rowIds.join('|');

          if ($rows.length === 0) return true;
          if (!signature) return true;
          if (this._seenFarmPages.has(signature)) return true;

          this._seenFarmPages.add(signature);
          return processPage(page + 1);
        }

        const villageLength =
          $html.find('#scavenge_mass_screen').length > 0
            ? $html.find('tr[id*="scavenge_village"]').length
            : $html.find('tr.row_a, tr.row_ax, tr.row_b, tr.row_bx').length;

        const navSelect = $html.find('.paged-nav-item').first().closest('td').find('select').first();
        const navLength =
          navSelect.length > 0
            ? navSelect.find('option').length - 1
            : $html.find('.paged-nav-item').not('[href*="page=-1"]').length;

        const pageSize =
          window.$('#mobileHeader').length > 0
            ? 10
            : parseInt($html.find('input[name="page_size"]').val() || '100', 10);

        if (page === -1 && villageLength === 1000) {
          return processPage(Math.floor(1000 / pageSize));
        }

        if (page < navLength) {
          return processPage(page + 1);
        }

        return true;
      };

      return processPage(isFarm ? 0 : -1);
    },

    async loadAll(group) {
      const unitSpeeds = await this.ensureUnitSpeeds();
      const allowedUnits = Util.getAllowedUnits();
      const blockedCoords = Util.getBlockedCoords();
      const blockedTargetIds = Util.getBlockedTargetIds();
      const blockedOriginCoords = Util.getBlockedOriginCoords();

      const data = {
        villages: {},
        templates: {},
        commands: {},
        farmMeta: {},
        mapBarbs: {},
        fortressCoords: new Set(),
        blockedCoords,
        blockedTargetIds,
        blockedOriginCoords,
        unitSpeeds,
        allowedUnits
      };

      const villagesProcessor = ($html) => {
        $html.find('#combined_table')
          .find('tr.row_a, tr.row_ax, tr.row_b, tr.row_bx')
          .filter((i, el) => window.$(el).find('.bonus_icon_33').length === 0)
          .each((i, el) => {
            const $el = window.$(el);
            const $label = $el.find('.quickedit-label').first();
            const coord = Util.extractCoord($label.text());
            if (!coord) return;

            const ncoord = Util.normalizeCoord(coord);
            if (blockedOriginCoords.has(ncoord)) return;

            const rawUnits = {};
            $el.find('.unit-item').each((index, element) => {
              const unitName = window.game_data.units[index];
              rawUnits[unitName] = Util.toNumber(window.$(element).text());
            });

            const normalizedUnits = allowedUnits.map((unitName) => rawUnits[unitName] || 0);

            data.villages[ncoord] = {
              name: $label.data('text') || $label.text(),
              id: parseInt($el.find('.quickedit-vn').first().data('id'), 10),
              units: normalizedUnits
            };
          });
      };

      const commandsProcessor = ($html) => {
        $html.find('#commands_table').find('.row_a, .row_ax, .row_b, .row_bx').each((i, el) => {
          const $el = window.$(el);
          const coord = Util.normalizeCoord(
            Util.extractCoord($el.find('.quickedit-label').first().text())
          );
          if (!coord) return;

          if (!data.commands[coord]) data.commands[coord] = [];

          data.commands[coord].push(
            Math.round(Util.timestampFromTwString($el.find('td').eq(2).text().trim()) / 1000)
          );
        });
      };

      const farmProcessor = ($html) => {
        if (window.$.isEmptyObject(data.templates)) {
          $html.find('form[action*="action=edit_all"]').find('input[type="hidden"][name*="template"]')
            .closest('tr')
            .each((i, el) => {
              const $el = window.$(el);
              const prevClass = $el.prev('tr').find('a.farm_icon').first().attr('class') || '';
              const match = prevClass.match(/farm_icon_(.*)\s/);
              if (!match) return;

              const key = match[1];
              const templateInputs = {};

              $el.find('input[type="text"], input[type="number"]').each((index, element) => {
                const $input = window.$(element);
                const rawName = $input.attr('name') || '';
                const unitName = rawName.trim().split('[')[0];
                templateInputs[unitName] = Util.toNumber($input.val());
              });

              const normalizedUnits = allowedUnits.map((unitName) => templateInputs[unitName] || 0);
              let speed = 0;

              allowedUnits.forEach((unitName) => {
                if ((templateInputs[unitName] || 0) > 0) {
                  speed = Math.max(speed, data.unitSpeeds[unitName] || 0);
                }
              });

              data.templates[key] = {
                id: Util.toNumber(
                  $el.find('input[type="hidden"][name*="template"][name*="[id]"]').first().val()
                ),
                units: normalizedUnits,
                speed
              };
            });
        }

        $html.find('#plunder_list').find('tr[id^="village_"]').each((i, el) => {
          const $el = window.$(el);
          const coord = Util.normalizeCoord(
            Util.extractCoord($el.find('a[href*="screen=report&mode=all&view="]').first().text())
          );
          if (!coord) return;

          const targetId = Util.toNumber(($el.attr('id') || '').split('_')[1]);
          const colorMatch = ($el.find('img[src*="graphic/dots/"]').attr('src') || '')
            .match(/dots\/(green|yellow|red|blue|red_blue)/);

          const hasFortressIcon =
            $el.find('.bonus_icon_33, img[src*="bonus_33"], img[src*="bonus_icon_33"]').length > 0;
          if (hasFortressIcon) data.fortressCoords.add(coord);

          data.farmMeta[coord] = {
            id: targetId,
            color: colorMatch ? colorMatch[1] : null,
            max_loot: $el.find('img[src*="max_loot/1"]').length > 0,
            fortress: hasFortressIcon
          };
        });
      };

      const loadBarbsFromMap = async () => {
        const mapText = await window.$.get('/map/village.txt');
        (mapText.match(/[^\r\n]+/g) || []).forEach((line) => {
          const [id, name, x, y, player_id] = line.split(',');
          if (+player_id === 0) {
            const xi = parseInt(x, 10);
            const yi = parseInt(y, 10);
            const coord = Util.normalizeCoord(`${xi}|${yi}`);
            data.mapBarbs[coord] = { id: +id, name, coord, x: xi, y: yi };
          }
        });
      };

      const loadBonusMap = async () => {
        try {
          const bonusText = await window.$.get('/map/bonus.txt');
          const lines = bonusText.match(/[^\r\n]+/g) || [];
          lines.forEach((line) => {
            const parts = line.split(',');
            if (parts.length < 3) return;

            let x = null, y = null, type = null;
            if (parts.length >= 4) {
              x = parseInt(parts[1], 10);
              y = parseInt(parts[2], 10);
              type = parseInt(parts[3], 10);
            } else {
              x = parseInt(parts[0], 10);
              y = parseInt(parts[1], 10);
              type = parseInt(parts[2], 10);
            }

            if (Number.isNaN(x) || Number.isNaN(y) || Number.isNaN(type)) return;
            if (type === FG.fortressBonusType) {
              data.fortressCoords.add(Util.normalizeCoord(`${x}|${y}`));
            }
          });
        } catch (e) {
          Log.warn('bonus.txt konnte nicht geladen oder gelesen werden:', e);
        }
      };

      await Promise.all([
        this.processAllPages(
          window.TribalWars.buildURL('GET', 'overview_villages', { mode: 'combined', group }),
          villagesProcessor
        ),
        this.processAllPages(
          window.TribalWars.buildURL('GET', 'overview_villages', { mode: 'commands', type: 'attack' }),
          commandsProcessor
        ),
        this.processAllPages(window.TribalWars.buildURL('GET', 'am_farm'), farmProcessor),
        loadBarbsFromMap(),
        loadBonusMap()
      ]);

      const serverTime = Math.round(Util.getServerTimestamp() / 1000);

      Object.keys(data.commands).forEach((coord) => {
        data.commands[coord] = data.commands[coord]
          .filter((ts) => Number.isFinite(ts) && ts > serverTime)
          .sort((a, b) => a - b);
      });

      const storedMemory = Util.purgeOldArrivalMemory(Util.getArrivalMemory(), serverTime);

      Object.keys(storedMemory).forEach((coord) => {
        if (!data.commands[coord]) data.commands[coord] = [];
        data.commands[coord] = [...new Set([
          ...data.commands[coord],
          ...storedMemory[coord]
        ])].sort((a, b) => a - b);
      });

      Util.saveArrivalMemory(storedMemory);

      data.farmMeta = Object.fromEntries(
        Object.entries(data.farmMeta).filter(([coord, meta]) => {
          const targetId = meta?.id ? String(meta.id) : null;
          if (data.fortressCoords.has(coord)) return false;
          if (data.blockedCoords.has(coord)) return false;
          if (targetId && data.blockedTargetIds.has(targetId)) return false;
          if (meta?.color === 'red' || meta?.color === 'red_blue') return false;
          return true;
        })
      );

      Object.keys(data.mapBarbs).forEach((coord) => {
        const meta = data.farmMeta[coord];
        const targetId = meta?.id ? String(meta.id) : String(data.mapBarbs[coord]?.id || '');

        if (
          data.fortressCoords.has(coord) ||
          data.blockedCoords.has(coord) ||
          (targetId && data.blockedTargetIds.has(targetId))
        ) {
          delete data.mapBarbs[coord];
        }
      });

      return data;
    }
  };

  const Planner = {
    chooseTemplateForTarget(data, farmMeta, villageUnits, reserveUnits) {
      const templateA = data.templates.a || null;
      const templateB = data.templates.b || null;

      const canUse = (template) => {
        if (!template) return false;
        const effective = villageUnits.map((val, i) => val - (reserveUnits[i] || 0));
        return Util.subtractArrays(effective, template.units) !== false;
      };

      const isLossTarget = farmMeta?.color === 'yellow';

      if (isLossTarget) {
        if (canUse(templateB)) return { name: 'b', template: templateB, reason: 'Verlustziel' };
        if (canUse(templateA)) return { name: 'a', template: templateA, reason: 'Fallback A' };
        return null;
      }

      if (canUse(templateA)) return { name: 'a', template: templateA, reason: 'Standardziel' };
      if (canUse(templateB)) return { name: 'b', template: templateB, reason: 'Fallback B' };
      return null;
    },

    getTargetState(farmMeta) {
      if (!farmMeta) return 'Neu';
      if (farmMeta.color === 'yellow') return 'Verlust';
      if (farmMeta.max_loot) return 'Voll';
      return 'Standard';
    },

    getReserveArray(originCoord, reserveByOrigin, unitCount) {
      const arr = reserveByOrigin[originCoord];
      if (Array.isArray(arr) && arr.length === unitCount) return arr;
      return new Array(unitCount).fill(0);
    },

    getOriginsForTarget(targetCoord, optionDistance, data) {
      const targetObj = Util.coordToObject(targetCoord);
      if (!targetObj) return [];

      const origins = [];
      const villageCoords = Object.keys(data.villages);
      const ceilDistance = Math.ceil(optionDistance);

      for (const originCoord of villageCoords) {
        const village = data.villages[originCoord];
        if (!village) continue;
        if (data.blockedOriginCoords.has(originCoord)) continue;

        const originObj = Util.coordToObject(originCoord);
        if (!originObj) continue;

        if (Math.abs(originObj.x - targetObj.x) > ceilDistance) continue;
        if (Math.abs(originObj.y - targetObj.y) > ceilDistance) continue;

        const dist = Util.distance(originObj, targetObj);
        if (!Number.isFinite(dist) || dist > optionDistance) continue;

        origins.push({
          originCoord,
          village,
          distance: dist
        });
      }

      origins.sort((a, b) => {
        if (a.distance !== b.distance) return a.distance - b.distance;
        return a.originCoord.localeCompare(b.originCoord);
      });

      return origins;
    },

    isArrivalAllowed(arrivals, desiredArrival, minTimeDiff) {
      const sorted = [...new Set(arrivals)]
        .filter((ts) => Number.isFinite(ts))
        .sort((a, b) => a - b);

      for (const ts of sorted) {
        if (Math.abs(ts - desiredArrival) < minTimeDiff) return false;
      }

      return true;
    },

    estimatePlannableForTarget(candidates, minTimeDiff, existingReservations, villageUnitsSnapshot, reserveByOrigin, maxPerTarget) {
      const reservations = [...new Set((existingReservations || []).filter((ts) => Number.isFinite(ts)))].sort((a, b) => a - b);
      const unitsLeftByOrigin = {};
      Object.keys(villageUnitsSnapshot || {}).forEach((originCoord) => {
        unitsLeftByOrigin[originCoord] = [...villageUnitsSnapshot[originCoord]];
      });

      const sortedCandidates = [...candidates].sort((a, b) => {
        if (a.arrivalTime !== b.arrivalTime) return a.arrivalTime - b.arrivalTime;
        if (a.distance !== b.distance) return a.distance - b.distance;
        return a.originCoord.localeCompare(b.originCoord);
      });

      let count = 0;

      for (const candidate of sortedCandidates) {
        if (maxPerTarget > 0 && count >= maxPerTarget) break;

        const currentUnits = unitsLeftByOrigin[candidate.originCoord];
        if (!currentUnits) continue;

        const reserve = this.getReserveArray(candidate.originCoord, reserveByOrigin, currentUnits.length);
        const afterSend = Util.subtractArrays(currentUnits, candidate.chosen.template.units);
        if (!afterSend) continue;

        const respectsReserve = afterSend.every((val, i) => val >= (reserve[i] || 0));
        if (!respectsReserve) continue;

        if (!this.isArrivalAllowed(reservations, candidate.arrivalTime, minTimeDiff)) continue;

        unitsLeftByOrigin[candidate.originCoord] = afterSend;
        reservations.push(candidate.arrivalTime);
        reservations.sort((a, b) => a - b);
        count++;
      }

      return count;
    },

    buildTargetPools(optionDistance, data, serverTime, reserveByOrigin) {
      const targetPools = {};
      const unitCount = data.allowedUnits.length;

      for (const [targetCoord, barb] of Object.entries(data.mapBarbs)) {
        const farmMeta = data.farmMeta[targetCoord] || null;
        const targetId = farmMeta?.id ? String(farmMeta.id) : String(barb.id);

        if (data.fortressCoords.has(targetCoord)) continue;
        if (data.blockedCoords.has(targetCoord)) continue;
        if (data.blockedTargetIds.has(targetId)) continue;
        if (farmMeta?.fortress) continue;

        const origins = this.getOriginsForTarget(targetCoord, optionDistance, data);
        if (!origins.length) continue;

        const targetCandidates = [];

        for (const entry of origins) {
          const { originCoord, village, distance } = entry;
          const reserve = this.getReserveArray(originCoord, reserveByOrigin, unitCount);
          const chosen = this.chooseTemplateForTarget(data, farmMeta, village.units, reserve);
          if (!chosen) continue;

          const arrivalTime = Math.round(serverTime + distance * chosen.template.speed * 60);

          targetCandidates.push({
            originCoord,
            originId: village.id,
            originName: village.name,
            targetCoord,
            targetId: farmMeta?.id || barb.id,
            distance,
            chosen,
            arrivalTime,
            targetState: this.getTargetState(farmMeta)
          });
        }

        if (targetCandidates.length) targetPools[targetCoord] = targetCandidates;
      }

      return targetPools;
    },

    createPlanning(options, data) {
      const optionDistance = options.optionDistance;
      const optionInterval = options.optionInterval;
      const optionMaxPerTarget = Math.max(0, Util.toInt(options.optionMaxPerTarget, FG.defaultMaxPerTarget));

      const serverTime = Math.round(Util.getServerTimestamp() / 1000);
      const persistentMemory = Util.purgeOldArrivalMemory(Util.getArrivalMemory(), serverTime);

      const plan = {
        counter: 0,
        targets: {},
        targetOrder: [],
        targetStats: {}
      };

      const minTimeDiff = Math.round((optionInterval || FG.defaultIntervalMinutes) * 60);

      const targetReservations = {};
      const villageUnitsLeft = {};
      const reserveByOrigin = {};

      Object.keys(data.commands || {}).forEach((coord) => {
        targetReservations[coord] = [...new Set(
          (data.commands[coord] || []).filter((ts) => Number.isFinite(ts) && ts > serverTime)
        )].sort((a, b) => a - b);
      });

      Object.keys(persistentMemory || {}).forEach((coord) => {
        if (!targetReservations[coord]) targetReservations[coord] = [];
        targetReservations[coord] = [...new Set([
          ...targetReservations[coord],
          ...(persistentMemory[coord] || []).filter((ts) => Number.isFinite(ts) && ts > serverTime)
        ])].sort((a, b) => a - b);
      });

      Object.keys(data.villages).forEach((originCoord) => {
        const village = data.villages[originCoord];
        if (!village) return;
        villageUnitsLeft[originCoord] = [...village.units];
        reserveByOrigin[originCoord] = Util.normalizeReserveObject(
          options.reserve || {},
          data.allowedUnits
        );
        reserveByOrigin[originCoord] = data.allowedUnits.map((unit) => reserveByOrigin[originCoord][unit] || 0);
      });

      const targetPools = this.buildTargetPools(optionDistance, data, serverTime, reserveByOrigin);
      const estimatedStats = {};

      Object.entries(targetPools).forEach(([targetCoord, candidates]) => {
        estimatedStats[targetCoord] = this.estimatePlannableForTarget(
          candidates,
          minTimeDiff,
          targetReservations[targetCoord] || [],
          villageUnitsLeft,
          reserveByOrigin,
          optionMaxPerTarget
        );
      });

      const sortedTargets = Object.entries(targetPools).sort((a, b) => {
        const aEstimated = estimatedStats[a[0]] || 0;
        const bEstimated = estimatedStats[b[0]] || 0;
        if (bEstimated !== aEstimated) return bEstimated - aEstimated;

        const aCandidates = a[1].length;
        const bCandidates = b[1].length;
        if (bCandidates !== aCandidates) return bCandidates - aCandidates;

        const aFirst = Math.min(...a[1].map((x) => x.arrivalTime));
        const bFirst = Math.min(...b[1].map((x) => x.arrivalTime));
        if (aFirst !== bFirst) return aFirst - bFirst;

        return a[0].localeCompare(b[0]);
      });

      plan.targetOrder = sortedTargets.map(([targetCoord]) => targetCoord);

      sortedTargets.forEach(([targetCoord, candidates]) => {
        plan.targetStats[targetCoord] = {
          possible: candidates.length,
          planned: 0
        };
      });

      for (const [targetCoord, candidates] of sortedTargets) {
        if (plan.counter >= FG.maxPlannedPerCycle) break;

        if (!targetReservations[targetCoord]) targetReservations[targetCoord] = [];
        if (!plan.targets[targetCoord]) plan.targets[targetCoord] = [];

        const sortedCandidates = [...candidates].sort((a, b) => {
          if (a.arrivalTime !== b.arrivalTime) return a.arrivalTime - b.arrivalTime;
          if (a.distance !== b.distance) return a.distance - b.distance;
          return a.originCoord.localeCompare(b.originCoord);
        });

        for (const candidate of sortedCandidates) {
          if (plan.counter >= FG.maxPlannedPerCycle) break;
          if (optionMaxPerTarget > 0 && plan.targets[targetCoord].length >= optionMaxPerTarget) break;

          const currentUnits = villageUnitsLeft[candidate.originCoord];
          if (!currentUnits) continue;

          const reserve = this.getReserveArray(candidate.originCoord, reserveByOrigin, currentUnits.length);
          const afterSend = Util.subtractArrays(currentUnits, candidate.chosen.template.units);
          if (!afterSend) continue;

          const respectsReserve = afterSend.every((val, i) => val >= (reserve[i] || 0));
          if (!respectsReserve) continue;

          if (!this.isArrivalAllowed(targetReservations[targetCoord], candidate.arrivalTime, minTimeDiff)) continue;

          plan.targets[targetCoord].push({
            origin: {
              coord: candidate.originCoord,
              name: candidate.originName,
              id: candidate.originId
            },
            target: {
              coord: candidate.targetCoord,
              id: candidate.targetId
            },
            fields: candidate.distance,
            template: {
              name: candidate.chosen.name,
              id: candidate.chosen.template.id
            },
            meta: {
              status: candidate.targetState,
              intervalMinutes: optionInterval,
              reason: `${candidate.chosen.reason} | Ziel-Priorität`,
              desiredArrivalTime: candidate.arrivalTime,
              desiredArrivalText: Util.formatTime(candidate.arrivalTime),
              arrivalTime: candidate.arrivalTime,
              arrivalText: Util.formatTime(candidate.arrivalTime)
            }
          });

          villageUnitsLeft[candidate.originCoord] = afterSend;

          targetReservations[targetCoord].push(candidate.arrivalTime);
          targetReservations[targetCoord] = [...new Set(targetReservations[targetCoord])].sort((a, b) => a - b);

          if (!persistentMemory[targetCoord]) persistentMemory[targetCoord] = [];
          persistentMemory[targetCoord].push(candidate.arrivalTime);
          persistentMemory[targetCoord] = [...new Set(persistentMemory[targetCoord])].sort((a, b) => a - b);

          plan.targetStats[targetCoord].planned++;
          plan.counter++;
        }

        if (plan.targets[targetCoord].length === 0) {
          delete plan.targets[targetCoord];
        }
      }

      plan.targetOrder = plan.targetOrder.filter((coord) => Array.isArray(plan.targets[coord]) && plan.targets[coord].length > 0);

      data.commands = targetReservations;
      Util.saveArrivalMemory(Util.purgeOldArrivalMemory(persistentMemory, serverTime));

      return plan;
    }
  };

  const UIBuilder = {
    async buildOptionsHtml() {
      const t = I18N.de;
      const options = Util.getSavedOptions();
      const groupSelect = await Loader.buildGroupSelect(options.optionGroup);
      const allowedUnits = Util.getAllowedUnits();
      const reserve = Util.normalizeReserveObject(options.reserve || {}, allowedUnits);

      const reserveInputs = allowedUnits.map((unit) => {
        return `
          <tr>
            <td>${unit}</td>
            <td><input type="text" class="fg-reserve-input" data-unit="${unit}" value="${reserve[unit] || 0}" size="5"></td>
          </tr>
        `;
      }).join('');

      return `
        <style>
          #popup_box_FarmGod { text-align:center; width:760px; }
        </style>
        <h3>${t.optionsTitle}</h3><br>
        <div class="fg-options-content">
          <div class="info_box" style="line-height:15px;font-size:10px;text-align:left;">
            <p style="margin:0 5px;">${t.optionsHint}</p>
          </div>
          <br>
          <table class="vis" style="width:100%;text-align:left;">
            <tr><td>${t.group}</td><td>${groupSelect}</td></tr>
            <tr><td>${t.distance}</td><td><input type="text" class="fg-option-distance" value="${options.optionDistance}" size="5"></td></tr>
            <tr><td>${t.timeInterval}</td><td><input type="text" class="fg-option-interval" value="${options.optionInterval}" size="5"></td></tr>
            <tr><td>${t.maxPerTarget}</td><td><input type="text" class="fg-option-max-per-target" value="${options.optionMaxPerTarget || FG.defaultMaxPerTarget}" size="5"></td></tr>
          </table>
          <br>
          <table class="vis" style="width:100%;text-align:left;">
            <tr><th colspan="2">${t.reserveTitle}</th></tr>
            ${reserveInputs}
          </table>
          <br>
          <input type="button" class="btn fg-plan-button" value="${t.button}">
        </div>
      `;
    },

    buildPlanTable(plan) {
      const t = I18N.de;
      const planTargets = plan.targets || {};
      const targetOrder = plan.targetOrder || {};
      let rowIndex = 0;

      let html = `
        <div class="vis farmGodContent">
          <h4>FarmGod Pro</h4>
          <table class="vis" width="100%">
            <tr>
              <div id="${FG.progressBarId}" class="progress-bar live-progress-bar progress-bar-alive" style="width:98%;margin:5px auto;">
                <div style="background: rgb(146, 194, 0);"></div>
                <span class="label" style="margin-top:0;"></span>
              </div>
            </tr>
            <tr>
              <th style="text-align:center;">${t.target}</th>
              <th style="text-align:center;">${t.origin}</th>
              <th style="text-align:center;">${t.fields}</th>
              <th style="text-align:center;">${t.template}</th>
              <th style="text-align:center;">${t.status}</th>
              <th style="text-align:center;">${t.interval}</th>
              <th style="text-align:center;">${t.arrival}</th>
              <th style="text-align:center;">${t.farm}</th>
            </tr>
      `;

      const orderedKeys = Array.isArray(targetOrder)
        ? targetOrder.filter((targetCoord) => Array.isArray(planTargets?.[targetCoord]) && planTargets[targetCoord].length > 0)
        : [];

      if (orderedKeys.length) {
        orderedKeys.forEach((targetCoord) => {
          const entries = [...planTargets[targetCoord]].sort((a, b) => {
            if (a.meta.arrivalTime !== b.meta.arrivalTime) return a.meta.arrivalTime - b.meta.arrivalTime;
            if (a.fields !== b.fields) return a.fields - b.fields;
            return a.origin.coord.localeCompare(b.origin.coord);
          });

          entries.forEach((val) => {
            html += `
              <tr class="farmRow row_${rowIndex % 2 === 0 ? 'a' : 'b'}"
                  data-target-group="${val.target.coord}"
                  data-target-coord="${val.target.coord}"
                  data-target-id="${val.target.id}"
                  data-origin-coord="${val.origin.coord}">
                <td style="text-align:center;">
                  <a href="${window.game_data.link_base_pure}info_village&id=${val.target.id}">
                    ${val.target.coord}
                  </a>
                </td>
                <td style="text-align:center;">
                  <a href="${window.game_data.link_base_pure}info_village&id=${val.origin.id}">
                    ${val.origin.name} (${val.origin.coord})
                  </a>
                </td>
                <td style="text-align:center;">${val.fields.toFixed(2)}</td>
                <td style="text-align:center;">${String(val.template.name).toUpperCase()}</td>
                <td style="text-align:center;">${val.meta.status}</td>
                <td style="text-align:center;">${val.meta.intervalMinutes} min</td>
                <td style="text-align:center;">${val.meta.arrivalText}</td>
                <td style="text-align:center;">
                  <a href="#"
                     data-origin="${val.origin.id}"
                     data-target="${val.target.id}"
                     data-template="${val.template.id}"
                     data-coord="${val.target.coord}"
                     data-arrival="${val.meta.arrivalTime}"
                     class="fg-farm-icon farm_icon farm_icon_${val.template.name}"
                     style="margin:auto;"></a>
                </td>
              </tr>
            `;
            rowIndex++;
          });
        });
      } else {
        html += `<tr><td colspan="8" style="text-align:center;">${t.noFarms}</td></tr>`;
      }

      html += `</table></div>`;
      return html;
    },

    buildBlacklistManagerHtml() {
      const t = I18N.de;
      const targetCoords = Array.from(Util.getBlockedCoords()).join('\n');
      const originCoords = Array.from(Util.getBlockedOriginCoords()).join('\n');
      const targetIds = Array.from(Util.getBlockedTargetIds()).join(', ');

      return `
        <style>
          #popup_box_FarmGodBlacklist { text-align:center; width:760px; }
          .fg-bl-textarea { width: 98%; height: 150px; resize: vertical; }
        </style>
        <h3>${t.blacklistTitle}</h3>
        <div style="text-align:left;">
          <div class="info_box" style="line-height:15px;font-size:10px;text-align:left;margin-bottom:8px;">
            <p style="margin:0 5px;">${t.blacklistHint}</p>
          </div>

          <table class="vis" style="width:100%;">
            <tr><th>${t.blacklistTargets}</th></tr>
            <tr><td><textarea class="fg-bl-targets fg-bl-textarea">${targetCoords}</textarea></td></tr>
          </table>

          <br>

          <table class="vis" style="width:100%;">
            <tr><th>${t.blacklistOrigins}</th></tr>
            <tr><td><textarea class="fg-bl-origins fg-bl-textarea">${originCoords}</textarea></td></tr>
          </table>

          <br>

          <table class="vis" style="width:100%;">
            <tr><th>${t.blacklistIds}</th></tr>
            <tr><td style="font-size:11px; word-break:break-word;">${targetIds || '-'}</td></tr>
          </table>

          <br>
          <div style="text-align:center;">
            <input type="button" class="btn fg-blacklist-save-btn" value="${t.blacklistSave}">
          </div>
        </div>
      `;
    },

    showLoading() {
      window.$('.fg-options-content').html(window.UI.Throbber[0].outerHTML + '<br><br>' + I18N.de.loading);
    },

    openBlacklistManager() {
      window.Dialog.show('FarmGodBlacklist', this.buildBlacklistManagerHtml());

      window.$('.fg-blacklist-save-btn').off('click').on('click', () => {
        const targetText = String(window.$('.fg-bl-targets').val() || '');
        const originText = String(window.$('.fg-bl-origins').val() || '');

        const targetCoords = Util.parseCoordList(targetText);
        const originCoords = Util.parseCoordList(originText);

        Util.setBlockedCoords(targetCoords);
        Util.setBlockedOriginCoords(originCoords);

        this.refreshStatusInfo();
        this.removeBlockedRowsFromDom();
        window.Dialog.close();
        window.UI.SuccessMessage('Blacklist gespeichert.');
      });
    },

    removeBlockedRowsFromDom() {
      const blockedCoords = Util.getBlockedCoords();
      const blockedTargetIds = Util.getBlockedTargetIds();
      const blockedOriginCoords = Util.getBlockedOriginCoords();

      document.querySelectorAll('.farmRow').forEach((row) => {
        const coord = Util.normalizeCoord(row.getAttribute('data-target-coord') || '');
        const targetId = String(row.getAttribute('data-target-id') || '');
        const originCoord = Util.normalizeCoord(row.getAttribute('data-origin-coord') || '');

        if (
          blockedCoords.has(coord) ||
          blockedTargetIds.has(targetId) ||
          blockedOriginCoords.has(originCoord) ||
          coord === '407|562'
        ) {
          row.remove();
        }
      });
    },

    renderPlan(plan) {
      window.$('.farmGodContent').remove();
      window.$('#am_widget_Farm').first().before(this.buildPlanTable(plan));
      this.removeBlockedRowsFromDom();

      window.UI.InitProgressBars();
      const count = document.querySelectorAll('.farmRow').length;
      window.UI.updateProgressBar(window.$(`#${FG.progressBarId}`), 0, count);
      window.$(`#${FG.progressBarId}`).data('current', 0).data('max', count);
      this.refreshStatusInfo();
    },

    helperPanelHtml() {
      const t = I18N.de;
      return `
        <div class="vis" id="fg-helper-panel">
          <table style="width:100%">
            <tbody>
              <tr><th>${t.helperTitle}</th></tr>
              <tr>
                <td style="padding:6px;text-align:center;">
                  <button id="fg-open-btn" class="btn" style="margin-right:6px;">${t.helperOpen}</button>
                  <button id="fg-helper-toggle-btn" class="btn" style="margin-right:6px;">${t.helperStart}</button>
                  <button id="fg-blacklist-open-btn" class="btn" style="margin-right:6px;">${t.blacklistOpen}</button>
                  <button id="fg-blacklist-clear-btn" class="btn" style="margin-right:6px;">${t.blacklistClear}</button>
                  <button id="fg-clear-memory-btn" class="btn" style="margin-right:6px;">${t.clearMemory}</button>
                  <button id="fg-hard-reset-btn" class="btn">${t.hardReset}</button>
                </td>
              </tr>
              <tr>
                <td id="fg-helper-status" style="padding:6px;text-align:center;">${t.helperIdle}</td>
              </tr>
              <tr>
                <td id="fg-blacklist-info" style="padding:6px;text-align:center;font-size:11px;"></td>
              </tr>
            </tbody>
          </table>
        </div>
      `;
    },

    mountHelperPanel() {
      if (document.querySelector('#fg-helper-panel')) return;
      const target =
        document.querySelector('#farm_units')?.parentNode ||
        document.querySelector('#am_widget_Farm')?.parentNode ||
        document.body;

      const wrapper = document.createElement('div');
      wrapper.innerHTML = this.helperPanelHtml();
      target.appendChild(wrapper.firstElementChild);
      this.refreshStatusInfo();
    },

    refreshStatusInfo() {
      const el = document.querySelector('#fg-blacklist-info');
      if (!el) return;

      const rowCount = document.querySelectorAll('.farmRow').length;
      const mem = Util.getArrivalMemory();
      const memTargets = Object.keys(mem).length;

      el.textContent =
        `Ziel-Blacklist: ${Util.getBlockedCoords().size} Koordinaten | ` +
        `Origin-Blacklist: ${Util.getBlockedOriginCoords().size} Dörfer | ` +
        `Auto-Ziel-IDs: ${Util.getBlockedTargetIds().size} | ` +
        `Arrival-Memory Ziele: ${memTargets} | ` +
        `Aktuell geplant: ${rowCount}`;
    },

    clearBlacklistUi() {
      Util.clearBlacklist();
      this.refreshStatusInfo();
      this.removeBlockedRowsFromDom();
      window.UI.SuccessMessage('Blacklist wurde geleert.');
    },

    clearMemoryUi() {
      Util.clearArrivalMemory();
      this.refreshStatusInfo();
      window.UI.SuccessMessage('Arrival Memory wurde geleert.');
    },

    hardResetUi() {
      Helper.stop();
      Util.hardResetAll();

      document.querySelectorAll('.farmRow').forEach((row) => row.remove());

      const pb = window.$(`#${FG.progressBarId}`);
      if (pb.length) {
        pb.data('current', 0).data('max', 0);
        window.UI.updateProgressBar(pb, 0, 0);
      }

      this.refreshStatusInfo();
      this.setHelperStatus(I18N.de.hardResetDone);
      window.UI.SuccessMessage(I18N.de.hardResetDone);
    },

    setHelperStatus(text) {
      const el = document.querySelector('#fg-helper-status');
      if (el) el.textContent = text;
    },

    setHelperButtonRunning(isRunning, nextRunTime = null) {
      const t = I18N.de;
      const btn = document.querySelector('#fg-helper-toggle-btn');
      const status = document.querySelector('#fg-helper-status');
      if (!btn || !status) return;

      if (isRunning) {
        btn.textContent = t.helperStop;
        btn.style.backgroundColor = '#b30000';
        btn.style.color = '#fff';

        if (nextRunTime) {
          const d = new Date(nextRunTime);
          const hh = String(d.getHours()).padStart(2, '0');
          const mm = String(d.getMinutes()).padStart(2, '0');
          status.textContent = `Nächster Lauf: ${hh}:${mm}`;
        }
      } else {
        btn.textContent = t.helperStart;
        btn.style.backgroundColor = '';
        btn.style.color = '';
      }
    }
  };

  const Sender = {
    farmBusy: false,

    sendFarm($icon) {
      const n = window.Timing.getElapsedTimeSinceLoad();

      if (
        this.farmBusy ||
        (window.Accountmanager.farm.last_click && n - window.Accountmanager.farm.last_click < 200)
      ) return;

      this.farmBusy = true;
      window.Accountmanager.farm.last_click = n;

      const $pb = window.$(`#${FG.progressBarId}`);
      const targetCoord = Util.normalizeCoord($icon.data('coord'));
      const targetId = String($icon.data('target'));
      const originCoord = Util.normalizeCoord(
        $icon.closest('.farmRow').attr('data-origin-coord') || ''
      );

      if (
        Util.getBlockedCoords().has(targetCoord) ||
        Util.getBlockedTargetIds().has(targetId) ||
        Util.getBlockedOriginCoords().has(originCoord) ||
        targetCoord === '407|562'
      ) {
        $icon.closest('.farmRow').remove();
        UIBuilder.refreshStatusInfo();
        this.farmBusy = false;
        return;
      }

      window.TribalWars.post(
        window.Accountmanager.send_units_link.replace(/village=(\d+)/, 'village=' + $icon.data('origin')),
        null,
        {
          target: $icon.data('target'),
          template_id: $icon.data('template'),
          source: $icon.data('origin')
        },
        (r) => {
          window.UI.SuccessMessage(r.success);
          $pb.data('current', $pb.data('current') + 1);
          window.UI.updateProgressBar($pb, $pb.data('current'), $pb.data('max'));
          $icon.closest('.farmRow').remove();
          UIBuilder.refreshStatusInfo();
          this.farmBusy = false;
        },
        (r) => {
          if (Util.shouldBlacklistError(r)) {
            Util.addBlockedCoord(targetCoord);
            Util.addBlockedTargetId(targetId);
            UIBuilder.refreshStatusInfo();
          }

          window.UI.ErrorMessage(r || I18N.de.sendError);
          $pb.data('current', $pb.data('current') + 1);
          window.UI.updateProgressBar($pb, $pb.data('current'), $pb.data('max'));
          $icon.closest('.farmRow').remove();
          this.farmBusy = false;
        }
      );
    },

    bindPlanEvents() {
      window.$('.fg-farm-icon')
        .off('click')
        .on('click', (event) => {
          event.preventDefault();
          this.sendFarm(window.$(event.currentTarget));
        });

      window.$(document)
        .off('keydown.fgprov981')
        .on('keydown.fgprov981', (event) => {
          if ((event.keyCode || event.which) === 13) {
            const first = document.querySelector('.fg-farm-icon');
            if (first) first.click();
          }
        });
    }
  };

  const App = {
    async openDialog() {
      const html = await UIBuilder.buildOptionsHtml();
      window.Dialog.show('FarmGod', html);

      const btn = document.querySelector('.fg-plan-button');
      if (btn) btn.focus();

      window.$('.fg-plan-button').off('click').on('click', async () => {
        const reserve = {};
        document.querySelectorAll('.fg-reserve-input').forEach((input) => {
          const unit = input.getAttribute('data-unit');
          reserve[unit] = Math.max(0, Util.toInt(input.value, 0));
        });

        const options = {
          optionGroup: parseInt(window.$('.fg-option-group').val(), 10),
          optionDistance: parseFloat(window.$('.fg-option-distance').val()),
          optionInterval: parseFloat(window.$('.fg-option-interval').val()),
          optionMaxPerTarget: Math.max(0, Util.toInt(window.$('.fg-option-max-per-target').val(), FG.defaultMaxPerTarget)),
          reserve
        };

        Util.saveOptions(options);
        UIBuilder.showLoading();

        try {
          const plan = await this.planWithOptions(options);
          window.Dialog.close();
          UIBuilder.renderPlan(plan);
          Sender.bindPlanEvents();
        } catch (e) {
          Log.error('Fehler bei Planung:', e);
          window.UI.ErrorMessage('Fehler beim Laden oder Planen der Daten.');
        }
      });
    },

    async planWithOptions(options) {
      const data = await Loader.loadAll(options.optionGroup);
      return Planner.createPlanning(options, data);
    },

    async planFromSavedOptions() {
      const options = Util.getSavedOptions();
      const plan = await this.planWithOptions(options);
      UIBuilder.renderPlan(plan);
      Sender.bindPlanEvents();
      return plan;
    },

    async init() {
      if (!Util.isFarmPage()) return false;

      if (
        window.game_data?.features &&
        (
          !window.game_data.features.Premium ||
          !window.game_data.features.FarmAssistent ||
          !window.game_data.features.Premium.active ||
          !window.game_data.features.FarmAssistent.active
        )
      ) {
        window.UI.ErrorMessage(I18N.de.missingFeatures);
        return false;
      }

      await Loader.ensureUnitSpeeds();
      UIBuilder.mountHelperPanel();
      return true;
    }
  };

  const Helper = {
    isRunning: false,
    timeoutId: null,
    sentInCurrentCycle: 0,

    getCycleIntervalMs() {
      return Util.getRandomInt(FG.helperCycleMinMinutes, FG.helperCycleMaxMinutes) * 60 * 1000;
    },

    botDetectionDetected() {
      const element = document.getElementById('botprotection_quest');
      const botProtectionRow = document.getElementsByClassName('bot-protection-row');
      if (element || botProtectionRow.length > 0) {
        window.alert('Einmal Bot-Schutz eingeben bitte.');
        return true;
      }
      return false;
    },

    sessionExpiredDetected() {
      return Util.isSessionExpired();
    },

    async processFarmRows() {
      let rows = document.querySelectorAll('.farmRow');
      this.sentInCurrentCycle = 0;

      if (!rows.length) {
        UIBuilder.setHelperStatus(I18N.de.helperNoRows);
        return;
      }

      while (rows.length > 0) {
        if (!this.isRunning) return;
        if (this.sessionExpiredDetected()) {
          this.stop('session');
          return;
        }
        if (this.botDetectionDetected()) {
          this.stop('bot');
          return;
        }

        UIBuilder.removeBlockedRowsFromDom();
        rows = document.querySelectorAll('.farmRow');
        if (!rows.length) return;

        UIBuilder.setHelperStatus(`${I18N.de.helperRunning} (${rows.length})`);

        const clickDelay = Util.getRandomInt(FG.helperClickDelayMinMs, FG.helperClickDelayMaxMs);
        await Util.delay(clickDelay);

        const enterEvent = new KeyboardEvent('keydown', {
          key: 'Enter',
          code: 'Enter',
          which: 13,
          keyCode: 13,
          bubbles: true,
          cancelable: true
        });
        document.dispatchEvent(enterEvent);

        this.sentInCurrentCycle++;

        if (
          FG.helperBreakEverySends > 0 &&
          this.sentInCurrentCycle > 0 &&
          this.sentInCurrentCycle % FG.helperBreakEverySends === 0
        ) {
          const breakMs = Util.getRandomInt(FG.helperBreakMinMs, FG.helperBreakMaxMs);
          await Util.delay(breakMs);
        }

        await Util.delay(60);
        UIBuilder.removeBlockedRowsFromDom();
        rows = document.querySelectorAll('.farmRow');
      }
    },

    async runCycle() {
      if (!this.isRunning) return;
      if (this.sessionExpiredDetected()) {
        this.stop('session');
        return;
      }
      if (this.botDetectionDetected()) {
        this.stop('bot');
        return;
      }

      try {
        UIBuilder.setHelperStatus(I18N.de.helperStarting);
        const plan = await App.planFromSavedOptions();

        if (this.sessionExpiredDetected()) {
          this.stop('session');
          return;
        }

        if (!plan || !document.querySelectorAll('.farmRow').length) {
          UIBuilder.setHelperStatus(I18N.de.helperNoRows);
        } else {
          await Util.delay(250);
          await this.processFarmRows();
        }

        if (!this.isRunning) return;

        const nextMs = this.getCycleIntervalMs();
        const nextRun = Date.now() + nextMs;

        UIBuilder.setHelperButtonRunning(true, nextRun);
        localStorage.setItem(FG.storage.helperEnabled, 'true');

        this.timeoutId = setTimeout(() => {
          this.runCycle();
        }, nextMs);
      } catch (e) {
        Log.error('Fehler im Helper-Zyklus:', e);
        this.stop();
        window.UI.ErrorMessage('Fehler im Auto-Helper.');
      }
    },

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      localStorage.setItem(FG.storage.helperEnabled, 'true');
      UIBuilder.setHelperButtonRunning(true);
      this.runCycle();
    },

    stop(reason = 'idle') {
      if (this.timeoutId) {
        clearTimeout(this.timeoutId);
        this.timeoutId = null;
      }

      this.isRunning = false;
      localStorage.setItem(FG.storage.helperEnabled, 'false');

      if (reason === 'bot') {
        UIBuilder.setHelperStatus(I18N.de.helperBot);
      } else if (reason === 'session') {
        UIBuilder.setHelperStatus(I18N.de.helperSession);
      } else {
        UIBuilder.setHelperStatus(I18N.de.helperStopping);
        setTimeout(() => {
          if (!this.isRunning) UIBuilder.setHelperStatus(I18N.de.helperIdle);
        }, 800);
      }

      UIBuilder.setHelperButtonRunning(false);
    },

    bind() {
      const openBtn = document.querySelector('#fg-open-btn');
      const toggleBtn = document.querySelector('#fg-helper-toggle-btn');
      const blacklistOpenBtn = document.querySelector('#fg-blacklist-open-btn');
      const clearBlacklistBtn = document.querySelector('#fg-blacklist-clear-btn');
      const clearMemoryBtn = document.querySelector('#fg-clear-memory-btn');
      const hardResetBtn = document.querySelector('#fg-hard-reset-btn');

      if (openBtn) openBtn.addEventListener('click', () => App.openDialog());

      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          if (this.isRunning) this.stop();
          else this.start();
        });
      }

      if (blacklistOpenBtn) {
        blacklistOpenBtn.addEventListener('click', () => {
          UIBuilder.openBlacklistManager();
        });
      }

      if (clearBlacklistBtn) {
        clearBlacklistBtn.addEventListener('click', () => {
          UIBuilder.clearBlacklistUi();
        });
      }

      if (clearMemoryBtn) {
        clearMemoryBtn.addEventListener('click', () => {
          UIBuilder.clearMemoryUi();
        });
      }

      if (hardResetBtn) {
        hardResetBtn.addEventListener('click', () => {
          UIBuilder.hardResetUi();
        });
      }
    }
  };

  function waitForGame() {
    let tries = 0;

    const interval = setInterval(async () => {
      tries++;

      if (
        typeof window.$ !== 'undefined' &&
        typeof window.game_data !== 'undefined' &&
        typeof window.TribalWars !== 'undefined' &&
        typeof window.UI !== 'undefined'
      ) {
        clearInterval(interval);

        try {
          const ok = await App.init();
          if (!ok) return;
          Helper.bind();

          const autoEnabled = localStorage.getItem(FG.storage.helperEnabled) === 'true';
          if (autoEnabled) Helper.start();
        } catch (e) {
          Log.error('Startfehler:', e);
        }
      } else if (tries >= FG.maxWait) {
        clearInterval(interval);
        Log.warn('Spielumgebung wurde nicht rechtzeitig geladen.');
      }
    }, FG.waitMs);
  }

  window.FarmGodPro = {
    open: () => App.openDialog(),
    plan: () => App.planFromSavedOptions(),
    start: () => Helper.start(),
    stop: () => Helper.stop()
  };

  waitForGame();
})();
