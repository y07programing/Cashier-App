/* =====================================================================
   KasirPro - settings.js
   Pengaturan toko, pajak, struk, backup & restore, reset data
   ===================================================================== */
(function (global) {
  'use strict';

  var Settings = {};

  Settings.bind = function () {
    var s = DB.data.settings;
    var map = {
      setStoreName: 'storeName', setAddress: 'address', setPhone: 'phone', setEmail: 'email',
      setNpwp: 'npwp', setFooter: 'footer', setCurrency: 'currency', setReceiptSize: 'receiptSize',
      setTaxEnabled: 'taxEnabled', setTaxRate: 'taxRate', setTaxInclusive: 'taxInclusive',
      setServiceFeeEnabled: 'serviceFeeEnabled', setServiceFeeType: 'serviceFeeType', setServiceFeeValue: 'serviceFeeValue',
      setAutoPrint: 'autoPrint', setSound: 'sound', setLockAfterVoid: 'lockAfterVoid', setMinStockAlert: 'minStockAlert'
    };
    Object.keys(map).forEach(function (id) {
      var el = U.$('#' + id);
      if (!el) return;
      var key = map[id];
      if (el.type === 'checkbox') el.checked = !!s[key];
      else el.value = s[key];
      U.on(el, 'change', function () {
        if (!DB.can('setting.manage')) {
          U.toast('Hanya administrator yang dapat mengubah pengaturan', 'error');
          Settings.bind();
          return;
        }
        var val = el.type === 'checkbox' ? el.checked : el.value;
        if (key === 'taxRate' || key === 'serviceFeeValue') val = U.toNum(el.value);
        DB.setSettings((function () { var o = {}; o[key] = val; return o; })());
        U.CUR = DB.data.settings.currency || 'Rp';
        DB.log('UBAH', 'Pengaturan', key, key + ' = ' + val);
        Settings.updateMeta();
        Settings.preview();
        U.toast('Pengaturan disimpan', 'success', 1500);
        Cart.render();
        Catalog.renderPOS();
      });
    });
    Settings.updateMeta();
    Settings.preview();
  };

  Settings.updateMeta = function () {
    var s = DB.data.settings;
    var side = U.$('#sideStoreName');
    if (side) side.textContent = s.storeName + ' - ' + s.branch;
    var loginName = U.$('#loginStoreName');
    if (loginName) loginName.textContent = s.storeName + ' - ' + s.branch;
    var size = U.$('#dbSize'); if (size) size.textContent = U.bytes(DB.size());
    var dp = U.$('#dbProducts'); if (dp) dp.textContent = DB.all('products').length + ' produk';
    var dt = U.$('#dbTx'); if (dt) dt.textContent = DB.all('transactions').length + ' transaksi';
  };

  Settings.preview = function () { Receipt.preview(); };

  Settings.init = function () {
    U.on(U.$('#btnTestPrint'), 'click', function () {
      var sample = {
        no: 'TRX260101-001', date: U.nowIso(), cashierName: APP.currentUser.name,
        customerName: 'Pelanggan Umum', itemCount: 3, subtotal: 53000, itemDiscountTotal: 0,
        discount: 0, serviceFee: 0, tax: 5830, taxRate: 11, rounding: 0, total: 58830,
        payments: [{ method: 'cash', amount: 60000, ref: '' }], change: 1170, dueAmount: 0, status: 'paid',
        items: [
          { name: 'Indomie Goreng', unit: 'pcs', qty: 2, price: 3500, discount: 0, subtotal: 7000 },
          { name: 'Air Mineral 600ml', unit: 'btl', qty: 3, price: 4000, discount: 0, subtotal: 12000 },
          { name: 'Kopi Kapal Api Sachet', unit: 'pcs', qty: 34, price: 1500, discount: 0, subtotal: 34000 }
        ]
      };
      Receipt.print(sample, 1170);
    });

    U.on(U.$('#btnBackup'), 'click', function () {
      U.download('kasirpro-backup-' + U.today() + '-' + U.pad(new Date().getHours()) + U.pad(new Date().getMinutes()) + '.json',
        DB.exportJSON(), 'application/json');
      DB.log('BACKUP', 'Data', '', 'Backup diunduh');
      U.toast('Backup berhasil diunduh', 'success');
    });

    U.on(U.$('#btnRestore'), 'click', function () { U.$('#restoreFile').click(); });
    U.on(U.$('#restoreFile'), 'change', function (e) {
      var f = e.target.files[0];
      if (!f) return;
      U.confirm('Pulihkan data dari file <b>' + U.esc(f.name) + '</b>? Data saat ini akan <b>ditimpa</b>. Pastikan Anda sudah membuat backup.', 'Pulihkan Backup', true)
        .then(function (ok) {
          if (!ok) { e.target.value = ''; return; }
          var r = new FileReader();
          r.onload = function () {
            try {
              DB.importJSON(r.result);
              U.toast('Data berhasil dipulihkan. Aplikasi akan dimuat ulang.', 'success', 3000);
              setTimeout(function () { location.reload(); }, 1200);
            } catch (err) {
              U.toast('Gagal memulihkan: ' + err.message, 'error', 5000);
            }
          };
          r.readAsText(f);
          e.target.value = '';
        });
    });

    U.on(U.$('#btnExportAll'), 'click', function () { Transactions.exportAll(); });

    U.on(U.$('#btnResetData'), 'click', function () {
      U.confirm('HAPUS SEMUA DATA dan kembalikan ke data contoh awal? <br><br>Tindakan ini <b>tidak dapat dibatalkan</b>. Pastikan backup sudah dibuat.', 'Reset Data', true)
        .then(function (ok) {
          if (!ok) return;
          U.confirm('Yakin 100%? Semua transaksi, produk, dan pelanggan akan dihapus.', 'Konfirmasi Terakhir', true)
            .then(function (ok2) {
              if (!ok2) return;
              DB.reset();
              U.toast('Data direset. Aplikasi akan dimuat ulang.', 'success', 2500);
              setTimeout(function () { location.reload(); }, 1200);
            });
        });
    });

    /* simpan otomatis nama cabang / catatan struk via teks tambahan */
    Settings.updateMeta();
  };

  global.Settings = Settings;
})(window);