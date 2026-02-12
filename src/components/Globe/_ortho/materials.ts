import * as THREE from "three";
import { BASE_FILL_COLOR_SRGB, DEFAULT_LIGHT_DIRECTION } from "./constants";
import { GLOBE_FRAGMENT_SHADER, GLOBE_VERTEX_SHADER } from "./shaders";

export const createSolidTexture = (rgba: [number, number, number, number]) => {
  const data = new Uint8Array(rgba);
  const texture = new THREE.DataTexture(data, 1, 1);
  texture.needsUpdate = true;
  texture.colorSpace = THREE.NoColorSpace;
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
};

export const DEFAULT_NORMAL_TEXTURE = createSolidTexture([128, 128, 255, 255]);
export const DEFAULT_COLOR_TEXTURE = createSolidTexture([255, 255, 255, 255]);

export const setSolidVertexColor = (
  geometry: THREE.BufferGeometry,
  color: THREE.Color,
) => {
  const position = geometry.getAttribute("position");
  if (!position) return;
  const colors = new Float32Array(position.count * 3);
  for (let i = 0; i < position.count; i += 1) {
    const base = i * 3;
    colors[base] = color.r;
    colors[base + 1] = color.g;
    colors[base + 2] = color.b;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
};

export const ensureTangents = (geometry: THREE.BufferGeometry) => {
  if (!geometry.index || !geometry.getAttribute("uv")) return;
  geometry.computeTangents();
};

export const createGlobeMaterial = (options: {
  transparent?: boolean;
  depthWrite?: boolean;
  opacity?: number;
  useTexture?: boolean;
  useVertexColor?: boolean;
  baseColor?: THREE.Color;
  colorMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  lightingEnabled?: boolean;
  lightDirection?: THREE.Vector3;
}) => {
  const {
    transparent = false,
    depthWrite = true,
    opacity = 1,
    useTexture = false,
    useVertexColor = true,
    baseColor = BASE_FILL_COLOR_SRGB,
    colorMap = DEFAULT_COLOR_TEXTURE,
    normalMap = DEFAULT_NORMAL_TEXTURE,
    lightingEnabled = false,
    lightDirection = DEFAULT_LIGHT_DIRECTION,
    ambientIntensity = 0.45,
  } = options;

  return new THREE.ShaderMaterial({
    vertexShader: GLOBE_VERTEX_SHADER,
    fragmentShader: GLOBE_FRAGMENT_SHADER,
    transparent,
    depthWrite,
    lights: false,
    uniforms: {
      normalMap: { value: normalMap },
      colorMap: { value: colorMap },
      useTexture: { value: useTexture },
      useVertexColor: { value: useVertexColor },
      lightingEnabled: { value: lightingEnabled },
      lightDirection: { value: lightDirection.clone() },
      baseColor: { value: baseColor.clone() },
      opacity: { value: opacity },
      ambientIntensity: { value: ambientIntensity },
    },
  });
};
