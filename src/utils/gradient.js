import * as THREE from "three";

export const sampleGradient = (t, stops) => {
  const clamped = Math.min(Math.max(t, 0), 1);

  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i];
    const b = stops[i + 1];

    if (clamped >= a.t && clamped <= b.t) {
      const localT = (clamped - a.t) / (b.t - a.t);
      return new THREE.Color(a.color).lerp(new THREE.Color(b.color), localT);
    }
  }

  return new THREE.Color(stops[stops.length - 1].color);
};
