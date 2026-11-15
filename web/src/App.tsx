import { tr } from "./i18n";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowDownToLine,
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  FileText,
  Globe2,
  LayoutDashboard,
  Leaf,
  MapPin,
  Menu,
  Plus,
  Sprout,
  X,
  Info,
} from "lucide-react";
import { api, day, errorText, n, post, session, ApiError } from "./client";
import type { Report, RunSummary, Site, User } from "./types";
import { FieldEditor } from "./FieldEditor";
import { Compare } from "./Compare";
import { OFFLINE_MAP } from "./offline";
import { GuidedTour } from "./GuidedTour";
import { SkyDashboard } from "./Dashboard";
import { CropLibrary } from "./CropLibrary";
import { About } from "./About";
import { LanguageSwitch } from "./LanguageSwitch";
const RegionalMap = lazy(() => import("./Map"));
function OfflineMap() {
  return (
    <main className="main offline-page">
      <Brand />
      <h1>{tr("Mapa sin conexión de Santa Cruz")}</h1>
      <p>
        {tr(
          "Límites de provincias y referencias municipales. Busca un lugar, consulta coordenadas o dibuja para orientarte.",
        )}
      </p>
      <p className="muted">
        {tr(
          "Para guardar lotes, consultar suelo o ejecutar análisis, vuelve al ",
        )}
        <a href="/">{tr("panel en línea")}</a>.
      </p>
      <LanguageSwitch />
      <Suspense fallback={<p>{tr("Cargando mapa…")}</p>}>
        <RegionalMap initial={null} offline onShape={() => {}} />
      </Suspense>
    </main>
  );
}
function useLocation() {
  const [path, setPath] = useState(window.location.pathname);
  useEffect(() => {
    const handler = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handler);
    return () => window.removeEventListener("popstate", handler);
  }, []);
  function go(next: string) {
    if (path !== next) {
      window.history.pushState({}, "", next);
      setPath(next);
      window.scrollTo(0, 0);
    }
  }
  return { path, go };
}
export type Go = (path: string) => void;
const navigation = [
  { name: tr("Panel"), path: "/", Icon: LayoutDashboard },
  { name: tr("Mis lotes"), path: "/lotes", Icon: MapPin },
  { name: tr("Cultivos y mercados"), path: "/cultivos", Icon: Sprout },
  { name: tr("Comparar rotaciones"), path: "/comparar", Icon: Activity },
  { name: tr("Informes"), path: "/informes", Icon: FileText },
  { name: tr("Acerca de"), path: "/about", Icon: Info },
];
function Brand() {
  return (
    <div className="brand">
      <img src="/favicon.svg" alt="" width="42" height="42" />
      <div>
        <b>SkyField</b>
        <small>{tr("Planificación agrícola")}</small>
      </div>
    </div>
  );
}
function SiteRow({ site, go }: { site: Site; go: Go }) {
  return (
    <button className="site-row" onClick={() => go("/lotes/" + site.id)}>
      <span className="site-icon">
        <MapPin size={19} />
      </span>
      <span className="site-name">
        <b>{site.name}</b>
        <small>
          {site.lat.toFixed(5)}°, {site.lon.toFixed(5)}° ·{" "}
          {site.area_ha === null
            ? tr("Punto exploratorio")
            : n(site.area_ha, 2) + " ha"}
        </small>
      </span>
      {site.pilot && <span className="chip">{tr("Piloto")}</span>}
      <ArrowRight className="site-arrow" size={17} />
    </button>
  );
}
export function App() {
  return window.location.pathname === OFFLINE_MAP ? (
    <OfflineMap />
  ) : (
    <Workspace />
  );
}
function Workspace() {
  const { path, go } = useLocation();
  const [user, setUser] = useState<User | null>(),
    [initialError, setInitialError] = useState("");
  const [sites, setSites] = useState<Site[]>([]),
    [runs, setRuns] = useState<RunSummary[]>([]),
    [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState(""),
    [menu, setMenu] = useState(false),
    [profile, setProfile] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideField, setGuideField] = useState<string>();
  const guideClaim = useRef("");
  const [slow, setSlow] = useState(false);
  function signed(u: User | null) {
    session(u);
    setUser(u);
    if (!u) {
      setShowGuide(false);
      setGuideField(undefined);
      guideClaim.current = "";
    }
  }
  function loadUser() {
    setInitialError("");
    void post<User>("/auth/guest")
      .then(signed)
      .catch((err) => setInitialError(errorText(err)));
  }
  useEffect(loadUser, []);
  useEffect(() => {
    const timer = window.setTimeout(() => setSlow(true), 12000);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    if (!user || user.guide_seen || guideClaim.current === user.id) return;
    guideClaim.current = user.id;
    void post<{
      show: boolean;
    }>("/me/guide/start")
      .then((result) => {
        setUser((current) =>
          current?.id === user.id ? { ...current, guide_seen: true } : current,
        );
        if (result.show) {
          go("/");
          setShowGuide(true);
        }
      })
      .catch((err) => {
        guideClaim.current = "";
        setError(errorText(err));
      });
  }, [user]);
  async function refresh() {
    try {
      const [s, a, r] = await Promise.all([
        api<Site[]>("/fields"),
        api<RunSummary[]>("/analyses"),
        api<Report[]>("/reports"),
      ]);
      setSites(s);
      setRuns(a);
      setReports(r);
      setError("");
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        signed(null);
        loadUser();
      } else setError(errorText(err));
    }
  }
  useEffect(() => {
    if (user) void refresh();
  }, [user, path]);
  useEffect(() => {
    if (
      !user ||
      ![...runs, ...reports].some(
        (x) => x.status === "queued" || x.status === "running",
      )
    )
      return;
    const timer = window.setInterval(() => void refresh(), 3500);
    return () => clearInterval(timer);
  }, [user, runs, reports]);
  if (initialError)
    return (
      <main className="empty app-empty">
        <Sprout size={31} />
        <h1>{tr("Abriendo SkyField")}</h1>
        <p>{initialError}</p>
        <button className="button primary" onClick={loadUser}>
          {tr("Reintentar")}
        </button>
      </main>
    );
  if (user == null)
    return (
      <main className="empty app-empty">
        <Sprout size={31} />
        <h1>{tr("Conectando con SkyField")}</h1>
        <p>
          {slow
            ? tr(
                "El alojamiento gratuito puede tardar alrededor de un minuto en activarse después de una pausa.",
              )
            : tr("Abriendo tu espacio de planificación…")}
        </p>
        {slow && (
          <button className="button secondary" onClick={loadUser}>
            {tr("Reintentar conexión")}
          </button>
        )}
      </main>
    );
  const parts = path.split("/").filter(Boolean);
  const section = parts[0] ?? "";
  const title =
    navigation.find((x) => x.path === (section ? "/" + section : "/"))?.name ??
    tr("Panel");
  const route = (url: string) => {
    go(url);
    setMenu(false);
    setProfile(false);
  };
  const firstName = user.name.split(" ")[0];
  return (
    <div className="shell">
      {menu && (
        <button
          className="overlay"
          aria-label={tr("Cerrar menú")}
          onClick={() => setMenu(false)}
        />
      )}
      <aside className={"sidebar " + (menu ? "open" : "")}>
        <button className="brand-button" onClick={() => route("/")}>
          <Brand />
        </button>
        <div className="nav-label">{tr("ESPACIO DE TRABAJO")}</div>
        <nav data-tour="navigation" aria-label={tr("Navegación principal")}>
          {navigation.map(({ name, path: url, Icon }) => {
            const active = url === "/" ? path === "/" : path.startsWith(url);
            return (
              <button
                key={url}
                aria-current={active ? "page" : undefined}
                className={active ? "active" : ""}
                onClick={() => route(url)}
              >
                <Icon size={18} />
                <span>{name}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <LanguageSwitch />
          <div className="side-source">
            <span className="source-symbol">
              <Globe2 size={18} />
            </span>
            <span>
              <b>NASA POWER</b>
              <small>{tr("Fuente de clima histórico")}</small>
            </span>
          </div>
          <div className="sidebar-bottom">
            <span className="status-dot" />
            {tr(" Aplicación web ")}
            <Leaf size={13} />
          </div>
        </div>
      </aside>
      <div className="surface">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              data-tour="mobile-navigation"
              className="icon-btn mobile-menu"
              aria-label={tr("Abrir menú")}
              onClick={() => setMenu(!menu)}
            >
              {menu ? <X size={20} /> : <Menu size={20} />}
            </button>
            <span className="crumb-home">{tr("Espacio de trabajo")}</span>
            <span className="slash">/</span>
            <strong>{title}</strong>
          </div>
          <div className="profile-wrap">
            <button
              data-tour="profile"
              className="profile"
              aria-expanded={profile}
              onClick={() => setProfile(!profile)}
            >
              <span className="avatar">{user.name[0].toUpperCase()}</span>
              <b>{firstName}</b>
              <ChevronDown size={14} />
            </button>
            {profile && (
              <div className="profile-menu card">
                <b>{user.name}</b>
                <button
                  className="button secondary"
                  onClick={() => {
                    route("/");
                    setGuideField(undefined);
                    setShowGuide(true);
                  }}
                >
                  {tr("Ver guía")}
                </button>
              </div>
            )}
          </div>
        </header>
        <main className="main">
          {error && (
            <div className="error" role="alert">
              {error}{" "}
              <button className="text-button" onClick={refresh}>
                {tr("Reintentar")}
              </button>
            </div>
          )}
          {section === "" && (
            <SkyDashboard
              user={user}
              sites={sites}
              runs={runs}
              reports={reports}
              go={route}
            />
          )}
          {section === "cultivos" && <CropLibrary />}
          {section === "about" && <About />}
          {section === "lotes" && !parts[1] && (
            <>
              <div className="page-heading" data-tour="lots">
                <div>
                  <h1>{tr("Mis lotes")}</h1>
                  <p>
                    {tr(
                      "Dibuja tu terreno o guarda un punto de consulta exploratorio.",
                    )}
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => route("/lotes/nuevo")}
                >
                  <Plus size={18} />
                  {tr(" Nuevo lote")}
                </button>
              </div>
              <section className="card panel">
                {sites.length ? (
                  sites.map((s) => <SiteRow site={s} go={route} key={s.id} />)
                ) : (
                  <p className="muted">
                    {tr("Todavía no hay lotes guardados.")}
                  </p>
                )}
              </section>
            </>
          )}
          {section === "lotes" && parts[1] && (
            <FieldEditor
              key={parts[1]}
              id={parts[1] === "nuevo" ? null : parts[1]}
              analyzing={parts[2] === "analizar"}
              go={route}
              refresh={refresh}
              onSaved={(s) => {
                if (showGuide) setGuideField(s.id);
              }}
            />
          )}
          {section === "comparar" && parts[1] && (
            <Compare
              key={parts[1]}
              id={parts[1]}
              summary={runs.find((r) => r.id === parts[1])}
              go={route}
              refresh={refresh}
            />
          )}
          {section === "comparar" && !parts[1] && (
            <>
              <div className="page-heading" data-tour="runs">
                <div>
                  <h1>{tr("Comparar rotaciones")}</h1>
                  <p>
                    {tr(
                      "Consulta los escenarios y recupera análisis guardados.",
                    )}
                  </p>
                </div>
                <button
                  className="button primary"
                  onClick={() => route("/lotes")}
                >
                  <MapPin size={17} />
                  {tr(" Elegir lote")}
                </button>
              </div>
              <section className="card panel">
                {runs.length ? (
                  runs.map((run) => (
                    <button
                      key={run.id}
                      className="site-row"
                      onClick={() => route("/comparar/" + run.id)}
                    >
                      <span className="site-icon">
                        <Activity size={19} />
                      </span>
                      <span className="site-name">
                        <b>{run.field_name}</b>
                        <small>{day(run.created)}</small>
                      </span>
                      <StatusChip status={run.status} />
                      <ArrowRight size={17} />
                    </button>
                  ))
                ) : (
                  <Empty
                    icon="analysis"
                    title={tr("Tu primera comparación")}
                    text={tr(
                      "Abre un lote y selecciona Analizar para comparar rotaciones.",
                    )}
                  />
                )}
              </section>
            </>
          )}
          {section === "informes" && (
            <>
              <div className="page-heading" data-tour="reports">
                <div>
                  <h1>{tr("Informes")}</h1>
                  <p>
                    {tr(
                      "Descarga los documentos y la evidencia de los análisis.",
                    )}
                  </p>
                </div>
                <button
                  className="button secondary"
                  onClick={() => route("/comparar")}
                >
                  <ArrowLeft size={16} />
                  {tr(" Comparaciones")}
                </button>
              </div>
              <section className="card panel">
                {reports.length ? (
                  reports.map((r) => (
                    <article key={r.id} className="report-row">
                      <div className="site-name">
                        <b>{r.field_name}</b>
                        <small>
                          {day(r.created)} · Folio {r.id.slice(0, 8)}
                        </small>
                      </div>
                      <StatusChip status={r.status} />
                      {r.ready ? (
                        <div className="button-row">
                          <a
                            className="button primary small"
                            href={"/api/reports/" + r.id + "/pdf"}
                          >
                            <ArrowDownToLine size={16} /> PDF
                          </a>
                          <a
                            className="button secondary small"
                            href={"/api/reports/" + r.id + "/csv"}
                          >
                            CSV
                          </a>
                          <a
                            className="button secondary small"
                            href={"/api/reports/" + r.id + "/daily"}
                          >
                            {tr("Serie diaria")}
                          </a>
                        </div>
                      ) : (
                        ["failed", "cancelled"].includes(r.status) && (
                          <button
                            className="button secondary small"
                            onClick={() =>
                              void post("/jobs/" + r.job_id + "/retry")
                                .then(refresh)
                                .catch((e) => setError(errorText(e)))
                            }
                          >
                            {tr("Reintentar")}
                          </button>
                        )
                      )}
                    </article>
                  ))
                ) : (
                  <Empty
                    icon="report"
                    title={tr("Aún no hay informes")}
                    text={tr(
                      "Abre una comparación y selecciona la rotación que quieres exportar.",
                    )}
                  />
                )}
              </section>
            </>
          )}
        </main>
      </div>
      {showGuide && (
        <GuidedTour
          pilot={guideField}
          navigate={route}
          onFinish={() => setShowGuide(false)}
        />
      )}
    </div>
  );
}
export function Empty({
  icon,
  title,
  text,
}: {
  icon: "analysis" | "report";
  title: string;
  text: string;
}) {
  return (
    <div className="empty">
      <span className="metric-icon">
        {icon === "analysis" ? <Activity size={22} /> : <FileText size={22} />}
      </span>
      <h2>{title}</h2>
      <p>{text}</p>
    </div>
  );
}
export function StatusChip({ status }: { status: RunSummary["status"] }) {
  return (
    <span className={"chip " + (status === "failed" ? "chip-error" : "")}>
      {
        {
          queued: tr("En cola"),
          running: tr("En proceso"),
          done: tr("Listo"),
          failed: tr("Requiere atención"),
          cancelled: tr("Cancelado"),
        }[status]
      }
    </span>
  );
}
