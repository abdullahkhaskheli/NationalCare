import { useEffect, useRef, useState } from "react";
import { Plus, QrCode, Download, Pill, Camera, ScanLine } from "lucide-react";
import QRCode from "qrcode";
import type { IScannerControls } from "@zxing/browser";
import { command, useRows, type Row } from "./api";
import {
  useL,
  Button,
  Field,
  Form,
  Notice,
  Badge,
  Empty,
  Modal,
  DataState,
  DateText,
} from "./ui";
import { exportPdf } from "./pdf";
const medicineBlank = () => ({
  medicine: "",
  strength: "",
  dose: "",
  route: "",
  frequency: "",
  duration: "",
  quantity: 1,
  instructions: "",
});
export const dispensingStatus = (quantity: number, dispensed: number) =>
  dispensed >= quantity
    ? "dispensed"
    : dispensed > 0
      ? "partially_dispensed"
      : "not_dispensed";
export function Prescriptions({
  patientId,
  facilityId,
  role,
}: {
  patientId: string;
  facilityId: string;
  role: string;
}) {
  const { T, L, lang } = useL();
  const facilities = useRows("facilities");
  const data = useRows(
    "prescriptions",
    patientId ? { patient_id: patientId } : {},
    role === "pharmacy" || !!patientId,
  );
  const items = useRows(
      "prescription_items",
      { prescription_id: data.rows.map((r) => r.id) },
      data.rows.length > 0,
    ),
    dispenses = useRows(
      "dispense_items",
      { prescription_item_id: items.rows.map((r) => r.id) },
      items.rows.length > 0,
    ),
    patients = useRows("patients", { id: patientId }, !!patientId),
    stock = useRows(
      "stock",
      { facility_id: facilityId },
      role === "pharmacy" && !!facilityId,
    );
  const [creating, setCreating] = useState(false),
    [meds, setMeds] = useState<Row[]>([medicineBlank()]),
    [qr, setQr] = useState<{
      image: string;
      token: string;
      expiry: string;
    } | null>(null),
    [selected, setSelected] = useState<Row | null>(null),
    [cancelRx, setCancelRx] = useState<Row | null>(null),
    [err, setErr] = useState("");
  async function makeQr(id: string) {
    try {
      const r = await command("prescription_qr", { id });
      setQr({
        image: await QRCode.toDataURL(
          window.location.origin + "/#workspace/pharmacy/scan?rx=" + r.token,
          { width: 300, margin: 2 },
        ),
        token: r.token,
        expiry: r.expires_at,
      });
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  function done(id: string) {
    return dispenses.rows
      .filter((d) => d.prescription_item_id === id)
      .reduce((s, d) => s + d.quantity, 0);
  }
  return (
    <>
      {err && <Notice>{err}</Notice>}
      <div className="toolbar">
        <p>
          {L(
            "Prescribed and dispensed medicines are recorded separately.",
            "تجویز اور فراہمی کا ریکارڈ الگ رکھا جاتا ہے۔",
            "تُسجَّل الأدوية الموصوفة والمصروفة بشكل منفصل.",
          )}
        </p>
        {role === "doctor" && (
          <Button
            disabled={!patientId || !facilityId}
            onClick={() => {
              setMeds([medicineBlank()]);
              setCreating(true);
            }}
          >
            <Plus size={17} />
            {T("submitPrescription")}
          </Button>
        )}
      </div>
      <DataState {...data}>
        {!data.rows.length ? (
          <Empty />
        ) : (
          <div className="rx-list">
            {data.rows.map((rx) => {
              const lines = items.rows.filter(
                (i) => i.prescription_id === rx.id,
              );
              const quantity = lines.reduce((s, i) => s + i.quantity, 0),
                supplied = lines.reduce((s, i) => s + done(i.id), 0);
              return (
                <article className="panel rx-card" key={rx.id}>
                  <div className="rx-heading">
                    <div className="row">
                      <span className="icon-tile">
                        <Pill />
                      </span>
                      <div>
                        <h3>{T("prescriptions")}</h3>
                        <DateText value={rx.created_at} />
                      </div>
                    </div>
                    <Badge
                      status={
                        rx.status === "cancelled"
                          ? "cancelled"
                          : dispensingStatus(quantity || 1, supplied)
                      }
                    />
                  </div>
                  <div className="table-scroll">
                    <table>
                      <thead>
                        <tr>
                          {[
                            "medicine",
                            "dose",
                            "frequency",
                            "duration",
                            "quantity",
                            "remaining",
                          ].map((k) => (
                            <th key={k}>{T(k)}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((i) => (
                          <tr key={i.id}>
                            <td>
                              <strong>{i.medicine}</strong>
                              <small>
                                {i.strength} · {i.route}
                              </small>
                            </td>
                            <td>{i.dose}</td>
                            <td>{i.frequency}</td>
                            <td>{i.duration}</td>
                            <td>{i.quantity}</td>
                            <td>{i.quantity - done(i.id)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {rx.notes && <p>{rx.notes}</p>}
                  <small>
                    {T("validUntil")}: <DateText value={rx.valid_until} />
                  </small>
                  {rx.cancellation_reason && (
                    <Notice>{rx.cancellation_reason}</Notice>
                  )}
                  <div className="row wrap rx-actions">
                    {["patient", "doctor"].includes(role) &&
                      rx.status === "issued" && (
                        <Button
                          variant="secondary"
                          onClick={() => makeQr(rx.id)}
                        >
                          <QrCode size={17} />
                          {T("qr")}
                        </Button>
                      )}
                    <Button
                      variant="ghost"
                      onClick={async () => {
                        try {
                          let qrImage;
                          if (
                            ["patient", "doctor"].includes(role) &&
                            rx.status === "issued"
                          ) {
                            const q = await command("prescription_qr", {
                              id: rx.id,
                            });
                            qrImage = await QRCode.toDataURL(
                              window.location.origin +
                                "/#workspace/pharmacy/scan?rx=" +
                                q.token,
                            );
                          }
                          await exportPdf(
                            T("prescriptions"),
                            patients.rows[0] || {},
                            [
                              {
                                title: `${T("reference")}: ${rx.id}`,
                                lines: [
                                  new Date(rx.created_at).toLocaleString(),
                                  `${T("status")}: ${T(rx.status)}`,
                                  `${T("validUntil")}: ${rx.valid_until}`,
                                ],
                              },
                              ...lines.map((i) => ({
                                title: `${i.medicine} · ${i.strength}`,
                                lines: [
                                  `${T("dose")}: ${i.dose} · ${i.route}`,
                                  `${T("frequency")}: ${i.frequency} · ${T("duration")}: ${i.duration}`,
                                  `${T("quantity")}: ${i.quantity} · ${T("remaining")}: ${i.quantity - done(i.id)}`,
                                  i.instructions || "",
                                ],
                              })),
                              { title: T("note"), lines: [rx.notes] },
                            ],
                            lang,
                            {
                              facility: facilities.rows.find(
                                (f) => f.id === rx.facility_id,
                              ),
                              qr: qrImage,
                            },
                          );
                        } catch (e) {
                          setErr((e as Error).message);
                        }
                      }}
                    >
                      <Download size={17} />
                      {T("download")}
                    </Button>
                    {role === "doctor" && rx.status === "issued" && (
                      <Button
                        variant="ghost danger"
                        onClick={() => setCancelRx(rx)}
                      >
                        {T("cancel")}
                      </Button>
                    )}
                    {role === "pharmacy" &&
                      rx.status === "issued" &&
                      supplied < quantity && (
                        <Button
                          disabled={!facilityId}
                          onClick={() => setSelected(rx)}
                        >
                          {T("dispense")}
                        </Button>
                      )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </DataState>
      {data.hasMore && <Button onClick={data.more}>{T("more")}</Button>}
      {creating && (
        <Modal
          title={T("submitPrescription")}
          onClose={() => setCreating(false)}
        >
          <Form
            onSubmit={async (d) => {
              await command("prescribe", {
                patient_id: patientId,
                facility_id: facilityId,
                valid_until: new Date(
                  d.valid_until + "T23:59:59",
                ).toISOString(),
                notes: d.notes,
                items: meds,
              });
              setCreating(false);
            }}
          >
            <Field
              name="valid_until"
              label={T("validUntil")}
              type="date"
              min={new Date().toISOString().slice(0, 10)}
            />
            <Field name="notes" label={T("note")} required={false} />
            <div className="wide medicine-editor">
              {meds.map((m, index) => (
                <fieldset key={index}>
                  <legend>
                    {T("medicine")} {index + 1}
                  </legend>
                  <div className="form">
                    {[
                      "medicine",
                      "strength",
                      "dose",
                      "route",
                      "frequency",
                      "duration",
                      "quantity",
                      "instructions",
                    ].map((k) => (
                      <label className="field" key={k}>
                        <span>{T(k)}</span>
                        <input
                          required={k !== "instructions"}
                          type={k === "quantity" ? "number" : "text"}
                          min={k === "quantity" ? 1 : undefined}
                          max={k === "quantity" ? 10000 : undefined}
                          value={m[k]}
                          onChange={(e) =>
                            setMeds((prev) =>
                              prev.map((v, j) =>
                                j === index
                                  ? {
                                      ...v,
                                      [k]:
                                        k === "quantity"
                                          ? Number(e.target.value)
                                          : e.target.value,
                                    }
                                  : v,
                              ),
                            )
                          }
                        />
                      </label>
                    ))}
                  </div>
                  {meds.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost danger"
                      onClick={() =>
                        setMeds((prev) => prev.filter((_, j) => j !== index))
                      }
                    >
                      {T("remove")}
                    </Button>
                  )}
                </fieldset>
              ))}
              <Button
                type="button"
                variant="secondary"
                disabled={meds.length >= 30}
                onClick={() => setMeds((prev) => [...prev, medicineBlank()])}
              >
                <Plus size={17} />
                {T("addMedicine")}
              </Button>
            </div>
          </Form>
        </Modal>
      )}
      {qr && (
        <Modal title={T("qr")} onClose={() => setQr(null)}>
          <div className="qr-panel">
            <img src={qr.image} alt={T("qr")} />
            <p>
              {L(
                "Show this code to your pharmacist. It grants access to this prescription.",
                "یہ کوڈ فارماسسٹ کو دکھائیں۔ یہ اس نسخے تک رسائی دیتا ہے۔",
                "أظهر هذا الرمز للصيدلي. يمنح الوصول إلى هذه الوصفة.",
              )}
            </p>
            <small>
              {T("validUntil")}: <DateText value={qr.expiry} />
            </small>
            <details>
              <summary>{L("Manual code", "دستی کوڈ", "الرمز اليدوي")}</summary>
              <code className="break">{qr.token}</code>
            </details>
          </div>
        </Modal>
      )}
      {cancelRx && (
        <Modal title={T("cancel")} onClose={() => setCancelRx(null)}>
          <Form
            onSubmit={async (d) => {
              await command("cancel_prescription", {
                id: cancelRx.id,
                reason: d.reason,
              });
              setCancelRx(null);
            }}
          >
            <Field name="reason" label={T("note")} type="textarea" />
          </Form>
        </Modal>
      )}
      {selected && (
        <Modal title={T("dispense")} onClose={() => setSelected(null)}>
          <DispenseForm
            rx={selected}
            items={items.rows.filter((i) => i.prescription_id === selected.id)}
            stock={stock.rows}
            done={done}
            facilityId={facilityId}
            onDone={() => setSelected(null)}
          />
        </Modal>
      )}
    </>
  );
}
function DispenseForm({
  rx,
  items,
  stock,
  done,
  facilityId,
  onDone,
}: {
  rx: Row;
  items: Row[];
  stock: Row[];
  done: (id: string) => number;
  facilityId: string;
  onDone: () => void;
}) {
  const { T, L } = useL();
  const request = useRef(crypto.randomUUID());
  return (
    <Form
      onSubmit={async (d) => {
        const selected = items
          .map((i) => ({
            item_id: i.id,
            stock_id: d["stock_" + i.id],
            quantity: Number(d["qty_" + i.id]),
          }))
          .filter((i) => i.stock_id && i.quantity > 0);
        if (!selected.length)
          throw new Error(
            L(
              "Select stock and quantities.",
              "ذخیرہ اور مقدار منتخب کریں۔",
              "حدد المخزون والكميات.",
            ),
          );
        await command("dispense", {
          prescription_id: rx.id,
          facility_id: facilityId,
          request_id: request.current,
          items: selected,
        });
        onDone();
      }}
    >
      {items.map((i) => {
        const available = stock.filter(
          (s) =>
            s.medicine.toLowerCase() === i.medicine.toLowerCase() &&
            s.strength.toLowerCase() === i.strength.toLowerCase() &&
            s.quantity > 0 &&
            s.expires_on > new Date().toISOString().slice(0, 10),
        );
        return (
          <fieldset className="wide" key={i.id}>
            <legend>
              {i.medicine} · {i.strength} · {T("remaining")}:{" "}
              {i.quantity - done(i.id)}
            </legend>
            <div className="form">
              <Field
                name={"stock_" + i.id}
                label={T("batch")}
                required={false}
                options={available.map((s) => ({
                  value: s.id,
                  label: `${s.batch} · ${s.expires_on} · ${s.quantity}`,
                }))}
              />
              <Field
                name={"qty_" + i.id}
                label={T("quantity")}
                type="number"
                min={0}
                max={i.quantity - done(i.id)}
                defaultValue="0"
              />
            </div>
            {!available.length && (
              <p>
                {L(
                  "No matching stock available.",
                  "متعلقہ دوا کا ذخیرہ دستیاب نہیں۔",
                  "لا يتوفر مخزون مطابق.",
                )}
              </p>
            )}
          </fieldset>
        );
      })}
    </Form>
  );
}
export function Scanner({ onResolved }: { onResolved: (data: Row) => void }) {
  const { T, L } = useL();
  const video = useRef<HTMLVideoElement>(null),
    controls = useRef<IScannerControls | null>(null);
  const [scanning, setScanning] = useState(false),
    [error, setError] = useState(""),
    [result, setResult] = useState<Row | null>(null);
  useEffect(() => () => controls.current?.stop(), []);
  const resolve = async (value: string) => {
    const token = value.includes("rx=")
      ? value.split("rx=")[1].split("&")[0]
      : value.trim();
    const r = await command("scan_prescription", { token });
    setResult(r);
    onResolved(r);
    controls.current?.stop();
    setScanning(false);
  };
  return (
    <div className="panel narrow">
      <span className="icon-tile">
        <ScanLine />
      </span>
      <h2>{T("scan")}</h2>
      <p>
        {L(
          "Scan the patient’s prescription or enter its secure code.",
          "نسخہ اسکین کریں یا محفوظ کوڈ درج کریں۔",
          "امسح وصفة المريض أو أدخل رمزها الآمن.",
        )}
      </p>
      {error && <Notice>{error}</Notice>}
      <video
        ref={video}
        className={scanning ? "scanner-video" : "hidden"}
        muted
        playsInline
      />
      <Button
        variant="secondary"
        onClick={async () => {
          if (scanning) {
            controls.current?.stop();
            setScanning(false);
            return;
          }
          setScanning(true);
          setError("");
          try {
            const { BrowserQRCodeReader } = await import("@zxing/browser");
            controls.current =
              await new BrowserQRCodeReader().decodeFromVideoDevice(
                undefined,
                video.current!,
                async (r) => {
                  if (r) {
                    controls.current?.stop();
                    try {
                      await resolve(r.getText());
                    } catch (e) {
                      setError((e as Error).message);
                      setScanning(false);
                    }
                  }
                },
              );
          } catch (e) {
            setError((e as Error).message);
            setScanning(false);
          }
        }}
      >
        <Camera size={18} />
        {scanning ? T("cancel") : T("scan")}
      </Button>
      <Form onSubmit={async (d) => resolve(d.token)}>
        <Field
          name="token"
          label={L(
            "Prescription code or link",
            "نسخے کا کوڈ یا لنک",
            "رمز الوصفة أو رابطها",
          )}
          defaultValue={
            new URLSearchParams(window.location.hash.split("?")[1] || "").get(
              "rx",
            ) || ""
          }
        />
      </Form>
      {result && (
        <div className="scan-result">
          <h3>{result.patient_name}</h3>
          <code>{result.health_id}</code>
          {result.allergies?.map((a: Row, i: number) => (
            <Notice key={i}>
              {T("allergy")}: {a.title} — {a.body}
            </Notice>
          ))}
        </div>
      )}
    </div>
  );
}
export function Stock({ facilityId }: { facilityId: string }) {
  const { T } = useL();
  const data = useRows("stock", { facility_id: facilityId }, !!facilityId);
  const [adding, setAdding] = useState(false);
  return (
    <>
      <div className="toolbar">
        <h3>{T("stock")}</h3>
        <Button disabled={!facilityId} onClick={() => setAdding(true)}>
          <Plus size={17} />
          {T("new")}
        </Button>
      </div>
      <DataState {...data}>
        {data.rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {["medicine", "strength", "batch", "expiry", "quantity"].map(
                    (k) => (
                      <th key={k}>{T(k)}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((s) => (
                  <tr key={s.id}>
                    <td>{s.medicine}</td>
                    <td>{s.strength}</td>
                    <td>{s.batch}</td>
                    <td>{s.expires_on}</td>
                    <td>
                      {s.quantity} {s.unit}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <Empty />
        )}
      </DataState>
      {adding && (
        <Modal title={T("stock")} onClose={() => setAdding(false)}>
          <Form
            onSubmit={async (d) => {
              await command("stock_add", {
                ...d,
                facility_id: facilityId,
                quantity: Number(d.quantity),
              });
              setAdding(false);
            }}
          >
            <Field name="medicine" />
            <Field name="strength" />
            <Field name="batch" />
            <Field name="expires_on" label={T("expiry")} type="date" />
            <Field name="quantity" type="number" min={1} />
            <Field name="unit" />
          </Form>
        </Modal>
      )}
    </>
  );
}
