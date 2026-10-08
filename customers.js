/* =====================================================================
   KasirPro - customers.js
   Pelanggan, supplier, serta piutang / utang pelanggan
   ===================================================================== */
(function (global) {
  'use strict';

  var Customers = {};
  var DebtUI = {};

  /* ======================= PELANGGAN ======================= */
  Customers.render = function () {
    var tb = U.$('#custTable tbody');
    if (!tb) return;
    var q = (U.$('#custSearch').value || '').toLowerCase().trim();
    var list = DB.all('customers').filter(function (c) {
      if (!q) return true;
      return (c.name + ' ' + c.code + ' ' + (c.phone || '') + ' ' + (c.email || '')).toLowerCase().indexOf(q) >= 0;
    });

    var stats = {};
    DB.all('transactions').forEach(function (t) {
      if (!t.customerId || t.status === 'void') return;
      if (!stats[t.customerId]) stats[t.customerId] = { n: 0, total: 0, last: null };
      stats[t.customerId].n += 1;
      stats[t.customerId].total += t.total;
      if (!stats[t.customerId].last || t.date > stats[t.customerId].last) stats[t.customerId].last = t.date;
    });

    if (!list.length) {
      tb.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="ico">' + String.fromCharCode(128101) + '</div><b>Belum ada pelanggan</b><span>Tambahkan pelanggan untuk menyimpan riwayat belanja & piutang</span></div></td></tr>';
    } else {
      tb.innerHTML = list.map(function (c) {
        var s = stats[c.id] || { n: 0, total: 0, last: null };
        var debt = DB.customerBalance(c.id);
        return '<tr>' +
          '<td><span class="tag blue">' + U.esc(c.code) + '</span></td>' +
          '<td><b>' + U.esc(c.name) + '</b>' + (c.note ? '<br><small class="muted">' + U.esc(c.note) + '</small>' : '') + '</td>' +
          '<td class="nowrap">' + U.esc(c.phone || '-') + (c.email ? '<br><small class="muted">' + U.esc(c.email) + '</small>' : '') + '</td>' +
          '<td class="center">' + s.n + (s.last ? '<br><small class="muted">' + U.since(s.last) + '</small>' : '') + '</td>' +
          '<td class="right">' + U.money(s.total) + '</td>' +
          '<td class="right">' + (debt > 0 ? '<b style="color:var(--danger)">' + U.money(debt) + '</b>' : '<span class="muted">-</span>') + '</td>' +
          '<td><div class="row-actions">' +
          '<button class="icon-btn sm" data-act="hist" data-id="' + c.id + '" title="Riwayat belanja">' + String.fromCharCode(128339) + '</button>' +
          '<button class="icon-btn sm" data-act="edit" data-id="' + c.id + '" title="Ubah">' + String.fromCharCode(9998) + '</button>' +
          '<button class="icon-btn sm danger" data-act="del" data-id="' + c.id + '" title="Hapus">' + String.fromCharCode(128465) + '</button>' +
          '</div></td></tr>';
      }).join('');
      U.$$('[data-act]', tb).forEach(function (b) {
        U.on(b, 'click', function () {
          var id = b.getAttribute('data-id'), act = b.getAttribute('data-act');
          if (act === 'edit') Customers.form(DB.find('customers', id));
          if (act === 'del') Customers.remove(id);
          if (act === 'hist') Customers.history(id);
        });
      });
    }
    U.$('#custFoot').innerHTML =
      '<span>Total pelanggan: <b>' + DB.all('customers').length + '</b></span>' +
      '<span>Pelanggan aktif: <b>' + Object.keys(stats).length + '</b></span>' +
      '<span>Total piutang: <b style="color:var(--danger)">' + U.money(DB.totalDebt()) + '</b></span>';
  };

  Customers.form = function (c) {
    if (!DB.can('cust.edit')) { U.toast('Hak akses ubah pelanggan tidak tersedia', 'error'); return; }
    var isNew = !c;
    if (c) c = JSON.parse(JSON.stringify(c));
    else c = { name: '', phone: '', email: '', address: '', note: '', creditLimit: 500000 };

    U.modal({
      title: isNew ? 'Tambah Pelanggan' : 'Ubah Pelanggan',
      size: 'wide',
      body:
        '<div class="grid-form-2">' +
        '<label class="field"><span>Nama Pelanggan *</span><input id="cuName" data-autofocus value="' + U.esc(c.name) + '"></label>' +
        '<label class="field"><span>No. Telepon</span><input id="cuPhone" inputmode="tel" value="' + U.esc(c.phone || '') + '"></label></div>' +
        '<div class="grid-form-2">' +
        '<label class="field"><span>Email</span><input id="cuMail" value="' + U.esc(c.email || '') + '"></label>' +
        '<label class="field"><span>Alamat</span><input id="cuAddr" value="' + U.esc(c.address || '') + '"></label></div>' +
        '<div class="grid-form-2">' +
        '<label class="field"><span>Catatan</span><input id="cuNote" value="' + U.esc(c.note || '') + '" placeholder="mis. pelanggan member"></label>' +
        '<label class="field"><span>Limit Piutang (Rp)</span><input id="cuLimit" type="number" min="0" step="10000" value="' + (c.creditLimit || 0) + '"></label></div>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        {
          label: 'Simpan', cls: 'btn-primary', action: function (close, m) {
            var name = U.sanitizeName(U.$('#cuName', m.el).value);
            if (!name) { U.toast('Nama pelanggan wajib diisi', 'error'); return; }
            var patch = {
              name: name, phone: U.wa(U.$('#cuPhone', m.el).value), email: U.sanitizeName(U.$('#cuMail', m.el).value),
              address: U.sanitizeName(U.$('#cuAddr', m.el).value), note: U.sanitizeName(U.$('#cuNote', m.el).value),
              creditLimit: U.toNum(U.$('#cuLimit', m.el).value)
            };
            if (isNew) {
              patch.code = DB.nextCode('customer', 'PLB', 4);
              var nc = DB.insert('customers', patch);
              DB.log('TAMBAH', 'Pelanggan', nc.id, nc.name);
              U.toast('Pelanggan ditambahkan', 'success');
              Cart.setCustomer(nc.id);
            } else {
              DB.update('customers', c.id, patch);
              DB.log('UBAH', 'Pelanggan', c.id, name);
              U.toast('Data pelanggan diperbarui', 'success');
            }
            DB.save();
            close();
            Customers.render(); DebtUI.render();
          }
        }
      ]
    });
  };

  Customers.remove = function (id) {
    var c = DB.find('customers', id);
    if (!c) return;
    var used = DB.all('transactions').filter(function (t) { return t.customerId === id; }).length;
    if (used > 0) {
      U.toast('Pelanggan memiliki ' + used + ' transaksi sehingga tidak bisa dihapus. Nonaktifkan saja.', 'error', 4200);
      return;
    }
    U.confirm('Hapus pelanggan <b>' + U.esc(c.name) + '</b>?', 'Hapus Pelanggan', true).then(function (ok) {
      if (!ok) return;
      DB.remove('customers', id);
      DB.log('HAPUS', 'Pelanggan', id, c.name);
      U.toast('Pelanggan dihapus', 'success');
      Customers.render(); DebtUI.render();
    });
  };

  Customers.history = function (id) {
    var c = DB.find('customers', id);
    var list = DB.all('transactions').filter(function (t) { return t.customerId === id; }).reverse();
    var pays = DB.all('debtPayments').filter(function (p) { return p.customerId === id; });
    var debt = DB.customerBalance(id);
    U.modal({
      title: 'Riwayat Belanja: ' + (c ? c.name : ''),
      size: 'xwide',
      body:
        '<div class="kpi-row" style="margin-bottom:12px">' +
        '<div class="kpi"><div class="k-label">Total Transaksi</div><div class="k-value">' + list.length + '</div></div>' +
        '<div class="kpi green"><div class="k-label">Total Belanja</div><div class="k-value">' + U.money(list.reduce(function (s, t) { return s + (t.status === 'void' ? 0 : t.total); }, 0)) + '</div></div>' +
        '<div class="kpi ' + (debt > 0 ? 'red' : 'green') + '"><div class="k-label">Sisa Piutang</div><div class="k-value">' + U.money(debt) + '</div></div>' +
        '</div>' +
        '<h4 style="font-size:12px;color:var(--text-3);margin:8px 0 6px;text-transform:uppercase">Transaksi</h4>' +
        (list.length ? '<table class="table sm"><thead><tr><th>No</th><th>Tanggal</th><th class="center">Item</th><th class="right">Total</th><th class="center">Status</th></tr></thead><tbody>' +
          list.map(function (t) {
            return '<tr><td>' + U.esc(t.no) + '</td><td>' + U.fmtDateTime(t.date) + '</td><td class="center">' + t.itemCount + '</td>' +
              '<td class="right">' + U.money(t.total) + '</td><td class="center"><span class="tag ' + Transactions.statusTag(t.status).cls + '">' +
              Transactions.statusLabel(t.status) + '</span></td></tr>';
          }).join('') + '</tbody></table>' : '<p class="muted">Belum ada transaksi.</p>') +
        '<h4 style="font-size:12px;color:var(--text-3);margin:14px 0 6px;text-transform:uppercase">Pembayaran Piutang</h4>' +
        (pays.length ? '<table class="table sm"><thead><tr><th>Tanggal</th><th class="right">Jumlah</th><th>Catatan</th><th>Oleh</th></tr></thead><tbody>' +
          pays.map(function (p) {
            return '<tr><td>' + U.fmtDateTime(p.date) + '</td><td class="right">' + U.money(p.amount) + '</td><td>' + U.esc(p.note || '-') + '</td><td>' + U.esc(p.userName || '-') + '</td></tr>';
          }).join('') + '</tbody></table>' : '<p class="muted">Belum ada pembayaran piutang.</p>'),
      buttons: [
        { label: 'Tutup', cls: 'btn-ghost' },
        { label: 'Pilih di Kasir', cls: 'btn-primary', action: function (c2) { Cart.setCustomer(id); c2(); App.go('pos'); } }
      ]
    });
  };

  /* ======================= SUPPLIER ======================= */
  Customers.renderSuppliers = function () {
    var tb = U.$('#supTable tbody');
    if (!tb) return;
    var q = (U.$('#supSearch').value || '').toLowerCase().trim();
    var list = DB.all('suppliers').filter(function (s) {
      if (!q) return true;
      return (s.name + ' ' + s.code + ' ' + (s.phone || '')).toLowerCase().indexOf(q) >= 0;
    });
    tb.innerHTML = list.length ? list.map(function (s) {
      return '<tr><td><span class="tag purple">' + U.esc(s.code) + '</span></td>' +
        '<td><b>' + U.esc(s.name) + '</b>' + (s.email ? '<br><small class="muted">' + U.esc(s.email) + '</small>' : '') + '</td>' +
        '<td class="nowrap">' + U.esc(s.phone || '-') + '</td>' +
        '<td>' + U.esc(s.address || '-') + '</td>' +
        '<td><div class="row-actions">' +
        '<button class="icon-btn sm" data-act="edit" data-id="' + s.id + '">' + String.fromCharCode(9998) + '</button>' +
        '<button class="icon-btn sm danger" data-act="del" data-id="' + s.id + '">' + String.fromCharCode(128465) + '</button>' +
        '</div></td></tr>';
    }).join('') : '<tr><td colspan="5"><div class="empty-state"><div class="ico">' + String.fromCharCode(128666) + '</div><b>Belum ada supplier</b></div></td></tr>';

    U.$$('[data-act]', tb).forEach(function (b) {
      U.on(b, 'click', function () {
        var id = b.getAttribute('data-id');
        if (b.getAttribute('data-act') === 'edit') Customers.supplierForm(DB.find('suppliers', id));
        else U.confirm('Hapus supplier ini?').then(function (ok) { if (ok) { DB.remove('suppliers', id); DB.flush(); Customers.renderSuppliers(); } });
      });
    });
  };

  Customers.supplierForm = function (s) {
    var isNew = !s;
    if (s) s = JSON.parse(JSON.stringify(s));
    else s = { name: '', phone: '', email: '', address: '', note: '' };
    U.modal({
      title: isNew ? 'Tambah Supplier' : 'Ubah Supplier',
      body:
        '<div class="grid-form-2">' +
        '<label class="field"><span>Nama Supplier *</span><input id="spName" data-autofocus value="' + U.esc(s.name) + '"></label>' +
        '<label class="field"><span>Telepon</span><input id="spPhone" value="' + U.esc(s.phone || '') + '"></label></div>' +
        '<label class="field"><span>Email</span><input id="spMail" value="' + U.esc(s.email || '') + '"></label>' +
        '<label class="field"><span>Alamat</span><textarea id="spAddr" rows="2">' + U.esc(s.address || '') + '</textarea></label>' +
        '<label class="field"><span>Catatan</span><input id="spNote" value="' + U.esc(s.note || '') + '"></label>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        {
          label: 'Simpan', cls: 'btn-primary', action: function (close, m) {
            var name = U.sanitizeName(U.$('#spName', m.el).value);
            if (!name) { U.toast('Nama supplier wajib diisi', 'error'); return; }
            var patch = {
              name: name, phone: U.wa(U.$('#spPhone', m.el).value), email: U.sanitizeName(U.$('#spMail', m.el).value),
              address: U.sanitizeName(U.$('#spAddr', m.el).value), note: U.sanitizeName(U.$('#spNote', m.el).value)
            };
            if (isNew) {
              patch.code = DB.nextCode('supplier', 'SUP', 4);
              DB.insert('suppliers', patch);
              U.toast('Supplier ditambahkan', 'success');
            } else { DB.update('suppliers', s.id, patch); U.toast('Supplier diperbarui', 'success'); }
            DB.save(); close(); Customers.renderSuppliers();
          }
        }
      ]
    });
  };

  /* ======================= PIUTANG / UTANG ======================= */
  DebtUI.render = function () {
    var tb = U.$('#debtTable tbody');
    if (!tb) return;
    var q = (U.$('#debtSearch').value || '').toLowerCase().trim();

    var rows = DB.all('customers').map(function (c) {
      var info = DB.customerDebtInfo(c.id);
      return {
        c: c, total: info.total, down: info.down,
        paid: U.round2(info.down + info.paid),
        sisa: DB.customerBalance(c.id), last: info.last, n: info.n
      };
    }).filter(function (r) { return r.total > 0 || r.paid > 0; });

    rows = rows.filter(function (r) {
      if (!q) return true;
      return (r.c.name + ' ' + r.c.code + ' ' + (r.c.phone || '')).toLowerCase().indexOf(q) >= 0;
    });
    rows.sort(function (a, b) { return b.sisa - a.sisa; });

    var totalSisa = U.round2(rows.reduce(function (s, r) { return s + r.sisa; }, 0));
    var overdue = rows.filter(function (r) {
      return r.sisa > 0 && r.last && (Date.now() - new Date(r.last).getTime()) > 30 * 864e5;
    });

    var kpi = U.$('#debtKpi');
    if (kpi) {
      kpi.innerHTML =
        '<div class="kpi red"><div class="k-label">' + String.fromCharCode(128179) + ' Total Piutang</div><div class="k-value">' + U.money(totalSisa) + '</div><div class="k-sub">dari ' + rows.filter(function (r) { return r.sisa > 0; }).length + ' pelanggan</div></div>' +
        '<div class="kpi green"><div class="k-label">' + String.fromCharCode(128176) + ' Sudah Dibayar</div><div class="k-value">' + U.money(rows.reduce(function (s, r) { return s + r.paid; }, 0)) + '</div></div>' +
        '<div class="kpi yellow"><div class="k-label">' + String.fromCharCode(9200) + ' Lebih 30 Hari</div><div class="k-value">' + overdue.length + '</div><div class="k-sub">' + U.money(overdue.reduce(function (s, r) { return s + r.sisa; }, 0)) + '</div></div>' +
        '<div class="kpi"><div class="k-label">' + String.fromCharCode(128101) + ' Total Pelanggan Berutang</div><div class="k-value">' + rows.filter(function (r) { return r.sisa > 0; }).length + '</div></div>';
    }

    if (!rows.length) {
      tb.innerHTML = '<tr><td colspan="7"><div class="empty-state"><div class="ico">' + String.fromCharCode(128181) + '</div><b>Tidak ada piutang</b><span>Semua transaksi sudah lunas</span></div></td></tr>';
    } else {
      tb.innerHTML = rows.map(function (r) {
        var cls = r.sisa > 0 ? (r.last && (Date.now() - new Date(r.last).getTime()) > 30 * 864e5 ? 'red' : 'yellow') : 'green';
        var lbl = r.sisa > 0 ? (r.last && (Date.now() - new Date(r.last).getTime()) > 30 * 864e5 ? 'Jatuh Tempo' : 'Belum Lunas') : 'Lunas';
        return '<tr>' +
          '<td><b>' + U.esc(r.c.name) + '</b><br><small class="muted">' + U.esc(r.c.code) + '</small></td>' +
          '<td class="nowrap">' + U.esc(r.c.phone || '-') + '</td>' +
          '<td class="right">' + U.money(r.total) + '</td>' +
          '<td class="right" style="color:var(--success)">' + U.money(r.paid) + '</td>' +
          '<td class="right"><b style="color:' + (r.sisa > 0 ? 'var(--danger)' : 'inherit') + '">' + U.money(r.sisa) + '</b></td>' +
          '<td class="center"><span class="tag ' + cls + '">' + lbl + '</span></td>' +
          '<td><div class="row-actions">' +
          (r.sisa > 0 ? '<button class="icon-btn sm" data-act="pay" data-id="' + r.c.id + '" title="Terima pembayaran">' + String.fromCharCode(128176) + '</button>' : '') +
          '<button class="icon-btn sm" data-act="hist" data-id="' + r.c.id + '" title="Detail">' + String.fromCharCode(128269) + '</button>' +
          '</div></td></tr>';
      }).join('');
      U.$$('[data-act]', tb).forEach(function (b) {
        U.on(b, 'click', function () {
          var id = b.getAttribute('data-id');
          if (b.getAttribute('data-act') === 'pay') DebtUI.payDialog(id);
          else Customers.history(id);
        });
      });
    }
    U.$('#debtFoot').innerHTML =
      '<span>Totalpiutang: <b style="color:var(--danger)">' + U.money(totalSisa) + '</b></span>' +
      '<span>Sudah dilunasi: <b>' + rows.filter(function (r) { return r.sisa <= 0; }).length + '</b></span>' +
      '<span>Belum lunas: <b>' + rows.filter(function (r) { return r.sisa > 0; }).length + '</b></span>';

    /* riwayat pembayaran */
    var ptb = U.$('#debtPayTable tbody');
    if (ptb) {
      var pays = DB.all('debtPayments').slice(0, 200);
      ptb.innerHTML = pays.length ? pays.map(function (p) {
        return '<tr><td class="nowrap">' + U.fmtDateTime(p.date) + '</td><td>' + U.esc(p.customerName || '-') + '</td>' +
          '<td class="right"><b style="color:var(--success)">' + U.money(p.amount) + '</b></td>' +
          '<td>' + U.esc(p.note || '-') + '</td><td>' + U.esc(p.userName || '-') + '</td></tr>';
      }).join('') : '<tr><td colspan="5"><div class="empty-state"><div class="ico">&#128181;</div><b>Belum ada pembayaran piutang</b></div></td></tr>';
    }
  };

  DebtUI.payDialog = function (customerId) {
    if (!DB.can('debt.pay')) { U.toast('Hak akses pembayaran piutang tidak tersedia', 'error'); return; }
    var c = DB.find('customers', customerId);
    var sisa = DB.customerBalance(customerId);
    if (sisa <= 0) { U.toast('Pelanggan ini tidak memiliki piutang', 'info'); return; }
    U.modal({
      title: 'Terima Pembayaran Piutang',
      body:
        '<div class="grid-form-2">' +
        '<div><span class="muted">Pelanggan</span><div><b>' + U.esc(c.name) + '</b></div></div>' +
        '<div class="right"><span class="muted">Sisa Utang</span><div><b style="color:var(--danger)">' + U.money(sisa) + '</b></div></div></div><hr>' +
        '<label class="field"><span>Jumlah Pembayaran (Rp)</span><input id="dpAmt" data-autofocus type="number" min="0" max="' + sisa + '" step="1000" value="' + sisa + '"></label>' +
        '<label class="field"><span>Catatan</span><input id="dpNote" placeholder="mis. cicilan ke-2"></label>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        {
          label: 'Simpan Pembayaran', cls: 'btn-primary', action: function (close, m) {
            var amt = U.round2(U.toNum(U.$('#dpAmt', m.el).value));
            if (amt <= 0) { U.toast('Jumlah pembayaran harus lebih dari 0', 'error'); return; }
            if (amt > sisa) { U.toast('Pembayaran melebihi sisa utang (' + U.money(sisa) + ')', 'error'); return; }
            DB.data.debtPayments.unshift({
              id: U.uid('dp'), date: U.nowIso(), customerId: customerId, customerName: c.name,
              amount: amt, note: U.sanitizeName(U.$('#dpNote', m.el).value) || 'Pembayaran piutang',
              userId: APP.currentUser.id, userName: APP.currentUser.name
            });
            DB.log('PELUNASAN', 'Piutang', customerId, c.name + ' - ' + U.money(amt));
            DB.flush();
            U.toast('Pembayaran ' + U.money(amt) + ' tercatat', 'success');
            if (DB.setting('sound')) U.beep('cash');
            close();
            DebtUI.render(); App.refreshBadges();
          }
        }
      ]
    });
  };

  /* ======================= EVENTS ======================= */
  Customers.init = function () {
    U.on(U.$('#custSearch'), 'input', U.debounce(Customers.render, 180));
    U.on(U.$('#debtSearch'), 'input', U.debounce(DebtUI.render, 180));
    U.on(U.$('#btnAddCustomer'), 'click', function () { Customers.form(null); });
    U.on(U.$('#custExport'), 'click', function () {
      U.exportCSV('pelanggan-' + U.today() + '.csv',
        ['Kode', 'Nama', 'Telepon', 'Email', 'Alamat', 'Catatan', 'Limit Piutang', 'Sisa Piutang'],
        DB.all('customers').map(function (c) {
          return [c.code, c.name, c.phone, c.email, c.address, c.note, c.creditLimit, DB.customerBalance(c.id)];
        }));
    });
    U.on(U.$('#btnAddSupplier'), 'click', function () { Customers.supplierForm(null); });
    U.on(U.$('#supSearch'), 'input', U.debounce(Customers.renderSuppliers, 180));
    U.on(U.$('#debtExport'), 'click', function () {
      U.exportCSV('piutang-' + U.today() + '.csv',
        ['Kode', 'Pelanggan', 'Telepon', 'Total Kredit', 'Sudah Dibayar', 'Sisa Piutang', 'Jml Transaksi'],
        DB.all('customers').map(function (c) {
          var info = DB.customerDebtInfo(c.id);
          return [c.code, c.name, c.phone, info.total,
            U.round2(info.down + info.paid), DB.customerBalance(c.id), info.n];
        }).filter(function (r) { return r[3] > 0 || r[4] > 0; }));
    });
  };

  global.Customers = Customers;
  global.DebtUI = DebtUI;
})(window);