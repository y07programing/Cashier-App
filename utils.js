/* =====================================================================
   KasirPro - utils.js
   Helper umum: format, DOM, modal, toast, csv, print, suara, keypad
   ===================================================================== */
(function (global) {
  'use strict';

  var U = {};
  U.CUR = 'Rp';
  U.LOCALE = 'id-ID';

  /* ---------- DOM ---------- */
  U.$ = function (sel, root) { return (root || document).querySelector(sel); };
  U.$$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };
  U.on = function (el, ev, fn, opt) { if (el) el.addEventListener(ev, fn, opt); };
  var ESC_MAP = {
    '&': String.fromCharCode(38),
    '<': String.fromCharCode(60),
    '>': String.fromCharCode(62),
    '"': String.fromCharCode(34),
    "'": String.fromCharCode(39)
  };
  U.esc = function (s) {
    if (s === null || s === undefined) return '';
    return String(s).replace(/[&<>"']/g, function (c) { return ESC_MAP[c]; });
  };
  U.el = function (html) {
    var d = document.createElement('div');
    d.innerHTML = html.trim();
    return d.firstElementChild;
  };
  U.debounce = function (fn, ms) {
    var t;
    return function () {
      var a = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, a); }, ms || 250);
    };
  };

  /* ---------- ANGKA ---------- */
  U.round2 = function (n) { return Math.round((Number(n) + Number.EPSILON) * 100) / 100; };
  U.toNum = function (v) {
    if (typeof v === 'number') return isFinite(v) ? v : 0;
    if (v === null || v === undefined || v === '') return 0;
    var s = String(v).replace(/\s/g, '').replace(/\.(?=\d{3}\b)/g, '').replace(',', '.');
    var n = parseFloat(s);
    return isNaN(n) ? 0 : n;
  };
  U.nf = function (n, dec) {
    var d = dec === undefined ? 0 : dec;
    var v = Number(n) || 0;
    return v.toLocaleString(U.LOCALE, { minimumFractionDigits: d, maximumFractionDigits: d });
  };
  U.money = function (n) { return U.CUR + ' ' + U.nf(Math.round(Number(n) || 0)); };
  U.money2 = function (n) {
    var v = U.round2(Number(n) || 0);
    return U.CUR + ' ' + v.toLocaleString(U.LOCALE, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  U.short = function (n) {
    var v = Number(n) || 0, a = Math.abs(v), s = v < 0 ? '-' : '';
    function one(x) {
      return x.toLocaleString(U.LOCALE, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).replace(/[,.]0$/, '');
    }
    if (a >= 1e12) return s + one(a / 1e12) + ' T';
    if (a >= 1e9) return s + one(a / 1e9) + ' M';
    if (a >= 1e6) return s + one(a / 1e6) + ' jt';
    if (a >= 1e3) return s + one(a / 1e3) + ' rb';
    return s + U.nf(a);
  };
  U.pct = function (a, b) { if (!b) return 0; return U.round2((a / b) * 100); };

  /* ---------- TANGGAL ---------- */
  U.pad = function (n, len) {
    var s = String(n);
    var L = len || 2;
    while (s.length < L) s = '0' + s;
    return s;
  };
  U.today = function () { return U.dateStr(new Date()); };
  U.dateStr = function (d) {
    d = d || new Date();
    return d.getFullYear() + '-' + U.pad(d.getMonth() + 1) + '-' + U.pad(d.getDate());
  };
  U.nowIso = function () { return new Date().toISOString(); };
  U.fmtDate = function (iso) {
    if (!iso) return '-';
    var d = new Date(iso);
    if (isNaN(d)) return '-';
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
    return U.pad(d.getDate()) + ' ' + M[d.getMonth()] + ' ' + d.getFullYear();
  };
  U.fmtTime = function (iso) {
    if (!iso) return '-';
    var d = new Date(iso);
    if (isNaN(d)) return '-';
    return U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
  };
  U.fmtDateTime = function (iso) { return U.fmtDate(iso) + ' ' + U.fmtTime(iso); };
  U.dayName = function (iso) {
    var d = new Date(iso || Date.now());
    return ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'][d.getDay()];
  };
  U.addDays = function (date, days) {
    var d = new Date(date || Date.now());
    d.setDate(d.getDate() + days);
    return d;
  };
  U.since = function (iso) {
    if (!iso) return '-';
    var s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
    if (s < 60) return 'baru saja';
    if (s < 3600) return Math.floor(s / 60) + ' menit lalu';
    if (s < 86400) return Math.floor(s / 3600) + ' jam lalu';
    return Math.floor(s / 86400) + ' hari lalu';
  };
  /* rentang tanggal dari preset */
  U.range = function (preset, fromEl, toEl) {
    var end = new Date(); var start = new Date(end);
    if (preset === 'today') { start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999); }
    else if (preset === 'yesterday') { end.setDate(end.getDate() - 1); start = new Date(end); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999); }
    else if (preset === 'week') { start.setDate(start.getDate() - 6); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999); }
    else if (preset === 'month') { start.setDate(start.getDate() - 29); start.setHours(0, 0, 0, 0); end.setHours(23, 59, 59, 999); }
    else if (preset === 'custom') {
      start = fromEl && fromEl.value ? new Date(fromEl.value + 'T00:00:00') : new Date(end.getTime() - 6 * 86400000);
      end = toEl && toEl.value ? new Date(toEl.value + 'T23:59:59') : end;
      if (isNaN(start)) start = new Date();
      if (isNaN(end)) end = new Date();
    }
    if (start > end) { var t = start; start = end; end = t; }
    return { start: start.getTime(), end: end.getTime(), from: U.dateStr(start), to: U.dateStr(end) };
  };
  U.inRange = function (iso, r) { var t = new Date(iso).getTime(); return t >= r.start && t <= r.end; };

  /* ---------- ID ---------- */
  var seq = 0;
  U.uid = function (p) {
    seq += 1;
    return (p || 'id') + '_' + Date.now().toString(36) + '_' + seq.toString(36) + Math.random().toString(36).slice(2, 6);
  };

  /* ---------- TOAST ---------- */
  U.toast = function (msg, type, ms) {
    var host = U.$('#toastHost');
    if (!host) return;
    var ico = { success: '✅', error: '❌', warn: '⚠️', info: 'ℹ️' }[type || 'info'] || 'ℹ️';
    var t = U.el('<div class="toast ' + (type || 'info') + '"><span class="t-ico">' + ico + '</span><span>' + U.esc(msg) + '</span></div>');
    host.appendChild(t);
    setTimeout(function () {
      t.classList.add('out');
      setTimeout(function () { if (t.parentNode) t.parentNode.removeChild(t); }, 250);
    }, ms || 2600);
  };

  /* ---------- MODAL ---------- */
  U.modal = function (opt) {
    var host = U.$('#modalHost');
    host.innerHTML = '';
    host.classList.remove('hidden');
    var size = opt.size ? ' ' + opt.size : '';
    var m = U.el(
      '<div class="modal' + size + '">' +
      '<div class="modal-head"><h3>' + U.esc(opt.title || '') + '</h3>' +
      '<button class="x" data-close>✕</button></div>' +
      '<div class="modal-body"></div>' +
      (opt.footer === false ? '' : '<div class="modal-foot"></div>') +
      '</div>'
    );
    var body = U.$('.modal-body', m);
    if (typeof opt.body === 'string') body.innerHTML = opt.body;
    else if (opt.body) body.appendChild(opt.body);

    function close() {
      host.classList.add('hidden');
      host.innerHTML = '';
      document.removeEventListener('keydown', onEsc);
      if (opt.onClose) opt.onClose();
    }
    function onEsc(e) { if (e.key === 'Escape' && opt.closeOnEsc !== false) close(); }

    var foot = U.$('.modal-foot', m);
    if (foot) {
      (opt.buttons || []).forEach(function (b) {
        var btn = U.el('<button class="btn ' + (b.cls || 'btn-ghost') + '">' + (b.icon ? b.icon + ' ' : '') + U.esc(b.label) + '</button>');
        U.on(btn, 'click', function () { if (b.action) b.action(close, m); else close(); });
        foot.appendChild(btn);
      });
    }
    U.$$('[data-close]', m).forEach(function (x) { U.on(x, 'click', close); });
    document.addEventListener('keydown', onEsc);
    host.appendChild(m);
    host.onmousedown = function (e) { if (e.target === host && opt.dismissible !== false) close(); };
    var first = m.querySelector('[data-autofocus]');
    if (first) setTimeout(function () { first.focus(); first.select && first.select(); }, 60);
    return { el: m, body: body, foot: foot, close: close };
  };
  U.closeModal = function () {
    var host = U.$('#modalHost');
    if (host) { host.classList.add('hidden'); host.innerHTML = ''; }
  };

  U.confirm = function (msg, title, danger) {
    return new Promise(function (res) {
      var done = false;
      var mo = U.modal({
        title: title || 'Konfirmasi',
        body: '<p style="font-size:14px;line-height:1.6">' + msg + '</p>',
        buttons: [
          { label: 'Batal', cls: 'btn-ghost', action: function (c) { done = true; res(false); c(); } },
          { label: 'Ya, Lanjutkan', cls: danger ? 'btn-danger' : 'btn-primary', action: function (c) { done = true; res(true); c(); } }
        ],
        onClose: function () { if (!done) res(false); }
      });
      void mo;
    });
  };

  U.prompt = function (title, label, def, type) {
    return new Promise(function (res) {
      var done = false;
      var id = U.uid('f');
      U.modal({
        title: title,
        body: '<label class="field"><span>' + U.esc(label || 'Nilai') + '</span>' +
          '<input id="' + id + '" type="' + (type || 'text') + '" value="' + U.esc(def || '') + '" data-autofocus></label>',
        buttons: [
          { label: 'Batal', cls: 'btn-ghost', action: function (c) { done = true; res(null); c(); } },
          { label: 'OK', cls: 'btn-primary', action: function (c) { done = true; res(U.$('#' + id).value); c(); } }
        ],
        onClose: function () { if (!done) res(null); }
      });
    });
  };

  /* ---------- KEYPAD ANGKA ---------- */
  U.keypad = function (opt) {
    return new Promise(function (res) {
      var done = false;
      var cur = String(opt.value === undefined || opt.value === null ? '' : opt.value);
      var m = U.modal({
        title: opt.title || 'Input Angka',
        body:
          '<div class="field"><span>' + U.esc(opt.label || 'Jumlah') + '</span>' +
          '<input id="kpInput" data-autofocus inputmode="decimal" style="font-size:20px;font-weight:800;text-align:right" value="' + U.esc(cur) + '"></div>' +
          '<div class="quick-cash" id="kpQuick"></div>' +
          '<div class="pad">' +
          [1, 2, 3, 4, 5, 6, 7, 8, 9].map(function (n) { return '<button data-k="' + n + '">' + n + '</button>'; }).join('') +
          '<button data-k="del">⌫</button><button data-k="0">0</button><button data-k="00">00</button>' +
          '</div>',
        buttons: [
          { label: 'Batal', cls: 'btn-ghost', action: function (c) { done = true; res(null); c(); } },
          { label: 'Terapkan', cls: 'btn-primary', action: function (c) { done = true; res(U.$('#kpInput').value); c(); } }
        ],
        onClose: function () { if (!done) res(null); }
      });
      var input = U.$('#kpInput', m.el);
      var quick = U.$('#kpQuick', m.el);
      (opt.quick || []).forEach(function (q) {
        var b = U.el('<button>' + U.esc(q.label) + '</button>');
        U.on(b, 'click', function () { input.value = q.value; input.focus(); });
        quick.appendChild(b);
      });
      if (!opt.quick) quick.style.display = 'none';
      U.$$('[data-k]', m.el).forEach(function (b) {
        U.on(b, 'click', function () {
          var k = b.getAttribute('data-k');
          if (k === 'del') input.value = input.value.slice(0, -1);
          else input.value = (input.value === '0' ? '' : input.value) + k;
          input.focus();
        });
      });
      U.on(input, 'keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); done = true; res(input.value); m.close(); } });
    });
  };

  /* ---------- DRAWER ---------- */
  U.drawer = function (opt) {
    var host = U.$('#drawerHost');
    host.innerHTML = '';
    host.classList.remove('hidden');
    var d = U.el(
      '<aside class="drawer">' +
      '<div class="drawer-head"><h3>' + U.esc(opt.title || '') + '</h3><button class="x icon-btn" data-close>✕</button></div>' +
      '<div class="drawer-body"></div>' +
      '<div class="drawer-foot"></div></aside>'
    );
    var body = U.$('.drawer-body', d);
    if (typeof opt.body === 'string') body.innerHTML = opt.body; else if (opt.body) body.appendChild(opt.body);
    function close() { host.classList.add('hidden'); host.innerHTML = ''; if (opt.onClose) opt.onClose(); }
    var foot = U.$('.drawer-foot', d);
    (opt.buttons || []).forEach(function (b) {
      var btn = U.el('<button class="btn ' + (b.cls || 'btn-ghost') + '">' + U.esc(b.label) + '</button>');
      U.on(btn, 'click', function () { if (b.action) b.action(close, d); else close(); });
      foot.appendChild(btn);
    });
    U.on(U.$('[data-close]', d), 'click', close);
    host.addEventListener('mousedown', function (e) { if (e.target === host) close(); });
    host.appendChild(d);
    return { el: d, body: body, close: close };
  };

  /* ---------- PICKER (cari & pilih) ---------- */
  U.picker = function (opt) {
    return new Promise(function (res) {
      var done = false;
      var items = opt.items || [];
      function render(list) {
        var box = U.$('#pkList', m.el);
        if (!list.length) { box.innerHTML = '<div class="empty-state"><div class="ico">🔍</div><b>Tidak ditemukan</b><span>Coba kata kunci lain</span></div>'; return; }
        box.innerHTML = list.map(function (it) {
          return '<div class="picker-item' + (opt.selectedId === it.id ? ' sel' : '') + '" data-id="' + U.esc(it.id) + '">' +
            '<div class="ava">' + U.esc((it.avatar || (it.name || '?').charAt(0)).toUpperCase()) + '</div>' +
            '<div class="t"><strong>' + U.esc(it.name || '') + '</strong><small>' + U.esc(it.sub || '') + '</small></div>' +
            (it.right ? '<div class="r">' + U.esc(it.right) + '</div>' : '') + '</div>';
        }).join('');
        U.$$('.picker-item', box).forEach(function (el) {
          U.on(el, 'click', function () {
            var id = el.getAttribute('data-id');
            done = true; res(items.filter(function (x) { return x.id === id; })[0]); m.close();
          });
        });
      }
      var m = U.modal({
        title: opt.title || 'Pilih Data',
        body:
          '<div class="search-box sm" style="margin-bottom:10px"><span>🔍</span>' +
          '<input id="pkSearch" data-autofocus placeholder="' + U.esc(opt.placeholder || 'Cari...') + '"></div>' +
          '<div class="list-picker" id="pkList"></div>',
        buttons: [{ label: 'Tutup', cls: 'btn-ghost' }],
        onClose: function () { if (!done) res(null); }
      });
      render(items);
      U.on(U.$('#pkSearch', m.el), 'input', U.debounce(function () {
        var q = this.value.toLowerCase().trim();
        render(q ? items.filter(function (it) { return ((it.name || '') + ' ' + (it.sub || '')).toLowerCase().indexOf(q) >= 0; }) : items);
      }, 160));
    });
  };

  /* ---------- CSV & DOWNLOAD ---------- */
  U.csvCell = function (v) {
    var s = String(v === null || v === undefined ? '' : v);
    return '"' + s.replace(/"/g, '""') + '"';
  };
  U.toCSV = function (headers, rows) {
    var out = [headers.map(U.csvCell).join(',')];
    rows.forEach(function (r) { out.push(r.map(U.csvCell).join(',')); });
    return '\ufeff' + out.join('\r\n');
  };
  U.download = function (filename, content, mime) {
    var blob = content instanceof Blob ? content : new Blob([content], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click();
    setTimeout(function () { document.body.removeChild(a); URL.revokeObjectURL(url); }, 400);
  };
  U.exportCSV = function (filename, headers, rows) {
    U.download(filename, U.toCSV(headers, rows), 'text/csv;charset=utf-8');
    U.toast('File CSV berhasil diunduh', 'success');
  };

  /* ---------- CETAK ---------- */
  U.printHTML = function (html, title) {
    var w = window.open('', '_blank', 'width=460,height=680');
    if (!w) { U.toast('Popup diblokir browser. Izinkan popup untuk mencetak.', 'error', 5000); return; }
    w.document.open();
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>' + U.esc(title || 'Cetak') + '</title>' +
      '<style>body{margin:0;padding:10px;font-family:"Courier New",monospace;font-size:11px;color:#000;background:#fff}' +
      'table{width:100%;border-collapse:collapse}td{padding:1px 0}.c{text-align:center}.r{text-align:right}' +
      'hr{border:none;border-top:1px dashed #000;margin:5px 0}h4{text-align:center;margin:4px 0}' +
      '@media print{@page{margin:3mm}body{padding:0}}</style></head><body>' + html + '</body></html>');
    w.document.close();
    setTimeout(function () { w.focus(); w.print(); }, 260);
  };
  U.printCurrent = function (title) {
    var old = document.title;
    document.title = title || old;
    window.print();
    setTimeout(function () { document.title = old; }, 800);
  };

  /* ---------- SUARA ---------- */
  U.beep = function (kind) {
    try {
      var ctx = U._ctx || (U._ctx = new (global.AudioContext || global.webkitAudioContext)());
      if (ctx.state === 'suspended') ctx.resume();
      var seq = kind === 'error' ? [440, 300] : kind === 'cash' ? [880, 1320] : [1046];
      seq.forEach(function (f, i) {
        var o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'square'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.09);
        g.gain.exponentialRampToValueAtTime(0.08, ctx.currentTime + i * 0.09 + 0.012);
        g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.09 + 0.085);
        o.connect(g); g.connect(ctx.destination);
        o.start(ctx.currentTime + i * 0.09);
        o.stop(ctx.currentTime + i * 0.09 + 0.1);
      });
    } catch (e) { /* ignore */ }
  };

  /* ---------- LAIN-LAIN ---------- */
  U.bytes = function (n) {
    if (!n) return '0 B';
    var u = ['B', 'KB', 'MB', 'GB'], i = 0;
    while (n >= 1024 && i < u.length - 1) { n /= 1024; i++; }
    return n.toFixed(i ? 1 : 0) + ' ' + u[i];
  };
  U.initials = function (name) {
    var p = String(name || '?').trim().split(/\s+/);
    return ((p[0] || '?').charAt(0) + (p[1] ? p[1].charAt(0) : '')).toUpperCase();
  };
  U.sanitizeName = function (s) { return String(s || '').replace(/[<>&"'\\]/g, '').trim().slice(0, 120); };
  U.wa = function (n) { return String(n || '').replace(/[^\d+]/g, ''); };
  U.printable = function (s) { return String(s === null || s === undefined ? '' : s).replace(/[<>]/g, ''); };

  global.U = U;
})(window);