# Júpiter Jr

Júpiter Jr permite guardar terrenos agrícolas, comparar rotaciones de tres campañas con clima histórico y descargar un informe con la evidencia del análisis. El piloto **PT_priner lote** se crea al registrarse. Su ubicación de referencia está en Santa Cruz, Bolivia, y se guarda como punto.

## Arranque local

### Windows en este equipo

Desde la raíz, abre PowerShell y ejecuta:

~~~powershell
./scripts/start-windows.ps1
~~~

Abre [Júpiter Jr](http://localhost:8080), crea tu cuenta y entra en **Explorar lote piloto → Analizar**. Para ver el balance del piloto sin un perfil de laboratorio, activa **Supuestos de ensayo** en el formulario. Puedes usar **Solo lluvia** para explorar un escenario de secano. Las entradas introducidas como pruebas deben distinguirse de las medidas con el productor.

El lanzador necesita Node.js 24.7 o superior, Python con pip para preparar las dependencias, Microsoft Edge y acceso inicial a internet. Usa Python 3.12 firmado, PostGIS sobre PGlite y la misma API y las mismas migraciones de la variante Compose. En esta variante, la carga a tablas temporales usa inserciones por lotes y Chromium usa Edge. La base de desarrollo queda en `.local/pglite/pgdata` y los archivos en `.local/private`. Ejecuta el lanzador para volver a arrancar tras reiniciar Windows. Usa `./scripts/stop-windows.ps1` para detener los tres procesos, o `./scripts/start-windows.ps1 -Rebuild` para reinstalar dependencias y recompilar el frontend. Después de cambiar código de API o del procesador, detén y vuelve a arrancar.

### Docker Compose

Requiere un motor Docker con Compose. El manifiesto verificado de PostGIS es linux/amd64. En un equipo ARM, Compose requiere emulación amd64. Si Docker y el modo Windows se usan en el mismo equipo, detén primero la aplicación que ocupe el puerto 8080.

~~~powershell
./scripts/make-env.ps1
docker compose up --build
~~~

En un shell POSIX puedes copiar `.env.example` a `.env`, generar la contraseña con `openssl rand -hex 28` y asignarla a `POSTGRES_PASSWORD`, luego ejecutar `docker compose up --build`. Conserva la contraseña junto a la configuración del volumen. Compose ejecuta Alembic y el catálogo antes de iniciar la API y el worker. El puerto publicado es `127.0.0.1:8080`. Para revisar el servicio, usa `docker compose ps`, `docker compose logs -f api worker` y [OpenAPI](http://localhost:8080/api/docs).

Para trabajar en React con recarga, ejecuta `npm --prefix web ci` y `npm --prefix web run dev` con la API en el puerto 8080. Incluye `http://127.0.0.1:5173` en `APP_ORIGINS` de la API. Para probar GPS en un teléfono, conecta un proxy inverso HTTPS de tu red local al puerto 8080 de la computadora, instala en el teléfono la CA de confianza correspondiente y usa `docker compose -f compose.yaml -f compose.lan.yaml up --build` con `LAN_ORIGIN` apuntando al origen HTTPS del proxy. Mantén el puerto de base y los archivos en el entorno local. El perfil HTTPS debe verificarse en cada instalación.

## Datos

- El CSV original de NASA POWER está en `data/reference`. SHA-256 `a857c75725241b54619b2552f86ec488627b222cafd3f70b33a791115c3f306d`. Su serie diaria UTC cubre 2015–2025, con 4.018 observaciones completas, 1.174,83 mm/año en promedio y 26,13 °C de temperatura media. El histórico solo se reutiliza para el punto validado. Un punto distinto consulta su propia serie. [NASA POWER](https://power.larc.nasa.gov/docs/tutorials/service-data-request/api/)
- Se puede descargar una copia nueva con `docker compose exec api python scripts/power.py --output /private/power-piloto.csv` o en Windows con `. ./scripts/dev-env.ps1` y `& $Python scripts/power.py --output .local/power-piloto.csv`. El hash de una nueva respuesta depende de la versión publicada por la fuente.
- Descarga las plantillas desde **Datos del lote**. El formato es UTF-8, coma, decimal con punto y fechas ISO. El clima normalizado declara °C, %, m/s, MJ/m²/día y mm/día. Los vacíos y los centinelas admitidos se conservan como nulos. Los CSV de suelo y campañas deben incluir el identificador del lote tal como aparece en el formulario. Una reimportación idéntica para la misma versión del lote reutiliza la importación anterior.
- El mapa vectorial de OpenFreeMap atribuye OpenStreetMap, OpenMapTiles y OpenFreeMap en el visor. En caso de fallo, el editor conserva las geometrías sobre un fondo local. La imagen de portada se generó con ImageGen como ilustración aérea y es decorativa. [OpenFreeMap](https://openfreemap.org/quick_start/)
- La futura integración de HLS y SRTM requiere linderos confirmados, selección por área y fechas, máscaras QA y resolución de origen. IMERG y SMAP aportarían contexto regional en su soporte nativo. Conserva el archivo de origen en COG, NetCDF o HDF5 según el producto, registra versión, resolución y fecha, y exporta estadísticas por lote con unidades y cobertura válida. [Earthdata Search](https://search.earthdata.nasa.gov/)

## Cómo leer el análisis

La comparación explora soya, maíz, sorgo y mucuna en ventanas contiguas de tres años. Usa Penman–Monteith FAO 56 a paso diario, con radiación neta estimada, humedad media y viento a 2 m. El balance conserva agua al cambiar la profundidad de raíces y entre campañas. Incluye lluvia, escorrentía de ensayo del 10 %, riego declarado, consumo y drenaje. El escenario de sensibilidad modifica lluvia y temperatura sobre las mismas secuencias. El informe y su CSV se generan desde el resultado persistido. La serie diaria descarga la primera ventana completa de cada escenario para la opción seleccionada. [FAO 56](https://www.fao.org/4/x0490e/x0490e00.htm)

El catálogo y los umbrales iniciales son ilustrativos. Las ventanas, los cultivares, el manejo sanitario, los costos y los datos edáficos requieren validación local. Las muestras y campañas importadas se muestran como antecedentes, y el productor confirma las entradas numéricas del modelo en el formulario. Se calculan los indicadores con evidencia suficiente y los demás se muestran pendientes. Para áreas extensas, el editor aplica un umbral preliminar de 0,05° de separación entre vértices y deriva el caso a revisión multicelda. El umbral no identifica los bordes de las grillas de origen.

## Operación

- Reiniciar y actualizar con Compose. Usa `docker compose down` y luego `docker compose up --build`. La unidad `migrate` ejecuta Alembic y el sembrado idempotente del catálogo. Para ejecutar solo una migración con la base activa, usa `docker compose run --rm migrate`.
- Respaldo frío con Compose. Detén `web api worker` y conserva `.env`. Usa `docker compose exec db pg_dump -U jupiter -d jupiter -Fc -f /tmp/jupiter.dump` y `docker compose cp db:/tmp/jupiter.dump ./jupiter.dump`. En un directorio seguro, conserva también los archivos privados con `docker compose run --rm --no-deps -v "<directorio-local>:/backup" api tar -C /private -cf /backup/private.tar .`. Registra el SHA-256 de ambos archivos.
- Restauración con Compose. En una instancia de prueba vacía, arranca `db`, espera a que esté sano, copia el archivo con `docker compose cp ./jupiter.dump db:/tmp/jupiter.dump` y restaura con `docker compose exec db pg_restore -U jupiter -d jupiter --exit-on-error /tmp/jupiter.dump`. Restaura `private.tar` en el volumen de archivos antes de iniciar el resto de servicios y verifica una descarga. En Windows, detén el lanzador y respalda juntos `.local/pglite/pgdata` y `.local/private`.
- Los trabajos tienen concesiones renovables, reintento y cancelación. Si un proceso muere antes de publicar, el siguiente intento puede reclamar la concesión vencida. Los informes se publican junto al estado final mediante una transacción. La carpeta privada de un intento interrumpido puede quedar huérfana y no se presenta como descarga.
- Las tablas normales cubren el piloto y la ingestión usa bloques. Evalúa particionar series extensas por fecha cuando las mediciones de uso lo justifiquen.

## Pruebas

Con la app activa en Windows, desde la raíz:

~~~powershell
. ./scripts/dev-env.ps1
& $Python -m pytest -q
& $Python -X utf8 tests/acceptance.py --channel msedge
& $Python -X utf8 tests/recovery.py --windows-worker
~~~

La aceptación produce capturas y descargas en `.local/evidence`. El test de recuperación interrumpe el worker de esta copia local y reinicia la aplicación. La geolocalización de la prueba se emula. Los scripts de prueba crean cuentas independientes con credenciales aleatorias.

### Verificación del 13 de noviembre de 2026

- Pasaron las cinco pruebas del núcleo y la aceptación de navegador y API en Edge Chromium, con escritorio y vista móvil de 390 px. Se comprobaron registro, cierre de sesión, dibujo y área en PostGIS, GPS emulado concedido y denegado, fondo local, OpenFreeMap con atribución, aislamiento entre cuentas y exportación PDF, CSV y serie diaria.
- Se verificaron el SHA-256 y los 4.018 días del piloto. Se probó la carga en bloques de 617 filas, fecha inválida, fecha duplicada, día ausente, reimportación y rechazo del histórico piloto en un punto distante. Se obtuvo por la API un CSV distinto de 4.018 días para un segundo punto. También se verificaron cargas de suelo y campañas, la ausencia de datos hídricos y un fallo de red simulado de NASA POWER.
- El balance pasó un caso manual. En el piloto de ensayo, cambiar de prioridad equilibrada a agua cambió la primera alternativa. Una concesión vencida fue reclamada por el worker con un solo resultado. Tras reiniciar los servicios de Windows, la descarga conservó su SHA-256. Se aplicaron las dos migraciones y el catálogo dos veces en una base vacía.
- Docker y WSL no estaban disponibles en este equipo. La verificación se ejecutó en Windows con PGlite/PostGIS. Quedan por ejecutar Compose, sus procedimientos de respaldo y restauración, GPS en un teléfono físico y validación agronómica con el productor.
- El remoto indicado no aceptó acceso sin credenciales y el ZIP de referencia no apareció en las carpetas revisadas. El diseño y el CSV entregados sirvieron de base para un repositorio local nuevo.

La portada se generó con ImageGen para representar parcelas subtropicales cerca de Santa Cruz desde el aire, con mosaicos agrícolas verdes, caminos rurales y luz natural. El archivo de la aplicación está en `web/public/agro-aerial.webp`.
