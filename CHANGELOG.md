# Changelog — OpenList Frontend (workspace)

Semua perubahan pada OpenList Frontend (`web/`) di workspace ini dicatat di sini.
Format mengikuti [Keep a Changelog](https://keepachangelog.com/), bahasa Indonesia.
(Melacak perubahan workspace di atas upstream `github.com/OpenListTeam/OpenList`.)

## [Unreleased]

### Added

- **Form storage: login TeraBox via QR** — saat driver `Terabox` dipilih
  dengan field Cookie kosong (atau cookie lama kadaluarsa), klik tombol
  simpan menampilkan **popup gambar QR TeraBox** (dibaca dari error
  `need verify` driver / `qrcode_state` di addition) — tetap di halaman form.
  User scan + konfirmasi di aplikasi TeraBox, lalu klik tombol simpan lagi —
  server mem-poll status QR dan menyimpan token `ndus` ke field Cookie.
  Penyimpanan lanjutan memakai id storage hasil create (tanpa duplikat).
  Implementasi: `src/pages/manage/storages/AddOrEdit.tsx`,
  `src/types/storage.ts`, `src/lang/{en,id}/drivers.json`
  (`config.Terabox.qr_login`, `qr_login_title`).

- **Halaman Roles kini mengelola kuota per-role** — form edit Role Manager
  (`/@manage/roles/edit/:id`) menampilkan input Kuota Penyimpanan (untuk
  role General/Minimax/Pertamax) dan Bandwidth unduhan share harian (semua
  role), disimpan via API role (`/api/admin/role/update`) yang baru. Key
  setting lama `bandwidth_daily_*` / `storage_quota_*` disembunyikan dari
  halaman Settings umum karena kini dikelola di Role Manager.
- **Role dropdown dikunci untuk user sistem** — mengedit user `guest` atau
  `admin` tidak bisa lagi mengubah kolom Role, mencegah role guest bergeser
  (mis. menjadi General) yang membuat akses publik/share rusak.

### Changed

- **Update upstream OpenList Frontend v4.2.4 → v4.2.9** — 98 commit upstream
  diterapkan di atas branch lokal (fast-forward ke tag `v4.2.9`, lalu mod
  lokal di-rebase di atasnya). Semua mod lokal tetap utuh: branding Gofile,
  Role Manager + kuota per-role, halaman Stats & Statistic, `DetailSidebar`,
  `utils/download.ts`, default bahasa `id`, dan tema. Dependency ikut naik
  mengikuti upstream (vite 8.3.3, prettier 3.9.10, @crowdin/cli 5.5.0,
  lint-staged 17.6.0, dst). Dua mod perlu penyesuaian agar tetap jalan di atas
  API baru:
  - `Header.tsx` — perilaku "sembunyikan menu kanan + header terpusat saat
    halaman share" dipindah ke struktur baru upstream (`props.flush`,
    `MediaSidebarTrigger`, `isMediaPage`).
  - `login/index.tsx` — desain halaman login kustom dipertahankan, lalu
    ditambahkan dua perbaikan upstream: guard `if (loading()) return` dan
    auto-submit OTP saat 6 digit terisi.
  - `settings/Common.tsx` — filter `isRoleSettingKey` digabung dengan memo
    `visible()` baru upstream (properti `keys`/`readOnlyKey`).
  - `utils/request.ts` — mod lokal dihapus karena sudah digantikan
    implementasi upstream v4.2.9 yang lebih lengkap (envelope error +
    semantik multipart).
- **Default delete policy offline download = `delete_on_upload_succeed`** —
  dialog offline download (`OfflineDownload.tsx` & `OfflineDownloadEnhanced.tsx`)
  kini memilih "Delete on upload succeed" secara default (sebelumnya
  `upload_download_stream`). Akibatnya folder temp lokal dibersihkan otomatis
  setelah file berhasil terunggah ke storage, sehingga tidak menumpuk di
  `temp_dir` (mis. `data\temp\qBittorrent\<uid>`). File tetap aman: temp
  hanya dihapus setelah upload sukses; upload gagal → file tersimpan.

### Fixed

- **Popup QR login Terabox kini aktif dan memberi feedback langsung** —
  selama popup terbuka, frontend mengulang request save/poll secara
  sekuensial (satu request in-flight) sehingga konfirmasi di aplikasi
  TeraBox terdeteksi: popup menutup sendiri + toast sukses + pindah ke
  daftar storage saat login berhasil, spinner dan status "Memeriksa
  konfirmasi di app TeraBox…" tampil saat request berjalan, serta QR
  diganti otomatis (toast "QR diperbarui") saat window poll habis.
  Sebelumnya popup pasif setelah klik Add pertama, sehingga user tidak
  tahu apakah konfirmasi di ponsel berhasil. File:
  `src/pages/manage/storages/AddOrEdit.tsx`,
  `src/lang/{en,id}/drivers.json` (`qr_checking`, `qr_refreshed`).
- **`pnpm lint` kembali 0 error setelah update v4.2.9** — upstream v4.2.9
  memakai import `artplayer/types/{option,setting,events}` yang diblok oleh
  `exports` map `artplayer@5.4.0` (`moduleResolution: "bundler"`), sehingga
  `tsc --noEmit` gagal 8 error di `src/pages/home/previews/video.tsx`.
  Ditambahkan path mapping `"artplayer/types/*"` di `tsconfig.json` (pola yang
  sama dengan `@stitches/core/types/*` dan `@hope-ui/solid`).
- **Klik item file/folder tidak lagi mati setelah drag-select** — seleksi drag
  mengosongkan cache seleksi global (`selectedCache = null`), lalu setiap klik
  kiri dibuang karena `e.preventDefault()` sudah menonaktifkan link dan
  `restoreSelectionCache()` dijadikan gerbang navigasi. Akibatnya klik tidak
  bereaksi dan URL tidak berubah sampai halaman di-refresh. Kini navigasi hanya
  ditahan bila interaksi terakhir benar-benar drag (`isDragSelection`), dan klik
  biasa selalu membuka item. Berlaku untuk layout list, grid, dan image
  (termasuk klik ikon/thumbnail). File: `src/pages/home/folder/helper.ts`,
  `ListItem.tsx`, `GridItem.tsx`, `ImageItem.tsx`.
- **`tsc --noEmit` kini bersih 0 error** (sebelumnya 15 error pre-existing di
  7 file; semua fix aman untuk runtime, dua di antaranya memperbaiki bug
  nyata):
  - `src/components/MonacoEditor.tsx` & `src/pages/home/previews/text-editor.tsx`
    — import tipe monaco diganti `monaco-editor/editor/editor.api.js`;
    path lama `monaco-editor/esm/vs/editor/editor.api.js` tidak lolos
    `exports` map monaco-editor 0.56 (dobel prefix `esm/vs/`) di
    `moduleResolution: "bundler"`.
  - `src/pages/home/previews/archive.tsx` — komponen `Dynamic` di-cast ke
    `Component<any>` agar props `images`/`navigate` (diterima preview image,
    lihat `image.tsx`) lolos cek tipe; param `name` diberi tipe eksplisit.
  - `src/pages/home/Sidebar.tsx`, `toolbar/Right.tsx`, `login/index.tsx` —
    prop `align`/`justify` (bukan prop Hope UI) diganti `alignItems`/
    `justifyContent`.
  - `src/pages/home/toolbar/Right.tsx` — **bug nyata #1**: `resp.code`
    dibaca dari `AxiosResponse` padahal interceptor sudah me-return envelope
    → kini di-cast `Resp<any>`. **Bug nyata #2**: `Badge size="sm"` (prop
    tidak ada) → `fontSize="$xs"`; `transition` Motion di `VStack as={Motion.div}`
    di-cast (konflik tipe dengan prop CSS transition Hope UI).
  - `src/pages/login/index.tsx` — **bug nyata #3**: `useColorModeValue(...)`
    diteruskan sebagai fungsi (aksesor) ke `borderColor`/`color` Divider &
    Flex footer → kini dibuat const setup & dipanggil `()` (warna benar
    sekarang benar-benar diterapkan).
  - `src/pages/manage/storages/AddOrEdit.tsx` — spread `{...item}` di-cast
    `as any`; `ItemProps` adalah discriminated union per `Type` literal yang
    tak bisa dipenuhi spread `DriverItem` generik.

### Added

- **Menu Roles (Role Manager)** — halaman manage baru khusus admin di
  `/@manage/roles` untuk mengatur permission bitmask global per role
  (General/Guest/Minimax/Pertamax; backend lihat CHANGELOG server):
  - `src/pages/manage/roles/Roles.tsx` (baru) — daftar role + dot permission
    (tooltip label izin, pola sama dengan halaman Users).
  - `src/pages/manage/roles/AddOrEdit.tsx` (baru) — matrix checkbox
    permission per role + helper text union (izin role = tambahan atas izin
    individual user).
  - `src/types/role.ts` (baru) — interface `ManageRole`; di-export dari
    `src/types/index.ts`.
  - Menu + route: `sidemenu_items.tsx` (ikon `BsPersonBadgeFill`, admin-only)
    & `routes.tsx` (`/roles/edit/:id`).
  - i18n en+id: `lang/{en,id}/roles.json` (baru, diregistrasi di `entry.ts`)
    - `manage.sidemenu.roles` ("Roles"/"Peran").

- **Menu Statistic (kuota storage personal)** — menu sidebar Manage baru yang
  terlihat untuk semua user yang login (General/Admin/Minimax/Pertamax; guest
  dikecualikan):
  - `src/pages/manage/statistic/Statistic.tsx` (baru) — fetch `GET /me/storage`,
    tampilkan used/quota/available + progress bar dinamis (info/warning/danger
    berdasarkan persentase), badge "{{percent}}% used", dan label "Unlimited"
    bila kuota ≤ 0. Tombol Refresh untuk re-fetch. Memakai `getFileSize`
    shared & pola `useColorModeValue` yang sama dengan halaman Stats admin.
  - Menu ditambahkan di `src/pages/manage/sidemenu_items.tsx`
    (`role: UserRole.GENERAL`, ikon `BsHddStack`, route `/@manage/statistic`);
    route ter-register otomatis lewat `get_routes`.
  - i18n en+id: `manage.sidemenu.statistic` + block `manage.statistic.*` di
    `src/lang/{en,id}/manage.json`.

- **UI storage quota per user** — menampilkan & mengelola alokasi storage
  per user (backend lihat CHANGELOG server):
  - `src/types/user.ts` — field baru `storage_quota` & `storage_used` di
    interface `User`.
  - `src/pages/manage/users/AddOrEdit.tsx` — input number `storage_quota`
    (hanya untuk user non-guest/non-admin; `-1` = default role, `0` =
    unlimited, `>0` = bytes) + tampilan `storage_used` read-only saat edit.
  - `src/pages/manage/users/Profile.tsx` — indikator penggunaan storage:
    fetch `GET /me/storage`, progress bar (used/quota) + label
    human-readable (KB/MB/GB/TB). Tampil "Unlimited" bila quota 0.
  - i18n (en + id): label `settings.storage_quota_{general,minimax,pertamax}`
    (+tips) yang auto-render di halaman Settings group Global, serta key
    `users.{storage_quota,storage_used,storage_usage,storage_unlimited}`.

- **Helper download terautentikasi untuk admin** — `src/utils/download.ts`
  (baru) mengekspos `openDownload(url, filename)` & `authFetchHeaders()`:
  - Saat user admin login, `openDownload` melakukan `fetch` URL download dengan
    header `Authorization` lalu men-stream body langsung ke disk via
    `streamSaver` (sama seperti PackageDownload). Ini membuat server OpenList
    bisa mengidentifikasi admin dan **membebaskan dari rate-limit download**
    (`max_client_download_speed` / `max_server_download_speed`) di route `/d/`
    `/p/` `/ae/`. Browser otomatis menghapus header `Authorization` saat
    redirect cross-origin, jadi token tidak pernah bocor ke cloud pihak ketiga.
  - User non-admin: fallback ke `window.open` (navigasi/redirect native) —
    perilaku lama tidak berubah.
  - `authFetchHeaders()` dipakai code path yang sudah punya fetch-nya sendiri
    (PackageDownload ZIP).

### Changed

- **Tombol Download halaman preview** (`src/pages/home/previews/download.tsx`)
  kini memanggil `openDownload` (admin: stream terautentikasi; lainnya:
  navigasi biasa). Sebelumnya `<a href target=_blank>` yang tidak membawa token.
- **PackageDownload ZIP** (`src/pages/home/toolbar/PackageDownload.tsx`)
  menambahkan `authFetchHeaders()` ke `fetch` tiap file sehingga admin tidak
  terkena rate-limit saat unduh bertipe ZIP.

### Added

- **Sidebar detail file** di halaman single-file/share download — komponen baru
  `src/pages/home/file/DetailSidebar.tsx`:
  - Layout 2-kolom (area utama + sidebar kanan) bergaya halaman download
    mega.nz, konsisten untuk semua tipe file.
  - Section **Informasi File**: Type (dengan ikon `getIconByObj` + warna
    `getMainColor`), Size, Created, Modified.
  - Section **QR Download**: kode QR dari link unduhan saat ini
    (`currentObjLink`), scan untuk unduh via ponsel.
  - Tombol **Copy link** (`useCopyLink`) di bagian bawah sidebar.
  - Mendukung dark mode via `useColorModeValue`.
- **Layout 2-kolom** di `src/pages/home/file/File.tsx` — dibungkus `Grid`
  responsif (`@initial` 1 kolom → `@lg` `minmax(0,1fr) 300px`). Logika preview
  switcher lama dipertahankan utuh; sidebar ditambahkan tanpa mengubah perilaku
  preview yang ada.
- Kunci i18n baru di `src/lang/en/home.json`: `home.obj.type`, `home.obj.created`,
  `home.preview.file_information`, `home.preview.qr_download`,
  `home.preview.scan_to_download`.

### Added

- **Field Role di form edit user** (`src/pages/manage/users/AddOrEdit.tsx`) —
  Select Role (Admin/General) ditambahkan, sehingga admin bisa mempromosikan
  user menjadi admin langsung dari UI (sebelumnya form tidak punya field Role,
  dan backend memblokir perubahan role). Bekerja sama dengan perubahan backend
  `server/handles/user.go` yang mengizinkan ubah/buat role admin.
- **Label i18n role** di `src/lang/en/users.json`: `users.roles.{admin,general,
guest}`.

### Added

- **Indikator quota bandwidth di sidebar share** — `DetailSidebar` fetch
  endpoint publik `/sq/:sid` (saat isShare) & tampilkan "Bandwidth Today:
  terpakai / limit" + progress bar (merah >90%). Hanya muncul untuk owner
  berkicap (limit > 0); owner unlimited disembunyikan. i18n
  `home.preview.{bandwidth_today,used}`.

- **Role Minimax & Pertamax** di selector Role form edit user
  (`src/pages/manage/users/AddOrEdit.tsx`) — 2 tier bandwidth baru (selain
  Admin/General). `UserRole` enum (`src/types/user.ts`) ditambah MINIMAX=3,
  PERTAMAX=4; `is_general` diubah agar minimax/pertamax dianggap "general-like"
  (melihat menu Tasks/Shares). Label i18n `users.roles.{minimax,pertamax}` di
  `src/lang/{en,id}/users.json`.

- **Halaman Admin Analytics Dashboard** (`src/pages/manage/stats/Stats.tsx`)
  - menu **Stats** di sidebar manage (admin-only): scorecards (Total Users,
    Total Shares, Active Shares, Total Accesses, Downloads/Bandwidth Today,
    Rate-Limit & Quota Hits), grafik bandwidth 14 hari (CSS bar), dan tabel Top
    Shares. Memakai 3 endpoint baru `/admin/stats/{overview,traffic,top-shares}`.
- **Label i18n** `manage.sidemenu.stats` + block `manage.stats.*` di
  `src/lang/{en,id}/manage.json`.

### Changed

- **Modal Share disederhanakan** (`src/pages/home/toolbar/Share.tsx`) — 6 form field
  dihapus karena otomatis/default:
  - **ID** → tidak lagi diinput; dikirim kosong sehingga backend auto-generate
    ID acak (perilaku bawaan `CreateSharing`).
  - **Keterangan (Remark)**, **Deskripsi (Readme)**, **Deskripsi Header (Header)**
    → dihapus, default kosong.
  - **Urutkan Berdasarkan (Order By)** & **Arah Urutan (Order Direction)** →
    dihapus, default `None` (state awal handler sudah set `OrderBy.None` /
    `OrderDirection.None`).
  - Field yang tersisa di modal: **Folder Order** (extract_folder), **Share Code**
    (pwd), **Maximum access count** (max_accessed), **Expiration time** (expires).
- **Folder Order otomatis** — field "Folder Order" (extract_folder) juga dihapus
  dari modal; default sort share diubah ke **terbaru di atas** (`order_by: Modified`,
  `order_direction: Desc`). Import tak terpakai (`Select`, `SelectOptions`,
  `MultiPathInput`) dibersihkan. Modal Share kini hanya: Share Code (pwd), Maximum
  access count (max_accessed), Expiration time (expires).

### Fixed

- **Halaman share tidak menampilkan kuota download** (`src/pages/home/file/
DetailSidebar.tsx`) — sebelumnya section "Bandwidth Hari Ini" disembunyikan
  saat owner tak ber-kuota (`limit_bytes == 0`, mis. admin / role default). Kini
  section selalu tampil di halaman share: bila ber-kuota → "X / Y" + progress
  bar; bila unlimited → "X / Tak Terbatas" tanpa bar.
- **QR Code terlalu kecil** — ukuran digeber dari `64px` → `140px` + `scale: 4`
  (gambar lebih tajam) agar mudah dipindai.

### Catatan

- Bidang metadata share (Share ID, Accessed, Expires) **belum** ditampilkan di
  sidebar karena tidak tersedia untuk pengunjung publik anonim — endpoint
  `/share/get` butuh autentikasi (`AuthNotGuest`). Bidang ini membutuhkan
  endpoint publik baru (fase backend berikutnya).
- Field **Storage/backend** sengaja tidak ditampilkan (file akan diproksikan via
  CDN, identitas backend tidak relevan untuk pengunjung).
- Terverifikasi: `tsc --noEmit` bersih untuk file yang diubah (error pre-existing
  di file lain bukan dari perubahan ini); `prettier` ter-format.
- Mockup referensi: `share-preview-mockup.html` di root workspace (HTML statis,
  12 skenario tipe file, dark mode) — disetujui sebelum dikonversi ke kode.
- **Label setting `register_default_role`** (en/id) � dropdown pilihan
  General/Minimax/Pertamax pada Settings ? Site.
- **Form registrasi di halaman login** � muncul otomatis ketika setting
  `register_enabled` aktif: field konfirmasi password, validasi minimal 6
  karakter & kecocokan password, sukses langsung masuk dengan token hasil
  registrasi. Tersedia label i18n en/id.
- **Field "Folder utama" di Role Manager** � menyetel base folder per-role;
  pengguna baru hasil registrasi otomatis mendapat sub-folder pribadi
  `<username>-<IDuser>` di dalamnya.
- **Halaman Users menampilkan izin efektif** � indikator titik izin kini
  memakai `effective_permission` (mask user OR role) sehingga konsisten
  dengan Role Manager; fallback ke mask lama bila field tak tersedia.
- **Interceptor axios mempertahankan pesan error server** � kini API
  mengembalikan status HTTP asli (non-2xx membuat axios melempar error);
  interceptor memilih code/message dari body JSON respons error sehingga
  notifikasi UI tetap menampilkan pesan server, bukan pesan generik axios.
- **Kartu Bandwidth di halaman Statistic** � menampilkan pemakaian bandwidth
  unduhan hari ini + batas harian role (progress bar, label unlimited),
  data dari `/me/storage` yang diperluas.
