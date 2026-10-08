/* =====================================================================
   KasirPro - db.js
   Penyimpanan data (localStorage), skema, seed data, audit log
   ===================================================================== */
(function (global) {
  'use strict';

  var DB = {};
  var KEY = 'kasirpro_db_v1';
  DB.VERSION = 1;
  DB.data = null;

  /* ======================= HAK AKSES ======================= */
  DB.PERMS = [
    { key: 'pos.sell', label: 'Melakukan transaksi penjualan' },
    { key: 'pos.discount', label: 'Memberi diskon transaksi' },
    { key: 'pos.void', label: 'Membatalkan (void) transaksi' },
    { key: 'pos.hold', label: 'Simpan / buka transaksi sementara' },
    { key: 'tx.view', label: 'Melihat riwayat transaksi' },
    { key: 'tx.reprint', label: 'Mencetak ulang struk' },
    { key: 'tx.refund', label: 'Melakukan retur / refund' },
    { key: 'prod.view', label: 'Melihat daftar produk' },
    { key: 'prod.edit', label: 'Mengubah master produk & kategori' },
    { key: 'inv.view', label: 'Melihat laporan stok' },
    { key: 'inv.edit', label: 'Mengubah stok / barang masuk' },
    { key: 'cust.view', label: 'Melihat data pelanggan' },
    { key: 'cust.edit', label: 'Mengubah data pelanggan' },
    { key: 'debt.pay', label: 'Menerima pembayaran utang' },
    { key: 'shift.manage', label: 'Membuka / menutup shift' },
    { key: 'report.view', label: 'Melihat laporan penjualan' },
    { key: 'user.manage', label: 'Mengelola pengguna' },
    { key: 'setting.manage', label: 'Mengubah pengaturan & data' },
    { key: 'audit.view', label: 'Melihat log aktivitas' }
  ];
  DB.ROLE_PERMS = {
    admin: '*',
    kasir: [
      'pos.sell', 'pos.discount', 'pos.hold', 'tx.view', 'tx.reprint',
      'prod.view', 'inv.view', 'cust.view', 'cust.edit', 'debt.pay',
      'shift.manage', 'report.view'
    ],
    kasir_senior: [
      'pos.sell', 'pos.discount', 'pos.void', 'pos.hold', 'tx.view', 'tx.reprint',
      'tx.refund', 'prod.view', 'prod.edit', 'inv.view', 'inv.edit',
      'cust.view', 'cust.edit', 'debt.pay', 'shift.manage', 'report.view'
    ]
  };
  DB.can = function (perm) {
    var u = global.APP && global.APP.currentUser;
    if (!u) return false;
    var p = DB.ROLE_PERMS[u.role];
    if (!p) return false;
    return p === '*' || p.indexOf(perm) >= 0;
  };

  /* ======================= DEFAULT PENGATURAN ======================= */
  DB.defaultSettings = function () {
    return {
      storeName: 'Toko Berkah Jaya',
      branch: 'Outlet Utama',
      address: 'Jl. Raya.no. 123, Jakarta',
      phone: '0812-3456-7890',
      email: 'tokoberkah@example.com',
      npwp: '09.876.543.2-901.000',
      currency: 'Rp',
      receiptSize: '80',
      footer: 'Terima kasih sudah berbelanja!',
      showBarcode: true,
      taxEnabled: true,
      taxRate: 11,
      taxInclusive: false,
      serviceFeeEnabled: false,
      serviceFeeType: 'percent',
      serviceFeeValue: 0,
      autoPrint: true,
      sound: true,
      lockAfterVoid: false,
      minStockAlert: true,
      theme: 'light',
      roundingStep: 100,
      receiptNote: '',
      allowNegativeStock: false
    };
  };

  /* ======================= STRUKTUR KOSONG ======================= */
  DB.empty = function () {
    return {
      version: DB.VERSION,
      createdAt: new Date().toISOString(),
      settings: DB.defaultSettings(),
      users: [], categories: [], products: [], customers: [], suppliers: [],
      transactions: [], shifts: [], stockLogs: [], debtPayments: [], auditLogs: [],
      holds: [], counters: { tx: 0, product: 0, customer: 0, supplier: 0, shift: 0 }
    };
  };

  /* ======================= LOAD / SAVE ======================= */
  DB.load = function () {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (e) { }
    if (!raw) { DB.data = DB.buildSeed(); DB.save(); return DB.data; }
    try {
      var d = JSON.parse(raw);
      DB.data = DB.migrate(d);
    } catch (e) {
      console.warn('DB rusak, membuat baru', e);
      DB.data = DB.buildSeed();
    }
    return DB.data;
  };

  DB.migrate = function (d) {
    var def = DB.defaultSettings();
    Object.keys(def).forEach(function (k) { if (d.settings[k] === undefined) d.settings[k] = def[k]; });
    ['users', 'categories', 'products', 'customers', 'suppliers', 'transactions',
      'shifts', 'stockLogs', 'debtPayments', 'auditLogs', 'holds'].forEach(function (c) {
        if (!Array.isArray(d[c])) d[c] = [];
      });
    if (!d.counters) d.counters = { tx: 0, product: 0, customer: 0, supplier: 0, shift: 0 };
    if (d.counters.txDate === undefined) d.counters.txDate = '';
    if (d.counters.txSeq === undefined) d.counters.txSeq = 0;
    d.version = DB.VERSION;
    return d;
  };

  var saveTimer = null;
  DB.save = function (immediate) {
    if (saveTimer) clearTimeout(saveTimer);
    if (immediate) return DB.flush();
    saveTimer = setTimeout(DB.flush, 180);
  };
  DB.flush = function () {
    saveTimer = null;
    try {
      localStorage.setItem(KEY, JSON.stringify(DB.data));
      return true;
    } catch (e) {
      U.toast('Penyimpanan penuh! Kurangi data / hapus transaksi lama.', 'error', 5000);
      return false;
    }
  };
  DB.reset = function () { DB.data = DB.buildSeed(); DB.flush(); };
  DB.size = function () {
    try { return (localStorage.getItem(KEY) || '').length; } catch (e) { return 0; }
  };

  /* ======================= AKSES KOLEKSI ======================= */
  DB.all = function (c) { return DB.data[c] || []; };
  DB.find = function (c, id) {
    var a = DB.data[c] || [];
    for (var i = 0; i < a.length; i++) if (a[i].id === id) return a[i];
    return null;
  };
  DB.insert = function (c, obj) {
    if (!obj.id) obj.id = U.uid(c.slice(0, 3));
    obj.createdAt = obj.createdAt || new Date().toISOString();
    obj.updatedAt = obj.createdAt;
    DB.data[c].push(obj);
    DB.save();
    return obj;
  };
  DB.update = function (c, id, patch) {
    var o = DB.find(c, id);
    if (!o) return null;
    Object.keys(patch).forEach(function (k) { o[k] = patch[k]; });
    o.updatedAt = new Date().toISOString();
    DB.save();
    return o;
  };
  DB.remove = function (c, id) {
    var a = DB.data[c] || [];
    var i = a.findIndex(function (x) { return x.id === id; });
    if (i >= 0) { var removed = a.splice(i, 1)[0]; DB.save(); return removed; }
    return null;
  };

  /* ======================= PENGATURAN ======================= */
  DB.setting = function (k) { return DB.data.settings[k]; };
  DB.setSettings = function (patch) {
    Object.keys(patch).forEach(function (k) { DB.data.settings[k] = patch[k]; });
    U.CUR = DB.data.settings.currency || 'Rp';
    DB.save();
  };

  /* ======================= NOMOR URUT ======================= */
  DB.nextCode = function (key, prefix, len) {
    DB.data.counters[key] = (DB.data.counters[key] || 0) + 1;
    var n = DB.data.counters[key];
    var s = String(n);
    while (s.length < (len || 4)) s = '0' + s;
    DB.save();
    return (prefix || '') + s;
  };
  DB.syncCounter = function (key, list, field) {
    var max = 0;
    (DB.data[key] || []).forEach(function (x) {
      var s = String(x[field] || '');
      var m = s.match(/(\d+)$/);
      if (m) max = Math.max(max, parseInt(m[1], 10));
    });
    if (max > (DB.data.counters[key] || 0)) { DB.data.counters[key] = max; DB.save(); }
  };
  /* Nomor struk unik per hari: TRX<yymmdd>-<urut 4 digit> */
  DB.receiptNo = function () {
    var d = new Date();
    var today = U.dateStr(d);
    if (!DB.data.counters.txDate) DB.data.counters.txDate = '';
    if (DB.data.counters.txDate !== today) {
      DB.data.counters.txDate = today;
      DB.data.counters.txSeq = 0;
    }
    DB.data.counters.txSeq = (DB.data.counters.txSeq || 0) + 1;
    var prefix = 'TRX' + U.pad(d.getFullYear() % 100) + U.pad(d.getMonth() + 1) + U.pad(d.getDate()) + '-';
    var no = prefix + U.pad(DB.data.counters.txSeq, 4);
    DB.save();
    return no;
  };

  /* ======================= AUDIT LOG ======================= */
  DB.log = function (action, entity, entityId, detail) {
    var u = (global.APP && global.APP.currentUser) || { name: 'Sistem', id: 'system' };
    DB.data.auditLogs.unshift({
      id: U.uid('log'), date: new Date().toISOString(),
      userId: u.id, userName: u.name, action: action,
      entity: entity || '', entityId: entityId || '', detail: typeof detail === 'string' ? detail : JSON.stringify(detail || {})
    });
    if (DB.data.auditLogs.length > 1500) DB.data.auditLogs.length = 1500;
    DB.save();
  };

  /* ======================= STOK ======================= */
  DB.adjustStock = function (productId, delta, type, note, refNo) {
    var p = DB.find('products', productId);
    if (!p) return null;
    var before = Number(p.stock) || 0;
    var after = before + Number(delta || 0);
    if (after < 0 && !DB.setting('allowNegativeStock')) after = 0;
    p.stock = after;
    p.updatedAt = new Date().toISOString();
    DB.data.stockLogs.unshift({
      id: U.uid('sl'), date: new Date().toISOString(), productId: productId,
      productName: p.name, type: type || 'adjust', qty: Number(delta || 0),
      before: before, after: after, note: note || '', ref: refNo || '',
      userId: (global.APP && global.APP.currentUser && global.APP.currentUser.id) || '',
      userName: (global.APP && global.APP.currentUser && global.APP.currentUser.name) || 'Sistem'
    });
    if (DB.data.stockLogs.length > 3000) DB.data.stockLogs.length = 3000;
    DB.save();
    return p;
  };

  /* ======================= BACKUP ======================= */
  DB.exportJSON = function () { return JSON.stringify(DB.data); };
  DB.importJSON = function (txt) {
    var d = JSON.parse(txt);
    if (!d || typeof d !== 'object' || !d.settings) throw new Error('Format tidak valid');
    DB.data = DB.migrate(d);
    DB.flush();
    return true;
  };

  /* ======================= QUERY BANTUAN ======================= */
  DB.validTx = function () {
    return DB.data.transactions.filter(function (t) { return t.status !== 'void'; });
  };
  DB.txInRange = function (r) {
    return DB.validTx().filter(function (t) { return U.inRange(t.date, r); });
  };
  /* Sisa piutang pelanggan = total transaksi kredit - (DP + cicilan) */
  DB.customerBalance = function (customerId) {
    var owes = 0;
    DB.data.transactions.forEach(function (t) {
      if (t.customerId !== customerId) return;
      if (t.status === 'void') return;
      /* transaksi kredit = ada pembayaran metode tempo (splitt atau tunggal) */
      var hasTempo = t.paymentMethod === 'tempo' ||
        (t.payments || []).some(function (p) { return p.method === 'tempo'; });
      if (!hasTempo) return;
      var due = U.toNum(t.dueAmount);
      if (!due) due = Math.max(0, U.toNum(t.total) - U.toNum(t.paid));
      if (due <= 0) return;
      /* retur penuh menghapus piutang, retur sebagian memotong proporsional */
      if (t.status === 'refund') return;
      if (t.status === 'partial_refund' && U.toNum(t.refundTotal) > 0 && U.toNum(t.total) > 0) {
        var ratio = Math.max(0, 1 - (U.toNum(t.refundTotal) / U.toNum(t.total)));
        due = U.round2(due * ratio);
      }
      owes += due;
    });
    var paid = 0;
    DB.data.debtPayments.forEach(function (d) {
      if (d.customerId === customerId) paid += Number(d.amount) || 0;
    });
    return Math.max(0, U.round2(owes - paid));
  };
  /* Total transaksi kredit + DP untuk satu pelanggan (dipakai tabel piutang) */
  DB.customerDebtInfo = function (customerId) {
    var tx = DB.data.transactions.filter(function (t) {
      if (t.customerId !== customerId || t.status === 'void') return false;
      return t.paymentMethod === 'tempo' ||
        (t.payments || []).some(function (p) { return p.method === 'tempo'; });
    });
    return {
      tx: tx,
      n: tx.length,
      /* nilai penjualan kredit */
      total: U.round2(tx.reduce(function (s, t) { return s + U.toNum(t.total); }, 0)),
      /* DP / uang muka yang sudah dibayar saat transaksi */
      down: U.round2(tx.reduce(function (s, t) { return s + U.toNum(t.paid); }, 0)),
      /* cicilan yang dicatat di menu piutang */
      paid: U.round2(DB.data.debtPayments.filter(function (p) { return p.customerId === customerId; })
        .reduce(function (s, p) { return s + (Number(p.amount) || 0); }, 0)),
      last: tx.reduce(function (m, t) { return (!m || t.date > m) ? t.date : m; }, null)
    };
  };
  DB.totalDebt = function () {
    return U.round2(DB.data.customers.reduce(function (s, c) { return s + DB.customerBalance(c.id); }, 0));
  };
  DB.lowStock = function () {
    return DB.data.products.filter(function (p) {
      return p.active && p.trackStock && p.stock <= (p.minStock || 0);
    });
  };
  DB.soldQty = function (productId) {
    var q = 0;
    DB.data.transactions.forEach(function (t) {
      if (t.status === 'void' || t.status === 'refund') return;
      (t.items || []).forEach(function (it) {
        if (it.productId === productId) q += (it.returnQty ? (it.qty - it.returnQty) : it.qty);
      });
    });
    return q;
  };

  /* ======================= SEED / DEMO DATA ======================= */
  DB.buildSeed = function () {
    var d = DB.empty();
    var now = Date.now();

    /* --- Pengguna --- */
    d.users = [
      { id: 'u_admin', name: 'Administrator', username: 'admin', pin: '1234', role: 'admin', active: true, createdAt: new Date(now - 90 * 864e5).toISOString() },
      { id: 'u_kasir1', name: 'Kasir Satu', username: 'kasir', pin: '1111', role: 'kasir', active: true, createdAt: new Date(now - 60 * 864e5).toISOString() },
      { id: 'u_kasir2', name: 'Kasir Dua', username: 'kasir2', pin: '2222', role: 'kasir_senior', active: true, createdAt: new Date(now - 45 * 864e5).toISOString() }
    ];

    /* --- Kategori --- */
    var cats = [
      ['Makanan', '🍜'], ['Minuman', '🥤'], ['Snack', '🍪'], ['Kebutuhan Rumah', '🧹'],
      ['Perawatan Diri', '🧴'], ['Elektronik', '🔌'], ['Alat Tulis', '✏️'], ['Obat & Apotek', '💊']
    ];
    d.categories = cats.map(function (c, i) {
      return { id: 'c' + (i + 1), name: c[0], icon: c[1], createdAt: new Date(now - 80 * 864e5).toISOString() };
    });

    /* --- Produk --- */
    var prods = [
      ['Makanan', 'Indomie Goreng', '8991002101017', 3500, 2900, 'pcs', 120, 20],
      ['Makanan', 'Indomie Kuah Soto', '8991002101024', 3500, 2900, 'pcs', 95, 20],
      ['Makanan', 'Nasi Goreng Spesial', '1001', 18000, 11000, 'pcs', 40, 5],
      ['Makanan', 'Ayam Bakar (1/2 ekor)', '1002', 28000, 19000, 'pcs', 18, 5],
      ['Makanan', 'Nasi Putih', '1003', 4000, 2200, 'bungkus', 150, 25],
      ['Makanan', 'Mie Ayam Bakso', '1004', 16000, 9500, 'pcs', 35, 5],
      ['Makanan', 'Soto Ayam Madu', '1005', 17000, 10000, 'pcs', 30, 5],
      ['Makanan', 'Es Krim Puter', '1006', 3000, 1500, 'cup', 60, 10],
      ['Minuman', 'Air Mineral 600ml', '8992388101014', 4000, 2800, 'btl', 200, 30],
      ['Minuman', 'Teh Botol Sosro', '8992388101021', 5000, 3500, 'btl', 90, 15],
      ['Minuman', 'Kopi Kapal Api Sachet', '8999999511146', 1500, 1000, 'pcs', 300, 40],
      ['Minuman', 'Susu Ultra Milk 250ml', '8999999001451', 6000, 4300, 'pcs', 75, 12],
      ['Minuman', 'Air Mineral Galon 19L', '1007', 16000, 14000, 'galon', 12, 3],
      ['Minuman', 'Jus Jeruk Peras', '1008', 12000, 6500, 'botol', 24, 5],
      ['Snack', 'Kopi Biskuit', '8998934711013', 8000, 6200, 'pak', 70, 12],
      ['Snack', 'Chitato Sapi Panggang', '8991001350024', 10000, 7800, 'pak', 85, 15],
      ['Snack', 'Oreo Sandwich', '8992775001369', 9000, 7000, 'pak', 55, 10],
      ['Snack', 'Wafer Cokelat', '8996001600264', 1000, 600, 'pcs', 400, 50],
      ['Snack', 'Keripik Kentang Ori', '8991001320059', 9000, 6800, 'pak', 48, 10],
      ['Snack', 'Roti Isi Cokelat', '1009', 10000, 7000, 'pcs', 6, 15],
      ['Kebutuhan Rumah', 'Sabun Mandi Cair 450ml', '8999999001829', 23000, 17500, 'btl', 32, 8],
      ['Kebutuhan Rumah', 'Deterjen Bubuk 800g', '8999999511239', 15000, 11500, 'pak', 27, 8],
      ['Kebutuhan Rumah', 'Piring Keramik 24cm', '1010', 12000, 7500, 'pcs', 15, 5],
      ['Kebutuhan Rumah', 'Sendok Stainless', '1011', 9000, 5500, 'set', 22, 5],
      ['Kebutuhan Rumah', 'Gas Elpiji 3kg', '1012', 22000, 19500, 'tabung', 20, 4],
      ['Perawatan Diri', 'Shampo Sachet 25ml', '1013', 3500, 2200, 'pcs', 180, 30],
      ['Perawatan Diri', 'Pasta Gigi 190g', '8992696404441', 14000, 10500, 'pcs', 28, 8],
      ['Perawatan Diri', 'Sabun Cair Cuci Piring 220ml', '1014', 5000, 3300, 'btl', 44, 10],
      ['Perawatan Diri', 'Tisu Basah Saku', '1015', 5500, 3600, 'pak', 33, 8],
      ['Elektronik', 'Baterai ABC 4pcs', '1016', 12000, 8500, 'pak', 14, 4],
      ['Elektronik', 'Lampu LED 9W', '1017', 15000, 10000, 'pcs', 9, 3],
      ['Elektronik', 'Kabel Rol 5m', '1018', 35000, 26000, 'roll', 4, 2],
      ['Elektronik', 'Charger USB Type-C 20W', '8999999051844', 65000, 48000, 'pcs', 3, 2],
      ['Alat Tulis', 'Buku Tulis 38 lembar', '1019', 5500, 3800, 'pcs', 90, 15],
      ['Alat Tulis', 'Pulpen Gel 0.5 (isi 12)', '1020', 18000, 13500, 'pak', 24, 6],
      ['Alat Tulis', 'Penghapus', '1021', 3000, 1500, 'pcs', 60, 10],
      ['Obat & Apotek', 'Obatickel 100ml', '8992827010169', 17000, 12500, 'botol', 11, 3],
      ['Obat & Apotek', 'Vitamin C 1000mg (30)', '1022', 32000, 24000, 'botol', 7, 3],
      ['Obat & Apotek', 'Plester Luka (10)', '1023', 8000, 5200, 'pak', 16, 5]
    ];
    d.products = prods.map(function (p, i) {
      var ci = d.categories.findIndex(function (c) { return c.name === p[0]; });
      return {
        id: 'p' + (i + 1), sku: 'SKU' + U.pad(i + 1), barcode: String(p[2]), name: p[1],
        categoryId: d.categories[ci] ? d.categories[ci].id : '', price: p[3], cost: p[4],
        unit: p[5], stock: p[6], minStock: p[7], trackStock: true,
        description: '', active: true, createdAt: new Date(now - 75 * 864e5 + i * 1000).toISOString(),
        updatedAt: new Date(now - 20 * 864e5).toISOString()
      };
    });
    d.counters.product = d.products.length;

    /* --- Pelanggan --- */
    var custs = [
      ['Budi Santoso', '081234567890'], ['Siti Aminah', '081298765432'],
      ['Andi Wijaya', '081311223344'], ['Dewi Lestari', '085677889900'],
      ['Rudi Hartono', '081223334455'], ['Maya Sari', '087812345678']
    ];
    d.customers = custs.map(function (c, i) {
      return {
        id: 'k' + (i + 1), code: 'PLB' + U.pad(i + 1), name: c[0], phone: c[1], email: '',
        address: '', note: i === 0 ? 'Pelanggan reguler' : '', creditLimit: 500000,
        createdAt: new Date(now - 60 * 864e5 + i * 1000).toISOString(), updatedAt: new Date(now - 60 * 864e5).toISOString()
      };
    });
    d.counters.customer = d.customers.length;

    /* --- Supplier --- */
    var sups = [
      ['PT Sumber Pangan Nusantara', '081111000111', 'Jl. Industri No. 5, Bekasi'],
      ['CV Elektronik Jaya', '082222000222', 'Jl. Elektronik No. 12, Jakarta'],
      ['Toko Grosir FMCG Sejahtera', '083333000333', 'Jl. Pasar Induk Blok C'],
      ['Distributor Apotek Kendrick', '084444000444', 'Jl. Kesehatan No. 8']
    ];
    d.suppliers = sups.map(function (s, i) {
      return {
        id: 's' + (i + 1), code: 'SUP' + U.pad(i + 1), name: s[0], phone: s[1],
        email: '', address: s[2], note: '', createdAt: new Date(now - 70 * 864e5).toISOString()
      };
    });
    d.counters.supplier = d.suppliers.length;

    /* --- Riwayat transaksi demo (14 hari terakhir) --- */
    var methods = ['cash', 'cash', 'cash', 'qris', 'qris', 'debit', 'transfer', 'ewallet'];
    var payLabels = { cash: 'Tunai', qris: 'QRIS', debit: 'Kartu Debit', credit: 'Kartu Kredit', transfer: 'Transfer', ewallet: 'E-Wallet', tempo: 'Bayar Tempo' };
    var txCount = 0;
    for (var day = 13; day >= 0; day--) {
      var dayDate = new Date(now - day * 864e5);
      var dow = dayDate.getDay();
      var weekend = (dow === 0 || dow === 6);
      var nTx = weekend ? 16 + Math.floor(Math.random() * 12) : 9 + Math.floor(Math.random() * 8);
      for (var t = 0; t < nTx; t++) {
        var d2 = new Date(dayDate);
        var hour = 8 + Math.floor(Math.random() * 13);
        var minute = Math.floor(Math.random() * 60);
        d2.setHours(hour, minute, Math.floor(Math.random() * 60), 0);
        if (d2.getTime() > now) continue;

        var nItem = 1 + Math.floor(Math.random() * 5);
        var used = {};
        var items = [];
        for (var k = 0; k < nItem; k++) {
          var idx = Math.floor(Math.random() * d.products.length);
          if (used[idx]) continue;
          used[idx] = 1;
          var pr = d.products[idx];
          var qty = 1 + Math.floor(Math.random() * (pr.price > 50000 ? 1 : 3));
          items.push({
            productId: pr.id, sku: pr.sku, name: pr.name, barcode: pr.barcode,
            price: pr.price, qty: qty, discount: 0, discountType: 'fixed',
            subtotal: pr.price * qty, cost: pr.cost, returnQty: 0
          });
        }
        if (!items.length) continue;
        var subtotal = items.reduce(function (s, i2) { return s + i2.subtotal; }, 0);
        var disc = (Math.random() < 0.18) ? Math.round(subtotal * (Math.random() * 0.1)) : 0;
        var taxable = subtotal - disc;
        var tax = Math.round(taxable * 0.11);
        var total = taxable + tax;
        var method = methods[Math.floor(Math.random() * methods.length)];
        var cust = (Math.random() < 0.3) ? d.customers[Math.floor(Math.random() * d.customers.length)] : null;
        var cashier = d.users[Math.random() < 0.5 ? 1 : 2];

        var paid = 0, paidCash = 0, paidNonCash = 0, tendered = 0, payments = [], change = 0;
        if (method === 'cash') {
          var opts = [10000, 20000, 50000, 100000];
          var tender = total <= 10000 ? 10000 : opts[Math.floor(Math.random() * opts.length)];
          if (tender < total) tender = Math.ceil(total / 50000) * 50000;
          tendered = tender; change = tender - total;
          paid = total; paidCash = total; paidNonCash = 0;
          payments.push({ method: 'cash', amount: tender, ref: '' });
        } else {
          paid = total; tendered = total; paidCash = 0; paidNonCash = total;
          payments.push({ method: method, amount: total, ref: 'REF' + Math.floor(Math.random() * 900000 + 100000) });
        }

        txCount++;
        var dd = U.pad(d2.getDate()), mm = U.pad(d2.getMonth() + 1);
        d.transactions.push({
          id: 't' + txCount,
          no: 'TRX' + String(d2.getFullYear() % 100) + dd + mm + '-' + U.pad(txCount % 1000) + String(d2.getTime()).slice(-3),
          date: d2.toISOString(), shiftId: '', customerId: cust ? cust.id : '',
          customerName: cust ? cust.name : 'Umum',
          cashierId: cashier.id, cashierName: cashier.name,
          items: items, itemCount: items.reduce(function (s, i3) { return s + i3.qty; }, 0),
          subtotal: subtotal, itemDiscountTotal: 0, discount: disc, discountType: 'fixed',
          serviceFee: 0, serviceFeeType: 'percent', tax: tax, taxRate: 11, taxBase: taxable,
          rounding: 0, total: total, paid: paid, paidCash: paidCash, paidNonCash: paidNonCash,
          tendered: tendered, change: change,
          payments: payments, paymentMethod: method, paymentLabel: payLabels[method],
          dueAmount: 0, status: 'paid', note: '', createdAt: d2.toISOString()
        });
      }
    }

    /* --- Piutang demo --- */
    var tempoItems = [
      { pid: 'p21', qty: 3 }, { pid: 'p33', qty: 2 }
    ];
    [[1, 30000], [3, 50000]].forEach(function (pair, i) {
      var c = d.customers[pair[0]];
      var it = tempoItems[i];
      var pr = d.products.find(function (x) { return x.id === it.pid; });
      var sub = pr.price * it.qty;
      var txx = {
        id: 'td' + (i + 1), no: 'TRX' + 'T' + U.pad(i + 1),
        date: new Date(now - (6 - i * 2) * 864e5).toISOString(), shiftId: '',
        customerId: c.id, customerName: c.name,
        cashierId: 'u_admin', cashierName: 'Administrator',
        items: [{ productId: pr.id, sku: pr.sku, name: pr.name, price: pr.price, qty: it.qty, discount: 0, discountType: 'fixed', subtotal: sub, cost: pr.cost, returnQty: 0 }],
        itemCount: it.qty, subtotal: sub, itemDiscountTotal: 0, discount: 0, discountType: 'fixed',
        serviceFee: 0, serviceFeeType: 'percent', tax: 0, taxRate: 0, taxBase: sub, rounding: 0,
        total: sub, paid: pair[1], paidCash: 0, paidNonCash: 0, tendered: pair[1], change: 0,
        payments: [{ method: 'tempo', amount: sub, ref: '' }],
        paymentMethod: 'tempo', paymentLabel: 'Bayar Tempo',
        dueAmount: sub - pair[1], status: sub > pair[1] ? 'unpaid' : 'paid',
        note: 'Beli kredit, tempo 14 hari', createdAt: new Date().toISOString()
      };
      d.transactions.push(txx);
    });
    d.debtPayments.push({
      id: 'dp1', date: new Date(now - 2 * 864e5).toISOString(),
      customerId: d.customers[1].id, customerName: d.customers[1].name,
      amount: 15000, note: 'Cicilan pertama', userName: 'Administrator', createdAt: new Date().toISOString()
    });
    d.counters.tx = d.transactions.length;

    /* --- Log stok awal --- */
    d.products.forEach(function (p) {
      d.stockLogs.push({
        id: U.uid('sl'), date: new Date(now - 70 * 864e5).toISOString(), productId: p.id,
        productName: p.name, type: 'in', qty: p.stock, before: 0, after: p.stock,
        note: 'Stok awal /-opening balance', ref: 'OPENING', userId: 'system', userName: 'Sistem'
      });
    });

    /* --- Log aktivitas awal --- */
    d.auditLogs.push({
      id: U.uid('log'), date: new Date(now).toISOString(), userId: 'system', userName: 'Sistem',
      action: 'SISTEM', entity: 'Database', entityId: '', detail: 'Inisialisasi database dengan data contoh'
    });

    return d;
  };

  global.DB = DB;
})(window);