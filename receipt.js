/* =====================================================================
   KasirPro - receipt.js
   Pembuatan struk, pratinjau, cetak thermal (58/80 mm / A4)
   ===================================================================== */
(function (global) {
  'use strict';

  var Receipt = {};

  /* ======================= BANGUN STRUK ======================= */
  Receipt.build = function (tx, change, opts) {
    opts = opts || {};
    var s = DB.data.settings;
    var size = opts.size || s.receiptSize || '80';
    var cls = size === '58' ? 'r58' : size === 'a4' ? 'ra4' : 'r80';
    var cust = tx.customerId ? DB.find('customers', tx.customerId) : null;
    var d = new Date(tx.date);
    var pad = function (n) { return (n < 10 ? '0' : '') + n; };
    var tgl = pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
    var jam = pad(d.getHours()) + ':' + pad(d.getMinutes());

    var h = '';
    h += '<div class="print-sheet ' + cls + '">';
    h += '<div class="c"><h4>' + U.esc(s.storeName) + '</h4></div>';
    if (s.branch) h += '<div class="c">' + U.esc(s.branch) + '</div>';
    if (s.address) h += '<div class="c">' + U.esc(s.address) + '</div>';
    if (s.phone) h += '<div class="c">Telp: ' + U.esc(s.phone) + '</div>';
    if (s.npwp) h += '<div class="c">NPWP: ' + U.esc(s.npwp) + '</div>';
    h += '<hr>';

    h += '<table><tr><td>No. Struk</td><td class="r">' + U.esc(tx.no) + '</td></tr>';
    h += '<tr><td>Tanggal</td><td class="r">' + tgl + ' ' + jam + '</td></tr>';
    h += '<tr><td>Kasir</td><td class="r">' + U.esc(tx.cashierName || '-') + '</td></tr>';
    h += '<tr><td>Pelanggan</td><td class="r">' + U.esc(tx.customerName || 'Umum') + '</td></tr>';
    if (cust && cust.phone) h += '<tr><td>Telp</td><td class="r">' + U.esc(cust.phone) + '</td></tr>';
    if (tx.shiftId) {
      var sh = DB.find('shifts', tx.shiftId);
      if (sh) h += '<tr><td>Shift</td><td class="r">' + U.esc(sh.label || U.fmtTime(sh.openedAt)) + '</td></tr>';
    }
    h += '</table><hr>';

    h += '<table>';
    tx.items.forEach(function (it, i) {
      h += '<tr><td colspan="2">' + (i + 1) + '. ' + U.esc(it.name) + '</td></tr>';
      h += '<tr><td>   ' + U.nf(it.qty) + ' ' + U.esc(it.unit || '') + ' x ' + U.nf(it.price) +
        (it.discount ? '<br>   Diskon: -' + U.nf(it.discount) : '') + '</td><td class="r">' + U.nf(it.subtotal) + '</td></tr>';
    });
    h += '</table><hr>';

    h += '<table>';
    h += '<tr><td>Total Item</td><td class="r">' + U.nf(tx.itemCount || 0) + '</td></tr>';
    h += '<tr><td>Subtotal</td><td class="r">' + U.nf(tx.subtotal) + '</td></tr>';
    if (tx.itemDiscountTotal) h += '<tr><td>Diskon Item</td><td class="r">-' + U.nf(tx.itemDiscountTotal) + '</td></tr>';
    if (tx.discount) h += '<tr><td>Diskon Transaksi</td><td class="r">-' + U.nf(tx.discount) + '</td></tr>';
    if (tx.serviceFee) h += '<tr><td>Biaya Layanan</td><td class="r">' + U.nf(tx.serviceFee) + '</td></tr>';
    if (tx.tax) h += '<tr><td>Pajak ' + U.nf(tx.taxRate, 1) + '%</td><td class="r">' + U.nf(tx.tax) + '</td></tr>';
    if (tx.rounding) h += '<tr><td>Pembulatan</td><td class="r">' + (tx.rounding < 0 ? '-' : '') + U.nf(Math.abs(tx.rounding)) + '</td></tr>';
    h += '</table>';
    h += '<table class="grand"><tr><td>TOTAL</td><td class="r">' + U.nf(tx.total) + '</td></tr></table><hr>';

    (tx.payments || []).forEach(function (p) {
      h += '<table>';
      if (p.method === 'tempo') {
        h += '<tr><td>Uang Muka (DP)</td><td class="r">' + U.nf(U.toNum(p.dp) || 0) + '</td></tr>';
        h += '<tr><td>Kredit</td><td class="r">' + U.nf(p.amount) + '</td></tr>';
        h += '<tr><td colspan="2">Jatuh tempo: ' + U.nf(p.dueDays || 14) + ' hari</td></tr>';
      } else {
        h += '<tr><td>' + U.esc(Checkout.label(p.method)) + '</td><td class="r">' + U.nf(p.amount) + '</td></tr>';
      }
      if (p.ref) h += '<tr><td colspan="2">Ref: ' + U.esc(p.ref) + '</td></tr>';
      h += '</table>';
    });
    if (tx.change > 0) {
      h += '<table><tr><td>KEMBALI</td><td class="r">' + U.nf(tx.change) + '</td></tr></table>';
    }
    if (tx.dueAmount > 0) {
      h += '<hr><table class="grand"><tr><td>SISA TAGIHAN</td><td class="r">' + U.nf(tx.dueAmount) + '</td></tr></table>';
      h += '<div class="c">*** BELUM LUNAS ***</div>';
    }
    if (tx.status === 'void') h += '<div class="b">** TRANSAKSI DIBATALKAN **</div>';
    if (tx.status === 'refund' || tx.status === 'partial_refund') h += '<div class="b">** RETUR / REFUND **</div>';

    h += '<div class="b">';
    h += (s.footer || 'Terima kasih sudah berbelanja!') + '<br>';
    if (s.receiptNote) h += U.esc(s.receiptNote) + '<br>';
    h += '<span style="font-size:.85em">Barang yang sudah dibeli<br>tidak dapat ditukar tanpa persetujuan</span>';
    h += '</div>';

    h += '<div class="c" style="margin-top:6px;font-size:.85em">' + U.fmtDateTime(tx.date) + '</div>';
    h += '</div>';
    return h;
  };

  /* ======================= CETAK ======================= */
  Receipt.print = function (tx, change) {
    var html = Receipt.build(tx, change !== undefined ? change : tx.change);
    var w = window.open('', '_blank', 'width=420,height=640');
    if (!w) {
      U.toast('Popup diblokir. Klik "Cetak Struk" secara manual atau izinkan popup.', 'error', 5000);
      return;
    }
    w.document.open();
    w.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Struk ' + U.esc(tx.no) + '</title>' +
      '<style>body{margin:0;padding:4mm;font-family:"Courier New",monospace;background:#fff;color:#000}' +
      '.print-sheet{width:auto}.r58{font-size:9px}.r80{font-size:10.5px}.ra4{font-size:12px}' +
      '.c{text-align:center}.r{text-align:right}hr{border:none;border-top:1px dashed #000;margin:5px 0}' +
      'table{width:100%;border-collapse:collapse}td{padding:1px 0;vertical-align:top}' +
      'h4{text-align:center;font-size:1.1em;margin:2px 0}.b{border-top:1px dashed #000;padding-top:5px;margin-top:5px;text-align:center}' +
      '.grand td{font-weight:bold;font-size:1.1em}' +
      '@media print{@page{margin:2mm}body{padding:0}}</style></head><body>' + html + '</body></html>');
    w.document.close();
    setTimeout(function () {
      w.focus();
      try { w.print(); } catch (e) { U.toast('Gagal mencetak: ' + e.message, 'error'); }
    }, 300);
  };

  /* ======================= MODAL SUKSES ======================= */
  Receipt.showSuccess = function (tx, change, due) {
    change = change === undefined ? tx.change : change;
    var perPay = (tx.payments || []).map(function (p) {
      return '<div class="calc-row"><span>' + U.esc(Checkout.label(p.method)) + (p.ref ? ' (' + U.esc(p.ref) + ')' : '') + '</span><b>' + U.money(p.amount) + '</b></div>';
    }).join('');

    U.modal({
      title: 'Transaksi Berhasil',
      body:
        '<div class="big-amount">' +
        '<div class="lbl">Nomor Struk</div>' +
        '<div class="val" style="font-size:24px">' + U.esc(tx.no) + '</div>' +
        '<div class="sub">' + U.fmtDateTime(tx.date) + '</div>' +
        '</div><hr>' +
        '<div class="calc-rows">' +
        '<div class="calc-row"><span>Jumlah Item</span><b>' + U.nf(tx.itemCount) + '</b></div>' +
        '<div class="calc-row"><span>Subtotal</span><b>' + U.money(tx.subtotal) + '</b></div>' +
        (tx.discount ? '<div class="calc-row"><span>Diskon</span><b>- ' + U.money(tx.discount + (tx.itemDiscountTotal || 0)) + '</b></div>' : '') +
        (tx.tax ? '<div class="calc-row"><span>Pajak</span><b>' + U.money(tx.tax) + '</b></div>' : '') +
        (tx.rounding ? '<div class="calc-row"><span>Pembulatan</span><b>' + U.money(tx.rounding) + '</b></div>' : '') +
        '<div class="calc-row total-row"><span>TOTAL</span><b>' + U.money(tx.total) + '</b></div>' +
        perPay +
        (change > 0 ? '<div class="calc-row"><span>Kembalian</span><b style="color:var(--success)">' + U.money(change) + '</b></div>' : '') +
        (due > 0 ? '<div class="calc-row"><span>Sisa Tagihan</span><b style="color:var(--danger)">' + U.money(due) + '</b></div>' : '') +
        '</div>' +
        (due > 0 ? '<div class="muted">Simpan struk ini sebagai bukti pembayaran. Pelunasan dapat dilakukan di menu <b>Piutang / Utang</b>.</div>' : ''),
      buttons: [
        {
          label: 'Cetak Lagi', cls: 'btn-ghost', action: function (c) { Receipt.print(tx, change); c(); }
        },
        {
          label: 'Transaksi Baru', cls: 'btn-primary', action: function (c) {
            c();
            setTimeout(function () { U.$('#posSearch').focus(); }, 100);
          }
        }
      ]
    });
  };

  /* ======================= PRATINJAU STRUK ======================= */
  Receipt.sample = function () {
    var tx = {
      no: 'TRX260101-001', date: U.nowIso(), cashierName: (APP.currentUser || {}).name || 'Kasir',
      customerName: 'Pelanggan Umum', itemCount: 3, subtotal: 53000, itemDiscountTotal: 0,
      discount: 0, serviceFee: 0, tax: 5830, taxRate: 11, rounding: 0, total: 58830,
      payments: [{ method: 'cash', amount: 60000, ref: '' }], change: 1170, dueAmount: 0, status: 'paid',
      items: [
        { name: 'Indomie Goreng', unit: 'pcs', qty: 2, price: 3500, discount: 0, subtotal: 7000 },
        { name: 'Air Mineral 600ml', unit: 'btl', qty: 3, price: 4000, discount: 0, subtotal: 12000 },
        { name: 'Kopi Kapal Api Sachet', unit: 'pcs', qty: 34, price: 1500, discount: 0, subtotal: 34000 }
      ]
    };
    return Receipt.build(tx, tx.change);
  };
  Receipt.preview = function () {
    var box = U.$('#receiptPreview');
    if (!box) return;
    var html = Receipt.sample();
    /* ubah ke kelas pratinjau layar */
    html = html.replace(/class="print-sheet ([^"]+)"/, 'class="rcpt $1"');
    box.innerHTML = html;
  };

  /* ======================= DETAIL TRANSAKSI ======================= */
  Receipt.detail = function (txId) {
    var t = DB.find('transactions', txId);
    if (!t) return;
    var html = '<div class="grid-form-2">' +
      '<div><span class="muted">No. Struk</span><div><b>' + U.esc(t.no) + '</b></div></div>' +
      '<div class="right"><span class="muted">Waktu</span><div>' + U.fmtDateTime(t.date) + '</div></div>' +
      '<div><span class="muted">Kasir</span><div>' + U.esc(t.cashierName) + '</div></div>' +
      '<div class="right"><span class="muted">Pelanggan</span><div>' + U.esc(t.customerName || 'Umum') + '</div></div>' +
      '</div><hr><table class="table sm"><thead><tr><th>Item</th><th class="center">Qty</th><th class="right">Harga</th><th class="right">Diskon</th><th class="right">Subtotal</th></tr></thead><tbody>' +
      t.items.map(function (it) {
        return '<tr><td>' + U.esc(it.name) + '</td><td class="center">' + U.nf(it.qty - (it.returnQty || 0)) + '</td>' +
          '<td class="right">' + U.nf(it.price) + '</td><td class="right">' + (it.discount ? '-' + U.nf(it.discount) : '-') + '</td>' +
          '<td class="right"><b>' + U.nf(it.subtotal) + '</b></td></tr>';
      }).join('') + '</tbody></table><hr>' +
      '<div class="calc-rows">' +
      '<div class="calc-row"><span>Subtotal</span><b>' + U.money(t.subtotal) + '</b></div>' +
      (t.discount ? '<div class="calc-row"><span>Diskon Transaksi</span><b>- ' + U.money(t.discount) + '</b></div>' : '') +
      (t.serviceFee ? '<div class="calc-row"><span>Biaya Layanan</span><b>' + U.money(t.serviceFee) + '</b></div>' : '') +
      (t.tax ? '<div class="calc-row"><span>Pajak ' + U.nf(t.taxRate, 1) + '%</span><b>' + U.money(t.tax) + '</b></div>' : '') +
      (t.rounding ? '<div class="calc-row"><span>Pembulatan</span><b>' + U.money(t.rounding) + '</b></div>' : '') +
      '<div class="calc-row total-row"><span>TOTAL</span><b>' + U.money(t.total) + '</b></div>' +
      (t.payments || []).map(function (p) {
        return '<div class="calc-row"><span>' + U.esc(Checkout.label(p.method)) + '</span><b>' + U.money(p.amount) + '</b></div>';
      }).join('') +
      (t.change ? '<div class="calc-row"><span>Kembalian</span><b>' + U.money(t.change) + '</b></div>' : '') +
      (t.dueAmount ? '<div class="calc-row"><span>Sisa Tagihan</span><b style="color:var(--danger)">' + U.money(t.dueAmount) + '</b></div>' : '') +
      '</div>' +
      '<div style="margin-top:10px">Status: <span class="tag ' + Transactions.statusTag(t.status).cls + '">' + Transactions.statusLabel(t.status) + '</span></div>' +
      (t.note ? '<div class="muted" style="margin-top:6px">Catatan: ' + U.esc(t.note) + '</div>' : '');

    var buttons = [
      { label: 'Tutup', cls: 'btn-ghost' },
      { label: '&#128424; Cetak Struk', cls: 'btn-ghost', action: function (c) { Receipt.print(t); c(); } }
    ];
    if (t.status === 'paid' || t.status === 'unpaid') {
      buttons.push({
        label: '&#128260; Retur / Refund', cls: 'btn-ghost', action: function (c) { c(); Transactions.refundDialog(t.id); }
      });
    }
    if (t.status === 'paid' && DB.can('pos.void')) {
      buttons.push({
        label: '&#10060; Batalkan', cls: 'btn-danger', action: function (c) { c(); Transactions.voidDialog(t.id); }
      });
    }

    U.modal({ title: 'Detail Transaksi', size: 'wide', body: html, buttons: buttons });
  };

  global.Receipt = Receipt;
})(window);