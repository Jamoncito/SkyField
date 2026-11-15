import { tr } from "./i18n";
import { CloudRain, Thermometer, TrendingUp } from "lucide-react";
import { n } from "./client";
import { Plot } from "./Chart";
import type { ClimateContext, Option, Scenario } from "./types";
const months = tr("Ene Feb Mar Abr May Jun Jul Ago Sep Oct Nov Dic").split(" ");
export const scenarioNames: Record<Scenario, string> = {
  historical: tr("Histórico"),
  sensitivity: tr("Cambio personalizado"),
  elnino: tr("Súper Niño · +2 °C RONI"),
  lanina: tr("Súper Niña · −2 °C RONI"),
};
export function relativeChange(
  base: number | null | undefined,
  value: number | null | undefined,
) {
  return base != null && value != null && Math.abs(base) > 0.001
    ? (100 * (value - base)) / Math.abs(base)
    : null;
}
export function ClimateImpact({
  context,
  option,
  scenario,
  onScenario,
}: {
  context: ClimateContext;
  option?: Option;
  scenario: Scenario;
  onScenario: (s: Scenario) => void;
}) {
  if (context.status !== "available")
    return (
      <section className="card panel">
        <h2>{tr("Sensibilidad ENSO")}</h2>
        <p className="notice">{context.reason}</p>
      </section>
    );
  const caseName = scenario === "lanina" ? "lanina" : "elnino";
  const selected = context.months.map((m) => m[caseName]);
  const warming =
    context.months.reduce((sum, m) => sum + m.warming_decade_c, 0) / 12;
  const baseline = option?.metrics.historical;
  const metrics = option?.metrics[scenario];
  return (
    <section className="card panel climate-impact" data-tour="climate-impact">
      <div className="section-head">
        <div>
          <span className="section-kicker">
            <Thermometer size={16} />
            {tr(" Adaptación climática ")}
          </span>
          <h2>{tr("¿Cuánto cambia el riesgo de tu rotación?")}</h2>
          <p>
            {tr(" Clima mensual NASA POWER ")}
            {context.start}–{context.end}
            {tr(" y ENSO NOAA CPC ")}
          </p>
        </div>
      </div>
      <div className="scenario-pills" aria-label={tr("Sensibilidad climática")}>
        {Object.entries(scenarioNames).map(([key, label]) => (
          <button
            type="button"
            key={key}
            className={scenario === key ? "active" : ""}
            onClick={() => onScenario(key as Scenario)}
          >
            {label}
          </button>
        ))}
      </div>
      <p className="muted">
        {tr(
          " Los ±2 °C corresponden a la anomalía relativa del Pacífico Niño 3.4 usada para ensayar un evento muy fuerte. La respuesta local se estima por mes con la asociación histórica. La perturbación se mantiene durante las tres campañas como prueba de estrés sostenida. Cada porcentaje compara el déficit con el balance histórico del mismo lote y calendario. ",
        )}
      </p>
      <div className="impact-grid">
        <article>
          <TrendingUp size={20} />
          <small>{tr("Tendencia térmica local ajustada por ENSO")}</small>
          <strong>
            {warming >= 0 ? "+" : ""}
            {n(warming, 2)} °C
          </strong>
          <span>
            {tr(" por década, ")}
            {context.start}–{context.end}
          </span>
        </article>
        {(["elnino", "lanina"] as const).map((key) => {
          const m = option?.metrics[key],
            delta = relativeChange(baseline?.deficit_mm, m?.deficit_mm);
          return (
            <article key={key}>
              <CloudRain size={20} />
              <small>{scenarioNames[key]}</small>
              <strong>
                {delta == null
                  ? tr("Pendiente")
                  : (delta >= 0 ? "+" : "") + n(delta, 1) + " %"}
              </strong>
              <span>{tr("cambio del déficit hídrico acumulado")}</span>
              <p>
                {m?.deficit_mm != null
                  ? tr(
                      `${n(m.deficit_mm, 1)} mm frente a ${n(baseline?.deficit_mm, 1)} mm históricos.`,
                    )
                  : tr(
                      "Completa los datos de agua o activa un ensayo para simular el balance.",
                    )}
              </p>
              {baseline?.deficit_mm === 0 && (
                <p>
                  {tr(
                    "La base es cero. Consulta la diferencia absoluta en mm.",
                  )}
                </p>
              )}
            </article>
          );
        })}
      </div>
      {metrics && baseline && (
        <p className="chart-reading">
          {tr(" El escenario seleccionado acumula ")}
          {n(metrics.stress_days, 0)}
          {tr(" días de déficit y ")}
          {n(metrics.hot_days, 0)}
          {tr(" días de exposición a máximas ≥35 °C, frente a ")}
          {n(baseline.stress_days, 0)}
          {tr(" y ")}
          {n(baseline.hot_days, 0)} {tr(" históricos.")}{" "}
          {(metrics.deficit_mm ?? 0) > (baseline.deficit_mm ?? 0)
            ? tr(
                "Conviene contrastar opciones de menor demanda, mantener rastrojo y verificar reservas antes de sembrar.",
              )
            : tr(
                "Compara también el drenaje, la duración del ciclo y la cobertura antes de elegir.",
              )}
        </p>
      )}
      <div className="section-head">
        <div>
          <h3>
            {tr(" Respuesta mensual estimada a")}{" "}
            {caseName === "elnino" ? tr("El Niño") : tr("La Niña")}
          </h3>
          <p>
            {tr(
              " Cambio porcentual de lluvia frente al estado neutral ajustado por tendencia ",
            )}
          </p>
        </div>
      </div>
      <Plot
        label={tr(
          "Cambio mensual de lluvia asociado a un evento ENSO muy fuerte",
        )}
        data={[
          {
            type: "bar",
            x: months,
            y: selected.map((m) => m.rain_pct),
            marker: {
              color: selected.map((m) =>
                m.rain_pct < 0 ? "#bf8750" : "#448269",
              ),
            },
            error_y: {
              type: "data",
              symmetric: false,
              array: selected.map((m) =>
                Math.max(0, m.rain_ci[1] - m.rain_pct),
              ),
              arrayminus: selected.map((m) =>
                Math.max(0, m.rain_pct - m.rain_ci[0]),
              ),
              color: "#879b91",
            },
          },
        ]}
        layout={{
          yaxis: { title: tr("Cambio de lluvia (%)"), zeroline: true },
          showlegend: false,
        }}
      />
      <p className="chart-reading">
        {tr(
          " Una barra de −20 % representa 20 % menos lluvia mensual en la asociación estimada. Los bigotes muestran la incertidumbre de la pendiente. Si abarcan cero, la dirección de la respuesta es incierta con este ajuste. ",
        )}
      </p>
      <details className="form-details">
        <summary>{tr("Datos mensuales, extrapolación y método")}</summary>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tr("Mes")}</th>
                <th>{tr("Lluvia (%)")}</th>
                <th>{tr("IC 95 % (%)")}</th>
                <th>{tr("Temperatura (°C)")}</th>
                <th>{tr("Años")}</th>
                <th>{tr("Soporte")}</th>
              </tr>
            </thead>
            <tbody>
              {selected.map((m, i) => (
                <tr key={i}>
                  <td>{months[i]}</td>
                  <td>{n(m.rain_pct, 1)}</td>
                  <td>{m.rain_ci.map((x) => n(x, 1)).join(tr(" a "))}</td>
                  <td>{n(m.temp_c, 2)}</td>
                  <td>{m.n}</td>
                  <td>
                    {m.extrapolated
                      ? tr("Extrapolado fuera del índice observado")
                      : tr("Dentro del índice observado")}
                    {m.clipped ? tr(" · factor acotado") : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{context.method}</p>
        <p>{context.uncertainty}</p>
        <p>{context.climate_change}</p>
        {context.months.some((m) => m.validation) && (
          <>
            <h3>{tr("Validación retrospectiva de la asociación")}</h3>
            <p>
              {tr(
                "Entrenamiento creciente desde 20 años y evaluación en el año siguiente con RONI observado. La referencia utiliza solo la tendencia temporal. Un valor positivo de habilidad indica menor error cuadrático. La habilidad negativa exige cautela al interpretar ENSO.",
              )}
            </p>
            <div className="table-scroll">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>{tr("Mes")}</th>
                    <th>{tr("Años evaluados")}</th>
                    <th>{tr("RMSE lluvia (mm)")}</th>
                    <th>{tr("Habilidad lluvia (%)")}</th>
                    <th>{tr("RMSE temperatura (°C)")}</th>
                    <th>{tr("Habilidad temperatura (%)")}</th>
                  </tr>
                </thead>
                <tbody>
                  {context.months.map((m, i) => (
                    <tr key={i}>
                      <td>{months[i]}</td>
                      <td>{m.validation?.rain.n ?? "—"}</td>
                      <td>{n(m.validation?.rain.rmse, 1)}</td>
                      <td>{n(m.validation?.rain.skill_pct, 1)}</td>
                      <td>{n(m.validation?.temperature.rmse, 2)}</td>
                      <td>{n(m.validation?.temperature.skill_pct, 1)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <div className="source-links">
          <a href={context.source_url} target="_blank" rel="noreferrer">
            {tr(" NASA POWER mensual ")}
          </a>
          <a href={context.index_url} target="_blank" rel="noreferrer">
            NOAA CPC, RONI
          </a>
        </div>
      </details>
    </section>
  );
}
