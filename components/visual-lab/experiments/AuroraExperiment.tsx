"use client";

import { useEffect, useRef } from "react";
import { Color, Mesh, Program, Renderer, Triangle } from "ogl";
import type { ExperimentProps } from "../types";
import s from "./Experiments.module.css";

// Shader structure adapted from React Bits Aurora for the private MCWV lab.
const vertex = `#version 300 es
in vec2 position;
void main(){gl_Position=vec4(position,0.0,1.0);}`;

const fragment = `#version 300 es
precision highp float;
uniform float uTime; uniform float uAmp; uniform vec2 uResolution; uniform vec2 uPointer;
uniform vec3 uA; uniform vec3 uB; uniform vec3 uC; out vec4 fragColor;
vec3 permute(vec3 x){return mod(((x*34.0)+1.0)*x,289.0);}
float noise(vec2 v){
 const vec4 C=vec4(.211324865,.366025404,-.577350269,.024390244);
 vec2 i=floor(v+dot(v,C.yy)); vec2 x0=v-i+dot(i,C.xx);
 vec2 i1=x0.x>x0.y?vec2(1.,0.):vec2(0.,1.); vec4 x12=x0.xyxy+C.xxzz; x12.xy-=i1; i=mod(i,289.);
 vec3 p=permute(permute(i.y+vec3(0.,i1.y,1.))+i.x+vec3(0.,i1.x,1.));
 vec3 m=max(.5-vec3(dot(x0,x0),dot(x12.xy,x12.xy),dot(x12.zw,x12.zw)),0.); m=m*m; m=m*m;
 vec3 x=2.*fract(p*C.www)-1.; vec3 h=abs(x)-.5; vec3 ox=floor(x+.5); vec3 a=x-ox;
 m*=1.792842914-.853734721*(a*a+h*h);
 vec3 g; g.x=a.x*x0.x+h.x*x0.y; g.yz=a.yz*x12.xz+h.yz*x12.yw; return 130.*dot(m,g);
}
void main(){
 vec2 uv=gl_FragCoord.xy/uResolution; vec2 p=uPointer*.11;
 vec3 ramp=uv.x<.5?mix(uA,uB,uv.x*2.):mix(uB,uC,(uv.x-.5)*2.);
 float n=noise(vec2(uv.x*2.1+uTime*.1+p.x,uTime*.19+p.y))*uAmp;
 float curtain=uv.y*1.62-exp(n*.6)+.36;
 float alpha=smoothstep(-.08,.30,.58*curtain);
 float shimmer=.72+.28*sin((uv.x+uv.y+uTime*.045)*12.);
 fragColor=vec4(ramp*alpha*shimmer,alpha*.9);
}`;

export default function AuroraExperiment({ active, quality, reducedMotion }: ExperimentProps) {
  const mountRef = useRef<HTMLDivElement>(null);
  const pointerRef = useRef<[number, number]>([0, 0]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !active) return;
    let renderer: Renderer;
    try {
      renderer = new Renderer({
        alpha: true,
        antialias: quality === "full",
        dpr: quality === "full" ? Math.min(devicePixelRatio, 1.75) : 1,
        webgl: 2,
      });
    } catch {
      return;
    }
    const gl = renderer.gl;
    gl.clearColor(0, 0, 0, 0);
    const geometry = new Triangle(gl);
    if (geometry.attributes.uv) delete geometry.attributes.uv;
    const program = new Program(gl, {
      vertex,
      fragment,
      transparent: true,
      uniforms: {
        uTime: { value: 0 },
        uAmp: { value: quality === "battery" ? 0.65 : 1 },
        uResolution: { value: [1, 1] },
        uPointer: { value: [0, 0] },
        uA: { value: new Color("#6f38ff") },
        uB: { value: new Color("#ef58d9") },
        uC: { value: new Color("#7548ff") },
      },
    });
    const mesh = new Mesh(gl, { geometry, program });
    mount.appendChild(gl.canvas);

    const resize = () => {
      const width = Math.max(mount.clientWidth, 1);
      const height = Math.max(mount.clientHeight, 1);
      renderer.setSize(width, height);
      program.uniforms.uResolution.value = [width * renderer.dpr, height * renderer.dpr];
    };
    const move = (event: PointerEvent) => {
      const rect = mount.getBoundingClientRect();
      pointerRef.current = [
        ((event.clientX - rect.left) / rect.width - 0.5) * 2,
        -((event.clientY - rect.top) / rect.height - 0.5) * 2,
      ];
    };
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    mount.addEventListener("pointermove", move);
    resize();

    let frameId = 0;
    let last = 0;
    const fpsCap = quality === "battery" ? 1000 / 24 : quality === "balanced" ? 1000 / 40 : 0;
    const draw = (now: number) => {
      frameId = requestAnimationFrame(draw);
      if (fpsCap && now - last < fpsCap) return;
      last = now;
      program.uniforms.uTime.value = reducedMotion ? 7 : now * 0.001;
      program.uniforms.uPointer.value = pointerRef.current;
      renderer.render({ scene: mesh });
      if (reducedMotion) cancelAnimationFrame(frameId);
    };
    frameId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      mount.removeEventListener("pointermove", move);
      if (gl.canvas.parentNode === mount) mount.removeChild(gl.canvas);
      gl.getExtension("WEBGL_lose_context")?.loseContext();
    };
  }, [active, quality, reducedMotion]);

  return (
    <div ref={mountRef} className={`${s.fill} ${s.aurora} ${!active ? s.auroraStatic : ""}`}>
      <span className={s.auroraLabel}>MCWV // AURORA FIELD</span>
    </div>
  );
}
