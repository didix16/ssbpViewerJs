import { readSsbp } from '@ssbp/core';
import type { SsbpFile, CellMap } from '@ssbp/core';
import type { TextureAsset } from '../renderer/webgl';

export interface SourceFile {
  path: string;
  blob: Blob;
}
export interface LoadedProject {
  file: SsbpFile;
  filename: string;
  textures: TextureAsset[];
  missing: CellMap[];
  sources: SourceFile[];
  release(): void;
}
export const basename = (path: string) => path.replaceAll('\\', '/').split('/').pop() || path;
function normalize(path: string): string {
  const parts: string[] = [];
  for (const part of path.replaceAll('\\', '/').split('/')) {
    if (!part || part === '.') continue;
    if (part === '..' && parts.length && parts.at(-1) !== '..') parts.pop();
    else parts.push(part);
  }
  return parts.join('/').toLowerCase();
}
async function textureAsset(map: CellMap, source: SourceFile): Promise<TextureAsset> {
  const bytes = new Uint8Array(await source.blob.slice(0, 12).arrayBuffer());
  // Some game textures have a .png name but contain WebP data.
  const mime =
    bytes[0] === 82 && bytes[8] === 87 && bytes[9] === 69
      ? 'image/webp'
      : bytes[0] === 137 && bytes[1] === 80
        ? 'image/png'
        : source.blob.type;
  const blob = new Blob([source.blob], { type: mime }),
    url = URL.createObjectURL(blob),
    image = new Image();
  try {
    image.src = url;
    await image.decode();
    return {
      map,
      image,
      url,
      width: image.naturalWidth,
      height: image.naturalHeight,
      filename: basename(source.path),
    };
  } catch {
    URL.revokeObjectURL(url);
    throw new Error(`No se puede decodificar la textura ${source.path}`);
  }
}
export async function loadProject(
  sources: SourceFile[],
  selectedPath?: string,
): Promise<LoadedProject> {
  const ssbps = sources.filter((f) => /\.ssbp$/i.test(f.path));
  const source = ssbps.find((f) => f.path === selectedPath) ?? ssbps[0];
  if (!source) throw new Error('Incluye un archivo .ssbp junto con sus texturas PNG o WebP.');
  const file = readSsbp(await source.blob.arrayBuffer()),
    directory = source.path.replaceAll('\\', '/').split('/').slice(0, -1).join('/');
  const textures: TextureAsset[] = [],
    missing: CellMap[] = [];
  try {
    for (const map of file.project.cellMaps) {
      const paths = [
        normalize(`${directory}/${file.project.imageBaseDir}/${map.imagePath}`),
        normalize(`${directory}/${map.imagePath}`),
        normalize(map.imagePath),
      ];
      let imageSource = sources.find((f) => paths.includes(normalize(f.path)));
      if (!imageSource) {
        const matches = sources.filter(
          (f) => basename(f.path).toLowerCase() === basename(map.imagePath).toLowerCase(),
        );
        if (matches.length === 1) imageSource = matches[0];
      }
      if (imageSource) textures.push(await textureAsset(map, imageSource));
      else missing.push(map);
    }
  } catch (error) {
    for (const t of textures) URL.revokeObjectURL(t.url);
    throw error;
  }
  return {
    file,
    filename: basename(source.path),
    textures,
    missing,
    sources,
    release() {
      for (const t of textures) URL.revokeObjectURL(t.url);
    },
  };
}
export async function loadDemo(): Promise<LoadedProject> {
  const paths = [
    'ch00_04_Veronica_F_Normal.ssbp',
    'tex/Body_AllTex.png',
    'tex/Option_Tex.png',
    'Wep/wep_mg.png',
    'Wep/eff_WepSwing.png',
  ];
  const sources = await Promise.all(
    paths.map(async (path) => {
      const response = await fetch(`${import.meta.env.BASE_URL}demo/${path}`);
      if (!response.ok) throw new Error('No se ha podido cargar el ejemplo de Veronica.');
      return { path, blob: await response.blob() };
    }),
  );
  return loadProject(sources);
}
interface FileEntry {
  isFile: boolean;
  isDirectory: boolean;
  fullPath: string;
  file?(success: (file: File) => void, error: (error: DOMException) => void): void;
  createReader?(): {
    readEntries(
      success: (entries: FileEntry[]) => void,
      error: (error: DOMException) => void,
    ): void;
  };
}
export async function droppedFiles(transfer: DataTransfer): Promise<SourceFile[]> {
  const visit = async (entry: FileEntry): Promise<SourceFile[]> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) => entry.file!(resolve, reject));
      return [{ path: entry.fullPath.replace(/^\//, ''), blob: file }];
    }
    if (!entry.isDirectory) return [];
    const reader = entry.createReader!(),
      all: FileEntry[] = [];
    while (true) {
      const entries = await new Promise<FileEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (!entries.length) break;
      all.push(...entries);
    }
    return (await Promise.all(all.map(visit))).flat();
  };
  const entries = [...transfer.items]
    .map((item) => item.webkitGetAsEntry?.() as FileEntry | null)
    .filter((e): e is FileEntry => !!e);
  return entries.length
    ? (await Promise.all(entries.map(visit))).flat()
    : [...transfer.files].map((f) => ({ path: f.webkitRelativePath || f.name, blob: f }));
}
