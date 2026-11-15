import { tr } from "./i18n";
import { useEffect, useRef, useState } from "react";
import { ArrowLeft, ArrowRight, X } from "lucide-react";
import type { Go } from "./App";
type Step = {
  title: string;
  text: string;
  path: string;
  target: string;
  check?: () => string | null;
};
type Box = {
  top: number;
  left: number;
  width: number;
  height: number;
};
const value = (name: string) =>
  document.querySelector<HTMLInputElement | HTMLSelectElement>(
    `[name="${name}"]`,
  )?.value ?? "";
export function GuidedTour({
  pilot,
  navigate,
  onFinish,
}: {
  pilot?: string;
  navigate: Go;
  onFinish: () => void;
}) {
  const [step, setStep] = useState(0),
    [box, setBox] = useState<Box | null>(null),
    [waiting, setWaiting] = useState(true);
  const [position, setPosition] = useState({ top: 12, left: 12 }),
    [error, setError] = useState(""),
    [run, setRun] = useState<string>();
  const dialog = useRef<HTMLDivElement>(null);
  const actions = useRef({ navigate, onFinish });
  actions.current = { navigate, onFinish };
  const lot = "/lotes/" + (pilot ?? "nuevo"),
    analysis = lot + "/analizar",
    results = run ? "/comparar/" + run : "/comparar";
  const steps: Step[] = [
    {
      title: tr("Bienvenido a SkyField"),
      text: tr(
        "Vamos a crear tu primer lote y preparar una comparación. Podrás escribir y usar cada opción iluminada. Pulsa Siguiente cuando termines cada paso o Saltar para explorar por tu cuenta.",
      ),
      path: "/",
      target: "dashboard",
    },
    {
      title: tr("Dale un nombre a tu terreno"),
      text: tr(
        "Escribe al menos dos caracteres. Puedes usar un nombre que reconozcas, como Lote norte o Mi piloto. Después pulsa Siguiente.",
      ),
      path: lot,
      target: "field-name",
      check: () =>
        value("field_name").trim().length >= 2
          ? null
          : tr("Escribe un nombre de al menos dos caracteres para continuar."),
    },
    {
      title: tr("Ubica tu primer lote"),
      text: tr(
        "Busca un lugar y confirma el punto, dibuja un perímetro o pulsa Usar punto piloto de Santa Cruz para practicar con un histórico verificado. Elige una ubicación antes de seguir.",
      ),
      path: lot,
      target: "location",
      check: () =>
        document.querySelector('[data-geometry-ready="true"]')
          ? null
          : tr(
              "Selecciona un punto, termina el perímetro o utiliza el punto piloto.",
            ),
    },
    {
      title: tr("Guarda tu primer lote"),
      text: tr(
        "Comprueba el nombre y la ubicación y pulsa Guardar en la ficha. Al guardarse, se habilitará Siguiente. Tu terreno queda asociado a tu cuenta.",
      ),
      path: lot,
      target: "save-field",
      check: () =>
        pilot && document.querySelector('[data-saved="true"]')
          ? null
          : tr("Pulsa Guardar y espera la confirmación del lote."),
    },
    {
      title: tr("Busca provincias y municipios"),
      text: tr(
        "El buscador enfoca el mapa al escribir una provincia, municipio o departamento. Confirmar punto cambia la ubicación del terreno y permite guardar una nueva versión.",
      ),
      path: lot,
      target: "map-search",
    },
    {
      title: tr("También puedes ingresar coordenadas"),
      text: tr(
        "Abre Coordenadas para escribir latitud y longitud decimales. Usa Ubicar y confirma el punto. Los valores de Santa Cruz suelen ser negativos en ambos campos.",
      ),
      path: lot,
      target: "coordinates",
    },
    {
      title: tr("Dibuja o utiliza el GPS"),
      text: tr(
        "Puedes marcar los límites del terreno o solicitar tu posición. Verifica la precisión del dispositivo y guarda los cambios antes de analizar.",
      ),
      path: lot,
      target: "map-tools",
    },
    {
      title: tr("Mira el entorno desde NASA"),
      text: tr(
        "Selecciona una capa y su fecha. NDVI, temperatura superficial, lluvia, humedad y biomasa tienen escalas distintas. La leyenda indica qué representa cada color.",
      ),
      path: lot,
      target: "nasa",
    },
    {
      title: tr("Lleva Santa Cruz sin conexión"),
      text: tr(
        "Descarga el mapa regional mientras tienes internet. El enlace sin conexión conserva las provincias y referencias municipales en este navegador y dispositivo.",
      ),
      path: lot,
      target: "offline",
    },
    {
      title: tr("Consulta el perfil de suelo"),
      text: tr(
        "Consultar suelo obtiene una estimación regional de textura, pH, carbono y retención. Compara estas predicciones con muestreos y experiencia local.",
      ),
      path: lot,
      target: "soil",
    },
    {
      title: tr("Planifica con el tiempo cercano"),
      text: tr(
        "Consulta siete días, una perspectiva de treinta días y el conjunto estacional. Cada gráfica explica sus unidades, dispersión y decisiones que puedes revisar.",
      ),
      path: lot,
      target: "weather",
    },
    {
      title: tr("Añade tus propios datos"),
      text: tr(
        "Las plantillas permiten importar clima, análisis de suelo y campañas. La aplicación valida las filas y conserva su procedencia para cada cálculo.",
      ),
      path: lot,
      target: "imports",
    },
    {
      title: tr("Declara el manejo del terreno"),
      text: tr(
        "Selecciona el cultivo anterior y la disponibilidad de riego. Puedes elegir No lo sé de forma explícita cuando necesites completar la información después.",
      ),
      path: analysis,
      target: "management",
      check: () =>
        value("previous") && value("irrigation")
          ? null
          : tr("Selecciona el cultivo anterior y la disponibilidad de riego."),
    },
    {
      title: tr("Elige tu prioridad"),
      text: tr(
        "La prioridad cambia el peso del agua, la cobertura y la diversidad. Ajusta lo que más importa para tu terreno y continúa.",
      ),
      path: analysis,
      target: "priority",
    },
    {
      title: tr("Planea las tres campañas"),
      text: tr(
        "Puedes elegir un mes común o meses distintos por campaña anual. Revisa ventanas y duración de cultivos con un técnico de tu zona.",
      ),
      path: analysis,
      target: "calendar",
    },
    {
      title: tr("Define los cultivos disponibles"),
      text: tr(
        "Marca al menos tres cultivos que puedas manejar. Considera semilla, equipo, mercado y experiencia. Los sistemas perennes tienen su propia evaluación de inversión.",
      ),
      path: analysis,
      target: "crops",
      check: () =>
        document.querySelectorAll(".crop-selection input:checked").length >= 3
          ? null
          : tr("Selecciona al menos tres cultivos disponibles."),
    },
    {
      title: tr("Prepara un primer ensayo"),
      text: tr(
        "Para practicar con el piloto, marca Activar supuestos de ensayo. El resultado identificará el perfil asumido. En tus siguientes análisis puedes introducir retención y profundidad en Perfil de suelo para representar tu terreno.",
      ),
      path: analysis,
      target: "trial",
      check: () =>
        document.querySelector<HTMLInputElement>('[name="trial"]')?.checked ||
        (value("theta_fc") && value("theta_wp") && value("depth_m"))
          ? null
          : tr(
              "Completa retención y profundidad o activa los supuestos de ensayo.",
            ),
    },
    {
      title: tr("Ensaya cambios del clima"),
      text: tr(
        "Ajusta lluvia y temperatura para tu sensibilidad personalizada. El análisis agrega escenarios de Niño y Niña muy fuertes con cambios locales estimados a partir de NASA y NOAA.",
      ),
      path: analysis,
      target: "sensitivity",
    },
    {
      title: tr("Incluye los números de tu producción"),
      text: tr(
        "Introduce precio pactado, rendimiento propio y costo total. Para avanzar puedes completar al menos tres costos o marcar que continuarás con los datos económicos disponibles.",
      ),
      path: analysis,
      target: "economics",
      check: () =>
        document.querySelector('[data-tour="economics"][data-ready="true"]')
          ? null
          : tr(
              "Completa al menos tres costos o confirma que continuarás con los datos disponibles.",
            ),
    },
    {
      title: tr("Ejecuta tu primera comparación"),
      text: tr(
        "Pulsa Analizar rotaciones en la opción iluminada. Esperaremos el cálculo para enseñarte las alternativas. Puedes saltar el recorrido en cualquier momento.",
      ),
      path: analysis,
      target: "run",
      check: () =>
        run ? null : tr("Pulsa Analizar rotaciones para iniciar el cálculo."),
    },
    {
      title: tr("Compara tus alternativas"),
      text: tr(
        "Selecciona una secuencia y revisa sus puntos agronómicos, calendario y déficit. Las opciones económicas se buscan entre todas las secuencias viables con datos completos.",
      ),
      path: results,
      target: "results",
    },
    {
      title: tr("Interpreta la rentabilidad"),
      text: tr(
        "Consulta ingreso, costo, utilidad y punto de equilibrio. Los valores pendientes indican qué datos necesitas aportar. Puedes cambiar entre bolivianos y dólares.",
      ),
      path: results,
      target: "economic-results",
    },
    {
      title: tr("Explora la sensibilidad ENSO"),
      text: tr(
        "Compara escenarios y revisa cuánto cambia el déficit en porcentaje. La lluvia mensual tiene intervalos de incertidumbre y marcas de extrapolación.",
      ),
      path: results,
      target: "climate-impact",
    },
    {
      title: tr("Descarga tu informe"),
      text: tr(
        "Generar informe prepara el PDF, los indicadores y la serie diaria de la alternativa elegida. Los documentos conservan las fuentes y los supuestos del análisis.",
      ),
      path: results,
      target: "export",
    },
    {
      title: tr("Conoce cultivos y estadísticas"),
      text: tr(
        "Aquí encontrarás café, cacao, vainilla, pitajaya y açaí, su evaluación de inversión y los cuadros de producción, rendimiento y superficie de la CAO.",
      ),
      path: "/cultivos",
      target: "crop-library",
    },
    {
      title: tr("Tu espacio está listo"),
      text: tr(
        "El menú reúne tus lotes, análisis, informes y fuentes de mercado. Desde tu perfil puedes volver a abrir la guía. El recorrido automático se muestra una sola vez por cuenta.",
      ),
      path: "/",
      target: "profile",
    },
  ];
  const current = steps[step];
  useEffect(() => {
    const started = (event: Event) => {
      setRun((event as CustomEvent<string>).detail);
      setStep(20);
      setError("");
    };
    window.addEventListener("skyfield-analysis-started", started);
    const escape = (event: KeyboardEvent) => {
      if (event.key === tr("Escape")) actions.current.onFinish();
    };
    document.addEventListener("keydown", escape);
    return () => {
      window.removeEventListener("skyfield-analysis-started", started);
      document.removeEventListener("keydown", escape);
    };
  }, []);
  useEffect(() => {
    setBox(null);
    setWaiting(true);
    setError("");
    actions.current.navigate(current.path);
    let frame = 0,
      found: HTMLElement | null = null;
    const opened: HTMLDetailsElement[] = [];
    function measure() {
      if (!found) return;
      const r = found.getBoundingClientRect(),
        top = Math.min(innerHeight - 10, Math.max(5, r.top - 5)),
        left = Math.min(innerWidth - 10, Math.max(5, r.left - 5));
      const width = Math.max(0, Math.min(innerWidth - left - 5, r.width + 10)),
        height = Math.max(0, Math.min(innerHeight - top - 5, r.height + 10));
      setBox({ top, left, width, height });
      const w = Math.min(370, innerWidth - 24),
        h = dialog.current?.getBoundingClientRect().height ?? 260;
      const mobile = innerWidth < 850,
        below = top + height + 14,
        beside = left + width + 14;
      const proposed =
        !mobile && beside + w < innerWidth - 12
          ? top
          : mobile
            ? innerHeight - h - 12
            : below + h < innerHeight - 12
              ? below
              : top - h - 12;
      const y = Math.max(12, Math.min(proposed, innerHeight - h - 12));
      setPosition({
        top: y,
        left:
          !mobile && beside + w < innerWidth - 12
            ? beside
            : Math.min(Math.max(12, left), innerWidth - w - 12),
      });
    }
    function locate() {
      const element = document.querySelector<HTMLElement>(
        `[data-tour="${current.target}"]`,
      );
      if (!element) return;
      found = element;
      let parent = element.closest("details");
      while (parent) {
        if (!parent.open) {
          parent.open = true;
          opened.push(parent);
        }
        parent = parent.parentElement?.closest("details") ?? null;
      }
      if (element.getBoundingClientRect().width === 0) return;
      observer.disconnect();
      setWaiting(false);
      const r = element.getBoundingClientRect();
      if (r.top < 85 || r.bottom > innerHeight * 0.6)
        window.scrollBy({
          top: r.top - 100,
          behavior: matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "instant"
            : "smooth",
        });
      measure();
      const until = performance.now() + 800;
      const animate = () => {
        measure();
        if (performance.now() < until) frame = requestAnimationFrame(animate);
      };
      frame = requestAnimationFrame(animate);
    }
    const observer = new MutationObserver(locate);
    observer.observe(document.querySelector("main") ?? document.body, {
      childList: true,
      subtree: true,
    });
    locate();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    const resize = new ResizeObserver(measure);
    if (dialog.current) resize.observe(dialog.current);
    return () => {
      observer.disconnect();
      resize.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
      opened.forEach((d) => {
        d.open = false;
      });
    };
  }, [step, current.path, current.target]);
  function advance() {
    const message = current.check?.();
    if (message) {
      setError(message);
      return;
    }
    setError("");
    if (step + 1 < steps.length) setStep(step + 1);
    else onFinish();
  }
  return (
    <div className="guided-tour">
      {box ? (
        <>
          <div
            className="tour-mask"
            style={{ top: 0, left: 0, right: 0, height: box.top }}
          />
          <div
            className="tour-mask"
            style={{ top: box.top + box.height, left: 0, right: 0, bottom: 0 }}
          />
          <div
            className="tour-mask"
            style={{
              top: box.top,
              left: 0,
              width: box.left,
              height: box.height,
            }}
          />
          <div
            className="tour-mask"
            style={{
              top: box.top,
              left: box.left + box.width,
              right: 0,
              height: box.height,
            }}
          />
          <div className="tour-spotlight" style={box} />
        </>
      ) : (
        <div className="tour-mask" style={{ inset: 0 }} />
      )}
      <div
        ref={dialog}
        className="tour-dialog card"
        role="dialog"
        aria-modal="false"
        aria-labelledby="tour-title"
        aria-describedby="tour-description"
        style={position}
      >
        <div className="tour-top">
          <span>
            {tr(" Tu primer lote · ")}
            {step + 1}
            {tr(" de ")}
            {steps.length}
          </span>
          <button
            className="text-button"
            onClick={onFinish}
            aria-label={tr("Saltar recorrido")}
          >
            {tr(" Saltar ")}
            <X size={15} />
          </button>
        </div>
        <progress value={step + 1} max={steps.length} />
        <h2 id="tour-title">{current.title}</h2>
        <p id="tour-description" aria-live="polite">
          {current.text}
        </p>
        {waiting && (
          <small role="status">
            {tr("Esperando a que la opción esté lista…")}
          </small>
        )}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="tour-actions">
          <button
            className="button secondary"
            disabled={step === 0}
            onClick={() => setStep(step - 1)}
          >
            <ArrowLeft size={15} />
            {tr(" Anterior ")}
          </button>
          <button
            className="button primary"
            disabled={waiting}
            onClick={advance}
          >
            {step + 1 < steps.length ? tr("Siguiente") : tr("Finalizar")}
            <ArrowRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
}
