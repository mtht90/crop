import * as THREE from 'three';

/**
 * 注目点のまわりをぼかす（被写界深度の代わり）。
 * 演出中だけシーンをいったん描き溜めて、注目点からの距離に応じて円形にぼかして画面へ出す
 */
export class FocusBlur {
  private target: THREE.WebGLRenderTarget;
  private quad: THREE.Mesh;
  private scene = new THREE.Scene();
  private cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  private mat: THREE.ShaderMaterial;
  private size = new THREE.Vector2();

  constructor() {
    this.target = new THREE.WebGLRenderTarget(4, 4, { type: THREE.HalfFloatType, depthBuffer: true });
    this.mat = new THREE.ShaderMaterial({
      uniforms: {
        tScene: { value: this.target.texture },
        uFocus: { value: new THREE.Vector2(0.5, 0.5) },
        uAmount: { value: 0 },
        uAspect: { value: 1 },
        uTexel: { value: new THREE.Vector2() },
      },
      vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }',
      fragmentShader: `
        uniform sampler2D tScene; uniform vec2 uFocus; uniform float uAmount; uniform float uAspect; uniform vec2 uTexel;
        varying vec2 vUv;
        void main() {
          vec2 d = vUv - uFocus; d.x *= uAspect;
          float k = smoothstep(0.08, 0.42, length(d)) * uAmount;
          float r = k * 9.0;
          vec4 sum = texture2D(tScene, vUv) * 2.0;
          float w = 2.0;
          // 円盤状に16点を2周
          for (int i = 0; i < 16; i++) {
            float a = float(i) * 2.39996;
            float rr = r * (0.35 + 0.65 * fract(float(i) * 0.618));
            vec2 o = vec2(cos(a), sin(a)) * rr * uTexel;
            sum += texture2D(tScene, vUv + o);
            w += 1.0;
          }
          gl_FragColor = sum / w;
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      depthTest: false,
      depthWrite: false,
      toneMapped: true,
    });
    this.quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), this.mat);
    this.quad.frustumCulled = false;
    this.scene.add(this.quad);
  }

  /** amount > 0 の時はぼかして描く。focus は画面上の位置 (0..1、左下原点) */
  render(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, amount: number, focus: THREE.Vector2): void {
    if (amount < 0.01) {
      renderer.render(scene, camera);
      return;
    }
    renderer.getDrawingBufferSize(this.size);
    if (this.target.width !== this.size.x || this.target.height !== this.size.y) this.target.setSize(this.size.x, this.size.y);
    renderer.setRenderTarget(this.target);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    const u = this.mat.uniforms;
    u.uFocus.value.copy(focus);
    u.uAmount.value = amount;
    u.uAspect.value = this.size.x / Math.max(1, this.size.y);
    u.uTexel.value.set(1 / this.size.x, 1 / this.size.y).multiplyScalar(this.size.y / 540);
    renderer.render(this.scene, this.cam);
  }
}
