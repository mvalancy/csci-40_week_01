// Low-poly motocross bike + rider built from primitives. No model files needed.
import * as THREE from 'three';

export const WHEEL_R = 0.55;
export const WHEELBASE = 1.9;

const mat = (color, opts = {}) => new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.15, ...opts });

function wheel() {
  const g = new THREE.Group();
  const tire = new THREE.Mesh(new THREE.TorusGeometry(WHEEL_R - 0.12, 0.13, 10, 24), mat('#161616', { roughness: 0.9 }));
  const rim = new THREE.Mesh(new THREE.CylinderGeometry(WHEEL_R - 0.2, WHEEL_R - 0.2, 0.08, 16), mat('#b8bcc8', { metalness: 0.8, roughness: 0.3 }));
  rim.rotation.x = Math.PI / 2;
  // Bright spoke bars make the spinning obvious.
  for (let i = 0; i < 3; i++) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(0.06, (WHEEL_R - 0.2) * 2, 0.1), mat('#ffcf40', { metalness: 0.4 }));
    s.rotation.z = (i * Math.PI) / 3;
    g.add(s);
  }
  g.add(tire, rim);
  g.traverse((m) => m.isMesh && (m.castShadow = true));
  return g;
}

function box(w, h, d, material, x, y, z = 0, rz = 0) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  m.position.set(x, y, z);
  m.rotation.z = rz;
  m.castShadow = true;
  return m;
}

export function buildBike(color, number) {
  const root = new THREE.Group(); // positioned at ground contact, rotated by pitch
  const body = new THREE.Group(); // leans / wobbles
  root.add(body);

  const paint = mat(color, { metalness: 0.35, roughness: 0.35 });
  const dark = mat('#222230');
  const chrome = mat('#d0d4dc', { metalness: 0.9, roughness: 0.2 });

  const rear = wheel();
  rear.position.set(-WHEELBASE / 2, WHEEL_R, 0);
  const front = wheel();
  front.position.set(WHEELBASE / 2, WHEEL_R, 0);
  body.add(rear, front);

  body.add(
    box(1.3, 0.28, 0.34, paint, 0.05, 1.05),              // tank / frame
    box(0.9, 0.12, 0.3, dark, -0.45, 1.2),                // seat
    box(0.75, 0.1, 0.3, paint, -0.95, 1.22, 0, 0.25),     // rear fender
    box(0.55, 0.08, 0.28, paint, 1.05, 1.05, 0, -0.35),   // front fender
    box(0.5, 0.35, 0.3, dark, -0.05, 0.72),               // engine
    box(0.08, 0.95, 0.08, chrome, 0.78, 0.9, 0.12, -0.38), // fork L
    box(0.08, 0.95, 0.08, chrome, 0.78, 0.9, -0.12, -0.38), // fork R
    box(0.08, 0.08, 0.8, dark, 0.62, 1.45),               // handlebar
    box(0.9, 0.06, 0.06, chrome, -0.5, 0.55, 0.18, 0.35), // swingarm
    box(0.55, 0.1, 0.1, chrome, -0.65, 0.78, 0.22, 0.25)  // exhaust
  );

  // Number plate with a canvas texture.
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.fillStyle = '#fff'; g.fillRect(0, 0, 64, 64);
  g.fillStyle = '#111'; g.font = 'bold 44px system-ui'; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.fillText(number, 32, 36);
  const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.34), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c) }));
  plate.position.set(-0.45, 0.95, 0.18);
  body.add(plate);

  // Rider
  const rider = new THREE.Group();
  const suit = mat(color, { roughness: 0.7 });
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.5, 4, 8), suit);
  torso.position.set(-0.2, 1.75, 0);
  torso.rotation.z = -0.45;
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.24, 16, 12), mat('#f4f4f8', { metalness: 0.3, roughness: 0.2 }));
  helmet.position.set(0.05, 2.22, 0);
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, 0.34), mat('#0a0a12', { metalness: 0.9, roughness: 0.1 }));
  visor.position.set(0.24, 2.22, 0);
  const stripe = new THREE.Mesh(new THREE.TorusGeometry(0.245, 0.03, 6, 20), suit);
  stripe.position.copy(helmet.position);
  stripe.rotation.y = Math.PI / 2;
  const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 0.55, 4, 6), suit);
  arm.position.set(0.28, 1.7, 0.25);
  arm.rotation.z = -1.0;
  const arm2 = arm.clone(); arm2.position.z = -0.25;
  const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 0.55, 4, 6), mat('#1c1c28'));
  leg.position.set(-0.15, 1.15, 0.2);
  leg.rotation.z = 0.9;
  const leg2 = leg.clone(); leg2.position.z = -0.2;
  rider.add(torso, helmet, visor, stripe, arm, arm2, leg, leg2);
  rider.traverse((m) => m.isMesh && (m.castShadow = true));
  body.add(rider);

  // Turbo flame
  const flame = new THREE.Mesh(
    new THREE.ConeGeometry(0.12, 0.7, 8),
    new THREE.MeshBasicMaterial({ color: '#ff8a00', transparent: true, opacity: 0.9 })
  );
  flame.rotation.z = Math.PI / 2 + 0.25;
  flame.position.set(-1.25, 0.66, 0.22);
  flame.visible = false;
  body.add(flame);

  return { root, body, rider, rear, front, flame };
}
