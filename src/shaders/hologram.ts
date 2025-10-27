export const hologramVertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  uniform float time;
  
  void main() {
    vUv = uv;
    vPosition = position;
    vNormal = normalize(normalMatrix * normal);
    
    // Subtle wave distortion
    vec3 pos = position;
    pos.z += sin(pos.y * 10.0 + time * 2.0) * 0.01;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const hologramFragmentShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  varying vec3 vNormal;
  uniform float time;
  uniform float opacity;
  uniform float zPosition;
  uniform vec3 glowColor;
  
  void main() {
    // Scanlines effect
    float scanline = sin(vUv.y * 100.0 + time * 3.0) * 0.1 + 0.9;
    
    // Hologram flicker
    float flicker = sin(time * 20.0) * 0.02 + 0.98;
    
    // Edge glow based on normal
    float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
    
    // Opacity based on Z position (front = opaque, back = transparent)
    float depthOpacity = smoothstep(-1.0, 1.0, zPosition);
    
    // Glitch lines
    float glitch = step(0.98, sin(vUv.y * 500.0 + time * 50.0));
    
    // Combine effects
    vec3 color = glowColor;
    color *= scanline * flicker;
    color += fresnel * glowColor * 1.5;
    color += glitch * vec3(0.5, 1.0, 1.0);
    
    float finalOpacity = opacity * depthOpacity * scanline;
    
    gl_FragColor = vec4(color, finalOpacity);
  }
`;

export const sunVertexShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  uniform float time;
  
  void main() {
    vUv = uv;
    vPosition = position;
    
    // Pulsing effect
    vec3 pos = position;
    float pulse = sin(time * 2.0) * 0.05 + 1.0;
    pos *= pulse;
    
    gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
  }
`;

export const sunFragmentShader = `
  varying vec2 vUv;
  varying vec3 vPosition;
  uniform float time;
  
  void main() {
    // Plasma effect
    vec2 uv = vUv;
    float noise = sin(uv.x * 10.0 + time) * sin(uv.y * 10.0 + time * 1.3);
    
    // Color gradient (orange -> pink -> purple)
    vec3 color1 = vec3(1.0, 0.5, 0.0); // Orange
    vec3 color2 = vec3(1.0, 0.2, 0.5); // Pink
    vec3 color3 = vec3(0.5, 0.0, 1.0); // Purple
    
    float mixer = sin(time * 0.5 + noise) * 0.5 + 0.5;
    vec3 color = mix(color1, color2, mixer);
    color = mix(color, color3, sin(time * 0.3) * 0.5 + 0.5);
    
    // Add noise texture
    color += noise * 0.2;
    
    // Bright center
    float dist = length(vUv - 0.5);
    color *= 1.0 - dist * 0.5;
    
    gl_FragColor = vec4(color, 1.0);
  }
`;
