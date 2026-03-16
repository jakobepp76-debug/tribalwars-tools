// ==UserScript==
// @name         FarmGod DE PRO V5.2.2 MOBILE HELPER
// @namespace    https://example.com/
// @version      5.2.2
// @description  FarmGod Pro mit 2 Zeitwellen, A/B-Logik, Status-Spalten, Blacklist-Manager, Sitzungs-Check und mobilem Auto-Helper
// @author       angepasst
// @match        *://*.die-staemme.de/*
// @match        *://*.tribalwars.*/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function () {
  'use strict';

  const FG = {
    name: 'FarmGod DE PRO V5.2.2 MOBILE HELPER',
    debug: true,
    onlyScreen: 'am_farm',
    waitMs: 300,
    maxWait: 60,
    maxRounds: 500,
    progressBarId: 'FarmGodProgessbar',
    fortressBonusType: 33,

    helperCycleMinMinutes: 10,
    helperCycleMaxMinutes: 25,
    helperClickDelayMinMs: 130,
    helperClickDelayMaxMs: 170,
    helperBreakEverySends: 50,
    helperBreakMinMs: 800,
    helperBreakMaxMs: 1500,

    manualBlockedCoords: ['407|562'],
    manualBlockedTargetIds: [],

    storage: {
      options: 'fg_pro_v522_options',
      unitSpeeds: 'fg_pro_v522_unit_speeds',
      helperEnabled: 'fg_pro_v522_helper_enabled',
      blockedCoords: 'fg_pro_v522_blocked_coords',
      blockedTargetIds: 'fg_pro_v522_blocked_target_ids'
    }
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
        optionDistance: 30,
        optionTimeFull: 10,
        optionTimeNotFull: 20
      };
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

    addBlockedCoord(coord) {
      const c = Util.normalizeCoord(coord);
      if (!c) return;
      const blocked = Util.getBlockedCoords();
      blocked.add(c);
      Util.saveBlockedCoords(blocked);
      Log.warn('Koordinate blockiert:', c);
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
      Log.warn('Target-ID blockiert:', String(id));
    },

    clearBlacklist() {
      localStorage.setItem(FG.storage.blockedCoords, '[]');
      localStorage.setItem(FG.storage.blockedTargetIds, '[]');
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
    }
  };

  const I18N = {
    de: {
      missingFeatures: 'Das Script benötigt Premium und den Farm-Assistenten!',
      optionsTitle: 'FarmGod Pro Optionen',
      optionsHint:
        '<b>Pro-Logik:</b><br>- Volle Beute = kurzer Abstand<br>- Nicht volle / unbekannte Beute = langer Abstand<br>- Gelb/Teilverluste = immer Vorlage B<br>- Sonst immer Vorlage A<br>- Mobiler Auto-Helper klickt direkt auf Farm-Buttons',
      group: 'Aus welcher Gruppe soll gefarmt werden:',
      distance: 'Maximale Laufdistanz in Feldern:',
      timeFull: 'Zeitabstand bei voller Beute (Minuten):',
      timeNotFull: 'Zeitabstand bei nicht voller / unbekannter Beute (Minuten):',
      button: 'Farmen planen',
      noFarms: 'Mit den aktuellen Einstellungen konnten keine Farmergebnisse gefunden werden.',
      origin: 'Herkunft',
      target: 'Ziel',
      fields: 'Felder',
      farm: 'Farm',
      template: 'Vorlage',
      status: 'Status',
      interval: 'Abstand',
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
      blacklistShow: 'Blacklist anzeigen',
      blacklistClear: 'Blacklist leeren'
    }
  };

  const Loader = {
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
      const processPage = async (page, wrapFn) => {
        const pageText = url.match('am_farm') ? `&Farm_page=${page}` : `&page=${page}`;
        const html = await window.$.ajax({ url: url + pageText });
        return wrapFn(page, window.$(html));
      };

      const determineNextPage = (page, $html) => {
        const villageLength =
          $html.find('#scavenge_mass_screen').length > 0
            ? $html.find('tr[id*="scavenge_village"]').length
            : $html.find('tr.row_a, tr.row_ax, tr.row_b, tr.row_bx').length;

        const navSelect = $html.find('.paged-nav-item').first().closest('td').find('select').first();

        const navLength =
          $html.find('#am_widget_Farm').length > 0
            ? (() => {
                const pages = $html.find('#plunder_list_nav').first().find('a.paged-nav-item, strong.paged-nav-item');
                if (!pages.length) return 0;
                const txt = pages[pages.length - 1].textContent.replace(/\D/g, '');
                return Math.max(0, parseInt(txt || '0', 10) - 1);
              })()
            : navSelect.length > 0
              ? navSelect.find('option').length - 1
              : $html.find('.paged-nav-item').not('[href*="page=-1"]').length;

        const pageSize =
          window.$('#mobileHeader').length > 0
            ? 10
            : parseInt($html.find('input[name="page_size"]').val() || '100', 10);

        if (page === -1 && villageLength === 1000) return Math.floor(1000 / pageSize);
        if (page < navLength) return page + 1;
        return false;
      };

      const startPage = url.match('am_farm') ? 0 : -1;

      const wrapFn = async (currentPage, $html) => {
        processorFn($html);
        const nextPage = determineNextPage(currentPage, $html);
        if (nextPage !== false) return processPage(nextPage, wrapFn);
        return true;
      };

      return processPage(startPage, wrapFn);
    },

    async loadAll(group) {
      const unitSpeeds = await this.ensureUnitSpeeds();
      const allowedUnits = Util.getAllowedUnits();
      const blockedCoords = Util.getBlockedCoords();
      const blockedTargetIds = Util.getBlockedTargetIds();

      const data = {
        villages: {},
        templates: {},
        commands: {},
        farmMeta: {},
        mapBarbs: {},
        fortressCoords: new Set(),
        blockedCoords,
        blockedTargetIds,
        unitSpeeds,
        allowedUnits
      };

      const villagesProcessor = ($html) => {
        $html.find('#combined_table').find('.row_a, .row_b, .row_ax, .row_bx')
          .filter((i, el) => window.$(el).find('.bonus_icon_33').length === 0)
          .each((i, el) => {
            const $el = window.$(el);
            const $label = $el.find('.quickedit-label').first();
            const coord = Util.normalizeCoord(Util.extractCoord($label.text()));
            if (!coord) return;

            const rawUnits = {};
            $el.find('.unit-item').each((index, element) => {
              const unitName = window.game_data.units[index];
              rawUnits[unitName] = Util.toNumber(window.$(element).text());
            });

            const normalizedUnits = allowedUnits.map((unitName) => rawUnits[unitName] || 0);

            data.villages[coord] = {
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
            const coord = Util.normalizeCoord(`${x}|${y}`);
            data.mapBarbs[coord] = { id: +id, name, coord, x: +x, y: +y };
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
        this.processAllPages(
          window.TribalWars.buildURL('GET', 'am_farm'),
          farmProcessor
        ),
        loadBarbsFromMap(),
        loadBonusMap()
      ]);

      Object.keys(data.mapBarbs).forEach((coord) => {
        const meta = data.farmMeta[coord];
        const targetId = meta?.id ? String(meta.id) : null;
        if (
          data.fortressCoords.has(coord) ||
          data.blockedCoords.has(coord) ||
          (targetId && data.blockedTargetIds.has(targetId))
        ) {
          delete data.mapBarbs[coord];
        }
      });

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

      Log.info('villages:', Object.keys(data.villages).length);
      Log.info('templates:', data.templates);
      Log.info('farmMeta:', Object.keys(data.farmMeta).length);
      Log.info('mapBarbs:', Object.keys(data.mapBarbs).length);

      return data;
    }
  };

  const Planner = {
    chooseTemplateForTarget(data, farmMeta, villageUnits) {
      const templateA = data.templates.a || null;
      const templateB = data.templates.b || null;

      const canUse = (template) => template && Util.subtractArrays(villageUnits, template.units) !== false;
      const isLossTarget = farmMeta?.color === 'yellow';

      if (isLossTarget) {
        if (canUse(templateB)) return { name: 'b', template: templateB, reason: 'Verlustziel' };
        return null;
      }

      if (canUse(templateA)) return { name: 'a', template: templateA, reason: 'Normalziel' };
      return null;
    },

    getTargetState(farmMeta) {
      if (farmMeta?.color === 'yellow') return 'Verlust';
      if (farmMeta?.max_loot) return 'Voll';
      return 'Unbekannt';
    },

    getTargetIntervalMinutes(farmMeta, optionTimeFull, optionTimeNotFull) {
      if (farmMeta?.max_loot) return optionTimeFull;
      return optionTimeNotFull;
    },

    createPlanning(optionDistance, optionTimeFull, optionTimeNotFull, data) {
      const plan = { counter: 0, farms: {} };
      const serverTime = Math.round(Util.getServerTimestamp() / 1000);

      const villageCoords = Object.keys(data.villages);
      const targetsByVillage = {};
      const nextIndexByVillage = {};

      villageCoords.forEach((originCoord) => {
        targetsByVillage[originCoord] = Object.values(data.mapBarbs)
          .map((barb) => ({ ...barb, distance: Util.distance(originCoord, barb.coord) }))
          .filter((barb) => barb.distance <= optionDistance)
          .sort((a, b) => a.distance - b.distance);

        nextIndexByVillage[originCoord] = 0;
      });

      let round = 0;
      let somethingPlanned = true;

      while (somethingPlanned && round < FG.maxRounds) {
        somethingPlanned = false;
        round++;

        for (const originCoord of villageCoords) {
          const village = data.villages[originCoord];
          const targets = targetsByVillage[originCoord];
          let plannedForVillageThisRound = false;

          while (nextIndexByVillage[originCoord] < targets.length && !plannedForVillageThisRound) {
            const barb = targets[nextIndexByVillage[originCoord]];
            nextIndexByVillage[originCoord]++;

            const coord = Util.normalizeCoord(barb.coord);
            const farmMeta = data.farmMeta[coord] || { id: barb.id };
            const targetId = farmMeta?.id ? farmMeta.id : barb.id;

            if (data.fortressCoords.has(coord)) continue;
            if (data.blockedCoords.has(coord)) continue;
            if (data.blockedTargetIds.has(String(targetId))) continue;
            if (farmMeta.fortress) continue;

            const chosen = this.chooseTemplateForTarget(data, farmMeta, village.units);
            if (!chosen) continue;

            const unitsLeft = Util.subtractArrays(village.units, chosen.template.units);
            if (!unitsLeft) continue;

            const intervalMinutes = this.getTargetIntervalMinutes(
              farmMeta,
              optionTimeFull,
              optionTimeNotFull
            );
            const minTimeDiff = Math.round(intervalMinutes * 60);

            const arrivalTime = Math.round(
              serverTime + barb.distance * chosen.template.speed * 60 + Math.round(plan.counter / 5)
            );

            const existingCommands = data.commands[coord] || [];
            const timeOk = existingCommands.every((timestamp) => {
              return Math.abs(timestamp - arrivalTime) >= minTimeDiff;
            });

            if (!timeOk) continue;

            if (!plan.farms[originCoord]) plan.farms[originCoord] = [];

            plan.farms[originCoord].push({
              origin: {
                coord: originCoord,
                name: village.name,
                id: village.id
              },
              target: {
                coord,
                id: targetId
              },
              fields: barb.distance,
              template: {
                name: chosen.name,
                id: chosen.template.id
              },
              meta: {
                status: this.getTargetState(farmMeta),
                intervalMinutes,
                reason: chosen.reason
              }
            });

            village.units = unitsLeft;
            if (!data.commands[coord]) data.commands[coord] = [];
            data.commands[coord].push(arrivalTime);

            plan.counter++;
            plannedForVillageThisRound = true;
            somethingPlanned = true;
          }
        }
      }

      Log.info('geplante Farmen:', plan.counter);
      return plan;
    }
  };

  const UIBuilder = {
    async buildOptionsHtml() {
      const t = I18N.de;
      const options = Util.getSavedOptions();
      const groupSelect = await Loader.buildGroupSelect(options.optionGroup);

      return `
        <style>
          #popup_box_FarmGod { text-align:center; width:620px; }
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
            <tr><td>${t.timeFull}</td><td><input type="text" class="fg-option-time-full" value="${options.optionTimeFull}" size="5"></td></tr>
            <tr><td>${t.timeNotFull}</td><td><input type="text" class="fg-option-time-notfull" value="${options.optionTimeNotFull}" size="5"></td></tr>
          </table>
          <br>
          <input type="button" class="btn fg-plan-button" value="${t.button}">
        </div>
      `;
    },

    buildPlanTable(planFarms) {
      const t = I18N.de;

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
              <th style="text-align:center;">${t.origin}</th>
              <th style="text-align:center;">${t.target}</th>
              <th style="text-align:center;">${t.fields}</th>
              <th style="text-align:center;">${t.template}</th>
              <th style="text-align:center;">${t.status}</th>
              <th style="text-align:center;">${t.interval}</th>
              <th style="text-align:center;">${t.farm}</th>
            </tr>
      `;

      if (!window.$.isEmptyObject(planFarms)) {
        for (const originCoord in planFarms) {
          planFarms[originCoord].forEach((val, i) => {
            html += `
              <tr class="farmRow row_${i % 2 === 0 ? 'a' : 'b'}"
                  data-target-coord="${val.target.coord}"
                  data-target-id="${val.target.id}">
                <td style="text-align:center;">
                  <a href="${window.game_data.link_base_pure}info_village&id=${val.origin.id}">
                    ${val.origin.name} (${val.origin.coord})
                  </a>
                </td>
                <td style="text-align:center;">
                  <a href="${window.game_data.link_base_pure}info_village&id=${val.target.id}">
                    ${val.target.coord}
                  </a>
                </td>
                <td style="text-align:center;">${val.fields.toFixed(2)}</td>
                <td style="text-align:center;">${String(val.template.name).toUpperCase()}</td>
                <td style="text-align:center;">${val.meta.status}</td>
                <td style="text-align:center;">${val.meta.intervalMinutes} min</td>
                <td style="text-align:center;">
                  <a href="#"
                     data-origin="${val.origin.id}"
                     data-target="${val.target.id}"
                     data-template="${val.template.id}"
                     data-coord="${val.target.coord}"
                     class="fg-farm-icon farm_icon farm_icon_${val.template.name}"
                     style="margin:auto;"></a>
                </td>
              </tr>
            `;
          });
        }
      } else {
        html += `<tr><td colspan="7" style="text-align:center;">${t.noFarms}</td></tr>`;
      }

      html += `</table></div>`;
      return html;
    },

    showLoading() {
      window.$('.fg-options-content').html(
        window.UI.Throbber[0].outerHTML + '<br><br>' + I18N.de.loading
      );
    },

    removeBlockedRowsFromDom() {
      const blockedCoords = Util.getBlockedCoords();
      const blockedTargetIds = Util.getBlockedTargetIds();

      document.querySelectorAll('.farmRow').forEach((row) => {
        const coord = Util.normalizeCoord(row.getAttribute('data-target-coord') || '');
        const targetId = String(row.getAttribute('data-target-id') || '');

        if (
          blockedCoords.has(coord) ||
          blockedTargetIds.has(targetId) ||
          coord === '407|562'
        ) {
          row.remove();
        }
      });
    },

    renderPlan(plan) {
      window.$('.farmGodContent').remove();
      window.$('#am_widget_Farm').first().before(this.buildPlanTable(plan.farms));
      this.removeBlockedRowsFromDom();

      window.UI.InitProgressBars();
      const count = document.querySelectorAll('.farmRow').length;
      window.UI.updateProgressBar(window.$(`#${FG.progressBarId}`), 0, count);
      window.$(`#${FG.progressBarId}`).data('current', 0).data('max', count);
      this.refreshBlacklistInfo();
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
                  <button id="fg-blacklist-show-btn" class="btn" style="margin-right:6px;">${t.blacklistShow}</button>
                  <button id="fg-blacklist-clear-btn" class="btn">${t.blacklistClear}</button>
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
      this.refreshBlacklistInfo();
    },

    refreshBlacklistInfo() {
      const el = document.querySelector('#fg-blacklist-info');
      if (!el) return;

      const rowCount = document.querySelectorAll('.farmRow').length;
      el.textContent =
        `Blacklist: ${Util.getBlockedCoords().size} Koordinaten, ` +
        `${Util.getBlockedTargetIds().size} Ziel-IDs | ` +
        `Geplant: ${rowCount}`;
    },

    showBlacklist() {
      const coords = Array.from(Util.getBlockedCoords());
      const ids = Array.from(Util.getBlockedTargetIds());

      const text =
        `Blockierte Koordinaten (${coords.length}):\n` +
        `${coords.join(', ') || '-'}\n\n` +
        `Blockierte Ziel-IDs (${ids.length}):\n` +
        `${ids.join(', ') || '-'}`;

      window.alert(text);
    },

    clearBlacklistUi() {
      Util.clearBlacklist();
      this.refreshBlacklistInfo();
      this.removeBlockedRowsFromDom();
      window.UI.SuccessMessage('Blacklist wurde geleert.');
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
      const n = window.Timing && typeof window.Timing.getElapsedTimeSinceLoad === 'function'
        ? window.Timing.getElapsedTimeSinceLoad()
        : Date.now();

      if (
        this.farmBusy ||
        (window.Accountmanager?.farm?.last_click && n - window.Accountmanager.farm.last_click < 200)
      ) return;

      this.farmBusy = true;
      if (window.Accountmanager?.farm) {
        window.Accountmanager.farm.last_click = n;
      }

      const $pb = window.$(`#${FG.progressBarId}`);
      const targetCoord = Util.normalizeCoord($icon.data('coord'));
      const targetId = String($icon.data('target'));

      if (
        Util.getBlockedCoords().has(targetCoord) ||
        Util.getBlockedTargetIds().has(targetId) ||
        targetCoord === '407|562'
      ) {
        $icon.closest('.farmRow').remove();
        UIBuilder.refreshBlacklistInfo();
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
          UIBuilder.refreshBlacklistInfo();
          this.farmBusy = false;
        },
        (r) => {
          if (Util.shouldBlacklistError(r)) {
            Util.addBlockedCoord(targetCoord);
            Util.addBlockedTargetId(targetId);
            UIBuilder.refreshBlacklistInfo();
          }

          window.UI.ErrorMessage(r || I18N.de.sendError);
          $pb.data('current', $pb.data('current') + 1);
          window.UI.updateProgressBar($pb, $pb.data('current'), $pb.data('max'));
          $icon.closest('.farmRow').remove();
          UIBuilder.refreshBlacklistInfo();
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
        .off('keydown.fgprov522')
        .on('keydown.fgprov522', (event) => {
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
        const options = {
          optionGroup: parseInt(window.$('.fg-option-group').val(), 10),
          optionDistance: parseFloat(window.$('.fg-option-distance').val()),
          optionTimeFull: parseFloat(window.$('.fg-option-time-full').val()),
          optionTimeNotFull: parseFloat(window.$('.fg-option-time-notfull').val())
        };

        Util.saveOptions(options);
        UIBuilder.showLoading();

        try {
          const plan = await this.planWithOptions(options);
          window.Dialog.close();
          UIBuilder.renderPlan(plan);
          Sender.bindPlanEvents();
          UIBuilder.refreshBlacklistInfo();
        } catch (e) {
          Log.error('Fehler bei Planung:', e);
          window.UI.ErrorMessage('Fehler beim Laden oder Planen der Daten.');
        }
      });
    },

    async planWithOptions(options) {
      const data = await Loader.loadAll(options.optionGroup);
      return Planner.createPlanning(
        options.optionDistance,
        options.optionTimeFull,
        options.optionTimeNotFull,
        data
      );
    },

    async planFromSavedOptions() {
      const options = Util.getSavedOptions();
      const plan = await this.planWithOptions(options);
      UIBuilder.renderPlan(plan);
      Sender.bindPlanEvents();
      UIBuilder.refreshBlacklistInfo();
      return plan;
    },

    async init() {
      if (!Util.isFarmPage()) return false;

      if (
        !window.game_data.features ||
        !window.game_data.features.Premium ||
        !window.game_data.features.FarmAssistent ||
        !window.game_data.features.Premium.active ||
        !window.game_data.features.FarmAssistent.active
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
        Log.warn('Bot protection detected.');
        window.alert('Einmal Bot-Schutz eingeben bitte.');
        return true;
      }
      return false;
    },

    sessionExpiredDetected() {
      if (Util.isSessionExpired()) {
        Log.warn('Sitzung abgelaufen erkannt.');
        return true;
      }
      return false;
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

        const clickDelay = Util.getRandomInt(
          FG.helperClickDelayMinMs,
          FG.helperClickDelayMaxMs
        );
        await Util.delay(clickDelay);

        const firstIcon = document.querySelector('.fg-farm-icon');
        if (!firstIcon) break;

        firstIcon.click();
        this.sentInCurrentCycle++;

        if (
          FG.helperBreakEverySends > 0 &&
          this.sentInCurrentCycle > 0 &&
          this.sentInCurrentCycle % FG.helperBreakEverySends === 0
        ) {
          const breakMs = Util.getRandomInt(FG.helperBreakMinMs, FG.helperBreakMaxMs);
          await Util.delay(breakMs);
        }

        await Util.delay(180);
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
      const showBlacklistBtn = document.querySelector('#fg-blacklist-show-btn');
      const clearBlacklistBtn = document.querySelector('#fg-blacklist-clear-btn');

      if (openBtn) openBtn.addEventListener('click', () => App.openDialog());

      if (toggleBtn) {
        toggleBtn.addEventListener('click', () => {
          if (this.isRunning) this.stop();
          else this.start();
        });
      }

      if (showBlacklistBtn) {
        showBlacklistBtn.addEventListener('click', () => {
          UIBuilder.showBlacklist();
        });
      }

      if (clearBlacklistBtn) {
        clearBlacklistBtn.addEventListener('click', () => {
          UIBuilder.clearBlacklistUi();
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
