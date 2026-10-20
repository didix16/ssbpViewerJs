import { textureCoordinates } from '@ssbp/core';
import type { DrawCommand, CellMap } from '@ssbp/core';
import { encodePng } from './png';

const vertexShader = `#version 300 es
precision highp float;
layout(location=0) in vec2 a_position;
layout(location=1) in vec2 a_uv;
layout(location=2) in vec4 a_color;
uniform vec2 u_size;
uniform vec2 u_center;
uniform vec2 u_scale;
out vec2 v_uv;
out vec4 v_color;
void main() {
  gl_Position = vec4((a_position-u_center)*u_scale/(u_size*0.5),0.0,1.0);
  v_uv=a_uv; v_color=a_color;
}`;
const fragmentShader = `#version 300 es
precision highp float;
uniform sampler2D u_texture;
uniform float u_opacity;
uniform int u_blend;
uniform bool u_wireframe;
in vec2 v_uv;
in vec4 v_color;
out vec4 outColor;
void main() {
  if (u_wireframe) { outColor=vec4(0.69,0.55,0.98,1.0); return; }
  vec4 pixel=texture(u_texture,v_uv);
  float rate=v_color.a;
  if(u_blend==0) pixel.rgb=mix(pixel.rgb,v_color.rgb,rate);
  else if(u_blend==1) pixel.rgb*=mix(vec3(1.0),v_color.rgb,rate);
  else if(u_blend==2) pixel.rgb+=v_color.rgb*rate;
  else if(u_blend==3) pixel.rgb-=v_color.rgb*rate;
  else if(u_blend==4) pixel*=v_color;
  pixel.a*=u_opacity;
  pixel.rgb=clamp(pixel.rgb,0.0,1.0)*pixel.a;
  outColor=pixel;
}`;
export interface TextureAsset {
  map: CellMap;
  image: HTMLImageElement;
  url: string;
  width: number;
  height: number;
  filename: string;
}
export interface Camera {
  x: number;
  y: number;
  zoom: number;
  flipX: boolean;
}

export class WebGLRenderer {
  readonly gl: WebGL2RenderingContext;
  readonly camera: Camera = { x: 0, y: 0, zoom: 1, flipX: false };
  fitScale = 1;
  wireframe = false;
  private program: WebGLProgram;
  private buffer: WebGLBuffer;
  private vao: WebGLVertexArrayObject;
  private textures = new Map<CellMap, { texture: WebGLTexture; asset: TextureAsset }>();
  private uniforms: Record<string, WebGLUniformLocation | null> = {};
  private observer: ResizeObserver;
  private commands: DrawCommand[] = [];
  private lost = false;
  onError?: (message: string) => void;
  onResize?: () => void;
  constructor(readonly canvas: HTMLCanvasElement) {
    const gl = canvas.getContext('webgl2', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      preserveDrawingBuffer: false,
    });
    if (!gl)
      throw new Error(
        'Este navegador no permite WebGL 2. Activa la aceleración gráfica para abrir el visor.',
      );
    this.gl = gl;
    this.program = this.createProgram();
    this.buffer = gl.createBuffer()!;
    this.vao = gl.createVertexArray()!;
    this.setup();
    this.observer = new ResizeObserver(() => {
      this.resize();
      this.onResize?.();
    });
    this.observer.observe(canvas);
    this.resize();
    canvas.addEventListener('webglcontextlost', this.contextLost);
    canvas.addEventListener('webglcontextrestored', this.contextRestored);
  }
  private contextLost = (event: Event) => {
    event.preventDefault();
    this.lost = true;
    this.onError?.('Se ha perdido el contexto gráfico. Esperando a que el navegador lo restaure…');
  };
  private contextRestored = () => {
    this.lost = false;
    this.program = this.createProgram();
    this.buffer = this.gl.createBuffer()!;
    this.vao = this.gl.createVertexArray()!;
    this.setup();
    const assets = [...this.textures.values()].map((t) => t.asset);
    this.textures.clear();
    this.setTextures(assets);
    this.render(this.commands);
    this.onError?.('');
  };
  private createProgram(): WebGLProgram {
    const gl = this.gl,
      program = gl.createProgram()!;
    for (const [type, source] of [
      [gl.VERTEX_SHADER, vertexShader],
      [gl.FRAGMENT_SHADER, fragmentShader],
    ] as const) {
      const shader = gl.createShader(type)!;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const error = gl.getShaderInfoLog(shader);
        gl.deleteShader(shader);
        throw new Error(`Error en el shader: ${error}`);
      }
      gl.attachShader(program, shader);
      gl.deleteShader(shader);
    }
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS))
      throw new Error(`Error al enlazar WebGL: ${gl.getProgramInfoLog(program)}`);
    return program;
  }
  private setup(): void {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    for (const [location, size, offset] of [
      [0, 2, 0],
      [1, 2, 8],
      [2, 4, 16],
    ]) {
      gl.enableVertexAttribArray(location);
      gl.vertexAttribPointer(location, size, gl.FLOAT, false, 32, offset);
    }
    for (const name of ['size', 'center', 'scale', 'opacity', 'blend', 'wireframe', 'texture'])
      this.uniforms[name] = gl.getUniformLocation(this.program, `u_${name}`);
    gl.enable(gl.BLEND);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.CULL_FACE);
    gl.clearColor(0, 0, 0, 0);
  }
  resize(): void {
    const ratio = Math.min(window.devicePixelRatio || 1, 3),
      width = Math.max(1, Math.round(this.canvas.clientWidth * ratio)),
      height = Math.max(1, Math.round(this.canvas.clientHeight * ratio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
    }
    this.render(this.commands);
  }
  setTextures(assets: TextureAsset[]): void {
    const gl = this.gl;
    for (const t of this.textures.values()) gl.deleteTexture(t.texture);
    this.textures.clear();
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, gl.NONE);
    for (const asset of assets) {
      const texture = gl.createTexture()!;
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, asset.image);
      const wrap =
        asset.map.wrapMode === 1
          ? gl.REPEAT
          : asset.map.wrapMode === 2
            ? gl.MIRRORED_REPEAT
            : gl.CLAMP_TO_EDGE;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrap);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrap);
      const filter = asset.map.filterMode === 0 ? gl.NEAREST : gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
      this.textures.set(asset.map, { texture, asset });
    }
  }
  fit(commands: DrawCommand[], resetZoom = true): void {
    const vertices = commands
      .filter((c) => this.textures.has(c.cellMap))
      .flatMap((c) => c.vertices);
    if (!vertices.length) return;
    let minX = Infinity,
      maxX = -Infinity,
      minY = Infinity,
      maxY = -Infinity;
    for (const v of vertices) {
      minX = Math.min(minX, v.x);
      maxX = Math.max(maxX, v.x);
      minY = Math.min(minY, v.y);
      maxY = Math.max(maxY, v.y);
    }
    this.camera.x = (minX + maxX) / 2;
    this.camera.y = (minY + maxY) / 2;
    this.fitScale = Math.min(
      (this.canvas.clientWidth * 0.62) / Math.max(1, maxX - minX),
      (this.canvas.clientHeight * 0.72) / Math.max(1, maxY - minY),
      4,
    );
    if (resetZoom) this.camera.zoom = 1;
  }
  get scale(): number {
    return this.fitScale * this.camera.zoom;
  }
  render(commands: DrawCommand[]): void {
    this.commands = commands;
    if (this.lost) return;
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.uniform2f(this.uniforms.size, this.canvas.clientWidth, this.canvas.clientHeight);
    gl.uniform2f(this.uniforms.center, this.camera.x, this.camera.y);
    gl.uniform2f(this.uniforms.scale, this.scale * (this.camera.flipX ? -1 : 1), this.scale);
    gl.uniform1i(this.uniforms.texture, 0);
    gl.uniform1i(this.uniforms.wireframe, this.wireframe ? 1 : 0);
    gl.activeTexture(gl.TEXTURE0);
    for (const command of commands) {
      const texture = this.textures.get(command.cellMap);
      if (!texture) continue;
      gl.bindTexture(gl.TEXTURE_2D, texture.texture);
      gl.blendEquationSeparate(
        command.blendMode === 3 ? gl.FUNC_REVERSE_SUBTRACT : gl.FUNC_ADD,
        gl.FUNC_ADD,
      );
      gl.blendFuncSeparate(
        command.blendMode === 1 ? gl.DST_COLOR : gl.ONE,
        command.blendMode === 2 || command.blendMode === 3 ? gl.ONE : gl.ONE_MINUS_SRC_ALPHA,
        gl.ONE,
        gl.ONE_MINUS_SRC_ALPHA,
      );
      gl.uniform1f(this.uniforms.opacity, command.opacity);
      gl.uniform1i(this.uniforms.blend, command.colorBlend);
      const uv = textureCoordinates(command, texture.asset.width, texture.asset.height),
        indices = this.wireframe ? [0, 1, 3, 2] : [1, 2, 3, 1, 0, 2];
      const data = new Float32Array(
        indices.flatMap((i) => {
          const v = command.vertices[i];
          return [v.x, v.y, uv[i][0], uv[i][1], ...v.color];
        }),
      );
      gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
      gl.drawArrays(this.wireframe ? gl.LINE_LOOP : gl.TRIANGLES, 0, indices.length);
    }
  }
  async exportPng(): Promise<Blob> {
    this.render(this.commands);
    const { width, height, data } = this.capturePixels();
    return encodePng(width, height, data);
  }
  capturePixels(): { width: number; height: number; data: Uint8Array<ArrayBuffer> } {
    if (this.lost) throw new Error('El contexto WebGL no está disponible para exportar.');
    const gl = this.gl,
      pixels = new Uint8Array(this.canvas.width * this.canvas.height * 4);
    gl.readPixels(0, 0, this.canvas.width, this.canvas.height, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { width: this.canvas.width, height: this.canvas.height, data: pixels };
  }
  dispose(): void {
    this.observer.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.contextLost);
    this.canvas.removeEventListener('webglcontextrestored', this.contextRestored);
    const gl = this.gl;
    for (const t of this.textures.values()) gl.deleteTexture(t.texture);
    this.textures.clear();
    gl.deleteBuffer(this.buffer);
    gl.deleteVertexArray(this.vao);
    gl.deleteProgram(this.program);
  }
}
