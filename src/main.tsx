import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  Menu,
  X,
  LayoutDashboard,
  FileHeart,
  CalendarDays,
  Pill,
  Users,
  FileText,
  ShieldCheck,
  Bell,
  Settings,
  LogOut,
  ChevronRight,
  Activity,
  Building2,
  ScanLine,
  ClipboardList,
  Plus,
  HeartPulse,
} from "lucide-react";
import {
  Language,
  useL,
  Logo,
  Button,
  Notice,
  Empty,
  Badge,
  DateText,
} from "./ui";
import { portalDefs, pick, label, type Lang } from "./catalog";
import { db, command, useRows, type Row } from "./api";
import { PublicPage } from "./Public";
import { AuthPage, Mfa, Account } from "./Auth";
import { Profile, PatientSelect, Records, Documents, Family } from "./Patient";
import { Prescriptions, Scanner, Stock } from "./Prescriptions";
import {
  Appointments,
  Laboratory,
  Staff,
  Work,
  Facilities,
  Audit,
  Notifications,
  Announcement,
} from "./Operations";
import "./styles.css";
function Overview({
  role,
  session,
  onNavigate,
}: {
  role: string;
  session: Row;
  onNavigate: (s: string) => void;
}) {
  const { T, L, lang } = useL();
  const ap = useRows("appointments"),
    rx = useRows("prescriptions"),
    work = useRows("work_items"),
    notice = useRows("notifications"),
    invites = useRows("staff_requests");
  const [error, setError] = useState("");
  const personal = ["patient", "guardian"].includes(role);
  const cards = personal
    ? [
        {
          key: "appointments",
          n: ap.rows.filter(
            (a) => !["cancelled", "completed"].includes(a.status),
          ).length,
          icon: CalendarDays,
        },
        {
          key: "prescriptions",
          n: rx.rows.filter((r) => r.status === "issued").length,
          icon: Pill,
        },
        {
          key: "notifications",
          n: notice.rows.filter((n) => !n.read_at).length,
          icon: Bell,
        },
      ]
    : [
        { key: "appointments", n: ap.rows.length, icon: CalendarDays },
        {
          key: "requests",
          n: work.rows.filter(
            (w) => !["completed", "cancelled", "rejected"].includes(w.status),
          ).length,
          icon: ClipboardList,
        },
        {
          key: "notifications",
          n: notice.rows.filter((n) => !n.read_at).length,
          icon: Bell,
        },
      ];
  const portal = portalDefs.find((p) => p.id === role)!;
  return (
    <>
      <section className="welcome-panel">
        <div>
          <span className="eyebrow">
            {L("YOUR CONNECTED CARE", "آپ کی مربوط صحت", "رعايتك المتصلة")}
          </span>
          <h2>
            {L("Welcome back", "خوش آمدید", "مرحبًا بعودتك")}
            {session.profile?.full_name
              ? `, ${session.profile.full_name.split(" ")[0]}`
              : ""}
            .
          </h2>
          <p>{pick(portal.desc, lang)}</p>
        </div>
        <HeartPulse size={75} strokeWidth={1} />
      </section>
      {error && <Notice>{error}</Notice>}
      {invites.rows
        .filter((i) => i.status === "approved" && i.email === session.email)
        .map((i) => (
          <div className="panel notification" key={i.id}>
            <div>
              <h3>
                {L(
                  "Your staff invitation is ready",
                  "آپ کی ملازمت کی دعوت تیار ہے",
                  "دعوتك للانضمام جاهزة",
                )}
              </h3>
              <p>
                {i.full_name} · {i.role}
              </p>
            </div>
            <Button
              onClick={() =>
                command("staff_accept", { id: i.id })
                  .then(() => window.dispatchEvent(new Event("nc-session")))
                  .catch((e) => setError(e.message))
              }
            >
              {T("accept")}
            </Button>
          </div>
        ))}
      <div className="stats-grid">
        {cards.map((c) => (
          <button
            className="stat-card"
            key={c.key}
            onClick={() =>
              onNavigate(
                c.key === "requests"
                  ? portal.modules.find(
                      (m) => !["overview", "notifications"].includes(m),
                    ) || "overview"
                  : c.key,
              )
            }
          >
            <span>
              <c.icon size={22} />
              {T(c.key)}
            </span>
            <strong>{c.n}</strong>
            <small>
              {L("Accessible records", "دستیاب ریکارڈ", "السجلات المتاحة")}
              <ArrowUpRight size={17} />
            </small>
          </button>
        ))}
      </div>
      <div className="two-columns">
        <div className="panel">
          <div className="panel-title">
            <h3>{L("Your workspaces", "آپ کے پورٹلز", "مساحات عملك")}</h3>
            <span className="badge">{portal.modules.length}</span>
          </div>
          <div className="quick-links">
            {portal.modules
              .filter((m) => m !== "overview")
              .map((m) => (
                <button key={m} onClick={() => onNavigate(m)}>
                  <span className="icon-tile">
                    <FileHeart size={20} />
                  </span>
                  <span>{label(m, lang)}</span>
                  <ChevronRight size={18} />
                </button>
              ))}
          </div>
        </div>
        <div className="panel">
          <div className="panel-title">
            <h3>{L("Latest updates", "تازہ ترین معلومات", "آخر التحديثات")}</h3>
            <Bell size={18} />
          </div>
          {notice.rows.slice(0, 5).map((n) => (
            <div className="feed-item" key={n.id}>
              <span className="feed-dot" />
              <div>
                <strong>{T(n.title)}</strong>
                <small>
                  <DateText value={n.created_at} />
                </small>
              </div>
            </div>
          ))}
          {!notice.rows.length && <Empty />}
        </div>
      </div>
    </>
  );
}
function Application() {
  const [lang, setLang] = useState<Lang>(
    (localStorage.getItem("nc-language") as Lang) || "en",
  );
  return (
    <Language.Provider value={["en", "ur", "ar"].includes(lang) ? lang : "en"}>
      <App
        lang={lang}
        setLang={(l) => {
          setLang(l);
          localStorage.setItem("nc-language", l);
        }}
      />
    </Language.Provider>
  );
}
function App({ lang, setLang }: { lang: Lang; setLang: (l: Lang) => void }) {
  const { T, L } = useL();
  const [route, setRoute] = useState(window.location.hash.slice(1) || "home"),
    [session, setSession] = useState<Row | null>(null),
    [loading, setLoading] = useState(true),
    [authError, setAuthError] = useState(""),
    [aal, setAal] = useState("aal1"),
    [menu, setMenu] = useState(false),
    [live, setLive] = useState(false),
    [patientId, setPatientId] = useState(""),
    [facilityId, setFacilityId] = useState("");
  const parts = route.split("?")[0].split("/");
  const workspace = parts[0] === "workspace";
  const role = parts[1] || "patient";
  const portal = portalDefs.find((p) => p.id === role) || portalDefs[1];
  const page = [...portal.modules, "notifications", "account"].includes(
    parts[2],
  )
    ? parts[2]
    : portal.modules[0] || "overview";
  const reload = async () => {
    if (!db) {
      setLoading(false);
      return;
    }
    try {
      const { data, error } = await db.auth.getUser();
      if (error || !data.user) {
        setSession(null);
        setAuthError("");
        return;
      }
      const [s, a] = await Promise.all([
        command("session"),
        db.auth.mfa.getAuthenticatorAssuranceLevel(),
      ]);
      setSession({ ...s, email: data.user.email });
      setAal(a.data?.currentLevel || "aal1");
      setAuthError("");
    } catch (e) {
      setAuthError((e as Error).message);
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "en" ? "ltr" : "rtl";
  }, [lang]);
  useEffect(() => {
    const nav = () => {
      setRoute(window.location.hash.slice(1) || "home");
      setMenu(false);
      window.scrollTo(0, 0);
    };
    window.addEventListener("hashchange", nav);
    void reload();
    const auth = db?.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY")
        window.location.hash = "workspace/patient/account";
      setTimeout(() => void reload(), 0);
    });
    const refresh = () => void reload();
    window.addEventListener("nc-session", refresh);
    return () => {
      window.removeEventListener("hashchange", nav);
      window.removeEventListener("nc-session", refresh);
      auth?.data.subscription.unsubscribe();
    };
  }, []);
  useEffect(() => {
    setPatientId(
      ["patient", "guardian"].includes(role) ? session?.patient?.id || "" : "",
    );
    const ms = session?.memberships?.filter((m: Row) => m.role === role) || [];
    setFacilityId(ms[0]?.facility_id || "");
  }, [
    role,
    session?.patient?.id,
    session?.memberships?.map((m: Row) => m.id).join(","),
  ]);
  useEffect(() => {
    if (!db || !session?.user_id) return;
    let timer: ReturnType<typeof setTimeout>;
    let cancelled = false;
    let channel: ReturnType<typeof db.channel> | undefined;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        window.dispatchEvent(new Event("nc-refresh"));
        window.dispatchEvent(new Event("nc-family-refresh"));
      }, 250);
    };
    void (async () => {
      const { data } = await db!.auth.getSession();
      if (cancelled || !data.session) return;
      await db!.realtime.setAuth(data.session.access_token);
      if (cancelled) return;
      channel = db!
        .channel(`nationalcare:${session.user_id}`)
        .on("system", {}, (payload) => {
          if (payload.status === "ok") {
            setLive(true);
            refresh();
          }
        })
        .on("postgres_changes", { event: "*", schema: "public" }, (payload) => {
          refresh();
          if (
            ["patients", "profiles", "staff_requests"].includes(payload.table)
          )
            void reload();
        })
        .subscribe((status) => {
          if (status !== "SUBSCRIBED") setLive(false);
          else refresh();
        });
    })();
    const online = () => {
      refresh();
      void reload();
    };
    window.addEventListener("online", online);
    const fallback = setInterval(refresh, 30000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      clearInterval(fallback);
      setLive(false);
      window.removeEventListener("online", online);
      if (channel && db) void db.removeChannel(channel);
    };
  }, [session?.user_id, aal]);
  const navigate = (m: string) => {
    window.location.hash = `workspace/${role}/${m}`;
  };
  const permitted =
    ["patient", "guardian"].includes(role) ||
    session?.memberships?.some((m: Row) => m.role === role);
  const memberships =
    session?.memberships?.filter((m: Row) => m.role === role) || [];
  const province =
    memberships.find((m: Row) => m.facility_id === facilityId)?.province || "";
  const portalOptions = portalDefs.filter(
    (p) =>
      ["patient", "guardian"].includes(p.id) ||
      session?.memberships?.some((m: Row) => m.role === p.id),
  );
  const icons: Record<string, typeof FileText> = {
    overview: LayoutDashboard,
    records: FileHeart,
    prescriptions: Pill,
    appointments: CalendarDays,
    family: Users,
    documents: FileText,
    profile: ShieldCheck,
    notifications: Bell,
    account: Settings,
    facilities: Building2,
    scan: ScanLine,
  };
  let content;
  if (!workspace) {
    content =
      parts[0] === "login" ? (
        <AuthPage key={parts[1]} mode={parts[1] || "login"} />
      ) : (
        <PublicPage page={parts[0]} />
      );
  } else if (loading) {
    content = <div className="loading-page">{T("loading")}</div>;
  } else if (!session) {
    content = (
      <>
        <AuthPage />
        {authError && <Notice>{authError}</Notice>}
      </>
    );
  } else if (!permitted) {
    content = (
      <div className="panel narrow access-message">
        <ShieldCheck size={40} />
        <h2>
          {L(
            "This workspace requires an approved role",
            "اس پورٹل کے لیے منظور شدہ کردار درکار ہے",
            "تتطلب مساحة العمل دورًا معتمدًا",
          )}
        </h2>
        <p>
          {L(
            "Your hospital submits the staff request. The Ministry reviews it before access is enabled.",
            "ہسپتال درخواست جمع کرتا ہے اور وزارت رسائی سے پہلے جائزہ لیتی ہے۔",
            "يرسل المستشفى طلب الموظف وتراجعه الوزارة قبل تفعيل الوصول.",
          )}
        </p>
        <a className="button" href="#workspace/patient">
          {T("profile")}
        </a>
      </div>
    );
  } else if (
    (!["patient", "guardian"].includes(role) ||
      (aal === "aal1" && session?.memberships?.length > 0)) &&
    aal !== "aal2"
  ) {
    content = <Mfa onDone={reload} />;
  } else {
    let body;
    const shared = { patientId, facilityId, role };
    if (page === "overview")
      body = <Overview role={role} session={session} onNavigate={navigate} />;
    else if (page === "profile")
      body = <Profile patient={session.patient} reload={reload} />;
    else if (page === "records")
      body = (
        <Records
          patientId={patientId}
          facilityId={facilityId}
          editable={["doctor", "community"].includes(role)}
        />
      );
    else if (page === "prescriptions") body = <Prescriptions {...shared} />;
    else if (page === "scan")
      body = (
        <>
          <Scanner
            onResolved={() => window.dispatchEvent(new Event("nc-refresh"))}
          />
          <Prescriptions {...shared} />
        </>
      );
    else if (page === "stock") body = <Stock facilityId={facilityId} />;
    else if (page === "appointments") body = <Appointments {...shared} />;
    else if (page === "documents") body = <Documents patientId={patientId} />;
    else if (page === "family") body = <Family patient={session.patient} />;
    else if (page === "lab")
      body = <Laboratory patientId={patientId} role={role} />;
    else if (page === "staff")
      body = <Staff facilityId={facilityId} role={role} />;
    else if (page === "facilities") body = <Facilities role={role} />;
    else if (page === "audit") body = <Audit />;
    else if (page === "notifications") body = <Notifications />;
    else if (page === "announcement") body = <Announcement />;
    else if (page === "account")
      body = <Account session={session} reload={reload} />;
    else
      body = (
        <Work
          kind={page}
          facilityId={facilityId}
          province={province}
          patientId={
            ["patient", "guardian"].includes(role)
              ? session.patient?.id || ""
              : ""
          }
          role={role}
        />
      );
    content = (
      <div className="workspace">
        <aside className={menu ? "sidebar open" : "sidebar"}>
          <div className="workspace-label">
            {L("YOUR WORKSPACE", "آپ کا پورٹل", "مساحة عملك")}
          </div>
          <select
            className="portal-switch"
            value={role}
            aria-label={T("portals")}
            onChange={(e) => {
              window.location.hash = `workspace/${e.target.value}`;
            }}
          >
            {portalOptions.map((p) => (
              <option key={p.id} value={p.id}>
                {pick(p.name, lang)}
              </option>
            ))}
          </select>
          {memberships.length > 1 && (
            <select
              aria-label={T("facility")}
              value={facilityId}
              onChange={(e) => setFacilityId(e.target.value)}
            >
              {memberships.map((m: Row) => (
                <option key={m.id} value={m.facility_id || ""}>
                  {m.name || m.province}
                </option>
              ))}
            </select>
          )}
          <nav>
            {[...portal.modules, "notifications", "account"].map((m) => {
              const Icon = icons[m] || ClipboardList;
              return (
                <a
                  href={`#workspace/${role}/${m}`}
                  key={m}
                  className={page === m ? "active" : ""}
                >
                  <Icon size={19} />
                  {label(m, lang)}
                  {page === m && <span className="nav-dot" />}
                </a>
              );
            })}
          </nav>
          <div className="sidebar-bottom">
            <span className="avatar">
              {(session.profile?.full_name ||
                session.email ||
                "N")[0].toUpperCase()}
            </span>
            <div>
              <strong>{session.profile?.full_name || session.email}</strong>
              <small>{pick(portal.name, lang)}</small>
            </div>
            <button
              aria-label={T("logout")}
              className="icon-button"
              onClick={() => db?.auth.signOut()}
            >
              <LogOut size={18} />
            </button>
          </div>
        </aside>
        <main className="workspace-main">
          <div className="workspace-heading">
            <div>
              <span className="breadcrumb">
                NationalCare / {pick(portal.name, lang)}
              </span>
              <h1>{label(page, lang)}</h1>
            </div>
            <span className={`live-badge ${live ? "connected" : ""}`}>
              <span />
              {T(live ? "live" : "reconnecting")}
            </span>
          </div>
          {authError && <Notice>{authError}</Notice>}
          {["records", "documents", "prescriptions", "lab"].includes(page) &&
            ["doctor", "community", "emergency", "guardian"].includes(role) && (
              <PatientSelect value={patientId} onChange={setPatientId} />
            )}
          {!session.patient && role === "patient" && page !== "profile" && (
            <Notice>
              <a href="#workspace/patient/profile">
                {L(
                  "Complete your patient profile to use care services.",
                  "خدمات کے لیے مریض کا پروفائل مکمل کریں۔",
                  "أكمل ملف المريض لاستخدام خدمات الرعاية.",
                )}
              </a>
            </Notice>
          )}
          {body}
        </main>
      </div>
    );
  }
  return (
    <>
      <header className="topbar">
        <Logo />
        <nav className={menu ? "public-nav open" : "public-nav"}>
          {["home", "hospitals", "services", "faq"].map((p) => (
            <a href={"#" + p} key={p} className={route === p ? "active" : ""}>
              {T(p)}
            </a>
          ))}
        </nav>
        <div className="nav-actions">
          <select
            aria-label="Language / زبان / اللغة"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
          >
            <option value="en">EN</option>
            <option value="ur">اردو</option>
            <option value="ar">العربية</option>
          </select>
          <a
            className="button compact"
            href={session ? "#workspace/patient" : "#login"}
          >
            {T(session ? "portals" : "login")}
            <ArrowUpRight size={16} />
          </a>
          <button
            className="icon-button mobile-menu"
            aria-label={T("portals")}
            onClick={() => setMenu(!menu)}
          >
            {menu ? <X /> : <Menu />}
          </button>
        </div>
      </header>
      {content}
    </>
  );
}
createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <Application />
  </React.StrictMode>,
);
