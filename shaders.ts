import * as THREE from "three";

const NOISE = /* glsl */ `
float hash(vec3 p){ p = fract(p*0.3183099+.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
float noise(vec3 x){ vec3 i=floor(x); vec3 f=fract(x); f=f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i+vec3(0,0,0)),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
             mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
float fbm(vec3 p){ float v=0.0; float a=0.5; for(int i=0;i<5;i++){ v+=a*noise(p); p*=2.03; a*=0.5;} return v; }
`;

export function sunMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uBright: { value: 1 }, uEclipse: { value: 0 } },
    vertexShader: /* glsl */ `
      varying vec3 vN; varying vec3 vP; varying vec3 vV;
      void main(){ vN = normalize(normalMatrix*normal); vP = position; vec4 mv = modelViewMatrix*vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; uniform float uBright; uniform float uEclipse; varying vec3 vN; varying vec3 vP; varying vec3 vV;
      ${NOISE}
      void main(){
        float n = fbm(vP*0.6 + vec3(uTime*0.15, uTime*0.1, -uTime*0.12));
        float g = fbm(vP*2.2 - vec3(uTime*0.4));
        float pulse = 0.5+0.5*sin(uTime*1.7 + n*6.0);
        vec3 day = mix(vec3(1.0,0.55,0.12), vec3(1.0,0.95,0.6), n*1.2 + g*0.3);
        vec3 night = mix(vec3(0.35,0.05,0.02), vec3(0.8,0.2,0.05), n);
        vec3 col = mix(night, day, uBright);
        float rim = pow(1.0 - max(dot(vN, vV), 0.0), 2.0);
        col += rim * vec3(1.0,0.6,0.2) * (0.6 + pulse*0.4);
        gl_FragColor = vec4(col * (0.85 + pulse*0.25) * (1.0-uEclipse), 1.0);
      }`,
  });
}

export function auroraMaterial() {
  return new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
    uniforms: { uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      uniform float uTime; varying vec2 vUv;
      ${NOISE}
      void main(){
        float x = vUv.x*24.0; float y = vUv.y;
        float curtain = fbm(vec3(x*0.6 + uTime*0.15, y*3.0, uTime*0.1));
        float band = smoothstep(0.35, 0.75, curtain) * (0.5+0.5*sin(x*2.0 + uTime*0.8 + curtain*8.0));
        float fall = smoothstep(0.0,0.25,y)*smoothstep(1.0,0.6,y);
        vec3 col = mix(vec3(0.1,1.0,0.5), vec3(0.6,0.2,1.0), y + 0.3*sin(uTime*0.3+x*0.2));
        gl_FragColor = vec4(col*band*fall*1.4, band*fall);
      }`,
  });
}

export function voidSkyMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 } },
    side: THREE.BackSide, depthWrite: false,
    vertexShader: `varying vec3 vDirection; void main(){vDirection=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
    fragmentShader: `uniform float uTime; varying vec3 vDirection;
      ${NOISE}
      void main(){
        float mist=fbm(vDirection*4.0+vec3(uTime*0.015,0.0,uTime*0.01));
        vec3 color=mix(vec3(0.014,0.019,0.04),vec3(0.19,0.17,0.26),smoothstep(0.3,0.72,mist));
        gl_FragColor=vec4(color,1.0);
        #include <colorspace_fragment>
      }`,
  });
}

export function glowSpriteTexture(inner: string, outer: string) {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d")!;
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, inner);
  gr.addColorStop(0.35, outer);
  gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
