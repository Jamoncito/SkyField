import { useEffect, useRef, useState } from "react";
import { CloudRain, CloudSun, Droplets, RefreshCw } from "lucide-react";
import { api, day, errorText, n } from "./client";
import type { ClimateContext, Weather } from "./types";
import { Plot } from "./Chart";

const months = "Ene Feb Mar Abr May Jun Jul Ago Sep Oct Nov Dic".split(" ");
export function WeatherPanel({
  fieldId,
  initial,
  climate,
  compact = false,
}: {
  fieldId: string;
  initial?: Weather;
  climate?: ClimateContext;
  compact?: boolean;
}) {
  const [weather, setWeather] = useState(initial),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const [horizon, setHorizon] = useState<"week" | "month" | "season" | "cycle">(
    "week",
  );
  const request = useRef(0);
  async function load() {
    const current = ++request.current;
    setBusy(true);
    setError("");
    try {
      const next = await api<Weather>("/fields/" + fieldId + "/weather");
      if (current === request.current) setWeather(next);
    } catch (e) {
      if (current === request.current) setError(errorText(e));
    } finally {
      if (current === request.current) setBusy(false);
    }
  }
  useEffect(() => {
    setWeather(initial);
    if (!initial) void load();
    return () => {
      request.current++;
    };
  }, [fieldId]);
  const total = weather?.days.reduce<number | null>(
    (sum, d) =>
      sum === null || d.precipitation_sum === null
        ? null
        : sum + d.precipitation_sum,
    0,
  );
  const hot =
    weather?.days.filter(
      (d) => d.temperature_2m_max != null && d.temperature_2m_max >= 35,
    ).length ?? 0;
  const frost =
    weather?.days.filter(
      (d) => d.temperature_2m_min != null && d.temperature_2m_min <= 0,
    ).length ?? 0;
  const water = weather?.days.reduce<number | null>(
    (sum, d) =>
      sum === null || d.et0_fao_evapotranspiration == null
        ? null
        : sum + d.et0_fao_evapotranspiration,
    0,
  );
  const period = weather?.month;
  return (
    <section
      className={"card panel weather-panel " + (compact ? "compact" : "")}
      data-tour="weather"
    >
      <div className="section-head">
        <div>
          <span className="section-kicker">
            <CloudSun size={16} /> Tiempo y planificación
          </span>
          <h2>{compact ? "Tu próxima semana" : "Pronóstico para tu lote"}</h2>
          <p>
            {weather
              ? "Consulta " + day(weather.retrieved)
              : "Pronóstico para el punto del lote"}
          </p>
        </div>
        <button
          className="icon-btn"
          type="button"
          aria-label="Actualizar pronóstico"
          onClick={() => void load()}
          disabled={busy}
        >
          <RefreshCw size={17} className={busy ? "spin" : ""} />
        </button>
      </div>
      {!compact && (
        <div
          className="segments weather-tabs"
          aria-label="Horizonte meteorológico"
        >
          {[
            ["week", "7 días"],
            ["month", "30 días"],
            ["season", "Estacional"],
            ["cycle", "Año / ciclo"],
          ].map(([key, label]) => (
            <button
              type="button"
              key={key}
              aria-pressed={horizon === key}
              onClick={() => setHorizon(key as typeof horizon)}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {busy && !weather && (
        <p role="status">Consultando los modelos meteorológicos…</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {horizon === "week" && weather && (
        <>
          {weather.days.length ? (
            <>
              <div className="weather-days">
                {weather.days.map((d) => (
                  <article className="weather-day" key={d.date}>
                    <small>
                      {new Intl.DateTimeFormat("es", {
                        weekday: "short",
                        day: "numeric",
                        timeZone: "UTC",
                      }).format(new Date(d.date + "T12:00:00Z"))}
                    </small>
                    {(d.precipitation_sum ?? 0) > 1 ? (
                      <CloudRain size={24} />
                    ) : (
                      <CloudSun size={24} />
                    )}
                    <b>
                      {n(d.temperature_2m_max, 0)}°{" "}
                      <span>{n(d.temperature_2m_min, 0)}°</span>
                    </b>
                    <small>
                      <Droplets size={12} />
                      {n(d.precipitation_sum, 1)} mm
                    </small>
                    <small>
                      {n(d.precipitation_probability_max, 0)} % de lluvia
                    </small>
                  </article>
                ))}
              </div>
              <p className="chart-reading">
                <CloudSun size={18} />
                <span>
                  Se prevén {n(total, 1)} mm en siete días
                  {water != null && (
                    <> frente a {n(water, 1)} mm de demanda ET₀</>
                  )}
                  .{" "}
                  {hot > 0
                    ? `${hot} días con máxima ≥35 °C justifican revisar agua disponible y horarios de trabajo.`
                    : "Revisa la humedad del suelo antes de sembrar o regar."}{" "}
                  {frost > 0 &&
                    `${frost} días con mínima ≤0 °C requieren verificar protección y alertas locales.`}
                </span>
              </p>
              {!compact && (
                <>
                  <Plot
                    label="Pronóstico diario de lluvia y temperatura"
                    data={[
                      {
                        type: "bar",
                        name: "Lluvia",
                        x: weather.days.map((d) => d.date),
                        y: weather.days.map((d) => d.precipitation_sum),
                        marker: { color: "#8fb9a6" },
                      },
                      {
                        type: "scatter",
                        name: "Máxima",
                        yaxis: "y2",
                        x: weather.days.map((d) => d.date),
                        y: weather.days.map((d) => d.temperature_2m_max),
                        line: { color: "#c48942" },
                      },
                      {
                        type: "scatter",
                        name: "Mínima",
                        yaxis: "y2",
                        x: weather.days.map((d) => d.date),
                        y: weather.days.map((d) => d.temperature_2m_min),
                        line: { color: "#4676a5" },
                      },
                    ]}
                    layout={{
                      yaxis: { title: "mm", rangemode: "tozero" },
                      yaxis2: { title: "°C", overlaying: "y", side: "right" },
                      legend: { orientation: "h" },
                    }}
                  />
                  <p className="muted">
                    Las barras indican agua prevista. Las líneas muestran el
                    rango térmico diario. La probabilidad expresa la posibilidad
                    de precipitación en la grilla del modelo.
                  </p>
                  {weather.hourly && (
                    <details className="form-details">
                      <summary>
                        Humedad y punto de rocío de las próximas 24 horas
                      </summary>
                      <div className="table-scroll">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>Hora local</th>
                              <th>Humedad relativa (%)</th>
                              <th>Punto de rocío (°C)</th>
                            </tr>
                          </thead>
                          <tbody>
                            {weather.hourly.time.map((t, i) => (
                              <tr key={t}>
                                <td>{t.replace("T", " ")}</td>
                                <td>
                                  {n(
                                    weather.hourly!.relative_humidity_2m[i],
                                    0,
                                  )}
                                </td>
                                <td>{n(weather.hourly!.dew_point_2m[i], 1)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      <p className="muted">
                        El punto de rocío es la temperatura a la que el aire
                        alcanzaría saturación. Humedad elevada y rocío pueden
                        favorecer períodos de mojado foliar. La evaluación
                        sanitaria requiere observar el cultivo.
                      </p>
                    </details>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="notice">
              El servicio de pronóstico diario está temporalmente sin datos para
              este punto. Usa Actualizar para volver a consultar.
            </p>
          )}
        </>
      )}
      {horizon === "month" && (
        <>
          {period?.rain_mm && period.temp_c ? (
            <>
              <div className="finance-kpis">
                <div>
                  <small>Lluvia mediana del conjunto</small>
                  <strong>{n(period.rain_mm[1], 0)} mm</strong>
                  <span>
                    P10–P90 {n(period.rain_mm[0], 0)}–{n(period.rain_mm[2], 0)}{" "}
                    mm
                  </span>
                </div>
                <div>
                  <small>Temperatura media mediana</small>
                  <strong>{n(period.temp_c[1], 1)} °C</strong>
                  <span>
                    P10–P90 {n(period.temp_c[0], 1)}–{n(period.temp_c[2], 1)} °C
                  </span>
                </div>
                <div>
                  <small>Horizonte agregado</small>
                  <strong>{period.days} días</strong>
                  <span>
                    {period.start} a {period.end} · {period.members} miembros
                  </span>
                </div>
              </div>
              <p className="chart-reading">
                La amplitud del intervalo muestra cuánto difieren las
                trayectorias del modelo. Usa este horizonte para comparar fechas
                y reservas de agua, revisando el pronóstico diario al acercarse
                la operación.
              </p>
            </>
          ) : (
            <p className="notice">
              La perspectiva de 30 días está temporalmente sin datos.
            </p>
          )}
        </>
      )}
      {horizon === "season" && (
        <>
          {weather?.seasonal.length ? (
            <>
              <Plot
                label="Perspectiva estacional de precipitación con dispersión entre miembros"
                data={[
                  {
                    type: "bar",
                    name: "Mediana de lluvia",
                    x: weather.seasonal.map((m) => m.month),
                    y: weather.seasonal.map((m) => m.rain_mm?.[1]),
                    marker: { color: "#3f8067" },
                    error_y: {
                      type: "data",
                      symmetric: false,
                      array: weather.seasonal.map((m) =>
                        m.rain_mm ? m.rain_mm[2] - m.rain_mm[1] : null,
                      ),
                      arrayminus: weather.seasonal.map((m) =>
                        m.rain_mm ? m.rain_mm[1] - m.rain_mm[0] : null,
                      ),
                      color: "#81968c",
                    },
                  },
                ]}
                layout={{
                  yaxis: { title: "mm en días cubiertos" },
                  showlegend: false,
                }}
              />
              <p className="chart-reading">
                Las barras muestran la mediana de lluvia y los bigotes delimitan
                P10–P90 del conjunto. Los primeros y últimos meses pueden tener
                cobertura parcial. Una dispersión amplia requiere preparar
                opciones de manejo para condiciones distintas.
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Mes</th>
                      <th>Días cubiertos</th>
                      <th>Lluvia P10 / P50 / P90 (mm)</th>
                      <th>Temp. media P10 / P50 / P90 (°C)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weather.seasonal.map((m) => (
                      <tr key={m.month}>
                        <td>{m.month}</td>
                        <td>{m.days}</td>
                        <td>
                          {m.rain_mm?.map((x) => n(x, 0)).join(" / ") ??
                            "Sin dato"}
                        </td>
                        <td>
                          {m.temp_c?.map((x) => n(x, 1)).join(" / ") ??
                            "Sin dato"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="notice">
              La perspectiva estacional está temporalmente sin datos.
            </p>
          )}
        </>
      )}
      {horizon === "cycle" && (
        <>
          {climate?.status === "available" ? (
            <>
              <h3>
                Referencia anual del clima, {climate.start}–{climate.end}
              </h3>
              <Plot
                label="Climatología mensual y variabilidad histórica de lluvia"
                data={[
                  {
                    type: "bar",
                    x: months,
                    y: climate.months.map((m) => m.rain_mm),
                    name: "Media histórica",
                    marker: { color: "#80aa8b" },
                  },
                ]}
                layout={{ yaxis: { title: "mm/mes" }, showlegend: false }}
              />
              <p className="chart-reading">
                La distribución histórica permite ubicar la estación lluviosa y
                seca para planificar el ciclo. La perspectiva estacional cubre
                hasta unos seis meses desde esta consulta. Para los meses
                posteriores, contrasta esta referencia con los escenarios ENSO y
                de calentamiento.
              </p>
            </>
          ) : (
            <p className="notice">
              La referencia anual y los escenarios del ciclo aparecerán al
              terminar un análisis climático del lote.
            </p>
          )}
        </>
      )}
      {!compact && weather && (
        <details className="form-details">
          <summary>Fuente, resolución e incertidumbre</summary>
          <p>{weather.method}</p>
          <p>{weather.interpretation}</p>
          <div className="source-links">
            <a href={weather.source_url} target="_blank" rel="noreferrer">
              Open-Meteo, pronóstico
            </a>
            <a href={weather.seasonal_url} target="_blank" rel="noreferrer">
              Open-Meteo, EC46 y SEAS5
            </a>
            <a href="https://senamhi.gob.bo/" target="_blank" rel="noreferrer">
              SENAMHI Bolivia
            </a>
          </div>
        </details>
      )}
    </section>
  );
}
