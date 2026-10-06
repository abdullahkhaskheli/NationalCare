import { useEffect, useState } from "react";
import { Plus, ArrowUpRight, Check, Mail, ClipboardList } from "lucide-react";
import { command, db, useRows, type Row } from "./api";
import { portalDefs, workDefs, label, pick } from "./catalog";
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
export function Appointments({
  patientId,
  facilityId,
  role,
}: {
  patientId: string;
  facilityId: string;
  role: string;
}) {
  const { T, L } = useL();
  const data = useRows(
    "appointments",
    role === "patient"
      ? { patient_id: patientId }
      : role === "hospital"
        ? { facility_id: facilityId }
        : {},
    role !== "patient" || !!patientId,
  );
  const facilities = useRows("facilities"),
    [modal, setModal] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    [staff, setStaff] = useState<Row[]>([]);
  useEffect(() => {
    if (role === "hospital" && facilityId)
      command("staff_list", { facility_id: facilityId })
        .then(setStaff)
        .catch(() => {});
  }, [role, facilityId]);
  return (
    <>
      <div className="toolbar">
        <p>
          {L(
            "Manage requests, arrival and completed visits.",
            "درخواست، حاضری اور مکمل ملاقاتیں دیکھیں۔",
            "إدارة الطلبات والحضور والزيارات المكتملة.",
          )}
        </p>
        {role === "patient" && (
          <Button disabled={!patientId} onClick={() => setModal(true)}>
            <Plus size={17} />
            {T("booking")}
          </Button>
        )}
      </div>
      <DataState {...data}>
        {data.rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {[
                    "date",
                    "patient",
                    "service",
                    "facility",
                    "status",
                    "actions",
                  ].map((k) => (
                    <th key={k}>{T(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((a) => (
                  <tr key={a.id}>
                    <td>
                      <DateText value={a.starts_at} />
                    </td>
                    <td>
                      <strong>{a.patient?.patient_name || T("loading")}</strong>
                      <small>{a.patient?.health_id}</small>
                      <small dir="ltr">{a.patient?.phone}</small>
                    </td>
                    <td>{a.service}</td>
                    <td>
                      {facilities.rows.find((f) => f.id === a.facility_id)
                        ?.name || a.facility_id}
                    </td>
                    <td>
                      <Badge status={a.status} />
                    </td>
                    <td>
                      {
                        <Button
                          variant="secondary"
                          onClick={() => setSelected(a)}
                        >
                          {T("view")}
                        </Button>
                      }
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
      {modal && (
        <Modal title={T("booking")} onClose={() => setModal(false)}>
          <Form
            onSubmit={async (d) => {
              await command("book_appointment", {
                ...d,
                patient_id: patientId,
                starts_at: new Date(d.starts_at).toISOString(),
              });
              setModal(false);
            }}
          >
            <Field
              name="facility_id"
              label={T("facility")}
              options={facilities.rows
                .filter(
                  (f) =>
                    f.status === "active" &&
                    ["hospital", "clinic"].includes(f.kind),
                )
                .map((f) => ({ value: f.id, label: f.name }))}
            />
            <Field name="starts_at" label={T("date")} type="datetime-local" />
            <Field name="service" />
          </Form>
          <p>
            {L(
              "Only activated facilities accept online appointments.",
              "صرف فعال اداروں میں آن لائن ملاقات دستیاب ہے۔",
              "تقبل المنشآت المفعّلة فقط المواعيد الإلكترونية.",
            )}
          </p>
        </Modal>
      )}
      {selected && (
        <Modal title={T("appointments")} onClose={() => setSelected(null)}>
          <dl className="detail-grid">
            <div>
              <dt>{T("patient")}</dt>
              <dd>{selected.patient?.patient_name}</dd>
            </div>
            <div>
              <dt>{T("healthId")}</dt>
              <dd>{selected.patient?.health_id}</dd>
            </div>
            <div>
              <dt>{T("phone")}</dt>
              <dd dir="ltr">{selected.patient?.phone}</dd>
            </div>
            <div>
              <dt>{T("dob")}</dt>
              <dd>{selected.patient?.dob}</dd>
            </div>
            <div>
              <dt>{T("sex")}</dt>
              <dd>{T(selected.patient?.sex || "unspecified")}</dd>
            </div>
            <div>
              <dt>{T("service")}</dt>
              <dd>{selected.service}</dd>
            </div>
          </dl>
          {!["completed", "cancelled"].includes(selected.status) && (
            <Form
              onSubmit={async (d) => {
                await command("appointment_status", { ...d, id: selected.id });
                setSelected(null);
              }}
            >
              <Field
                name="status"
                options={(role === "patient"
                  ? ["cancelled"]
                  : selected.status === "requested"
                    ? ["confirmed", "cancelled"]
                    : selected.status === "confirmed"
                      ? ["arrived", "cancelled"]
                      : ["completed", "cancelled"]
                ).map((s) => ({ value: s, label: T(s) }))}
              />
              {role === "hospital" && selected.status === "requested" && (
                <Field
                  name="clinician_id"
                  label={T("clinician")}
                  options={staff
                    .filter((s) => s.role === "doctor")
                    .map((s) => ({ value: s.user_id, label: s.full_name }))}
                />
              )}
            </Form>
          )}
        </Modal>
      )}
    </>
  );
}
export function Laboratory({
  patientId,
  role,
}: {
  patientId: string;
  role: string;
}) {
  const { T } = useL();
  const data = useRows(
    "lab_orders",
    role === "doctor" && patientId ? { patient_id: patientId } : {},
  );
  const facilities = useRows("facilities");
  const [modal, setModal] = useState(false),
    [selected, setSelected] = useState<Row | null>(null);
  return (
    <>
      <div className="toolbar">
        <h3>{T("lab")}</h3>
        {role === "doctor" && (
          <Button disabled={!patientId} onClick={() => setModal(true)}>
            <Plus size={17} />
            {T("new")}
          </Button>
        )}
      </div>
      <DataState {...data}>
        {data.rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {["test", "date", "status", "actions"].map((k) => (
                    <th key={k}>{T(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.test}</strong>
                      <small>{r.instructions}</small>
                    </td>
                    <td>
                      <DateText value={r.created_at} />
                    </td>
                    <td>
                      <Badge status={r.status} />
                    </td>
                    <td>
                      {role === "laboratory" &&
                        !["verified", "cancelled"].includes(r.status) && (
                          <Button
                            variant="secondary"
                            onClick={() => setSelected(r)}
                          >
                            {T("view")}
                          </Button>
                        )}
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
      {modal && (
        <Modal title={T("lab")} onClose={() => setModal(false)}>
          <Form
            onSubmit={async (d) => {
              await command("lab_order", { ...d, patient_id: patientId });
              setModal(false);
            }}
          >
            <Field name="test" />
            <Field
              name="facility_id"
              label={T("facility")}
              options={facilities.rows
                .filter((f) => f.status === "active")
                .map((f) => ({ value: f.id, label: f.name }))}
            />
            <Field name="instructions" type="textarea" required={false} />
          </Form>
        </Modal>
      )}
      {selected && (
        <Modal title={selected.test} onClose={() => setSelected(null)}>
          <Form
            onSubmit={async (d) => {
              await command("lab_status", { ...d, id: selected.id });
              setSelected(null);
            }}
          >
            <Field
              name="status"
              options={(selected.status === "ordered"
                ? ["collected", "cancelled"]
                : selected.status === "collected"
                  ? ["processing", "cancelled"]
                  : ["verified"]
              ).map((s) => ({ value: s, label: T(s) }))}
            />
            {selected.status === "processing" && (
              <Field name="result" type="textarea" />
            )}
          </Form>
        </Modal>
      )}
    </>
  );
}
export function Staff({
  facilityId,
  role,
}: {
  facilityId: string;
  role: string;
}) {
  const { T, L, lang } = useL();
  const data = useRows(
      "staff_requests",
      role === "hospital" ? { facility_id: facilityId } : {},
    ),
    facilities = useRows("facilities");
  const [modal, setModal] = useState(false),
    [review, setReview] = useState<Row | null>(null),
    [msg, setMsg] = useState("");
  return (
    <>
      <div className="toolbar">
        <p>
          {L(
            "Hospital request → Ministry approval → invitation → activation.",
            "ہسپتال کی درخواست ← وزارت کی منظوری ← دعوت ← فعالیت۔",
            "طلب المستشفى ← موافقة الوزارة ← دعوة ← تفعيل.",
          )}
        </p>
        <Button onClick={() => setModal(true)}>
          <Plus size={17} />
          {T("staff")}
        </Button>
      </div>
      {msg && <Notice>{msg}</Notice>}
      <DataState {...data}>
        {data.rows.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {["name", "role", "credential", "status", "actions"].map(
                    (k) => (
                      <th key={k}>{T(k)}</th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => (
                  <tr key={r.id}>
                    <td>
                      {r.full_name}
                      <small>{r.email}</small>
                    </td>
                    <td>
                      {pick(
                        portalDefs.find((p) => p.id === r.role)?.name || [
                          r.role,
                          r.role,
                          r.role,
                        ],
                        lang,
                      )}
                    </td>
                    <td>{r.credential}</td>
                    <td>
                      <Badge status={r.status} />
                    </td>
                    <td>
                      <div className="row wrap">
                        {role === "ministry" && r.status === "pending" && (
                          <Button
                            variant="secondary"
                            onClick={() => setReview(r)}
                          >
                            {T("view")}
                          </Button>
                        )}
                        {r.status === "approved" && (
                          <Button
                            variant="secondary"
                            onClick={async () => {
                              if (!db) return;
                              const { data, error } = await db.functions.invoke(
                                "send-staff-invite",
                                {
                                  body: {
                                    request_id: r.id,
                                    redirect_to: window.location.origin,
                                  },
                                },
                              );
                              setMsg(
                                error
                                  ? error.message
                                  : data.message || T("saved"),
                              );
                            }}
                          >
                            <Mail size={15} />
                            {L(
                              "Send invitation",
                              "دعوت بھیجیں",
                              "إرسال الدعوة",
                            )}
                          </Button>
                        )}
                        {["active", "approved"].includes(r.status) && (
                          <Button
                            variant="ghost danger"
                            onClick={async () => {
                              try {
                                await command("staff_revoke", { id: r.id });
                              } catch (e) {
                                setMsg((e as Error).message);
                              }
                            }}
                          >
                            {T("revoke")}
                          </Button>
                        )}
                      </div>
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
      {modal && (
        <Modal title={T("staff")} onClose={() => setModal(false)}>
          <Form
            onSubmit={async (d) => {
              await command("staff_request", {
                ...d,
                facility_id: role === "hospital" ? facilityId : d.facility_id,
              });
              setModal(false);
            }}
          >
            <Field name="full_name" label={T("name")} />
            <Field name="email" type="email" />
            {role === "ministry" && (
              <Field
                name="facility_id"
                label={T("facility")}
                options={facilities.rows
                  .filter((f) => f.status === "active")
                  .map((f) => ({ value: f.id, label: f.name }))}
              />
            )}
            <Field
              name="role"
              options={portalDefs
                .filter(
                  (p) =>
                    ![
                      "public",
                      "patient",
                      "guardian",
                      "ministry",
                      ...(role === "hospital" ? ["hospital", "province"] : []),
                    ].includes(p.id),
                )
                .map((p) => ({ value: p.id, label: pick(p.name, lang) }))}
            />
            <Field name="credential" />
          </Form>
        </Modal>
      )}
      {review && (
        <Modal title={review.full_name} onClose={() => setReview(null)}>
          <p>
            {review.email} · {review.credential}
          </p>
          <Form
            onSubmit={async (d) => {
              await command("staff_review", { ...d, id: review.id });
              setReview(null);
            }}
          >
            <Field
              name="status"
              options={["approved", "rejected"].map((s) => ({
                value: s,
                label: T(s),
              }))}
            />
            <Field name="note" type="textarea" />
          </Form>
        </Modal>
      )}
    </>
  );
}
const transitions: Record<string, string[]> = {
  submitted: ["in_review", "cancelled"],
  in_review: ["approved", "rejected", "needs_information"],
  needs_information: ["in_review"],
  approved: ["in_progress", "cancelled"],
  in_progress: ["completed"],
};
export function Work({
  kind,
  facilityId,
  province,
  patientId,
  role,
}: {
  kind: string;
  facilityId: string;
  province: string;
  patientId: string;
  role: string;
}) {
  const { T, L, lang } = useL();
  const [k, setK] = useState(kind === "requests" ? "complaint" : kind),
    [modal, setModal] = useState(false),
    [selected, setSelected] = useState<Row | null>(null),
    [term, setTerm] = useState("");
  useEffect(() => setK(kind === "requests" ? "complaint" : kind), [kind]);
  const facilities = useRows("facilities");
  const data = useRows("work_items", { kind: k });
  const events = useRows(
    "work_events",
    { work_item_id: selected?.id },
    !!selected,
  );
  const def = workDefs[k];
  const visible = data.rows.filter((r) =>
    `${r.title} ${r.status}`.toLowerCase().includes(term.toLowerCase()),
  );
  const managed = !["patient", "guardian"].includes(role);
  return (
    <>
      <div className="toolbar">
        {kind === "requests" && (
          <select
            aria-label={T("type")}
            value={k}
            onChange={(e) => setK(e.target.value)}
          >
            {["complaint", "claim", "research", "facility_application"].map(
              (k) => (
                <option key={k} value={k}>
                  {label(k, lang)}
                </option>
              ),
            )}
          </select>
        )}
        <input
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          aria-label={T("search")}
          placeholder={T("search")}
        />
        <Button onClick={() => setModal(true)}>
          <Plus size={17} />
          {T("new")}
        </Button>
      </div>
      <DataState {...data}>
        {visible.length ? (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {["title", "date", "status", "actions"].map((k) => (
                    <th key={k}>{T(k)}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((w) => (
                  <tr key={w.id}>
                    <td>
                      <strong>{w.title}</strong>
                      <small>
                        {w.details.category ||
                          w.details.reference ||
                          w.id.slice(0, 8)}
                      </small>
                    </td>
                    <td>
                      <DateText value={w.updated_at} />
                    </td>
                    <td>
                      <Badge status={w.status} />
                    </td>
                    <td>
                      <Button
                        variant="secondary"
                        onClick={() => setSelected(w)}
                      >
                        {T("view")}
                        <ArrowUpRight size={15} />
                      </Button>
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
      {data.hasMore && <Button onClick={data.more}>{T("more")}</Button>}
      {modal && (
        <Modal title={pick(def.name, lang)} onClose={() => setModal(false)}>
          <Form
            onSubmit={async (d) => {
              await command("create_work", {
                kind: k,
                facility_id: facilityId || d.facility_id || null,
                province: province || d.province || "",
                patient_id: patientId || null,
                title: d.title,
                details: { ...d, title: undefined },
              });
              setModal(false);
            }}
          >
            <Field name="title" />
            {!facilityId && ["complaint", "claim", "research"].includes(k) && (
              <Field
                name="facility_id"
                label={T("facility")}
                options={facilities.rows
                  .filter((f) => f.status === "active")
                  .map((f) => ({ value: f.id, label: f.name }))}
              />
            )}
            {def.fields.map((f) => (
              <Field
                key={f}
                name={f}
                type={
                  ["quantity", "amount"].includes(f)
                    ? "number"
                    : ["targetDate", "expiry"].includes(f)
                      ? "date"
                      : "text"
                }
                min={["quantity", "amount"].includes(f) ? 1 : undefined}
                required={f !== "reference"}
              />
            ))}
            <Field name="description" type="textarea" />
            {k === "research" && (
              <p className="wide">
                {L(
                  "Approval authorises a review; it does not automatically release identifiable records.",
                  "منظوری جائزے کی اجازت ہے، شناختی ریکارڈ خودکار جاری نہیں ہوتا۔",
                  "تسمح الموافقة بالمراجعة ولا تُفرج تلقائيًا عن سجلات محددة الهوية.",
                )}
              </p>
            )}
          </Form>
        </Modal>
      )}
      {selected && (
        <Modal title={selected.title} onClose={() => setSelected(null)}>
          <Badge
            status={
              data.rows.find((w) => w.id === selected.id)?.status ||
              selected.status
            }
          />
          <dl className="detail-grid">
            {Object.entries(selected.details).map(([key, value]) => (
              <div key={key}>
                <dt>{T(key)}</dt>
                <dd className="preserve">{String(value)}</dd>
              </div>
            ))}
          </dl>
          <h3>
            {L(
              "Activity and decisions",
              "سرگرمی اور فیصلے",
              "النشاط والقرارات",
            )}
          </h3>
          {events.rows.map((e) => (
            <div className="event" key={e.id}>
              <Badge status={e.status} />
              <DateText value={e.created_at} />
              <p>{e.note}</p>
            </div>
          ))}
          <Form
            onSubmit={async (d) => {
              const current =
                data.rows.find((w) => w.id === selected.id) || selected;
              await command(d.status ? "transition_work" : "work_comment", {
                id: selected.id,
                status: d.status,
                note: d.note,
              });
              setSelected({ ...current, status: d.status || current.status });
            }}
          >
            {managed &&
              transitions[
                data.rows.find((w) => w.id === selected.id)?.status ||
                  selected.status
              ]?.length && (
                <Field
                  name="status"
                  required={false}
                  options={transitions[
                    data.rows.find((w) => w.id === selected.id)?.status ||
                      selected.status
                  ].map((s) => ({ value: s, label: T(s) }))}
                />
              )}
            <Field name="note" type="textarea" />
          </Form>
        </Modal>
      )}
    </>
  );
}
export function Facilities({ role }: { role: string }) {
  const { T } = useL();
  const data = useRows("facilities");
  const [err, setErr] = useState("");
  return (
    <>
      {err && <Notice>{err}</Notice>}
      <DataState {...data}>
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {["name", "city", "status", "actions"].map((k) => (
                  <th key={k}>{T(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((f) => (
                <tr key={f.id}>
                  <td>{f.name}</td>
                  <td>{f.city}</td>
                  <td>
                    <Badge status={f.status} />
                  </td>
                  <td>
                    {role === "ministry" && (
                      <Button
                        variant="secondary"
                        onClick={async () => {
                          try {
                            await command("facility_status", {
                              id: f.id,
                              status:
                                f.status === "active" ? "suspended" : "active",
                            });
                          } catch (e) {
                            setErr((e as Error).message);
                          }
                        }}
                      >
                        {T(f.status === "active" ? "suspended" : "approve")}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </DataState>
    </>
  );
}
export function Audit() {
  const { T } = useL();
  const data = useRows("audit_events");
  return (
    <DataState {...data}>
      {data.rows.length ? (
        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                {["date", "actions", "reference"].map((k) => (
                  <th key={k}>{T(k)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <DateText value={r.created_at} />
                  </td>
                  <td>{T(r.action)}</td>
                  <td>
                    <code>{r.entity_id || r.patient_id || r.actor_id}</code>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <Empty />
      )}
      {data.hasMore && <Button onClick={data.more}>{T("more")}</Button>}
    </DataState>
  );
}
export function Notifications() {
  const { T } = useL();
  const data = useRows("notifications");
  const [err, setErr] = useState("");
  return (
    <>
      {err && <Notice>{err}</Notice>}
      <DataState {...data}>
        {data.rows.length ? (
          data.rows.map((n) => (
            <div
              className={`panel notification ${n.read_at ? "read" : ""}`}
              key={n.id}
            >
              <div>
                <h3>{T(n.title)}</h3>
                <DateText value={n.created_at} />
              </div>
              {!n.read_at && (
                <Button
                  variant="secondary"
                  onClick={() =>
                    command("read_notification", { id: n.id }).catch((e) =>
                      setErr(e.message),
                    )
                  }
                >
                  <Check size={16} />
                  {T("markRead")}
                </Button>
              )}
            </div>
          ))
        ) : (
          <Empty />
        )}
      </DataState>
    </>
  );
}
export function Announcement() {
  const { T } = useL();
  const data = useRows("announcements");
  return (
    <>
      <div className="panel">
        <h3>{T("announcement")}</h3>
        <Form onSubmit={async (d) => command("announcement", d)}>
          <Field name="title" />
          <Field name="body" label={T("description")} type="textarea" />
        </Form>
      </div>
      {data.rows.map((n) => (
        <article className="panel" key={n.id}>
          <h3>{n.title}</h3>
          <p>{n.body}</p>
          <DateText value={n.created_at} />
        </article>
      ))}
    </>
  );
}
