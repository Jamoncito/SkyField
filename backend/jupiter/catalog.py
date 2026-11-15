"""Regional representation and agronomic scope kept alongside model parameters."""
from .model import CROPS, FAO

REGIONAL_SOURCE = "https://ice.santacruz.gob.bo/uploads/SANTA_CRUZ_ESTADISTICO_2024_a8a96110b3.pdf"
PERIOD = "2022–2023 (preliminar), ICE 2024, p. 47, fuente INE"
PRODUCTION_KT = {"soy":3542,"sorghum":881,"maize":743,"wheat":198,"sunflower":180,
                 "cassava":116,"bean":95,"potato":73,"sugarcane":9757,"rice":516,"mandarin":121}
CONTEXT = {
    "sugarcane":dict(name="Caña de azúcar",family="Poaceae",
                    note="Cultivo plurianual con socas. Requiere plan de renovación y balance de varios cortes."),
    "rice":dict(name="Arroz con cáscara",family="Poaceae",
                note="Confirma secano o riego. El arroz inundado requiere balance de lámina y percolación específico."),
    "mandarin":dict(name="Mandarina",family="Rutaceae",
                    note="Huerto perenne. Requiere manejo por edad, portainjerto y cobertura entre hileras."),
    "coffee":dict(name="Café",family="Rubiaceae", scientific="Coffea arabica / C. canephora",
        system="perennial", source="https://ice.santacruz.gob.bo/noticias/57",
        note="Café arábica y robusta requieren evaluar altitud, temperatura y cultivar. La caficultura cruceña tiene registros ICE por provincia. Planifica sombra, cosecha selectiva y beneficio."),
    "cacao":dict(name="Cacao",family="Malvaceae", scientific="Theobroma cacao",
        system="perennial",source="https://ecocrop.apps.fao.org/ecocrop/srv/en/cropView?id=2074",
        note="Sistema perenne tropical. Evalúa sombra, drenaje, sanidad, disponibilidad de agua y fermentación del grano. La aptitud y el precio dependen del sitio y la calidad."),
    "vanilla":dict(name="Vainilla",family="Orchidaceae",scientific="Vanilla planifolia",
        system="perennial",source="https://ask.ifas.ufl.edu/publication/HS1348",
        note="Orquídea trepadora con tutor, sombra y polinización manual. El establecimiento demora varios años según el material. Presupuesta mano de obra, curado y comprador especializado."),
    "pitaya":dict(name="Pitajaya / pitahaya",family="Cactaceae",scientific="Selenicereus spp.",
        system="perennial",source="https://www.atermaisdigital.cnptia.embrapa.br/web/pitaya",
        note="Frutal perenne con tutorado. Confirma cultivar, polinizadores, riego, drenaje y vida poscosecha. La productividad cambia con la edad del huerto."),
    "acai":dict(name="Açaí / asaí",family="Arecaceae",scientific="Euterpe precatoria / E. oleracea",
        system="perennial",source="https://www.embrapa.br/pt/agencia-de-noticias-embrapa/busca-de-noticias/-/noticia/45785884/manejo-adequado-na-entressafra-mantem-fornecimento-de-acai-o-ano-todo",
        note="Distingue asaí amazónico E. precatoria de cultivares E. oleracea. Comprueba adaptación hídrica, años a producción, cosecha y acceso rápido a despulpado y frío."),
    "chia":dict(name="Chía",family="Lamiaceae",source="https://cao.org.bo/estadisticas/",
        note="Cultivo anual con estadísticas CAO de invierno. Requiere parámetros hídricos y calendario validados para incorporarlo a la simulación de rotaciones."),
}
NOTES = {
    "cassava":"Parámetros FAO de primer año, ciclo de 210 días. Confirma cosecha y cultivar de ciclo corto.",
    "potato":"Revisa aptitud térmica y altitud con un agrónomo de los valles cruceños.",
    "tomato":"Confirma tutorado, riego, sanidad y canal de venta para horticultura.",
    "cotton":"Valida cultivar, cosecha especializada y disponibilidad de desmote.",
    "cover":"Cobertura de mucuna orientativa. Planifica terminación y manejo del rastrojo.",
    "cowpea":"Leguminosa de grano o cobertura. Confirma uso, inoculación y mercado.",
}


def catalog():
    return [dict(code=code,name=crop["name"],family=crop["family"],
                 months=crop.get("window",[]),simulated=code in CROPS,
                 production_kt=PRODUCTION_KT.get(code),production_period=PERIOD,
                 production_source=REGIONAL_SOURCE,parameter_source=FAO if code in CROPS else None,
                 system=crop.get("system","annual" if code in CROPS else "regional"),
                 scientific=crop.get("scientific"),source=crop.get("source",FAO),
                 note=crop.get("note") or NOTES.get(code,"Confirma cultivar, ventana local y destino de la cosecha."))
            for code,crop in {**CROPS,**CONTEXT}.items()]
