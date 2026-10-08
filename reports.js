/* =====================================================================
   KasirPro - reports.js
   Laporan penjualan, laba rugi, grafik kanvas, ekspor & cetak
   ===================================================================== */
(function (global) {
  'use strict';

  var Reports = {};
  var Charts = {};

  /* ======================= GRAFIK KANVAS ======================= */
  var PALETTE = ['#2563eb', '#16a34a', '#f59e0b', '#dc2626', '#7c3aed', '#0ea5e9', '#db2777', '#14b8a6', '#8b5cf6', '#f97316'];

  function setupCanvas(cv) {
    var dpr = global.devicePixelRatio || 1;
    var w = cv.clientWidth || 400, h = Number(cv.getAttribute('height')) || 230;
    cv.width = w * dpr; cv.height = h * dpr;
    cv.style.height = h + 'px';
    var ctx = cv.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    return { ctx: ctx, w: w, h: h };
  }
  function css(v) {
    return getComputedStyle(document.body).getPropertyValue(v).trim() || '#333';
  }
  function fmtAxis(v) { return U.short(v); }

  Charts.bar = function (cv, labels, values, opts) {
    opts = opts || {};
    var c = setupCanvas(cv), ctx = c.ctx;
    var pad = { l: 46, r: 10, t: 12, b: 28 };
    var W = c.w - pad.l - pad.r, H = c.h - pad.t - pad.b;
    var max = Math.max.apply(null, values.concat([1]));
    var grid = css('--border');
    var txt = css('--text-3');

    ctx.font = '10px sans-serif';
    ctx.fillStyle = txt; ctx.strokeStyle = grid; ctx.lineWidth = 1;
    for (var i = 0; i <= 4; i++) {
      var y = pad.t + H - (H / 4) * i;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + W, y); ctx.stroke();
      ctx.textAlign = 'right'; ctx.fillText(fmtAxis(max * i / 4), pad.l - 6, y + 3);
    }
    if (!values.length) return;
    var bw = Math.max(6, Math.min(38, (W / values.length) * 0.62));
    var gap = W / values.length;
    values.forEach(function (v, i) {
      var h = (v / max) * H;
      var x = pad.l + gap * i + (gap - bw) / 2;
      var y = pad.t + H - h;
      var col = (opts.colors && opts.colors[i]) || PALETTE[i % PALETTE.length];
      var grad = ctx.createLinearGradient(0, y, 0, pad.t + H);
      grad.addColorStop(0, col);
      grad.addColorStop(1, col + '66');
      ctx.fillStyle = grad;
      ctx.fillRect(x, y, bw, Math.max(1, h));
      ctx.fillStyle = txt; ctx.textAlign = 'center';
      if (values.length <= 12 || i % 2 === 0) {
        ctx.fillText(String(labels[i]).slice(0, 10), pad.l + gap * i + gap / 2, c.h - 9);
      }
    });
  };

  Charts.line = function (cv, labels, values, opts) {
    opts = opts || {};
    var c = setupCanvas(cv), ctx = c.ctx;
    var pad = { l: 46, r: 12, t: 14, b: 28 };
    var W = c.w - pad.l - pad.r, H = c.h - pad.t - pad.b;
    var max = Math.max.apply(null, values.concat([1]));
    var grid = css('--border'), txt = css('--text-3');
    var col = opts.color || css('--brand');

    ctx.font = '10px sans-serif';
    for (var i = 0; i <= 4; i++) {
      var y = pad.t + H - (H / 4) * i;
      ctx.strokeStyle = grid; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pad.l, y); ctx.lineTo(pad.l + W, y); ctx.stroke();
      ctx.fillStyle = txt; ctx.textAlign = 'right'; ctx.fillText(fmtAxis(max * i / 4), pad.l - 6, y + 3);
    }
    if (!values.length) return;
    var step = values.length > 1 ? W / (values.length - 1) : W;
    var pts = values.map(function (v, i) {
      return { x: pad.l + step * i, y: pad.t + H - (v / max) * H };
    });
    /* area */
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pad.t + H);
    pts.forEach(function (p) { ctx.lineTo(p.x, p.y); });
    ctx.lineTo(pts[pts.length - 1].x, pad.t + H);
    ctx.closePath();
    var g = ctx.createLinearGradient(0, pad.t, 0, pad.t + H);
    g.addColorStop(0, col + '55'); g.addColorStop(1, col + '00');
    ctx.fillStyle = g; ctx.fill();
    /* garis */
    ctx.beginPath();
    pts.forEach(function (p, i) { i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y); });
    ctx.strokeStyle = col; ctx.lineWidth = 2.5; ctx.lineJoin = 'round'; ctx.stroke();
    /* titik + label sumbu X */
    pts.forEach(function (p, i) {
      ctx.beginPath(); ctx.arc(p.x, p.y, 3.2, 0, Math.PI * 2);
      ctx.fillStyle = col; ctx.fill();
      ctx.fillStyle = txt; ctx.textAlign = 'center';
      if (values.length <= 14 || i % Math.ceil(values.length / 8) === 0) {
        ctx.fillText(String(labels[i]).slice(0, 9), p.x, c.h - 9);
      }
    });
  };

  Charts.hbar = function (cv, labels, values) {
    var c = setupCanvas(cv), ctx = c.ctx;
    var pad = { l: 110, r: 46, t: 8, b: 8 };
    var W = c.w - pad.l - pad.r, H = c.h - pad.t - pad.b;
    var max = Math.max.apply(null, values.concat([1]));
    var txt = css('--text-2');
    var rowH = values.length ? Math.min(26, H / values.length) : 20;
    ctx.font = '11px sans-serif';
    values.forEach(function (v, i) {
      var y = pad.t + i * rowH + rowH * 0.22;
      var bh = rowH * 0.58;
      var w = Math.max(2, (v / max) * W);
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fillRect(pad.l, y, w, bh);
      ctx.fillStyle = txt; ctx.textAlign = 'right';
      ctx.fillText(String(labels[i]).slice(0, 18), pad.l - 6, y + bh);
      ctx.textAlign = 'left'; ctx.fillStyle = css('--text');
      ctx.fillText(fmtAxis(v), pad.l + w + 5, y + bh);
    });
  };

  Charts.donut = function (cv, labels, values) {
    var c = setupCanvas(cv), ctx = c.ctx;
    var cx = c.w / 2, cy = c.h / 2;
    var R = Math.min(c.w, c.h) / 2 - 12, r = R * 0.58;
    var total = values.reduce(function (a, b) { return a + b; }, 0);
    if (!total) return;
    var a0 = -Math.PI / 2;
    values.forEach(function (v, i) {
      if (v <= 0) return;
      var a1 = a0 + (v / total) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, R, a0, a1);
      ctx.closePath();
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fill();
      a0 = a1;
    });
    ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fillStyle = css('--surface'); ctx.fill();
    ctx.fillStyle = css('--text'); ctx.textAlign = 'center';
    ctx.font = 'bold 15px sans-serif';
    ctx.fillText(U.short(total), cx, cy + 2);
    ctx.font = '9px sans-serif'; ctx.fillStyle = css('--text-3');
    ctx.fillText('TOTAL', cx, cy + 14);

    /* legenda */
    var lx = 8, ly = 10;
    ctx.font = '10px sans-serif'; ctx.textAlign = 'left';
    values.forEach(function (v, i) {
      if (v <= 0) return;
      var yy = ly + i * 13;
      if (yy > c.h - 6) return;
      ctx.fillStyle = PALETTE[i % PALETTE.length];
      ctx.fillRect(lx, yy - 7, 8, 8);
      ctx.fillStyle = css('--text-2');
      ctx.fillText(String(labels[i]).slice(0, 14) + ' ' + U.pct(v, total) + '%', lx + 12, yy);
    });
  };

  /* ======================= LAPORAN PENJUALAN ======================= */
  Reports.rangeSel = function () {
    var sel = U.$('#rptRange').value;
    var custom = sel === 'custom';
    U.$('#rptFrom').classList.toggle('hidden', !custom);
    U.$('#rptTo').classList.toggle('hidden', !custom);
    return U.range(sel, U.$('#rptFrom'), U.$('#rptTo'));
  };

  Reports.render = function () {
    var r = Reports.rangeSel();
    var tx = DB.txInRange(r);
    var kpi = U.$('#rptKpi');
    if (!kpi) return;

    var omzet = tx.reduce(function (s, t) { return s + t.total; }, 0);
    var itemQty = tx.reduce(function (s, t) { return s + (t.itemCount || 0); }, 0);
    var disc = tx.reduce(function (s, t) { return s + (t.discount || 0) + (t.itemDiscountTotal || 0); }, 0);
    var tax = tx.reduce(function (s, t) { return s + (t.tax || 0); }, 0);
    var modal = tx.reduce(function (s, t) {
      return s + t.items.reduce(function (a, i) { return a + (i.cost || 0) * (i.qty - (i.returnQty || 0)); }, 0);
    }, 0);
    var laba = U.round2(omzet - modal - tax);
    var avg = tx.length ? omzet / tx.length : 0;

    kpi.innerHTML =
      '<div class="kpi"><div class="k-label">' + String.fromCharCode(128202) + ' Total Omzet</div><div class="k-value">' + U.money(omzet) + '</div><div class="k-sub">' + U.fmtDate(new Date(r.start)) + ' - ' + U.fmtDate(new Date(r.end)) + '</div><span class="k-ico">' + String.fromCharCode(128176) + '</span></div>' +
      '<div class="kpi green"><div class="k-label">' + String.fromCharCode(128722) + ' Transaksi</div><div class="k-value">' + tx.length + '</div><div class="k-sub">Rata-rata ' + U.money(avg) + '</div><span class="k-ico">' + String.fromCharCode(128722) + '</span></div>' +
      '<div class="kpi purple"><div class="k-label">' + String.fromCharCode(128230) + ' Item Terjual</div><div class="k-value">' + U.nf(itemQty) + '</div><div class="k-sub">Total unit</div><span class="k-ico">' + String.fromCharCode(128230) + '</span></div>' +
      '<div class="kpi yellow"><div class="k-label">' + String.fromCharCode(127919) + ' Total Diskon</div><div class="k-value">' + U.money(disc) + '</div><div class="k-sub">' + U.pct(disc, omzet) + '% dari omzet</div></div>' +
      '<div class="kpi pink"><div class="k-label">' + String.fromCharCode(128176) + ' Estimasi Laba</div><div class="k-value">' + U.money(laba) + '</div><div class="k-sub">Margin ' + U.pct(laba, omzet) + '%</div></div>';

    /* agregasi harian */
    var days = {}, hour = {}, catMap = {}, payMap = {}, prod = {}, cashier = {}, qtyProd = {};
    var dayKeys = [];
    var cursor = new Date(r.start);
    cursor.setHours(0, 0, 0, 0);
    var guard = 0;
    while (cursor.getTime() <= r.end && guard < 400) {
      var key = U.dateStr(cursor);
      days[key] = 0; dayKeys.push(key);
      cursor.setDate(cursor.getDate() + 1); guard++;
    }
    if (!dayKeys.length) dayKeys = [U.dateStr(new Date())];

    tx.forEach(function (t) {
      var k = U.dateStr(new Date(t.date));
      days[k] = (days[k] || 0) + t.total;
      var h = String(new Date(t.date).getHours());
      hour[h] = (hour[h] || 0) + t.total;
      payMap[t.paymentLabel || t.paymentMethod] = (payMap[t.paymentLabel || t.paymentMethod] || 0) + t.total;
      cashier[t.cashierName] = (cashier[t.cashierName] || 0) + t.total;
      t.items.forEach(function (i) {
        var q = i.qty - (i.returnQty || 0);
        if (q <= 0) return;
        if (!prod[i.name]) prod[i.name] = { name: i.name, qty: 0, total: 0, cost: 0, cat: '' };
        prod[i.name].qty += q;
        prod[i.name].total += i.price * q;
        prod[i.name].cost += (i.cost || 0) * q;
        if (!prod[i.name].cat && i.productId) prod[i.name].cat = Catalog.catName(DB.find('products', i.productId) ? DB.find('products', i.productId).categoryId : '');
        if (!catMap[prod[i.name].cat]) catMap[prod[i.name].cat] = 0;
        catMap[prod[i.name].cat] += i.price * q;
        qtyProd[i.name] = (qtyProd[i.name] || 0) + q;
      });
    });

    var dLabels = dayKeys.map(function (k) { var d = new Date(k + 'T00:00:00'); return d.getDate() + '/' + (d.getMonth() + 1); });
    var dValues = dayKeys.map(function (k) { return U.round2(days[k] || 0); });
    if (U.$('#chartSales')) Charts.line(U.$('#chartSales'), dLabels, dValues);

    var hKeys = [];
    for (var h = 7; h <= 22; h++) hKeys.push(h);
    if (U.$('#chartHour')) Charts.bar(U.$('#chartHour'), hKeys.map(function (h) { return h + ':00'; }), hKeys.map(function (h) { return U.round2(hour[String(h)] || 0); }));

    var cKeys = Object.keys(catMap).filter(function (k) { return k && k !== '-'; });
    if (U.$('#chartCat')) Charts.donut(U.$('#chartCat'), cKeys.length ? cKeys : ['-'], cKeys.length ? cKeys.map(function (k) { return U.round2(catMap[k]); }) : [1]);

    var pKeys = Object.keys(payMap);
    if (U.$('#chartPay')) Charts.donut(U.$('#chartPay'), pKeys.length ? pKeys : ['-'], pKeys.length ? pKeys.map(function (k) { return U.round2(payMap[k]); }) : [1]);

    /* produk terlaris */
    var tp = U.$('#rptTopProd tbody');
    if (tp) {
      var arr = Object.keys(prod).map(function (k) { return prod[k]; }).sort(function (a, b) { return b.total - a.total; }).slice(0, 10);
      tp.innerHTML = arr.length ? arr.map(function (p, i) {
        return '<tr><td class="center">' + (i + 1) + '</td><td><b>' + U.esc(p.name) + '</b></td>' +
          '<td class="center">' + U.nf(p.qty) + '</td><td class="right">' + U.money(p.total) + '</td>' +
          '<td class="right"><span class="tag ' + (U.pct(p.total - p.cost, p.total) >= 20 ? 'green' : 'yellow') + '">' + U.nf(U.pct(p.total - p.cost, p.total), 1) + '%</span></td></tr>';
      }).join('') : '<tr><td colspan="5" class="muted">Tidak ada data.</td></tr>';
    }
    /* per kasir */
    var bc = U.$('#rptByCashier tbody');
    if (bc) {
      var cArr = Object.keys(cashier).map(function (k) { return { n: k, v: cashier[k], c: tx.filter(function (t) { return t.cashierName === k; }).length }; }).sort(function (a, b) { return b.v - a.v; });
      bc.innerHTML = cArr.length ? cArr.map(function (c) {
        return '<tr><td><b>' + U.esc(c.n) + '</b></td><td class="center">' + c.c + '</td><td class="right">' + U.money(c.v) + '</td>' +
          '<td class="right">' + U.money(c.v / c.c) + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="muted">Tidak ada data.</td></tr>';
    }
    /* harian */
    var dt = U.$('#rptDaily tbody');
    if (dt) {
      dt.innerHTML = dayKeys.length ? dayKeys.slice().reverse().map(function (k) {
        var list = tx.filter(function (t) { return U.dateStr(new Date(t.date)) === k; });
        var val = U.round2(days[k] || 0);
        var cost = list.reduce(function (s, t) {
          return s + t.items.reduce(function (a, i) { return a + (i.cost || 0) * (i.qty - (i.returnQty || 0)); }, 0);
        }, 0);
        return '<tr><td>' + U.esc(U.dayName(k + 'T12:00:00')) + ', ' + U.fmtDate(k + 'T00:00:00') + '</td>' +
          '<td class="center">' + list.length + '</td><td class="right">' + U.money(val) + '</td>' +
          '<td class="right">' + U.money(U.round2(val - cost)) + '</td></tr>';
      }).join('') : '<tr><td colspan="4" class="muted">Tidak ada data.</td></tr>';
    }
    /* qty terlaris */
    var tq = U.$('#rptTopQty tbody');
    if (tq) {
      var qArr = Object.keys(qtyProd).map(function (k) { return { n: k, q: qtyProd[k] }; }).sort(function (a, b) { return b.q - a.q; }).slice(0, 10);
      tq.innerHTML = qArr.length ? qArr.map(function (p, i) {
        return '<tr><td class="center">' + (i + 1) + '</td><td>' + U.esc(p.n) + '</td><td class="center"><b>' + U.nf(p.q) + '</b></td></tr>';
      }).join('') : '<tr><td colspan="3" class="muted">Tidak ada data.</td></tr>';
      }
    };

  Reports.printReport = function (preset) {
    var r = U.range(preset || 'today', U.$('#rptFrom'), U.$('#rptTo'));
    var tx = DB.txInRange(r);
    var omzet = tx.reduce(function (s, t) { return s + t.total; }, 0);
    var rows = tx.map(function (t) {
      return '<tr><td>' + U.esc(t.no) + '</td><td>' + U.fmtDateTime(t.date) + '</td><td>' + U.esc(t.cashierName) + '</td>' +
        '<td>' + U.esc(t.customerName || 'Umum') + '</td><td class="r">' + U.nf(t.total) + '</td>' +
        '<td>' + U.esc(t.paymentLabel || '') + '</td></tr>';
    }).join('');
    var html = '<h4>LAPORAN PENJUALAN</h4>' +
      '<div class="c">' + U.esc(DB.setting('storeName')) + ' - ' + U.esc(DB.setting('branch')) + '</div>' +
      '<hr><table><tr><td>Periode</td><td class="r">' + U.fmtDate(new Date(r.start)) + ' s/d ' + U.fmtDate(new Date(r.end)) + '</td></tr>' +
      '<tr><td>Jumlah Transaksi</td><td class="r">' + tx.length + '</td></tr>' +
      '<tr><td>Total Omzet</td><td class="r">' + U.nf(omzet) + '</td></tr>' +
      '<tr><td>Rata-rata / Transaksi</td><td class="r">' + U.nf(tx.length ? omzet / tx.length : 0) + '</td></tr></table>' +
      '<hr><table><tr><th>No. Struk</th><th>Waktu</th><th>Kasir</th><th>Pelanggan</th><th>Total</th><th>Metode</th></tr>' +
      rows + '</table>' +
      '<hr><div class="c">Dicetak: ' + U.fmtDateTime(U.nowIso()) + ' oleh ' + U.esc(APP.currentUser ? APP.currentUser.name : '-') + '</div>';
    U.printHTML(html, 'Laporan Penjualan');
  };

  /* ======================= LABA RUGI ======================= */
  Reports.profitSel = function () {
    var sel = U.$('#prRange').value;
    var custom = sel === 'custom';
    U.$('#prFrom').classList.toggle('hidden', !custom);
    U.$('#prTo').classList.toggle('hidden', !custom);
    return U.range(sel, U.$('#prFrom'), U.$('#prTo'));
  };

  Reports.renderProfit = function () {
    var r = Reports.profitSel();
    var tx = DB.txInRange(r);
    var kpi = U.$('#prKpi');
    if (!kpi) return;

    var omzet = tx.reduce(function (s, t) { return s + t.total; }, 0);
    var map = {};
    var cogs = 0, discTotal = 0;
    tx.forEach(function (t) {
      discTotal += (t.discount || 0) + (t.itemDiscountTotal || 0);
      t.items.forEach(function (i) {
        var q = i.qty - (i.returnQty || 0);
        if (q <= 0) return;
        var key = i.name;
        if (!map[key]) map[key] = { name: i.name, qty: 0, revenue: 0, cost: 0 };
        var net = i.price * q - (i.discount || 0);
        map[key].qty += q;
        map[key].revenue += net;
        map[key].cost += (i.cost || 0) * q;
        cogs += (i.cost || 0) * q;
      });
    });
    cogs = U.round2(cogs);
    var taxTotal = tx.reduce(function (s, t) { return s + (t.tax || 0); }, 0);
    var gross = U.round2(omzet - taxTotal - cogs);
    var net = U.round2(gross - discTotal);

    kpi.innerHTML =
      '<div class="kpi"><div class="k-label">Omzet</div><div class="k-value">' + U.money(omzet) + '</div><div class="k-sub">Penjualan bersih</div></div>' +
      '<div class="kpi yellow"><div class="k-label">Harga Pokok Penjualan (HPP)</div><div class="k-value">' + U.money(cogs) + '</div><div class="k-sub">' + U.pct(cogs, omzet) + '% dari omzet</div></div>' +
      '<div class="kpi purple"><div class="k-label">Diskon</div><div class="k-value">' + U.money(discTotal) + '</div><div class="k-sub">' + U.pct(discTotal, omzet) + '%</div></div>' +
      '<div class="kpi green"><div class="k-label">Laba Kotor</div><div class="k-value">' + U.money(gross) + '</div><div class="k-sub">Margin ' + U.pct(gross, omzet) + '%</div></div>' +
      '<div class="kpi pink"><div class="k-label">Laba Bersih (estimasi)</div><div class="k-value">' + U.money(net) + '</div><div class="k-sub">Margin ' + U.pct(net, omzet) + '%</div></div>';

    var arr = Object.keys(map).map(function (k) {
      var p = map[k];
      p.profit = U.round2(p.revenue - p.cost);
      return p;
    }).sort(function (a, b) { return b.profit - a.profit; });

    if (U.$('#chartProfit')) {
      Charts.hbar(U.$('#chartProfit'), arr.slice(0, 12).map(function (p) { return p.name; }), arr.slice(0, 12).map(function (p) { return Math.max(0, p.profit); }));
    }
    if (U.$('#chartMargin')) {
      var top = arr.slice(0, 8).filter(function (p) { return p.profit > 0; });
      Charts.donut(U.$('#chartMargin'), top.length ? top.map(function (p) { return p.name; }) : ['-'], top.length ? top.map(function (p) { return p.profit; }) : [1]);
    }

    var tb = U.$('#prTable tbody');
    if (tb) {
      tb.innerHTML = arr.length ? arr.map(function (p) {
        return '<tr><td><b>' + U.esc(p.name) + '</b></td><td class="center">' + U.nf(p.qty) + '</td>' +
          '<td class="right">' + U.money(p.revenue) + '</td><td class="right">' + U.money(p.cost) + '</td>' +
          '<td class="right"><b style="color:' + (p.profit >= 0 ? 'var(--success)' : 'var(--danger)') + '">' + U.money(p.profit) + '</b></td>' +
          '<td class="right"><span class="tag ' + (U.pct(p.profit, p.revenue) >= 25 ? 'green' : U.pct(p.profit, p.revenue) >= 10 ? 'yellow' : 'red') + '">' + U.nf(U.pct(p.profit, p.revenue), 1) + '%</span></td></tr>';
      }).join('') : '<tr><td colspan="6" class="muted">Tidak ada data pada periode ini.</td></tr>';
    }
  };

  Reports.printProfit = function () {
    var r = Reports.profitSel();
    var tx = DB.txInRange(r);
    var omzet = tx.reduce(function (s, t) { return s + t.total; }, 0);
    var cogs = 0, map = {};
    tx.forEach(function (t) {
      t.items.forEach(function (i) {
        var q = i.qty - (i.returnQty || 0);
        if (q <= 0) return;
        if (!map[i.name]) map[i.name] = { qty: 0, rev: 0, cost: 0 };
        map[i.name].qty += q; map[i.name].rev += i.price * q; map[i.name].cost += (i.cost || 0) * q;
        cogs += (i.cost || 0) * q;
      });
    });
    var rows = Object.keys(map).map(function (k) {
      var p = map[k];
      return '<tr><td>' + U.esc(k) + '</td><td class="r">' + U.nf(p.qty) + '</td><td class="r">' + U.nf(p.rev) + '</td>' +
        '<td class="r">' + U.nf(p.cost) + '</td><td class="r">' + U.nf(p.rev - p.cost) + '</td></tr>';
    }).join('');
    var html = '<h4>LAPORAN LABA RUGI (ESTIMASI)</h4>' +
      '<div class="c">' + U.esc(DB.setting('storeName')) + '</div>' +
      '<hr><table><tr><td>Periode</td><td class="r">' + U.fmtDate(new Date(r.start)) + ' s/d ' + U.fmtDate(new Date(r.end)) + '</td></tr>' +
      '<tr><td>Omzet</td><td class="r">' + U.nf(omzet) + '</td></tr>' +
      '<tr><td>HPP</td><td class="r">-' + U.nf(U.round2(cogs)) + '</td></tr>' +
      '<tr><td><b>Laba Kotor</b></td><td class="r"><b>' + U.nf(U.round2(omzet - cogs)) + '</b></td></tr></table>' +
      '<hr><table><tr><th>Produk</th><th class="r">Qty</th><th class="r">Omzet</th><th class="r">HPP</th><th class="r">Laba</th></tr>' + rows + '</table>' +
      '<hr><div class="c">Dicetak: ' + U.fmtDateTime(U.nowIso()) + '</div>';
    U.printHTML(html, 'Laporan Laba Rugi');
  };

  /* ======================= LOG AKTIVITAS ======================= */
  Reports.renderAudit = function () {
    var tb = U.$('#auditTable tbody');
    if (!tb) return;
    var q = (U.$('#auditSearch').value || '').toLowerCase().trim();
    var list = DB.all('auditLogs').filter(function (l) {
      if (!q) return true;
      return (l.action + ' ' + l.entity + ' ' + l.detail + ' ' + l.userName).toLowerCase().indexOf(q) >= 0;
    });
    tb.innerHTML = list.length ? list.slice(0, 400).map(function (l) {
      var cls = 'blue';
      if (l.action === 'HAPUS' || l.action === 'VOID') cls = 'red';
      else if (l.action === 'LOGIN' || l.action === 'LOGOUT') cls = 'green';
      else if (l.action === 'TRANSAKSI') cls = 'purple';
      else if (l.action === 'UBAH') cls = 'yellow';
      return '<tr><td class="nowrap">' + U.fmtDateTime(l.date) + '</td><td>' + U.esc(l.userName) + '</td>' +
        '<td><span class="tag ' + cls + '">' + U.esc(l.action) + '</span></td>' +
        '<td>' + U.esc(l.entity) + '</td><td class="audit-detail">' + U.esc(l.detail || '') + '</td></tr>';
    }).join('') : '<tr><td colspan="5"><div class="empty-state"><div class="ico">' + String.fromCharCode(128737) + '</div><b>Belum ada aktivitas tercatat</b></div></td></tr>';
    U.$('#auditFoot').innerHTML = '<span>Total catatan: <b>' + DB.all('auditLogs').length + '</b></span><span>Menampilkan maksimal 400 catatan terbaru</span>';
  };

  /* ======================= EVENTS ======================= */
  Reports.init = function () {
    U.on(U.$('#rptRange'), 'change', Reports.render);
    U.on(U.$('#rptFrom'), 'change', Reports.render);
    U.on(U.$('#rptTo'), 'change', Reports.render);
    U.on(U.$('#rptPrint'), 'click', function () { Reports.printReport(U.$('#rptRange').value); });
    U.on(U.$('#rptExport'), 'click', function () {
      var r = Reports.rangeSel();
      var list = DB.txInRange(r);
      U.exportCSV('laporan-penjualan-' + r.from + '_' + r.to + '.csv',
        ['No Struk', 'Tanggal', 'Kasir', 'Pelanggan', 'Item', 'Qty', 'Subtotal', 'Diskon', 'Pajak', 'Total', 'Metode', 'Status'],
        list.map(function (t) {
          return [t.no, U.fmtDateTime(t.date), t.cashierName, t.customerName,
            t.items.map(function (i) { return i.name; }).join(' | '), t.itemCount,
            t.subtotal, (t.discount || 0) + (t.itemDiscountTotal || 0), t.tax, t.total, t.paymentLabel, t.status];
        }));
    });
    U.on(U.$('#prRange'), 'change', Reports.renderProfit);
    U.on(U.$('#prFrom'), 'change', Reports.renderProfit);
    U.on(U.$('#prTo'), 'change', Reports.renderProfit);
    U.on(U.$('#prPrint'), 'click', Reports.printProfit);
    U.on(U.$('#auditSearch'), 'input', U.debounce(Reports.renderAudit, 180));
    U.on(U.$('#btnClearAudit'), 'click', function () {
      if (!DB.can('setting.manage')) { U.toast('Hak akses dibatasi', 'error'); return; }
      U.confirm('Bersihkan semua log aktivitas? Tindakan ini tidak dapat dibatalkan.', 'Bersihkan Log', true).then(function (ok) {
        if (!ok) return;
        DB.data.auditLogs = [];
        DB.log('BERSIHKAN', 'Audit', '', 'Log aktivitas dibersihkan');
        DB.flush();
        Reports.renderAudit();
        U.toast('Log dibersihkan', 'success');
      });
    });
    global.addEventListener('resize', U.debounce(function () {
      if (App.current() === 'reports') Reports.render();
      if (App.current() === 'profit') Reports.renderProfit();
    }, 250));
  };

  global.Reports = Reports;
  global.Charts = Charts;
})(window);