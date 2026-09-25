// A locally painted reflection sky. Standard materials convolve this cube into
// rough reflections, lifting gunmetal edges without a runtime image download.
export function createEnvironment(THREE) {
  const size = 128;
  const faces = Array.from({ length: 6 }, (_, face) => {
    const canvas = document.createElement('canvas'); canvas.width = canvas.height = size;
    const context = canvas.getContext('2d');
    const gradient = context.createLinearGradient(0, 0, 0, size);
    if (face === 2) {
      gradient.addColorStop(0, '#bac5ce'); gradient.addColorStop(.5, '#d8dcd8'); gradient.addColorStop(1, '#bac5ce');
    } else if (face === 3) {
      gradient.addColorStop(0, '#656259'); gradient.addColorStop(.5, '#47483f'); gradient.addColorStop(1, '#656259');
    } else {
      gradient.addColorStop(0, '#b7c3ce'); gradient.addColorStop(.36, '#d7dbd3');
      gradient.addColorStop(.48, '#e9d5ad'); gradient.addColorStop(.52, '#aca28a');
      gradient.addColorStop(.65, '#787768'); gradient.addColorStop(1, '#656259');
    }
    context.fillStyle = gradient; context.fillRect(0, 0, size, size);
    if (face !== 2 && face !== 3) {
      // Broad panels of bright sky and dim industrial silhouettes give curved
      // steel barrels/engine housings readable, soft-edged reflections.
      const light = context.createRadialGradient(32, 45, 2, 32, 45, 42);
      light.addColorStop(0, face === 1 ? '#fff2d0ee' : '#edf1e4a0');
      light.addColorStop(1, '#e2d8b800');
      context.fillStyle = light; context.fillRect(0, 0, size, size);
      context.fillStyle = '#535c5550';
      for (let i = 0; i < 7; i++) {
        const height = 4 + ((i * 17 + face * 11) % 23);
        context.fillRect(i * 19, 71 - height, 9 + i % 4, height + 8);
      }
    }
    return canvas;
  });
  const texture = new THREE.CubeTexture(faces);
  texture.name = 'Procedural industrial reflection sky';
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.needsUpdate = true;
  return texture;
}
