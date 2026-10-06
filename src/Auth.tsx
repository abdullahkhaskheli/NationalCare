import { useEffect, useState } from "react";
import { LockKeyhole, ShieldCheck, ArrowLeft } from "lucide-react";
import { db, configured, command, type Row } from "./api";
import { useL, Form, Field, Notice, Button } from "./ui";
export function AuthPage({ mode = "login" }: { mode?: string }) {
  const { T, L } = useL();
  const [sent, setSent] = useState(false);
  return (
    <section className="auth-page">
      <div className="auth-story">
        <span className="eyebrow light">NATIONALCARE</span>
        <h1>
          {L(
            "Welcome to\nyour circle of care.",
            "آپ کی صحت کے\nسفر میں خوش آمدید۔",
            "مرحبًا بك في\nدائرة رعايتك.",
          )}
        </h1>
        <p>
          {L(
            "Your records and care teams, connected through one secure account.",
            "آپ کا ریکارڈ اور طبی ٹیم ایک محفوظ اکاؤنٹ میں۔",
            "سجلاتك وفرق رعايتك متصلة عبر حساب آمن واحد.",
          )}
        </p>
        <ShieldCheck size={50} />
      </div>
      <div className="auth-panel">
        <a href="#home" className="text-link">
          <ArrowLeft size={16} />
          {T("home")}
        </a>
        <span className="auth-icon">
          <LockKeyhole />
        </span>
        <h2>
          {mode === "register"
            ? T("register")
            : mode === "reset"
              ? T("passwordReset")
              : T("login")}
        </h2>
        <p>
          {L(
            "Patients can register. Staff join through an approved invitation.",
            "مریض خود رجسٹر ہوں۔ عملہ منظور شدہ دعوت سے شامل ہو۔",
            "يسجل المرضى بأنفسهم وينضم الموظفون بدعوة معتمدة.",
          )}
        </p>
        {!configured ? (
          <Notice>{T("notConnected")}</Notice>
        ) : sent ? (
          <Notice>
            {L(
              "Check your email for the confirmation link.",
              "تصدیقی لنک کے لیے ای میل دیکھیں۔",
              "تحقق من بريدك للحصول على رابط التأكيد.",
            )}
          </Notice>
        ) : (
          <Form
            submitLabel={
              mode === "register"
                ? T("register")
                : mode === "reset"
                  ? T("passwordReset")
                  : T("login")
            }
            onSubmit={async (d) => {
              if (!db) return;
              if (mode === "register") {
                if (d.password.length < 12)
                  throw new Error(
                    L(
                      "Use at least 12 characters.",
                      "کم از کم ۱۲ حروف استعمال کریں۔",
                      "استخدم 12 حرفًا على الأقل.",
                    ),
                  );
                const { error } = await db.auth.signUp({
                  email: d.email,
                  password: d.password,
                  options: {
                    emailRedirectTo:
                      window.location.origin + "/#workspace/patient",
                    data: { full_name: d.full_name },
                  },
                });
                if (error) throw error;
                setSent(true);
              } else if (mode === "reset") {
                const { error } = await db.auth.resetPasswordForEmail(d.email, {
                  redirectTo: window.location.origin + "/#password",
                });
                if (error) throw error;
                setSent(true);
              } else {
                const { error } = await db.auth.signInWithPassword({
                  email: d.email,
                  password: d.password,
                });
                if (error) throw error;
                window.location.hash = "workspace/patient";
              }
            }}
          >
            {mode === "register" && (
              <Field name="full_name" label={T("name")} />
            )}
            <Field name="email" type="email" />
            {mode !== "reset" && <Field name="password" type="password" />}
          </Form>
        )}
        <div className="auth-links">
          <a href={mode === "register" ? "#login" : "#login/register"}>
            {mode === "register" ? T("login") : T("register")}
          </a>
          <a href="#login/reset">{T("passwordReset")}</a>
        </div>
      </div>
    </section>
  );
}
export function Mfa({ onDone }: { onDone: () => void }) {
  const { T, L } = useL();
  const [factor, setFactor] = useState(""),
    [qr, setQr] = useState(""),
    [secret, setSecret] = useState(""),
    [error, setError] = useState("");
  useEffect(() => {
    void (async () => {
      if (!db) return;
      const { data, error } = await db.auth.mfa.listFactors();
      if (error) {
        setError(error.message);
        return;
      }
      const f = data.totp.find((f) => f.status === "verified");
      if (f) setFactor(f.id);
    })();
  }, []);
  return (
    <div className="panel narrow">
      <ShieldCheck size={36} />
      <h2>{T("mfa")}</h2>
      <p>
        {L(
          "Staff accounts require a code from an authenticator app before accessing a workspace.",
          "عملے کو پورٹل کے لیے تصدیقی ایپ کا کوڈ درکار ہے۔",
          "تحتاج حسابات الموظفين إلى رمز من تطبيق المصادقة للوصول إلى مساحة العمل.",
        )}
      </p>
      {error && <Notice>{error}</Notice>}
      {!factor ? (
        <Button
          onClick={async () => {
            if (!db) return;
            const { data, error } = await db.auth.mfa.enroll({
              factorType: "totp",
              friendlyName: "NationalCare " + Date.now(),
            });
            if (error) {
              setError(error.message);
              return;
            }
            setFactor(data.id);
            setQr(data.totp.qr_code);
            setSecret(data.totp.secret);
          }}
        >
          {T("enable")}
        </Button>
      ) : (
        <>
          {qr && (
            <div className="qr-panel">
              <img src={qr} alt={T("mfa")} />
              <code>{secret}</code>
            </div>
          )}
          <Form
            onSubmit={async (d) => {
              if (!db) return;
              const challenge = await db.auth.mfa.challenge({
                factorId: factor,
              });
              if (challenge.error) throw challenge.error;
              const v = await db.auth.mfa.verify({
                factorId: factor,
                challengeId: challenge.data.id,
                code: d.code,
              });
              if (v.error) throw v.error;
              onDone();
            }}
          >
            <Field name="code" pattern="[0-9]{6}" />
          </Form>
        </>
      )}
    </div>
  );
}
export function Account({
  session,
  reload,
}: {
  session: Row;
  reload: () => void;
}) {
  const { T, L } = useL();
  const [showMfa, setShowMfa] = useState(false);
  return (
    <div className="two-columns">
      <div className="panel">
        <h2>{T("account")}</h2>
        <Form
          onSubmit={async (d) => {
            await command("profile", d);
            reload();
          }}
        >
          <Field
            name="full_name"
            label={T("name")}
            defaultValue={session.profile?.full_name}
          />
          <Field
            name="phone"
            type="tel"
            defaultValue={session.profile?.phone || ""}
            required={false}
          />
        </Form>
        <hr />
        <h3>{T("passwordReset")}</h3>
        <Form
          onSubmit={async (d) => {
            if (!db) return;
            if (d.password.length < 12)
              throw new Error("Use at least 12 characters");
            const { error } = await db.auth.updateUser({
              password: d.password,
            });
            if (error) throw error;
          }}
        >
          <Field name="password" type="password" />
        </Form>
      </div>
      <div className="panel">
        <h2>{T("mfa")}</h2>
        <p>
          {L(
            "Protect your account using an authenticator app.",
            "تصدیقی ایپ کے ساتھ اکاؤنٹ محفوظ کریں۔",
            "احمِ حسابك باستخدام تطبيق المصادقة.",
          )}
        </p>
        <Button onClick={() => setShowMfa(true)}>{T("mfa")}</Button>
        {showMfa && (
          <Mfa
            onDone={() => {
              setShowMfa(false);
              reload();
            }}
          />
        )}
      </div>
    </div>
  );
}
