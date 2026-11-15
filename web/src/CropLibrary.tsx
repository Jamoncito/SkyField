import { tr } from "./i18n";
import { useEffect, useState, type FormEvent } from "react";
import { Leaf } from "lucide-react";
import { api, errorText, n, post } from "./client";
import type { Crop } from "./types";
import { MarketTable, useMarket } from "./Economics";
import { RegionalDashboard } from "./Dashboard";
import { Plot } from "./Chart";
type Cashflow = {
  crop: string;
  npv_bob_ha: number;
  payback_year: number | null;
  method: string;
  rows: {
    year: number;
    flow_bob_ha: number;
    cumulative_bob_ha: number;
  }[];
  inputs: Record<string, number | string>;
};
const searchable = (text: string) =>
  text.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("es");
export function CropLibrary() {
  const [crops, setCrops] = useState<Crop[]>([]),
    [filter, setFilter] = useState(""),
    [error, setError] = useState("");
  const [selected, setSelected] = useState("coffee"),
    [flow, setFlow] = useState<Cashflow>(),
    [busy, setBusy] = useState(false);
  const { market, error: marketError } = useMarket();
  useEffect(() => {
    void api<Crop[]>("/crops")
      .then(setCrops)
      .catch((e) => setError(errorText(e)));
  }, []);
  const perennials = crops.filter((c) => c.system === "perennial");
  const crop = perennials.find((c) => c.code === selected);
  async function calculate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const data = Object.fromEntries(new FormData(event.currentTarget));
    const payload = {
      crop: selected,
      ...Object.fromEntries(
        Object.entries(data).map(([key, value]) => [key, Number(value)]),
      ),
    };
    try {
      setFlow(await post<Cashflow>("/perennial-budget", payload));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  function download() {
    if (!flow) return;
    const text = [
      tr("SkyField - presupuesto perenne"),
      flow.crop,
      ...Object.entries(flow.inputs).map(([key, value]) => `${key},${value}`),
      "year,flow_bob_ha,cumulative_bob_ha",
      ...flow.rows.map((r) =>
        [r.year, r.flow_bob_ha, r.cumulative_bob_ha].join(","),
      ),
      `VAN_BOB_ha,${flow.npv_bob_ha}`,
      `payback_year,${flow.payback_year ?? ""}`,
    ].join("\r\n");
    const url = URL.createObjectURL(
      new Blob(["﻿" + text], { type: "text/csv;charset=utf-8" }),
    );
    const a = document.createElement(tr("a"));
    a.href = url;
    a.download = "SkyField-presupuesto-" + flow.crop + ".csv";
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <>
      <div className="page-heading" data-tour="crop-library">
        <div>
          <h1>{tr("Explora cultivos y mercados")}</h1>
          <p>
            {tr(
              "Cultivos anuales, perennes y cadenas productivas del oriente.",
            )}
          </p>
        </div>
      </div>
      {(error || marketError) && (
        <p className="error" role="alert">
          {error || marketError}
        </p>
      )}
      <section className="card panel">
        <div className="section-head">
          <h2>{tr("Catálogo agronómico")}</h2>
          <input
            type="search"
            aria-label={tr("Buscar cultivo")}
            placeholder={tr("Buscar cultivo…")}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
        </div>
        <div className="crop-library-grid">
          {crops
            .filter((c) =>
              searchable(c.name + " " + (c.scientific ?? "")).includes(
                searchable(filter),
              ),
            )
            .map((c) => (
              <article key={c.code} className="crop-tile">
                <Leaf size={23} />
                <h3>{c.name}</h3>
                <i>{c.scientific ?? c.family}</i>
                <p>{c.note}</p>
                <span className="chip">
                  {c.system === "perennial"
                    ? tr("Sistema perenne")
                    : c.simulated
                      ? tr("Rotación anual simulable")
                      : tr("Referencia regional")}
                </span>
                {c.source && (
                  <a href={c.source} target="_blank" rel="noreferrer">
                    {tr(" Fuente agronómica ")}
                  </a>
                )}
              </article>
            ))}
        </div>
      </section>
      <section className="card panel perennial-planner" data-tour="perennials">
        <div className="section-head">
          <div>
            <span className="section-kicker">
              {tr(" Café · cacao · vainilla · pitajaya · açaí ")}
            </span>
            <h2>{tr("Evalúa una inversión perenne")}</h2>
            <p>
              {tr(
                " Planifica establecimiento, años de espera y flujo de caja por hectárea. ",
              )}
            </p>
          </div>
        </div>
        <form onSubmit={calculate} onChange={() => setFlow(undefined)}>
          <div className="three-col form-gap">
            <label>
              {tr(" Cultivo perenne ")}
              <select
                aria-label={tr("Cultivo perenne")}
                value={selected}
                onChange={(e) => {
                  setSelected(e.target.value);
                  setFlow(undefined);
                }}
              >
                {perennials.map((c) => (
                  <option key={c.code} value={c.code}>
                    {c.name}
                  </option>
                ))}
              </select>
            </label>
            {[
              [
                "establishment_bob_ha",
                tr("Establecimiento inicial (Bs/ha)"),
                "0",
                "100000000",
                ".01",
              ],
              [
                "annual_cost_bob_ha",
                tr("Costo anual total (Bs/ha)"),
                "0",
                "100000000",
                ".01",
              ],
              [
                "sale_bob_t",
                tr("Precio pactado (Bs/t)"),
                "0",
                "100000000",
                ".01",
              ],
              [
                "yield_t_ha",
                tr("Rendimiento en producción (t/ha)"),
                "0",
                "500",
                ".001",
              ],
              [
                "first_harvest_year",
                tr("Primer año con cosecha"),
                "1",
                "20",
                "1",
              ],
            ].map(([name, label, min, max, step]) => (
              <label key={name}>
                {label}
                <input
                  name={name}
                  type="number"
                  required
                  min={min}
                  max={max}
                  step={step}
                  placeholder={tr("Dato del proyecto")}
                />
              </label>
            ))}
            <label>
              {tr(" Horizonte (años) ")}
              <input
                name="horizon_years"
                type="number"
                required
                min="1"
                max="30"
                defaultValue="10"
              />
            </label>
            <label>
              {tr(" Tasa de descuento anual (%) ")}
              <input
                name="discount_pct"
                type="number"
                min="0"
                max="100"
                step=".1"
                required
                defaultValue="10"
              />
            </label>
          </div>
          <p className="notice">
            {crop?.note}
            {tr(
              " Confirma rendimiento, precio, forma comercial y costos con productores y compradores. La tasa inicial de 10 % es un supuesto editable. ",
            )}
          </p>
          <button className="button primary" disabled={busy}>
            {busy ? "Calculando…" : tr("Calcular flujo de caja")}
          </button>
        </form>
        {flow && (
          <>
            <div className="finance-kpis">
              <div>
                <small>{tr("Valor actual neto")}</small>
                <strong>Bs {n(flow.npv_bob_ha, 0)}</strong>
                <span>{tr("por hectárea, al horizonte elegido")}</span>
              </div>
              <div>
                <small>{tr("Recuperación simple")}</small>
                <strong>
                  {flow.payback_year == null
                    ? tr("Fuera del horizonte")
                    : tr("Año ") + flow.payback_year}
                </strong>
                <span>{tr("flujo acumulado sin descuento")}</span>
              </div>
            </div>
            <Plot
              label={tr("Flujo de caja anual y acumulado de cultivo perenne")}
              data={[
                {
                  type: "bar",
                  name: tr("Flujo anual"),
                  x: flow.rows.map((r) => r.year),
                  y: flow.rows.map((r) => r.flow_bob_ha),
                  marker: { color: "#81a96c" },
                },
                {
                  type: "scatter",
                  name: tr("Acumulado"),
                  x: flow.rows.map((r) => r.year),
                  y: flow.rows.map((r) => r.cumulative_bob_ha),
                  line: { color: "#286d57" },
                },
              ]}
              layout={{
                yaxis: { title: "Bs/ha" },
                xaxis: { title: tr("Año del proyecto"), dtick: 1 },
                legend: { orientation: "h" },
              }}
            />
            <p className="chart-reading">
              {flow.npv_bob_ha >= 0
                ? tr(
                    "Los flujos estimados cubren la inversión a la tasa de descuento declarada.",
                  )
                : tr(
                    "Los flujos estimados quedan por debajo de la inversión a la tasa declarada.",
                  )}{" "}
              {tr(
                " El resultado depende del inicio de cosecha, rendimiento y precio que introdujiste. ",
              )}
            </p>
            <p className="muted">{flow.method}</p>
            <button className="button secondary" onClick={download}>
              {tr(" Descargar presupuesto CSV ")}
            </button>
          </>
        )}
      </section>
      {market && (
        <>
          <RegionalDashboard market={market} />
          <section className="card panel">
            <h2>{tr("Precios nacionales e internacionales")}</h2>
            <MarketTable market={market} />
          </section>
        </>
      )}
    </>
  );
}
