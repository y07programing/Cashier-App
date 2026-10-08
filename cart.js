/* =====================================================================
   KasirPro - cart.js
   Mesin keranjang: item, diskon, pajak, biaya layanan, pembulatan,
   pelanggan, hold/recall
   ===================================================================== */
(function (global) {
  'use strict';

  var Cart = {};

  Cart.items = [];
  Cart.customerId = '';
  Cart.discount = 0;
  Cart.discountType = 'percent';   /* percent | fixed */
  Cart.serviceFee = null;          /* null = ikut pengaturan */
  Cart.serviceFeeType = null;
  Cart.serviceFeeValue = null;
  Cart.taxOverride = null;         /* null = ikut pengaturan */
  Cart.rounding = null;            /* null = ikut pengaturan */
  Cart.note = '';
  Cart.dirty = false;

  /* ======================= HITUNGAN ======================= */
  Cart.calc = function () {
    var s = DB.data.settings;
    var subtotal = 0, itemDiscTotal = 0, itemQty = 0;
    var itemDiscounts = [];
    Cart.items.forEach(function (it) {
      var gross = it.price * it.qty;
      var d = (it.discountType === 'percent') ? gross * (it.discount || 0) / 100 : (it.discount || 0);
      d = Math.min(Math.max(0, d), gross);
      subtotal += gross;
      itemDiscounts.push(U.round2(d));
      itemDiscTotal += d;
      itemQty += it.qty;
    });
    subtotal = U.round2(subtotal);
    itemDiscTotal = U.round2(itemDiscTotal);

    var afterItem = U.round2(subtotal - itemDiscTotal);

    /* diskon transaksi */
    var txDisc = Cart.discountType === 'percent' ? afterItem * (Cart.discount || 0) / 100 : (Cart.discount || 0);
    txDisc = Math.min(U.round2(Math.max(0, txDisc)), afterItem);
    var afterTx = U.round2(afterItem - txDisc);

    /* biaya layanan */
    var sfType = Cart.serviceFeeType !== null ? Cart.serviceFeeType : s.serviceFeeType;
    var sfVal = Cart.serviceFeeValue !== null ? Cart.serviceFeeValue : s.serviceFeeValue;
    var sfOn = Cart.serviceFee !== null ? true : s.serviceFeeEnabled;
    var serviceFee = sfOn ? (sfType === 'percent' ? U.round2(afterTx * (sfVal || 0) / 100) : U.round2(sfVal || 0)) : 0;

    /* pajak */
    var taxOn = Cart.taxOverride !== null ? Cart.taxOverride : s.taxEnabled;
    var rate = Number(s.taxRate) || 0;
    var tax = 0, taxBase = afterTx;
    if (taxOn && rate > 0) {
      if (s.taxInclusive) {
        taxBase = U.round2(afterTx / (1 + rate / 100));
        tax = U.round2(afterTx - taxBase);
      } else {
        tax = U.round2(afterTx * rate / 100);
        taxBase = afterTx;
      }
    }

    /* bila harga sudah termasuk pajak (PKLN), pajak tidak boleh ditambahkan lagi ke total */
    var taxAdded = (taxOn && s.taxInclusive) ? 0 : tax;
    var beforeRound = U.round2(afterTx + serviceFee + taxAdded);

    /* pembulatan */
    var roundOn = Cart.rounding !== null ? Cart.rounding : false;
    var step = Number(s.roundingStep) || 100;
    var rounding = 0, total = beforeRound;
    if (roundOn && step > 0) {
      var rounded = Math.round(beforeRound / step) * step;
      rounding = U.round2(rounded - beforeRound);
      total = rounded;
    }

    return {
      subtotal: subtotal,
      itemDiscountTotal: itemDiscTotal,
      itemDiscounts: itemDiscounts,
      txDiscount: txDisc,
      afterItem: afterItem,
      afterTx: afterTx,
      serviceFee: serviceFee,
      tax: tax,
      taxBase: taxBase,
      taxOn: taxOn,
      taxRate: rate,
      beforeRound: beforeRound,
      rounding: rounding,
      total: U.round2(total),
      itemQty: itemQty,
      lineCount: Cart.items.length,
      costTotal: U.round2(Cart.items.reduce(function (s, it) { return s + (it.cost || 0) * it.qty; }, 0))
    };
  };

  /* ======================= MANIPULASI ITEM ======================= */
  Cart.add = function (productId, qty) {
    var p = DB.find('products', productId);
    if (!p) { U.toast('Produk tidak ditemukan', 'error'); U.beep('error'); return; }
    if (!p.active) { U.toast('Produk tidak aktif / tidak bisa dijual', 'error'); U.beep('error'); return; }
    if (p.trackStock && p.stock <= 0) { U.toast('Stok "' + p.name + '" habis', 'error'); U.beep('error'); return; }
    qty = qty || 1;

    var exist = null;
    Cart.items.forEach(function (it) { if (it.productId === productId) exist = it; });
    if (exist) {
      if (p.trackStock && exist.qty + qty > p.stock) {
        U.toast('Stok tidak cukup. Sisa ' + p.stock + ' ' + p.unit, 'warn');
        return;
      }
      exist.qty += qty;
    } else {
      Cart.items.push({
        lineId: U.uid('ln'), productId: p.id, sku: p.sku, barcode: p.barcode,
        name: p.name, price: p.price, cost: p.cost || 0, unit: p.unit || 'pcs',
        qty: qty, discount: 0, discountType: 'percent', note: ''
      });
    }
    Cart.dirty = true;
    U.beep();
    Cart.render();
  };

  Cart.addByBarcode = function (code) {
    var p = Catalog.byBarcode(code);
    if (p) { Cart.add(p.id); return true; }
    U.toast('Barcode "' + code + '" tidak ditemukan', 'error');
    U.beep('error');
    return false;
  };

  Cart.setQty = function (lineId, qty) {
    var it = Cart.get(lineId);
    if (!it) return;
    qty = Math.round(qty);
    if (qty <= 0) return Cart.remove(lineId);
    var p = DB.find('products', it.productId);
    if (p && p.trackStock && qty > p.stock) {
      U.toast('Stok hanya ' + p.stock + ' ' + p.unit, 'warn');
      qty = p.stock;
    }
    it.qty = qty;
    Cart.dirty = true;
    Cart.render();
  };

  Cart.inc = function (lineId) { var it = Cart.get(lineId); if (it) Cart.setQty(lineId, it.qty + 1); };
  Cart.dec = function (lineId) { var it = Cart.get(lineId); if (it) Cart.setQty(lineId, it.qty - 1); };
  Cart.get = function (lineId) { var r = null; Cart.items.forEach(function (i) { if (i.lineId === lineId) r = i; }); return r; };
  Cart.remove = function (lineId) {
    Cart.items = Cart.items.filter(function (i) { return i.lineId !== lineId; });
    Cart.dirty = true;
    Cart.render();
  };
  Cart.clear = function () {
    Cart.items = [];
    Cart.discount = 0; Cart.discountType = 'percent';
    Cart.serviceFee = null; Cart.taxOverride = null; Cart.rounding = null; Cart.note = '';
    Cart.dirty = false;
    Cart.render();
  };
  Cart.isEmpty = function () { return Cart.items.length === 0; };

  Cart.setPrice = function (lineId, price) {
    var it = Cart.get(lineId);
    if (!it) return;
    it.price = Math.max(0, U.toNum(price));
    Cart.dirty = true; Cart.render();
  };

  /* ======================= PELANGGAN ======================= */
  Cart.setCustomer = function (id) {
    Cart.customerId = id || '';
    Cart.dirty = true;
    Cart.render();
  };

  /* ======================= DISKON ITEM ======================= */
  Cart.itemDiscountDialog = function (lineId) {
    var it = Cart.get(lineId);
    if (!it) return;
    if (!DB.can('pos.discount')) { U.toast('Hak akses diskon tidak tersedia', 'error'); return; }
    var m = U.modal({
      title: 'Diskon Item: ' + it.name,
      body:
        '<label class="field"><span>Tipe Diskon</span><select id="dt"><option value="percent"' + (it.discountType === 'percent' ? ' selected' : '') + '>Persen (%)</option>' +
        '<option value="fixed"' + (it.discountType === 'fixed' ? ' selected' : '') + '>Nominal (Rp)</option></select></label>' +
        '<label class="field"><span>Nilai Diskon</span><input id="dv" data-autofocus type="number" min="0" step="100" value="' + (it.discount || 0) + '"></label>' +
        '<label class="field"><span>Catatan Baris</span><input id="dn" value="' + U.esc(it.note || '') + '" placeholder="mis. Promo member"></label>' +
        '<div class="muted" id="dprev"></div>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        { label: 'Terapkan', cls: 'btn-primary', action: function (c, mm) {
          it.discountType = U.$('#dt', mm.el).value;
          it.discount = Math.max(0, U.toNum(U.$('#dv', mm.el).value));
          it.note = U.sanitizeName(U.$('#dn', mm.el).value);
          Cart.dirty = true; Cart.render(); c();
        } }
      ]
    });
    var prev = function () {
      var v = U.toNum(U.$('#dv', m.el).value);
      var d = U.$('#dt', m.el).value === 'percent' ? it.price * it.qty * v / 100 : v;
      U.$('#dprev', m.el).innerHTML = 'Harga: <b>' + U.money(it.price) + ' x ' + it.qty + ' = ' + U.money(it.price * it.qty) +
        '</b><br>Diskon: <b style="color:var(--warn)">- ' + U.money(d) + '</b><br>Subtotal: <b style="color:var(--brand)">' + U.money(it.price * it.qty - d) + '</b>';
    };
    U.on(U.$('#dv', m.el), 'input', prev);
    U.on(U.$('#dt', m.el), 'change', prev);
    prev();
  };

  /* ======================= DISKON TRANSAKSI ======================= */
  Cart.discountDialog = function () {
    if (!DB.can('pos.discount')) { U.toast('Hak akses diskon tidak tersedia', 'error'); return; }
    U.modal({
      title: 'Diskon Transaksi',
      body:
        '<label class="field"><span>Tipe</span><select id="gdt">' +
        '<option value="percent"' + (Cart.discountType === 'percent' ? ' selected' : '') + '>Persen (%)</option>' +
        '<option value="fixed"' + (Cart.discountType === 'fixed' ? ' selected' : '') + '>Nominal (Rp)</option></select></label>' +
        '<label class="field"><span>Nilai</span><input id="gdv" data-autofocus type="number" min="0" step="100" value="' + (Cart.discount || 0) + '"></label>' +
        '<label class="switch-row"><input type="checkbox" id="gauto"' + (Cart.discount === 0 && Cart.discountType === 'percent' ? ' checked' : '') + '><span>Preset cepat</span></label>' +
        '<div style="display:flex;gap:6px;flex-wrap:wrap" id="gquick">' +
        [5, 10, 15, 20, 25].map(function (p) { return '<button class="chip" data-p="' + p + '">' + p + '%</button>'; }).join('') +
        '</div>',
      buttons: [
        { label: 'Hapus Diskon', cls: 'btn-ghost', action: function (c) { Cart.discount = 0; Cart.discountType = 'percent'; Cart.dirty = true; Cart.render(); c(); } },
        { label: 'Batal', cls: 'btn-ghost' },
        { label: 'Terapkan', cls: 'btn-primary', action: function (c, mm) {
          Cart.discountType = U.$('#gdt', mm.el).value;
          Cart.discount = Math.max(0, U.toNum(U.$('#gdv', mm.el).value));
          Cart.dirty = true; Cart.render(); c();
        } }
      ]
    });
    var m2 = U.$('#modalHost');
    U.$$('#gquick .chip', m2).forEach(function (b) {
      U.on(b, 'click', function () {
        U.$('#gdt', m2).value = 'percent';
        U.$('#gdv', m2).value = b.getAttribute('data-p');
      });
    });
  };

  /* ======================= BIAYA LAYANAN / PAJAK / BULAT ======================= */
  Cart.serviceFeeDialog = function () {
    var s = DB.data.settings;
    var curType = Cart.serviceFeeType !== null ? Cart.serviceFeeType : (s.serviceFeeType || 'percent');
    var curVal = Cart.serviceFeeValue !== null ? Cart.serviceFeeValue : (s.serviceFeeValue || 0);
    var on = Cart.serviceFee !== null ? Cart.serviceFee : !!s.serviceFeeEnabled;
    U.modal({
      title: 'Biaya Layanan',
      body:
        '<label class="switch-row"><input type="checkbox" id="sfOn"' + (on ? ' checked' : '') + '><span>Aktifkan biaya layanan untuk transaksi ini</span></label>' +
        '<label class="field"><span>Tipe</span><select id="sfT">' +
        '<option value="percent"' + (curType === 'percent' ? ' selected' : '') + '>Persen dari subtotal</option>' +
        '<option value="fixed"' + (curType === 'fixed' ? ' selected' : '') + '>Nominal tetap</option></select></label>' +
        '<label class="field"><span>Nilai</span><input id="sfV" data-autofocus type="number" min="0" step="100" value="' + curVal + '"></label>',
      buttons: [
        { label: 'Ikut Pengaturan Toko', cls: 'btn-ghost', action: function (c) { Cart.serviceFee = null; Cart.serviceFeeType = null; Cart.serviceFeeValue = null; Cart.dirty = true; Cart.render(); c(); } },
        { label: 'Terapkan', cls: 'btn-primary', action: function (c, m) {
          Cart.serviceFee = U.$('#sfOn', m.el).checked;
          Cart.serviceFeeType = U.$('#sfT', m.el).value;
          Cart.serviceFeeValue = U.toNum(U.$('#sfV', m.el).value);
          Cart.dirty = true; Cart.render(); c();
        } }
      ]
    });
  };

  Cart.taxDialog = function () {
    if (!DB.can('setting.manage') && !DB.can('pos.discount')) { U.toast('Hak akses dibatasi', 'error'); return; }
    var s = DB.data.settings;
    var on = Cart.taxOverride !== null ? Cart.taxOverride : !!s.taxEnabled;
    U.modal({
      title: 'Pajak (PPN)',
      body:
        '<label class="switch-row"><input type="checkbox" id="txOn"' + (on ? ' checked' : '') + '><span>Terapkan pajak pada transaksi ini</span></label>' +
        '<label class="field"><span>Tarif (%)</span><input id="txR" type="number" min="0" step="0.1" value="' + s.taxRate + '"></label>' +
        '<label class="switch-row"><input type="checkbox" id="txInc"' + (s.taxInclusive ? ' checked' : '') + '><span>Harga sudah termasuk pajak (PKLN)</span></label>',
      buttons: [
        { label: 'Ikut Pengaturan Toko', cls: 'btn-ghost', action: function (c) { Cart.taxOverride = null; Cart.dirty = true; Cart.render(); c(); } },
        { label: 'Terapkan', cls: 'btn-primary', action: function (c, m) {
          Cart.taxOverride = U.$('#txOn', m.el).checked;
          var patch = { taxRate: U.toNum(U.$('#txR', m.el).value), taxInclusive: U.$('#txInc', m.el).checked };
          DB.setSettings(patch);
          Cart.dirty = true; Cart.render(); c();
        } }
      ]
    });
  };

  Cart.roundingDialog = function () {
    var s = DB.data.settings;
    var on = Cart.rounding !== null ? Cart.rounding : false;
    U.modal({
      title: 'Pembulatan Uang Tunai',
      body:
        '<p class="muted">PembulatanximUM membuat total menjadi angka bulat yang enak dilihat (mis. Rp 10.250 menjadi Rp 10.300).</p>' +
        '<label class="switch-row"><input type="checkbox" id="rdOn"' + (on ? ' checked' : '') + '><span>Aktifkan pembulatan</span></label>' +
        '<label class="field"><span>Kelipatan (Rp)</span><select id="rdS">' +
        [100, 500, 1000, 5000].map(function (v) { return '<option value="' + v + '"' + (Number(s.roundingStep) === v ? ' selected' : '') + '>' + U.nf(v) + '</option>'; }).join('') +
        '</select></label>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        { label: 'Terapkan', cls: 'btn-primary', action: function (c, m) {
          Cart.rounding = U.$('#rdOn', m.el).checked;
          DB.setSettings({ roundingStep: U.toNum(U.$('#rdS', m.el).value) });
          Cart.dirty = true; Cart.render(); c();
        } }
      ]
    });
  };

  /* ======================= HOLD / RECALL ======================= */
  Cart.hold = function () {
    if (Cart.isEmpty()) { U.toast('Keranjang masih kosong', 'warn'); return; }
    if (!DB.can('pos.hold')) { U.toast('Hak akses simpan transaksi tidak tersedia', 'error'); return; }
    U.prompt('Simpan Transaksi Sementara', 'Nama / nomor meja (opsional)', '', 'text').then(function (label) {
      if (label === null) return;
      var snap = {
        id: U.uid('hold'), label: label || 'Transaksi ' + U.fmtTime(U.nowIso()),
        date: U.nowIso(), customerId: Cart.customerId,
        items: JSON.parse(JSON.stringify(Cart.items)),
        discount: Cart.discount, discountType: Cart.discountType,
        serviceFee: Cart.serviceFee, serviceFeeType: Cart.serviceFeeType,
        serviceFeeValue: Cart.serviceFeeValue, taxOverride: Cart.taxOverride,
        rounding: Cart.rounding, note: Cart.note,
        total: Cart.calc().total, cashierId: APP.currentUser.id, cashierName: APP.currentUser.name
      };
      DB.data.holds.push(snap);
      if (DB.data.holds.length > 30) DB.data.holds.shift();
      DB.save();
      U.toast('Transaksi disimpan sementara', 'success');
      Cart.clear();
    });
  };

  Cart.recall = function () {
    var holds = DB.data.holds;
    if (!holds.length) { U.toast('Belum ada transaksi tersimpan', 'info'); return; }
    var items = holds.map(function (h) {
      return {
        id: h.id, avatar: 'H', name: h.label,
        sub: h.cashierName + ' - ' + U.since(h.date) + ' - ' + h.items.length + ' item',
        right: U.money(h.total)
      };
    });
    U.picker({ title: 'Buka Transaksi Tersimpan', items: items, placeholder: 'Cari nama transaksi...' }).then(function (sel) {
      if (!sel) return;
      var h = DB.find('holds', sel.id);
      if (!h) return;
      if (!Cart.isEmpty()) {
        U.confirm('Keranjang saat ini akan diganti. Lanjutkan?').then(function (ok) {
          if (ok) Cart.applyHold(h);
        });
      } else Cart.applyHold(h);
    });
  };
  Cart.applyHold = function (h) {
    Cart.items = JSON.parse(JSON.stringify(h.items));
    Cart.customerId = h.customerId || '';
    Cart.discount = h.discount || 0;
    Cart.discountType = h.discountType || 'percent';
    Cart.serviceFee = h.serviceFee;
    Cart.serviceFeeType = h.serviceFeeType;
    Cart.serviceFeeValue = h.serviceFeeValue;
    Cart.taxOverride = h.taxOverride;
    Cart.rounding = h.rounding;
    Cart.note = h.note || '';
    DB.remove('holds', h.id);
    Cart.dirty = true;
    Cart.render();
    U.toast('Transaksi "' + h.label + '" dimuat ke keranjang', 'success');
  };

  /* ======================= RENDER ======================= */
  Cart.render = function () {
    var list = U.$('#cartList');
    if (!list) return;

    /* header meta */
    var c = Cart.calc();
    U.$('#cartMeta').textContent = c.lineCount + ' item / ' + c.itemQty + ' qty';

    /* customer bar */
    var cb = U.$('#cartCustomerBar');
    if (Cart.customerId) {
      var cust = DB.find('customers', Cart.customerId);
      if (cust) {
        cb.innerHTML = '<div class="cust-bar"><div class="ava">' + U.esc(U.initials(cust.name)) + '</div>' +
          '<div class="info"><strong>' + U.esc(cust.name) + '</strong><small>' + U.esc(cust.code) + (cust.phone ? ' - ' + U.esc(cust.phone) : '') + '</small></div>' +
          '<button class="icon-btn sm" id="btnClearCust" title="Hapus pelanggan">✕</button></div>';
        U.on(U.$('#btnClearCust'), 'click', function () { Cart.setCustomer(''); });
      } else { Cart.customerId = ''; cb.innerHTML = '<button class="btn btn-ghost btn-block" id="btnPickCustomer">Pilih Pelanggan</button>'; bindPick(); }
    } else {
      cb.innerHTML = '<button class="btn btn-ghost btn-block" id="btnPickCustomer">Pilih Pelanggan</button>';
    }
    function bindPick() { U.on(U.$('#btnPickCustomer'), 'click', Cart.pickCustomer); }
    if (!Cart.customerId) bindPick();

    /* items */
    if (!Cart.items.length) {
      list.innerHTML = '<div class="empty-state"><div class="ico">' + (c.dirty ? '' : '&#128722;') + '</div>' +
        '<b>Keranjang kosong</b><span>Pilih produk di sebelah kiri atau scan barcode</span></div>';
    } else {
      list.innerHTML = Cart.items.map(function (it, i) {
        var idx = c.itemDiscounts[i] || 0;
        var line = U.round2(it.price * it.qty - idx);
        return '<div class="citem" data-lid="' + it.lineId + '">' +
          '<div class="idx">' + (i + 1) + '</div>' +
          '<div class="info">' +
          '<strong>' + U.esc(it.name) + '</strong>' +
          '<div class="meta">' + U.money(it.price) + ' x ' + it.qty + ' ' + U.esc(it.unit) + '</div>' +
          (idx ? '<div class="disc">Diskon -' + U.money(idx) + (it.discountType === 'percent' ? ' (' + it.discount + '%)' : '') + '</div>' : '') +
          (it.note ? '<div class="meta">&#128172; ' + U.esc(it.note) + '</div>' : '') +
          '</div>' +
          '<div class="right-side">' +
          '<div class="line-total">' + U.money(line) + '</div>' +
          '<div class="qty-ctrl">' +
          '<button data-q="dec">-</button>' +
          '<input type="number" value="' + it.qty + '" min="1" data-qty>' +
          '<button data-q="inc">+</button>' +
          '</div>' +
          '<div style="display:flex;gap:4px">' +
          '<button class="edit-btn" data-q="edit" title="Diskon item">&#127991;</button>' +
          '<button class="edit-btn" data-q="price" title="Ubah harga">&#128176;</button>' +
          '<button class="edit-btn" data-q="del" title="Hapus">&times;</button>' +
          '</div>' +
          '</div></div>';
      }).join('');

      U.$$('.citem', list).forEach(function (el) {
        var lid = el.getAttribute('data-lid');
        var qin = U.$('[data-qty]', el);
        U.on(qin, 'change', function () { Cart.setQty(lid, U.toNum(qin.value)); });
        U.on(qin, 'keydown', function (e) { if (e.key === 'Enter') Cart.setQty(lid, U.toNum(qin.value)); });
        U.$$('[data-q]', el).forEach(function (b) {
          U.on(b, 'click', function () {
            var a = b.getAttribute('data-q');
            if (a === 'inc') Cart.inc(lid);
            if (a === 'dec') Cart.dec(lid);
            if (a === 'del') Cart.remove(lid);
            if (a === 'edit') Cart.itemDiscountDialog(lid);
            if (a === 'price') Cart.changePriceDialog(lid);
          });
        });
      });
    }

    /* kalkulasi */
    U.$('#calcSubtotal').textContent = U.money(c.subtotal);
    U.$('#calcItemDiscount').textContent = '- ' + U.money(c.itemDiscountTotal);
    U.$('#calcDiscount').textContent = '- ' + U.money(c.txDiscount) + (Cart.discountType === 'percent' && Cart.discount ? ' (' + Cart.discount + '%)' : '');
    U.$('#calcServiceFee').textContent = U.money(c.serviceFee);
    U.$('#calcTax').textContent = U.money(c.tax) + (c.taxOn ? ' (' + U.nf(c.taxRate, 1) + '%)' : '');
    U.$('#calcRounding').textContent = (c.rounding >= 0 ? '' : '-') + U.money(Math.abs(c.rounding));
    U.$('#calcTotal').textContent = U.money(c.total);

    U.$('#rowDiscount').classList.toggle('clickable', DB.can('pos.discount'));
    U.$('#rowServiceFee').classList.toggle('clickable', true);
    U.$('#rowTax').classList.toggle('clickable', DB.can('setting.manage') || DB.can('pos.discount'));
    U.$('#rowRounding').classList.toggle('clickable', true);

    U.$('#btnPay').disabled = Cart.isEmpty();
    U.$('#btnPayPartial').disabled = Cart.isEmpty();
  };

  Cart.changePriceDialog = function (lineId) {
    var it = Cart.get(lineId);
    if (!it) return;
    if (!DB.can('pos.discount')) { U.toast('Hak akses ubah harga tidak tersedia', 'error'); return; }
    U.modal({
      title: 'Ubah Harga: ' + it.name,
      body: '<label class="field"><span>Harga satuan (Rp)</span><input id="np" data-autofocus type="number" min="0" step="100" value="' + it.price + '"></label>' +
        '<div class="muted">Harga asli: <b>' + U.money(DB.find('products', it.productId) ? DB.find('products', it.productId).price : it.price) + '</b></div>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        { label: 'Simpan', cls: 'btn-primary', action: function (c, m) { Cart.setPrice(lineId, U.$('#np', m.el).value); c(); } }
      ]
    });
  };

  /* ======================= PILIH PELANGGAN ======================= */
  Cart.pickCustomer = function () {
    var list = [{ id: '', name: 'Pelanggan Umum / Walk-in', sub: 'Transaksi tanpa identitas', right: '' }]
      .concat(DB.all('customers').map(function (c) {
        return { id: c.id, name: c.name, sub: c.code + (c.phone ? ' - ' + c.phone : ''), right: '' };
      }));
    U.picker({ title: 'Pilih Pelanggan', items: list, placeholder: 'Cari nama / kode pelanggan...' })
      .then(function (sel) { if (sel) Cart.setCustomer(sel.id); });
  };

  /* ======================= EVENTS ======================= */
  Cart.init = function () {
    U.on(U.$('#btnClearCart'), 'click', function () {
      if (Cart.isEmpty()) return;
      U.confirm('Kosongkan seluruh isi keranjang?').then(function (ok) { if (ok) Cart.clear(); });
    });
    U.on(U.$('#btnHoldOrder'), 'click', Cart.hold);
    U.on(U.$('#btnRecallOrder'), 'click', Cart.recall);
    U.on(U.$('#rowDiscount'), 'click', Cart.discountDialog);
    U.on(U.$('#rowServiceFee'), 'click', Cart.serviceFeeDialog);
    U.on(U.$('#rowTax'), 'click', Cart.taxDialog);
    U.on(U.$('#rowRounding'), 'click', Cart.roundingDialog);
    U.on(U.$('#btnPay'), 'click', function () { Checkout.open('full'); });
    U.on(U.$('#btnPayPartial'), 'click', function () { Checkout.open('partial'); });
    U.on(U.$('#btnBarcodeInfo'), 'click', function () {
      U.$('#posSearch').focus();
      U.$('#barcodeIndicator').classList.add('show');
      setTimeout(function () { U.$('#barcodeIndicator').classList.remove('show'); }, 2500);
    });
  };

  global.Cart = Cart;
})(window);