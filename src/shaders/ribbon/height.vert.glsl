varying float vHeight;

void main() {
  vHeight = position.z;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
