import {
  Alert,
  AlertIcon,
  Box,
  Button,
  Heading,
  HStack,
  Modal,
  ModalBody,
  ModalContent,
  ModalFooter,
  ModalHeader,
  ModalOverlay,
  Spinner,
  VStack,
} from "@hope-ui/solid"
import {
  createEffect,
  createMemo,
  createSignal,
  For,
  onCleanup,
  Show,
} from "solid-js"
import { MaybeLoading, ModalInput } from "~/components"
import { useFetch, useRouter, useT } from "~/hooks"
import { handleResp, joinBase, notify, r } from "~/utils"
import {
  Addition,
  DriverConfig,
  DriverItem,
  PResp,
  QrLoginState,
  Storage,
  Type,
} from "~/types"
import { createStore, produce } from "solid-js/store"
import { Item } from "./Item"
import { ResponsiveGrid } from "../common/ResponsiveGrid"

interface DriverInfo {
  common: DriverItem[]
  additional: DriverItem[]
  config: DriverConfig
}

function GetDefaultValue(type: Type, value?: string) {
  switch (type) {
    case Type.Bool:
      if (value) {
        return value === "true"
      }
      return false
    case Type.Number:
      if (value) {
        return parseInt(value)
      }
      return 0
    case Type.Float:
      if (value) {
        return parseFloat(value)
      }
      return 0
    default:
      if (value) {
        return value
      }
      return ""
  }
}

type Drivers = Record<string, DriverInfo>

interface QrLogin {
  qrImage: string
  state: QrLoginState
}

// parseQrError extracts the QR image and login state from the driver Init
// error page ("need verify: \n<body data-state=...><img src=.../>...").
function parseQrError(msg: string): QrLogin | null {
  if (!msg || !msg.includes("data-state")) return null
  const doc = new DOMParser().parseFromString(msg, "text/html")
  const stateRaw = doc.querySelector("[data-state]")?.getAttribute("data-state")
  if (!stateRaw) return null
  let state: QrLoginState
  try {
    state = JSON.parse(stateRaw)
  } catch {
    return null
  }
  const qrImage = state.qrcode || doc.querySelector("img")?.getAttribute("src")
  if (!state.uuid || !state.pcftoken || !qrImage) return null
  return { qrImage, state }
}

const AddOrEdit = () => {
  const t = useT()
  const { params, to } = useRouter()
  const { id } = params
  const [driversLoading, loadDrivers] = useFetch(
    (): PResp<Drivers> => r.get("/admin/driver/list"),
    true,
  )
  const [drivers, setDrivers] = createSignal<Drivers>({})
  const initAdd = async () => {
    const resp = await loadDrivers()
    handleResp(resp, setDrivers)
  }

  const [storageLoading, loadStorage] = useFetch(
    (): PResp<Storage> => r.get(`/admin/storage/get?id=${id}`),
    true,
  )
  const [driverLoading, loadDriver] = useFetch(
    (): PResp<DriverInfo> =>
      r.get(`/admin/driver/info?driver=${storage.driver}`),
    true,
  )
  const initEdit = async () => {
    const storageResp = await loadStorage()
    handleResp(storageResp, async (storageData) => {
      const additionData = JSON.parse(storageData.addition)
      setStorage(storageData)
      setAddition(additionData)
      // Show the stored QR (pending QR login) for storages without a cookie.
      if (!additionData.cookie && additionData.qrcode_state?.qrcode) {
        setQrLogin({
          qrImage: additionData.qrcode_state.qrcode,
          state: additionData.qrcode_state,
        })
        setQrOpen(true)
      }
      const driverResp = await loadDriver()
      handleResp(driverResp, (driverData) =>
        setDrivers({ [storage.driver]: driverData }),
      )
    })
  }
  if (id) {
    initEdit()
  } else {
    initAdd()
  }
  const [storage, setStorage] = createStore<Storage>({} as Storage)
  const [addition, setAddition] = createStore<Addition>({})
  const [qrLogin, setQrLogin] = createSignal<QrLogin | null>(null)
  const [qrOpen, setQrOpen] = createSignal(false)
  const [qrStatus, setQrStatus] = createSignal<"scan" | "checking">("scan")
  let qrLoopActive = false
  let qrDisposed = false
  const [createdId, setCreatedId] = createSignal<number | null>(null)
  const [okLoading, ok] = useFetch((): PResp<{ id: number }> => {
    setStorage("addition", JSON.stringify(addition))
    // A QR flow creates the storage on the first click; the next clicks must
    // update that row instead of creating a duplicate.
    const targetId = id ? Number(id) : createdId()
    if (targetId) {
      setStorage("id", targetId)
    }
    return r.post(`/admin/storage/${targetId ? "update" : "create"}`, storage)
  })

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
        if (!qrDisposed) {
          to("/@manage/storages", false, { replace: true })
        }
      },
      (msg, code) => {
        const fresh = parseQrError(msg)
        if (fresh) {
          outcome = "refreshed"
          // The server keeps the same QR session across save windows; a toast
          // is only warranted when the session (uuid) truly changed.
          const renewed = fresh.state.uuid !== qr.state.uuid
          setQrLogin(fresh)
          setAddition("qrcode_state", fresh.state)
          if (resp.data?.id) {
            setCreatedId(resp.data.id)
          }
          setQrStatus("scan")
          if (renewed && qrLoopActive && !qrDisposed) {
            notify.info(t("drivers.config.Terabox.qr_refreshed"))
          }
          if (qrLoopActive) {
            setQrOpen(true)
          }
          return
        }
        outcome = "error"
        qrLoopActive = false
        setQrOpen(false)
        setQrStatus("scan")
        notify.error(msg)
        if (resp.data?.id && !qrDisposed) {
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
  // Disposal stops the effect from re-running, but not the in-flight async
  // closure: clear the flag on unmount so a late QR response cannot reopen
  // the modal or keep polling from an unmounted component.
  onCleanup(() => {
    qrDisposed = true
    qrLoopActive = false
  })

  const alert = createMemo(() => {
    const i = drivers()[storage.driver]?.config.alert
    console.log(i)
    if (i) {
      return i.split("|")[0]
    }
  })
  const [exportOpened, setExportOpened] = createSignal(false)
  const [importOpened, setImportOpened] = createSignal(false)
  return (
    <MaybeLoading
      loading={id ? storageLoading() || driverLoading() : driversLoading()}
    >
      <Heading mb="$2">{t(`global.${id ? "edit" : "add"}`)}</Heading>
      <VStack mb="$2" spacing="$2">
        <Item
          name="driver"
          default=""
          readonly={id !== undefined}
          required
          searchable
          type={Type.Select}
          options={id ? storage.driver : Object.keys(drivers()).join(",")}
          value={storage.driver}
          full_name_path="storages.common.driver"
          options_prefix="drivers.drivers"
          driver="drivers"
          onChange={(value) => {
            for (const item of drivers()[value].common) {
              setStorage(
                item.name as keyof Storage,
                GetDefaultValue(item.type, item.default) as any,
              )
            }
            // clear addition first
            setAddition(
              produce((addition) => {
                for (const key in addition) {
                  delete addition[key]
                }
              }),
            )
            for (const item of drivers()[value].additional) {
              setAddition(
                item.name,
                GetDefaultValue(item.type, item.default) as any,
              )
            }
            setStorage("driver", value)
          }}
        />
        <Show when={alert()}>
          <Alert status={alert() as any} w="$full">
            <AlertIcon />
            {t(`drivers.config.${storage.driver}.alert`)}
          </Alert>
        </Show>
      </VStack>
      <ResponsiveGrid>
        <Show when={drivers()[storage.driver]}>
          <For each={drivers()[storage.driver].common}>
            {(item) => (
              <Item
                {...(item as any)}
                driver="common"
                value={(storage as any)[item.name]}
                onChange={(val: any) => {
                  setStorage(item.name as keyof Storage, val)
                }}
              />
            )}
          </For>
          <For each={drivers()[storage.driver].additional}>
            {(item) => (
              <Item
                {...(item as any)}
                driver={storage.driver}
                value={addition[item.name] as any}
                onChange={(val: any) => {
                  setAddition(item.name, val)
                }}
              />
            )}
          </For>
        </Show>
      </ResponsiveGrid>
      <HStack
        mt="$2"
        spacing="$2"
        gap="$2"
        w="$full"
        wrap={{
          "@initial": "wrap",
          "@md": "unset",
        }}
      >
        <Button
          loading={okLoading()}
          onClick={async () => {
            if (drivers()[storage.driver].config.need_ms) {
              notify.info(t("manage.add_storage-tips"))
              window.open(joinBase("/@manage/messenger"), "_blank")
            }
            if (qrLogin()) {
              // QR is shown: send the state so the server polls after the
              // user scanned and confirmed in the TeraBox app.
              setAddition("qrcode_state", qrLogin()!.state)
            }
            const resp = await ok()
            // TODO maybe can use handleRrespWithNotifySuccess
            handleResp(
              resp,
              () => {
                setQrOpen(false)
                notify.success(t("global.save_success"))
                to("/@manage/storages", false, { replace: true })
              },
              (msg, code) => {
                const qr = parseQrError(msg)
                if (qr) {
                  // Stay on this page: show the QR image under the Add button
                  // and remember the created id so the next Add click updates
                  // that storage instead of creating a duplicate.
                  setQrLogin(qr)
                  setQrOpen(true)
                  setAddition("qrcode_state", qr.state)
                  if (resp.data?.id) {
                    setCreatedId(resp.data.id)
                  }
                  return
                }
                notify.error(msg)
                if (resp.data?.id) {
                  to(`/@manage/storages/edit/${resp.data.id}`)
                }
              },
              true,
              false,
            )
          }}
        >
          {t(`global.${id ? "save" : "add"}`)}
        </Button>
        <Button
          colorScheme="accent"
          loading={okLoading()}
          onClick={async () => {
            setExportOpened(true)
          }}
        >
          {t("storages.common.export")}
        </Button>
        <Button
          colorScheme="primary"
          loading={okLoading()}
          onClick={async () => {
            setImportOpened(true)
          }}
        >
          {t("storages.common.import")}
        </Button>
      </HStack>
      <Show when={exportOpened()}>
        <ModalInput
          opened={exportOpened()}
          onClose={() => setExportOpened(false)}
          title={t("storages.common.export_title")}
          type="text"
          tips={t("storages.common.export_tips")}
          defaultValue={JSON.stringify(storage)}
          onSubmit={() => {
            setExportOpened(false)
          }}
        />
      </Show>
      <ModalInput
        opened={importOpened()}
        onClose={() => setImportOpened(false)}
        title={t("storages.common.import_title")}
        type="text"
        tips={t("storages.common.import_tips")}
        onSubmit={(text: string) => {
          try {
            const { id, disabled, modified, status, ...obj }: Storage =
              JSON.parse(text)
            setStorage(obj)
            setAddition(JSON.parse(obj.addition))
            setImportOpened(false)
            notify.success(t("storages.common.import_success"))
          } catch (e: any) {
            notify.error(`Invalid storage format: ${e.message}`)
          }
        }}
      />
      <Modal
        opened={qrOpen()}
        onClose={() => {
          qrLoopActive = false
          setQrOpen(false)
        }}
      >
        <ModalOverlay />
        <ModalContent>
          <ModalHeader>
            {t("drivers.config.Terabox.qr_login_title")}
          </ModalHeader>
          <ModalBody>
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
          </ModalBody>
          <ModalFooter>
            <Button
              colorScheme="neutral"
              onClick={() => {
                qrLoopActive = false
                setQrOpen(false)
              }}
            >
              {t("global.close")}
            </Button>
          </ModalFooter>
        </ModalContent>
      </Modal>
    </MaybeLoading>
  )
}

export default AddOrEdit
