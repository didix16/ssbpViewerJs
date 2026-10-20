import { useCallback, useEffect, useRef, useState } from 'react';
import { SsbpPlayer } from '@ssbp/core';
import type { AnimePack, EvaluatedFrame, Part } from '@ssbp/core';
import { WebGLRenderer } from './renderer/webgl';
import type { TextureAsset } from './renderer/webgl';
import { basename, droppedFiles, loadDemo, loadProject } from './assets/files';
import type { LoadedProject, SourceFile } from './assets/files';
import { Icon } from './components/Icon';
import { exportAnimationGif } from './renderer/gif';

type Selection = { pack: string; animation: string };
const speeds = [-1, 0.25, 0.5, 0.75, 1, 1.5, 2];
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error));
const typeName = ['Nulo', 'Sprite', 'Texto', 'Instancia', 'Efecto'];
function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 10000);
}

export function App() {
  const canvas = useRef<HTMLCanvasElement>(null),
    stage = useRef<HTMLDivElement>(null);
  const folderInput = useRef<HTMLInputElement>(null),
    filesInput = useRef<HTMLInputElement>(null);
  const renderer = useRef<WebGLRenderer | null>(null),
    project = useRef<LoadedProject | null>(null),
    player = useRef<SsbpPlayer | null>(null);
  const currentFrame = useRef<EvaluatedFrame | null>(null),
    hidden = useRef(new Set<string>()),
    loadVersion = useRef(0);
  const gifAbort = useRef<AbortController | null>(null);
  const [gifProgress, setGifProgress] = useState<{ current: number; total: number } | null>(null);
  const gifActive = gifProgress !== null;
  const [loaded, setLoaded] = useState<LoadedProject | null>(null),
    [selection, setSelection] = useState<Selection | null>(null);
  const [frame, setFrame] = useState(0),
    [playing, setPlaying] = useState(true),
    [loop, setLoop] = useState(true),
    [speed, setSpeed] = useState(1);
  const [loading, setLoading] = useState(true),
    [error, setError] = useState(''),
    [search, setSearch] = useState('');
  const [tab, setTab] = useState<'Inspector' | 'Texturas' | 'Datos'>('Inspector'),
    [zoom, setZoom] = useState(100);
  const [grid, setGrid] = useState(true),
    [origin, setOrigin] = useState(true),
    [wireframe, setWireframe] = useState(false),
    [flipped, setFlipped] = useState(false);
  const [cameraVersion, setCameraVersion] = useState(0),
    [hiddenVersion, setHiddenVersion] = useState(0),
    [closedPacks, setClosedPacks] = useState(new Set<string>());
  const [collapsed, setCollapsed] = useState(new Set<number>()),
    [selectedPart, setSelectedPart] = useState<number | null>(null);
  const [texture, setTexture] = useState<TextureAsset | null>(null),
    [showCells, setShowCells] = useState(false),
    [showHelp, setShowHelp] = useState(false);
  const [fileMenu, setFileMenu] = useState(false),
    [exporting, setExporting] = useState(false),
    [dragging, setDragging] = useState(false);
  const [chooseProject, setChooseProject] = useState<{
    sources: SourceFile[];
    paths: string[];
  } | null>(null);

  const draw = useCallback(() => {
    const p = player.current,
      r = renderer.current;
    if (!p || !r) return null;
    try {
      const result = p.evaluate({ hiddenParts: hidden.current });
      currentFrame.current = result;
      r.render(result.commands);
      return result;
    } catch (e) {
      p.playing = false;
      setPlaying(false);
      setError(errorMessage(e));
      return null;
    }
  }, []);
  const fit = useCallback(() => {
    const result = draw();
    if (result && renderer.current) {
      renderer.current.fit(result.commands);
      renderer.current.render(result.commands);
      setZoom(100);
      setCameraVersion((v) => v + 1);
    }
  }, [draw]);
  const select = useCallback(
    (packName: string, animationName: string) => {
      const p = player.current;
      if (!p) return;
      p.select(packName, animationName);
      p.playing = true;
      hidden.current.clear();
      setSelection({ pack: packName, animation: animationName });
      setFrame(0);
      setPlaying(true);
      setSelectedPart(null);
      setHiddenVersion((v) => v + 1);
      const pack = p.file.getAnimation(packName, animationName).pack;
      setCollapsed(
        new Set(
          pack.parts
            .filter((part) => part.index !== 0 && part.index !== 1)
            .map((part) => part.index),
        ),
      );
      fit();
    },
    [fit],
  );
  const install = useCallback(
    (next: LoadedProject) => {
      const previous = project.current,
        firstPack = next.file.project.packs.find((p) => p.animations.length);
      if (!firstPack) {
        next.release();
        throw new Error('Este SSBP no contiene animaciones.');
      }
      project.current = next;
      renderer.current?.setTextures(next.textures);
      player.current = new SsbpPlayer(next.file, firstPack.name, firstPack.animations[0].name);
      player.current.loop = loop;
      player.current.speed = speed;
      setLoaded(next);
      setSearch('');
      setError('');
      setTexture(null);
      setClosedPacks(new Set());
      const initial =
        firstPack.animations.find((a) => a.name === 'Attack2_Loop') ?? firstPack.animations[0];
      select(firstPack.name, initial.name);
      previous?.release();
    },
    [loop, speed, select],
  );
  const installRef = useRef(install);
  installRef.current = install;

  useEffect(() => {
    let disposed = false,
      raf = 0,
      previous = 0;
    try {
      const r = new WebGLRenderer(canvas.current!);
      renderer.current = r;
      r.onError = setError;
      r.onResize = () => {
        if (currentFrame.current) {
          r.fit(currentFrame.current.commands, false);
          r.render(currentFrame.current.commands);
        }
        setCameraVersion((v) => v + 1);
      };
    } catch (e) {
      setError(errorMessage(e));
      setLoading(false);
      return;
    }
    const version = ++loadVersion.current;
    loadDemo()
      .then((next) => {
        if (disposed || loadVersion.current !== version) next.release();
        else installRef.current(next);
      })
      .catch((e) => {
        if (!disposed) setError(errorMessage(e));
      })
      .finally(() => {
        if (!disposed && version === loadVersion.current) setLoading(false);
      });
    const tick = (now: number) => {
      const delta = previous ? Math.min((now - previous) / 1000, 0.1) : 0;
      previous = now;
      const p = player.current;
      if (p?.playing) {
        if (p.update(delta)) {
          draw();
          setFrame(p.frame);
        }
        if (!p.playing) setPlaying(false);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      disposed = true;
      gifAbort.current?.abort();
      loadVersion.current++;
      cancelAnimationFrame(raf);
      renderer.current?.dispose();
      renderer.current = null;
      project.current?.release();
    };
  }, [draw]);

  useEffect(() => {
    if (!texture && !showHelp && !chooseProject && !gifActive) return;
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]'),
      previousFocus = document.activeElement as HTMLElement | null;
    const background = [
      ...document.querySelectorAll<HTMLElement>('.app-header,.workspace,.status-bar'),
    ];
    background.forEach((element) => {
      element.inert = true;
    });
    const focusable = () => [
      ...(dialog?.querySelectorAll<HTMLElement>(
        'button:not(:disabled),input,select,[tabindex="0"]',
      ) ?? []),
    ];
    focusable()[0]?.focus();
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return;
      const items = focusable(),
        first = items[0],
        last = items.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', trap);
    return () => {
      background.forEach((element) => {
        element.inert = false;
      });
      window.removeEventListener('keydown', trap);
      previousFocus?.focus();
    };
  }, [texture, showHelp, chooseProject, gifActive]);

  const openSources = useCallback(async (sources: SourceFile[], selectedPath?: string) => {
    if (gifAbort.current) return;
    const ssbps = sources.filter((f) => /\.ssbp$/i.test(f.path));
    if (ssbps.length > 1 && !selectedPath) {
      setChooseProject({ sources, paths: ssbps.map((f) => f.path) });
      return;
    }
    if (!ssbps.length && project.current) {
      const incoming = new Set(sources.map((f) => f.path));
      sources = [...project.current.sources.filter((f) => !incoming.has(f.path)), ...sources];
      selectedPath = sources.find((f) => basename(f.path) === project.current!.filename)?.path;
    }
    const version = ++loadVersion.current;
    setLoading(true);
    setFileMenu(false);
    setChooseProject(null);
    try {
      const next = await loadProject(sources, selectedPath);
      if (version !== loadVersion.current) next.release();
      else installRef.current(next);
    } catch (e) {
      if (version === loadVersion.current) setError(errorMessage(e));
    } finally {
      if (version === loadVersion.current) setLoading(false);
    }
  }, []);
  const openFiles = (files: FileList | null) => {
    if (files?.length)
      void openSources(
        [...files].map((blob) => ({ path: blob.webkitRelativePath || blob.name, blob })),
      );
  };
  const togglePlayback = useCallback(() => {
    const p = player.current;
    if (!p) return;
    if (
      !p.playing &&
      !p.loop &&
      ((p.speed > 0 && p.frame === p.animation.frameCount - 1) || (p.speed < 0 && p.frame === 0))
    )
      p.seek(p.speed < 0 ? p.animation.frameCount - 1 : 0);
    p.playing = !p.playing;
    setPlaying(p.playing);
    setFrame(p.frame);
    draw();
  }, [draw]);
  const seek = useCallback(
    (next: number) => {
      const p = player.current;
      if (!p) return;
      p.playing = false;
      p.seek(next);
      setPlaying(false);
      setFrame(p.frame);
      draw();
    },
    [draw],
  );
  const changeZoom = useCallback(
    (value: number) => {
      const r = renderer.current;
      if (!r) return;
      const next = Math.max(10, Math.min(800, value));
      r.camera.zoom = next / 100;
      setZoom(Math.round(next));
      draw();
      setCameraVersion((v) => v + 1);
    },
    [draw],
  );
  const flip = useCallback(() => {
    const r = renderer.current;
    if (!r) return;
    r.camera.flipX = !r.camera.flipX;
    setFlipped(r.camera.flipX);
    draw();
    setCameraVersion((v) => v + 1);
  }, [draw]);
  const toggleWireframe = useCallback(() => {
    const r = renderer.current;
    if (!r) return;
    r.wireframe = !r.wireframe;
    setWireframe(r.wireframe);
    draw();
  }, [draw]);
  const exportPng = useCallback(async () => {
    if (!renderer.current || !player.current || gifAbort.current) return;
    setExporting(true);
    try {
      const p = player.current;
      const filename = `${p.packName}_${p.animationName}_${String(p.frame).padStart(3, '0')}.png`;
      const blob = await renderer.current.exportPng();
      saveBlob(blob, filename);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setExporting(false);
    }
  }, []);
  const exportGif = useCallback(async () => {
    const r = renderer.current,
      p = player.current,
      loaded = project.current;
    if (!r || !p || !loaded || gifAbort.current) return;
    const controller = new AbortController(),
      wasPlaying = p.playing;
    gifAbort.current = controller;
    p.playing = false;
    setPlaying(false);
    setFileMenu(false);
    setGifProgress({ current: 0, total: p.animation.frameCount });
    const filename = `${p.packName}_${p.animationName}.gif`;
    try {
      const blob = await exportAnimationGif({
        renderer: r,
        player: p,
        textures: loaded.textures,
        hiddenParts: hidden.current,
        signal: controller.signal,
        onProgress: (current, total) => setGifProgress({ current, total }),
      });
      controller.signal.throwIfAborted();
      saveBlob(blob, filename);
    } catch (error) {
      if (!controller.signal.aborted) setError(errorMessage(error));
    } finally {
      gifAbort.current = null;
      setGifProgress(null);
      if (player.current === p) {
        p.playing = wasPlaying;
        setPlaying(wasPlaying);
        draw();
      }
    }
  }, [draw]);
  const cycleAnimation = useCallback(
    (delta: number) => {
      const p = player.current;
      if (!p) return;
      const all = p.file.project.packs.flatMap((pack) =>
          pack.animations.map((a) => ({ pack: pack.name, animation: a.name })),
        ),
        index = all.findIndex((a) => a.pack === p.packName && a.animation === p.animationName);
      const next = all[(index + delta + all.length) % all.length];
      select(next.pack, next.animation);
    },
    [select],
  );

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        gifAbort.current?.abort();
        setTexture(null);
        setShowHelp(false);
        setFileMenu(false);
        setChooseProject(null);
        return;
      }
      if (
        event.target instanceof HTMLElement &&
        (['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(event.target.tagName) ||
          event.target.isContentEditable)
      )
        return;
      if (
        gifAbort.current ||
        texture ||
        showHelp ||
        chooseProject ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey
      )
        return;
      const p = player.current;
      if (event.key === '/') {
        event.preventDefault();
        document.querySelector<HTMLInputElement>('input[aria-label="Buscar animación"]')?.focus();
      } else if (event.code === 'Space') {
        event.preventDefault();
        togglePlayback();
      } else if (event.key === ',' || event.key === 'ArrowDown') {
        event.preventDefault();
        seek(event.shiftKey ? 0 : (p?.frame ?? 0) - 1);
      } else if (event.key === '.' || event.key === 'ArrowUp') {
        event.preventDefault();
        seek(event.shiftKey ? (p?.animation.frameCount ?? 1) - 1 : (p?.frame ?? 0) + 1);
      } else if (event.key === 'ArrowLeft' || event.key.toLowerCase() === 'a') cycleAnimation(-1);
      else if (event.key === 'ArrowRight' || event.key.toLowerCase() === 's') cycleAnimation(1);
      else if (event.key.toLowerCase() === 'c') fit();
      else if (event.key.toLowerCase() === 'x') flip();
      else if (event.key.toLowerCase() === 'w') toggleWireframe();
      else if (event.key.toLowerCase() === 'q') void exportPng();
      else if (event.key.toLowerCase() === 'h' || event.key === '?') setShowHelp(true);
      else if (event.key.toLowerCase() === 'l' && p) {
        p.loop = !p.loop;
        setLoop(p.loop);
      } else if (['1', '2', '3'].includes(event.key) && p) {
        p.speed =
          event.key === '3'
            ? 1
            : Math.max(
                -2,
                Math.min(2, Math.round((p.speed + (event.key === '1' ? -0.1 : 0.1)) * 10) / 10),
              );
        setSpeed(p.speed);
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [
    togglePlayback,
    seek,
    cycleAnimation,
    fit,
    flip,
    toggleWireframe,
    exportPng,
    texture,
    showHelp,
    chooseProject,
  ]);

  useEffect(() => {
    const element = stage.current;
    if (!element) return;
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      const r = renderer.current;
      if (!r) return;
      const rect = element.getBoundingClientRect(),
        x = event.clientX - rect.left - rect.width / 2,
        y = -(event.clientY - rect.top - rect.height / 2),
        before = r.scale;
      const next = Math.max(0.1, Math.min(8, r.camera.zoom * Math.exp(-event.deltaY * 0.0015))),
        after = r.fitScale * next;
      r.camera.x += x * (1 / before - 1 / after) * (r.camera.flipX ? -1 : 1);
      r.camera.y += y * (1 / before - 1 / after);
      r.camera.zoom = next;
      setZoom(Math.round(next * 100));
      draw();
      setCameraVersion((v) => v + 1);
    };
    element.addEventListener('wheel', wheel, { passive: false });
    return () => element.removeEventListener('wheel', wheel);
  }, [draw]);

  const drag = useRef<{ x: number; y: number; cx: number; cy: number } | null>(null);
  const pointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button > 1 || !renderer.current) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    const c = renderer.current.camera;
    drag.current = { x: event.clientX, y: event.clientY, cx: c.x, cy: c.y };
  };
  const pointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = drag.current,
      r = renderer.current;
    if (!d || !r) return;
    r.camera.x = d.cx - ((event.clientX - d.x) / r.scale) * (r.camera.flipX ? -1 : 1);
    r.camera.y = d.cy + (event.clientY - d.y) / r.scale;
    draw();
    setCameraVersion((v) => v + 1);
  };
  const toggleHidden = (part: Part) => {
    if (!selection) return;
    const path = `${selection.pack}/${part.index}`;
    if (hidden.current.has(path)) hidden.current.delete(path);
    else hidden.current.add(path);
    setHiddenVersion((v) => v + 1);
    draw();
  };
  const selected =
    loaded && selection ? loaded.file.getAnimation(selection.pack, selection.animation) : null;
  const animation = selected?.animation,
    pack = selected?.pack;
  const partDetail =
    selectedPart !== null
      ? currentFrame.current?.parts.find((p) => p.part.index === selectedPart)
      : undefined;
  const frameMax = Math.max(0, (animation?.frameCount ?? 1) - 1);
  const ticks = Array.from(
    new Set(
      Array.from({ length: Math.min(9, frameMax + 1) }, (_, i) =>
        Math.round((i * frameMax) / Math.max(1, Math.min(9, frameMax + 1) - 1)),
      ),
    ),
  );
  const availableMaps = new Set(loaded?.textures.map((t) => t.map));
  const missingInFrame = new Set(
    currentFrame.current?.commands
      .filter((c) => !availableMaps.has(c.cellMap))
      .map((c) => c.cellMap.imagePath),
  );
  const camera = renderer.current?.camera,
    originX = camera
      ? (canvas.current?.clientWidth ?? 0) / 2 -
        camera.x * renderer.current!.scale * (camera.flipX ? -1 : 1)
      : 0;
  const originY = camera
    ? (canvas.current?.clientHeight ?? 0) / 2 + camera.y * renderer.current!.scale
    : 0;
  void cameraVersion;
  void hiddenVersion;

  const renderTree = (p: AnimePack, parent = -1, depth = 0): React.ReactNode =>
    p.parts
      .filter((part) => part.parentIndex === parent)
      .map((part) => {
        const children = p.parts.some((c) => c.parentIndex === part.index),
          isHidden = hidden.current.has(`${p.name}/${part.index}`),
          closed = collapsed.has(part.index);
        return (
          <div key={part.index}>
            <div
              className={`layer-row ${isHidden ? 'is-hidden' : ''} ${selectedPart === part.index ? 'selected' : ''}`}
            >
              <button
                className="visibility icon-button"
                aria-label={`${isHidden ? 'Mostrar' : 'Ocultar'} ${part.name}`}
                onClick={() => toggleHidden(part)}
              >
                <Icon name={isHidden ? 'eye-off' : 'eye'} size={17} />
              </button>
              <button
                className={`tree-toggle icon-button ${closed ? 'closed' : ''}`}
                style={{ marginLeft: Math.min(depth, 5) * 11 }}
                disabled={!children}
                aria-label={`${closed ? 'Expandir' : 'Contraer'} ${part.name}`}
                onClick={() =>
                  setCollapsed((old) => {
                    const next = new Set(old);
                    if (next.has(part.index)) next.delete(part.index);
                    else next.add(part.index);
                    return next;
                  })
                }
              >
                {children && <Icon name="chevron" size={14} />}
              </button>
              <button
                className="layer-label"
                title={part.name}
                onClick={() => setSelectedPart(selectedPart === part.index ? null : part.index)}
              >
                <Icon name={children ? 'folder' : part.type === 3 ? 'layers' : 'image'} size={15} />
                <span>{part.name}</span>
              </button>
            </div>
            {!closed && children && renderTree(p, part.index, depth + 1)}
          </div>
        );
      });
  const textureCard = (asset: TextureAsset, compact = false) => (
    <button
      key={asset.map.imagePath}
      className={`texture-card ${compact ? 'compact' : ''}`}
      onClick={() => {
        setTexture(asset);
        setShowCells(false);
      }}
      aria-label={`Inspeccionar ${asset.filename}`}
      title={`Inspeccionar ${asset.filename}`}
    >
      <div className="texture-heading">
        <strong>{asset.filename}</strong>
        <span>
          {asset.width} × {asset.height}
        </span>
      </div>
      <div className="atlas checker">
        <img src={asset.url} alt={`Atlas ${asset.filename}`} />
      </div>
    </button>
  );

  return (
    <div
      className="app"
      onDragOver={(event) => {
        if (event.dataTransfer.types.includes('Files')) {
          event.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node)) setDragging(false);
      }}
      onDrop={async (event) => {
        event.preventDefault();
        setDragging(false);
        try {
          const sources = await droppedFiles(event.dataTransfer);
          await openSources(sources);
        } catch (e) {
          setError(errorMessage(e));
        }
      }}
    >
      <input
        type="file"
        ref={(node) => {
          folderInput.current = node;
          node?.setAttribute('webkitdirectory', '');
        }}
        multiple
        hidden
        aria-label="Abrir carpeta SSBP"
        onChange={(event) => {
          openFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <input
        type="file"
        ref={filesInput}
        multiple
        hidden
        accept=".ssbp,.png,.webp,.jpg,.jpeg"
        aria-label="Abrir archivos SSBP y texturas"
        onChange={(event) => {
          openFiles(event.target.files);
          event.target.value = '';
        }}
      />
      <header className="app-header">
        <div className="brand">
          <svg className="brand-mark" viewBox="0 0 40 40" aria-hidden="true">
            <path
              d="m20 1 16 9 3 17-19 12L1 27l3-17Zm0 9-8 10 8 11 8-11Z"
              fill="currentColor"
              fillRule="evenodd"
            />
          </svg>
          <h1>SSBP Viewer</h1>
        </div>
        <span className="header-separator" />
        <div className="filename" title={loaded?.filename}>
          {loaded?.filename ?? 'Abre un proyecto SSBP'}
        </div>
        <div className="header-badges">
          <span className="badge">SSBP v{loaded?.file.project.version ?? 3}</span>
          <span className="badge outlined">WebGL 2</span>
        </div>
        <div className="header-actions">
          <div className="file-actions">
            <div className="split-button">
              <button className="button" onClick={() => folderInput.current?.click()}>
                <Icon name="folder" />
                <span>Abrir carpeta</span>
              </button>
              <button
                className="button split-tail"
                aria-label="Más opciones de apertura"
                aria-expanded={fileMenu}
                onClick={() => setFileMenu(!fileMenu)}
              >
                <Icon name="chevron" size={14} />
              </button>
            </div>
            {fileMenu && (
              <>
                <button
                  className="menu-dismiss"
                  aria-label="Cerrar menú"
                  onClick={() => setFileMenu(false)}
                />
                <div className="dropdown">
                  <button
                    onClick={() => {
                      setFileMenu(false);
                      filesInput.current?.click();
                    }}
                  >
                    <Icon name="file" />
                    Abrir archivos…
                  </button>
                  <button
                    onClick={() => {
                      setFileMenu(false);
                      folderInput.current?.click();
                    }}
                  >
                    <Icon name="folder" />
                    Abrir carpeta…
                  </button>
                  <button
                    onClick={() => {
                      setFileMenu(false);
                      setLoading(true);
                      const version = ++loadVersion.current;
                      void loadDemo()
                        .then((next) => {
                          if (version === loadVersion.current) installRef.current(next);
                          else next.release();
                        })
                        .catch((e) => setError(errorMessage(e)))
                        .finally(() => {
                          if (version === loadVersion.current) setLoading(false);
                        });
                    }}
                  >
                    <Icon name="reset" />
                    Cargar ejemplo de Veronica
                  </button>
                  <div className="menu-note">También puedes arrastrar una carpeta aquí.</div>
                </div>
              </>
            )}
          </div>
          <button
            className="button primary"
            disabled={!loaded || exporting || gifActive}
            onClick={() => void exportPng()}
          >
            <Icon name="export" />
            <span>{exporting ? 'Exportando…' : 'Exportar PNG'}</span>
          </button>
          <button
            className="button gif-button"
            aria-label="Exportar GIF"
            title="Exportar la animación completa en GIF"
            disabled={!loaded || exporting || gifActive}
            onClick={() => void exportGif()}
          >
            <Icon name="image" />
            <span>Exportar GIF</span>
          </button>
        </div>
      </header>

      <main className="workspace">
        <aside className="animation-sidebar" aria-label="Animaciones">
          <div className="sidebar-top">
            <h2>ANIMACIONES</h2>
            <label className="search">
              <Icon name="search" size={19} />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Buscar animación"
                aria-label="Buscar animación"
              />
              <kbd>/</kbd>
            </label>
          </div>
          <div className="animation-list">
            {loaded?.file.project.packs.map((p) => {
              const matches = p.animations.filter((a) =>
                `${p.name}/${a.name}`.toLowerCase().includes(search.toLowerCase()),
              );
              if (!matches.length) return null;
              const closed = closedPacks.has(p.name) && !search;
              return (
                <section className="pack" key={p.name}>
                  <button
                    className="pack-heading"
                    aria-expanded={!closed}
                    onClick={() =>
                      setClosedPacks((old) => {
                        const next = new Set(old);
                        if (next.has(p.name)) next.delete(p.name);
                        else next.add(p.name);
                        return next;
                      })
                    }
                  >
                    <Icon name="chevron" size={18} className={closed ? 'closed-chevron' : ''} />
                    <strong>{p.name}</strong>
                    <span>({p.animations.length})</span>
                  </button>
                  {!closed &&
                    matches.map((a) => (
                      <button
                        key={a.name}
                        className={`animation-item ${selection?.pack === p.name && selection.animation === a.name ? 'active' : ''}`}
                        aria-pressed={selection?.pack === p.name && selection.animation === a.name}
                        onClick={() => select(p.name, a.name)}
                      >
                        <span>{a.name}</span>
                        <small>{a.frameCount} f</small>
                      </button>
                    ))}
                </section>
              );
            })}
            {loaded &&
              !loaded.file.project.packs.some((p) =>
                p.animations.some((a) =>
                  `${p.name}/${a.name}`.toLowerCase().includes(search.toLowerCase()),
                ),
              ) && <p className="empty-search">No hay animaciones que coincidan con «{search}».</p>}
          </div>
          <div className="asset-overview">
            <div className="overview-heading">
              {loaded?.file.project.cells.length ?? 0} celdas <span>·</span>{' '}
              {loaded?.file.project.packs.length ?? 0} packs
            </div>
            {loaded?.textures[0] ? (
              <button
                className="overview-atlas checker"
                aria-label="Ver atlas principal"
                onClick={() => setTexture(loaded.textures[0])}
              >
                <img src={loaded.textures[0].url} alt="Atlas principal del proyecto" />
              </button>
            ) : (
              <div className="overview-placeholder">
                <Icon name="image" size={32} />
              </div>
            )}
          </div>
        </aside>

        <section className="viewer" aria-label="Visor de animación">
          <div className="viewport-toolbar">
            <span className="view-title">Vista</span>
            <button
              className="icon-button framed"
              title="Ajustar a la vista (C)"
              aria-label="Ajustar a la vista"
              onClick={fit}
              disabled={!loaded}
            >
              <Icon name="fit" size={20} />
            </button>
            <label className="zoom-control">
              <span className="sr-only">Zoom</span>
              <select
                value={
                  [25, 50, 75, 100, 125, 150, 200, 300, 400, 800].includes(zoom) ? zoom : 'custom'
                }
                onChange={(event) => changeZoom(Number(event.target.value))}
              >
                {![25, 50, 75, 100, 125, 150, 200, 300, 400, 800].includes(zoom) && (
                  <option value="custom">{zoom}%</option>
                )}
                {[25, 50, 75, 100, 125, 150, 200, 300, 400, 800].map((z) => (
                  <option value={z} key={z}>
                    {z}%
                  </option>
                ))}
              </select>
              <Icon name="chevron" size={14} />
            </label>
            <span className="toolbar-separator" />
            <label className="toolbar-check">
              <input
                type="checkbox"
                checked={grid}
                onChange={(event) => setGrid(event.target.checked)}
              />
              <span>Cuadrícula</span>
            </label>
            <label className="toolbar-check">
              <input
                type="checkbox"
                checked={origin}
                onChange={(event) => setOrigin(event.target.checked)}
              />
              <span>Origen</span>
            </label>
            <div className="toolbar-end">
              <button
                className={`icon-button ${flipped ? 'toggled' : ''}`}
                title="Invertir horizontalmente (X)"
                aria-label="Invertir horizontalmente"
                aria-pressed={flipped}
                onClick={flip}
              >
                <Icon name="flip" />
              </button>
              <button
                className={`icon-button ${wireframe ? 'toggled' : ''}`}
                title="Mostrar geometría (W)"
                aria-label="Mostrar geometría"
                aria-pressed={wireframe}
                onClick={toggleWireframe}
              >
                <Icon name="grid" />
              </button>
            </div>
          </div>
          <div className="stage-inset">
            <div
              className={`stage ${grid ? 'checker' : ''}`}
              ref={stage}
              onPointerDown={pointerDown}
              onPointerMove={pointerMove}
              onPointerUp={() => {
                drag.current = null;
              }}
              onPointerCancel={() => {
                drag.current = null;
              }}
              onDoubleClick={fit}
            >
              {origin && (
                <div className="origin-overlay" aria-hidden="true">
                  <div className="origin-x" style={{ top: originY }} />
                  <div className="origin-y" style={{ left: originX }} />
                  <span className="origin-point" style={{ left: originX, top: originY }} />
                </div>
              )}
              <canvas
                ref={canvas}
                aria-label={`Animación ${selection?.animation ?? 'SSBP'}, fotograma ${frame}`}
              />
              <div className="stage-caption">
                {selection?.animation ?? 'Sin animación'}
                <span>·</span>
                {animation
                  ? `${animation.width} × ${animation.height}`
                  : 'Arrastra un archivo SSBP y sus texturas'}
              </div>
              <div className="stage-hint">
                Arrastrar para mover <span>·</span> Rueda para ampliar
              </div>
              {loading && (
                <div className="loading-overlay">
                  <div className="spinner" />
                  <span>Cargando proyecto…</span>
                </div>
              )}
            </div>
          </div>
          <div className="playback">
            <div className="playback-controls">
              <div className="transport">
                <button
                  className="transport-button"
                  title="Fotograma anterior (,)"
                  aria-label="Fotograma anterior"
                  disabled={!loaded || frame === 0}
                  onClick={() => seek(frame - 1)}
                >
                  <Icon name="previous" size={20} />
                </button>
                <button
                  className="play-button"
                  aria-label={playing ? 'Pausar animación' : 'Reproducir animación'}
                  title="Reproducir / pausar (Espacio)"
                  onClick={togglePlayback}
                  disabled={!loaded}
                >
                  <Icon name={playing ? 'pause' : 'play'} size={22} />
                </button>
                <button
                  className="transport-button"
                  title="Fotograma siguiente (.)"
                  aria-label="Fotograma siguiente"
                  disabled={!loaded || frame === frameMax}
                  onClick={() => seek(frame + 1)}
                >
                  <Icon name="next" size={20} />
                </button>
              </div>
              <span className="toolbar-separator" />
              <label className="loop-toggle">
                <input
                  type="checkbox"
                  checked={loop}
                  onChange={(event) => {
                    setLoop(event.target.checked);
                    if (player.current) player.current.loop = event.target.checked;
                  }}
                />
                <span className="switch-track" />
                <span>Bucle</span>
              </label>
              <label className="speed-control">
                <span className="sr-only">Velocidad de reproducción</span>
                <select
                  value={speeds.includes(speed) ? speed : 'custom'}
                  onChange={(event) => {
                    const value = Number(event.target.value);
                    setSpeed(value);
                    if (player.current) player.current.speed = value;
                  }}
                >
                  {!speeds.includes(speed) && <option value="custom">{speed}×</option>}
                  {speeds.map((s) => (
                    <option key={s} value={s}>
                      {s}×
                    </option>
                  ))}
                </select>
                <Icon name="chevron" size={14} />
              </label>
              <div className="frame-counter">
                <input
                  aria-label="Fotograma actual"
                  type="number"
                  min={0}
                  max={frameMax}
                  value={frame}
                  onChange={(event) => seek(Number(event.target.value))}
                />
                <span>/</span>
                <span>{frameMax}</span>
              </div>
            </div>
            <div className="timeline">
              <div className="timeline-line" />
              <div
                className="timeline-progress"
                style={{ width: `${frameMax ? (frame / frameMax) * 100 : 0}%` }}
              />
              <div className="timeline-ticks">
                {ticks.map((value) => (
                  <button
                    key={value}
                    style={{ left: `${frameMax ? (value / frameMax) * 100 : 0}%` }}
                    aria-label={`Ir al fotograma ${value}`}
                    onClick={() => seek(value)}
                  >
                    <span className={value <= frame ? 'passed' : ''} />
                    <small>{value}</small>
                  </button>
                ))}
              </div>
              <input
                className="timeline-range"
                type="range"
                min={0}
                max={frameMax || 1}
                step={1}
                value={frame}
                disabled={!loaded || !frameMax}
                aria-label="Línea de tiempo"
                onChange={(event) => seek(Number(event.target.value))}
                style={
                  {
                    '--progress': `${frameMax ? (frame / frameMax) * 100 : 0}%`,
                  } as React.CSSProperties
                }
              />
            </div>
          </div>
        </section>

        <aside className="inspector-sidebar" aria-label="Inspector del proyecto">
          <div className="inspector-tabs" role="tablist" aria-label="Panel del proyecto">
            {(['Inspector', 'Texturas', 'Datos'] as const).map((t) => (
              <button
                key={t}
                role="tab"
                aria-selected={tab === t}
                className={tab === t ? 'active' : ''}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="inspector-content" role="tabpanel" aria-label={tab}>
            {tab === 'Inspector' && (
              <>
                <section className="inspector-section">
                  <h2>ANIMACIÓN</h2>
                  <dl className="property-list">
                    <div>
                      <dt>Nombre</dt>
                      <dd>{animation?.name ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Pack</dt>
                      <dd>{pack?.name ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>FPS</dt>
                      <dd>{animation?.fps ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Fotogramas</dt>
                      <dd>{animation?.frameCount ?? '—'}</dd>
                    </div>
                    <div>
                      <dt>Tamaño</dt>
                      <dd>{animation ? `${animation.width} × ${animation.height}` : '—'}</dd>
                    </div>
                  </dl>
                </section>
                <section className="inspector-section layers-section">
                  <div className="section-heading">
                    <h2>CAPAS</h2>
                    <span>{pack?.parts.length ?? 0}</span>
                  </div>
                  <div className="layers-tree">{pack && renderTree(pack)}</div>
                  {partDetail && (
                    <div className="part-detail">
                      <div className="section-heading">
                        <strong>{partDetail.part.name}</strong>
                        <button
                          className="icon-button"
                          aria-label="Cerrar detalle de capa"
                          onClick={() => setSelectedPart(null)}
                        >
                          <Icon name="close" size={14} />
                        </button>
                      </div>
                      <dl>
                        <div>
                          <dt>Tipo</dt>
                          <dd>{typeName[partDetail.part.type] ?? partDetail.part.type}</dd>
                        </div>
                        <div>
                          <dt>Posición</dt>
                          <dd>
                            {partDetail.state.x.toFixed(1)}, {partDetail.state.y.toFixed(1)}
                          </dd>
                        </div>
                        <div>
                          <dt>Rotación Z</dt>
                          <dd>{partDetail.state.rotationZ.toFixed(1)}°</dd>
                        </div>
                        <div>
                          <dt>Opacidad</dt>
                          <dd>{Math.round((partDetail.state.opacity / 255) * 100)}%</dd>
                        </div>
                        <div>
                          <dt>Celda</dt>
                          <dd>
                            {loaded?.file.project.cells[partDetail.state.cellIndex]?.name ?? '—'}
                          </dd>
                        </div>
                      </dl>
                    </div>
                  )}
                </section>
                <section className="inspector-section textures-section">
                  <h2>TEXTURAS</h2>
                  {loaded?.textures.map((asset) => textureCard(asset, true))}
                  {loaded && loaded.missing.length > 0 && (
                    <details className="missing-textures">
                      <summary>{loaded.missing.length} referencias sin textura</summary>
                      <p>Estas imágenes no están en la carpeta cargada:</p>
                      {loaded.missing.map((m) => (
                        <code key={m.imagePath}>{m.imagePath}</code>
                      ))}
                      <button className="text-button" onClick={() => filesInput.current?.click()}>
                        Añadir texturas…
                      </button>
                    </details>
                  )}
                </section>
              </>
            )}
            {tab === 'Texturas' && (
              <section className="inspector-section textures-section">
                <div className="section-heading">
                  <h2>ATLAS DEL PROYECTO</h2>
                  <span>{loaded?.textures.length ?? 0}</span>
                </div>
                <p className="panel-description">
                  Selecciona una textura para ampliar el atlas y explorar sus celdas.
                </p>
                {loaded?.textures.map((asset) => textureCard(asset))}
                {loaded?.missing.map((map) => (
                  <div className="missing-card" key={map.imagePath}>
                    <Icon name="image" />
                    <strong>{basename(map.imagePath)}</strong>
                    <small>{map.imagePath}</small>
                    <button className="text-button" onClick={() => filesInput.current?.click()}>
                      Añadir textura
                    </button>
                  </div>
                ))}
              </section>
            )}
            {tab === 'Datos' && (
              <>
                <section className="inspector-section">
                  <h2>PROYECTO SSBP</h2>
                  <dl className="property-list">
                    <div>
                      <dt>Versión</dt>
                      <dd>{loaded?.file.project.version}</dd>
                    </div>
                    <div>
                      <dt>Tamaño</dt>
                      <dd>{((loaded?.file.project.byteLength ?? 0) / 1024).toFixed(1)} KB</dd>
                    </div>
                    <div>
                      <dt>Celdas</dt>
                      <dd>{loaded?.file.project.cells.length}</dd>
                    </div>
                    <div>
                      <dt>Packs</dt>
                      <dd>{loaded?.file.project.packs.length}</dd>
                    </div>
                    <div>
                      <dt>Animaciones</dt>
                      <dd>
                        {loaded?.file.project.packs.reduce((n, p) => n + p.animations.length, 0)}
                      </dd>
                    </div>
                    <div>
                      <dt>Efectos</dt>
                      <dd>{loaded?.file.project.effects.length}</dd>
                    </div>
                  </dl>
                  <button
                    className="button full-width"
                    disabled={!loaded}
                    onClick={() => {
                      if (loaded)
                        saveBlob(
                          new Blob([JSON.stringify(loaded.file.project, null, 2)], {
                            type: 'application/json',
                          }),
                          loaded.filename.replace(/\.ssbp$/i, '.json'),
                        );
                    }}
                  >
                    <Icon name="download" size={16} />
                    Descargar datos JSON
                  </button>
                </section>
                <section className="inspector-section">
                  <h2>FOTOGRAMA {frame}</h2>
                  <dl className="property-list">
                    <div>
                      <dt>Sprites</dt>
                      <dd>{currentFrame.current?.commands.length ?? 0}</dd>
                    </div>
                    <div>
                      <dt>Datos de usuario</dt>
                      <dd>{currentFrame.current?.userData.length ?? 0}</dd>
                    </div>
                  </dl>
                  <pre className="data-preview">
                    {JSON.stringify(
                      {
                        animation: selection?.animation,
                        frame,
                        userData: currentFrame.current?.userData ?? [],
                        labels: animation?.labels ?? [],
                      },
                      null,
                      2,
                    )}
                  </pre>
                </section>
                <p className="local-note">
                  <Icon name="info" size={16} />
                  Los archivos se procesan en tu navegador.
                </p>
              </>
            )}
          </div>
        </aside>
      </main>

      <footer className="status-bar">
        <div className="status-left">
          <span className={`status-dot ${missingInFrame.size ? 'warning' : ''}`} />
          <span>
            {loading
              ? 'Cargando…'
              : loaded
                ? missingInFrame.size
                  ? missingInFrame.size === 1
                    ? 'Una textura no disponible en este fotograma'
                    : `${missingInFrame.size} texturas no disponibles en este fotograma`
                  : 'Texturas cargadas'
                : 'Sin proyecto'}
          </span>
          <span className="status-divider" />
          <span>Render WebGL 2</span>
        </div>
        <div className="status-right">
          <span>{animation?.fps ?? 30} FPS</span>
          <span className="status-divider" />
          <button onClick={() => setShowHelp(true)} title="Atajos de teclado (H)">
            <Icon name="keyboard" size={16} />
            <span>Atajos</span>
            <kbd>H</kbd>
          </button>
        </div>
      </footer>
      {error && (
        <div className="error-toast" role="alert">
          <Icon name="info" />
          <span>{error}</span>
          <button className="icon-button" aria-label="Cerrar aviso" onClick={() => setError('')}>
            <Icon name="close" />
          </button>
        </div>
      )}
      {dragging && (
        <div className="drop-overlay">
          <div>
            <Icon name="folder" size={50} />
            <h2>Suelta tu proyecto aquí</h2>
            <p>Archivo SSBP y su carpeta de texturas</p>
          </div>
        </div>
      )}
      {texture && (
        <div className="modal-backdrop" onClick={() => setTexture(null)}>
          <section
            className="texture-modal"
            role="dialog"
            aria-modal="true"
            aria-label={`Textura ${texture.filename}`}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <div>
                <h2>{texture.filename}</h2>
                <p>
                  {texture.width} × {texture.height} <span>·</span>{' '}
                  {loaded?.file.project.cells.filter((c) => c.cellMap === texture.map).length}{' '}
                  celdas
                </p>
              </div>
              <label className="toolbar-check">
                <input
                  type="checkbox"
                  checked={showCells}
                  onChange={(event) => setShowCells(event.target.checked)}
                />
                <span>Mostrar celdas</span>
              </label>
              <button
                className="icon-button"
                aria-label="Cerrar textura"
                onClick={() => setTexture(null)}
                autoFocus
              >
                <Icon name="close" size={22} />
              </button>
            </div>
            <div className="texture-modal-content checker">
              <div className="atlas-detail">
                <img src={texture.url} alt={texture.filename} />
                {showCells && (
                  <svg viewBox={`0 0 ${texture.width} ${texture.height}`} className="cell-overlay">
                    {loaded?.file.project.cells
                      .filter((c) => c.cellMap === texture.map)
                      .map((c) => (
                        <rect
                          key={c.index}
                          x={c.x}
                          y={c.y}
                          width={c.width}
                          height={c.height}
                          fill="transparent"
                          stroke="#b39af9"
                          strokeWidth="0.7"
                        >
                          <title>{`${c.name} · ${c.width} × ${c.height}`}</title>
                        </rect>
                      ))}
                  </svg>
                )}
              </div>
            </div>
            <div className="modal-footer">
              <span>{texture.map.imagePath}</span>
              <button
                className="text-button"
                onClick={() => {
                  const source = loaded?.sources.find((s) => basename(s.path) === texture.filename);
                  if (source) saveBlob(source.blob, texture.filename);
                }}
              >
                <Icon name="download" size={15} />
                Descargar original
              </button>
            </div>
          </section>
        </div>
      )}
      {showHelp && (
        <div className="modal-backdrop" onClick={() => setShowHelp(false)}>
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Atajos de teclado"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="modal-heading">
              <h2>Atajos de teclado</h2>
              <button
                className="icon-button"
                aria-label="Cerrar atajos"
                onClick={() => setShowHelp(false)}
                autoFocus
              >
                <Icon name="close" />
              </button>
            </div>
            <dl className="shortcut-list">
              {[
                ['Espacio', 'Reproducir / pausar'],
                ['A / ←', 'Animación anterior'],
                ['S / →', 'Animación siguiente'],
                [', / ↓', 'Fotograma anterior'],
                ['. / ↑', 'Fotograma siguiente'],
                ['Mayús + ↓ / ↑', 'Primer / último fotograma'],
                ['L', 'Activar / desactivar bucle'],
                ['X', 'Invertir horizontalmente'],
                ['C', 'Ajustar a la vista'],
                ['W', 'Mostrar geometría'],
                ['Q', 'Exportar PNG'],
                ['1 / 2 / 3', 'Reducir / aumentar / restablecer velocidad'],
              ].map(([key, action]) => (
                <div key={key}>
                  <dt>{action}</dt>
                  <dd>
                    <kbd>{key}</kbd>
                  </dd>
                </div>
              ))}
            </dl>
            <p>
              Arrastra para mover la vista, usa la rueda para ampliar y haz doble clic para centrar.
            </p>
          </section>
        </div>
      )}
      {chooseProject && (
        <div className="modal-backdrop">
          <section
            className="help-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Seleccionar proyecto"
          >
            <div className="modal-heading">
              <h2>Selecciona un proyecto</h2>
              <button
                className="icon-button"
                aria-label="Cancelar apertura"
                onClick={() => setChooseProject(null)}
                autoFocus
              >
                <Icon name="close" />
              </button>
            </div>
            <p>La carpeta contiene varios archivos SSBP.</p>
            <div className="project-choices">
              {chooseProject.paths.map((path) => (
                <button
                  key={path}
                  className="button"
                  onClick={() => void openSources(chooseProject.sources, path)}
                >
                  <Icon name="file" />
                  <span>{path}</span>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
      {gifProgress && (
        <div className="modal-backdrop">
          <section
            className="help-modal gif-progress-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Exportando GIF"
          >
            <div className="modal-heading">
              <h2>Exportando GIF</h2>
              <span className="badge">{selection?.animation}</span>
            </div>
            <div className="gif-progress-content">
              <p>
                Se exportan todos los fotogramas con el encuadre, la velocidad y el bucle actuales.
              </p>
              <progress
                aria-label="Progreso de exportación GIF"
                value={gifProgress.current}
                max={gifProgress.total}
              />
              <div className="gif-progress-count" role="status">
                {gifProgress.current} / {gifProgress.total} fotogramas
              </div>
              <button className="button" autoFocus onClick={() => gifAbort.current?.abort()}>
                Cancelar exportación
              </button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
