(function () {
  'use strict';

  const FG = {
    name: 'FarmGod APP LITE',
    onlyScreen: 'am_farm',
    storage: {
      blockedCoords: 'fg_app_lite_blocked_coords',
      autoEnabled: 'fg_app_lite_auto_enabled',
      preferredTemplate: 'fg_app_lite_template'
    },
    clickDelayMin: 180,
    clickDelayMax: 320,
    cycleDelayMin: 1200,
    cycleDelayMax: 2200,
    breakEvery: 25,
    breakMin: 1200,
    breakMax: 2500
  };

  const Util = {
    isFarmPage() {
      try {
        return new URL(window.location.href).searchParams.get('screen') === FG.onlyScreen;
      } catch {
        return false;
      }
    },

    rand(min, max) {
      return Math.floor(Math.random() * (max - min + 1)) + min;
    },

    delay(ms) {
      return new Promise((resolve) => setTimeout(resolve, ms));
    },

    normalizeCoord(coord) {
      return String(coord || '').replace('/', '|').trim();
    },

    extractCoord(text) {
      const m = String(text || '').match(/\d{1,3}\|\d{1,3}/g);
      return m ? this.normalizeCoord(m[m.length - 1]) : null;
    },

    getBlockedCoords() {
      try {
        return new Set(JSON.parse(localStorage.getItem(FG.storage.blockedCoords) || '[]'));
      } catch {
        return new Set();
      }
    },

    saveBlockedCoords(set) {
      localStorage.setItem(FG.storage.blockedCoords, JSON.stringify([...set]));
    },

    addBlockedCoord(coord) {
      const set = this.getBlockedCoords();
      set.add(this.normalizeCoord(coord));
      this.saveBlockedCoords(set);
    },

    clearBlockedCoords() {
      localStorage.setItem(FG.storage.blockedCoords, '[]');
    },

    getPreferredTemplate() {
      return localStorage.getItem(FG.storage.preferredTemplate) || 'a';
    },

    setPreferredTemplate(v) {
      localStorage.setItem(FG.storage.preferredTemplate, v === 'b' ? 'b' : 'a');
    },

    setAutoEnabled(v) {
      localStorage.setItem(FG.storage.autoEnabled, v ? 'true' : 'false');
    },

    getAutoEnabled() {
      return localStorage.getItem(FG.storage.autoEnabled) === 'true';
    }
  };

  const UI = {
    panelId: 'fg-app-lite-panel',

    mount() {
      if (document.getElementById(this.panelId)) return;

      const host =
        document.querySelector('#am_widget_Farm')?.parentNode ||
        document.querySelector('#content_value') ||
        document.body;

      const wrap = document.createElement('div');
      wrap.id = this.panelId;
      wrap.className = 'vis';
      wrap.style.margin = '8px 0';
      wrap.innerHTML = `
        <table style="width:100%">
          <tbody>
            <tr><th>FarmGod App Lite</th></tr>
            <tr>
              <td style="padding:6px;text-align:center;">
                <button id="fg-lite-open" class="btn" style="margin:2px;">Status</button>
                <button id="fg-lite-a" class="btn" style="margin:2px;">Sichtbare A</button>
                <button id="fg-lite-b" class="btn" style="margin:2px;">Sichtbare B</button>
                <button id="fg-lite-auto" class="btn" style="margin:2px;">Auto starten</button>
                <button id="fg-lite-clear" class="btn" style="margin:2px;">Blacklist leeren</button>
              </td>
            </tr>
            <tr>
              <td id="fg-lite-status" style="padding:6px;text-align:center;">Bereit</td>
            </tr>
            <tr>
              <td id="fg-lite-info" style="padding:6px;text-align:center;font-size:11px;"></td>
            </tr>
          </tbody>
        </table>
      `;

      host.prepend(wrap);
      this.refreshInfo();
      this.bind();
    },

    bind() {
      document.getElementById('fg-lite-open')?.addEventListener('click', () => {
        this.refreshInfo(true);
      });

      document.getElementById('fg-lite-a')?.addEventListener('click', async () => {
        Util.setPreferredTemplate('a');
        this.setStatus('Sende sichtbare A...');
        await Runner.runVisible('a');
      });

      document.getElementById('fg-lite-b')?.addEventListener('click', async () => {
        Util.setPreferredTemplate('b');
        this.setStatus('Sende sichtbare B...');
        await Runner.runVisible('b');
      });

      document.getElementById('fg-lite-auto')?.addEventListener('click', async () => {
        if (Runner.isRunning) {
          Runner.stop();
        } else {
          Runner.start();
        }
      });

      document.getElementById('fg-lite-clear')?.addEventListener('click', () => {
        Util.clearBlockedCoords();
        this.refreshInfo();
        this.setStatus('Blacklist geleert');
      });
    },

    setStatus(text) {
      const el = document.getElementById('fg-lite-status');
      if (el) el.textContent = text;
    },

    refreshInfo(showMessage = false) {
      const blocked = Util.getBlockedCoords();
      const rows = Scanner.getRows();
      const possibleA = Scanner.getActionableRows('a').length;
      const possibleB = Scanner.getActionableRows('b').length;
      const auto = Runner.isRunning ? 'AN' : 'AUS';

      const info = document.getElementById('fg-lite-info');
      if (info) {
        info.textContent =
          `Sichtbare Ziele: ${rows.length} | A möglich: ${possibleA} | B möglich: ${possibleB} | ` +
          `Blacklist: ${blocked.size} | Auto: ${auto}`;
      }

      const autoBtn = document.getElementById('fg-lite-auto');
      if (autoBtn) autoBtn.textContent = Runner.isRunning ? 'Auto stoppen' : 'Auto starten';

      if (showMessage && window.UI?.SuccessMessage) {
        window.UI.SuccessMessage(`Ziele: ${rows.length}, A: ${possibleA}, B: ${possibleB}`);
      }
    }
  };

  const Scanner = {
    getRows() {
      return [...document.querySelectorAll('#plunder_list tr[id^="village_"]')];
    },

    getRowCoord(row) {
      return Util.extractCoord(row.innerText || row.textContent || '');
    },

    isBlocked(row) {
      const coord = this.getRowCoord(row);
      return coord && Util.getBlockedCoords().has(coord);
    },

    isRed(row) {
      const src = row.querySelector('img[src*="graphic/dots/"]')?.getAttribute('src') || '';
      return /dots\/(red|red_blue)/.test(src);
    },

    hasTemplate(row, tpl) {
      return !!row.querySelector(`a.farm_icon_a, a.farm_icon_b, a[class*="farm_icon_${tpl}"]`);
    },

    getTemplateButton(row, tpl) {
      return row.querySelector(`a.farm_icon_${tpl}`);
    },

    isTemplateDisabled(btn) {
      if (!btn) return true;
      const cls = btn.className || '';
      return /farm_icon_disabled|hidden|btn-disabled/.test(cls);
    },

    getActionableRows(tpl) {
      return this.getRows().filter((row) => {
        if (this.isBlocked(row)) return false;
        if (this.isRed(row)) return false;

        const coord = this.getRowCoord(row);
        if (!coord) return false;

        const btn = this.getTemplateButton(row, tpl);
        if (!btn) return false;
        if (this.isTemplateDisabled(btn)) return false;

        return true;
      });
    }
  };

  const Runner = {
    isRunning: false,
    stopRequested: false,

    async clickButton(btn) {
      btn.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
    },

    async runVisible(tpl) {
      const rows = Scanner.getActionableRows(tpl);
      if (!rows.length) {
        UI.setStatus(`Keine sichtbaren ${tpl.toUpperCase()}-Ziele gefunden`);
        UI.refreshInfo();
        return;
      }

      let sent = 0;

      for (const row of rows) {
        if (this.stopRequested) break;

        const coord = Scanner.getRowCoord(row);
        const btn = Scanner.getTemplateButton(row, tpl);
        if (!btn || Scanner.isTemplateDisabled(btn)) continue;

        UI.setStatus(`Sende ${tpl.toUpperCase()} auf ${coord} ...`);

        await Util.delay(Util.rand(FG.clickDelayMin, FG.clickDelayMax));
        await this.clickButton(btn);
        sent++;

        if (FG.breakEvery > 0 && sent % FG.breakEvery === 0) {
          await Util.delay(Util.rand(FG.breakMin, FG.breakMax));
        }
      }

      UI.setStatus(`${sent} sichtbare ${tpl.toUpperCase()}-Angriffe ausgelöst`);
      UI.refreshInfo();
    },

    async autoLoop() {
      while (this.isRunning && !this.stopRequested) {
        const tpl = Util.getPreferredTemplate();
        const rows = Scanner.getActionableRows(tpl);

        if (rows.length > 0) {
          await this.runVisible(tpl);
        } else {
          UI.setStatus(`Keine sichtbaren ${tpl.toUpperCase()}-Ziele - warte...`);
        }

        UI.refreshInfo();
        await Util.delay(Util.rand(FG.cycleDelayMin, FG.cycleDelayMax));
      }

      this.isRunning = false;
      this.stopRequested = false;
      Util.setAutoEnabled(false);
      UI.setStatus('Auto gestoppt');
      UI.refreshInfo();
    },

    start() {
      if (this.isRunning) return;
      this.isRunning = true;
      this.stopRequested = false;
      Util.setAutoEnabled(true);
      UI.setStatus('Auto läuft...');
      UI.refreshInfo();
      this.autoLoop();
    },

    stop() {
      this.stopRequested = true;
      this.isRunning = false;
      Util.setAutoEnabled(false);
      UI.setStatus('Stoppe...');
      UI.refreshInfo();
    }
  };

  function init() {
    if (!Util.isFarmPage()) {
      alert('FarmGod App Lite nur auf dem Farm-Assistenten starten.');
      return;
    }

    UI.mount();

    window.FarmGodPro = {
      open: () => UI.refreshInfo(true),
      plan: () => Runner.runVisible(Util.getPreferredTemplate()),
      start: () => Runner.start(),
      stop: () => Runner.stop(),
      runA: () => Runner.runVisible('a'),
      runB: () => Runner.runVisible('b')
    };

    if (Util.getAutoEnabled()) {
      Runner.start();
    }
  }

  init();
})();
