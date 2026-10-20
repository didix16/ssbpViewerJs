# @ssbp/core

Biblioteca ESM TypeScript para leer SpriteStudio SSBP v3 y evaluar sus animaciones. Funciona en Node.js y navegadores sin dependencias de ejecución ni acceso al sistema de archivos.

```ts
import { readSsbp, evaluateFrame, SsbpPlayer } from '@ssbp/core';

const response = await fetch('/personaje.ssbp');
const file = readSsbp(await response.arrayBuffer());

console.log(file.project.cells);
console.log(file.project.cellMaps);
console.log(file.project.packs);

const decoded = file.decodeFrame('body_anim', 'Idle', 0);
const scene = evaluateFrame(file, 'body_anim', 'Idle', 0);
// scene.commands: sprites en orden de dibujo, incluyendo instancias y partículas.
// scene.parts: estados y matrices de las partes de la animación principal.
// scene.userData: eventos del fotograma seleccionado.

const player = new SsbpPlayer(file, 'body_anim', 'Idle');
player.playing = true;
player.loop = true;
player.update(1 / 60); // El entorno proporciona los segundos transcurridos.
const nextScene = player.evaluate();
```

En Node.js se puede pasar directamente el `Buffer` devuelto por `readFile`. También se aceptan `Uint8Array` que representen una región de otro buffer: todos los offsets son relativos a la región suministrada.

## API

- `readSsbp(buffer)` / `new SsbpFile(buffer)`: valida y lee el archivo.
- `file.project`: celdas, atlas, packs, partes, animaciones, etiquetas y efectos.
- `file.getAnimation(pack, animation)`: busca una animación o lanza `SsbpError`.
- `file.decodeFrame(pack, animation, frame)`: estados locales en orden de dibujo y datos de usuario. Los fotogramas se indexan desde cero.
- `evaluateFrame(file, pack, animation, frame, options?)`: aplica matrices y pivotes y evalúa instancias y efectos.
- `textureCoordinates(command, width, height)`: convierte las coordenadas del atlas a UV normalizadas y aplica las operaciones UV del formato.
- `SsbpPlayer`: `select`, `seek`, `update`, `evaluate`, `playing`, `loop` y `speed`.
- `SsbpError`: error de formato con offset cuando se conoce.

`EvaluateOptions.hiddenParts` admite un conjunto de rutas como `body_anim/3` para ocultar partes y sus descendientes. Las instancias utilizan rutas anidadas, por ejemplo `body_anim/48/1`. `time` proporciona el tiempo absoluto en segundos para las instancias independientes y los efectos; por defecto se usa `frame / fps`. `seed` controla los efectos que no fijan su propia semilla.

Las posiciones se devuelven en píxeles, con Y positivo hacia arriba y rotaciones en grados. Las matrices son de 4 × 4 en orden de columnas, como OpenGL. Los vértices de cada comando siguen el orden **superior izquierdo, superior derecho, inferior izquierdo, inferior derecho**; sus UV están inicialmente en píxeles del atlas. Los colores y la opacidad de los comandos están normalizados a 0–1. Cada comando conserva por separado el modo de mezcla entre sprites y el modo de mezcla de color.

La biblioteca no carga imágenes: el consumidor resuelve `cellMap.imagePath` y proporciona al renderizador las dimensiones de cada atlas. Los objetos expuestos deben tratarse como datos de lectura; los fotogramas decodificados tienen una caché acotada.

## Compatibilidad

El lector comprueba firma, versión, rangos, offsets, índices y ciclos de jerarquía. Los tamaños de estructura incluyen el alineamiento de cuatro bytes del C++ original. No se presupone que las partes estén almacenadas en orden de dibujo.

Solo se admite la versión 3. Los efectos incluyen los comandos 0–16 del runtime de referencia y simulación de medio fotograma con MT19937. La fidelidad frente a proyectos reales con efectos complejos todavía requiere contraste; las pruebas incluidas utilizan datos sintéticos. Se limitan la profundidad de instancias a 16, las cadenas de emisores a 8 y la simulación de efectos a 18000 fotogramas; superar un límite produce `SsbpError`.
