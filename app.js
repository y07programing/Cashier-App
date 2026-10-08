/* =====================================================================
   KasirPro - app.js
   Bootstrap, navigasi, pintasan keyboard, pemindai barcode, jam
   ===================================================================== */
(function (global) {
  'use strict';

  var App = {};
  App.currentUser = null;
  var current = 'pos';

  var VIEW_META = {
    pos: { title: 'Kasir / Point of Sale', sub: 'Pilih produk atau pindai barcode untuk memulai transaksi', perm: 'pos.sell' },
    transactions: { title: 'Riwayat Transaksi', sub: 'Cari, cetak ulang, batalkan, atau proses retur', perm: 'tx.view' },
    products: { title: 'Manajemen Produk', sub: 'Kelola produk, harga, barcode, dan stok', perm: 'prod.view' },
    categories: { title: 'Kategori Produk', sub: 'Kelompokkan produk agar pencarian lebih cepat', perm: 'prod.view' },
    customers: { title: 'Data Pelanggan', sub: 'Kelola identitas & riwayat belanja pelanggan', perm: 'cust.view' },
    suppliers: { title: 'Data Supplier', sub: 'Informasi pemasok barang', perm: 'prod.view' },
    inventory: { title: 'Stok & Gudang', sub: 'Barang masuk, koreksi stok, dan stock opname', perm: 'inv.view' },
    debts: { title: 'Piutang / Utang Pelanggan', sub: 'Pantau dan terima pembayaran utang', perm: 'debt.pay' },
    shift: { title: 'Shift & Kas', sub: 'Kelola shift kasir dan laporan Z', perm: 'shift.manage' },
    reports: { title: 'Laporan Penjualan', sub: 'Analisis omzet, produk terlaris, dan kasir', perm: 'report.view' },
    profit: { title: 'Laporan Laba Rugi', sub: 'Estimasi laba dari harga jual dan harga modal', perm: 'report.view' },
    audit: { title: 'Log Aktivitas', sub: 'Jejak audit seluruh aktivitas pengguna', perm: 'audit.view' },
    users: { title: 'Pengguna & Peran', sub: 'Akun kasir dan hak akses', perm: 'user.manage' },
    settings: { title: 'Pengaturan', sub: 'Profil toko, pajak, struk, dan pencadangan data', perm: 'setting.manage' }
  };

  var RENDERERS = {
    pos: function () { Catalog.renderPOS(); Cart.render(); },
    transactions: Transactions.render,
    products: Catalog.renderProducts,
    categories: Catalog.renderCategories,
    customers: Customers.render,
    suppliers: Customers.renderSuppliers,
    inventory: Inventory.render,
    debts: DebtUI.render,
    shift: ShiftUI.render,
    reports: Reports.render,
    profit: Reports.renderProfit,
    audit: Reports.renderAudit,
    users: Users.render,
    settings: function () { Settings.bind(); }
  };

  App.current = function () { return current; };

  App.go = function (view) {
    var meta = VIEW_META[view];
    if (!meta) return;
    if (meta.perm && !DB.can(meta.perm)) {
      U.toast('Anda tidak memiliki hak akses untuk menu ini', 'error', 3200);
      return;
    }
    /* simpan posisi input pencarian */
    current = view;
    U.$$('.nav-item').forEach(function (n) {
      n.classList.toggle('active', n.getAttribute('data-view') === view);
    });
    U.$$('.view').forEach(function (v) {
      v.classList.toggle('hidden', v.id !== 'view-' + view);
    });
    U.$('#viewTitle').textContent = meta.title;
    U.$('#viewSubtitle').textContent = meta.sub;
    U.$('#sidebar').classList.remove('open');
    U.$('#viewHost').scrollTop = 0;
    if (RENDERERS[view]) {
      try { RENDERERS[view](); } catch (e) { console.error(e); }
    }
    if (view === 'pos') setTimeout(function () { U.$('#posSearch').focus(); }, 60);
  };

  /* ======================= BADGE & JAM ======================= */
  App.refreshBadges = function () {
    var low = DB.lowStock().length;
    var debtCount = DB.all('customers').filter(function (c) { return DB.customerBalance(c.id) > 0; }).length;
    var sb = U.$('#badgeStock');
    if (sb) { sb.textContent = low > 0 ? low : ''; }
    var db = U.$('#badgeDebt');
    if (db) { db.textContent = debtCount > 0 ? debtCount : ''; }
  };

  function tickClock() {
    var d = new Date();
    U.$('#clockTime').textContent = U.pad(d.getHours()) + ':' + U.pad(d.getMinutes());
    U.$('#clockDate').textContent = U.dayName(d.toISOString()) + ', ' + U.fmtDate(d.toISOString());
  }

  /* ======================= PINTASAN KEYBOARD ======================= */
  function isTyping(el) {
    if (!el) return false;
    var t = el.tagName;
    return t === 'INPUT' || t === 'TEXTAREA' || t === 'SELECT' || el.isContentEditable;
  }

  App.initKeys = function () {
    document.addEventListener('keydown', function (e) {
      if (!App.currentUser) return;

      /* Enter pada kotak pencarian = tambah produk */
      if (e.key === 'Enter' && document.activeElement === U.$('#posSearch')) {
        e.preventDefault();
        var code = U.$('#posSearch').value.trim();
        if (!code) return;
        if (!Cart.addByBarcode(code)) {
          /* coba cari nama persis / sebagian unik */
          var list = Catalog.filtered().filter(function (p) {
            return p.name.toLowerCase() === code.toLowerCase();
          });
          if (list.length === 1) Cart.add(list[0].id);
          else if (list.length > 1) U.toast('Nama ambigu, pilih dari daftar produk', 'warn');
          else U.toast('Produk "' + code + '" tidak ditemukan', 'error');
        }
        U.$('#posSearch').value = '';
        U.$('#posSearchClear').classList.add('hidden');
        Catalog._state.q = '';
        Catalog.renderPOS();
        return;
      }

      /* Ctrl+D -> diskon */
      if ((e.ctrlKey || e.metaKey) && (e.key === 'd' || e.key === 'D')) {
        if (current === 'pos') { e.preventDefault(); Cart.discountDialog(); }
        return;
      }

      switch (e.key) {
        case 'F1': case 'F2':
          if (current === 'pos') { e.preventDefault(); U.$('#posSearch').focus(); U.$('#posSearch').select(); }
          break;
        case 'F4':
          if (current === 'pos') { e.preventDefault(); Cart.hold(); }
          break;
        case 'F6':
          if (current === 'pos') { e.preventDefault(); Cart.pickCustomer(); }
          break;
        case 'F8':
          if (current === 'pos' && !Cart.isEmpty()) { e.preventDefault(); Checkout.open('full'); }
          break;
        case 'F12':
          e.preventDefault();
          if (current === 'reports') Reports.printReport(U.$('#rptRange').value);
          else if (current === 'profit') Reports.printProfit();
          else if (current === 'shift' && Shift.active()) ShiftUI.printZ(Shift.active(), null);
          else U.printCurrent();
          break;
        case 'Delete':
          if (current === 'pos' && !isTyping(e.target) &&
            U.$('#modalHost').classList.contains('hidden') && !Cart.isEmpty()) {
            Cart.clear();
          }
          break;
        default: break;
      }
    });
  };

  /* ======================= START ======================= */
  App.start = function () {
    App.go('pos');
    App.refreshBadges();
    Shift.refresh();
    tickClock();
    if (DB.setting('minStockAlert')) {
      var low = DB.lowStock();
      if (low.length) {
        setTimeout(function () {
          U.toast(low.length + ' produk stoknya menipis / habis. Cek menu Stok & Gudang.', 'warn', 5000);
        }, 1200);
      }
    }
  };

  /* ======================= BOOT ======================= */
  App.boot = function () {
    DB.load();
    U.CUR = DB.data.settings.currency || 'Rp';
    document.body.setAttribute('data-theme', DB.data.settings.theme || 'light');
    U.$('#btnTheme').textContent = (DB.data.settings.theme === 'dark') ? '☀' : '☽';

    Auth.init();
    Catalog.init();
    Cart.init();
    Transactions.init();
    Inventory.init();
    Customers.init();
    Reports.init();
    Users.init();
    Settings.init();
    App.initKeys();

    /* navigasi */
    U.$$('.nav-item').forEach(function (n) {
      U.on(n, 'click', function () { App.go(n.getAttribute('data-view')); });
    });
    U.on(U.$('#btnCloseSidebar'), 'click', function () { U.$('#sidebar').classList.remove('open'); });
    U.on(U.$('#btnOpenSidebar'), 'click', function () { U.$('#sidebar').classList.toggle('open'); });

    /* indikator pemindai barcode aktif saat kode diketik sangat cepat */
    var lastKey = 0;
    document.addEventListener('keydown', function (e) {
      var now = Date.now();
      if (now - lastKey < 45 && e.key.length === 1) {
        U.$('#barcodeIndicator').classList.add('show');
      }
      lastKey = now;
      clearTimeout(App._barcodeTimer);
      App._barcodeTimer = setTimeout(function () {
        U.$('#barcodeIndicator').classList.remove('show');
      }, 900);
    });

    /* jam */
    tickClock();
    setInterval(tickClock, 15000);

    /* cegah keluar saat keranjang berisi transaksi belum dibayar */
    global.addEventListener('beforeunload', function (e) {
      if (Cart.dirty && !Cart.isEmpty()) {
        e.preventDefault();
        e.returnValue = 'Keranjang masih berisi transaksi yang belum dibayar.';
        return e.returnValue;
      }
    });

    /* coba lanjutkan sesi */
    var u = Auth.restore();
    setTimeout(function () {
      U.$('#bootScreen').style.display = 'none';
      if (u) {
        APP.currentUser = u;
        Auth.saveSession(u);
        Auth.onLogin();
      } else {
        U.$('#loginScreen').classList.remove('hidden');
        setTimeout(function () { U.$('#loginUsername').focus(); }, 120);
      }
    }, 550);
  };

  /* Objek APP global agar modul lain bisa mengakses user & fungsi app */
  var APP = App;
  App.currentUser = null;
  App._state = { get current() { return current; } };

  global.App = App;
  global.APP = APP;

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', App.boot);
  else App.boot();
})(window);