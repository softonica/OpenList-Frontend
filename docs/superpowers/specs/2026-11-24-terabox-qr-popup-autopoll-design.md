# Design — TeraBox QR Popup Auto-Poll (Approach A)

Tanggal: 2026-11-24 · Ukuran: perubahan kecil (frontend only)

## Intent / Kenapa

Setelah user konfirmasi login QR di app TeraBox (ponsel), UI OpenList tidak
merespon sama sekali — popup QR pasif, dan server hanya mengecek Terabox saat
request save sedang berjalan (window poll ≤90s). Konfirmasi yang datang di luar
window tidak pernah terdeteksi, user tidak tahu sukses atau gagal
(teramati live 2026-11-24 pada mount `/TBtestQR`).

## Goals

- Selama popup QR terbuka, frontend otomatis mengulang request save/poll
  ( satu-per-satu, tiap request ≤90s ).
- Konfirmasi di app terdeteksi oleh poll aktif → **popup close sendiri** +
  toast sukses + navigate ke daftar storage.
- Window habis tanpa konfirmasi → popup mengganti QR dengan yang baru (server
  menjawab `need verify` + state baru) + info "QR diperbarui — scan ulang",
  lalu lanjut menunggu.
- Loop berhenti saat popup ditutup user; tidak membuka ulang popup yang sudah
  ditutup.

## Non-goals

- Tanpa perubahan server (endpoint status baru = Approach C, ditolak: overkill).
- Tombol Save manual tidak berubah perilaku.
- Tidak ada auto-reopen popup.

## Constraints

- File: `web/src/pages/manage/storages/AddOrEdit.tsx` +
  i18n `web/src/lang/{en,id}/drivers.json`.
- Request sekuensial (satu in-flight), reuse `ok()` agar logika
  create/update (`createdId`) tetap berlaku.
- Server menjawab ≤~90s (fix window sudah live) — aman di bawah limit jalur
  (~120s).
- Deploy frontend only: server menyajikan `web/dist` dari disk (custom
  `dist_dir`) → cukup `pnpm build` + refresh browser, tanpa restart binary.

## Approaches

|       | Cara                                       | Status                                                                                     |
| ----- | ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **A** | Auto-poll loop saat popup terbuka          | **DIPILIH** — cocok dengan ekspektasi "konfirmasi → langsung respon", nol perubahan server |
| B     | Tombol "Saya sudah konfirmasi" + status    | ditolak — tetap manual (sumber kebingungan saat ini)                                       |
| C     | Endpoint status server + poller background | ditolak — perubahan arsitektur besar untuk UX yang sama                                    |

## How (keputusan implementasi)

- Signal baru `qrStatus: "scan" | "checking"` → popup menampilkan spinner +
  teks "Memeriksa konfirmasi di app TeraBox…" saat request berjalan.
- `submitQrPoll()`:
  - set `addition.qrcode_state` dari `qrLogin()` → panggil `ok()`;
  - sukses → `setQrOpen(false)` + toast sukses + navigate (sama dengan sukses
    Save manual);
  - error QR (need verify) → perbarui `qrLogin` + `addition.qrcode_state` +
    `createdId`, toast info "QR diperbarui — scan ulang", buka ulang modal
    hanya bila loop masih aktif;
  - error lain → toast error, hentikan loop.
- `qrAutoLoop()`: `while (popup terbuka && qrLogin ada && flag aktif)` →
  `submitQrPoll()` + jeda 1s. Flag mencegah loop ganda; di-set via
  `createEffect` pada `qrOpen()`, di-clear saat modal ditutup.
- Sukses via tombol Save manual juga menutup popup (defensif).
- i18n baru: `drivers.config.Terabox.qr_checking`,
  `drivers.config.Terabox.qr_refreshed` (en + id).

## Verifikasi

- `pnpm lint` (tsc) di `web/`.
- `pnpm build` → user refresh browser → popup terbuka → loop terlihat di log
  server (update requests berulang dengan `need verify` tiap ≤90s) + status
  text tampil. Path close-otomatis saat sukses butuh konfirmasi ponsel user.
