// ============================================================
// PBR + Deferred Shading GLSL Shaders
// ============================================================

export const GBufferVS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
layout(location=1) in vec3 aNormal;
layout(location=2) in vec2 aUV;
layout(location=3) in vec3 aTangent;

uniform mat4 uModel;
uniform mat4 uView;
uniform mat4 uProj;
uniform mat3 uNormalMatrix;

out vec3 vWorldPos;
out vec3 vNormal;
out vec2 vUV;
out mat3 vTBN;

void main(){
  vec4 worldPos = uModel * vec4(aPosition, 1.0);
  vWorldPos = worldPos.xyz;
  vNormal = normalize(uNormalMatrix * aNormal);
  vUV = aUV;

  vec3 T = normalize(uNormalMatrix * aTangent);
  vec3 N = vNormal;
  T = normalize(T - dot(T, N) * N);
  vec3 B = cross(N, T);
  vTBN = mat3(T, B, N);

  gl_Position = uProj * uView * worldPos;
}`;

export const GBufferFS = `#version 300 es
precision highp float;
in vec3 vWorldPos;
in vec3 vNormal;
in vec2 vUV;
in mat3 vTBN;

uniform vec3 uAlbedo;
uniform float uMetallic;
uniform float uRoughness;
uniform float uAO;
uniform sampler2D uAlbedoMap;
uniform sampler2D uNormalMap;
uniform sampler2D uRoughnessMap;
uniform int uHasAlbedoMap;
uniform int uHasNormalMap;
uniform int uHasRoughnessMap;

layout(location=0) out vec4 gAlbedo;
layout(location=1) out vec4 gNormal;
layout(location=2) out vec4 gMaterial; // r=metallic, g=roughness, b=ao

void main(){
  vec3 albedo = uAlbedo;
  if(uHasAlbedoMap == 1) albedo *= texture(uAlbedoMap, vUV).rgb;

  vec3 N = normalize(vNormal);
  if(uHasNormalMap == 1){
    vec3 nm = texture(uNormalMap, vUV).rgb * 2.0 - 1.0;
    N = normalize(vTBN * nm);
  }

  float roughness = uRoughness;
  if(uHasRoughnessMap == 1) roughness = texture(uRoughnessMap, vUV).r;

  gAlbedo   = vec4(albedo, 1.0);
  gNormal   = vec4(N * 0.5 + 0.5, 1.0);
  gMaterial = vec4(uMetallic, roughness, uAO, 1.0);
}`;

// ---- PBR Lighting Pass ----
export const LightingVS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){
  vUV = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}`;

export const LightingFS = `#version 300 es
precision highp float;
in vec2 vUV;

uniform sampler2D gAlbedo;
uniform sampler2D gNormal;
uniform sampler2D gMaterial;
uniform sampler2D gDepth;
uniform mat4 uInvViewProj;
uniform vec3 uCameraPos;

// Lights
uniform vec3 uSunDir;
uniform vec3 uSunColor;
uniform float uAmbient;

// Shadow
uniform sampler2D uShadowMap;
uniform mat4 uShadowMatrix;
uniform float uShadowBias;

out vec4 fragColor;

const float PI = 3.14159265359;

vec3 reconstructWorldPos(float depth){
  vec4 clip = vec4(vUV * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  vec4 world = uInvViewProj * clip;
  return world.xyz / world.w;
}

float DistributionGGX(vec3 N, vec3 H, float roughness){
  float a = roughness * roughness;
  float a2 = a * a;
  float NdotH = max(dot(N, H), 0.0);
  float d = (NdotH * NdotH * (a2 - 1.0) + 1.0);
  return a2 / (PI * d * d);
}

float GeometrySchlick(float NdotV, float k){
  return NdotV / (NdotV * (1.0 - k) + k);
}

float GeometrySmith(vec3 N, vec3 V, vec3 L, float roughness){
  float r = roughness + 1.0;
  float k = (r * r) / 8.0;
  return GeometrySchlick(max(dot(N,V),0.0), k) *
         GeometrySchlick(max(dot(N,L),0.0), k);
}

vec3 FresnelSchlick(float cosTheta, vec3 F0){
  return F0 + (1.0 - F0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

float shadowCalc(vec3 worldPos, vec3 N){
  vec4 shadowCoord = uShadowMatrix * vec4(worldPos, 1.0);
  vec3 proj = shadowCoord.xyz / shadowCoord.w;
  proj = proj * 0.5 + 0.5;
  if(proj.x < 0.0 || proj.x > 1.0 || proj.y < 0.0 || proj.y > 1.0) return 1.0;
  float closestDepth = texture(uShadowMap, proj.xy).r;
  float bias = max(uShadowBias * (1.0 - dot(N, normalize(-uSunDir))), 0.0005);
  // PCF 3x3
  float shadow = 0.0;
  vec2 texelSize = vec2(1.0/2048.0);
  for(int x=-1; x<=1; x++){
    for(int y=-1; y<=1; y++){
      float pcfDepth = texture(uShadowMap, proj.xy + vec2(x,y)*texelSize).r;
      shadow += proj.z - bias > pcfDepth ? 1.0 : 0.0;
    }
  }
  return 1.0 - shadow/9.0;
}

void main(){
  float depth = texture(gDepth, vUV).r;
  if(depth >= 0.9999){
    // Sky gradient
    vec2 uv2 = vUV;
    float t = uv2.y;
    vec3 sky1 = vec3(0.05, 0.08, 0.18);
    vec3 sky2 = vec3(0.53, 0.72, 0.94);
    vec3 sky = mix(sky1, sky2, pow(t, 0.6));
    // Sun
    vec3 rayDir = normalize(vec3((vUV.x*2.0-1.0)*1.5, (vUV.y*2.0-1.0), -1.0));
    float sunDot = dot(rayDir, normalize(-uSunDir));
    float sun = smoothstep(0.9995, 1.0, sunDot);
    sky += vec3(1.0, 0.95, 0.6) * sun * 5.0;
    fragColor = vec4(sky, 1.0);
    return;
  }

  vec3 worldPos = reconstructWorldPos(depth);
  vec4 albedoSample = texture(gAlbedo, vUV);
  vec3 albedo = albedoSample.rgb;
  vec3 N = normalize(texture(gNormal, vUV).rgb * 2.0 - 1.0);
  vec3 material = texture(gMaterial, vUV).rgb;
  float metallic = material.r;
  float roughness = material.g;
  float ao = material.b;

  vec3 V = normalize(uCameraPos - worldPos);
  vec3 L = normalize(-uSunDir);
  vec3 H = normalize(V + L);

  vec3 F0 = mix(vec3(0.04), albedo, metallic);

  float NDF = DistributionGGX(N, H, roughness);
  float G   = GeometrySmith(N, V, L, roughness);
  vec3  F   = FresnelSchlick(max(dot(H, V), 0.0), F0);

  vec3 nominator    = NDF * G * F;
  float denominator = 4.0 * max(dot(N,V),0.0) * max(dot(N,L),0.0) + 0.001;
  vec3 specular     = nominator / denominator;

  vec3 kS = F;
  vec3 kD = (vec3(1.0) - kS) * (1.0 - metallic);

  float NdotL = max(dot(N, L), 0.0);
  float shadow = shadowCalc(worldPos, N);

  vec3 Lo = (kD * albedo / PI + specular) * uSunColor * NdotL * shadow;
  vec3 ambient = vec3(uAmbient) * albedo * ao;

  // HDR tonemapping (ACES)
  vec3 color = ambient + Lo;
  color = color * (color + 0.0245786) / (color * (0.983729 * color + 0.4329510) + 0.238081);
  // Gamma
  color = pow(color, vec3(1.0/2.2));

  fragColor = vec4(color, 1.0);
}`;

// ---- Shadow Map Pass ----
export const ShadowVS = `#version 300 es
precision highp float;
layout(location=0) in vec3 aPosition;
uniform mat4 uLightMVP;
void main(){
  gl_Position = uLightMVP * vec4(aPosition, 1.0);
}`;

export const ShadowFS = `#version 300 es
precision highp float;
void main(){}`;

// ---- SSAO ----
export const SSAOVS = `#version 300 es
precision highp float;
layout(location=0) in vec2 aPos;
out vec2 vUV;
void main(){ vUV = aPos*0.5+0.5; gl_Position = vec4(aPos,0.0,1.0); }`;

export const SSAOFS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D gNormal;
uniform sampler2D gDepth;
uniform sampler2D uNoise;
uniform mat4 uProj;
uniform mat4 uView;
uniform mat4 uInvViewProj;
uniform vec3 uSamples[64];
out vec4 fragColor;

vec3 reconstructPos(float depth){
  vec4 clip = vec4(vUV*2.0-1.0, depth*2.0-1.0, 1.0);
  vec4 world = uInvViewProj * clip;
  return world.xyz / world.w;
}

void main(){
  float depth = texture(gDepth, vUV).r;
  if(depth >= 0.9999){ fragColor = vec4(1.0); return; }
  vec3 pos = reconstructPos(depth);
  vec3 N = normalize(texture(gNormal, vUV).rgb * 2.0 - 1.0);
  vec2 noiseScale = vec2(textureSize(gDepth,0)) / 4.0;
  vec3 randVec = normalize(texture(uNoise, vUV * noiseScale).xyz * 2.0 - 1.0);
  vec3 T = normalize(randVec - N * dot(randVec, N));
  vec3 B = cross(N, T);
  mat3 TBN = mat3(T, B, N);

  float occlusion = 0.0;
  float radius = 1.2;
  float bias = 0.025;
  for(int i=0; i<64; i++){
    vec3 s = TBN * uSamples[i];
    s = pos + s * radius;
    vec4 offset = uProj * uView * vec4(s, 1.0);
    offset.xyz /= offset.w;
    offset.xyz = offset.xyz * 0.5 + 0.5;
    float sampleDepth = texture(gDepth, offset.xy).r;
    vec3 samplePos = reconstructPos(sampleDepth);
    float rangeCheck = smoothstep(0.0, 1.0, radius / abs(pos.z - samplePos.z));
    occlusion += (samplePos.z >= s.z + bias ? 1.0 : 0.0) * rangeCheck;
  }
  occlusion = 1.0 - (occlusion / 64.0);
  fragColor = vec4(vec3(occlusion), 1.0);
}`;

// ---- Bloom ----
export const BloomFS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
uniform sampler2D uBloom;
uniform float uExposure;
out vec4 fragColor;
void main(){
  vec3 scene = texture(uScene, vUV).rgb;
  vec3 bloom = texture(uBloom, vUV).rgb;
  vec3 color = scene + bloom * 0.3;
  fragColor = vec4(color, 1.0);
}`;

export const BlurFS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uTex;
uniform bool uHorizontal;
out vec4 fragColor;
const float weight[5] = float[](0.2270270, 0.1945946, 0.1216216, 0.0540540, 0.0162162);
void main(){
  vec2 tex_offset = vec2(1.0) / vec2(textureSize(uTex, 0));
  vec3 result = texture(uTex, vUV).rgb * weight[0];
  for(int i=1; i<5; i++){
    vec2 offset = uHorizontal ? vec2(tex_offset.x * float(i), 0.0) : vec2(0.0, tex_offset.y * float(i));
    result += texture(uTex, vUV + offset).rgb * weight[i];
    result += texture(uTex, vUV - offset).rgb * weight[i];
  }
  fragColor = vec4(result, 1.0);
}`;

export const BrightFS = `#version 300 es
precision highp float;
in vec2 vUV;
uniform sampler2D uScene;
out vec4 fragColor;
void main(){
  vec3 c = texture(uScene, vUV).rgb;
  float brightness = dot(c, vec3(0.2126, 0.7152, 0.0722));
  fragColor = brightness > 0.85 ? vec4(c, 1.0) : vec4(0.0, 0.0, 0.0, 1.0);
}`;
