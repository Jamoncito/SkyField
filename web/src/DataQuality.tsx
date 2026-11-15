import { tr } from "./i18n";
import { ClipboardCheck } from "lucide-react";
import type { Result } from "./types";
import { n } from "./client";
export function DataQuality({ quality }: { quality?: Result["quality"] }) {
  if (!quality) return null;
  return (
    <section className="card panel data-quality" data-tour="quality">
      <div className="section-head">
        <div>
          <span className="section-kicker">
            <ClipboardCheck size={17} />
            {tr(" Calidad de la evidencia")}
          </span>
          <h2>{quality.level}</h2>
          <p>
            {tr("Evaluación de las entradas del análisis · ")}
            {quality.assessed_on}
          </p>
        </div>
        <div className="quality-score">
          <strong>{quality.score}/100</strong>
          <span>{tr("Integridad de entradas")}</span>
        </div>
      </div>
      <p>{quality.interpretation}</p>
      <p className="notice">
        <strong>{quality.validation}</strong>
      </p>
      <details className="form-details">
        <summary>{tr("Cómo se calcula y qué verificar")}</summary>
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>{tr("Componente")}</th>
                <th>{tr("Puntos")}</th>
                <th>{tr("Evidencia")}</th>
              </tr>
            </thead>
            <tbody>
              {quality.components.map((c) => (
                <tr key={c.key}>
                  <td>{c.label}</td>
                  <td>
                    {c.points}/{c.maximum}
                  </td>
                  <td>{c.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <ul>
          {quality.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
        <p className="muted">
          {tr("Punto de análisis WGS 84 · ")}
          {n(quality.point[1], 5)}°, {n(quality.point[0], 5)}°
        </p>
      </details>
    </section>
  );
}
