import { useEffect, useState } from "react";
import {
  UserRound,
  Plus,
  Download,
  ShieldCheck,
  FileText,
  Clock,
  ArrowUpRight,
  Camera,
} from "lucide-react";
import { db, command, query, useRows, uploadFile, fileUrl, type Row } from "./api";
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
export function PatientSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const { T } = useL();
  const data = useRows("patients");
  return (
    <label className="patient-select">
      <span>{T("patient")}</span>
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">—</option>
        {data.rows.map((p) => (
          <option key={p.id} value={p.id}>
            {p.full_name} · {p.health_id}
          </option>
        ))}
      </select>
      {data.error && <small>{data.error}</small>}
    </label>
  );
}
export function Profile({
  patient,
  reload,
}: {
  patient: Row | null;
  reload: () => void;
}) {
  const { T, L, lang } = useL();
  const [photo, setPhoto] = useState(""),
    [err, setErr] = useState("");
  useEffect(() => {
    if (patient?.photo_path)
      fileUrl("photos", patient.photo_path)
        .then(setPhoto)
        .catch((e) => setErr(e.message));
  }, [patient?.photo_path]);
  if (!patient)
    return (
      <div className="panel narrow">
        <h2>
          {L(
            "Create your health profile",
            "اپنا صحت پروفائل بنائیں",
            "أنشئ ملفك الصحي",
          )}
        </h2>
        <p>{T("cnicNote")}</p>
        <Form
          onSubmit={async (d) => {
            await command("register_patient", d);
            reload();
          }}
        >
          <Field name="full_name" label={T("name")} />
          <Field name="cnic" pattern="[0-9]{13}" />
          <Field
            name="dob"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
          />
          <Field
            name="sex"
            options={["female", "male", "other", "unspecified"].map((s) => ({
              value: s,
              label: T(s),
            }))}
          />
          <Field name="phone" type="tel" pattern="\+[1-9][0-9]{7,14}" />
          <Field
            name="emergency_contact"
            label={T("emergencyContact")}
            required={false}
          />
        </Form>
      </div>
    );
  return (
    <div className="two-columns">
      <div className="patient-card">
        <div className="patient-photo">
          {photo ? (
            <img src={photo} alt={patient.full_name} />
          ) : (
            <UserRound size={55} />
          )}
        </div>
        <h2>{patient.full_name}</h2>
        <code>{patient.health_id}</code>
        <p>
          <Badge status={patient.identity_status} />
        </p>
        <label className="button secondary upload-button">
          <Camera size={18} />
          {T("photo")}
          <input
            type="file"
            accept="image/png,image/jpeg"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              try {
                await uploadFile(f, patient.id, true);
                reload();
              } catch (e) {
                setErr((e as Error).message);
              }
            }}
          />
        </label>
        {patient.photo_path && (
          <Button
            variant="ghost"
            onClick={async () => {
              if (!db) return;
              const { error } = await db.functions.invoke("upload-medical", {
                method: "DELETE",
              });
              if (error) {
                setErr(error.message);
                return;
              }
              setPhoto("");
              reload();
            }}
          >
            {L("Remove photo", "تصویر ہٹائیں", "إزالة الصورة")}
          </Button>
        )}
        {err && <Notice>{err}</Notice>}
        <div className="profile-meta">
          <span>{T("dob")}</span>
          <strong>{patient.dob}</strong>
          <span>{T("cnic")}</span>
          <strong dir="ltr">•••••••••{patient.cnic_last4}</strong>
          <span>{T("sex")}</span>
          <strong>{T(patient.sex)}</strong>
        </div>
        <Button
          variant="secondary"
          onClick={() =>
            exportPdf(
              T("healthId"),
              patient,
              [
                {
                  title: T("profile"),
                  lines: [
                    `${T("dob")}: ${patient.dob}`,
                    `${T("phone")}: ${patient.phone}`,
                    `${T("emergencyContact")}: ${patient.emergency_contact}`,
                  ],
                },
              ],
              lang,
            )
          }
        >
          <Download size={17} />
          {T("download")}
        </Button>
      </div>
      <div className="panel">
        <h2>{T("profile")}</h2>
        <p>
          {L(
            "Keep your contact details up to date. Your Health ID stays the same.",
            "رابطے کی معلومات تازہ رکھیں۔ ہیلتھ آئی ڈی وہی رہے گی۔",
            "حدّث بيانات الاتصال. يبقى رقمك الصحي ثابتًا.",
          )}
        </p>
        <Form
          onSubmit={async (d) => {
            await command("update_patient", { ...d, patient_id: patient.id });
            reload();
          }}
        >
          <Field
            name="phone"
            type="tel"
            pattern="\+[1-9][0-9]{7,14}"
            defaultValue={patient.phone}
          />
          <Field
            name="emergency_contact"
            label={T("emergencyContact")}
            defaultValue={patient.emergency_contact}
            required={false}
          />
        </Form>
      </div>
    </div>
  );
}
export function Records({
  patientId,
  facilityId,
  editable = false,
}: {
  patientId: string;
  facilityId: string;
  editable?: boolean;
}) {
  const { T, L, lang } = useL();
  const data = useRows("records", { patient_id: patientId }, !!patientId);
  const patients = useRows("patients", { id: patientId }, !!patientId);
  const [modal, setModal] = useState(false),
    [kind, setKind] = useState("all"),
    [search, setSearch] = useState(""),
    [exportError, setExportError] = useState(""),
    [exporting, setExporting] = useState(false);
  const visible = data.rows.filter(
    (r) =>
      (kind === "all" || r.kind === kind) &&
      `${r.title} ${r.body}`.toLowerCase().includes(search.toLowerCase()),
  );
  useEffect(() => {
    if (patientId)
      void command("audit_access", { patient_id: patientId }).catch(() => {});
  }, [patientId]);
  return (
    <>
      <div className="toolbar">
        <input
          aria-label={T("search")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={T("search")}
        />
        <select
          value={kind}
          onChange={(e) => setKind(e.target.value)}
          aria-label={T("type")}
        >
          <option value="all">{T("all")}</option>
          {[
            "encounter",
            "allergy",
            "condition",
            "vaccination",
            "vitals",
            "procedure",
            "discharge",
            "lab_result",
            "care_plan",
            "birth",
            "death",
            "amendment",
          ].map((k) => (
            <option key={k} value={k}>
              {T(k)}
            </option>
          ))}
        </select>
        <Button
          variant="secondary"
          disabled={!patientId}
          onClick={async () => {
            setExporting(true);
            setExportError("");
            try {
              const all = await query(
                "records",
                { patient_id: patientId },
                Infinity,
              );
              await exportPdf(
                T("records"),
                patients.rows[0] || {},
                all.map((r) => ({
                  title: `${T(r.kind)} · ${r.title}`,
                  lines: [
                    new Date(r.created_at).toLocaleString(),
                    r.body,
                    `${T("reference")}: ${r.id}`,
                  ],
                })),
                lang,
              );
            } catch (e) {
              setExportError((e as Error).message);
            } finally {
              setExporting(false);
            }
          }}
          aria-busy={exporting}
        >
          <Download size={17} />
          {T("download")}
        </Button>
        {editable && (
          <Button
            disabled={!patientId || !facilityId}
            onClick={() => setModal(true)}
          >
            <Plus size={17} />
            {T("new")}
          </Button>
        )}
      </div>
      {exportError && <Notice>{exportError}</Notice>}
      <DataState {...data}>
        {!visible.length ? (
          <Empty />
        ) : (
          <div className="timeline">
            {visible.map((r) => (
              <article key={r.id} className="timeline-item">
                <span className="timeline-dot">
                  <FileText size={18} />
                </span>
                <div className="timeline-head">
                  <Badge status={r.kind} />
                  <DateText value={r.created_at} />
                </div>
                <h3>{r.title}</h3>
                <p className="preserve">{r.body}</p>
                {r.supersedes && (
                  <small>
                    {T("amendment")} · {r.supersedes}
                  </small>
                )}
                <small className="record-ref">
                  {T("reference")}: {r.id}
                </small>
              </article>
            ))}
          </div>
        )}
      </DataState>
      {data.hasMore && <Button onClick={data.more}>{T("more")}</Button>}
      {modal && (
        <Modal title={T("new")} onClose={() => setModal(false)}>
          <Form
            onSubmit={async (d) => {
              await command("clinical_record", {
                ...d,
                patient_id: patientId,
                facility_id: facilityId,
              });
              setModal(false);
            }}
          >
            <Field
              name="kind"
              label={T("type")}
              options={[
                "encounter",
                "allergy",
                "condition",
                "vaccination",
                "vitals",
                "procedure",
                "discharge",
                "care_plan",
                "birth",
                "death",
                "amendment",
              ].map((k) => ({ value: k, label: T(k) }))}
            />
            <Field name="title" />
            <Field name="body" label={T("description")} type="textarea" />
            <Field
              name="supersedes"
              label={L(
                "Previous record ID (for amendment)",
                "پرانے ریکارڈ کی آئی ڈی",
                "رقم السجل السابق للتعديل",
              )}
              required={false}
            />
          </Form>
        </Modal>
      )}
    </>
  );
}
export function Documents({ patientId }: { patientId: string }) {
  const { T } = useL();
  const data = useRows("documents", { patient_id: patientId }, !!patientId);
  const [err, setErr] = useState(""),
    [busy, setBusy] = useState(false);
  return (
    <>
      <div className="toolbar">
        <label className="button upload-button">
          <Plus size={18} />
          {busy ? T("loading") : T("upload")}
          <input
            disabled={!patientId || busy}
            type="file"
            accept="application/pdf,image/png,image/jpeg"
            onChange={async (e) => {
              const f = e.target.files?.[0];
              if (!f) return;
              setBusy(true);
              setErr("");
              try {
                await uploadFile(f, patientId);
              } catch (e) {
                setErr((e as Error).message);
              } finally {
                setBusy(false);
                e.target.value = "";
              }
            }}
          />
        </label>
        <small>PDF · PNG · JPG · 10 MB</small>
      </div>
      {err && <Notice>{err}</Notice>}
      <DataState {...data}>
        {!data.rows.length ? (
          <Empty />
        ) : (
          <div className="document-grid">
            {data.rows.map((d) => (
              <article className="panel" key={d.id}>
                <FileText size={28} />
                <h3>{d.name}</h3>
                <Badge status={d.source} />
                <p>
                  <DateText value={d.created_at} />
                </p>
                <small>{(d.bytes / 1024).toFixed(1)} KB</small>
                <Button
                  variant="secondary"
                  onClick={async () => {
                    try {
                      const url = await fileUrl("medical", d.path);
                      const a = document.createElement("a");
                      a.href = url + "&download=" + encodeURIComponent(d.name);
                      a.target = "_blank";
                      a.rel = "noopener";
                      a.click();
                    } catch (e) {
                      setErr((e as Error).message);
                    }
                  }}
                >
                  <ArrowUpRight size={17} />
                  {T("open")}
                </Button>
              </article>
            ))}
          </div>
        )}
      </DataState>
    </>
  );
}
export function Family({ patient }: { patient: Row | null }) {
  const { T, L } = useL();
  const [links, setLinks] = useState<Row[]>([]),
    [err, setErr] = useState(""),
    [invite, setInvite] = useState(false);
  const grants = useRows("care_grants", { patient_id: patient?.id }, !!patient);
  const refresh = () =>
    command("family_list")
      .then(setLinks)
      .catch((e) => setErr(e.message));
  useEffect(() => {
    void refresh();
    const f = () => void refresh();
    window.addEventListener("nc-family-refresh", f);
    return () => window.removeEventListener("nc-family-refresh", f);
  }, []);
  async function act(a: string, p: Row) {
    try {
      await command(a, p);
      await refresh();
    } catch (e) {
      setErr((e as Error).message);
    }
  }
  return (
    <>
      <div className="toolbar">
        <p>
          {L(
            "Family connections are private. Each person chooses whether to share medical records.",
            "ہر فرد اپنی طبی معلومات شیئر کرنے کا فیصلہ خود کرتا ہے۔",
            "الروابط العائلية خاصة. يقرر كل شخص مشاركة سجلاته الطبية.",
          )}
        </p>
        <Button disabled={!patient} onClick={() => setInvite(true)}>
          <Plus size={17} />
          {T("family_invitation")}
        </Button>
      </div>
      {err && <Notice>{err}</Notice>}
      <div className="document-grid">
        {links.map((l) => (
          <article className="panel" key={l.id}>
            <UserRound size={28} />
            <h3>{l.member_name}</h3>
            <code>{l.health_id}</code>
            <p>{l.relationship}</p>
            <Badge status={l.status} />
            {l.status === "pending" && !l.outgoing && (
              <div className="row wrap">
                <Button
                  onClick={() =>
                    act("family_respond", { id: l.id, accept: true })
                  }
                >
                  {T("accept")}
                </Button>
                <Button
                  variant="secondary"
                  onClick={() =>
                    act("family_respond", { id: l.id, accept: false })
                  }
                >
                  {T("reject")}
                </Button>
              </div>
            )}
            {l.status === "accepted" && (
              <>
                <p>
                  {l.outgoing
                    ? T("share")
                    : L(
                        "Their record sharing",
                        "ان کے ریکارڈ کی اجازت",
                        "مشاركة سجلاته",
                      )}
                  : {T(l.share_records ? "on" : "off")}
                </p>
                {l.outgoing && (
                  <Button
                    variant="secondary"
                    onClick={() =>
                      act("family_sharing", {
                        id: l.id,
                        enabled: !l.share_records,
                      })
                    }
                  >
                    {T(l.share_records ? "revoke" : "share")}
                  </Button>
                )}
                <Button
                  variant="ghost"
                  onClick={() => act("family_revoke", { id: l.id })}
                >
                  {T("revoke")}
                </Button>
              </>
            )}
          </article>
        ))}
      </div>
      {!links.length && <Empty />}
      <div className="panel">
        <h3>
          {L(
            "Your care-team access",
            "آپ کی طبی ٹیم کی رسائی",
            "وصول فريق رعايتك",
          )}
        </h3>
        {grants.rows.map((g) => (
          <div className="list-row" key={g.id}>
            <div>
              <code>{g.user_id}</code>
              <p>
                {T("validUntil")}: <DateText value={g.expires_at} />
              </p>
            </div>
            <Button
              variant="secondary"
              onClick={() =>
                act("revoke_care", {
                  patient_id: patient!.id,
                  user_id: g.user_id,
                })
              }
            >
              {T("revoke")}
            </Button>
          </div>
        ))}
        {!grants.rows.length && <p>{T("empty")}</p>}
      </div>
      {invite && (
        <Modal title={T("family_invitation")} onClose={() => setInvite(false)}>
          <Form
            onSubmit={async (d) => {
              await command("family_invite", d);
              setInvite(false);
              await refresh();
            }}
          >
            <Field name="health_id" label={T("healthId")} />
            <Field name="relationship" />
          </Form>
        </Modal>
      )}
    </>
  );
}
