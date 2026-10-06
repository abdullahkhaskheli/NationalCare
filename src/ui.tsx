import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type FormEvent,
} from "react";
import {
  X,
  Inbox,
  LoaderCircle,
  AlertCircle,
  HeartPulse,
  ArrowUpRight,
} from "lucide-react";
import { t, pick, type Lang, type Text } from "./catalog";
export const Language = createContext<Lang>("en");
export const useL = () => {
  const lang = useContext(Language);
  return {
    lang,
    T: (k: string) => t(k, lang),
    L: (en: string, ur: string, ar: string) => pick([en, ur, ar], lang),
  };
};
export function Logo() {
  return (
    <a className="brand" href="#home" aria-label="NationalCare home">
      <span className="brand-mark">
        <HeartPulse size={28} />
      </span>
      <span>
        National<span className="brand-accent">Care</span>
        <small>PAKISTAN · پاکستان</small>
      </span>
    </a>
  );
}
export function Button({
  children,
  busy = false,
  variant = "",
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & {
  busy?: boolean;
  variant?: string;
}) {
  return (
    <button
      {...props}
      disabled={props.disabled || busy}
      className={`button ${variant} ${props.className || ""}`}
    >
      {busy && <LoaderCircle size={17} className="spin" />}
      {children}
    </button>
  );
}
export function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="notice">
      <AlertCircle size={18} />
      <div>{children}</div>
    </div>
  );
}
export function Empty() {
  const { T } = useL();
  return (
    <div className="empty">
      <Inbox size={34} />
      <h3>{T("empty")}</h3>
      <p>{T("emptyBody")}</p>
    </div>
  );
}
export function Badge({ status }: { status: string }) {
  const { T } = useL();
  return <span className={`badge status-${status}`}>{T(status)}</span>;
}
export function Field({
  name,
  label,
  type = "text",
  options,
  required = true,
  defaultValue,
  min,
  max,
  pattern,
  children,
}: {
  name: string;
  label?: string;
  type?: string;
  options?: { value: string; label: string }[];
  required?: boolean;
  defaultValue?: string;
  min?: string | number;
  max?: string | number;
  pattern?: string;
  children?: ReactNode;
}) {
  const { T } = useL();
  return (
    <label className={`field ${type === "textarea" ? "wide" : ""}`}>
      <span>
        {label || T(name)}
        {required && <sup> *</sup>}
      </span>
      {options ? (
        <select
          name={name}
          required={required}
          defaultValue={defaultValue || ""}
        >
          <option value="">—</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      ) : type === "textarea" ? (
        <textarea
          name={name}
          required={required}
          rows={4}
          defaultValue={defaultValue}
          maxLength={20000}
        />
      ) : (
        <input
          name={name}
          type={type}
          required={required}
          defaultValue={defaultValue}
          min={min}
          max={max}
          pattern={pattern}
          autoComplete={
            name === "password"
              ? "current-password"
              : name === "email"
                ? "email"
                : name === "full_name"
                  ? "name"
                  : "off"
          }
        />
      )}{" "}
      {children}
    </label>
  );
}
export function Form({
  children,
  onSubmit,
  submitLabel,
  initialClass = "",
}: {
  children: ReactNode;
  onSubmit: (d: Record<string, string>, f: HTMLFormElement) => Promise<unknown>;
  submitLabel?: string;
  initialClass?: string;
}) {
  const { T } = useL();
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [ok, setOk] = useState(false);
  async function send(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    setBusy(true);
    setError("");
    setOk(false);
    try {
      await onSubmit(
        Object.fromEntries(new FormData(form)) as Record<string, string>,
        form,
      );
      setOk(true);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <form className={`form ${initialClass}`} onSubmit={send}>
      {children}
      {error && (
        <div className="wide" role="alert">
          <Notice>{error}</Notice>
        </div>
      )}
      {ok && (
        <p className="success wide" role="status">
          {T("saved")}
        </p>
      )}
      <div className="wide form-actions">
        <Button type="submit" busy={busy}>
          {submitLabel || T("submit")}
          <ArrowUpRight size={17} />
        </Button>
      </div>
    </form>
  );
}
export function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const { T } = useL();
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal();
    const old = document.activeElement as HTMLElement;
    return () => old?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-head">
        <h2>{title}</h2>
        <button
          className="icon-button"
          onClick={onClose}
          aria-label={T("close")}
        >
          <X />
        </button>
      </div>
      <div className="modal-body">{children}</div>
    </dialog>
  );
}
export function DataState({
  loading,
  error,
  children,
}: {
  loading: boolean;
  error: string;
  children: ReactNode;
}) {
  const { T } = useL();
  return (
    <>
      {error && <Notice>{error}</Notice>}
      {loading && (
        <div className="loading" role="status">
          <LoaderCircle className="spin" size={16} />
          {T("loading")}
        </div>
      )}
      {children}
    </>
  );
}
export function DateText({ value }: { value: string }) {
  const { lang } = useL();
  return (
    <time dateTime={value}>
      {new Date(value).toLocaleString(
        lang === "ur" ? "ur-PK" : lang === "ar" ? "ar" : "en-PK",
        { dateStyle: "medium", timeStyle: "short" },
      )}
    </time>
  );
}
