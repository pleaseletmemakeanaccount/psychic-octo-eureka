import * as THREE from "three";
import { SKY_SHADOW_GLSL, skyShadowUniform } from "./sky-islands";
import { CH, L, N, S } from "./world";

// Actual chunk coverage, not a radius: a late chunk never leaves a hole in the horizon.
const coverageGLSL = `
uniform sampler2D uTerrainCoverage;
float terrainCoverage(vec3 p) {
  float a = mod(atan(p.y, p.x) + 6.28318530718, 6.28318530718);
  vec2 cell = floor(vec2(a / 6.28318530718 * ${N.toFixed(1)}, p.z + ${(L / 2).toFixed(1)}) / ${CH.toFixed(1)});
  vec2 uv = (clamp(cell, vec2(0.0), vec2(${(S - 1).toFixed(1)}, ${(L / CH - 1).toFixed(1)})) + 0.5) / vec2(${S.toFixed(1)}, ${(L / CH).toFixed(1)});
  return texture2D(uTerrainCoverage, uv).r;
}
float terrainDither() {
  return fract(52.9829189 * fract(dot(floor(gl_FragCoord.xy), vec2(0.06711056, 0.00583715))));
}`;

export class TerrainLOD {
  private data = new Uint8Array(S * (L / CH) * 4);
  private amounts = new Float32Array(S * (L / CH));
  private targets = new Map<number, number>();
  texture = new THREE.DataTexture(this.data, S, L / CH, THREE.RGBAFormat);
  private shaderUniform = { value: this.texture };

  constructor() {
    this.texture.magFilter = this.texture.minFilter = THREE.NearestFilter;
    this.texture.generateMipmaps = false;
    this.texture.needsUpdate = true;
  }
  private index(key: string) {
    const [x, z] = key.split(",").map(Number);
    return z * S + x;
  }
  target(key: string, detailed: boolean) { this.targets.set(this.index(key), detailed ? 1 : 0); }
  amount(key: string) { return this.amounts[this.index(key)]; }
  update(dt: number) {
    let changed = false;
    for (const [i, target] of this.targets) {
      const old = this.amounts[i];
      const next = THREE.MathUtils.clamp(old + Math.sign(target - old) * dt * 1.4, 0, 1);
      this.amounts[i] = next;
      this.data[i * 4] = Math.round(next * 255);
      changed ||= old !== next;
      if (next === target) this.targets.delete(i);
    }
    if (changed) this.texture.needsUpdate = true;
  }
  decorate(material: THREE.MeshLambertMaterial | THREE.MeshBasicMaterial) {
    material.onBeforeCompile = (shader) => {
      shader.uniforms.uTerrainCoverage = this.shaderUniform;
      shader.uniforms.uSkyShadows = skyShadowUniform;
      shader.vertexShader = `varying vec3 vTerrainWorld;\n${shader.vertexShader}`.replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvTerrainWorld = (modelMatrix * vec4(transformed, 1.0)).xyz;",
      );
      shader.fragmentShader = `varying vec3 vTerrainWorld;\n${coverageGLSL}\n${SKY_SHADOW_GLSL}\n${shader.fragmentShader}`
        .replace(
          "#include <clipping_planes_fragment>",
          "#include <clipping_planes_fragment>\nif(terrainDither() >= terrainCoverage(vTerrainWorld)) discard;",
        )
        .replace(
          "#include <tonemapping_fragment>",
          "gl_FragColor.rgb *= skyShadowFactor(vTerrainWorld);\n#include <tonemapping_fragment>",
        );
    };
    material.customProgramCacheKey = () => "ernas-detail-dither-v3";
  }
  material(near: number, far: number) {
    return new THREE.ShaderMaterial({
      uniforms: {
        uTerrainCoverage: this.shaderUniform,
        uSkyShadows: skyShadowUniform,
        uPlayer: { value: new THREE.Vector3() },
        uNear: { value: near }, uFar: { value: far },
        uLight: { value: 1 },
      },
      vertexShader: `attribute vec3 color; varying vec3 vColor; varying vec3 vWorld;
        void main(){vColor=color; vec4 w=modelMatrix*vec4(position,1.0); vWorld=w.xyz; gl_Position=projectionMatrix*viewMatrix*w;}`,
      fragmentShader: `${coverageGLSL}
        ${SKY_SHADOW_GLSL}
        uniform vec3 uPlayer; uniform float uNear; uniform float uFar; uniform float uLight;
        varying vec3 vColor; varying vec3 vWorld;
        void main(){
          float n=terrainDither();
          if(n < terrainCoverage(vWorld)) discard;
          float d=distance(vWorld,uPlayer);
          float enter=uNear < 1.0 ? 1.0 : smoothstep(uNear-100.0,uNear+100.0,d);
          float leave=smoothstep(uFar-100.0,uFar+100.0,d);
          if(n < leave || n >= enter) discard;
          gl_FragColor=vec4(vColor*uLight*skyShadowFactor(vWorld),1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      side: THREE.DoubleSide,
      polygonOffset: true, polygonOffsetFactor: 1, polygonOffsetUnits: 1,
    });
  }
  dispose() { this.texture.dispose(); }
}