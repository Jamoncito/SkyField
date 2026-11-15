import { tr } from "./i18n";
import { useEffect, useState } from "react";
import { ArrowRight, Banknote, Scale, TrendingUp } from "lucide-react";
import { api, errorText, n } from "./client";
import type {
  Crop,
  CropBudget,
  EconomicSettings,
  EconomicSummary,
  Market,
  Option,
} from "./types";
import { Plot } from "./Chart";
let marketRequest: Promise<Market> | undefined;
export function useMarket() {
  const [market, setMarket] = useState<Market>(),
    [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    marketRequest ??= api<Market>("/markets").catch((e) => {
      marketRequest = undefined;
      throw e;
    });
    void marketRequest
      .then((value) => {
        if (active) setMarket(value);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, []);
  return { market, error };
}
export function BudgetEditor({
  crops,
  allowed,
  value,
  onChange,
}: {
  crops: Crop[];
  allowed: string[];
  value: EconomicSettings;
  onChange: (v: EconomicSettings) => void;
}) {
  const { market, error } = useMarket();
  const [acknowledged, setAcknowledged] = useState(false);
  function budget(code: string, key: keyof CropBudget, text: string) {
    onChange({
      ...value,
      budgets: {
        ...value.budgets,
        [code]: {
          ...value.budgets?.[code],
          [key]: text === "" ? null : Number(text),
        },
      },
    });
  }
  const selected = crops.filter((c) => allowed.includes(c.code));
  const costCount = selected.filter(
    (c) => value.budgets?.[c.code]?.cost_bob_ha != null,
  ).length;
  return (
    <details
      className="form-details budget-editor"
      open
      data-tour="economics"
      data-ready={acknowledged || costCount >= 3}
    >
      <summary>{tr("Presupuesto y rentabilidad")}</summary>
      <p>
        {tr(
          " Compara ingreso, costo total y utilidad por hectárea de cada secuencia. Puedes completar el presupuesto de los cultivos con los que trabajas. ",
        )}
      </p>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {market && (
        <>
          <div className="three-col form-gap">
            <label>
              {tr(" Campaña CAO de referencia ")}
              <select
                value={value.yield_year ?? 2024}
                onChange={(e) =>
                  onChange({ ...value, yield_year: Number(e.target.value) })
                }
              >
                {market.agriculture.years.map((y) => (
                  <option key={y}>{y}</option>
                ))}
              </select>
            </label>
            <label>
              {tr(" Descuento desde mayorista a finca (%) ")}
              <input
                type="number"
                min="0"
                max="100"
                step=".1"
                value={value.farmgate_discount_pct ?? 0}
                onChange={(e) =>
                  onChange({
                    ...value,
                    farmgate_discount_pct: Number(e.target.value),
                  })
                }
              />
            </label>
            <label>
              {tr(" Tipo de cambio (Bs/USD) ")}
              <input
                type="number"
                min=".001"
                max="1000"
                step=".001"
                placeholder={String(market.fx.bob_per_usd)}
                value={value.bob_per_usd ?? ""}
                onChange={(e) =>
                  onChange({
                    ...value,
                    bob_per_usd:
                      e.target.value === "" ? null : Number(e.target.value),
                  })
                }
              />
            </label>
          </div>
          <p className="muted">
            BCB {market.fx.date} · {n(market.fx.bob_per_usd, 2)}
            {tr(
              " Bs/USD. Descuento 0 conserva la referencia mayorista. Un precio pactado reemplaza esa referencia. Los rendimientos CAO se seleccionan según verano o invierno y mes de siembra. ",
            )}
          </p>
          <div className="table-scroll">
            <table className="data-table budget-table">
              <thead>
                <tr>
                  <th>{tr("Cultivo")}</th>
                  <th>
                    {tr(" Precio pactado ")}
                    <br />
                    Bs/t
                  </th>
                  <th>
                    {tr(" Rendimiento propio ")}
                    <br />
                    t/ha
                  </th>
                  <th>
                    {tr(" Costo total ")}
                    <br />
                    {tr(" Bs/ha por campaña ")}
                  </th>
                </tr>
              </thead>
              <tbody>
                {selected.map((c) => {
                  const price = market.national.find((p) => p.crop === c.code),
                    ref = market.agriculture.campaigns.find(
                      (p) => p.crop === c.code,
                    );
                  const b = value.budgets?.[c.code];
                  return (
                    <tr key={c.code}>
                      <td>
                        <b>{c.name}</b>
                        <small>
                          {price
                            ? `${price.date} · ${n(price.bob_t, 0)} Bs/t`
                            : tr("Precio pendiente")}
                          {ref ? tr(" · CAO disponible") : ""}
                        </small>
                      </td>
                      <td>
                        <input
                          aria-label={tr("Precio de ") + c.name}
                          type="number"
                          min="0"
                          max="100000000"
                          step=".01"
                          placeholder={
                            price
                              ? n(price.bob_t, 0)
                              : c.code === "cover"
                                ? tr("0 ingreso por grano")
                                : tr("Sin dato")
                          }
                          value={b?.sale_bob_t ?? ""}
                          onChange={(e) =>
                            budget(c.code, "sale_bob_t", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={tr("Rendimiento de ") + c.name}
                          type="number"
                          min="0"
                          max="500"
                          step=".001"
                          placeholder={
                            ref
                              ? tr("Usar CAO")
                              : c.code === "cover"
                                ? tr("0 grano")
                                : tr("Sin dato")
                          }
                          value={b?.yield_t_ha ?? ""}
                          onChange={(e) =>
                            budget(c.code, "yield_t_ha", e.target.value)
                          }
                        />
                      </td>
                      <td>
                        <input
                          aria-label={tr("Costo de ") + c.name}
                          type="number"
                          min="0"
                          max="100000000"
                          step=".01"
                          placeholder={tr("Completar")}
                          value={b?.cost_bob_ha ?? ""}
                          onChange={(e) =>
                            budget(c.code, "cost_bob_ha", e.target.value)
                          }
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="muted">
            {tr(
              " Incluye insumos, labores, cosecha, transporte, arriendo, financiamiento e impuestos en el costo total. El presupuesto de cobertura contabiliza su costo y permite declarar un ingreso forrajero o una venta cuando exista. Las referencias de girasol y trigo pertenecen a 2024. ",
            )}
          </p>
          <label className="check-label">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
            />
            <span>
              {tr(
                " Continuar con los datos económicos disponibles y completar mi presupuesto después ",
              )}
            </span>
          </label>
        </>
      )}
    </details>
  );
}
export function EconomicsPanel({
  summary,
  options,
  selected,
  onSelect,
  onEdit,
}: {
  summary: EconomicSummary;
  options: Option[];
  selected?: Option;
  onSelect: (id: string) => void;
  onEdit: () => void;
}) {
  const [currency, setCurrency] = useState<"BOB" | "USD">("BOB");
  const fx = summary.settings.bob_per_usd ?? summary.market.fx.bob_per_usd;
  const money = (value: number | null | undefined) =>
    value == null
      ? tr("Pendiente")
      : (currency === "BOB" ? "Bs " : "USD ") +
        n(value / (currency === "USD" ? fx : 1), 0);
  const budget = selected?.economics;
  const best = options.find((o) => o.id === summary.ranked_ids[0]);
  const complete = options.filter((o) => o.economics?.net_bob_ha != null);
  const priced = options.filter((o) => o.economics?.revenue_bob_ha != null);
  return (
    <section
      className="card panel economics-panel"
      data-tour="economic-results"
    >
      <div className="section-head">
        <div>
          <span className="section-kicker">
            <Banknote size={16} />
            {tr(" Economía del lote ")}
          </span>
          <h2>{tr("Compara utilidad y punto de equilibrio")}</h2>
          <p>
            {tr(
              " Tres campañas anuales · valores por hectárea · precios constantes ",
            )}
          </p>
        </div>
        <div className="segments" aria-label={tr("Moneda")}>
          <button
            aria-pressed={currency === "BOB"}
            onClick={() => setCurrency("BOB")}
          >
            {tr(" Bolivianos ")}
          </button>
          <button
            aria-pressed={currency === "USD"}
            onClick={() => setCurrency("USD")}
          >
            {tr(" Dólares ")}
          </button>
        </div>
      </div>
      {best ? (
        <div className="economic-verdict">
          <TrendingUp size={25} />
          <div>
            <small>
              {tr(" Mayor utilidad estimada entre ")}
              {summary.evaluated}
              {tr(" secuencias con presupuesto completo ")}
            </small>
            <h3>{best.names.join(" → ")}</h3>
            <p>
              {money(best.economics!.net_bob_ha)}
              {tr(" por hectárea en tres campañas · ")}
              {n(best.score, 1)}
              {tr(" puntos agronómicos. ")}
            </p>
            <button className="text-button" onClick={() => onSelect(best.id)}>
              {tr(" Examinar esta rotación ")}
              <ArrowRight size={15} />
            </button>
          </div>
        </div>
      ) : (
        <div className="notice">
          {tr(
            " Completa precio, rendimiento y costo total de tres cultivos compatibles para identificar la mayor utilidad. Las secuencias con datos completos de precio y rendimiento muestran su ingreso bruto de referencia. ",
          )}
        </div>
      )}
      <div className="finance-kpis">
        {[
          [tr("Ingreso bruto"), budget?.revenue_bob_ha],
          [tr("Costo total"), budget?.cost_bob_ha],
          [tr("Utilidad estimada"), budget?.net_bob_ha],
        ].map(([label, value]) => (
          <div key={String(label)}>
            <small>{label}</small>
            <strong>{money(value as number | null | undefined)}</strong>
            <span>{tr("por ha · tres campañas")}</span>
          </div>
        ))}
      </div>
      <Plot
        label={tr("Comparación económica por rotación")}
        data={
          complete.length
            ? [
                {
                  type: "bar",
                  name: tr("Ingreso"),
                  x: complete.map((o) => o.names.join(" → ")),
                  y: complete.map(
                    (o) =>
                      o.economics!.revenue_bob_ha! /
                      (currency === "USD" ? fx : 1),
                  ),
                  marker: { color: "#a9ce71" },
                },
                {
                  type: "bar",
                  name: tr("Costo total"),
                  x: complete.map((o) => o.names.join(" → ")),
                  y: complete.map(
                    (o) =>
                      o.economics!.cost_bob_ha! / (currency === "USD" ? fx : 1),
                  ),
                  marker: { color: "#e4bb73" },
                },
                {
                  type: "bar",
                  name: tr("Utilidad"),
                  x: complete.map((o) => o.names.join(" → ")),
                  y: complete.map(
                    (o) =>
                      o.economics!.net_bob_ha! / (currency === "USD" ? fx : 1),
                  ),
                  marker: { color: "#287761" },
                },
              ]
            : [
                {
                  type: "bar",
                  name: tr("Ingreso bruto de referencia"),
                  x: priced.map((o) => o.names.join(" → ")),
                  y: priced.map(
                    (o) =>
                      o.economics!.revenue_bob_ha! /
                      (currency === "USD" ? fx : 1),
                  ),
                  marker: { color: "#73a48c" },
                },
              ]
        }
        layout={{
          barmode: "group",
          margin: { l: 65, r: 15, t: 12, b: 90 },
          yaxis: { title: currency + "/ha" },
          xaxis: { tickangle: -15 },
          legend: { orientation: "h" },
        }}
      />
      <p className="chart-reading">
        <Scale size={18} />
        {budget?.net_bob_ha != null
          ? tr(
              `La alternativa elegida deja ${money(budget.net_bob_ha)} por ha con el presupuesto declarado. ${budget.net_bob_ha >= 0 ? "El ingreso cubre los costos introducidos." : "El costo supera el ingreso estimado."}`,
            )
          : tr(
              "Las barras representan ingresos antes de deducir los costos que faltan. El monto final depende de tu presupuesto y precio de venta.",
            )}
      </p>
      {budget && (
        <>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tr("Campaña")}</th>
                  <th>{tr("Precio Bs/t")}</th>
                  <th>{tr("Rendimiento t/ha")}</th>
                  <th>{tr("Costo Bs/ha")}</th>
                  <th>{tr("Utilidad Bs/ha")}</th>
                  <th>{tr("Equilibrio Bs/t")}</th>
                  <th>{tr("Equilibrio t/ha")}</th>
                </tr>
              </thead>
              <tbody>
                {budget.campaigns.map((c, i) => (
                  <tr key={i}>
                    <td>
                      <b>{selected?.names[i]}</b>
                      <small>
                        {c.price_origin}
                        <br />
                        {c.yield_origin}
                        <br />
                        {c.cost_origin}
                      </small>
                    </td>
                    <td>{n(c.price_bob_t, 0)}</td>
                    <td>{n(c.yield_t_ha, 3)}</td>
                    <td>{n(c.cost_bob_ha, 0)}</td>
                    <td>{n(c.net_bob_ha, 0)}</td>
                    <td>{n(c.break_even_price, 0)}</td>
                    <td>{n(c.break_even_yield, 3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {budget.net_bob_ha != null && (
            <div className="two-col">
              <div className="action-item">
                <b>{tr("Retorno sobre el costo")}</b>
                <p>
                  {n(budget.roi_pct, 1)}
                  {tr(" % en las tres campañas.")}{" "}
                  {budget.net_field_bob != null && (
                    <>
                      {tr(" Utilidad del área delimitada ")}
                      {money(budget.net_field_bob)}.
                    </>
                  )}
                </p>
              </div>
              <div className="action-item">
                <b>{tr("Prueba de resistencia económica")}</b>
                <p>
                  {money(budget.downside_bob_ha)}
                  {tr(
                    " por ha si el rendimiento y el precio caen 20 % cada uno y el costo sube 20 %. Ajuste hipotético de presupuesto. ",
                  )}
                </p>
              </div>
            </div>
          )}
        </>
      )}
      <button className="button secondary" onClick={onEdit}>
        {tr(" Ajustar presupuesto y recalcular ")}
        <ArrowRight size={16} />
      </button>
      <details className="form-details">
        <summary>{tr("Fórmulas, incertidumbre y fuente de precios")}</summary>
        <p>{summary.method}</p>
        <p>{summary.uncertainty}</p>
        <MarketTable market={summary.market} />
      </details>
    </section>
  );
}
export function MarketTable({ market }: { market: Market }) {
  return (
    <>
      <p>{market.market_note}</p>
      <p className="muted">
        {tr(" Base verificada ")}
        {market.verified}
        {tr(" · BCB ")}
        {market.fx.date} · {n(market.fx.bob_per_usd, 2)}
        {tr(" Bs/USD, vigencia hasta")} {market.fx.valid_until}.
      </p>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>{tr("Producto nacional")}</th>
              <th>Bs/t</th>
              <th>USD/t</th>
              <th>{tr("Fecha y mercado")}</th>
            </tr>
          </thead>
          <tbody>
            {market.national.map((p) => (
              <tr key={p.crop}>
                <td>
                  {p.product}
                  <small>
                    {p.value} {p.currency}/{p.unit}
                  </small>
                </td>
                <td>{n(p.bob_t, 0)}</td>
                <td>{n(p.usd_t, 2)}</td>
                <td>
                  {p.date}
                  <small>
                    {p.market}
                    {tr(" · página ")}
                    {p.page}
                  </small>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>{tr("Referencias internacionales")}</h3>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>{tr("Producto")}</th>
              <th>USD/t</th>
              <th>{tr("Fecha")}</th>
              <th>{tr("Mercado")}</th>
            </tr>
          </thead>
          <tbody>
            {market.international.map((p, i) => (
              <tr key={i}>
                <td>{p.product}</td>
                <td>{n(p.usd_t, 2)}</td>
                <td>{p.date}</td>
                <td>{p.market}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!!market.comparisons?.length && (
        <>
          <h3>{tr("Brecha entre referencias nacionales e internacionales")}</h3>
          <div className="table-scroll">
            <table className="data-table">
              <thead>
                <tr>
                  <th>{tr("Producto nacional")}</th>
                  <th>{tr("Nacional USD/t")}</th>
                  <th>{tr("Referencia internacional")}</th>
                  <th>{tr("Internacional USD/t")}</th>
                  <th>{tr("Brecha USD/t")}</th>
                  <th>{tr("Brecha %")}</th>
                </tr>
              </thead>
              <tbody>
                {market.comparisons.map((p, i) => (
                  <tr key={i}>
                    <td>
                      {p.product}
                      <small>{p.national_date}</small>
                    </td>
                    <td>{n(p.national_usd_t, 2)}</td>
                    <td>
                      {p.reference}
                      <small>{p.reference_date}</small>
                    </td>
                    <td>{n(p.reference_usd_t, 2)}</td>
                    <td>{n(p.difference_usd_t, 2)}</td>
                    <td>{n(p.difference_pct, 1)} %</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="chart-reading">
            {tr(
              " La brecha es el precio nacional convertido a USD menos la referencia internacional. El porcentaje divide esa diferencia por la referencia internacional. Cada fila conserva sus fechas. Calidad, condiciones de entrega y logística requieren una cotización específica para evaluar una venta. ",
            )}
          </p>
        </>
      )}
      <p className="muted">
        {market.unit_note} {market.paraguay_note}
      </p>
      <div className="source-links">
        {Object.values(market.sources).map((s) => (
          <a key={s.url} href={s.url} target="_blank" rel="noreferrer">
            {s.name} · {s.date}
          </a>
        ))}
        <a href={market.fx.url} target="_blank" rel="noreferrer">
          {tr(" Tipo de cambio BCB ")}
        </a>
      </div>
    </>
  );
}
