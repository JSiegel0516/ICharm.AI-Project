export const GLOBE_VERTEX_SHADER = `
  varying vec2 vUv;
  varying vec3 vColor;
  varying mat3 vTBN;

  attribute vec3 tangent;
  attribute vec3 color;

  void main() {
    vUv = uv;
    vColor = color;

    vec3 T = normalize(normalMatrix * tangent);
    vec3 N = normalize(normalMatrix * normal);
    vec3 B = normalize(cross(N, T));
    vTBN = mat3(T, B, N);

    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const GLOBE_FRAGMENT_SHADER = `
  uniform sampler2D normalMap;
  uniform sampler2D colorMap;
  uniform bool useTexture;
  uniform bool useVertexColor;
  uniform bool lightingEnabled;
  uniform vec3 lightDirection;
  uniform vec3 baseColor;
  uniform float opacity;
  uniform float ambientIntensity;

  varying vec2 vUv;
  varying vec3 vColor;
  varying mat3 vTBN;

  void main() {
    vec4 texColor = texture2D(colorMap, vUv);
    vec3 base = useTexture
      ? texColor.rgb
      : (useVertexColor ? vColor : baseColor);
    float alpha = useTexture ? texColor.a : 1.0;

    if (lightingEnabled) {
      vec3 normalRGB = texture2D(normalMap, vUv).rgb;
      vec3 tangentNormal = normalRGB * 2.0 - 1.0;
      vec3 normal = normalize(vTBN * tangentNormal);
      float lighting = max(dot(normal, normalize(lightDirection)), 0.0);
      lighting = max(lighting, ambientIntensity);
      base *= lighting;
    }

    gl_FragColor = vec4(base, alpha * opacity);
  }
`;
