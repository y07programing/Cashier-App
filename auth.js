/* =====================================================================
   KasirPro - auth.js
   Login, sesi, hak akses, menu pengguna
   ===================================================================== */
(function (global) {
  'use strict';

  var Auth = {};
  var SESSION_KEY = 'kasirpro_session';

  /* ---------- Simpan / muat sesi ---------- */
  Auth.saveSession = function (user) {
    try { sessionStorage.setItem(SESSION_KEY, JSON.stringify({ id: user.id, at: Date.now() })); } catch (e) { }
  };
  Auth.restore = function () {
    try {
      var s = JSON.parse(sessionStorage.getItem(SESSION_KEY) || 'null');
      if (!s || !s.id) return null;
      var u = DB.find('users', s.id);
      if (!u || !u.active) return null;
      return u;
    } catch (e) { return null; }
  };
  Auth.clearSession = function () {
    try { sessionStorage.removeItem(SESSION_KEY); } catch (e) { }
  };

  /* ---------- Login ---------- */
  Auth.init = function () {
    var f = U.$('#loginForm');
    U.on(f, 'submit', function (e) {
      e.preventDefault();
      Auth.attempt(U.$('#loginUsername').value.trim(), U.$('#loginPin').value.trim());
    });
    U.on(U.$('#togglePin'), 'click', function () {
      var i = U.$('#loginPin');
      i.type = i.type === 'password' ? 'text' : 'password';
    });

    /* menu pengguna */
    U.on(U.$('#btnUserMenu'), 'click', function (e) {
      e.stopPropagation();
      U.$('#userDropdown').classList.toggle('open');
    });
    document.addEventListener('click', function () { U.$('#userDropdown').classList.remove('open'); });
    U.$$('#userDropdown a').forEach(function (a) {
      U.on(a, 'click', function () {
        var act = a.getAttribute('data-action');
        U.$('#userDropdown').classList.remove('open');
        if (act === 'logout') Auth.logout();
        if (act === 'open-shift') { Auth.go('shift'); ShiftUI.openDialog(); }
        if (act === 'print-day') Reports.printReport('today');
        if (act === 'shortcuts') Auth.showShortcuts();
      });
    });

    /* Appearance */
    U.on(U.$('#btnTheme'), 'click', function () {
      var cur = document.body.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
      document.body.setAttribute('data-theme', cur);
      U.$('#btnTheme').textContent = cur === 'dark' ? '☀' : '🌙';
      DB.setSettings({ theme: cur });
    });
    U.on(U.$('#btnFullscreen'), 'click', function () {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen && document.documentElement.requestFullscreen();
    });
  };

  Auth.attempt = function (username, pin) {
    var err = U.$('#loginError');
    var user = null;
    DB.data.users.forEach(function (u) {
      if (u.username.toLowerCase() === username.toLowerCase()) user = u;
    });
    if (!user) { err.textContent = 'Pengguna tidak ditemukan.'; U.beep('error'); return false; }
    if (!user.active) { err.textContent = 'Akun dinonaktifkan. Hubungi administrator.'; U.beep('error'); return false; }
    if (String(user.pin) !== String(pin)) { err.textContent = 'PIN salah. Coba lagi.'; U.beep('error'); return false; }

    err.textContent = '';
    APP.currentUser = user;
    Auth.saveSession(user);
    DB.log('LOGIN', 'User', user.id, user.name + ' masuk ke aplikasi');
    Auth.onLogin();
    return true;
  };

  Auth.onLogin = function () {
    U.$('#loginScreen').classList.add('hidden');
    U.$('#appShell').classList.remove('hidden');

    var u = APP.currentUser;
    U.$('#userName').textContent = u.name;
    U.$('#userRole').textContent = Auth.roleLabel(u.role);
    U.$('#userAvatar').textContent = U.initials(u.name);
    U.$('#loginStoreName').textContent = DB.setting('storeName') + ' - ' + DB.setting('branch');
    U.$('#sideStoreName').textContent = DB.setting('storeName');

    /* sembunyikan menu sesuai hak akses */
    var restricted = {
      users: 'user.manage', settings: 'setting.manage', audit: 'audit.view',
      inventory: 'inv.view', products: 'prod.view', reports: 'report.view',
      profit: 'report.view', customers: 'cust.view', debts: 'debt.pay',
      transactions: 'tx.view', categories: 'prod.view', shift: 'shift.manage'
    };
    U.$$('.nav-item').forEach(function (n) {
      var v = n.getAttribute('data-view');
      var need = restricted[v];
      n.classList.toggle('hidden', !!(need && !DB.can(need)));
    });

    /* terkait shift */
    Shift.refresh();
    if (Shift.active() && Shift.active().cashierId !== u.id) {
      U.toast('Shift sedang dibuka oleh ' + Shift.active().cashierName, 'warn', 4000);
    }
    U.toast('Selamat datang, ' + u.name + '!', 'success');
    App.start();
  };

  Auth.logout = function () {
    U.confirm('Keluar dari aplikasi? Transaksi yang belum disimpan akan hilang.', 'Keluar', true)
      .then(function (ok) {
        if (!ok) return;
        DB.log('LOGOUT', 'User', APP.currentUser.id, APP.currentUser.name + ' keluar');
        Auth.clearSession();
        APP.currentUser = null;
        U.closeModal();
        U.$('#appShell').classList.add('hidden');
        U.$('#loginScreen').classList.remove('hidden');
        U.$('#loginPin').value = '';
        U.$('#loginUsername').focus();
        Cart.clear();
      });
  };

  Auth.roleLabel = function (r) {
    return { admin: 'Administrator', kasir: 'Kasir', kasir_senior: 'Kasir Senior' }[r] || r;
  };

  Auth.go = function (view) { App.go(view); };

  Auth.showShortcuts = function () {
    var rows = [
      ['F1', 'Buka pencarian produk'],
      ['F2', 'Fokus pencarian / barcode'],
      ['F4', 'Simpan transaksi sementara'],
      ['F6', 'Pilih pelanggan'],
      ['F8', 'Buka pembayaran'],
      ['F9', 'Tahan (pause) input'],
      ['F12', 'Cetak halaman / laporan'],
      ['Delete', 'Kosongkan keranjang'],
      ['Ctrl + D', 'Fokus ke diskon'],
      ['Esc', 'Tutup dialog'],
      ['Enter', 'Tambah produk yang diketik di kotak pencarian']
    ];
    U.modal({
      title: 'Pintasan Keyboard',
      size: 'wide',
      body: '<table class="table sm"><tbody>' + rows.map(function (r) {
        return '<tr><td style="width:110px"><kbd>' + r[0] + '</kbd></td><td>' + r[1] + '</td></tr>';
      }).join('') + '</tbody></table>',
      buttons: [{ label: 'Tutup', cls: 'btn-ghost' }]
    });
  };

  global.Auth = Auth;
})(window);