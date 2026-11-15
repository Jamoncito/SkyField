import { CloudRain, Thermometer, TrendingUp } from "lucide-react";
import { n } from "./client";
import { Plot } from "./Chart";
import type { ClimateContext, Option, Scenario } from "./types";

const months = "Ene Feb Mar Abr May Jun Jul Ago Sep Oct Nov Dic".split(" ");
export const scenarioNames: Record<Scenario, string> = {
  historical: "Histórico",
  sensitivity: "Cambio personalizado",
  elnino: "Súper Niño · +2 °C RONI",
  lanina: "Súper Niña · −2 °C RONI",
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
        <h2>Sensibilidad ENSO</h2>
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
            <Thermometer size={16} /> Adaptación climática
          </span>
          <h2>¿Cuánto cambia el riesgo de tu rotación?</h2>
          <p>
            Clima mensual NASA POWER {context.start}–{context.end} y ENSO NOAA
            CPC
          </p>
        </div>
      </div>
      <div className="scenario-pills" aria-label="Sensibilidad climática">
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
        Los ±2 °C corresponden a la anomalía relativa del Pacífico Niño 3.4
        usada para ensayar un evento muy fuerte. La respuesta local se estima
        por mes con la asociación histórica. La perturbación se mantiene durante
        las tres campañas como prueba de estrés sostenida. Cada porcentaje
        compara el déficit con el balance histórico del mismo lote y calendario.
      </p>
      <div className="impact-grid">
        <article>
          <TrendingUp size={20} />
          <small>Tendencia térmica local ajustada por ENSO</small>
          <strong>
            {warming >= 0 ? "+" : ""}
            {n(warming, 2)} °C
          </strong>
          <span>
            por década, {context.start}–{context.end}
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
                  ? "Pendiente"
                  : (delta >= 0 ? "+" : "") + n(delta, 1) + " %"}
              </strong>
              <span>cambio del déficit hídrico acumulado</span>
              <p>
                {m?.deficit_mm != null
                  ? `${n(m.deficit_mm, 1)} mm frente a ${n(baseline?.deficit_mm, 1)} mm históricos.`
                  : "Completa los datos de agua o activa un ensayo para simular el balance."}
              </p>
              {baseline?.deficit_mm === 0 && (
                <p>La base es cero. Consulta la diferencia absoluta en mm.</p>
              )}
            </article>
          );
        })}
      </div>
      {metrics && baseline && (
        <p className="chart-reading">
          El escenario seleccionado acumula {n(metrics.stress_days, 0)} días de
          déficit y {n(metrics.hot_days, 0)} días de exposición a máximas ≥35
          °C, frente a {n(baseline.stress_days, 0)} y {n(baseline.hot_days, 0)}{" "}
          históricos.{" "}
          {(metrics.deficit_mm ?? 0) > (baseline.deficit_mm ?? 0)
            ? "Conviene contrastar opciones de menor demanda, mantener rastrojo y verificar reservas antes de sembrar."
            : "Compara también el drenaje, la duración del ciclo y la cobertura antes de elegir."}
        </p>
      )}
      <div className="section-head">
        <div>
          <h3>
            Respuesta mensual estimada a{" "}
            {caseName === "elnino" ? "El Niño" : "La Niña"}
          </h3>
          <p>
            Cambio porcentual de lluvia frente al estado neutral ajustado por
            tendencia
          </p>
        </div>
      </div>
      <Plot
        label="Cambio mensual de lluvia asociado a un evento ENSO muy fuerte"
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
          yaxis: { title: "Cambio de lluvia (%)", zeroline: true },
          showlegend: false,
        }}
      />
      <p className="chart-reading">
        Una barra de −20 % representa 20 % menos lluvia mensual en la asociación
        estimada. Los bigotes muestran la incertidumbre de la pendiente. Si
        abarcan cero, la dirección de la respuesta es incierta con este ajuste.
      </p>
      <details className="form-details">
        <summary>Datos mensuales, extrapolación y método</summary>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Mes</th>
                <th>Lluvia (%)</th>
                <th>IC 95 % (%)</th>
                <th>Temperatura (°C)</th>
                <th>Años</th>
                <th>Soporte</th>
              </tr>
            </thead>
            <tbody>
              {selected.map((m, i) => (
                <tr key={i}>
                  <td>{months[i]}</td>
                  <td>{n(m.rain_pct, 1)}</td>
                  <td>{m.rain_ci.map((x) => n(x, 1)).join(" a ")}</td>
                  <td>{n(m.temp_c, 2)}</td>
                  <td>{m.n}</td>
                  <td>
                    {m.extrapolated
                      ? "Extrapolado fuera del índice observado"
                      : "Dentro del índice observado"}
                    {m.clipped ? " · factor acotado" : ""}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>{context.method}</p>
        <p>{context.uncertainty}</p>
        <p>{context.climate_change}</p>
        <div className="source-links">
          <a href={context.source_url} target="_blank" rel="noreferrer">
            NASA POWER mensual
          </a>
          <a href={context.index_url} target="_blank" rel="noreferrer">
            NOAA CPC, RONI
          </a>
        </div>
      </details>
    </section>
  );
}
