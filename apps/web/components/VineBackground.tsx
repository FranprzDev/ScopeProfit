'use client';

import { useEffect, useRef } from 'react';
import * as THREE from 'three';

const VINE_COLORS = [
  new THREE.Color('#7c5cff'),
  new THREE.Color('#c04cc2'),
  new THREE.Color('#4fb8c9'),
];

function buildVineCurve(seed: number): THREE.CatmullRomCurve3 {
  const points: THREE.Vector3[] = [];
  const segments = 8;
  let x = (seed % 5) * 4 - 8;
  let y = -12;
  for (let i = 0; i <= segments; i += 1) {
    x += Math.sin(seed + i * 1.3) * 2.2;
    y += 24 / segments;
    const z = Math.cos(seed * 1.7 + i) * 3 - 2;
    points.push(new THREE.Vector3(x, y, z));
  }
  return new THREE.CatmullRomCurve3(points);
}

export function VineBackground() {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    } catch {
      return;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 100);
    camera.position.set(0, 0, 14);

    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    container.appendChild(renderer.domElement);

    const isSmallScreen = window.innerWidth < 700;
    const vineCount = isSmallScreen ? 4 : 7;
    const vines: { mesh: THREE.Mesh; curve: THREE.CatmullRomCurve3; speed: number; offset: number }[] = [];

    for (let i = 0; i < vineCount; i += 1) {
      const curve = buildVineCurve(i * 1.618);
      const geometry = new THREE.TubeGeometry(curve, 64, 0.05 + Math.random() * 0.03, 8, false);
      const color = VINE_COLORS[i % VINE_COLORS.length];
      const material = new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.3,
      });
      const mesh = new THREE.Mesh(geometry, material);
      scene.add(mesh);
      vines.push({ mesh, curve, speed: 0.2 + Math.random() * 0.3, offset: Math.random() * 10 });

      const budCount = 4;
      const budGeometry = new THREE.SphereGeometry(0.09, 8, 8);
      for (let b = 0; b < budCount; b += 1) {
        const t = (b + 1) / (budCount + 1);
        const point = curve.getPointAt(t);
        const budMaterial = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.6 });
        const bud = new THREE.Mesh(budGeometry, budMaterial);
        bud.position.copy(point);
        scene.add(bud);
      }
    }

    const mouse = { x: 0, y: 0 };
    const handlePointerMove = (event: PointerEvent) => {
      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    };
    window.addEventListener('pointermove', handlePointerMove);

    let frameId = 0;
    const clock = new THREE.Clock();

    const animate = () => {
      const elapsed = clock.getElapsedTime();
      vines.forEach((vine, index) => {
        vine.mesh.rotation.z = Math.sin(elapsed * vine.speed + vine.offset) * 0.08;
        vine.mesh.position.x = Math.sin(elapsed * 0.15 + index) * 0.4 + mouse.x * 1.2;
        vine.mesh.position.y = Math.cos(elapsed * 0.12 + index) * 0.3 + mouse.y * 0.8;
      });
      camera.position.x += (mouse.x * 1.5 - camera.position.x) * 0.02;
      camera.position.y += (mouse.y * 1.0 - camera.position.y) * 0.02;
      camera.lookAt(0, 0, 0);
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    const handleResize = () => {
      camera.aspect = container.clientWidth / container.clientHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(container.clientWidth, container.clientHeight);
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('pointermove', handlePointerMove);
      vines.forEach((vine) => {
        vine.mesh.geometry.dispose();
        (vine.mesh.material as THREE.Material).dispose();
      });
      renderer.dispose();
      container.removeChild(renderer.domElement);
    };
  }, []);

  return <div ref={containerRef} className="vine-background" aria-hidden="true" />;
}
