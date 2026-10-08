/* =====================================================================
   KasirPro - checkout.js
   Proses pembayaran: tunai, QRIS, kartu, transfer, e-wallet,
   bayar tempo (piutang), pembayaran gabungan / sebagian
   ===================================================================== */
(function (global) {
  'use strict';

  var Checkout = {};

  var METHODS = [
    { id: 'cash', label: 'Tunai', ico: '&#128176;' },
    { id: 'qris', label: 'QRIS', ico: '&#128241;' },
    { id: 'debit', label: 'Kartu Debit', ico: '&#128179;' },
    { id: 'credit', label: 'Kartu Kredit', ico: '&#128143;' },
    { id: 'transfer', label: 'Transfer Bank', ico: '&#127974;' },
    { id: 'ewallet', label: 'E-Wallet', ico: '&#128241;' },
    { id: 'tempo', label: 'Bayar Tempo', ico: '&#128205;' }
  ];
  Checkout.METHODS = METHODS;
  Checkout.label = function (m) { var x = METHODS.filter(function (k) { return k.id === m; })[0]; return x ? x.label : m; };

  var payState = { payments: [], mode: 'full' };

  /* ======================= PEMBUKAAN ======================= */
  Checkout.open = function (mode) {
    if (Cart.isEmpty()) { U.toast('Keranjang masih kosong', 'warn'); return; }
    if (!DB.can('pos.sell')) { U.toast('Anda tidak memiliki hak akses menjual', 'error'); return; }
    payState = { payments: [], mode: mode || 'full' };

    var c = Cart.calc();
    var m = U.modal({
      title: payState.mode === 'partial' ? 'Pembayaran Sebagian / DP' : 'Pembayaran',
      size: 'wide',
      body: '<div id="payArea"></div>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        { label: 'Selesaikan Pembayaran', cls: 'btn-primary', action: function (close, mm) { Checkout.finish(close, mm); } }
      ]
    });
    Checkout.modal = m;
    Checkout.renderPay();
    setTimeout(function () { var el = U.$('#payAmount'); if (el) el.focus(); }, 80);
  };

  /* Nominal yang benar-benar diterima (tempo hanya dihitung DP-nya) */
  Checkout.settled = function () {
    return U.round2(payState.payments.reduce(function (s, p) {
      return s + (p.method === 'tempo' ? (U.toNum(p.dp) || 0) : p.amount);
    }, 0));
  };

  /* ======================= RENDER AREA BAYAR ======================= */
  Checkout.renderPay = function () {
    var host = U.$('#payArea');
    if (!host) return;
    var c = Cart.calc();
    var paid = Checkout.settled();
    var remain = U.round2(Math.max(0, c.total - paid));

    host.innerHTML =
      '<div class="big-amount">' +
      '<div class="lbl">Total yang Harus Dibayar</div>' +
      '<div class="val" style="color:var(--brand)">' + U.money(c.total) + '</div>' +
      (paid ? '<div class="sub">Sudah dibayar <b>' + U.money(paid) + '</b> - Sisa <b style="color:var(--warn)">' + U.money(remain) + '</b></div>' : '') +
      '</div>' +
      '<hr>' +
      '<div class="field"><span>Metode Pembayaran</span><div class="pay-grid" id="payGrid">' +
      METHODS.filter(function (x) { return payState.mode === 'partial' ? true : x.id !== 'tempo'; }).map(function (x) {
        return '<button class="pay-btn" data-m="' + x.id + '"><span class="ico">' + x.ico + '</span>' + x.label + '</button>';
      }).join('') + '</div></div>' +
      '<div id="payDetail"></div>' +
      '<div id="payListWrap"></div>';

    U.$$('#payGrid .pay-btn', host).forEach(function (b) {
      U.on(b, 'click', function () { Checkout.chooseMethod(b.getAttribute('data-m')); });
    });
    Checkout.renderList();
  };

  Checkout.chooseMethod = function (method) {
    if (method === 'tempo' && !Cart.customerId) {
      U.toast('Bayar tempo wajib memilih pelanggan terlebih dahulu', 'error', 3600);
      return;
    }
    var c = Cart.calc();
    var remain = U.round2(Math.max(0, c.total - Checkout.settled()));
    var detail = U.$('#payDetail');

    var html = '';
    if (method === 'cash') {
      var opts = [];
      [1, 2, 5, 10].forEach(function (f) {
        var base = remain;
        var vals = [f * 1000, f * 10000, f * 100000];
        vals.forEach(function (v) { if (v >= remain && opts.indexOf(v) < 0) opts.push(v); });
        void base;
      });
      opts = opts.sort(function (a, b) { return a - b; }).slice(0, 7);
      if (opts.indexOf(Math.ceil(remain / 100000) * 100000) < 0 && remain > 0) opts.push(Math.ceil(remain / 100000) * 100000);
      html =
        '<label class="field"><span>Uang Diterima (Rp)</span><input id="payAmount" type="number" min="0" step="100" value="' + remain + '"></label>' +
        '<div class="quick-cash">' +
        (remain > 0 ? '<button data-cash="' + Math.ceil(remain / 1000) * 1000 + '">Uang Pas</button>' : '') +
        opts.map(function (v) { return '<button data-cash="' + v + '">' + U.short(v) + '</button>'; }).join('') +
        '</div>' +
        '<div class="muted" id="cashInfo"></div>';
    } else if (method === 'tempo') {
      html =
        '<div class="muted">Sisa tagihan dicatat sebagai piutang pelanggan dan dapat dilunasi di menu <b>Piutang / Utang</b>.</div>' +
        '<label class="field"><span>Uang Muka / DP (Rp) - boleh 0</span><input id="payAmount" type="number" min="0" step="100" value="0"></label>' +
        '<div class="muted" id="tempoInfo"></div>' +
        '<label class="field"><span>Jatuh Tempo (hari)</span><input id="payDue" type="number" min="0" step="1" value="14"></label>' +
        '<label class="field"><span>Catatan</span><input id="payRef" placeholder="mis. Tempo 2 minggu"></label>';
    } else {
      html =
        '<label class="field"><span>Nominal (Rp)</span><input id="payAmount" type="number" min="0" step="100" value="' + remain + '"></label>' +
        (method === 'qris' || method === 'ewallet'
          ? '<div class="muted">Pastikan pembayaran sudah dikonfirmasi di aplikasi <b>' + (method === 'qris' ? 'QRIS / m-banking' : 'e-wallet') + '</b>.</div>'
          : '') +
        (method === 'debit' || method === 'credit'
          ? '<label class="field"><span>4 Digit Terakhir Kartu</span><input id="payRef" maxlength="4" inputmode="numeric" placeholder="mis. 8888"></label>'
          : '<label class="field"><span>Referensi / ID Transaksi</span><input id="payRef" placeholder="opsional"></label>');
    }
    html += '<div style="margin-top:10px"><button class="btn btn-primary btn-block" id="btnAddPay">+ Tambahkan Pembayaran</button></div>';
    detail.innerHTML = html;

    if (method === 'cash') {
      var upd = function () {
        var v = U.toNum(U.$('#payAmount').value);
        var ch = U.round2(v - remain);
        U.$('#cashInfo').innerHTML = v < remain
          ? '<span style="color:var(--danger)">Uang belum cukup (kurang ' + U.money(remain - v) + ')</span>'
          : 'Kembalian: <b style="color:var(--success)">' + U.money(ch) + '</b>';
      };
      U.on(U.$('#payAmount'), 'input', upd); upd();
      U.$$('#payDetail [data-cash]').forEach(function (b) {
        U.on(b, 'click', function () { U.$('#payAmount').value = b.getAttribute('data-cash'); upd(); });
      });
    }
    if (method === 'tempo') {
      var updTempo = function () {
        var dp = Math.round(U.toNum(U.$('#payAmount').value));
        var sisa = remain - Math.max(0, Math.min(dp, remain));
        U.$('#tempoInfo').innerHTML = dp > remain
          ? '<span style="color:var(--danger)">DP melebihi sisa tagihan</span>'
          : 'Sisa tagihan jadi piutang: <b style="color:var(--danger)">' + U.money(sisa) + '</b>' +
          (dp > 0 ? ' (DP ' + U.money(dp) + ' dicatat masuk kas)' : '');
      };
      U.on(U.$('#payAmount'), 'input', updTempo); updTempo();
    }

    U.on(U.$('#btnAddPay'), 'click', function () {
      var amount = Math.round(U.toNum(U.$('#payAmount').value));
      var ref = U.$('#payRef') ? U.$('#payRef').value.trim() : '';
      var due = Math.round(U.toNum(U.$('#payDue') ? U.$('#payDue').value : 14));

      if (method === 'tempo') {
        /* DP boleh 0 (kredit penuh). Nominal kredit = sisa tagihan. */
        if (amount < 0) { U.toast('Uang muka tidak boleh negatif', 'error'); U.beep('error'); return; }
        if (amount >= remain) {
          U.toast('Uang muka harus lebih kecil dari sisa tagihan (' + U.money(remain) + ')', 'error');
          U.beep('error'); return;
        }
        payState.payments.push({
          method: 'tempo', amount: remain, dp: amount, dueDays: due, ref: U.sanitizeName(ref)
        });
        U.beep('cash');
        Checkout.renderPay();
        return;
      }

      if (amount <= 0) { U.toast('Nominal pembayaran harus lebih dari 0', 'error'); U.beep('error'); return; }
      if (amount > remain) {
        U.toast('Nominal melebihi sisa tagihan (' + U.money(remain) + ')', 'error'); U.beep('error'); return;
      }
      payState.payments.push({ method: method, amount: amount, ref: U.sanitizeName(ref) });
      U.beep('cash');
      Checkout.renderPay();
    });
  };

  Checkout.renderList = function () {
    var wrap = U.$('#payListWrap');
    if (!wrap || !payState.payments.length) { if (wrap) wrap.innerHTML = ''; return; }
    wrap.innerHTML = '<hr><div class="field"><span>Pembayaran Ditambahkan</span>' +
      payState.payments.map(function (p, i) {
        var shown = p.method === 'tempo' ? (U.toNum(p.dp) || 0) : p.amount;
        return '<div class="picker-item"><div class="ava">' + (METHODS.filter(function (m) { return m.id === p.method; })[0] || { ico: '?' }).ico + '</div>' +
          '<div class="t"><strong>' + Checkout.label(p.method) + (p.method === 'tempo' ? ' (DP + kredit)' : '') + '</strong><small>' + U.fmtTime(U.nowIso()) + (p.ref ? ' - ' + U.esc(p.ref) : '') + '</small></div>' +
          '<div class="r">' + U.money(shown) + (p.method === 'tempo' && p.amount ? '<br><small class="muted">kredit ' + U.money(p.amount) + '</small>' : '') + '</div>' +
          '<button class="icon-btn sm danger" data-rm="' + i + '">&times;</button></div>';
      }).join('') + '</div>';
    U.$$('[data-rm]', wrap).forEach(function (b) {
      U.on(b, 'click', function () { payState.payments.splice(Number(b.getAttribute('data-rm')), 1); Checkout.renderPay(); });
    });
  };

  /* ======================= PENYELESAIAN ======================= */
  Checkout.finish = function (close, m) {
    var c = Cart.calc();
    var hasTempo = payState.payments.some(function (p) { return p.method === 'tempo'; });

    if (!payState.payments.length) { U.toast('Tambahkan minimal satu metode pembayaran', 'error'); U.beep('error'); return; }
    if (hasTempo && !Cart.customerId) { U.toast('Transaksi tempo harus memiliki pelanggan', 'error'); return; }

    /* Uang yang benar-benar diterima toko:
       - tunai & non-tunai  : nominal penuh
       - tempo              : hanya DP (uang muka), sisanya jadi piutang */
    var received = U.round2(payState.payments.reduce(function (s, p) {
      return s + (p.method === 'tempo' ? (U.toNum(p.dp) || 0) : p.amount);
    }, 0));
    /* Nominal kredit yang dicatat sebagai piutang */
    var credit = U.round2(payState.payments.filter(function (p) { return p.method === 'tempo'; })
      .reduce(function (s, p) { return s + p.amount; }, 0));

    if (!hasTempo && payState.mode === 'partial' && received <= 0) {
      U.toast('Masukkan nominal pembayaran', 'error'); return;
    }
    /* Transaksi non-kredit harus lunas (tunai boleh lebih untuk kembalian) */
    if (!hasTempo && received < c.total) {
      U.toast('Pembayaran belum penuh. Sisa tagihan ' + U.money(c.total - received), 'error');
      U.beep('error');
      return;
    }
    /* Transaksi kredit: sisa setelah DP tidak boleh melebihi nominal kredit */
    if (hasTempo && U.round2(c.total - received) > credit + 1) {
      U.toast('Nominal kredit (' + U.money(credit) + ') tidak menutup sisa tagihan ' +
        U.money(c.total - received), 'error');
      U.beep('error');
      return;
    }

    var cashPaid = U.round2(payState.payments.filter(function (p) { return p.method === 'cash'; })
      .reduce(function (s, p) { return s + p.amount; }, 0));
    /* DP dianggap diterima tunai (uang muka di tangan kasir) */
    var dp = U.round2(payState.payments.filter(function (p) { return p.method === 'tempo'; })
      .reduce(function (s, p) { return s + (U.toNum(p.dp) || 0); }, 0));
    var nonCash = U.round2(received - cashPaid - dp);

    /* Tunai boleh melebihi sisa tagihan -> kembalian */
    var change = U.round2(Math.max(0, cashPaid + dp - (c.total - nonCash)));
    /* Sisa tagihan yang menjadi piutang */
    var dueAmount = U.round2(Math.max(0, c.total - (nonCash + cashPaid + dp - change)));
    var netPaid = U.round2(c.total - dueAmount);
    var cashForDrawer = U.round2(Math.max(0, netPaid - nonCash));

    var tx = {
      id: U.uid('tx'),
      no: DB.receiptNo(),
      date: U.nowIso(),
      shiftId: (Shift.active() ? Shift.active().id : ''),
      customerId: Cart.customerId,
      customerName: Cart.customerId && DB.find('customers', Cart.customerId) ? DB.find('customers', Cart.customerId).name : 'Umum',
      cashierId: APP.currentUser.id, cashierName: APP.currentUser.name,
      items: Cart.items.map(function (it, i) {
        return {
          productId: it.productId, sku: it.sku, name: it.name, unit: it.unit,
          price: it.price, qty: it.qty, discount: (c.itemDiscounts[i] || 0),
          discountType: 'fixed', subtotal: U.round2(it.price * it.qty - (c.itemDiscounts[i] || 0)),
          cost: it.cost || 0, note: it.note || '', returnQty: 0
        };
      }),
      itemCount: c.itemQty,
      subtotal: c.subtotal, itemDiscountTotal: c.itemDiscountTotal,
      discount: c.txDiscount, discountType: 'fixed',
      serviceFee: c.serviceFee, serviceFeeType: Cart.serviceFeeType || DB.setting('serviceFeeType'),
      tax: c.tax, taxRate: c.taxRate, taxBase: c.taxBase,
      rounding: c.rounding, total: c.total,
      paid: netPaid,
      paidCash: cashForDrawer, paidNonCash: nonCash,
      downPayment: dp, creditAmount: credit,
      change: change,
      tendered: U.round2(cashPaid + dp + nonCash),
      payments: payState.payments.slice(),
      paymentMethod: payState.payments.length > 1 ? 'split' : payState.payments[0].method,
      paymentLabel: payState.payments.length > 1 ? 'Gabungan' : Checkout.label(payState.payments[0].method),
      dueAmount: dueAmount,
      status: dueAmount > 0 ? 'unpaid' : 'paid',
      note: Cart.note,
      createdAt: U.nowIso()
    };

    DB.data.transactions.push(tx);
    DB.data.counters.tx = (DB.data.counters.tx || 0) + 1;

    /* kurangi stok */
    tx.items.forEach(function (it) {
      DB.adjustStock(it.productId, -it.qty, 'sale', 'Penjualan ' + tx.no, tx.no);
    });

    /* simpan ke shift & kas */
    Shift.registerSale(tx);

    DB.log('TRANSAKSI', 'Transaksi', tx.id, tx.no + ' - ' + U.money(tx.total));
    DB.flush();

    if (DB.setting('sound')) U.beep('cash');
    close();

    /* ringkasan */
    Receipt.showSuccess(tx, change, dueAmount);
    Cart.clear();
    App.refreshBadges();
    Catalog.renderPOS();
    if (DB.setting('autoPrint')) Receipt.print(tx, change);
  };


  global.Checkout = Checkout;
})(window);