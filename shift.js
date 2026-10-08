/* =====================================================================
   KasirPro - shift.js
   Shift kasir: buka / tutup shift, setoran kas awal, kas masuk / keluar,
   laporan X & Z
   ===================================================================== */
(function (global) {
  'use strict';

  var Shift = {};
  var ShiftUI = {};

  Shift.active = function () {
    var list = DB.all('shifts');
    for (var i = list.length - 1; i >= 0; i--) if (list[i].status === 'open') return list[i];
    return null;
  };

  Shift.label = function () {
    var h = new Date().getHours();
    return h < 11 ? 'Pagi' : h < 15 ? 'Siang' : h < 19 ? 'Sore' : 'Malam';
  };

  /* ======================= BUKA SHIFT ======================= */
  ShiftUI.openDialog = function () {
    if (!DB.can('shift.manage')) { U.toast('Hak akses shift tidak tersedia', 'error'); return; }
    if (Shift.active()) {
      U.toast('Shift sudah terbuka. Tutup shift terlebih dahulu.', 'warn');
      ShiftUI.closeDialog();
      return;
    }
    U.modal({
      title: 'Buka Shift Kasir',
      body:
        '<div class="grid-form-2">' +
        '<div><span class="muted">Kasir</span><div><b>' + U.esc(APP.currentUser.name) + '</b></div></div>' +
        '<div><span class="muted">Waktu</span><div>' + U.fmtDateTime(U.nowIso()) + '</div></div></div><hr>' +
        '<label class="field"><span>Nama Shift</span><input id="shLabel" data-autofocus value="Shift ' + Shift.label() + '"></label>' +
        '<label class="field"><span>Setoran Kas Awal (Rp)</span><input id="shFloat" type="number" min="0" step="10000" value="100000"></label>' +
        '<div class="muted">Jumlah uang tunai yang tersedia di laci kas saat shift dibuka.</div>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        {
          label: 'Buka Shift', cls: 'btn-primary', action: function (close, m) {
            var sh = {
              id: U.uid('sh'), label: U.sanitizeName(U.$('#shLabel', m.el).value) || ('Shift ' + Shift.label()),
              cashierId: APP.currentUser.id, cashierName: APP.currentUser.name,
              openedAt: U.nowIso(), closedAt: null,
              openingFloat: U.toNum(U.$('#shFloat', m.el).value),
              cashIn: 0, cashOut: 0,
              expectedCash: 0, actualCash: null, difference: null,
              totalSales: 0, totalCash: 0, totalNonCash: 0, totalCredit: 0,
              txCount: 0, voidCount: 0, discountTotal: 0,
              status: 'open', closingNote: '', cashLogs: []
            };
            DB.data.counters.shift = (DB.data.counters.shift || 0) + 1;
            DB.data.shifts.push(sh);
            DB.log('BUKA SHIFT', 'Shift', sh.id, sh.label + ' - setoran ' + U.money(sh.openingFloat));
            DB.flush();
            U.toast('Shift berhasil dibuka', 'success');
            close();
            Shift.refresh();
          }
        }
      ]
    });
  };

  /* ======================= TUTUP SHIFT ======================= */
  ShiftUI.closeDialog = function () {
    var sh = Shift.active();
    if (!sh) { U.toast('Tidak ada shift yang terbuka', 'warn'); return; }
    if (!DB.can('shift.manage')) { U.toast('Hak akses shift tidak tersedia', 'error'); return; }
    if (sh.cashierId !== APP.currentUser.id && !DB.can('setting.manage')) {
      U.toast('Shift ini dibuka oleh ' + sh.cashierName + '. Hanya dia atau administrator yang dapat menutup.', 'error', 4200);
      return;
    }
    var expected = Shift.expectedCash(sh);
    U.modal({
      title: 'Tutup Shift: ' + sh.label,
      size: 'wide',
      body:
        '<div class="kpi-row">' +
        '<div class="kpi"><div class="k-label">Setoran Awal</div><div class="k-value">' + U.short(sh.openingFloat) + '</div></div>' +
        '<div class="kpi green"><div class="k-label">Kas Masuk</div><div class="k-value">' + U.short(sh.cashIn) + '</div></div>' +
        '<div class="kpi red"><div class="k-label">Kas Keluar</div><div class="k-value">' + U.short(sh.cashOut) + '</div></div>' +
        '<div class="kpi purple"><div class="k-label">Harus Ada di Laci</div><div class="k-value">' + U.short(expected) + '</div></div>' +
        '</div>' +
        '<label class="field"><span>Jumlah Tunai Aktual di Laci (Rp)</span><input id="shActual" data-autofocus type="number" min="0" step="10000" value="' + Math.round(expected) + '"></label>' +
        '<label class="field"><span>Alasan / Catatan (opsional)</span><input id="shNote" placeholder="mis. selisih kas karena kembalian salah hitung"></label>' +
        '<div id="shDiff" class="big-amount" style="padding:8px 0"></div>' +
        '<hr><b>Ringkasan Shift</b><div class="grid-form-2" style="margin-top:8px">' +
        '<div><span class="muted">Jumlah transaksi</span><div><b>' + sh.txCount + '</b></div></div>' +
        '<div><span class="muted">Transaksi dibatalkan</span><div><b>' + sh.voidCount + '</b></div></div>' +
        '<div><span class="muted">Total penjualan</span><div><b>' + U.money(sh.totalSales) + '</b></div></div>' +
        '<div><span class="muted">Penjualan tunai</span><div><b>' + U.money(sh.totalCash) + '</b></div></div>' +
        '<div><span class="muted">Penjualan non-tunai</span><div><b>' + U.money(sh.totalNonCash) + '</b></div></div>' +
        '<div><span class="muted">Penjualan kredit</span><div><b>' + U.money(sh.totalCredit || 0) + '</b></div></div>' +
        '<div><span class="muted">Total diskon</span><div><b>' + U.money(sh.discountTotal) + '</b></div></div>' +
        '</div>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        {
          label: 'Cetak Laporan Z', cls: 'btn-ghost', action: function () { ShiftUI.printZ(sh, null); }
        },
        {
          label: 'Tutup Shift', cls: 'btn-primary', action: function (close, m) {
            var actual = U.toNum(U.$('#shActual', m.el).value);
            var diff = U.round2(actual - expected);
            if (Math.abs(diff) > 0) {
              U.confirm('Ada selisih kas sebesar <b>' + U.money(Math.abs(diff)) + '</b> (' + (diff > 0 ? 'kelebihan' : 'kekurangan') + '). Tetap tutup shift?')
                .then(function (ok) {
                  if (!ok) return;
                  ShiftUI.doClose(sh, actual, U.$('#shNote', m.el).value, diff);
                  close();
                });
            } else {
              ShiftUI.doClose(sh, actual, U.$('#shNote', m.el).value, 0);
              close();
            }
          }
        }
      ]
    });
    var upd = function () {
      var a = U.toNum(U.$('#shActual').value);
      var d = U.round2(a - expected);
      U.$('#shDiff').innerHTML = d === 0
        ? '<div class="lbl">Selisih Kas</div><div class="val change">Seimbang</div>'
        : '<div class="lbl">Selisih Kas</div><div class="val" style="color:' + (d > 0 ? 'var(--success)' : 'var(--danger)') + '">' +
        (d > 0 ? '+' : '-') + U.money(Math.abs(d)) + '</div>';
    };
    U.on(U.$('#shActual'), 'input', upd);
    upd();
  };

  ShiftUI.doClose = function (sh, actual, note, diff) {
    sh.closedAt = U.nowIso();
    sh.actualCash = U.round2(actual);
    sh.expectedCash = Shift.expectedCash(sh);
    sh.difference = U.round2(diff);
    sh.closingNote = U.sanitizeName(note || '');
    sh.closedBy = APP.currentUser.name;
    sh.status = 'closed';
    DB.log('TUTUP SHIFT', 'Shift', sh.id, sh.label + ' - selisih ' + U.money(sh.difference));
    DB.flush();
    U.toast('Shift ditutup. ' + (sh.difference === 0 ? 'Kas seimbang.' : 'Selisih kas ' + U.money(sh.difference) + '.'), sh.difference === 0 ? 'success' : 'warn', 4200);
    if (DB.setting('sound')) U.beep('cash');
    Shift.refresh();
    if (Math.abs(sh.difference) > 0) ShiftUI.printZ(sh, sh.difference);
  };

  Shift.expectedCash = function (sh) {
    return U.round2((sh.openingFloat || 0) + (sh.cashIn || 0) - (sh.cashOut || 0) + (sh.totalCash || 0));
  };

  /* ======================= KAS MASUK / KELUAR ======================= */
  ShiftUI.cashDialog = function (dir) {
    var sh = Shift.active();
    if (!sh) { U.toast('Buka shift terlebih dahulu', 'warn'); return; }
    var isIn = dir === 'in';
    U.modal({
      title: isIn ? 'Kas Masuk' : 'Kas Keluar',
      body:
        '<p class="muted">' + (isIn ? 'Contoh: setoran tambahan dari kasir, pelunasan utang pelanggan.' : 'Contoh: belanja barang, biaya listrik, uang muka supplier.') + '</p>' +
        '<label class="field"><span>Jumlah (Rp)</span><input id="csAmt" data-autofocus type="number" min="0" step="10000" value=""></label>' +
        '<label class="field"><span>Alasan</span><input id="csNote" placeholder="' + (isIn ? 'mis. setoran tambahan' : 'mis. bayar listrik') + '"></label>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        {
          label: 'Simpan', cls: isIn ? 'btn-primary' : 'btn-danger', action: function (close, m) {
            var amt = U.toNum(U.$('#csAmt', m.el).value);
            if (amt <= 0) { U.toast('Jumlah harus lebih dari 0', 'error'); return; }
            if (isIn) sh.cashIn = U.round2((sh.cashIn || 0) + amt);
            else sh.cashOut = U.round2((sh.cashOut || 0) + amt);
            sh.cashLogs = sh.cashLogs || [];
            sh.cashLogs.push({
              date: U.nowIso(), type: isIn ? 'in' : 'out', amount: amt,
              note: U.sanitizeName(U.$('#csNote', m.el).value), userName: APP.currentUser.name
            });
            DB.log(isIn ? 'KAS MASUK' : 'KAS KELUAR', 'Shift', sh.id, U.money(amt));
            DB.flush();
            U.toast((isIn ? 'Kas masuk' : 'Kas keluar') + ' ' + U.money(amt) + ' tercatat', 'success');
            close();
            Shift.refresh();
          }
        }
      ]
    });
  };

  /* ======================= PENDAFTARAN PENJUALAN ======================= */
  Shift.registerSale = function (tx, isVoid) {
    var sh = Shift.active();
    if (!sh) return;
    if (isVoid) {
      if (sh.tx && sh.tx[tx.id]) {
        var prev = sh.tx[tx.id];
        sh.txCount = Math.max(0, sh.txCount - 1);
        sh.voidCount = (sh.voidCount || 0) + 1;
        sh.totalSales = U.round2(sh.totalSales - prev.total);
        sh.totalCash = U.round2(sh.totalCash - prev.cash);
        sh.totalNonCash = U.round2(sh.totalNonCash - prev.nonCash);
        sh.totalCredit = U.round2((sh.totalCredit || 0) - (prev.credit || 0));
        delete sh.tx[tx.id];
      }
      return;
    }
    sh.tx = sh.tx || {};
    /* Kas yang benar-benar masuk laci = tunai dikurangi kembalian.
       Kredit (tempo) tidak menambah kas laci. */
    var cash, nonCash;
    if (tx.paidCash !== undefined && tx.paidNonCash !== undefined) {
      cash = U.round2(tx.paidCash);
      nonCash = U.round2(tx.paidNonCash);
    } else {
      var cPaid = 0, ncPaid = 0;
      (tx.payments || []).forEach(function (p) {
        if (p.method === 'cash') cPaid += p.amount;
        else if (p.method !== 'tempo') ncPaid += p.amount;
      });
      cash = U.round2(Math.max(0, cPaid - (tx.change || 0)));
      nonCash = U.round2(ncPaid);
    }
    sh.tx[tx.id] = {
      no: tx.no, total: tx.total, cash: cash, nonCash: nonCash,
      credit: U.toNum(tx.creditAmount), date: tx.date, customer: tx.customerName
    };
    sh.txCount = (sh.txCount || 0) + 1;
    sh.totalSales = U.round2((sh.totalSales || 0) + tx.total);
    sh.totalCash = U.round2((sh.totalCash || 0) + cash);
    sh.totalNonCash = U.round2((sh.totalNonCash || 0) + nonCash);
    sh.totalCredit = U.round2((sh.totalCredit || 0) + U.toNum(tx.creditAmount));
    sh.discountTotal = U.round2((sh.discountTotal || 0) + (tx.discount || 0) + (tx.itemDiscountTotal || 0));
  };

  /* ======================= LAPORAN Z ======================= */
  ShiftUI.printZ = function (sh, diff) {
    var d = diff === null || diff === undefined ? sh.difference : diff;
    var html = '<h4>LAPORAN PENUTUPAN SHIFT (Z-REPORT)</h4>' +
      '<hr><table>' +
      '<tr><td>Toko</td><td class="r">' + U.esc(DB.setting('storeName')) + '</td></tr>' +
      '<tr><td>Shift</td><td class="r">' + U.esc(sh.label) + '</td></tr>' +
      '<tr><td>Kasir</td><td class="r">' + U.esc(sh.cashierName) + '</td></tr>' +
      '<tr><td>Dibuka</td><td class="r">' + U.fmtDateTime(sh.openedAt) + '</td></tr>' +
      (sh.closedAt ? '<tr><td>Ditutup</td><td class="r">' + U.fmtDateTime(sh.closedAt) + '</td></tr>' : '') +
      '</table><hr>' +
      '<table><tr><td>Jumlah Transaksi</td><td class="r">' + (sh.txCount || 0) + '</td></tr>' +
      '<tr><td>Transaksi Dibatalkan</td><td class="r">' + (sh.voidCount || 0) + '</td></tr>' +
      '<tr><td>Total Penjualan</td><td class="r">' + U.nf(sh.totalSales || 0) + '</td></tr>' +
      '<tr><td>Penjualan Tunai</td><td class="r">' + U.nf(sh.totalCash || 0) + '</td></tr>' +
      '<tr><td>Penjualan Non-Tunai</td><td class="r">' + U.nf(sh.totalNonCash || 0) + '</td></tr>' +
      '<tr><td>Penjualan Kredit (Piutang)</td><td class="r">' + U.nf(sh.totalCredit || 0) + '</td></tr>' +
      '<tr><td>Total Diskon</td><td class="r">' + U.nf(sh.discountTotal || 0) + '</td></tr>' +
      '</table><hr>' +
      '<table><tr><td>Setoran Awal</td><td class="r">' + U.nf(sh.openingFloat || 0) + '</td></tr>' +
      '<tr><td>Kas Masuk</td><td class="r">' + U.nf(sh.cashIn || 0) + '</td></tr>' +
      '<tr><td>Kas Keluar</td><td class="r">-' + U.nf(sh.cashOut || 0) + '</td></tr>' +
      '<tr><td><b>Harus Ada di Laci</b></td><td class="r"><b>' + U.nf(Shift.expectedCash(sh)) + '</b></td></tr>' +
      (sh.actualCash !== null ? '<tr><td>Tunai Aktual</td><td class="r">' + U.nf(sh.actualCash) + '</td></tr>' : '') +
      (d !== null && d !== undefined ? '<tr><td><b>Selisih</b></td><td class="r"><b>' + (d < 0 ? '-' : '') + U.nf(Math.abs(d)) + '</b></td></tr>' : '') +
      '</table>';
    if (sh.closingNote) html += '<hr><div class="c">Catatan: ' + U.esc(sh.closingNote) + '</div>';
    html += '<hr><div class="c">Dicetak: ' + U.fmtDateTime(U.nowIso()) + '</div>';
    U.printHTML(html, 'Laporan Z - ' + sh.label);
  };

  /* ======================= TAMPILAN ======================= */
  Shift.refresh = function () {
    var sh = Shift.active();
    var chip = U.$('#shiftChip');
    if (chip) {
      chip.classList.toggle('open', !!sh);
      U.$('#shiftChipText').textContent = sh ? (sh.label + ' - ' + sh.cashierName) : 'Shift tutup';
    }
    ShiftUI.render();
  };

  ShiftUI.render = function () {
    var box = U.$('#shiftActiveBox');
    if (!box) return;
    var sh = Shift.active();
    if (!sh) {
      box.innerHTML = '<div class="shift-box"><div style="font-size:40px">' + String.fromCharCode(9203) + '</div>' +
        '<b>Tidak ada shift terbuka</b><p class="muted">Buka shift sebelum melakukan transaksi agar kas terkontrol.</p>' +
        '<button class="btn btn-primary" onclick="ShiftUI.openDialog()">Buka Shift</button></div>';
    } else {
      var expected = Shift.expectedCash(sh);
      var hours = ((Date.now() - new Date(sh.openedAt).getTime()) / 3600000);
      box.innerHTML =
        '<div class="shift-box">' +
        '<div class="big">' + U.esc(sh.label) + '</div>' +
        '<div class="muted">' + U.esc(sh.cashierName) + ' - dibuka ' + U.fmtDateTime(sh.openedAt) + '</div>' +
        '</div><hr>' +
        '<div class="grid-form-2">' +
        '<div><span class="muted">Durasi</span><div><b>' + hours.toFixed(1) + ' jam</b></div></div>' +
        '<div><span class="muted">Transaksi</span><div><b>' + (sh.txCount || 0) + '</b></div></div>' +
        '<div><span class="muted">Omzet shift</span><div><b style="color:var(--brand)">' + U.money(sh.totalSales || 0) + '</b></div></div>' +
        '<div><span class="muted">Penjualan tunai</span><div><b>' + U.money(sh.totalCash || 0) + '</b></div></div>' +
        '<div><span class="muted">Penjualan non-tunai</span><div><b>' + U.money(sh.totalNonCash || 0) + '</div></div>' +
        '<div><span class="muted">Harus ada di laci</span><div><b style="color:var(--success)">' + U.money(expected) + '</b></div></div>' +
        '</div><hr>' +
        '<div class="btn-row">' +
        '<button class="btn btn-ghost" onclick="ShiftUI.cashDialog(\'in\')">Kas Masuk</button>' +
        '<button class="btn btn-ghost" onclick="ShiftUI.cashDialog(\'out\')">Kas Keluar</button>' +
        '<button class="btn btn-ghost" onclick="ShiftUI.printZ(Shift.active(), null)">Cetak Laporan</button>' +
        '<button class="btn btn-danger" onclick="ShiftUI.closeDialog()">Tutup Shift</button>' +
        '</div>';
      if (sh.cashLogs && sh.cashLogs.length) {
        box += '<hr><b>Riwayat Kas Masuk/Keluar</b><table class="table sm" style="margin-top:8px"><thead><tr><th>Waktu</th><th>Jenis</th><th class="right">Jumlah</th><th>Alasan</th><th>Oleh</th></tr></thead><tbody>' +
          sh.cashLogs.map(function (l) {
            return '<tr><td>' + U.fmtTime(l.date) + '</td><td><span class="tag ' + (l.type === 'in' ? 'green' : 'red') + '">' + (l.type === 'in' ? 'Masuk' : 'Keluar') + '</span></td>' +
              '<td class="right">' + U.money(l.amount) + '</td><td>' + U.esc(l.note || '-') + '</td><td>' + U.esc(l.userName) + '</td></tr>';
          }).join('') + '</tbody></table>';
      }
      U.$('#shiftActiveBox').innerHTML = box;
    }

    /* KPI */
    var kpi = U.$('#shiftKpi');
    if (kpi) {
      var today = U.range('today');
      var tx = DB.txInRange(today);
      var omzet = tx.reduce(function (a, t) { return a + t.total; }, 0);
      var cashTx = tx.reduce(function (a, t) { return a + (t.payments || []).filter(function (p) { return p.method === 'cash'; }).reduce(function (s, p) { return s + p.amount; }, 0); }, 0);
      kpi.innerHTML =
        '<div class="kpi"><div class="k-label">Transaksi Hari Ini</div><div class="k-value">' + tx.length + '</div></div>' +
        '<div class="kpi green"><div class="k-label">Omzet Hari Ini</div><div class="k-value">' + U.short(omzet) + '</div></div>' +
        '<div class="kpi purple"><div class="k-label">Kas Masuk (Tunai)</div><div class="k-value">' + U.short(cashTx) + '</div></div>' +
        '<div class="kpi yellow"><div class="k-label">Total Shift</div><div class="k-value">' + DB.all('shifts').length + '</div></div>';
    }

    /* tabel riwayat */
    var tb = U.$('#shiftTable tbody');
    if (tb) {
      var list = DB.all('shifts').slice().reverse().slice(0, 60);
      tb.innerHTML = list.length ? list.map(function (s) {
        return '<tr><td><b>' + U.esc(s.label) + '</b></td><td>' + U.esc(s.cashierName) + '</td>' +
          '<td class="nowrap">' + U.fmtDateTime(s.openedAt) + '</td>' +
          '<td class="nowrap">' + (s.closedAt ? U.fmtDateTime(s.closedAt) : '<span class="muted">-</span>') + '</td>' +
          '<td class="right">' + U.money(s.openingFloat || 0) + '</td>' +
          '<td class="right">' + (s.difference === null || s.difference === undefined ? '-' : '<b style="color:' + (s.difference === 0 ? 'var(--success)' : 'var(--danger)') + '">' + (s.difference > 0 ? '+' : '') + U.money(s.difference) + '</b>') + '</td>' +
          '<td class="center"><span class="tag ' + (s.status === 'open' ? 'green' : 'grey') + '">' + (s.status === 'open' ? 'Dibuka' : 'Ditutup') + '</span>' +
          ' <button class="icon-btn sm" data-shprint="' + s.id + '">' + String.fromCharCode(128424) + '</button></td></tr>';
      }).join('') : '<tr><td colspan="7"><div class="empty-state"><div class="ico">' + String.fromCharCode(9203) + '</div><b>Belum ada riwayat shift</b></div></td></tr>';
      U.$$('[data-shprint]').forEach(function (b) {
        U.on(b, 'click', function () { ShiftUI.printZ(DB.find('shifts', b.getAttribute('data-shprint')), null); });
      });
    }
  };

  global.Shift = Shift;
  global.ShiftUI = ShiftUI;
})(window);