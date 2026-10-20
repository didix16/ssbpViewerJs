# Arquitectura y port del visor C++

## Flujo de datos

```text
ArrayBuffer / Uint8Array
          │
          ▼
@ssbp/core: lector SSBP v3
          │  Project / AnimePack / Animation / CellMap
          ▼
decodeFrame → evaluateFrame / SsbpPlayer
          │  DrawCommand[]: geometría, atlas, UV, colores, opacidad
          ▼
@ssbp/viewer: WebGLRenderer
          │  HTMLImageElement → textura WebGL
          ▼
WebGL 2 + GLSL ES 3.00 → pantalla / PNG con alfa
```

El renderizador y React pertenecen exclusivamente al paquete del visor. La biblioteca no importa tipos del DOM ni utiliza APIs de navegador. Las imágenes del ejemplo se copian a `packages/viewer/public/demo` sin modificar los originales.

## Correspondencias con el código original

| C++                                    | TypeScript                                                 |
| -------------------------------------- | ---------------------------------------------------------- |
| `SS5PlayerData.h`                      | `packages/ssbp/src/model.ts`, `reader.ts`                  |
| `ToPointer`, `DataArrayReader`         | `packages/ssbp/src/binary.ts`                              |
| `Player::setFrame`, matrices y pivotes | `packages/ssbp/src/evaluate.ts`, `math.ts`                 |
| Temporización de `Player`              | `packages/ssbp/src/player.ts`                              |
| Caché de efectos y comandos            | `reader.ts`, `effects.ts`                                  |
| `Texture`, `SSTextureLoad`             | `packages/viewer/src/assets/files.ts`, `renderer/webgl.ts` |
| `SSDrawSprite`, shaders OpenGL         | `packages/viewer/src/renderer/webgl.ts`                    |
| Captura mediante `glReadPixels`        | `renderer/webgl.ts`, `renderer/png.ts`                     |

## Detalles importantes del formato

- Firma `0x42505353`, versión 3 y lectura little-endian.
- Los offsets de 32 bits apuntan al inicio del archivo, no al campo que los contiene.
- Las estructuras C++ tienen padding: `ProjectData` ocupa 36 bytes, `Cell` 28, `PartData` 28, `AnimationData` 32 y `AnimationInitialData` 80.
- Un fotograma comienza con una tabla de partes en orden de dibujo. Cada parte contiene índice, flags y valores opcionales, con sus valores iniciales como respaldo.
- Las posiciones se almacenan como enteros con una escala de diez unidades por píxel. Las deformaciones de vértices tienen su propia escala y no se dividen por `DOT`.
- Las matrices sin desplazamiento de pivote se heredan por los hijos. El desplazamiento del pivote se aplica solo a la geometría del sprite.
- Los parámetros de instancia se leen después de deformaciones y colores. Se conservan los flags de bucle infinito, inverso, ping-pong e independiente.
- Las animaciones independientes se evalúan con tiempo explícito y semilla determinista, lo que permite avanzar y retroceder sin depender de las evaluaciones anteriores. Su fase puede diferir de una captura del C++ cuya instancia llevaba otro tiempo reproduciéndose.
- Las rutas de imagen pueden usar separadores Windows, subcarpetas y referencias a directorios superiores. El cargador busca primero por ruta y después por nombre solo si es inequívoco.

## Renderizado

El visor solicita `webgl2` con alfa premultiplicado. Las texturas se cargan sin premultiplicar y sin invertir Y; los UV del formato usan origen superior izquierdo. El shader devuelve color premultiplicado y el mezclado conserva correctamente el alfa del framebuffer. Los modos mezcla, multiplicar, sumar y restar se configuran independientemente de las mezclas de color por vértice.

Cada sprite utiliza los mismos dos triángulos que el quad C++. El wireframe usa `LINE_LOOP`, porque WebGL no expone `glPolygonMode`. Las preferencias de repetición y filtrado proceden de los atlas SSBP. Se restauran shaders, buffers y texturas si el navegador recupera un contexto perdido.

La exportación vuelve a dibujar el fotograma, lee el framebuffer, invierte las filas y convierte el alfa premultiplicado a RGBA recto. El codificador PNG utiliza `CompressionStream` y CRC32, sin un contexto Canvas 2D. La cuadrícula, los ejes y los paneles son elementos de interfaz y no se exportan.

Para GIF se crea un segundo contexto WebGL con el encuadre actual y se evalúan todos los fotogramas sin mover el reproductor principal. Un worker empaquetado localmente con `gifenc` invierte las filas, convierte el alfa, reduce la paleta a 255 colores opacos y reserva el índice cero para transparencia. Cada fotograma se elimina antes de dibujar el siguiente (`dispose = 2`) para evitar rastros. Los retardos se calculan acumulando el redondeo a centésimas; a 30 FPS se alternan 30 y 40 ms. Se conserva la velocidad y el sentido de reproducción; el ajuste de bucle controla la extensión de repetición del GIF. La cancelación termina el worker y libera el contexto auxiliar.

## GitHub Pages

El workflow `.github/workflows/pages.yml` instala con `npm ci`, ejecuta las pruebas y compila ambos paquetes. Solo publica el contenido estático de `packages/viewer/dist`, mediante el artefacto y la acción oficial de Pages. El trabajo de despliegue tiene permisos `pages: write` e `id-token: write`; el trabajo de compilación solo puede leer el repositorio. El despliegue se restringe a la rama predeterminada y se puede iniciar manualmente.

El `base` relativo de Vite se aplica al HTML, los assets, las imágenes de ejemplo y la URL del worker. `scripts/pages-smoke.mjs` sirve el resultado compilado bajo `/ssbpViewerJs/` y prueba la descarga y el contenido de GIF reales; así se verifican los recursos con la misma estructura de rutas que Pages.

## Verificación y límites

Las pruebas unitarias recorren todos los fotogramas del ejemplo, validan buffers con offset, archivos truncados, índices y ciclos, controles de tiempo, instancias, ocultación de subárboles y UV. Las pruebas sintéticas de efectos verifican su lectura binaria y evolución determinista. Las pruebas de Chromium comprueban el renderizado, un PNG con alfa, controles, atlas y carga de archivos, ausencia de solicitudes externas y ausencia de desbordamiento horizontal en móvil.

`test:browser` también guarda `cpp-camera.png`, renderizado con la cámara inicial de 512 × 512 del código C++, para contrastarlo con la captura de referencia. Las posiciones de cámara de una captura manual y la fase de las instancias independientes pueden variar.

El ejemplo no permite contrastar partículas con una animación real. El simulador de efectos es una implementación determinista de los comportamientos disponibles; la equivalencia exacta del calendario de emisión, de la semilla y de emisores anidados con todos los proyectos C++ queda pendiente de fixtures reales. Las partes de texto reservadas no se dibujan. Las versiones de SSBP distintas de la 3 se rechazan explícitamente.
