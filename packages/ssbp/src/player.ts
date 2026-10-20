import type { SsbpFile } from './reader.js';
import type { EvaluatedFrame, EvaluateOptions } from './model.js';
import { evaluateFrame } from './evaluate.js';

/** Time-based player; host supplies delta seconds (requestAnimationFrame, server, tests…). */
export class SsbpPlayer {
  frame = 0;
  playing = false;
  loop = true;
  speed = 1;
  elapsed = 0;
  private fraction = 0;
  constructor(
    readonly file: SsbpFile,
    public packName: string,
    public animationName: string,
  ) {
    file.getAnimation(packName, animationName);
  }
  get animation() {
    return this.file.getAnimation(this.packName, this.animationName).animation;
  }
  select(pack: string, animation: string): void {
    this.file.getAnimation(pack, animation);
    this.packName = pack;
    this.animationName = animation;
    this.seek(0);
  }
  seek(frame: number): void {
    if (!Number.isFinite(frame)) return;
    this.frame = Math.max(0, Math.min(this.animation.frameCount - 1, Math.trunc(frame)));
    this.fraction = 0;
    this.elapsed = this.frame / this.animation.fps;
  }
  update(deltaSeconds: number): boolean {
    if (!this.playing || !Number.isFinite(deltaSeconds) || deltaSeconds < 0 || this.speed === 0)
      return false;
    this.elapsed += deltaSeconds * this.speed;
    this.fraction += deltaSeconds * this.animation.fps * this.speed;
    const delta = Math.trunc(this.fraction);
    this.fraction -= delta;
    if (delta === 0) return false;
    const next = this.frame + delta,
      length = this.animation.frameCount;
    if (this.loop) this.frame = ((next % length) + length) % length;
    else {
      this.frame = Math.max(0, Math.min(length - 1, next));
      if (next < 0 || next >= length) this.playing = false;
    }
    return true;
  }
  evaluate(options: EvaluateOptions = {}): EvaluatedFrame {
    return evaluateFrame(this.file, this.packName, this.animationName, this.frame, {
      ...options,
      time: options.time ?? this.elapsed,
    });
  }
}
