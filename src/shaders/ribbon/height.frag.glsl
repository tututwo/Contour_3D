uniform float zMin;
uniform float zMax;
uniform vec3 colorLow;
uniform vec3 colorHigh;
uniform float opacity;

varying float vHeight;

void main() {
  float t = clamp((vHeight - zMin) / (zMax - zMin), 0.0, 1.0);
  vec3 color = mix(colorLow, colorHigh, t);
  gl_FragColor = vec4(color, opacity);
}
