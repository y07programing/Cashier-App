const fs = require('fs');
const path = require('path');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..', 'kasir-pro');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

const vc = new VirtualConsole();
const errors = [];
vc.on('error', function (e) { errors.push('console.error: ' + e); });
vc.on('jsdomError', function (e) {
  var msg = (e.detail && e.detail.message) || e.message || '';
  if (msg.indexOf('Not implemented') >= 0) return;
  errors.push('jsdomError: ' + msg);
});

const dom = new JSDOM(html, {
  url: 'file:///' + root.split(path.sep).join('/') + '/index.html',
  runScripts: 'dangerously',
  resources: 'usable',
  virtualConsole: vc,
  pretendToBeVisual: true
});

const w = dom.window;

/* Polyfill canvas 2D (jsdom tanpa paket canvas) - chainable */
w.HTMLCanvasElement.prototype.getContext = function () {
  var grad = new Proxy({}, {
    get: function (t, p) { return function () { return grad; }; },
    set: function () { return true; }
  });
  return grad;
};

function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
function $(sel) { return w.document.querySelector(sel); }
function $$(sel) { return Array.from(w.document.querySelectorAll(sel)); }

(async function () {
  var results = [];
  function check(name, ok, extra) {
    results.push({ name: name, ok: !!ok });
    console.log((ok ? 'PASS' : 'FAIL') + ' | ' + name + (extra ? ' | ' + extra : ''));
  }

  await new Promise(function (res) {
    if (w.document.readyState === 'complete') res();
    else w.addEventListener('load', res);
  });
  await sleep(1100); /* tunggu App.boot (timeout 550ms) */

  /* ===== 1. BOOT ===== */
  check('Boot: layar login tampil', !$('#loginScreen').classList.contains('hidden'));
  check('Boot: app shell tersembunyi', $('#appShell').classList.contains('hidden'));
  check('Boot: seed 39 produk', w.DB.data.products.length === 39, 'produk=' + w.DB.data.products.length);
  check('Boot: seed 8 kategori', w.DB.data.categories.length === 8, 'kategori=' + w.DB.data.categories.length);
  check('Boot: seed 6 pelanggan', w.DB.data.customers.length === 6, 'pelanggan=' + w.DB.data.customers.length);
  check('Boot: seed transaksi demo >150', w.DB.data.transactions.length > 150, 'tx=' + w.DB.data.transactions.length);
  check('Boot: 3 pengguna', w.DB.data.users.length === 3, 'users=' + w.DB.data.users.length);

  /* ===== 2. LOGIN ===== */
  $('#loginUsername').value = 'admin';
  $('#loginPin').value = '1234';
  $('#loginForm').dispatchEvent(new w.Event('submit', { cancelable: true, bubbles: true }));
  await sleep(250);
  check('Login: app shell muncul', !$('#appShell').classList.contains('hidden'));
  check('Login: session admin aktif', w.APP.currentUser && w.APP.currentUser.username === 'admin');
  check('Login: nama tampil di topbar', $('#userName').textContent === 'Administrator');
  check('Login: audit LOGIN tercatat', w.DB.data.auditLogs.some(function (l) { return l.action === 'LOGIN'; }));

  /* ===== 3. POS ===== */
  var cards = $$('#posProductGrid .pcard');
  check('POS: grid 39 kartu produk', cards.length === 39, 'pcard=' + cards.length);
  check('POS: kategori terender', $$('#posCategories *').length > 0);

  var pid = cards[0].getAttribute('data-pid');
  var before = w.DB.find('products', pid).stock;
  cards[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true }));
  await sleep(120);
  check('POS: klik kartu -> 1 item di keranjang', w.Cart.items.length === 1, 'items=' + w.Cart.items.length);
  check('POS: total keranjang > 0', $('#calcTotal').textContent !== 'Rp 0', $('#calcTotal').textContent);

  /* ===== 4. CHECKOUT TUNAI ===== */
  var txBefore = w.DB.data.transactions.length;
  w.Checkout.open('full');
  await sleep(120);
  check('Checkout: modal pembayaran terbuka', !$('#modalHost').classList.contains('hidden'));
  /* pilih metode Tunai dulu (seperti UI asli) */
  var cashBtn = w.document.querySelector('#payGrid .pay-btn[data-m="cash"]');
  check('Checkout: tombol metode Tunai ada', !!cashBtn);
  cashBtn.click();
  await sleep(120);
  check('Checkout: input uang diterima muncul', w.document.querySelector('#payAmount') !== null);
  check('Checkout: uang diterima = total', w.document.querySelector('#payAmount').value === String(w.Cart.calc().total), w.document.querySelector('#payAmount').value);
  var payBtn = $$('#modalHost .modal-foot .btn-primary').pop();
  check('Checkout: tombol Selesaikan Pembayaran ada', !!payBtn);
  payBtn.click();
  await sleep(400);

  var txs = w.DB.data.transactions;
  var last = txs[txs.length - 1];
  check('Transaksi: tersimpan (+1)', txs.length === txBefore + 1, 'tx=' + txs.length);
  check('Transaksi: status paid', last.status === 'paid', last.status);
  check('Transaksi: no struk format TRXyymmdd-nnnn', /^TRX\d{6}-\d{4}$/.test(last.no), last.no);
  check('Transaksi: metode Tunai', last.paymentMethod === 'cash', last.paymentMethod);
  check('Stok: berkurang 1', w.DB.find('products', pid).stock === before - 1, before + ' -> ' + w.DB.find('products', pid).stock);
  check('Stok: log pergerakan tercatat', w.DB.data.stockLogs.some(function (s) { return s.type === 'sale' && s.productId === pid; }));
  check('Audit: TRANSAKSI tercatat', w.DB.data.auditLogs.some(function (l) { return l.action === 'TRANSAKSI'; }));
  check('Modal sukses: struk berhasil tampil', $('#modalHost .modal-head h3') && $('#modalHost .modal-head h3').textContent === 'Transaksi Berhasil');

  /* ===== 5. RIWAYAT TRANSAKSI ===== */
  w.App.go('transactions');
  await sleep(200);
  check('Transaksi: tabel riwayat terisi', $$('#txTable tbody tr').length > 0, 'rows=' + $$('#txTable tbody tr').length);

  /* ===== 6. LAPORAN PENJUALAN ===== */
  w.App.go('reports');
  await sleep(250);
  check('Laporan: KPI omzet terisi', $('#rptKpi').innerHTML.indexOf('Omzet') >= 0);
  check('Laporan: 10 produk terlaris terisi', $$('#rptTopProd tbody tr').length > 0, 'rows=' + $$('#rptTopProd tbody tr').length);
  check('Laporan: rekap per kasir terisi', $$('#rptByCashier tbody tr').length > 0, 'rows=' + $$('#rptByCashier tbody tr').length);
  check('Laporan: rekap harian terisi', $$('#rptDaily tbody tr').length > 0, 'rows=' + $$('#rptDaily tbody tr').length);
  check('Laporan: canvas grafik ada', !!$('#chartSales') && !!$('#chartCat'));

  /* ===== 7. LAPORAN LABA RUGI ===== */
  w.App.go('profit');
  await sleep(250);
  check('Laba rugi: KPI HPP terisi', $('#prKpi').innerHTML.indexOf('HPP') >= 0);
  check('Laba rugi: tabel detail terisi', $$('#prTable tbody tr').length > 0, 'rows=' + $$('#prTable tbody tr').length);

  /* ===== 8. PENGATURAN & PRATINJAU STRUK ===== */
  w.App.go('settings');
  await sleep(200);
  check('Pengaturan: pratinjau struk terender', $('#receiptPreview').innerHTML.length > 100, 'len=' + $('#receiptPreview').innerHTML.length);
  check('Pengaturan: meta db terisi', $('#dbTx').textContent.indexOf('transaksi') >= 0, $('#dbTx').textContent);

  /* ===== 9. VERIFIKASI BUG DUPLIKASI LISTENER ===== */
  var setCalls = [];
  var orig = w.DB.setSettings;
  w.DB.setSettings = function (patch) { setCalls.push(patch); return orig.apply(w.DB, arguments); };
  w.App.go('pos'); await sleep(60);
  w.App.go('settings'); await sleep(60); /* kunjungan ke-2 */
  w.App.go('pos'); await sleep(60);
  w.App.go('settings'); await sleep(60); /* kunjungan ke-3 */
  var taxRate = $('#setTaxRate');
  taxRate.value = '12';
  taxRate.dispatchEvent(new w.Event('change', { bubbles: true }));
  await sleep(150);
  check('BUG: listener ganda di Pengaturan (1 ubah -> banyak simpan)', setCalls.length > 1, 'DB.setSettings dipanggil ' + setCalls.length + 'x untuk 1 kali perubahan');
  w.DB.setSettings = orig;

  /* ===== 10. ERROR RUNTIME ===== */
  check('Tidak ada error runtime', errors.length === 0, errors.slice(0, 3).join(' ; '));

  var failed = results.filter(function (r) { return !r.ok; });
  console.log('-------------------------------------------');
  console.log('TOTAL ' + results.length + ' | PASS ' + (results.length - failed.length) + ' | FAIL ' + failed.length);
  process.exit(failed.length ? 1 : 0);
})().catch(function (e) { console.error('SMOKE TEST CRASH: ' + ((e && e.stack) || e)); process.exit(2); });
