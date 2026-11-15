import { tr } from "./i18n";
import { ExternalLink, Github, Users } from "lucide-react";
export function About() {
  return (
    <article className="about-page">
      <div className="page-heading">
        <div>
          <h1>{tr("Acerca de SkyField")}</h1>
          <p>
            {tr(
              "Un proyecto del grupo Jupiter para la planificación agrícola en Santa Cruz, Bolivia.",
            )}
          </p>
        </div>
        <Users size={28} />
      </div>
      <section className="card panel">
        <h2>{tr("Quiénes somos")}</h2>
        <p>
          {tr(
            "Somos el grupo Jupiter. Desarrollamos SkyField para que productores y profesionales agrónomos puedan explorar rotaciones con información climática, propiedades del suelo y presupuestos comparables.",
          )}
        </p>
        <h2>{tr("Propósito del proyecto")}</h2>
        <p>
          {tr(
            "Queremos facilitar decisiones que consideren el agua disponible, la salud del suelo y la viabilidad económica. La herramienta reúne fuentes públicas y permite incorporar información del productor, con explicación de métodos, incertidumbre y datos pendientes.",
          )}
        </p>
      </section>
      <section className="card panel">
        <h2>{tr("Cómo funciona")}</h2>
        <p>
          {tr(
            "Elige un lote, confirma su manejo y compara tres campañas anuales. SkyField calcula un balance hídrico diario, explora escenarios de lluvia y temperatura y presenta una evaluación económica cuando se completan los presupuestos.",
          )}
        </p>
        <p>
          {tr(
            "El catálogo reúne 24 cultivos. Quince participan en la simulación anual. Café, cacao, vainilla, pitajaya y açaí cuentan con evaluación de inversión perenne.",
          )}
        </p>
        <h2>{tr("Fuentes y atribuciones")}</h2>
        <ul>
          <li>
            <a
              href="https://power.larc.nasa.gov/"
              target="_blank"
              rel="noreferrer"
            >
              NASA POWER
            </a>
            {tr(" aporta las series meteorológicas regionales.")}
          </li>
          <li>
            <a
              href="https://www.cpc.ncep.noaa.gov/data/indices/RONI.ascii.txt"
              target="_blank"
              rel="noreferrer"
            >
              NOAA CPC RONI
            </a>
            {tr(" permite estudiar asociaciones ENSO.")}
          </li>
          <li>
            <a
              href="https://open-meteo.com/en/docs"
              target="_blank"
              rel="noreferrer"
            >
              Open-Meteo
            </a>
            {tr(" ofrece pronóstico diario y perspectiva EC46/SEAS5.")}
          </li>
          <li>
            <a
              href="https://www.isric.org/explore/soilgrids"
              target="_blank"
              rel="noreferrer"
            >
              ISRIC SoilGrids
            </a>
            {tr(" proporciona predicciones regionales del suelo.")}
          </li>
          <li>
            <a
              href="https://cao.org.bo/estadisticas/"
              target="_blank"
              rel="noreferrer"
            >
              {tr("Cámara Agropecuaria del Oriente")}
            </a>
            {tr(
              " aporta estadísticas agrícolas regionales. OAP, ANAPO, Banco Mundial y BCB aportan referencias económicas fechadas.",
            )}
          </li>
          <li>
            {tr(
              "FAO 56 fundamenta la evapotranspiración de referencia. NASA GIBS aporta capas visuales. OpenStreetMap, OpenMapTiles, OpenFreeMap y geoBoundaries aportan contexto cartográfico.",
            )}
          </li>
        </ul>
      </section>
      <section className="card panel">
        <h2>{tr("Interpretación y confiabilidad")}</h2>
        <p>
          {tr(
            "Los escenarios exploran respuestas del balance de agua. El índice de evidencia permite revisar integridad del histórico, suelo, presupuesto y disponibilidad del pronóstico. La calibración predictiva y las recomendaciones por cultivar requieren mediciones independientes y experiencia local.",
          )}
        </p>
        <p>
          {tr(
            "El productor y su equipo agronómico confirman suelos, ventanas de siembra, sanidad, precios y costos antes de una decisión de campo.",
          )}
        </p>
        <h2>{tr("Privacidad y uso")}</h2>
        <p>
          {tr(
            "Los lotes, importaciones e informes se vinculan a la cuenta que los crea. La descarga sin conexión almacena recursos públicos de orientación regional en este navegador. Las consultas a proveedores públicos utilizan la ubicación representativa del lote para recuperar los datos.",
          )}
        </p>
        <h2>{tr("Demostración y colaboración")}</h2>
        <p>
          {tr(
            "SkyField funciona como prototipo para hackatón. El alojamiento gratuito puede requerir tiempo de activación y tiene límites de persistencia. El repositorio permite revisar el código y comunicar incidencias o propuestas al grupo Jupiter.",
          )}
        </p>
        <a
          className="button secondary"
          href="https://github.com/Jamoncito/SkyField"
          target="_blank"
          rel="noreferrer"
        >
          <Github size={18} />
          {tr(" Código fuente y contacto ")}
          <ExternalLink size={15} />
        </a>
        <p className="muted">
          {tr(
            "La imagen aérea de portada es una ilustración generada para SkyField.",
          )}
        </p>
      </section>
    </article>
  );
}
