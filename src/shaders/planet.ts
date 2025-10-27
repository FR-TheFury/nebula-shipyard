// Update Planet Shader (Lava/Rock)
export const updatePlanetVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const updatePlanetFragmentShader = `
  uniform float time;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  vec3 primaryColor = vec3(1.0, 0.42, 0.21); // Orange
  vec3 secondaryColor = vec3(1.0, 0.24, 0.0); // Red
  vec3 glowColor = vec3(1.0, 0.55, 0.26); // Orange glow
  
  float noise(vec2 st) {
    return fract(sin(dot(st.xy, vec2(12.9898, 78.233))) * 43758.5453123);
  }
  
  void main() {
    // Animated lava pattern
    float pattern = noise(vUv * 10.0 + time * 0.1);
    pattern += noise(vUv * 20.0 - time * 0.15) * 0.5;
    
    // Mix colors based on pattern
    vec3 color = mix(secondaryColor, primaryColor, pattern);
    
    // Add glow on edges (Fresnel effect)
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
    color += glowColor * fresnel * 0.5;
    
    // Pulse effect
    float pulse = sin(time * 2.0) * 0.1 + 0.9;
    color *= pulse;
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Feature Planet Shader (Tech/Holographic)
export const featurePlanetVertexShader = `
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  void main() {
    vUv = uv;
    vNormal = normalize(normalMatrix * normal);
    vPosition = position;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const featurePlanetFragmentShader = `
  uniform float time;
  varying vec2 vUv;
  varying vec3 vNormal;
  varying vec3 vPosition;
  
  vec3 primaryColor = vec3(0.3, 0.79, 0.94); // Cyan
  vec3 secondaryColor = vec3(0.23, 0.53, 1.0); // Blue
  vec3 glowColor = vec3(0.45, 0.04, 0.72); // Purple
  
  void main() {
    // Scanlines pattern
    float scanline = sin(vUv.y * 100.0 + time * 5.0) * 0.5 + 0.5;
    
    // Grid pattern
    float gridX = step(0.95, fract(vUv.x * 20.0));
    float gridY = step(0.95, fract(vUv.y * 20.0));
    float grid = max(gridX, gridY);
    
    // Mix colors
    vec3 color = mix(primaryColor, secondaryColor, scanline);
    color += vec3(0.5, 1.0, 1.0) * grid * 0.3;
    
    // Fresnel glow
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 3.0);
    color += glowColor * fresnel * 0.8;
    
    // Electric pulse
    float pulse = sin(time * 3.0) * 0.15 + 0.85;
    color *= pulse;
    
    gl_FragColor = vec4(color, 1.0);
  }
`;

// Atmosphere Shader
export const atmosphereVertexShader = `
  varying vec3 vNormal;
  
  void main() {
    vNormal = normalize(normalMatrix * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

export const atmosphereFragmentShader = `
  uniform vec3 glowColor;
  varying vec3 vNormal;
  
  void main() {
    float intensity = pow(0.6 - dot(vNormal, vec3(0.0, 0.0, 1.0)), 2.0);
    gl_FragColor = vec4(glowColor, 1.0) * intensity;
  }
`;
