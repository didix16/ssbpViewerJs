# SSBP Viewer

Visor de animaciones SpriteStudio SSBP para el navegador, con una biblioteca TypeScript independiente. El proyecto conserva el visor C++ original en `ssbp-Viewer-0.1` como referencia.

![Visor SSBP en el navegador](docs/visor-preview.png)

## Empezar

Requisitos: Node.js 22.12 o superior y npm con soporte para workspaces.

```sh
npm install
npm run dev
```

Abre **http://127.0.0.1:5173/**. El ejemplo de Veronica se carga automáticamente. Selecciona **Abrir carpeta** o arrastra una carpeta que contenga un `.ssbp` y sus texturas. El menú junto al botón permite seleccionar varios archivos o volver a cargar el ejemplo. Si hay varios SSBP en una carpeta, el visor permite elegir uno.

Los archivos se procesan localmente en el navegador. No se envían a un servidor ni se necesitan servicios externos o fuentes remotas.

## Los dos paquetes

| Paquete                           | Contenido                                                                                                                     |
| --------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| [`@ssbp/core`](packages/ssbp)     | Lector binario SSBP v3, datos tipados, evaluación de fotogramas, instancias, efectos y reproductor independiente del entorno. |
| [`@ssbp/viewer`](packages/viewer) | Aplicación React + Vite y renderizador WebGL 2 con shaders propios.                                                           |

La biblioteca no depende del DOM, React ni WebGL. El visor consume su API pública. La conversión de las posiciones de punto fijo (`DOT = 10`) se realiza en la biblioteca; las texturas se dibujan mediante WebGL 2. No se utiliza Canvas 2D, ni siquiera para exportar PNG.

## Controles

- Reproducción, pausa, fotograma anterior y siguiente, línea de tiempo y entrada de fotograma.
- Bucle y velocidad, incluida reproducción inversa.
- Arrastrar para mover la vista, rueda para ampliar y doble clic para ajustar el encuadre.
- Cuadrícula de transparencia, origen, inversión horizontal y geometría.
- Inspector de partes con jerarquía, visibilidad y propiedades del fotograma actual.
- Atlas ampliables con superposición de celdas.
- Exportación del área visible a PNG transparente, de la animación completa a GIF y descarga de datos JSON.
- Atajos del visor C++: Espacio, A/S, flechas, L, X, C, W, Q y 1/2/3. El botón **Atajos** muestra la lista.

El zoom se expresa respecto al encuadre ajustado: **100%** encaja el personaje en el visor. El PNG exportado incluye el área visible del renderizador, a la resolución de pantalla, sin paneles, cuadrícula ni marcas del origen.

**Exportar GIF**, junto a **Exportar PNG**, guarda todos los fotogramas de la animación seleccionada, desde el primero hasta el último. Conserva el encuadre, las capas visibles, la inversión, la velocidad (también inversa) y el ajuste de bucle. Una ventana muestra el progreso y permite cancelar sin perder el fotograma ni el estado de reproducción. La codificación se realiza en un Web Worker local, a partir del framebuffer WebGL y sin Canvas 2D. El formato GIF limita cada fotograma a 256 colores y transparencia binaria; los tiempos se redondean a centésimas de segundo. Para conservar alfa parcial y todos los colores, utiliza PNG.

## Publicar en GitHub Pages

El repositorio incluye [`.github/workflows/pages.yml`](.github/workflows/pages.yml). El workflow instala las dependencias, ejecuta las pruebas, compila los dos paquetes y publica **solo** `packages/viewer/dist`.

1. Sube los archivos del proyecto y el workflow a la rama principal del repositorio (`master` o `main`). Incluye `package-lock.json` y los archivos de `packages/viewer/public/demo`.
2. En GitHub abre **Settings → Pages → Build and deployment → Source** y selecciona **GitHub Actions**.
3. En **Actions**, ejecuta **Deploy SSBP Viewer to GitHub Pages → Run workflow**, o realiza otro push a la rama principal.
4. La ejecución mostrará la dirección publicada. Para este repositorio, la dirección prevista es **https://didix16.github.io/ssbpViewerJs/**.

Los assets y el worker del GIF usan rutas relativas, por lo que la aplicación funciona bajo `/ssbpViewerJs/`, en otro repositorio o con dominio propio. Los siguientes pushes a la rama principal vuelven a publicar automáticamente. No requiere tokens personales, servidor propio ni subir los SSBP que abras: incluso en Pages, tus archivos se procesan dentro del navegador.

La carpeta `packages/viewer/dist` queda generada también con `npm run build` y puede desplegarse en cualquier alojamiento estático. No basta con publicar los archivos TypeScript de `src` directamente.

## Compilar y verificar

```sh
npm run typecheck
npm test
npm run build
npm run preview
```

La compilación produce la biblioteca en `packages/ssbp/dist` y la aplicación estática en `packages/viewer/dist`. Se puede alojar la segunda carpeta en cualquier servidor HTTP estático, también bajo una subcarpeta.

Las pruebas de navegador arrancan su propio servidor en el puerto 5174, verifican WebGL, exportación con alfa, búsqueda, controles, jerarquía, atlas, carga de archivos locales y diseño móvil, y guardan capturas en `test-results`:

```sh
npx playwright install chromium
npm run test:browser
```

También se puede indicar un Chromium ya instalado mediante `SSBP_BROWSER_PATH`.

`npm run test:pages` compila la aplicación y la sirve bajo `/ssbpViewerJs/`, igual que GitHub Pages. Comprueba que se cargan los assets y el worker, y verifica los fotogramas, la duración, la transparencia, el orden inverso, el bucle y la cancelación del GIF exportado.

## Compatibilidad y datos del ejemplo

Se admite **SSBP binario versión 3**; otras versiones producen un error explícito. Se implementan partes normales y nulas, instancias anidadas, transformaciones XYZ, pivotes, deformaciones de vértices, UV, mezclas de color y alfa, etiquetas y datos de usuario. Los campos de texto reservados por el runtime C++ se pueden inspeccionar, pero no generan sprites de texto.

El ejemplo tiene 52 celdas, dos packs, 11 animaciones y 306 fotogramas en total. Sus archivos `Body_AllTex.png` y `Option_Tex.png` contienen **WebP**: el cargador reconoce sus cabeceras. Las texturas de arma `wep_mg.png` y `eff_WepSwing.png` están incluidas en `public/demo/Wep`. Para tus propios proyectos, puedes colocarlas en una carpeta `Wep` junto a `tex`: el cargador también busca por nombre cuando es único. El visor indica cualquier referencia que siga sin textura.

La lectura de efectos y la simulación de sus comandos tienen pruebas sintéticas. El ejemplo no contiene efectos, por lo que la fidelidad de partículas complejas con archivos reales aún necesita validación. Consulta [las notas del formato y del port](docs/architecture.md).
