/* =====================================================================
   KasirPro - catalog.js
   Produk, kategori, grid POS
   ===================================================================== */
(function (global) {
  'use strict';

  var Catalog = {};
  var state = { cat: '', q: '', sort: 'name', grid: 1 };

  /* ================= QUERY ================= */
  Catalog.catName = function (id) { var c = DB.find('categories', id); return c ? c.name : '-'; };
  Catalog.catIcon = function (id) { var c = DB.find('categories', id); return c ? (c.icon || '•') : '•'; };
  Catalog.byBarcode = function (code) {
    code = String(code || '').trim();
    if (!code) return null;
    var hit = null;
    DB.all('products').forEach(function (p) {
      if (!hit && p.active && (String(p.barcode) === code || String(p.sku).toLowerCase() === code.toLowerCase())) hit = p;
    });
    return hit;
  };
  Catalog.margin = function (p) {
    if (!p.price) return 0;
    return U.pct(p.price - (p.cost || 0), p.price);
  };
  Catalog.stockTag = function (p) {
    if (!p.trackStock) return { cls: 'grey', label: '∞' };
    if (p.stock <= 0) return { cls: 'out', label: 'Habis' };
    if (p.stock <= (p.minStock || 0)) return { cls: 'low', label: 'Menipis' };
    return { cls: 'ok', label: p.stock + ' ' + (p.unit || '') };
  };

  /* ================= GRID POS ================= */
  Catalog.renderChips = function () {
    var host = U.$('#posCategories');
    if (!host) return;
    var counts = {};
    DB.all('products').forEach(function (p) {
      if (p.active) counts[p.categoryId] = (counts[p.categoryId] || 0) + 1;
    });
    var html = '<button class="chip' + (state.cat === '' ? ' active' : '') + '" data-cat="">Semua <span class="cnt">' +
      DB.all('products').filter(function (p) { return p.active; }).length + '</span></button>';
    DB.all('categories').forEach(function (c) {
      html += '<button class="chip' + (state.cat === c.id ? ' active' : '') + '" data-cat="' + c.id + '">' +
        (c.icon || '') + ' ' + U.esc(c.name) + ' <span class="cnt">' + (counts[c.id] || 0) + '</span></button>';
    });
    host.innerHTML = html;
    U.$$('.chip', host).forEach(function (b) {
      U.on(b, 'click', function () { state.cat = b.getAttribute('data-cat'); Catalog.renderPOS(); });
    });
  };

  Catalog.filtered = function () {
    var q = state.q.toLowerCase().trim();
    var list = DB.all('products').filter(function (p) {
      if (!p.active) return false;
      if (state.cat && p.categoryId !== state.cat) return false;
      if (!q) return true;
      return (p.name + ' ' + p.sku + ' ' + (p.barcode || '')).toLowerCase().indexOf(q) >= 0;
    });
    list.sort(function (a, b) {
      switch (state.sort) {
        case 'name-desc': return b.name.localeCompare(a.name);
        case 'price-desc': return b.price - a.price;
        case 'price-asc': return a.price - b.price;
        case 'stock-asc': return (a.stock - b.stock) || a.name.localeCompare(b.name);
        case 'sold': return DB.soldQty(b.id) - DB.soldQty(a.id);
        default: return a.name.localeCompare(b.name);
      }
    });
    return list;
  };

  Catalog.renderPOS = function () {
    var grid = U.$('#posProductGrid');
    if (!grid) return;
    Catalog.renderChips();
    grid.className = 'product-grid' + (state.grid > 1 ? ' g' + state.grid : '');
    var list = Catalog.filtered();
    U.$('#posProductCount').textContent = list.length + ' produk';
    if (!list.length) {
      grid.innerHTML = '<div class="empty-state" style="grid-column:1/-1"><div class="ico">📦</div>' +
        '<b>Produk tidak ditemukan</b><span>Ubah kata kunci atau kategori pencarian</span></div>';
      return;
    }
    grid.innerHTML = list.map(function (p) {
      var st = Catalog.stockTag(p);
      var oos = p.trackStock && p.stock <= 0;
      return '<div class="pcard' + (oos ? ' out-of-stock' : '') + '" data-pid="' + p.id + '" title="' + U.esc(p.name) + '">' +
        '<span class="p-stock ' + st.cls + '">' + st.label + '</span>' +
        '<span class="p-cat">' + U.esc(Catalog.catIcon(p.categoryId)) + ' ' + U.esc(Catalog.catName(p.categoryId)) + '</span>' +
        '<span class="p-name">' + U.esc(p.name) + '</span>' +
        '<span class="p-barcode">' + U.esc(p.barcode || p.sku) + '</span>' +
        '<span class="p-price">' + U.money(p.price) + ' <small>/' + U.esc(p.unit || 'pcs') + '</small></span>' +
        '</div>';
    }).join('');
    U.$$('.pcard', grid).forEach(function (el) {
      U.on(el, 'click', function () { Cart.add(el.getAttribute('data-pid')); });
    });
  };

  /* ================= FORM PRODUK ================= */
  Catalog.productForm = function (product) {
    if (!DB.can('prod.edit')) { U.toast('Anda tidak memiliki hak akses mengubah produk', 'error'); return; }
    var p = product || null;
    var cats = DB.all('categories');
    if (!cats.length) { U.toast('Buat kategori terlebih dahulu', 'warn'); return; }
    var isNew = !p;
    if (p) p = JSON.parse(JSON.stringify(p));
    else p = { name: '', sku: '', barcode: '', categoryId: cats[0].id, price: '', cost: '', unit: 'pcs', stock: 0, minStock: 5, trackStock: true, description: '', active: true };

    var body =
      '<div class="grid-form-2">' +
      '<label class="field"><span>Nama Produk *</span><input id="fName" data-autofocus value="' + U.esc(p.name) + '"></label>' +
      '<label class="field"><span>Kategori *</span><select id="fCat">' +
      cats.map(function (c) { return '<option value="' + c.id + '"' + (c.id === p.categoryId ? ' selected' : '') + '>' + U.esc(c.name) + '</option>'; }).join('') +
      '</select></label></div>' +
      '<div class="grid-form-2">' +
      '<label class="field"><span>Harga Jual (Rp) *</span><input id="fPrice" type="number" min="0" step="100" value="' + (p.price || '') + '"></label>' +
      '<label class="field"><span>Harga Modal / HPP (Rp)</span><input id="fCost" type="number" min="0" step="100" value="' + (p.cost || '') + '"></label></div>' +
      '<div class="grid-form-2">' +
      '<label class="field"><span>Satuan</span><input id="fUnit" value="' + U.esc(p.unit || 'pcs') + '"></label>' +
      '<label class="field"><span>SKU / Kode Internal</span><input id="fSku" value="' + U.esc(p.sku || '') + '"></label></div>' +
      '<div class="grid-form-2">' +
      '<label class="field"><span>Barcode</span><input id="fBarcode" value="' + U.esc(p.barcode || '') + '"></label>' +
      '<label class="field"><span>Stok Awal / Saat Ini</span><input id="fStock" type="number" step="1" value="' + (p.stock || 0) + '"></label></div>' +
      '<div class="grid-form-2">' +
      '<label class="field"><span>Batas Stok Minimum</span><input id="fMin" type="number" step="1" min="0" value="' + (p.minStock || 0) + '"></label>' +
      '<label class="field"><span>Margin (%)</span><input id="fMargin" readonly disabled value="' + (U.toNum(p.price) ? U.nf(U.pct(U.toNum(p.price) - U.toNum(p.cost), U.toNum(p.price)), 1) : '0') + ' %"></label></div>' +
      '<label class="switch-row"><input type="checkbox" id="fTrack"' + (p.trackStock ? ' checked' : '') + '><span>Izinkan pengurangan stok saat penjualan</span></label>' +
      '<label class="switch-row"><input type="checkbox" id="fActive"' + (p.active ? ' checked' : '') + '><span>Produk Aktif (bisa dijual)</span></label>' +
      '<label class="field"><span>Deskripsi / Catatan</span><textarea id="fDesc" rows="2">' + U.esc(p.description || '') + '</textarea></label>';

    U.modal({
      title: isNew ? 'Tambah Produk Baru' : 'Ubah Produk: ' + p.name,
      size: 'wide',
      body: body,
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        {
          label: isNew ? 'Simpan Produk' : 'Simpan Perubahan', cls: 'btn-primary', action: function (close, m) {
            var d = {
              name: U.sanitizeName(U.$('#fName', m.el).value),
              categoryId: U.$('#fCat', m.el).value,
              price: U.toNum(U.$('#fPrice', m.el).value),
              cost: U.toNum(U.$('#fCost', m.el).value),
              unit: U.sanitizeName(U.$('#fUnit', m.el).value) || 'pcs',
              sku: U.sanitizeName(U.$('#fSku', m.el).value),
              barcode: U.sanitizeName(U.$('#fBarcode', m.el).value),
              minStock: Math.max(0, Math.round(U.toNum(U.$('#fMin', m.el).value))),
              trackStock: U.$('#fTrack', m.el).checked,
              active: U.$('#fActive', m.el).checked,
              description: U.sanitizeName(U.$('#fDesc', m.el).value)
            };
            if (!d.name) { U.toast('Nama produk wajib diisi', 'error'); return; }
            if (d.price <= 0) { U.toast('Harga jual harus lebih dari 0', 'error'); return; }
            if (!d.sku) d.sku = 'SKU' + U.pad(DB.data.counters.product + 1);
            var dup = DB.all('products').filter(function (x) { return x.id !== (product && product.id); });
            if (d.barcode && dup.some(function (x) { return String(x.barcode) === d.barcode; })) {
              U.toast('Barcode sudah dipakai produk lain', 'error'); return;
            }

            if (isNew) {
              d.stock = Math.max(0, Math.round(U.toNum(U.$('#fStock', m.el).value)));
              var np = DB.insert('products', d);
              DB.data.counters.product = (DB.data.counters.product || 0) + 1;
              if (d.trackStock && d.stock > 0) {
                DB.data.stockLogs.unshift({
                  id: U.uid('sl'), date: U.nowIso(), productId: np.id, productName: np.name,
                  type: 'in', qty: d.stock, before: 0, after: d.stock, note: 'Stok awal produk baru',
                  ref: 'NEW', userId: APP.currentUser.id, userName: APP.currentUser.name
                });
              }
              DB.log('TAMBAH', 'Produk', np.id, np.name);
              U.toast('Produk "' + np.name + '" ditambahkan', 'success');
            } else {
              var oldStock = product.stock;
              DB.update('products', product.id, d);
              var newStock = Math.max(0, Math.round(U.toNum(U.$('#fStock', m.el).value)));
              if (newStock !== oldStock) {
                DB.adjustStock(product.id, newStock - oldStock, 'adjust', 'Koreksi stok via form produk');
              }
              DB.log('UBAH', 'Produk', product.id, product.name);
              U.toast('Perubahan disimpan', 'success');
            }
            DB.save();
            Catalog.renderPOS();
            if (App.current() === 'products') Catalog.renderProducts();
            if (App.current() === 'categories') Catalog.renderCategories();
            close();
          }
        }
      ]
    });

    /* hitung margin otomatis */
    var pi = U.$('#fPrice'), ci = U.$('#fCost'), mi = U.$('#fMargin');
    var upd = function () {
      var pr = U.toNum(pi.value), cs = U.toNum(ci.value);
      mi.value = pr > 0 ? U.nf(pr > 0 ? U.pct(pr - cs, pr) : 0, 1) + ' %' : '0 %';
    };
    U.on(pi, 'input', upd); U.on(ci, 'input', upd);
  };

  Catalog.productQuickView = function (id) {
    var p = DB.find('products', id);
    if (!p) return;
    var sold = DB.soldQty(p.id);
    U.modal({
      title: 'Detail Produk',
      body:
        '<div class="grid-form-2">' +
        '<div><strong>' + U.esc(p.name) + '</strong><div class="muted">' + U.esc(p.sku) + ' - ' + U.esc(p.barcode || '-') + '</div></div>' +
        '<div class="right"><strong>' + U.money(p.price) + '</strong><div class="muted">Modal ' + U.money(p.cost) + '</div></div></div>' +
        '<hr>' +
        '<div class="grid-form-2">' +
        '<div><span class="muted">Kategori</span><div>' + U.esc(Catalog.catName(p.categoryId)) + '</div></div>' +
        '<div><span class="muted">Satuan</span><div>' + U.esc(p.unit) + '</div></div>' +
        '<div><span class="muted">Stok</span><div>' + U.nf(p.stock) + ' ' + U.esc(p.unit) + '</div></div>' +
        '<div><span class="muted">Terjual</span><div>' + U.nf(sold) + ' ' + U.esc(p.unit) + '</div></div>' +
        '<div><span class="muted">Margin</span><div>' + U.nf(Catalog.margin(p), 1) + '% (' + U.money(p.price - p.cost) + ')</div></div>' +
        '<div><span class="muted">Nilai Stok</span><div>' + U.money(p.stock * p.cost) + '</div></div>' +
        '</div>' + (p.description ? '<hr><div class="muted">Catatan: ' + U.esc(p.description) + '</div>' : ''),
      buttons: [
        { label: 'Tutup', cls: 'btn-ghost' },
        { label: 'Tambah ke Keranjang', cls: 'btn-primary', action: function (c) { Cart.add(p.id); c(); } }
      ]
    });
  };

  Catalog.deleteProduct = function (id) {
    var p = DB.find('products', id);
    if (!p) return;
    U.confirm('Hapus produk <b>' + U.esc(p.name) + '</b>? Riwayat transaksi lama tetap tersimpan.', 'Hapus Produk', true)
      .then(function (ok) {
        if (!ok) return;
        DB.remove('products', id);
        DB.log('HAPUS', 'Produk', id, p.name);
        U.toast('Produk dihapus', 'success');
        Catalog.renderPOS();
        Catalog.renderProducts();
      });
  };

  /* ================= KATEGORI ================= */
  Catalog.categoryForm = function (cat) {
    if (!DB.can('prod.edit')) { U.toast('Hak akses ditolak', 'error'); return; }
    var isNew = !cat;
    var icons = ['🍜', '🥤', '🍪', '🧹', '🧴', '🔌', '✏️', '💊', '🍎', '👕', '🎁', '🧸', '🐱', '🚗', '🏠', '⭐'];
    var c = cat || { name: '', icon: '📦' };
    U.modal({
      title: isNew ? 'Tambah Kategori' : 'Ubah Kategori',
      body:
        '<label class="field"><span>Nama Kategori *</span><input id="cName" data-autofocus value="' + U.esc(c.name) + '"></label>' +
        '<label class="field"><span>Ikon</span><div id="cIcons" style="display:flex;flex-wrap:wrap;gap:6px">' +
        icons.map(function (i) { return '<button class="icon-btn" data-ic="' + i + '" style="font-size:18px;' + (i === c.icon ? 'border:2px solid var(--brand)' : '') + '">' + i + '</button>'; }).join('') +
        '</div><input type="hidden" id="cIcon" value="' + U.esc(c.icon) + '"></label>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        {
          label: 'Simpan', cls: 'btn-primary', action: function (close, m) {
            var name = U.sanitizeName(U.$('#cName', m.el).value);
            if (!name) { U.toast('Nama kategori wajib diisi', 'error'); return; }
            var icon = U.$('#cIcon', m.el).value;
            if (isNew) {
              var nc = DB.insert('categories', { name: name, icon: icon });
              DB.log('TAMBAH', 'Kategori', nc.id, name);
              U.toast('Kategori ditambahkan', 'success');
            } else {
              DB.update('categories', cat.id, { name: name, icon: icon });
              DB.log('UBAH', 'Kategori', cat.id, name);
              U.toast('Kategori diperbarui', 'success');
            }
            Catalog.renderPOS(); Catalog.renderCategories(); Catalog.renderProducts();
            close();
          }
        }
      ]
    });
    U.$$('#cIcons .icon-btn').forEach(function (b) {
      U.on(b, 'click', function () {
        U.$('#cIcon').value = b.getAttribute('data-ic');
        U.$$('#cIcons .icon-btn').forEach(function (x) { x.style.border = ''; });
        b.style.border = '2px solid var(--brand)';
      });
    });
  };

  Catalog.deleteCategory = function (id) {
    var used = DB.all('products').filter(function (p) { return p.categoryId === id; }).length;
    if (used > 0) { U.toast('Kategori masih memiliki ' + used + ' produk. Pindahkan produk terlebih dahulu.', 'error', 4200); return; }
    var c = DB.find('categories', id);
    U.confirm('Hapus kategori <b>' + U.esc(c ? c.name : '') + '</b>?', 'Hapus Kategori', true).then(function (ok) {
      if (!ok) return;
      DB.remove('categories', id);
      DB.log('HAPUS', 'Kategori', id, c.name);
      U.toast('Kategori dihapus', 'success');
      Catalog.renderPOS(); Catalog.renderCategories(); Catalog.renderProducts();
    });
  };

  /* ================= TABEL PRODUK ================= */
  Catalog.renderProducts = function () {
    var tb = U.$('#prodTable tbody');
    if (!tb) return;
    var q = U.$('#prodSearch').value.toLowerCase().trim();
    var cf = U.$('#prodFilterCat').value;
    var sf = U.$('#prodFilterStock').value;

    var cfSel = U.$('#prodFilterCat');
    var cur = cfSel.value;
    cfSel.innerHTML = '<option value="">Semua kategori</option>' + DB.all('categories').map(function (c) {
      return '<option value="' + c.id + '">' + U.esc(c.name) + '</option>';
    }).join('');
    cfSel.value = cur || cf;

    var list = DB.all('products').filter(function (p) {
      if (q && (p.name + ' ' + p.sku + ' ' + (p.barcode || '')).toLowerCase().indexOf(q) < 0) return false;
      if (cf && p.categoryId !== cf) return false;
      if (sf === 'low' && !(p.stock > 0 && p.stock <= (p.minStock || 0))) return false;
      if (sf === 'out' && p.stock > 0) return false;
      return true;
    });

    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="9"><div class="empty-state"><div class="ico">📦</div><b>Belum ada produk</b><span>Tekan "+ Produk Baru" untuk menambahkan</span></div></td></tr>';
    } else {
      tb.innerHTML = list.map(function (p) {
        var st = Catalog.stockTag(p);
        var mg = Catalog.margin(p);
        return '<tr>' +
          '<td class="nowrap"><b>' + U.esc(p.sku) + '</b><br><small class="muted">' + U.esc(p.barcode || '-') + '</small></td>' +
          '<td><b>' + U.esc(p.name) + '</b><br><small class="muted">' + U.esc(p.description || '') + '</small></td>' +
          '<td>' + U.esc(Catalog.catIcon(p.categoryId)) + ' ' + U.esc(Catalog.catName(p.categoryId)) + '</td>' +
          '<td class="right"><b>' + U.money(p.price) + '</b></td>' +
          '<td class="right muted">' + U.money(p.cost) + '</td>' +
          '<td class="right"><span class="tag ' + (mg >= 30 ? 'green' : mg >= 15 ? 'yellow' : 'red') + '">' + U.nf(mg, 1) + '%</span></td>' +
          '<td class="center">' + U.nf(p.stock) + ' ' + U.esc(p.unit) + '</td>' +
          '<td class="center">' + (p.active ? '<span class="tag ' + st.cls + '">' + st.label + '</span>' : '<span class="tag grey">Nonaktif</span>') + '</td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-act="view" data-id="' + p.id + '" title="Detail">👁</button>' +
          '<button class="icon-btn sm" data-act="edit" data-id="' + p.id + '" title="Ubah">✎</button>' +
          '<button class="icon-btn sm" data-act="sell" data-id="' + p.id + '" title="Jual">🛒</button>' +
          '<button class="icon-btn sm danger" data-act="del" data-id="' + p.id + '" title="Hapus">🗑</button>' +
          '</div></td></tr>';
      }).join('');
      U.$$('[data-act]', tb).forEach(function (b) {
        U.on(b, 'click', function () {
          var id = b.getAttribute('data-id'), act = b.getAttribute('data-act');
          if (act === 'view') Catalog.productQuickView(id);
          if (act === 'edit') Catalog.productForm(DB.find('products', id));
          if (act === 'del') Catalog.deleteProduct(id);
          if (act === 'sell') { Cart.add(id); App.go('pos'); }
        });
      });
    }
    var totalVal = list.reduce(function (s, p) { return s + p.stock * (p.cost || 0); }, 0);
    U.$('#prodFoot').innerHTML =
      '<span>Total produk: <b>' + list.length + '</b></span>' +
      '<span>Produk aktif: <b>' + DB.all('products').filter(function (p) { return p.active; }).length + '</b></span>' +
      '<span>Nilai persediaan: <b>' + U.money(totalVal) + '</b></span>' +
      '<span>Stok menipis: <b style="color:var(--warn)">' + DB.lowStock().length + '</b></span>';
  };

  Catalog.renderCategories = function () {
    var tb = U.$('#catTable tbody');
    if (tb) {
      var cats = DB.all('categories');
      tb.innerHTML = cats.length ? cats.map(function (c) {
        var n = DB.all('products').filter(function (p) { return p.categoryId === c.id; }).length;
        return '<tr><td><b>' + (c.icon || '') + ' ' + U.esc(c.name) + '</b></td>' +
          '<td>' + n + ' produk</td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-act="edit" data-id="' + c.id + '">✎</button>' +
          '<button class="icon-btn sm danger" data-act="del" data-id="' + c.id + '">🗑</button>' +
          '</div></td></tr>';
      }).join('') : '<tr><td colspan="3"><div class="empty-state"><div class="ico">🏷️</div><b>Belum ada kategori</b></div></td></tr>';
      U.$$('[data-act]', tb).forEach(function (b) {
        U.on(b, 'click', function () {
          var id = b.getAttribute('data-id');
          if (b.getAttribute('data-act') === 'edit') Catalog.categoryForm(DB.find('categories', id));
          else Catalog.deleteCategory(id);
        });
      });
    }
    var sum = U.$('#storeSummary');
    if (sum) {
      var s = DB.data.settings;
      var today = U.range('today');
      var tx = DB.txInRange(today);
      var omzet = tx.reduce(function (a, t) { return a + t.total; }, 0);
      sum.innerHTML =
        '<div class="grid-form-2">' +
        '<div><span class="muted">Nama Toko</span><div><b>' + U.esc(s.storeName) + '</b></div></div>' +
        '<div><span class="muted">Outlet</span><div>' + U.esc(s.branch) + '</div></div>' +
        '<div><span class="muted">Alamat</span><div>' + U.esc(s.address || '-') + '</div></div>' +
        '<div><span class="muted">Telepon</span><div>' + U.esc(s.phone || '-') + '</div></div>' +
        '<div><span class="muted">NPWP</span><div>' + U.esc(s.npwp || '-') + '</div></div>' +
        '<div><span class="muted">Pajak</span><div>' + (s.taxEnabled ? s.taxRate + '%' + (s.taxInclusive ? ' (termasuk harga)' : ' (ditambah)') : 'Nonaktif') + '</div></div>' +
        '</div><hr>' +
        '<div class="grid-form-2">' +
        '<div><span class="muted">Transaksi hari ini</span><div><b>' + tx.length + '</b></div></div>' +
        '<div><span class="muted">Omzet hari ini</span><div><b style="color:var(--brand)">' + U.money(omzet) + '</b></div></div>' +
        '<div><span class="muted">Total kategori</span><div>' + DB.all('categories').length + '</div></div>' +
        '<div><span class="muted">Total produk</span><div>' + DB.all('products').length + '</div></div>' +
        '</div>';
    }
  };

  /* ================= EVENTS ================= */
  Catalog.init = function () {
    U.on(U.$('#btnAddProduct'), 'click', function () { Catalog.productForm(null); });
    U.on(U.$('#btnAddCategory'), 'click', function () { Catalog.categoryForm(null); });
    ['prodSearch', 'prodFilterCat', 'prodFilterStock'].forEach(function (id) {
      var el = U.$('#' + id);
      if (el) U.on(el, 'input', U.debounce(Catalog.renderProducts, 180));
    });
    U.on(U.$('#prodExport'), 'click', function () {
      U.exportCSV('produk-' + U.today() + '.csv',
        ['SKU', 'Barcode', 'Nama', 'Kategori', 'Harga', 'Modal', 'Margin %', 'Stok', 'Satuan', 'Min Stok', 'Aktif'],
        DB.all('products').map(function (p) {
          return [p.sku, p.barcode, p.name, Catalog.catName(p.categoryId), p.price, p.cost, Catalog.margin(p), p.stock, p.unit, p.minStock, p.active ? 'Ya' : 'Tidak'];
        }));
    });
    U.on(U.$('#posSearch'), 'input', U.debounce(function () {
      state.q = this.value;
      U.$('#posSearchClear').classList.toggle('hidden', !this.value);
      Catalog.renderPOS();
    }, 160));
    U.on(U.$('#posSearchClear'), 'click', function () {
      U.$('#posSearch').value = ''; state.q = '';
      U.$('#posSearchClear').classList.add('hidden');
      Catalog.renderPOS(); U.$('#posSearch').focus();
    });
    U.on(U.$('#posSort'), 'change', function () { state.sort = this.value; Catalog.renderPOS(); });
    U.$$('.vt-btn').forEach(function (b) {
      U.on(b, 'click', function () {
        U.$$('.vt-btn').forEach(function (x) { x.classList.remove('active'); });
        b.classList.add('active');
        state.grid = b.getAttribute('data-grid');
        Catalog.renderPOS();
      });
    });
  };

  Catalog._state = state;
  global.Catalog = Catalog;
})(window);