/* =====================================================================
   KasirPro - transactions.js
   Riwayat transaksi, detail, void (pembatalan), retur / refund
   ===================================================================== */
(function (global) {
  'use strict';

  var Transactions = {};

  /* ======================= STATUS ======================= */
  Transactions.statusTag = function (s) {
    return {
      paid: { cls: 'green', label: 'Selesai' },
      unpaid: { cls: 'yellow', label: 'Belum Lunas' },
      void: { cls: 'red', label: 'Dibatalkan' },
      refund: { cls: 'red', label: 'Retur' },
      partial_refund: { cls: 'purple', label: 'Retur Sebagian' }
    }[s] || { cls: 'grey', label: s };
  };
  Transactions.statusLabel = function (s) { return Transactions.statusTag(s).label; };

  /* ======================= TABEL ======================= */
  Transactions.render = function () {
    var tb = U.$('#txTable tbody');
    if (!tb) return;
    var q = (U.$('#txSearch').value || '').toLowerCase().trim();
    var from = U.$('#txFrom').value, to = U.$('#txTo').value;
    var st = U.$('#txStatus').value, pm = U.$('#txPay').value;

    var list = DB.all('transactions').slice().reverse().filter(function (t) {
      if (q) {
        var hay = (t.no + ' ' + t.customerName + ' ' + (t.cashierName || '') + ' ' +
          (t.items || []).map(function (i) { return i.name; }).join(' ')).toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      if (from && U.dateStr(new Date(t.date)) < from) return false;
      if (to && U.dateStr(new Date(t.date)) > to) return false;
      if (st && t.status !== st) return false;
      if (pm && t.paymentMethod !== pm) return false;
      return true;
    });

    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="ico">' +
        String.fromCharCode(129534) + '</div><b>Tidak ada transaksi</b><span>Ubah filter atau lakukan penjualan baru</span></div></td></tr>';
    } else {
      tb.innerHTML = list.slice(0, 500).map(function (t) {
        var stg = Transactions.statusTag(t.status);
        return '<tr>' +
          '<td class="nowrap"><b>' + U.esc(t.no) + '</b>' + (t.dueAmount > 0 ? '<br><small class="muted">Sisa: ' + U.money(t.dueAmount) + '</small>' : '') + '</td>' +
          '<td class="nowrap">' + U.fmtDate(t.date) + '<br><small class="muted">' + U.fmtTime(t.date) + '</small></td>' +
          '<td>' + U.esc(t.cashierName || '-') + '</td>' +
          '<td>' + U.esc(t.customerName || 'Umum') + '</td>' +
          '<td class="center">' + U.nf(t.itemCount || 0) + '</td>' +
          '<td class="nowrap">' + U.esc(t.paymentLabel || Checkout.label(t.paymentMethod)) + '</td>' +
          '<td class="center"><span class="tag ' + stg.cls + '">' + stg.label + '</span></td>' +
          '<td class="right"><b>' + U.money(t.total) + '</b></td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-act="detail" data-id="' + t.id + '" title="Detail">&#128269;</button>' +
          '<button class="icon-btn sm" data-act="print" data-id="' + t.id + '" title="Cetak ulang">&#128424;</button>' +
          (t.status !== 'void' ? '<button class="icon-btn sm" data-act="refund" data-id="' + t.id + '" title="Retur">&#128260;</button>' : '') +
          (t.status === 'paid' ? '<button class="icon-btn sm danger" data-act="void" data-id="' + t.id + '" title="Batalkan">&#10060;</button>' : '') +
          '</div></td></tr>';
      }).join('');
      U.$$('[data-act]', tb).forEach(function (b) {
        U.on(b, 'click', function () {
          var id = b.getAttribute('data-id'), act = b.getAttribute('data-act');
          if (act === 'detail') Receipt.detail(id);
          if (act === 'print') Receipt.print(DB.find('transactions', id));
          if (act === 'void') Transactions.voidDialog(id);
          if (act === 'refund') Transactions.refundDialog(id);
        });
      });
    }

    var sum = list.reduce(function (s, t) { return s + (t.status === 'void' ? 0 : t.total); }, 0);
    var cnt = list.filter(function (t) { return t.status !== 'void'; }).length;
    var avg = cnt ? sum / cnt : 0;
    U.$('#txFoot').innerHTML =
      '<span>Transaksi ditampilkan: <b>' + list.length + '</b>' + (list.length > 500 ? ' (500 pertama)' : '') + '</span>' +
      '<span>Valid: <b>' + cnt + '</b></span>' +
      '<span>Omzet: <b style="color:var(--brand)">' + U.money(sum) + '</b></span>' +
      '<span>Rata-rata: <b>' + U.money(avg) + '</b></span>';
  };

  /* ======================= VOID ======================= */
  Transactions.voidDialog = function (txId) {
    if (!DB.can('pos.void')) {
      U.toast('Hanya administrator / kasir senior yang dapat membatalkan transaksi', 'error', 4200);
      return;
    }
    var t = DB.find('transactions', txId);
    if (!t) return;
    U.prompt('Batalkan Transaksi ' + t.no, 'Alasan pembatalan (wajib)', '', 'text').then(function (reason) {
      if (reason === null) return;
      if (!reason.trim()) { U.toast('Alasan pembatalan wajib diisi', 'error'); return; }
      if (t.cashierId !== APP.currentUser.id && !DB.can('setting.manage')) {
        U.toast('Hanya kasir yang membuat transaksi ini yang dapat membatalkannya', 'error', 4000);
        return;
      }
      t.status = 'void';
      t.voidBy = APP.currentUser.name;
      t.voidAt = U.nowIso();
      t.voidReason = reason;
      /* kembalikan stok */
      t.items.forEach(function (it) { DB.adjustStock(it.productId, it.qty, 'void', 'Pembatalan ' + t.no, t.no); });
      Shift.registerSale(t, true);
      DB.log('VOID', 'Transaksi', t.id, t.no + ' dibatalkan oleh ' + APP.currentUser.name + ': ' + reason);
      DB.flush();
      U.toast('Transaksi ' + t.no + ' dibatalkan', 'success');
      if (DB.setting('sound')) U.beep('error');
      Transactions.render();
      App.refreshBadges();
      Shift.refresh();
      if (DB.setting('lockAfterVoid')) Auth.logout();
    });
  };

  /* ======================= RETUR / REFUND ======================= */
  Transactions.refundDialog = function (txId) {
    if (!DB.can('tx.refund')) { U.toast('Hak akses retur tidak tersedia', 'error'); return; }
    var t = DB.find('transactions', txId);
    if (!t || t.status === 'void') { U.toast('Transaksi tidak bisa diretur', 'error'); return; }

    var body = '<p class="muted">Pilih jumlah barang yang diretur. Barang yang diretur akan kembali ke stok.</p>' +
      '<table class="table sm"><thead><tr><th>Barang</th><th class="center">Terbeli</th><th class="center">Sudah Retur</th><th class="center">Retur Sekarang</th></tr></thead><tbody>' +
      t.items.map(function (it, i) {
        var can = it.qty - (it.returnQty || 0);
        return '<tr><td>' + U.esc(it.name) + '<br><small class="muted">' + U.money(it.price) + '</small></td>' +
          '<td class="center">' + it.qty + '</td>' +
          '<td class="center">' + (it.returnQty || 0) + '</td>' +
          '<td class="center"><input type="number" class="mini-input" style="width:70px;text-align:center" min="0" max="' + can + '" value="0" data-ri="' + i + '"></td></tr>';
      }).join('') + '</tbody></table>' +
      '<hr><label class="field"><span>Alasan retur</span><input id="rfReason" placeholder="mis. Barang rusak / salah ukuran"></label>' +
      '<div class="muted">Metode pengembalian dana mengikuti pembayaran awal.</div>';

    U.modal({
      title: 'Retur / Refund: ' + t.no,
      size: 'wide',
      body: body,
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        {
          label: 'Proses Retur', cls: 'btn-primary', action: function (close, m) {
            var reason = U.sanitizeName(U.$('#rfReason', m.el).value);
            if (!reason) { U.toast('Alasan retur wajib diisi', 'error'); return; }
            var ret = [];
            U.$$('[data-ri]', m.el).forEach(function (inp) {
              var i = Number(inp.getAttribute('data-ri'));
              var q = Math.round(U.toNum(inp.value));
              if (q > 0) {
                var it = t.items[i];
                var can = it.qty - (it.returnQty || 0);
                if (q > can) q = can;
                if (q > 0) {
                  it.returnQty = (it.returnQty || 0) + q;
                  ret.push({ item: it, qty: q });
                  DB.adjustStock(it.productId, q, 'return', 'Retur ' + t.no, t.no);
                }
              }
            });
            if (!ret.length) { U.toast('Tidak ada barang yang diretur', 'error'); return; }

            var totalRet = ret.reduce(function (s, r) { return s + r.item.price * r.qty; }, 0);
            var totalRetFinal = U.round2(totalRet * (t.total / (t.subtotal || 1)));

            var full = t.items.every(function (it) { return (it.returnQty || 0) >= it.qty; });
            t.status = full ? 'refund' : 'partial_refund';
            t.refundAt = U.nowIso();
            t.refundBy = APP.currentUser.name;
            t.refundReason = reason;
            t.refundTotal = U.round2((t.refundTotal || 0) + totalRetFinal);

            var pay = { method: (t.payments && t.payments[0] ? t.payments[0].method : 'cash'), amount: totalRetFinal, ref: 'REFUND' };
            t.refundPayments = (t.refundPayments || []).concat([pay]);
            DB.log('RETUR', 'Transaksi', t.id, t.no + ' retur ' + ret.length + ' item (' + U.money(totalRetFinal) + ') oleh ' + APP.currentUser.name);
            DB.flush();
            U.toast('Retur berhasil: ' + U.money(totalRetFinal), 'success');
            close();
            Transactions.render();
            App.refreshBadges();
            Catalog.renderPOS();
          }
        }
      ]
    });
  };

  /* ======================= EXPORT ======================= */
  Transactions.export = function (preset) {
    var r = U.range(preset || 'today');
    var list = DB.txInRange(r);
    var rows = list.map(function (t) {
      return [
        t.no, U.fmtDateTime(t.date), t.cashierName, t.customerName,
        (t.items || []).map(function (i) { return i.name + ' x' + i.qty; }).join(' | '),
        t.itemCount, t.subtotal, t.discount, t.serviceFee, t.tax, t.rounding, t.total,
        t.paymentLabel, t.paid, t.change, t.dueAmount, t.status
      ];
    });
    U.exportCSV('transaksi-' + r.from + '_' + r.to + '.csv',
      ['No Struk', 'Tanggal', 'Kasir', 'Pelanggan', 'Item', 'Qty', 'Subtotal', 'Diskon', 'Biaya Layanan',
        'Pajak', 'Pembulatan', 'Total', 'Metode', 'Dibayar', 'Kembalian', 'Sisa Tagihan', 'Status'],
      rows);
  };
  Transactions.exportAll = function () {
    var rows = DB.all('transactions').map(function (t) {
      return [t.no, U.fmtDateTime(t.date), t.cashierName, t.customerName, t.itemCount,
        t.subtotal, t.discount, t.tax, t.total, t.paymentLabel, t.paid, t.change, t.dueAmount, t.status];
    });
    U.exportCSV('semua-transaksi-' + U.today() + '.csv',
      ['No Struk', 'Tanggal', 'Kasir', 'Pelanggan', 'Qty', 'Subtotal', 'Diskon', 'Pajak', 'Total', 'Metode', 'Dibayar', 'Kembalian', 'Sisa', 'Status'],
      rows);
  };

  /* ======================= EVENTS ======================= */
  Transactions.init = function () {
    ['txSearch', 'txFrom', 'txTo', 'txStatus', 'txPay'].forEach(function (id) {
      var el = U.$('#' + id);
      if (el) U.on(el, 'input', U.debounce(Transactions.render, 180));
      if (el) U.on(el, 'change', Transactions.render);
    });
    U.on(U.$('#txExport'), 'click', function () {
      var from = U.$('#txFrom').value, to = U.$('#txTo').value;
      if (from || to) return Transactions.export('custom');
      Transactions.export('month');
    });
  };

  global.Transactions = Transactions;
})(window);