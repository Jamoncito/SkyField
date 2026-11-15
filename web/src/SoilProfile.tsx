import { tr } from "./i18n";
import { useEffect, useState } from "react";
import { Layers } from "lucide-react";
import { api, errorText, n, post } from "./client";
import type { RegionalSoil, Site } from "./types";
export function useSoil(site: Site) {
  const [profile, setProfile] = useState<RegionalSoil | null>(null);
  const [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const path = "/fields/" + site.id + "/soil-profile";
  useEffect(() => {
    let active = true;
    setProfile(null);
    setError("");
    void api<RegionalSoil | null>(path)
      .then((p) => {
        if (active) setProfile(p);
      })
      .catch((e) => {
        if (active) setError(errorText(e));
      });
    return () => {
      active = false;
    };
  }, [path, site.version]);
  async function consult() {
    setBusy(true);
    setError("");
    try {
      setProfile(await post<RegionalSoil>(path));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
    }
  }
  return { profile, error, busy, consult };
}
export function SoilDetails({ profile }: { profile: RegionalSoil }) {
  const { surface, ph_interval } = profile;
  return (
    <>
      <div className="soil-summary">
        <div>
          <small>{tr("Textura superficial · 0–5 cm")}</small>
          <b>{profile.texture ?? tr("Sin clasificación")}</b>
        </div>
        <div>
          <small>{tr("pH superficial estimado")}</small>
          <b>{n(surface.phh2o, 1)}</b>
          {ph_interval && (
            <small>
              {tr("Intervalo del 90 %: ")}
              {ph_interval.map((x) => n(x, 1)).join(tr(" a "))}
            </small>
          )}
        </div>
        <div>
          <small>{tr("Carbono orgánico superficial")}</small>
          <b>{n(surface.soc, 1)} g/kg</b>
        </div>
      </div>
      <p className="muted">
        {tr("Arena ")}
        {n(surface.sand, 1)}
        {tr(" % · Limo ")}
        {n(surface.silt, 1)}
        {tr(" % · Arcilla ")}
        {n(surface.clay, 1)} %.
      </p>
      <details className="form-details">
        <summary>{tr("Retención por profundidad")}</summary>
        <table className="data-table">
          <thead>
            <tr>
              <th scope="col">{tr("Capa (cm)")}</th>
              <th scope="col">33 kPa (m³/m³)</th>
              <th scope="col">{tr("1.500 kPa (m³/m³)")}</th>
            </tr>
          </thead>
          <tbody>
            {profile.retention.map((l) => (
              <tr key={l.from_cm}>
                <td>
                  {l.from_cm}–{l.to_cm}
                </td>
                <td>{n(l.fc, 3)}</td>
                <td>{n(l.wp, 3)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="muted">
          {tr(
            "Los dos valores aproximan la capacidad de campo y el punto de marchitez. Verifica la profundidad útil y la retención con muestras.",
          )}
        </p>
      </details>
      <p className="muted">
        <a href={profile.url} target="_blank" rel="noreferrer">
          {profile.provider}
        </a>
        {tr(" · píxel de ")}
        {profile.resolution_m} m · {profile.retrieved.slice(0, 10)}
        {tr(
          ". La textura describe las fracciones superficiales. La predicción apoya el muestreo y la interpretación con un agrónomo. ",
        )}
      </p>
    </>
  );
}
export function SoilPanel({
  site,
  disabled = false,
}: {
  site: Site;
  disabled?: boolean;
}) {
  const { profile, error, busy, consult } = useSoil(site);
  const partial =
    profile && profile.retention.some((l) => l.fc === null || l.wp === null);
  return (
    <section className="card panel" data-tour="soil">
      <div className="section-head">
        <div>
          <h2>{tr("Análisis orientativo de suelo")}</h2>
          <p>
            {tr(
              "Textura, pH, carbono y retención de agua estimados para el punto del lote.",
            )}
          </p>
        </div>
        {(!profile || partial) && (
          <button
            className="button secondary"
            type="button"
            disabled={busy || disabled || site.multicell}
            onClick={() => void consult()}
          >
            <Layers size={17} />
            {busy
              ? tr("Consultando SoilGrids…")
              : partial
                ? tr("Completar consulta")
                : tr("Consultar suelo")}
          </button>
        )}
      </div>
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {disabled ? (
        <p className="muted">
          {tr(
            "Guarda el lote para consultar o verificar el perfil de esta versión.",
          )}
        </p>
      ) : (
        profile && <SoilDetails profile={profile} />
      )}
    </section>
  );
}
