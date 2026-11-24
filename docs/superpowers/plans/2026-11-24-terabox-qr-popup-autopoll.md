# TeraBox QR Popup Auto-Poll — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QR login popup di halaman Add/Edit storage Terabox menjadi aktif — otomatis mem-poll konfirmasi login selama popup terbuka, close sendiri saat sukses, dan menampilkan status jelas (sukses/gagal/QR baru).

**Architecture:** Loop sekuensial di komponen `AddOrEdit.tsx`: selama modal QR terbuka, frontend mengulang request save yang sama dengan klik Save manual (`ok()` — server mem-poll Terabox ≤90s per request dan menjawab sukses atau halaman `need verify` berisi QR baru). Signal `qrStatus` menggerakkan teks status di modal. Nol perubahan server.

**Tech Stack:** SolidJS (signals/createEffect/createStore), @hope-ui/solid (Modal/Spinner), TypeScript, i18n `@solid-primitives/i18n` (file JSON en/id).

**Spec:** `docs/superpowers/specs/2026-11-24-terabox-qr-popup-autopoll-design.md` (di repo `web/`).

## Global Constraints

- Frontend only — JANGAN sentuh `server/` (binary berjalan tidak di-restart; server menyajikan `web/dist` dari disk).
- Bahasa UI user: Indonesia — copy i18n `id` wajib benar, `en` juga diisi.
- `pnpm lint` = `tsc -p tsconfig.json --noEmit`; `pnpm build` = `vite build` (workdir `web/`).
- Repo `web/` punya WIP user yang belum di-commit — `git add` HANYA file yang didaftar di task.
- `handleResp` (web/src/utils/handle_resp.ts) memanggil callback secara **sinkron** — outcome bisa ditangkap lewat variabel lokal, tanpa Promise wrapper.
- Gunakan pola kode yang sudah ada di file (signal, `handleResp(resp, success, fail, true, false)` dengan notify_error=false seperti handler Save yang ada).

## Review Focus

1. **Loop ganda** — `createEffect` re-run saat `qrLogin` berubah (refresh QR). Guard `qrLoopActive` mencegah request paralel. Buktikan: log server menunjukkan request sekuensial, tidak tumpang-tindih.
2. **Modal dibuka ulang setelah user menutup** — response `need verify` datang saat popup sudah ditutup user → jangan reopen. Guard: `setQrOpen(true)` hanya bila `qrLoopActive` masih true. Buktikan: tutup popup saat poll berjalan → response berikutnya tidak membuka modal lagi.
3. **Key i18n hilang di satu bahasa** — `t()` lookup runtime; key hilang tampil sebagai string mentah. Buktikan: kedua file `en/id` berisi `qr_checking` + `qr_refreshed`, dan copy `qr_login` baru dirender (UI user bahasa Indonesia).
4. **Regresi alur Save manual** — handler tombol Save hanya boleh TAMBAH `setQrOpen(false)` di callback sukses; cabang QR-error dan error-lain tidak berubah (`setCreatedId`, navigate ke edit/{id} tetap).
5. **Loop lepas setelah sukses/navigasi** — loop break pada outcome `success`/`error`; unmount component mendisposisi effect. Buktikan: setelah navigasi ke daftar storage, tidak ada request update baru di log.

## Task 1: QR popup auto-poll + status + i18n + docs

**Files:**

- Modify: `web/src/pages/manage/storages/AddOrEdit.tsx`
- Modify: `web/src/lang/en/drivers.json` (blok `drivers.config.Terabox`, ±line 1700)
- Modify: `web/src/lang/id/drivers.json` (blok yang sama)
- Modify: `web/CHANGELOG.md` (bawah `[Unreleased]`), `CATATAN.md` (workspace root — entri "Riwayat Kerja")

**Interfaces:**

- Consumes (semuanya sudah ada di `AddOrEdit.tsx`): `ok()` (useFetch save), `qrLogin(): QrLogin | null`, `setQrLogin`, `qrOpen(): boolean`, `setQrOpen`, `parseQrError(msg): QrLogin | null`, `setAddition("qrcode_state", state)`, `setCreatedId`, `handleResp(resp, success, fail, true, false)`, `notify`, `to(path, false, { replace: true })`, `t(key)`, `useT()`.
- Produces: tidak ada (fitur self-contained; tidak ada konsumen baru).

**Catatan testing:** project `web/` tidak punya harness test komponen (`pnpm test` hanya util non-UI). Verifikasi = `pnpm lint` + `pnpm build` + smoke browser live. JANGAN membuat harness test di task ini.

- [ ] **Step 1: Tambah key i18n en + id**

`web/src/lang/en/drivers.json`, di blok `Terabox` (di sekitar `"qr_login"` dan `"qr_login_title"` yang sudah ada):

```json
"qr_login": "Scan the QR code with the TeraBox app, then confirm the login on the phone. This page checks automatically and closes by itself once the login succeeds.",
"qr_login_title": "TeraBox QR login",
"qr_checking": "Checking for confirmation in the TeraBox app…",
"qr_refreshed": "The previous QR code expired and a new one was issued. Scan the new code.",
```

`web/src/lang/id/drivers.json`, blok yang sama:

```json
"qr_login": "Scan QR code dengan app TeraBox, lalu konfirmasi login di ponsel. Halaman ini memeriksa otomatis dan menutup sendiri begitu login berhasil.",
"qr_login_title": "Login QR TeraBox",
"qr_checking": "Memeriksa konfirmasi di app TeraBox…",
"qr_refreshed": "QR sebelumnya kedaluwarsa dan sudah diterbitkan ulang. Scan QR yang baru.",
```

(Pertahankan key lain di blok tersebut apa adanya; `qr_login` LAMA diganti copy-nya karena "click Add again" sudah tidak berlaku.)

- [ ] **Step 2: Implementasikan loop + status di `AddOrEdit.tsx`**

Import: tambah `createEffect` dari `solid-js` dan `Spinner` dari `@hope-ui/solid`.

Setelah deklarasi `const [qrOpen, setQrOpen] = createSignal(false)` (±line 140), tambahkan:

```tsx
const [qrStatus, setQrStatus] = createSignal<"scan" | "checking">("scan")
let qrLoopActive = false
```

Tambahkan fungsi (letakkan setelah blok `useFetch` `ok`):

```tsx
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// One save/poll round: sends the QR state so the server polls TeraBox.
// Returns the outcome so qrAutoLoop can decide to continue.
const submitQrPoll = async (): Promise<"success" | "refreshed" | "error"> => {
  const qr = qrLogin()
  if (!qr) return "error"
  setQrStatus("checking")
  setAddition("qrcode_state", qr.state)
  const resp = await ok()
  let outcome: "success" | "refreshed" | "error" = "error"
  handleResp(
    resp,
    () => {
      outcome = "success"
      qrLoopActive = false
      setQrOpen(false)
      notify.success(t("global.save_success"))
      to("/@manage/storages", false, { replace: true })
    },
    (msg, code) => {
      const fresh = parseQrError(msg)
      if (fresh) {
        outcome = "refreshed"
        setQrLogin(fresh)
        setAddition("qrcode_state", fresh.state)
        if (resp.data?.id) {
          setCreatedId(resp.data.id)
        }
        setQrStatus("scan")
        notify.info(t("drivers.config.Terabox.qr_refreshed"))
        if (qrLoopActive) {
          setQrOpen(true)
        }
        return
      }
      outcome = "error"
      qrLoopActive = false
      setQrStatus("scan")
      notify.error(msg)
      if (resp.data?.id) {
        to(`/@manage/storages/edit/${resp.data.id}`)
      }
    },
    true,
    false,
  )
  return outcome
}

// While the QR modal is open, keep polling: once the user confirms in the
// TeraBox app, the active poll returns success and the modal closes itself.
const qrAutoLoop = async () => {
  if (qrLoopActive) return
  qrLoopActive = true
  while (qrLoopActive && qrOpen() && qrLogin()) {
    const outcome = await submitQrPoll()
    if (!qrLoopActive || outcome !== "refreshed") break
    await sleep(1000)
  }
}

createEffect(() => {
  if (qrOpen() && qrLogin()) {
    void qrAutoLoop()
  } else {
    qrLoopActive = false
  }
})
```

Ubah handler sukses tombol Save manual: di callback suksesnya tambah `setQrOpen(false)` sebelum `to(...)` (defensif; cabang lain TIDAK disentuh).

Ubah Modal QR: `onClose` dan tombol Close memanggil `() => { qrLoopActive = false; setQrOpen(false) }`. Di `ModalBody`, tampilkan status:

```tsx
<VStack spacing="$3" alignItems="center">
  <img
    src={qrLogin()?.qrImage}
    alt="TeraBox QR login"
    style={{ "max-width": "360px", width: "100%" }}
  />
  <HStack spacing="$2">
    <Show when={qrStatus() === "checking"}>
      <Spinner size="sm" />
    </Show>
    <Box as="p" fontSize="$sm" textAlign="center">
      {qrStatus() === "checking"
        ? t("drivers.config.Terabox.qr_checking")
        : t("drivers.config.Terabox.qr_login")}
    </Box>
  </HStack>
</VStack>
```

- [ ] **Step 3: Lint + build**

Run (workdir `web/`): `pnpm lint`
Expected: no error (exit 0).
Run: `pnpm build`
Expected: build sukses, `dist/` ter-update.

- [ ] **Step 4: Smoke live (browser + log server)**

Server menyajikan `web/dist` dari disk — tanpa restart. Dengan browser (browse MCP) buka `http://127.0.0.1:5244/@manage/storages/edit/36` (storage Terabox cookie-less; login admin bila diminta):

- Popup QR terbuka otomatis (state tersimpan di DB).
- Log server (`%APPDATA%\Gofile Desktop\data\log\log.log`) menampilkan `POST /api/admin/storage/update` berulang, masing-masing dijawab `need verify` setelah ≤90s — sekuensial, tidak paralel.
- Selama request berjalan, popup menampilkan spinner + "Memeriksa konfirmasi di app TeraBox…"; setelah jawaban, QR image berganti (state baru) + toast info "QR diperbarui".
- Tutup popup → request berikutnya tidak jalan lagi; response in-flight TIDAK membuka ulang modal.
- Path sukses (close otomatis + toast sukses + pindah ke daftar storage) tidak bisa dites tanpa konfirmasi ponsel user — tandai sebagai langkah terakhir user.

- [ ] **Step 5: Dokumentasi (wajib workspace)**

- `web/CHANGELOG.md` bawah `## [Unreleased]` kategori `Fixed`: entri singkat — popup QR login Terabox kini aktif (auto-poll, close sendiri saat sukses, status "memeriksa…", QR baru otomatis saat window habis); sebelumnya pasif dan user tidak tahu hasil konfirmasi app.
- `CATATAN.md` (root workspace) tambah entri "Riwayat Kerja" (Bahasa Indonesia): gejala, akar masalah (popup pasif; server hanya poll saat request save hidup), fix (Approach A auto-poll), verifikasi (lint/build/smoke + log), file yang disentuh, link spec + plan.

- [ ] **Step 6: Commit**

```bash
git add src/pages/manage/storages/AddOrEdit.tsx src/lang/en/drivers.json src/lang/id/drivers.json CHANGELOG.md docs/superpowers/specs/2026-11-24-terabox-qr-popup-autopoll-design.md docs/superpowers/plans/2026-11-24-terabox-qr-popup-autopoll.md
git commit -m "feat(terabox): auto-poll QR login popup with live status"
```

(CATATAN.md ada di repo workspace terpisah — tidak ikut commit repo `web/`.)
