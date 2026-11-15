import { tr, locale } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { CloudRain, CloudSun, Droplets, RefreshCw } from "lucide-react";
import { api, day, errorText, n } from "./client";
import type { ClimateContext, Weather } from "./types";
import { Plot } from "./Chart";
const months = tr("Ene Feb Mar Abr May Jun Jul Ago Sep Oct Nov Dic").split(" ");
const forecastLimits = {
  temperature_2m_max: [-90, 65, "°C"],
  temperature_2m_min: [-90, 65, "°C"],
  temperature_2m_mean: [-90, 65, "°C"],
  precipitation_sum: [0, 2500, "mm"],
  precipitation_probability_max: [0, 100, "%"],
  et0_fao_evapotranspiration: [0, 50, "mm"],
  wind_speed_10m_max: [0, 500, "km/h"],
} as const;

async function directForecast(weather: Weather, signal: AbortSignal) {
  const [longitude, latitude] = weather.point;
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    Math.abs(longitude) > 180 ||
    Math.abs(latitude) > 90
  )
    return null;
  const params = new URLSearchParams({
    latitude: String(latitude),
    longitude: String(longitude),
    timezone: "America/La_Paz",
    forecast_days: "7",
    daily: Object.keys(forecastLimits).join(","),
  });
  const controller = new AbortController();
  const cancel = () => controller.abort();
  signal.addEventListener("abort", cancel, { once: true });
  if (signal.aborted) cancel();
  const timeout = setTimeout(cancel, 15000);
  let raw: {
    daily?: Record<string, unknown>;
    daily_units?: Record<string, unknown>;
  } | null;
  try {
    const response = await fetch(
      "https://api.open-meteo.com/v1/forecast?" + params,
      {
        signal: controller.signal,
      },
    );
    if (!response.ok) return null;
    raw = await response.json();
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", cancel);
  }
  const daily = raw?.daily;
  const units = raw?.daily_units;
  if (!daily || !units || !Array.isArray(daily.time)) return null;
  const seen = new Set<string>();
  const days: Weather["days"] = [];
  for (const [index, stamp] of daily.time.entries()) {
    if (
      typeof stamp !== "string" ||
      !/^\d{4}-\d{2}-\d{2}$/.test(stamp) ||
      seen.has(stamp)
    )
      continue;
    const date = new Date(stamp + "T00:00:00Z");
    if (
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== stamp
    )
      continue;
    seen.add(stamp);
    const values = Object.fromEntries(
      Object.entries(forecastLimits).map(([key, [low, high, unit]]) => {
        const array = daily[key];
        const value = Array.isArray(array) ? array[index] : null;
        const valid =
          typeof value === "number" &&
          Number.isFinite(value) &&
          value >= low &&
          value <= high &&
          units[key] === unit;
        return [key, valid ? value : null];
      }),
    ) as Omit<Weather["days"][number], "date">;
    if (
      values.temperature_2m_min !== null &&
      values.temperature_2m_max !== null &&
      values.temperature_2m_min > values.temperature_2m_max
    ) {
      values.temperature_2m_min = null;
      values.temperature_2m_max = null;
    }
    days.push({ date: stamp, ...values });
  }
  const validDays = days
    .filter((row) =>
      Object.entries(row).some(
        ([key, value]) => key !== "date" && value !== null,
      ),
    )
    .sort((a, b) => a.date.localeCompare(b.date))
    .slice(0, 7);
  return validDays.length
    ? { ...weather, days: validDays, short_status: "available" }
    : null;
}

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
    [error, setError] = useState(""),
    [direct, setDirect] = useState(false);
  const [horizon, setHorizon] = useState<"week" | "month" | "season" | "cycle">(
    "week",
  );
  const request = useRef(0);
  const pending = useRef<AbortController | undefined>(undefined);
  async function load(existing?: Weather) {
    const current = ++request.current;
    pending.current?.abort();
    const controller = new AbortController();
    pending.current = controller;
    setBusy(true);
    setError("");
    setDirect(false);
    try {
      const next =
        existing ??
        (await api<Weather>("/fields/" + fieldId + "/weather", {
          signal: controller.signal,
        }));
      if (current === request.current) setWeather(next);
      if (!next.days.length) {
        try {
          const fallback = await directForecast(next, controller.signal);
          if (fallback && current === request.current) {
            setWeather(fallback);
            setDirect(true);
          }
        } catch {
          // Keep the backend's seasonal outlook and explicit daily unavailability.
        }
      }
    } catch (e) {
      if (current === request.current) setError(errorText(e));
    } finally {
      if (current === request.current) setBusy(false);
    }
  }
  useEffect(() => {
    setWeather(initial);
    setDirect(false);
    if (!initial || !initial.days.length) void load(initial);
    return () => {
      request.current++;
      pending.current?.abort();
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
            <CloudSun size={16} />
            {tr(" Tiempo y planificación ")}
          </span>
          <h2>
            {compact ? tr("Tu próxima semana") : tr("Pronóstico para tu lote")}
          </h2>
          <p>
            {weather
              ? tr("Consulta ") + day(weather.retrieved)
              : tr("Pronóstico para el punto del lote")}
          </p>
          {weather && (
            <p className="weather-location">
              WGS 84 · {n(weather.point[1], 5)}°, {n(weather.point[0], 5)}° ·
              Open-Meteo
            </p>
          )}
        </div>
        <button
          className="icon-btn"
          type="button"
          aria-label={tr("Actualizar pronóstico")}
          onClick={() => void load()}
          disabled={busy}
        >
          <RefreshCw size={17} className={busy ? "spin" : ""} />
        </button>
      </div>
      {!compact && (
        <div
          className="segments weather-tabs"
          aria-label={tr("Horizonte meteorológico")}
        >
          {[
            ["week", tr("7 días")],
            ["month", tr("30 días")],
            ["season", tr("Estacional")],
            ["cycle", tr("Año / ciclo")],
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
        <p role="status">{tr("Consultando los modelos meteorológicos…")}</p>
      )}
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {weather && (
        <p className="muted">
          {tr(
            `${weather.days.length} días disponibles de 7. La dispersión estacional describe los modelos regionales. La precisión local requiere contraste con estaciones y registros del terreno.`,
          )}
        </p>
      )}
      {direct && (
        <p className="muted">
          {tr(
            "Pronóstico diario consultado directamente desde tu navegador en Open-Meteo.",
          )}
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
                      {new Intl.DateTimeFormat(locale(), {
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
                      {n(d.precipitation_probability_max, 0)}
                      {tr(" % de lluvia ")}
                    </small>
                  </article>
                ))}
              </div>
              <p className="chart-reading">
                <CloudSun size={18} />
                <span>
                  {tr(" Se prevén ")}
                  {n(total, 1)}
                  {tr(" mm en siete días ")}
                  {water != null && (
                    <>
                      {tr(" frente a ")}
                      {n(water, 1)}
                      {tr(" mm de demanda ET₀")}
                    </>
                  )}
                  .{" "}
                  {hot > 0
                    ? tr(
                        `${hot} días con máxima ≥35 °C justifican revisar agua disponible y horarios de trabajo.`,
                      )
                    : tr(
                        "Revisa la humedad del suelo antes de sembrar o regar.",
                      )}{" "}
                  {frost > 0 &&
                    tr(
                      `${frost} días con mínima ≤0 °C requieren verificar protección y alertas locales.`,
                    )}
                </span>
              </p>
              {!compact && (
                <>
                  <Plot
                    label={tr("Pronóstico diario de lluvia y temperatura")}
                    data={[
                      {
                        type: "bar",
                        name: tr("Lluvia"),
                        x: weather.days.map((d) => d.date),
                        y: weather.days.map((d) => d.precipitation_sum),
                        marker: { color: "#8fb9a6" },
                      },
                      {
                        type: "scatter",
                        name: tr("Máxima"),
                        yaxis: "y2",
                        x: weather.days.map((d) => d.date),
                        y: weather.days.map((d) => d.temperature_2m_max),
                        line: { color: "#c48942" },
                      },
                      {
                        type: "scatter",
                        name: tr("Mínima"),
                        yaxis: "y2",
                        x: weather.days.map((d) => d.date),
                        y: weather.days.map((d) => d.temperature_2m_min),
                        line: { color: "#4676a5" },
                      },
                    ]}
                    layout={{
                      yaxis: { title: "mm", rangemode: "tozero" },
                      yaxis2: {
                        title: "°C",
                        overlaying: tr("y"),
                        side: "right",
                      },
                      legend: { orientation: "h" },
                    }}
                  />
                  <p className="muted">
                    {tr(
                      " Las barras indican agua prevista. Las líneas muestran el rango térmico diario. La probabilidad expresa la posibilidad de precipitación en la grilla del modelo. ",
                    )}
                  </p>
                  {weather.hourly && (
                    <details className="form-details">
                      <summary>
                        {tr(
                          " Humedad y punto de rocío de las próximas 24 horas ",
                        )}
                      </summary>
                      <div className="table-scroll">
                        <table className="data-table">
                          <thead>
                            <tr>
                              <th>{tr("Hora local")}</th>
                              <th>{tr("Humedad relativa (%)")}</th>
                              <th>{tr("Punto de rocío (°C)")}</th>
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
                        {tr(
                          " El punto de rocío es la temperatura a la que el aire alcanzaría saturación. Humedad elevada y rocío pueden favorecer períodos de mojado foliar. La evaluación sanitaria requiere observar el cultivo. ",
                        )}
                      </p>
                    </details>
                  )}
                </>
              )}
            </>
          ) : (
            <p className="notice">
              {tr(
                " El servicio de pronóstico diario está temporalmente sin datos para este punto. Usa Actualizar para volver a consultar. ",
              )}
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
                  <small>{tr("Lluvia mediana del conjunto")}</small>
                  <strong>{n(period.rain_mm[1], 0)} mm</strong>
                  <span>
                    P10–P90 {n(period.rain_mm[0], 0)}–{n(period.rain_mm[2], 0)}{" "}
                    mm
                  </span>
                </div>
                <div>
                  <small>{tr("Temperatura media mediana")}</small>
                  <strong>{n(period.temp_c[1], 1)} °C</strong>
                  <span>
                    P10–P90 {n(period.temp_c[0], 1)}–{n(period.temp_c[2], 1)} °C
                  </span>
                </div>
                <div>
                  <small>{tr("Horizonte agregado")}</small>
                  <strong>
                    {period.days}
                    {tr(" días")}
                  </strong>
                  <span>
                    {period.start}
                    {tr(" a ")}
                    {period.end} · {period.members}
                    {tr(" miembros ")}
                  </span>
                </div>
              </div>
              <p className="chart-reading">
                {tr(
                  " La amplitud del intervalo muestra cuánto difieren las trayectorias del modelo. Usa este horizonte para comparar fechas y reservas de agua, revisando el pronóstico diario al acercarse la operación. ",
                )}
              </p>
            </>
          ) : (
            <p className="notice">
              {tr(" La perspectiva de 30 días está temporalmente sin datos. ")}
            </p>
          )}
        </>
      )}
      {horizon === "season" && (
        <>
          {weather?.seasonal.length ? (
            <>
              <Plot
                label={tr(
                  "Perspectiva estacional de precipitación con dispersión entre miembros",
                )}
                data={[
                  {
                    type: "bar",
                    name: tr("Mediana de lluvia"),
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
                  yaxis: { title: tr("mm en días cubiertos") },
                  showlegend: false,
                }}
              />
              <p className="chart-reading">
                {tr(
                  " Las barras muestran la mediana de lluvia y los bigotes delimitan P10–P90 del conjunto. Los primeros y últimos meses pueden tener cobertura parcial. Una dispersión amplia requiere preparar opciones de manejo para condiciones distintas. ",
                )}
              </p>
              <div className="table-scroll">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>{tr("Mes")}</th>
                      <th>{tr("Días cubiertos")}</th>
                      <th>{tr("Lluvia P10 / P50 / P90 (mm)")}</th>
                      <th>{tr("Temp. media P10 / P50 / P90 (°C)")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {weather.seasonal.map((m) => (
                      <tr key={m.month}>
                        <td>{m.month}</td>
                        <td>{m.days}</td>
                        <td>
                          {m.rain_mm?.map((x) => n(x, 0)).join(" / ") ??
                            tr("Sin dato")}
                        </td>
                        <td>
                          {m.temp_c?.map((x) => n(x, 1)).join(" / ") ??
                            tr("Sin dato")}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <p className="notice">
              {tr(" La perspectiva estacional está temporalmente sin datos. ")}
            </p>
          )}
        </>
      )}
      {horizon === "cycle" && (
        <>
          {climate?.status === "available" ? (
            <>
              <h3>
                {tr(" Referencia anual del clima, ")}
                {climate.start}–{climate.end}
              </h3>
              <Plot
                label={tr(
                  "Climatología mensual y variabilidad histórica de lluvia",
                )}
                data={[
                  {
                    type: "bar",
                    x: months,
                    y: climate.months.map((m) => m.rain_mm),
                    name: tr("Media histórica"),
                    marker: { color: "#80aa8b" },
                  },
                ]}
                layout={{ yaxis: { title: "mm/mes" }, showlegend: false }}
              />
              <p className="chart-reading">
                {tr(
                  " La distribución histórica permite ubicar la estación lluviosa y seca para planificar el ciclo. La perspectiva estacional cubre hasta unos seis meses desde esta consulta. Para los meses posteriores, contrasta esta referencia con los escenarios ENSO y de calentamiento. ",
                )}
              </p>
            </>
          ) : (
            <p className="notice">
              {tr(
                " La referencia anual y los escenarios del ciclo aparecerán al terminar un análisis climático del lote. ",
              )}
            </p>
          )}
        </>
      )}
      {!compact && weather && (
        <details className="form-details">
          <summary>{tr("Fuente, resolución e incertidumbre")}</summary>
          <p>{weather.method}</p>
          <p>{weather.interpretation}</p>
          <div className="source-links">
            <a href={weather.source_url} target="_blank" rel="noreferrer">
              {tr(" Open-Meteo, pronóstico ")}
            </a>
            <a href={weather.seasonal_url} target="_blank" rel="noreferrer">
              {tr(" Open-Meteo, EC46 y SEAS5 ")}
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
