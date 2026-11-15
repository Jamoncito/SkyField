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
    production_t: "Producción (t)",
    yield_t_ha: "Rendimiento (t/ha)",
    area_ha: "Superficie sembrada (ha)",
  }[metric];
  const top = [...crops].sort((a, b) => b[metric][index] - a[metric][index])[0];
  return (
    <section className="card panel regional-dashboard" data-tour="cao">
      <div className="section-head">
        <div>
          <span className="section-kicker">
            <Sprout size={16} /> Observatorio del oriente
          </span>
          <h2>Santa Cruz en datos</h2>
          <p>
            CAO · campañas agrícolas de {year} · datos regionales publicados
          </p>
        </div>
        <label className="inline-select">
          Año
          <select
            aria-label="Año CAO"
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
        <div className="segments" aria-label="Campaña CAO">
          <button
            type="button"
            aria-pressed={season === "summer"}
            onClick={() => setSeason("summer")}
          >
            Verano
          </button>
          <button
            type="button"
            aria-pressed={season === "winter"}
            onClick={() => setSeason("winter")}
          >
            Invierno
          </button>
        </div>
        <select
          aria-label="Indicador CAO"
          value={metric}
          onChange={(e) => setMetric(e.target.value as typeof metric)}
        >
          <option value="production_t">Producción en toneladas</option>
          <option value="yield_t_ha">Rendimiento por hectárea</option>
          <option value="area_ha">Superficie sembrada</option>
        </select>
      </div>
      <Plot
        label={title + " por cultivo en Santa Cruz, CAO " + year}
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
            {top.name} registra el mayor valor de este grupo, con{" "}
            {n(top[metric][index], metric === "yield_t_ha" ? 2 : 0)}{" "}
            {metric === "production_t"
              ? "toneladas"
              : metric === "yield_t_ha"
                ? "t/ha"
                : "hectáreas"}{" "}
            en {year}. El volumen ayuda a reconocer cadenas y compradores.
            Contrasta rendimiento, costos y aptitud de tu propio terreno.
          </span>
        )}
      </p>
      {!compact && (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Cultivo</th>
                <th>Área (ha)</th>
                <th>Rendimiento (t/ha)</th>
                <th>Producción (t)</th>
                <th>
                  Cambio de rendimiento frente a{" "}
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
        <summary>Fuente y contexto de las campañas</summary>
        <p>{market.agriculture.note}</p>
        <p>
          Publicación {market.agriculture.published}. Cuadros de verano e
          invierno, páginas PDF 9 y 10.
        </p>
        <div className="source-links">
          <a
            href={market.agriculture.document}
            target="_blank"
            rel="noreferrer"
          >
            Informe CAO 2024
          </a>
          <a href={market.agriculture.url} target="_blank" rel="noreferrer">
            Estadísticas de la CAO
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
  const site = sites.find((s) => s.id === fieldId) ?? sites[0];
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
    market?.agriculture.campaigns.find((c) => c.crop === run?.inputs.previous)
      ?.name ??
    (run?.inputs.previous === "unknown"
      ? "Por declarar"
      : (run?.inputs.previous ?? "Por declarar"));
  return (
    <>
      <div className="dashboard-heading" data-tour="dashboard">
        <div>
          <h1>Hola, {user.name.split(" ")[0]}</h1>
          <p>Selecciona un lote para revisar su clima y presupuesto.</p>
        </div>
        <button className="button primary" onClick={() => go("/lotes/nuevo")}>
          <Plus size={17} /> Agregar lote
        </button>
      </div>
      <section className="sky-hero">
        <div>
          <h2>
            Planifica tu próxima
            <br />
            rotación
          </h2>
          <p>
            Compara agua, cobertura y rentabilidad de tres campañas anuales.
          </p>
          <button
            className="button lime"
            onClick={() =>
              go(site ? "/lotes/" + site.id + "/analizar" : "/lotes/nuevo")
            }
          >
            {site ? "Planificar mi rotación" : "Crear mi primer lote"}
            <ArrowRight size={17} />
          </button>
        </div>
        <small>Vista agrícola aérea generada para SkyField</small>
      </section>
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
              aria-label="Lote del dashboard"
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
              Abrir ficha <ArrowRight size={15} />
            </button>
          </div>
          <div className="farm-strip">
            <div>
              <Sprout size={23} />
              <span>
                <small>Último cultivo declarado</small>
                <b>{cropName}</b>
              </span>
            </div>
            <div>
              <MapPin size={23} />
              <span>
                <small>Superficie delimitada</small>
                <b>
                  {site.area_ha == null
                    ? "Punto de consulta"
                    : n(site.area_ha, 2) + " ha"}
                </b>
              </span>
            </div>
            <div>
              <CloudSun size={23} />
              <span>
                <small>Último análisis</small>
                <b>{run ? day(run.created) : "Por realizar"}</b>
              </span>
            </div>
          </div>
          <div className="farm-overview">
            <section className="card soil-summary">
              <div>
                <span>
                  <Droplets size={18} /> Humedad radicular regional
                </span>
                <strong>
                  {moisture ? n(moisture.wetness, 0) + " %" : "Por consultar"}
                </strong>
                <small>
                  {moisture
                    ? moisture.month +
                      " · POWER GWETROOT, humedad relativa regional"
                    : "Aparece al analizar el lote"}
                </small>
              </div>
              <div>
                <span>pH del suelo</span>
                <strong>{ph == null ? "Por consultar" : n(ph, 1)}</strong>
                <small>
                  {run?.inputs.soil_ph != null
                    ? "Medición declarada"
                    : "Predicción regional SoilGrids"}
                </small>
              </div>
              <div>
                <span>Lotes de tu cuenta</span>
                <strong>{sites.length}</strong>
                <small>
                  {reports.filter((r) => r.ready).length} informes disponibles
                </small>
              </div>
            </section>
            <section className="card panel finance-overview">
              <div className="section-head">
                <h2>Finanzas de la rotación</h2>
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
                    <small>costos completos</small>
                  </div>
                </div>
                <div className="finance-numbers">
                  <div>
                    <small>Ingreso bruto estimado · Bs/ha</small>
                    <strong>{n(budget?.revenue_bob_ha, 0)}</strong>
                  </div>
                  <div>
                    <small>Utilidad estimada · Bs/ha</small>
                    <strong>{n(budget?.net_bob_ha, 0)}</strong>
                  </div>
                </div>
              </div>
              <p className="muted">
                {best
                  ? best.names.join(" → ") + " · total de tres campañas"
                  : "Configura un análisis para comparar tus opciones."}
              </p>
              <button
                className="text-button"
                onClick={() =>
                  go(
                    run
                      ? "/comparar/" + run.id
                      : "/lotes/" + site.id + "/analizar",
                  )
                }
              >
                {run ? "Revisar clima y rentabilidad" : "Preparar presupuesto"}
                <ArrowRight size={15} />
              </button>
            </section>
          </div>
          <WeatherPanel fieldId={site.id} initial={output?.weather} compact />
        </>
      ) : (
        <section className="card panel first-field">
          <Sprout size={28} />
          <h2>Comienza con tu primer terreno</h2>
          <p>
            Elige un punto, usa el piloto de Santa Cruz o dibuja tu lote en el
            mapa.
          </p>
          <button className="button primary" onClick={() => go("/lotes/nuevo")}>
            Crear mi primer lote <ArrowRight size={16} />
          </button>
        </section>
      )}
      {market && <RegionalDashboard market={market} compact />}
      {marketError && <p className="error">{marketError}</p>}
    </>
  );
}
