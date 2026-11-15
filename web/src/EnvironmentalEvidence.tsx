import { tr } from "./i18n";
import { useState } from "react";
import { n } from "./client";
import { Plot } from "./Chart";
import type { Environment, Option, Scenario } from "./types";
import { scenarioNames } from "./ClimateImpact";
export function EnvironmentalEvidence({
  environment,
  option,
  scenario,
}: {
  environment: Environment;
  option?: Option;
  scenario: Scenario;
}) {
  const [index, setIndex] = useState(environment.monthly.length - 1);
  const current = environment.monthly[index];
  const timeline = option?.timeline?.[scenario] ?? [];
  return (
    <section className="card panel" data-tour="environment">
      <div className="section-head">
        <div>
          <h2>{tr("Clima, humedad y períodos de estrés")}</h2>
          <p>{environment.alignment}</p>
        </div>
      </div>
      {current && (
        <>
          <label className="timeline-control">
            {tr("Mes analizado")}
            <input
              aria-label={tr("Mes del histórico ambiental")}
              type="range"
              min={0}
              max={environment.monthly.length - 1}
              value={index}
              onChange={(e) => setIndex(Number(e.target.value))}
            />
            <b>{current.month}</b>
          </label>
          <div className="signal-readout">
            {[
              [tr("Precipitación"), n(current.rain_mm, 1) + " mm"],
              [tr("Demanda ET₀"), n(current.et0_mm, 1) + " mm"],
              [tr("Temperatura"), n(current.temp_c, 1) + " °C"],
              [tr("Anomalía de humedad"), n(current.anomaly, 1) + " pp"],
            ].map(([label, value]) => (
              <div key={label}>
                <small>{label}</small>
                <b>{value}</b>
              </div>
            ))}
          </div>
          <p>
            {current.phase}
            {current.balance_mm !== null && (
              <>
                {tr(" · lluvia menos ET₀ ")}
                {n(current.balance_mm, 1)} mm.
              </>
            )}{" "}
            {current.anomaly !== null &&
              current.anomaly < 0 &&
              tr(
                "La humedad radicular regional está por debajo de la mediana de este mes del año.",
              )}
          </p>
        </>
      )}
      <Plot
        label={tr("Histórico mensual de oferta y demanda de agua")}
        data={[
          {
            type: "bar",
            name: tr("Lluvia − ET₀ (mm)"),
            x: environment.monthly.map((m) => m.month),
            y: environment.monthly.map((m) => m.balance_mm),
            marker: {
              color: environment.monthly.map((m) =>
                (m.balance_mm ?? 0) < 0 ? "#b97443" : "#5a8c68",
              ),
            },
          },
          {
            type: "scatter",
            name: tr("Anomalía humedad (pp)"),
            yaxis: "y2",
            x: environment.monthly.map((m) => m.month),
            y: environment.monthly.map((m) => m.anomaly),
            line: { color: "#456eaa", width: 1.5 },
          },
        ]}
        layout={{
          yaxis: { title: "mm" },
          yaxis2: { title: "pp", overlaying: tr("y"), side: "right" },
          legend: { orientation: "h" },
          shapes: current
            ? [
                {
                  type: "line",
                  x0: current.month,
                  x1: current.month,
                  y0: 0,
                  y1: 1,
                  yref: "paper",
                  line: { color: "#123e30", dash: "dot" },
                },
              ]
            : [],
        }}
      />
      <p className="chart-reading">
        {tr(
          "Barras bajo cero indican lluvia menor que la demanda ET₀ en ese mes. La línea muestra si la humedad radicular estuvo por encima o por debajo de su mediana estacional. Su coincidencia ayuda a reconocer períodos que requieren revisar el agua disponible.",
        )}
      </p>
      <details className="form-details">
        <summary>
          {tr("Datos armonizados por mes y cobertura disponible")}
        </summary>
        <p>
          {environment.method} {environment.support}
        </p>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                {[
                  tr("Mes"),
                  tr("Lluvia (mm)"),
                  "ET₀ (mm)",
                  "Temp. (°C)",
                  tr("Humedad radicular relativa (%)"),
                  tr("Anomalía (pp)"),
                ].map((x) => (
                  <th key={x}>{x}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {environment.monthly.map((m) => (
                <tr key={m.month}>
                  <td>{m.month}</td>
                  {[m.rain_mm, m.et0_mm, m.temp_c, m.wetness, m.anomaly].map(
                    (v, i) => (
                      <td key={i}>{n(v, 1)}</td>
                    ),
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <details className="form-details">
        <summary>{tr("Comparación estadística de tendencias")}</summary>
        <div className="table-scroll">
          <table className="data-table signal-table">
            <thead>
              <tr>
                <th>Variable</th>
                <th>{tr("Regresión lineal")}</th>
                <th>Theil–Sen</th>
                <th>{tr("Años")}</th>
                <th>{tr("R² lineal")}</th>
              </tr>
            </thead>
            <tbody>
              {environment.trends.map((t) => (
                <tr key={t.label}>
                  <td>
                    {t.label}
                    <small>{t.unit}</small>
                  </td>
                  <td>{n(t.ols_decade, 3)}</td>
                  <td>{n(t.sen_decade, 3)}</td>
                  <td>
                    {t.start}–{t.end} ({t.n})
                  </td>
                  <td>{n(t.r2, 3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p>
          {tr(
            "La regresión resume el cambio medio. Theil–Sen usa la mediana de pendientes entre pares y reduce la influencia de valores extremos. Compara magnitud y dirección para revisar la estabilidad descriptiva.",
          )}
        </p>
        {environment.correlations.map((c) => (
          <p key={c.label}>
            {c.label}
            {tr(" · correlación de Pearson ")}
            {n(c.r, 3)} · {c.n}
            {tr(" meses completos.")}
          </p>
        ))}
        <p className="notice">{environment.uncertainty}</p>
      </details>
      {timeline.length > 0 && (
        <details className="form-details" open>
          <summary>{tr("Meses críticos de la alternativa elegida")}</summary>
          <p>
            {tr("Primera ventana completa del escenario ")}
            {scenarioNames[scenario]}
            {tr(
              ". El déficit y el período fuera de cultivo se obtienen del balance diario. ",
            )}
          </p>
          <Plot
            label={tr("Déficit y días fuera de cultivo por mes")}
            data={[
              {
                type: "bar",
                name: tr("Déficit (mm)"),
                x: timeline.map((m) => m.month),
                y: timeline.map((m) => m.deficit_mm),
                marker: { color: "#b97443" },
              },
              {
                type: "scatter",
                name: tr("Días fuera de cultivo"),
                yaxis: "y2",
                x: timeline.map((m) => m.month),
                y: timeline.map((m) => m.fallow_days),
                line: { color: "#66835b", dash: "dot" },
              },
            ]}
            layout={{
              yaxis: { title: "mm" },
              yaxis2: {
                title: tr("días"),
                overlaying: tr("y"),
                side: "right",
                range: [0, 32],
              },
              legend: { orientation: "h" },
            }}
          />
          <p className="chart-reading">
            {tr(
              "El mes con mayor barra acumula más demanda de agua sin cubrir. Revisa si coincide con una etapa sensible y confirma esa etapa en campo. La línea alta indica más días fuera del cultivo simulado y una oportunidad para planear rastrojo o cobertura.",
            )}
          </p>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tr("Mes")}</th>
                  <th>{tr("Déficit (mm)")}</th>
                  <th>{tr("Días con déficit")}</th>
                  <th>{tr("Días fuera de cultivo")}</th>
                </tr>
              </thead>
              <tbody>
                {[...timeline]
                  .filter((m) => m.deficit_mm > 0 || m.fallow_days > 0)
                  .sort((a, b) => b.deficit_mm - a.deficit_mm)
                  .slice(0, 6)
                  .map((m) => (
                    <tr key={m.month}>
                      <td>{m.month}</td>
                      <td>{n(m.deficit_mm, 1)}</td>
                      <td>{m.stress_days}</td>
                      <td>{m.fallow_days}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          <p className="muted">
            {tr(
              "El período fuera del cultivo simulado indica una oportunidad para revisar coberturas y rastrojo. La cobertura real y el estrés observado se verifican con imágenes de calidad y visitas al terreno.",
            )}
          </p>
        </details>
      )}
    </section>
  );
}
