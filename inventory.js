/* =====================================================================
   KasirPro - inventory.js
   Stok & gudang: barang masuk, penyesuaian, stock opname,
   riwayat pergerakan stok
   ===================================================================== */
(function (global) {
  'use strict';

  var Inventory = {};
  var filter = { q: '', mode: '' };

  /* ======================= DAFTAR STOK ======================= */
  Inventory.render = function () {
    var tb = U.$('#invTable tbody');
    if (!tb) return;
    var q = (filter.q || U.$('#invSearch').value || '').toLowerCase().trim();
    filter.mode = U.$('#invFilterStock').value;

    var list = DB.all('products').filter(function (p) {
      if (q && (p.name + ' ' + p.sku + ' ' + (p.barcode || '')).toLowerCase().indexOf(q) < 0) return false;
      if (filter.mode === 'low' && !(p.stock > 0 && p.stock <= (p.minStock || 0))) return false;
      if (filter.mode === 'out' && p.stock > 0) return false;
      if (filter.mode === 'in' && p.stock <= 0) return false;
      return true;
    });

    var kpi = U.$('#invKpi');
    if (kpi) {
      var totalVal = DB.all('products').reduce(function (s, p) { return s + p.stock * (p.cost || 0); }, 0);
      var totalRetail = DB.all('products').reduce(function (s, p) { return s + p.stock * (p.price || 0); }, 0);
      var low = DB.lowStock();
      var out = DB.all('products').filter(function (p) { return p.trackStock && p.stock <= 0; });
      kpi.innerHTML =
        '<div class="kpi"><div class="k-label">&#128230; Jenis Produk</div><div class="k-value">' + DB.all('products').length + '</div><div class="k-sub">' + DB.all('products').filter(function (p) { return p.active; }).length + ' aktif</div><span class="k-ico">' + String.fromCharCode(128230) + '</span></div>' +
        '<div class="kpi green"><div class="k-label">&#128176; Nilai Persediaan (Modal)</div><div class="k-value">' + U.short(totalVal) + '</div><div class="k-sub">Potensi jual ' + U.short(totalRetail) + '</div><span class="k-ico">' + String.fromCharCode(128176) + '</span></div>' +
        '<div class="kpi yellow"><div class="k-label">&#9888; Stok Menipis</div><div class="k-value">' + low.length + '</div><div class="k-sub">Perlu segera restock</div><span class="k-ico">' + String.fromCharCode(9888) + '</span></div>' +
        '<div class="kpi red"><div class="k-label">&#10060; Stok Habis</div><div class="k-value">' + out.length + '</div><div class="k-sub">Tidak bisa terjual</div><span class="k-ico">' + String.fromCharCode(128683) + '</span></div>' +
        '<div class="kpi purple"><div class="k-label">' + String.fromCharCode(128339) + ' Pergerakan Bulan Ini</div><div class="k-value">' +
        DB.all('stockLogs').filter(function (l) { return U.dateStr(new Date(l.date)) >= U.dateStr(U.addDays(new Date(), -30)); }).length +
        '</div><div class="k-sub">30 hari terakhir</div></div>';
    }

    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="8"><div class="empty-state"><div class="ico">' + String.fromCharCode(128230) + '</div><b>Tidak ada data</b><span>Ubah filter pencarian</span></div></td></tr>';
    } else {
      tb.innerHTML = list.map(function (p) {
        var low = p.stock <= 0;
        var mid = p.stock > 0 && p.stock <= (p.minStock || 0);
        var cls = low ? 'red' : mid ? 'yellow' : 'green';
        var lbl = low ? 'Habis' : mid ? 'Menipis' : 'Aman';
        var pctBar = p.minStock ? Math.min(100, Math.round(p.stock / (p.minStock * 3) * 100)) : 100;
        return '<tr>' +
          '<td><b>' + U.esc(p.name) + '</b><br><small class="muted">' + U.esc(p.sku) + '</small></td>' +
          '<td>' + U.esc(Catalog.catIcon(p.categoryId)) + ' ' + U.esc(Catalog.catName(p.categoryId)) + '</td>' +
          '<td class="right">' + U.money(p.price) + '</td>' +
          '<td class="center"><b>' + U.nf(p.stock) + '</b> ' + U.esc(p.unit) +
          '<div class="progress-bar" style="margin-top:4px;width:70px;margin-left:auto"><span style="width:' + pctBar + '%;background:' + (low ? 'var(--danger)' : mid ? 'var(--warn)' : 'var(--success)') + '"></span></div></td>' +
          '<td class="center muted">' + U.nf(p.minStock || 0) + '</td>' +
          '<td class="right">' + U.money(p.stock * (p.cost || 0)) + '</td>' +
          '<td class="center"><span class="tag ' + cls + '">' + lbl + '</span></td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-act="in" data-id="' + p.id + '" title="Barang masuk">&#11015;</button>' +
          '<button class="icon-btn sm" data-act="out" data-id="' + p.id + '" title="Koreksi stok">&#9998;</button>' +
          '<button class="icon-btn sm danger" data-act="zero" data-id="' + p.id + '" title="Set stok nol">&#128465;</button>' +
          '</div></td></tr>';
      }).join('');
      U.$$('[data-act]', tb).forEach(function (b) {
        U.on(b, 'click', function () {
          var id = b.getAttribute('data-id'), act = b.getAttribute('data-act');
          var p = DB.find('products', id);
          if (act === 'in') Inventory.stockInDialog([p]);
          if (act === 'out') Inventory.adjustDialog(p);
          if (act === 'zero') Inventory.zeroDialog(p);
        });
      });
    }

    U.$('#invFoot').innerHTML =
      '<span>Menampilkan <b>' + list.length + '</b> produk</span>' +
      '<span>Total unit: <b>' + U.nf(list.reduce(function (s, p) { return s + p.stock; }, 0)) + '</b></span>' +
      '<span>Nilai: <b>' + U.money(list.reduce(function (s, p) { return s + p.stock * (p.cost || 0); }, 0)) + '</b></span>';
  };

  /* ======================= BARANG MASUK (multi produk) ======================= */
  Inventory.stockInDialog = function (preset) {
    if (!DB.can('inv.edit')) { U.toast('Hak akses ubah stok tidak tersedia', 'error'); return; }
    var rows = [];
    var pid = preset && preset[0] ? preset[0].id : '';
    rows.push({ pid: pid, qty: 1, price: preset && preset[0] ? preset[0].cost : 0, note: '' });

    function rowHtml(r, i) {
      var opts = DB.all('products').map(function (p) {
        return '<option value="' + p.id + '"' + (p.id === r.pid ? ' selected' : '') + '>' + U.esc(p.name) + ' (stok ' + p.stock + ' ' + U.esc(p.unit) + ')</option>';
      }).join('');
      return '<tr data-row="' + i + '">' +
        '<td><select class="mini-select" data-f="pid" style="min-width:180px">' + opts + '</select></td>' +
        '<td><input class="mini-input" data-f="qty" type="number" min="1" value="' + r.qty + '" style="width:80px;text-align:center"></td>' +
        '<td><input class="mini-input" data-f="price" type="number" min="0" step="100" value="' + r.price + '" style="width:110px;text-align:right"></td>' +
        '<td><input class="mini-input" data-f="note" value="' + U.esc(r.note) + '" placeholder="catatan"></td>' +
        '<td class="center"><button class="icon-btn sm danger" data-del="' + i + '">&times;</button></td>' +
        '</tr>';
    }
    function rebuild() {
      U.$('#stkRows').innerHTML = rows.map(rowHtml).join('');
      U.$$('#stkRows [data-f]').forEach(function (el) {
        U.on(el, 'change', function () {
          var i = Number(el.closest('tr').getAttribute('data-row'));
          var f = el.getAttribute('data-f');
          var v = (f === 'pid') ? el.value : el.value;
          rows[i][f] = (f === 'pid') ? v : (f === 'note' ? v : U.toNum(v));
          if (f === 'pid') { var p = DB.find('products', v); rows[i].price = p ? p.cost : 0; rebuild(); }
        });
      });
      U.$$('[data-del]').forEach(function (b) {
        U.on(b, 'click', function () {
          var i = Number(b.getAttribute('data-del'));
          rows.splice(i, 1); if (!rows.length) rows.push({ pid: '', qty: 1, price: 0, note: '' });
          rebuild();
        });
      });
    }

    U.modal({
      title: 'Barang Masuk / Restock',
      size: 'xwide',
      body:
        '<p class="muted">Gunakan untuk pembelian dari supplier, penambahan stok awal, atau pengembalian barang.</p>' +
        '<table class="table sm"><thead><tr><th>Produk</th><th class="center">Jumlah Masuk</th><th>Harga Modal Baru</th><th>Catatan</th><th></th></tr></thead>' +
        '<tbody id="stkRows"></tbody></table>' +
        '<div style="margin-top:10px"><button class="btn btn-ghost" id="stkAddRow">+ Tambah Baris</button></div>' +
        '<hr><div id="stkSummary"></div>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        {
          label: '&#128229; Simpan Barang Masuk', cls: 'btn-primary', action: function (close) {
            var ok = 0;
            rows.forEach(function (r) {
              var p = DB.find('products', r.pid);
              if (!p || r.qty <= 0) return;
              DB.adjustStock(p.id, Math.round(r.qty), 'in', r.note || 'Barang masuk', 'IN');
              if (r.price > 0 && r.price !== p.cost) {
                DB.update('products', p.id, { cost: Math.round(r.price) });
              }
              ok++;
            });
            if (!ok) { U.toast('Tidak ada barang masuk yang diproses', 'error'); return; }
            DB.log('BARANG MASUK', 'Stok', '', ok + ' produk bertambah');
            DB.flush();
            U.toast(ok + ' produk berhasil ditambahkan', 'success');
            close();
            Inventory.render(); Catalog.renderPOS(); App.refreshBadges();
          }
        }
      ]
    });
    rebuild();
    U.on(U.$('#stkAddRow'), 'click', function () {
      rows.push({ pid: '', qty: 1, price: 0, note: '' }); rebuild();
    });
  };

  /* ======================= KOREKSI STOK ======================= */
  Inventory.adjustDialog = function (p) {
    if (!DB.can('inv.edit')) { U.toast('Hak akses ubah stok tidak tersedia', 'error'); return; }
    if (!p) return;
    U.modal({
      title: 'Koreksi Stok: ' + p.name,
      body:
        '<div class="grid-form-2">' +
        '<div><span class="muted">Stok saat ini</span><div><b>' + U.nf(p.stock) + ' ' + U.esc(p.unit) + '</b></div></div>' +
        '<div><span class="muted">Batas minimum</span><div>' + U.nf(p.minStock || 0) + '</div></div></div><hr>' +
        '<label class="field"><span>Jenis Penyesuaian</span><select id="adjT">' +
        '<option value="plus">Tambah stok (+)</option>' +
        '<option value="minus">Kurangi stok (-)</option>' +
        '<option value="set">Tetapkan jumlah absolut</option>' +
        '</select></label>' +
        '<label class="field"><span>Jumlah</span><input id="adjQ" data-autofocus type="number" min="0" step="1" value="1"></label>' +
        '<label class="field"><span>Alasan</span><select id="adjR">' +
        ['Barang rusak', 'Barang hilang', 'Kadaluarsa', 'Koreksi input', 'Retur pelanggan', 'Sample / breakage', 'Lainnya']
          .map(function (x) { return '<option>' + x + '</option>'; }).join('') + '</select></label>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        {
          label: 'Terapkan', cls: 'btn-primary', action: function (c, m) {
            var t = U.$('#adjT', m.el).value;
            var q = Math.round(U.toNum(U.$('#adjQ', m.el).value));
            var reason = U.$('#adjR', m.el).value;
            var delta = t === 'plus' ? q : t === 'minus' ? -q : q - p.stock;
            if (delta === 0) { U.toast('Tidak ada perubahan stok', 'warn'); return; }
            if (p.stock + delta < 0) { U.toast('Stok tidak boleh menjadi minus', 'error'); return; }
            DB.adjustStock(p.id, delta, t === 'plus' ? 'in' : (t === 'minus' ? 'out' : 'adjust'), reason, 'ADJ');
            DB.log('KOREOPSI STOK', 'Produk', p.id, p.name + ' ' + (delta > 0 ? '+' : '') + delta + ' (' + reason + ')');
            DB.flush();
            U.toast('Stok diperbarui menjadi ' + (p.stock + delta), 'success');
            c();
            Inventory.render(); Catalog.renderPOS(); App.refreshBadges();
          }
        }
      ]
    });
  };

  Inventory.zeroDialog = function (p) {
    if (!DB.can('inv.edit')) { U.toast('Hak akses ubah stok tidak tersedia', 'error'); return; }
    U.confirm('Setel stok <b>' + U.esc(p.name) + '</b> menjadi 0 (habis)?', 'Setel Stok Nol', true).then(function (ok) {
      if (!ok) return;
      DB.adjustStock(p.id, -p.stock, 'out', 'Setel stok nol', 'ADJ');
      DB.log('STOK NOL', 'Produk', p.id, p.name);
      DB.flush();
      U.toast('Stok ' + p.name + ' disetel menjadi 0', 'success');
      Inventory.render(); Catalog.renderPOS(); App.refreshBadges();
    });
  };

  /* ======================= STOCK OPNAME ======================= */
  Inventory.opnameDialog = function () {
    if (!DB.can('inv.edit')) { U.toast('Hak akses stock opname tidak tersedia', 'error'); return; }
    var items = DB.all('products').filter(function (p) { return p.active; });
    U.modal({
      title: 'Stock Opname (Hitung Fisik)',
      size: 'xwide',
      body:
        '<p class="muted">Masukkan jumlah fisik hasil hitungan di gudang. Selisih akan otomatis dicatat sebagai penyesuaian stok.</p>' +
        '<table class="table sm"><thead><tr><th>Produk</th><th class="center">Stok Sistem</th><th class="center">Stok Fisik</th><th class="center">Selisih</th><th class="center">Nilai Selisih</th></tr></thead><tbody>' +
        items.map(function (p, i) {
          return '<tr data-op="' + i + '"><td>' + U.esc(p.name) + '<br><small class="muted">' + U.esc(p.sku) + '</small></td>' +
            '<td class="center"><span class="op-sys">' + p.stock + '</span></td>' +
            '<td class="center"><input class="mini-input" type="number" min="0" step="1" data-opi="' + i + '" style="width:80px;text-align:center"></td>' +
            '<td class="center op-diff">-</td><td class="center op-val">-</td></tr>';
        }).join('') + '</tbody></table>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        {
          label: '&#9874; Simpan Hasil Opname', cls: 'btn-primary', action: function (close, m) {
            var n = 0, gain = 0, loss = 0;
            U.$$('[data-opi]', m.el).forEach(function (inp) {
              if (inp.value === '') return;
              var i = Number(inp.getAttribute('data-opi'));
              var p = items[i];
              var phys = Math.max(0, Math.round(U.toNum(inp.value)));
              var delta = phys - p.stock;
              if (delta === 0) return;
              DB.adjustStock(p.id, delta, 'opname', 'Stock opname fisik', 'OPNAME');
              n++;
              if (delta > 0) gain += delta * (p.cost || 0); else loss += Math.abs(delta) * (p.cost || 0);
            });
            if (!n) { U.toast('Tidak ada selisih ditemukan', 'info'); return; }
            DB.log('OPNAME', 'Stok', '', n + ' produk disesuaikan (selisih ' + U.money(loss - gain) + ')');
            DB.flush();
            U.toast(n + ' produk disesuaikan. Selisih nilai: ' + U.money(loss - gain), 'success', 4200);
            close();
            Inventory.render(); Catalog.renderPOS(); App.refreshBadges();
          }
        }
      ]
    });
    U.$$('[data-opi]').forEach(function (inp) {
      U.on(inp, 'input', function () {
        var tr = inp.closest('tr');
        var sys = Number(U.$('.op-sys', tr).textContent);
        var d = inp.value === '' ? 0 : Math.max(0, Math.round(U.toNum(inp.value))) - sys;
        var p = items[Number(inp.getAttribute('data-opi'))];
        U.$('.op-diff', tr).textContent = d > 0 ? '+' + d : d;
        U.$('.op-val', tr).textContent = U.money(d * (p.cost || 0));
        U.$('.op-diff', tr).style.color = d === 0 ? 'var(--text-3)' : d > 0 ? 'var(--success)' : 'var(--danger)';
      });
    });
  };

  /* ======================= RIWAYAT STOK ======================= */
  Inventory.historyDialog = function () {
    var rows = DB.all('stockLogs').slice(0, 400);
    var typeLabel = { in: 'Barang Masuk', out: 'Barang Keluar', adjust: 'Penyesuaian', sale: 'Penjualan', void: 'Pembatalan', return: 'Retur', opname: 'Opname' };
    var typeCls = { in: 'green', out: 'red', adjust: 'yellow', sale: 'blue', void: 'grey', return: 'purple', opname: 'purple' };
    U.modal({
      title: 'Riwayat pergerakan stok',
      size: 'xwide',
      body:
        '<div class="search-box sm" style="margin-bottom:10px"><span>&#128269;</span><input id="stkHistSearch" placeholder="Cari produk / catatan..."></div>' +
        '<table class="table sm"><thead><tr><th>Waktu</th><th>Produk</th><th class="center">Jenis</th>' +
        '<th class="center">Qty</th><th class="center">Sebelum</th><th class="center">Sesudah</th><th>Catatan</th><th>Oleh</th></tr></thead>' +
        '<tbody id="stkHistBody">' + rows.map(function (l) {
          return '<tr><td class="nowrap">' + U.fmtDateTime(l.date) + '</td><td>' + U.esc(l.productName || '-') + '</td>' +
            '<td class="center"><span class="tag ' + (typeCls[l.type] || 'grey') + '">' + (typeLabel[l.type] || l.type) + '</span></td>' +
            '<td class="center" style="color:' + (l.qty >= 0 ? 'var(--success)' : 'var(--danger)') + ';font-weight:700">' + (l.qty >= 0 ? '+' : '') + l.qty + '</td>' +
            '<td class="center muted">' + l.before + '</td><td class="center">' + l.after + '</td>' +
            '<td class="muted">' + U.esc(l.note || '-') + '</td><td class="muted">' + U.esc(l.userName || '-') + '</td></tr>';
        }).join('') + '</tbody></table>',
      buttons: [
        {
          label: '&#11015; Ekspor Riwayat', cls: 'btn-ghost', action: function () {
            U.exportCSV('riwayat-stok-' + U.today() + '.csv',
              ['Waktu', 'Produk', 'Jenis', 'Qty', 'Sebelum', 'Sesudah', 'Catatan', 'Oleh'],
              rows.map(function (l) { return [U.fmtDateTime(l.date), l.productName, typeLabel[l.type] || l.type, l.qty, l.before, l.after, l.note, l.userName]; }));
          }
        },
        { label: 'Tutup', cls: 'btn-ghost' }
      ]
    });
    U.on(U.$('#stkHistSearch'), 'input', U.debounce(function () {
      var q = this.value.toLowerCase();
      U.$$('#stkHistBody tr').forEach(function (tr) {
        tr.style.display = tr.textContent.toLowerCase().indexOf(q) >= 0 ? '' : 'none';
      });
    }, 140));
  };

  /* ======================= EVENTS ======================= */
  Inventory.init = function () {
    U.on(U.$('#invSearch'), 'input', U.debounce(function () { filter.q = this.value; Inventory.render(); }, 180));
    U.on(U.$('#invFilterStock'), 'change', Inventory.render);
    U.on(U.$('#btnStockIn'), 'click', function () { Inventory.stockInDialog(); });
    U.on(U.$('#btnStockOpname'), 'click', Inventory.opnameDialog);
    U.on(U.$('#btnStockHistory'), 'click', Inventory.historyDialog);
  };

  global.Inventory = Inventory;
})(window);