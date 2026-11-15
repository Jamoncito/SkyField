import { tr } from "./i18n";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Banknote,
  CloudSun,
  Droplets,
  MapPin,
  Plus,
  Sprout,
} from "lucide-react";
import { api, day, errorText, n } from "./client";
import type { Go } from "./App";
import type { Market, Report, Run, RunSummary, Site, User } from "./types";
import { useMarket } from "./Economics";
import { Plot } from "./Chart";
import { WeatherPanel } from "./Weather";
import { DataQuality } from "./DataQuality";
export function RegionalDashboard({
  market,
  compact = false,
}: {
  market: Market;
  compact?: boolean;
}) {
  const [year, setYear] = useState(2024),
    [season, setSeason] = useState("summer");
  const [metric, setMetric] = useState<
    "production_t" | "yield_t_ha" | "area_ha"
  >("production_t");
  const index = market.agriculture.years.indexOf(year);
  const crops = market.agriculture.campaigns.filter((c) => c.season === season);
  const title = {
    production_t: tr("Producción (t)"),
    yield_t_ha: tr("Rendimiento (t/ha)"),
    area_ha: tr("Superficie sembrada (ha)"),
  }[metric];
  const top = [...crops].sort((a, b) => b[metric][index] - a[metric][index])[0];
  return (
    <section className="card panel regional-dashboard" data-tour="cao">
      <div className="section-head">
        <div>
          <span className="section-kicker">
            <Sprout size={16} />
            {tr(" Observatorio del oriente ")}
          </span>
          <h2>{tr("Santa Cruz en datos")}</h2>
          <p>
            {tr(" CAO · campañas agrícolas de ")}
            {year}
            {tr(" · datos regionales publicados ")}
          </p>
        </div>
        <label className="inline-select">
          {tr(" Año ")}
          <select
            aria-label={tr("Año CAO")}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
          >
            {market.agriculture.years.map((y) => (
              <option key={y}>{y}</option>
            ))}
          </select>
        </label>
      </div>
      <div className="dashboard-controls">
        <div className="segments" aria-label={tr("Campaña CAO")}>
          <button
            type="button"
            aria-pressed={season === "summer"}
            onClick={() => setSeason("summer")}
          >
            {tr(" Verano ")}
          </button>
          <button
            type="button"
            aria-pressed={season === "winter"}
            onClick={() => setSeason("winter")}
          >
            {tr(" Invierno ")}
          </button>
        </div>
        <select
          aria-label={tr("Indicador CAO")}
          value={metric}
          onChange={(e) => setMetric(e.target.value as typeof metric)}
        >
          <option value="production_t">{tr("Producción en toneladas")}</option>
          <option value="yield_t_ha">{tr("Rendimiento por hectárea")}</option>
          <option value="area_ha">{tr("Superficie sembrada")}</option>
        </select>
      </div>
      <Plot
        label={title + tr(" por cultivo en Santa Cruz, CAO ") + year}
        data={[
          {
            type: "bar",
            x: crops.map((c) => c.name),
            y: crops.map((c) => c[metric][index]),
            marker: {
              color: crops.map(
                (_, i) => ["#368067", "#93b642", "#5a9b6c", "#c4cc56"][i % 4],
              ),
            },
            hovertemplate: "%{x}<br>%{y:,.2f}<extra></extra>",
          },
        ]}
        layout={{
          yaxis: { title },
          showlegend: false,
          bargap: 0.48,
          margin: { l: 75, r: 15, t: 20, b: 50 },
        }}
      />
      <p className="chart-reading">
        <Sprout size={18} />
        {top && (
          <span>
            {top.name}
            {tr(" registra el mayor valor de este grupo, con")}{" "}
            {n(top[metric][index], metric === "yield_t_ha" ? 2 : 0)}{" "}
            {metric === "production_t"
              ? tr("toneladas")
              : metric === "yield_t_ha"
                ? "t/ha"
                : tr("hectáreas")}{" "}
            {tr(" en ")}
            {year}
            {tr(
              ". El volumen ayuda a reconocer cadenas y compradores. Contrasta rendimiento, costos y aptitud de tu propio terreno. ",
            )}
          </span>
        )}
      </p>
      {!compact && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tr("Cultivo")}</th>
                <th>{tr("Área (ha)")}</th>
                <th>{tr("Rendimiento (t/ha)")}</th>
                <th>{tr("Producción (t)")}</th>
                <th>
                  {tr(" Cambio de rendimiento frente a")}{" "}
                  {year === 2022 ? "—" : year - 1}
                </th>
              </tr>
            </thead>
            <tbody>
              {crops.map((c) => (
                <tr key={c.crop}>
                  <td>{c.name}</td>
                  <td>{n(c.area_ha[index], 0)}</td>
                  <td>{n(c.yield_t_ha[index], 2)}</td>
                  <td>{n(c.production_t[index], 0)}</td>
                  <td>
                    {index > 0
                      ? n(
                          100 *
                            (c.yield_t_ha[index] / c.yield_t_ha[index - 1] - 1),
                          1,
                        ) + " %"
                      : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <details className="form-details">
        <summary>{tr("Fuente y contexto de las campañas")}</summary>
        <p>{market.agriculture.note}</p>
        <p>
          {tr(" Publicación ")}
          {market.agriculture.published}
          {tr(". Cuadros de verano e invierno, páginas PDF 9 y 10. ")}
        </p>
        <div className="source-links">
          <a
            href={market.agriculture.document}
            target="_blank"
            rel="noreferrer"
          >
            {tr(" Informe CAO 2024 ")}
          </a>
          <a href={market.agriculture.url} target="_blank" rel="noreferrer">
            {tr(" Estadísticas de la CAO ")}
          </a>
        </div>
      </details>
    </section>
  );
}
export function SkyDashboard({
  user,
  sites,
  runs,
  reports,
  go,
}: {
  user: User;
  sites: Site[];
  runs: RunSummary[];
  reports: Report[];
  go: Go;
}) {
  const [fieldId, setFieldId] = useState(""),
    [run, setRun] = useState<Run>(),
    [error, setError] = useState("");
  const { market, error: marketError } = useMarket();
  const site = sites.find((s) => s.id === fieldId);
  const last = runs.find((r) => r.field_id === site?.id && r.status === "done");
  useEffect(() => {
    let active = true;
    setRun(undefined);
    setError("");
    if (last)
      void api<Run>("/analyses/" + last.id)
        .then((r) => {
          if (active) setRun(r);
        })
        .catch((e) => {
          if (active) setError(errorText(e));
        });
    return () => {
      active = false;
    };
  }, [last?.id]);
  const currentRun =
    run && run.field.id === site?.id && run.field.version === site?.version
      ? run
      : undefined;
  const output = currentRun?.result;
  const best =
    output?.alternatives.find(
      (o) => o.id === output.economics?.ranked_ids[0],
    ) ?? output?.alternatives[0];
  const budget = best?.economics;
  const costs =
    budget?.campaigns.filter((c) => c.cost_bob_ha !== null).length ?? 0;
  const percent = Math.round((costs / 3) * 100);
  const moisture = output?.moisture?.monthly.at(-1);
  const ph = currentRun?.inputs.soil_ph ?? output?.regional_soil?.surface.phh2o;
  const cropName =
    market?.agriculture.campaigns.find(
      (c) => c.crop === currentRun?.inputs.previous,
    )?.name ??
    (currentRun?.inputs.previous === "unknown"
      ? tr("Por declarar")
      : (currentRun?.inputs.previous ?? tr("Por declarar")));
  return (
    <>
      <div className="dashboard-heading" data-tour="dashboard">
        <div>
          <h1>
            {tr("Hola, ")}
            {user.name.split(" ")[0]}
          </h1>
          <p>{tr("Selecciona un lote para revisar su clima y presupuesto.")}</p>
        </div>
        <button className="button primary" onClick={() => go("/lotes/nuevo")}>
          <Plus size={17} />
          {tr(" Agregar lote ")}
        </button>
      </div>
      <section className="card panel field-picker" data-tour="field-picker">
        <div className="section-head">
          <div>
            <h2>{tr("Elige el lote que quieres revisar")}</h2>
            <p>
              {tr(
                "Abre un terreno para consultar su tiempo, suelo, análisis y presupuesto.",
              )}
            </p>
          </div>
        </div>
        {sites.length ? (
          <div className="field-choices">
            {sites.map((s) => (
              <button
                key={s.id}
                className={
                  "field-choice " + (s.id === fieldId ? "selected" : "")
                }
                aria-pressed={s.id === fieldId}
                onClick={() => setFieldId(s.id)}
              >
                <MapPin size={22} />
                <span>
                  <b>{s.name}</b>
                  <small>
                    {n(s.lat, 5)}°, {n(s.lon, 5)}°
                    {s.area_ha != null ? " · " + n(s.area_ha, 2) + " ha" : ""}
                  </small>
                </span>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        ) : (
          <p>
            {tr(
              "Todavía no hay lotes guardados. Crea tu primer terreno para comenzar.",
            )}
          </p>
        )}
      </section>
      {site && (
        <section className="sky-hero">
          <div>
            <h2>
              {tr(" Planifica tu próxima ")}
              <br />
              {tr(" rotación ")}
            </h2>
            <p>
              {tr(
                " Compara agua, cobertura y rentabilidad de tres campañas anuales. ",
              )}
            </p>
            <button
              className="button lime"
              onClick={() =>
                go(site ? "/lotes/" + site.id + "/analizar" : "/lotes/nuevo")
              }
            >
              {site ? tr("Planificar mi rotación") : tr("Crear mi primer lote")}
              <ArrowRight size={17} />
            </button>
          </div>
          <small>{tr("Vista agrícola aérea generada para SkyField")}</small>
        </section>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {site ? (
        <>
          <div className="farm-heading">
            <h2>{site.name}</h2>
            <select
              aria-label={tr("Lote del dashboard")}
              value={site.id}
              onChange={(e) => setFieldId(e.target.value)}
            >
              {sites.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
            <button
              className="text-button"
              onClick={() => go("/lotes/" + site.id)}
            >
              {tr(" Abrir ficha ")}
              <ArrowRight size={15} />
            </button>
          </div>
          <WeatherPanel
            key={site.id}
            fieldId={site.id}
            climate={output?.enso}
          />
          <DataQuality quality={output?.quality} />
          <div className="farm-strip">
            <div>
              <Sprout size={23} />
              <span>
                <small>{tr("Último cultivo declarado")}</small>
                <b>{cropName}</b>
              </span>
            </div>
            <div>
              <MapPin size={23} />
              <span>
                <small>{tr("Superficie delimitada")}</small>
                <b>
                  {site.area_ha == null
                    ? tr("Punto de consulta")
                    : n(site.area_ha, 2) + " ha"}
                </b>
              </span>
            </div>
            <div>
              <CloudSun size={23} />
              <span>
                <small>{tr("Último análisis")}</small>
                <b>
                  {currentRun ? day(currentRun.created) : tr("Por realizar")}
                </b>
              </span>
            </div>
          </div>
          <div className="farm-overview">
            <section className="card soil-summary">
              <div>
                <span>
                  <Droplets size={18} />
                  {tr(" Humedad radicular regional ")}
                </span>
                <strong>
                  {moisture
                    ? n(moisture.wetness, 0) + " %"
                    : tr("Por consultar")}
                </strong>
                <small>
                  {moisture
                    ? moisture.month +
                      tr(" · POWER GWETROOT, humedad relativa regional")
                    : tr("Aparece al analizar el lote")}
                </small>
              </div>
              <div>
                <span>{tr("pH del suelo")}</span>
                <strong>{ph == null ? tr("Por consultar") : n(ph, 1)}</strong>
                <small>
                  {currentRun?.inputs.soil_ph != null
                    ? tr("Medición declarada")
                    : tr("Predicción regional SoilGrids")}
                </small>
              </div>
              <div>
                <span>{tr("Lotes de tu cuenta")}</span>
                <strong>{sites.length}</strong>
                <small>
                  {reports.filter((r) => r.ready).length}
                  {tr(" informes disponibles ")}
                </small>
              </div>
            </section>
            <section className="card panel finance-overview">
              <div className="section-head">
                <h2>{tr("Finanzas de la rotación")}</h2>
                <Banknote className="green" size={22} />
              </div>
              <div className="finance-content">
                <div
                  className="budget-ring"
                  style={{
                    background: `conic-gradient(#3d846b ${percent}%,#e9efe8 0)`,
                  }}
                >
                  <div>
                    <strong>{percent}%</strong>
                    <small>{tr("costos completos")}</small>
                  </div>
                </div>
                <div className="finance-numbers">
                  <div>
                    <small>{tr("Ingreso bruto estimado · Bs/ha")}</small>
                    <strong>{n(budget?.revenue_bob_ha, 0)}</strong>
                  </div>
                  <div>
                    <small>{tr("Utilidad estimada · Bs/ha")}</small>
                    <strong>{n(budget?.net_bob_ha, 0)}</strong>
                  </div>
                </div>
              </div>
              <p className="muted">
                {best
                  ? best.names.join(" → ") + tr(" · total de tres campañas")
                  : tr("Configura un análisis para comparar tus opciones.")}
              </p>
              <button
                className="text-button"
                onClick={() =>
                  go(
                    currentRun
                      ? "/comparar/" + currentRun.id
                      : "/lotes/" + site.id + "/analizar",
                  )
                }
              >
                {currentRun
                  ? tr("Revisar clima y rentabilidad")
                  : tr("Preparar presupuesto")}
                <ArrowRight size={15} />
              </button>
            </section>
          </div>
          {market && <RegionalDashboard market={market} compact />}
        </>
      ) : !sites.length ? (
        <section className="card panel first-field">
          <Sprout size={28} />
          <h2>{tr("Comienza con tu primer terreno")}</h2>
          <p>
            {tr(
              " Elige un punto, usa el piloto de Santa Cruz o dibuja tu lote en el mapa. ",
            )}
          </p>
          <button className="button primary" onClick={() => go("/lotes/nuevo")}>
            {tr(" Crear mi primer lote ")}
            <ArrowRight size={16} />
          </button>
        </section>
      ) : null}
      {marketError && <p className="error">{marketError}</p>}
    </>
  );
}
