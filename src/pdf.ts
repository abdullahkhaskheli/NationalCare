import type { Row } from "./api";
import { t, type Lang } from "./catalog";
let fontPromise: Promise<string> | null = null;
async function font() {
  if (!fontPromise)
    fontPromise = fetch("/assets/amiri.ttf")
      .then((r) => {
        if (!r.ok) throw new Error("PDF font could not be loaded");
        return r.arrayBuffer();
      })
      .then((b) => {
        let s = "";
        for (const v of new Uint8Array(b)) s += String.fromCharCode(v);
        return btoa(s);
      });
  return fontPromise;
}
export async function exportPdf(
  title: string,
  patient: Row,
  sections: { title: string; lines: string[] }[],
  lang: Lang,
  branding?: { facility?: Row; qr?: string },
) {
  const { jsPDF } = await import("jspdf");
  const d = new jsPDF();
  d.addFileToVFS("Amiri.ttf", await font());
  d.addFont("Amiri.ttf", "Amiri", "normal");
  let y = 20;
  const line = (value: string, size = 11) => {
    d.setFontSize(size);
    const arabic = /[\u0600-\u06ff]/.test(value);
    d.setFont(arabic ? "Amiri" : "helvetica", "normal");
    const wrapped = d.splitTextToSize(value, 170) as string[];
    for (const s of wrapped) {
      if (y > 275) {
        d.addPage();
        y = 22;
      }
      d.text(arabic ? d.processArabic(s) : s, arabic ? 190 : 20, y, {
        align: arabic ? "right" : "left",
      });
      y += size * 0.5 + 2;
    }
  };
  d.setTextColor("#0d7a58");
  line("NationalCare", 22);
  if (branding?.facility) {
    line(branding.facility.name, 14);
    line(
      [branding.facility.address, branding.facility.city]
        .filter(Boolean)
        .join(" · "),
      10,
    );
  }
  d.setTextColor("#172f26");
  line(title, 16);
  line(`${patient.full_name || ""} · ${patient.health_id || ""}`);
  line(
    new Date().toLocaleString(
      lang === "en" ? "en-PK" : lang === "ur" ? "ur-PK" : "ar",
    ),
  );
  d.setDrawColor("#dce8df");
  d.line(20, y, 190, y);
  y += 10;
  for (const s of sections) {
    line(s.title, 14);
    y += 2;
    for (const text of s.lines) line(text);
    y += 7;
  }
  if (branding?.qr) {
    if (y > 215) {
      d.addPage();
      y = 22;
    }
    d.addImage(branding.qr, "PNG", 20, y, 45, 45);
    y += 50;
    line(t("qr", lang), 10);
  }
  const pages = d.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    d.setPage(i);
    d.setFont("helvetica", "normal");
    d.setFontSize(8);
    d.setTextColor("#68756f");
    d.text(
      `NationalCare | ${patient.health_id || ""} | ${i} / ${pages}`,
      20,
      290,
    );
  }
  d.save(
    `NationalCare-${patient.health_id || "record"}-${new Date().toISOString().slice(0, 10)}.pdf`,
  );
}
