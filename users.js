/* =====================================================================
   KasirPro - users.js
   Manajemen pengguna, peran, dan matriks hak akses
   ===================================================================== */
(function (global) {
  'use strict';

  var Users = {};
  var ROLE_DESC = {
    admin: 'Akses penuh: master data, pengaturan, pembatalan, laporan, pengguna.',
    kasir: 'Penjualan, cetak struk, data pelanggan, pembayaran piutang, buka/tutup shift.',
    kasir_senior: 'Semua kasir + koreksi produk, ubah stok, dan retur/refund.'
  };

  Users.render = function () {
    var tb = U.$('#userTable tbody');
    if (!tb) return;
    var list = DB.all('users');
    tb.innerHTML = list.map(function (u) {
      return '<tr>' +
        '<td><div style="display:flex;align-items:center;gap:8px"><span class="avatar" style="width:30px;height:30px;font-size:12px">' + U.esc(U.initials(u.name)) + '</span><b>' + U.esc(u.name) + '</b></div></td>' +
        '<td>' + U.esc(u.username) + '</td>' +
        '<td><span class="tag ' + (u.role === 'admin' ? 'purple' : u.role === 'kasir_senior' ? 'blue' : 'grey') + '">' + Auth.roleLabel(u.role) + '</span></td>' +
        '<td class="center"><span class="tag ' + (u.active ? 'green' : 'red') + '">' + (u.active ? 'Aktif' : 'Nonaktif') + '</span></td>' +
        '<td class="nowrap muted">' + U.fmtDate(u.createdAt) + '</td>' +
        '<td><div class="row-actions">' +
        '<button class="icon-btn sm" data-act="edit" data-id="' + u.id + '">' + String.fromCharCode(9998) + '</button>' +
        '<button class="icon-btn sm" data-act="pin" data-id="' + u.id + '">' + String.fromCharCode(128273) + '</button>' +
        (u.id !== APP.currentUser.id ? '<button class="icon-btn sm danger" data-act="del" data-id="' + u.id + '">' + String.fromCharCode(128465) + '</button>' : '') +
        '</div></td></tr>';
    }).join('');

    U.$$('[data-act]', tb).forEach(function (b) {
      U.on(b, 'click', function () {
        var id = b.getAttribute('data-id'), act = b.getAttribute('data-act');
        if (act === 'edit') Users.form(DB.find('users', id));
        if (act === 'pin') Users.changePin(id);
        if (act === 'del') Users.remove(id);
      });
    });

    /* matriks hak akses */
    var pt = U.$('#permTable');
    if (pt) {
      var roles = ['admin', 'kasir_senior', 'kasir'];
      pt.innerHTML = '<thead><tr><th>Modul</th>' +
        roles.map(function (r) { return '<th class="center">' + Auth.roleLabel(r) + '</th>'; }).join('') +
        '</tr></thead><tbody>' +
        DB.PERMS.map(function (p) {
          return '<tr><td>' + p.label + '</td>' + roles.map(function (r) {
            var has = DB.ROLE_PERMS[r] === '*' || DB.ROLE_PERMS[r].indexOf(p.key) >= 0;
            return '<td class="center">' + (has ? '<span class="tag green">&#10003;</span>' : '<span class="tag grey">-</span>') + '</td>';
          }).join('') + '</tr>';
        }).join('') +
        '</tbody>';
    }
  };

  Users.form = function (u) {
    if (!DB.can('user.manage')) { U.toast('Hak akses pengguna tidak tersedia', 'error'); return; }
    var isNew = !u;
    if (u) u = JSON.parse(JSON.stringify(u));
    else u = { name: '', username: '', role: 'kasir', active: true, pin: '' };

    U.modal({
      title: isNew ? 'Tambah Pengguna' : 'Ubah Pengguna: ' + u.name,
      body:
        '<div class="grid-form-2">' +
        '<label class="field"><span>Nama Lengkap *</span><input id="usName" data-autofocus value="' + U.esc(u.name) + '"></label>' +
        '<label class="field"><span>Username *</span><input id="usUser" value="' + U.esc(u.username) + '" style="text-transform:lowercase"></label></div>' +
        '<div class="grid-form-2">' +
        '<label class="field"><span>PIN / Password ' + (isNew ? '*' : '') + '</span><input id="usPin" type="text" inputmode="numeric" maxlength="12" value="' + U.esc(u.pin || '') + '"></label>' +
        '<label class="field"><span>Peran</span><select id="usRole">' +
        Object.keys(ROLE_DESC).map(function (r) {
          return '<option value="' + r + '"' + (r === u.role ? ' selected' : '') + '>' + Auth.roleLabel(r) + '</option>';
        }).join('') + '</select></label></div>' +
        '<div class="muted" id="roleDesc">' + ROLE_DESC[u.role] + '</div>' +
        '<label class="switch-row"><input type="checkbox" id="usActive"' + (u.active ? ' checked' : '') + '><span>Akun aktif (dapat login)</span></label>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        {
          label: 'Simpan', cls: 'btn-primary', action: function (close, m) {
            var name = U.sanitizeName(U.$('#usName', m.el).value);
            var username = String(U.$('#usUser', m.el).value || '').toLowerCase().trim();
            var pin = U.$('#usPin', m.el).value.trim();
            if (!name) { U.toast('Nama wajib diisi', 'error'); return; }
            if (!username) { U.toast('Username wajib diisi', 'error'); return; }
            if (isNew && pin.length < 4) { U.toast('PIN minimal 4 karakter', 'error'); return; }
            var dup = DB.all('users').filter(function (x) { return x.id !== (u.id); })
              .some(function (x) { return x.username.toLowerCase() === username; });
            if (dup) { U.toast('Username sudah dipakai', 'error'); return; }

            var patch = { name: name, username: username, role: U.$('#usRole', m.el).value, active: U.$('#usActive', m.el).checked };
            if (pin) patch.pin = pin;
            if (isNew) {
              patch.pin = pin;
              DB.insert('users', patch);
              DB.log('TAMBAH', 'Pengguna', name, name + ' sebagai ' + Auth.roleLabel(patch.role));
              U.toast('Pengguna ditambahkan', 'success');
            } else {
              DB.update('users', u.id, patch);
              DB.log('UBAH', 'Pengguna', u.id, name + ' peran ' + Auth.roleLabel(patch.role));
              U.toast('Pengguna diperbarui', 'success');
            }
            DB.save(); close(); Users.render();
          }
        }
      ]
    });
    U.on(U.$('#usRole'), 'change', function () {
      U.$('#roleDesc').textContent = ROLE_DESC[this.value];
    });
  };

  Users.changePin = function (id) {
    if (!DB.can('user.manage') && APP.currentUser.id !== id) {
      U.toast('Hanya administrator yang dapat mengubah PIN orang lain', 'error'); return;
    }
    var u = DB.find('users', id);
    U.modal({
      title: 'Ubah PIN: ' + u.name,
      body: '<label class="field"><span>PIN Baru</span><input id="np1" data-autofocus type="text" maxlength="12" inputmode="numeric"></label>' +
        '<label class="field"><span>Konfirmasi PIN</span><input id="np2" type="text" maxlength="12" inputmode="numeric"></label>',
      buttons: [
        { label: 'Batal', cls: 'btn-ghost' },
        {
          label: 'Simpan', cls: 'btn-primary', action: function (close, m) {
            var a = U.$('#np1', m.el).value.trim(), b = U.$('#np2', m.el).value.trim();
            if (a.length < 4) { U.toast('PIN minimal 4 karakter', 'error'); return; }
            if (a !== b) { U.toast('PIN tidak cocok', 'error'); return; }
            DB.update('users', id, { pin: a });
            DB.log('UBAH PIN', 'Pengguna', id, u.name);
            DB.flush();
            U.toast('PIN diperbarui', 'success');
            close();
          }
        }
      ]
    });
  };

  Users.remove = function (id) {
    var u = DB.find('users', id);
    if (!u) return;
    if (u.role === 'admin' && DB.all('users').filter(function (x) { return x.role === 'admin' && x.active; }).length <= 1) {
      U.toast('Minimal harus ada satu administrator aktif', 'error', 4200);
      return;
    }
    U.confirm('Hapus pengguna <b>' + U.esc(u.name) + '</b>? Riwayat transaksi tetap tersimpan.', 'Hapus Pengguna', true).then(function (ok) {
      if (!ok) return;
      DB.remove('users', id);
      DB.log('HAPUS', 'Pengguna', id, u.name);
      DB.flush();
      U.toast('Pengguna dihapus', 'success');
      Users.render();
    });
  };

  Users.init = function () {
    U.on(U.$('#btnAddUser'), 'click', function () { Users.form(null); });
  };

  global.Users = Users;
})(window);