import { useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  ChevronLeft,
  ChevronRight,
  Search,
  MapPin,
  ShieldCheck,
  FileHeart,
  CalendarDays,
  HeartHandshake,
  Plus,
  Minus,
  Globe,
  Stethoscope,
} from "lucide-react";
import { hospitals, portalDefs, faq, pick } from "./catalog";
import { useRows } from "./api";
import { useL, Logo, Button, Badge } from "./ui";
export function PublicPage({ page }: { page: string }) {
  const { lang, T, L } = useL();
  const [search, setSearch] = useState(""),
    [city, setCity] = useState(""),
    [slide, setSlide] = useState(0);
  const slider = useRef<HTMLDivElement>(null);
  const fs = useRows("facilities");
  const facilities = fs.rows.length ? fs.rows : hospitals;
  const filtered = facilities.filter(
    (f) =>
      (!city || f.city === city) &&
      `${f.name} ${f.city} ${f.address}`
        .toLowerCase()
        .includes(search.toLowerCase()),
  );
  const slides = [
    {
      image: "/assets/care.jpg",
      tag: L(
        "EVERY CHAPTER OF LIFE",
        "زندگی کے ہر مرحلے میں",
        "في كل مرحلة من الحياة",
      ),
      title: L(
        "Care that stays\nwith you.",
        "صحت کا سفر،\nہمیشہ آپ کے ساتھ۔",
        "رعاية ترافقك\nطوال حياتك.",
      ),
      body: L(
        "Your health story. Your care team. One connected place.",
        "آپ کی طبی تاریخ، آپ کی طبی ٹیم — ایک مربوط جگہ۔",
        "قصتك الصحية وفريق رعايتك، في مكان واحد متصل.",
      ),
    },
    {
      image: "/assets/diagnostics.jpg",
      tag: L("ANSWERS, TOGETHER", "مل کر بہتر تشخیص", "إجابات أقرب إليك"),
      title: L(
        "A clearer picture\nof your health.",
        "آپ کی صحت کی\nواضح تصویر۔",
        "صورة أوضح\nعن صحتك.",
      ),
      body: L(
        "Keep your results and consultations connected, wherever care takes you.",
        "آپ جہاں بھی علاج کرائیں، نتائج اور معائنے ساتھ رکھیں۔",
        "احتفظ بنتائجك واستشاراتك متصلة أينما تتلقى الرعاية.",
      ),
    },
    {
      image: "/assets/pharmacy.jpg",
      tag: L(
        "FROM PRESCRIPTION TO CARE",
        "نسخے سے علاج تک",
        "من الوصفة إلى الرعاية",
      ),
      title: L(
        "Your next step,\nmade simpler.",
        "اگلا قدم،\nاب زیادہ آسان۔",
        "خطوتك التالية،\nبكل سهولة.",
      ),
      body: L(
        "Collect your medicines with a secure prescription QR and follow every update.",
        "محفوظ کیو آر سے ادویات وصول کریں اور ہر اپ ڈیٹ دیکھیں۔",
        "استلم أدويتك برمز وصفة آمن وتابع كل تحديث.",
      ),
    },
  ];
  const s = slides[slide];
  const directory = (
    <section className="section" id="hospital-directory">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {L("FIND YOUR CARE", "اپنا علاج تلاش کریں", "ابحث عن رعايتك")}
          </span>
          <h2>
            {L(
              "Healthcare institutions\nacross Pakistan.",
              "پاکستان بھر میں\nصحت کے ادارے۔",
              "مؤسسات الرعاية الصحية\nفي باكستان.",
            )}
          </h2>
        </div>
        <p>
          {L(
            "Discover hospitals and the services around you. Start with the right place.",
            "اپنے آس پاس ہسپتال اور خدمات تلاش کریں۔ صحیح جگہ سے آغاز کریں۔",
            "اكتشف المستشفيات والخدمات القريبة منك. ابدأ من المكان المناسب.",
          )}
        </p>
      </div>
      <div className="search-bar">
        <Search size={20} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label={T("search")}
          placeholder={L(
            "Search by hospital or location",
            "ہسپتال یا مقام تلاش کریں",
            "ابحث باسم المستشفى أو الموقع",
          )}
        />
        <select
          value={city}
          onChange={(e) => setCity(e.target.value)}
          aria-label={T("city")}
        >
          <option value="">{L("All cities", "تمام شہر", "جميع المدن")}</option>
          {[...new Set(facilities.map((f) => f.city))].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="hospital-grid">
        {filtered.map((f) => (
          <article className="hospital-card" key={f.id}>
            <div className="hospital-logo">
              {f.logo ? <img src={f.logo} alt={f.name} /> : <Stethoscope />}
            </div>
            <span className="hospital-city">
              <MapPin size={14} />
              {f.city} · {f.province}
            </span>
            <h3>{f.name}</h3>
            <p>{f.address}</p>
            <div className="card-bottom">
              <Badge status={f.status} />
              <a
                href={f.website}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={`${T("website")} — ${f.name}`}
              >
                <ArrowUpRight size={22} />
              </a>
            </div>
          </article>
        ))}
      </div>
      {!filtered.length && (
        <p>
          {L(
            "No hospitals match your search.",
            "کوئی ہسپتال نہیں ملا۔",
            "لا توجد مستشفيات مطابقة.",
          )}
        </p>
      )}
      <p className="caption">
        {L(
          "Hospital names and logos identify directory entries. A listing does not imply participation or endorsement.",
          "نام اور لوگو ڈائریکٹری کی شناخت ہیں؛ اندراج شراکت یا تائید کا ثبوت نہیں۔",
          "الأسماء والشعارات للتعريف بالمنشآت ولا تعني المشاركة أو التأييد.",
        )}
      </p>
    </section>
  );
  const portals = (
    <section className="section">
      <div className="section-heading">
        <div>
          <span className="eyebrow">
            {L("CONNECTED BY CARE", "صحت کے ذریعے مربوط", "الرعاية تجمعنا")}
          </span>
          <h2>
            {L(
              "A place for every\npart of your care.",
              "آپ کے علاج کے\nہر حصے کے لیے ایک جگہ۔",
              "مساحة لكل جزء\nمن رحلتك الصحية.",
            )}
          </h2>
        </div>
        <p>
          {L(
            "18 workspaces. One shared purpose. Choose your role to access your services.",
            "۱۸ پورٹلز، ایک مقصد۔ اپنی خدمات کے لیے کردار منتخب کریں۔",
            "18 مساحة عمل وهدف واحد. اختر دورك للوصول إلى خدماتك.",
          )}
        </p>
      </div>
      <div className="portal-grid">
        {portalDefs.map((p, i) => (
          <a
            className="portal-card"
            key={p.id}
            href={p.id === "public" ? "#hospitals" : `#workspace/${p.id}`}
          >
            <span className="portal-number">
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3>{pick(p.name, lang)}</h3>
            <p>{pick(p.desc, lang)}</p>
            <ArrowUpRight size={20} />
          </a>
        ))}
      </div>
    </section>
  );
  const questions = (
    <section className="section faq-section">
      <div>
        <span className="eyebrow">
          {L("HERE TO HELP", "آپ کی مدد کے لیے", "نحن هنا لمساعدتك")}
        </span>
        <h2>
          {L(
            "A little clarity\ngoes a long way.",
            "واضح معلومات،\nآسان سفر۔",
            "وضوح أكثر،\nرحلة أسهل.",
          )}
        </h2>
        <p>
          {L(
            "Answers to your questions about NationalCare.",
            "نیشنل کیئر کے بارے میں آپ کے سوالوں کے جواب۔",
            "إجابات عن أسئلتك حول NationalCare.",
          )}
        </p>
      </div>
      <div className="faq-list">
        {faq.map((f, i) => (
          <details key={i}>
            <summary>
              {pick(f.q, lang)}
              <Plus size={20} />
            </summary>
            <p>{pick(f.a, lang)}</p>
          </details>
        ))}
      </div>
    </section>
  );
  return (
    <>
      {page === "home" && (
        <>
          <section
            className="hero"
            style={{
              backgroundImage: `linear-gradient(90deg,rgba(6,42,31,.94),rgba(6,42,31,.72) 43%,rgba(6,42,31,.03)),url(${s.image})`,
            }}
          >
            <div className="hero-content" key={slide}>
              <span className="eyebrow light">
                <span className="little-line" />
                {s.tag}
              </span>
              <h1>{s.title}</h1>
              <p>{s.body}</p>
              <a className="button ivory" href="#login/register">
                {L(
                  "Start your health journey",
                  "صحت کا سفر شروع کریں",
                  "ابدأ رحلتك الصحية",
                )}
                <ArrowUpRight size={19} />
              </a>
              <a className="hero-link" href="#hospitals">
                {L("Find a hospital", "ہسپتال تلاش کریں", "ابحث عن مستشفى")}
                <ArrowRight size={16} />
              </a>
            </div>
            <div className="hero-bottom">
              <div className="slide-dots">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setSlide(i)}
                    aria-label={`${L("Slide", "سلائیڈ", "شريحة")} ${i + 1}`}
                    aria-pressed={slide === i}
                    className={slide === i ? "active" : ""}
                  />
                ))}
              </div>
              <span>
                0{slide + 1}
                <em> / 03</em>
              </span>
              <div>
                <button
                  className="icon-button"
                  onClick={() => setSlide((slide + 2) % 3)}
                  aria-label={T("back")}
                >
                  <ChevronLeft />
                </button>
                <button
                  className="icon-button"
                  onClick={() => setSlide((slide + 1) % 3)}
                  aria-label={T("more")}
                >
                  <ChevronRight />
                </button>
              </div>
            </div>
            <span className="hero-side">NATIONALCARE · PAKISTAN</span>
          </section>
          <section className="promise-strip">
            {[
              [
                FileHeart,
                L("A record for life", "زندگی بھر کا ریکارڈ", "سجل مدى الحياة"),
              ],
              [
                HeartHandshake,
                L("Care, connected", "مربوط دیکھ بھال", "رعاية متصلة"),
              ],
              [
                ShieldCheck,
                L("Privacy by design", "رازداری کے ساتھ", "خصوصية مدمجة"),
              ],
              [Globe, L("Your language", "آپ کی زبان", "بلغتك")],
            ].map(([Icon, text], i) => {
              const C = Icon as typeof FileHeart;
              return (
                <div key={i}>
                  <C size={23} />
                  <span>{text as string}</span>
                </div>
              );
            })}
          </section>
          <section className="section discovery">
            <div className="section-heading">
              <div>
                <span className="eyebrow">
                  {L(
                    "DISCOVER NATIONALCARE",
                    "نیشنل کیئر دریافت کریں",
                    "اكتشف NATIONALCARE",
                  )}
                </span>
                <h2>
                  {L(
                    "More connected.\nMore in your hands.",
                    "زیادہ رابطہ۔\nزیادہ اختیار۔",
                    "تواصل أكبر.\nتحكم أكثر.",
                  )}
                </h2>
              </div>
              <div className="row">
                <button
                  className="circle-button"
                  aria-label={T("back")}
                  onClick={() =>
                    slider.current?.scrollBy({ left: -340, behavior: "smooth" })
                  }
                >
                  <ChevronLeft />
                </button>
                <button
                  className="circle-button"
                  aria-label={T("more")}
                  onClick={() =>
                    slider.current?.scrollBy({ left: 340, behavior: "smooth" })
                  }
                >
                  <ChevronRight />
                </button>
              </div>
            </div>
            <div className="discovery-track" ref={slider}>
              {slides.map((sl, i) => (
                <a
                  href={
                    [
                      "#workspace/patient",
                      "#workspace/laboratory",
                      "#workspace/pharmacy",
                    ][i]
                  }
                  className="discovery-card"
                  key={i}
                >
                  <img src={sl.image} alt="" loading="lazy" />
                  <div>
                    <small>0{i + 1}</small>
                    <h3>
                      {
                        [
                          L(
                            "Your lifelong health story",
                            "آپ کی زندگی بھر کی طبی تاریخ",
                            "قصتك الصحية مدى الحياة",
                          ),
                          L(
                            "Results, within reach",
                            "نتائج آپ کی دسترس میں",
                            "نتائج في متناولك",
                          ),
                          L(
                            "Prescriptions that connect",
                            "مربوط نسخے",
                            "وصفات متصلة",
                          ),
                        ][i]
                      }
                    </h3>
                    <ArrowUpRight />
                  </div>
                </a>
              ))}
            </div>
          </section>
          {directory}
          <section className="care-banner">
            <div>
              <span className="eyebrow light">
                {L(
                  "YOUR HEALTH. YOUR RECORD.",
                  "آپ کی صحت، آپ کا ریکارڈ۔",
                  "صحتك. سجلك.",
                )}
              </span>
              <h2>
                {L(
                  "Every visit adds\nto your story.",
                  "ہر ملاقات،\nآپ کی تاریخ کا حصہ۔",
                  "كل زيارة تضيف\nإلى قصتك.",
                )}
              </h2>
              <p>
                {L(
                  "From appointments to prescriptions, keep your care together with a NationalCare Health ID.",
                  "ملاقات سے نسخے تک، ہیلتھ آئی ڈی کے ساتھ ریکارڈ ایک جگہ رکھیں۔",
                  "من المواعيد إلى الوصفات، احتفظ برعايتك متصلة عبر رقم NationalCare الصحي.",
                )}
              </p>
              <a className="button ivory" href="#login/register">
                {T("register")}
                <ArrowUpRight size={18} />
              </a>
            </div>
            <div className="health-card-preview">
              <div className="row">
                <HeartHandshake size={32} />
                <span>NationalCare</span>
              </div>
              <small>
                {L(
                  "ONE ID. CONNECTED CARE.",
                  "ایک شناخت، مربوط علاج۔",
                  "هوية واحدة. رعاية متصلة.",
                )}
              </small>
              <div className="card-pattern" />
              <strong>
                {L(
                  "Your health, with you.",
                  "آپ کی صحت، آپ کے ساتھ۔",
                  "صحتك معك.",
                )}
              </strong>
              <div className="row">
                <span>PAKISTAN</span>
                <ShieldCheck />
              </div>
            </div>
          </section>
          {questions}
        </>
      )}
      {page === "hospitals" && directory}
      {page === "portals" && portals}
      {page === "services" && (
        <>
          {portals}
          {questions}
        </>
      )}
      {page === "faq" && questions}
      <footer>
        <Logo />
        <div>
          <p>
            {L(
              "Care that stays with you.",
              "صحت کا سفر، ہمیشہ آپ کے ساتھ۔",
              "رعاية ترافقك طوال حياتك.",
            )}
          </p>
          <span>© {new Date().getFullYear()} NationalCare</span>
        </div>
        <nav>
          <a href="#hospitals">{T("hospitals")}</a>
          <a href="#portals">{T("portals")}</a>
          <a href="#faq">{T("faq")}</a>
        </nav>
      </footer>
    </>
  );
}
