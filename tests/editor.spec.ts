import { test, expect, type Page } from '@playwright/test';
import { Buffer } from 'node:buffer';

type Diagnostics = { ready: boolean; renderedFrames: number; layerCount: number };
const diagnostics = (page: Page) => page.evaluate(() => (window as unknown as { __resin: Diagnostics }).__resin);

async function ready(page: Page) {
  await page.goto('/');
  await page.waitForFunction(() => (window as unknown as { __resin?: Diagnostics }).__resin?.ready);
}
async function renderedAfter(page: Page, action: () => Promise<unknown>) {
  const before = (await diagnostics(page)).renderedFrames;
  await action();
  await page.waitForFunction(previous => (window as unknown as { __resin: Diagnostics }).__resin.renderedFrames > previous, before);
}
async function pixels(page: Page) {
  return page.locator('#stage canvas').evaluate((source: HTMLCanvasElement) => {
    const copy = document.createElement('canvas'); copy.width = 48; copy.height = 48;
    const context = copy.getContext('2d')!;
    context.drawImage(source, 0, 0, 48, 48);
    return Array.from(context.getImageData(0, 0, 48, 48).data);
  });
}
function difference(a: number[], b: number[]) {
  return a.reduce((sum, value, i) => sum + Math.abs(value - b[i]), 0) / a.length;
}
async function setSlider(page: Page, id: string, value: string) {
  await renderedAfter(page, () => page.locator(`#${id}`).evaluate((input: HTMLInputElement, v) => {
    input.value = v; input.dispatchEvent(new Event('input', { bubbles: true }));
  }, value));
}

// A self-contained, four-face GLB with an actual mesh and embedded binary buffer.
function tetrahedronGLB() {
  const positions = new Float32Array([-1,0,-1, 1,0,-1, 0,0,1, 0,1.7,0]);
  const indices = new Uint16Array([0,2,1, 0,1,3, 1,2,3, 2,0,3]);
  const binary = Buffer.concat([Buffer.from(positions.buffer), Buffer.from(indices.buffer)]);
  const json = {
    asset: { version: '2.0' }, scene: 0, scenes: [{ nodes: [0] }], nodes: [{ mesh: 0 }],
    meshes: [{ primitives: [{ attributes: { POSITION: 0 }, indices: 1, material: 0 }] }],
    materials: [{ pbrMetallicRoughness: { baseColorFactor: [0.8, 0.2, 0.12, 1], roughnessFactor: 0.7 } }],
    buffers: [{ byteLength: binary.length }],
    bufferViews: [{ buffer: 0, byteOffset: 0, byteLength: positions.byteLength }, { buffer: 0, byteOffset: positions.byteLength, byteLength: indices.byteLength }],
    accessors: [{ bufferView: 0, componentType: 5126, count: 4, type: 'VEC3', min: [-1,0,-1], max: [1,1.7,1] }, { bufferView: 1, componentType: 5123, count: 12, type: 'SCALAR' }],
  };
  let jsonBuffer = Buffer.from(JSON.stringify(json));
  jsonBuffer = Buffer.concat([jsonBuffer, Buffer.alloc((4 - jsonBuffer.length % 4) % 4, 0x20)]);
  const header = Buffer.alloc(12); header.writeUInt32LE(0x46546c67, 0); header.writeUInt32LE(2, 4); header.writeUInt32LE(28 + jsonBuffer.length + binary.length, 8);
  const jsonHeader = Buffer.alloc(8); jsonHeader.writeUInt32LE(jsonBuffer.length, 0); jsonHeader.writeUInt32LE(0x4e4f534a, 4);
  const binaryHeader = Buffer.alloc(8); binaryHeader.writeUInt32LE(binary.length, 0); binaryHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, jsonHeader, jsonBuffer, binaryHeader, binary]);
}

test('renders real refraction, changes presets and exports a valid high-resolution PNG', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await ready(page);
  const initial = await pixels(page);
  expect(new Set(initial).size).toBeGreaterThan(50);
  await renderedAfter(page, async () => { await page.locator('#compare').hover(); await page.mouse.down(); });
  const bare = await pixels(page);
  expect(difference(initial, bare)).toBeGreaterThan(6);
  await renderedAfter(page, () => page.mouse.up());
  await setSlider(page, 'ior', '1.95');
  expect(difference(initial, await pixels(page))).toBeGreaterThan(2);
  await renderedAfter(page, () => page.getByRole('button', { name: /Mineral bloom/ }).click());
  await expect(page.locator('#specimen-name')).toHaveText('Mineral bloom');
  expect(difference(initial, await pixels(page))).toBeGreaterThan(4);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export image' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toMatch(/\.png$/);
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const png = Buffer.concat(chunks);
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.readUInt32BE(16)).toBeGreaterThan(1200);
  expect(png.readUInt32BE(20)).toBeGreaterThan(900);
  expect(png.length).toBeGreaterThan(50_000);
  await expect(page.locator('#export')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('imports an image and a GLB together, transforms and textures a model, and handles missing glTF resources', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  await ready(page);
  const image = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 128; canvas.height = 128;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#4a7161'; context.fillRect(0, 0, 128, 128);
    context.fillStyle = '#d9aa60';
    for (let i = 0; i < 8; i++) context.fillRect(i * 16, 0, 8, 128);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const before = await pixels(page);
  await page.locator('#file-input').setInputFiles([
    { name: 'test-landscape.png', mimeType: 'image/png', buffer: Buffer.from(image, 'base64') },
    { name: 'test-sculpture.glb', mimeType: 'model/gltf-binary', buffer: tetrahedronGLB() },
  ]);
  await expect(page.locator('#layers [role=listitem]')).toHaveCount(3);
  await expect(page.locator('#layer-material')).toHaveValue('original');
  await expect(page.locator('#upload')).toBeEnabled();
  await setSlider(page, 'layer-scale', '1.7');
  expect(difference(before, await pixels(page))).toBeGreaterThan(10);
  await setSlider(page, 'layer-x', '0.7');
  await setSlider(page, 'layer-tilt', '25');
  const original = await pixels(page);
  await renderedAfter(page, () => page.locator('#layer-material').selectOption('mineral'));
  expect(difference(original, await pixels(page))).toBeGreaterThan(0.2);
  await expect(page.getByRole('button', { name: 'Show Forest floor' })).toBeVisible();
  await renderedAfter(page, () => page.getByRole('button', { name: 'Hide test-landscape.png' }).click());
  await renderedAfter(page, () => page.getByRole('button', { name: 'Show test-landscape.png' }).click());
  await page.getByRole('button', { name: 'Remove layer' }).click();
  await expect(page.locator('#layers [role=listitem]')).toHaveCount(2);
  const invalidGltf = { asset: { version: '2.0' }, buffers: [{ uri: 'missing.bin', byteLength: 36 }], bufferViews: [{ buffer: 0, byteLength: 36 }], accessors: [{ bufferView: 0, componentType: 5126, count: 3, type: 'VEC3', min: [0,0,0], max: [1,1,1] }], meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }], nodes: [{ mesh: 0 }], scenes: [{ nodes: [0] }], scene: 0 };
  await page.locator('#file-input').setInputFiles({ name: 'missing.gltf', mimeType: 'model/gltf+json', buffer: Buffer.from(JSON.stringify(invalidGltf)) });
  await expect(page.locator('#toast')).toContainText('Missing companion file');
  await expect(page.locator('#layers [role=listitem]')).toHaveCount(2);
  await expect(page.locator('#upload')).toBeEnabled();
  expect(errors).toEqual([]);
});

test('loads external glTF buffers, OBJ materials and textures, and STL geometry', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await ready(page);
  const glb = tetrahedronGLB();
  const length = glb.readUInt32LE(12);
  const gltf = JSON.parse(glb.subarray(20, 20 + length).toString());
  gltf.buffers[0].uri = 'geometry.bin';
  await page.locator('#file-input').setInputFiles([
    { name: 'external.gltf', mimeType: 'model/gltf+json', buffer: Buffer.from(JSON.stringify(gltf)) },
    { name: 'geometry.bin', mimeType: 'application/octet-stream', buffer: glb.subarray(28 + length) },
  ]);
  await expect(page.locator('#layers [role=listitem]')).toHaveCount(2);
  await expect(page.locator('#upload')).toBeEnabled();
  await setSlider(page, 'layer-x', '-1');
  const texture = await page.evaluate(() => {
    const canvas = document.createElement('canvas'); canvas.width = 16; canvas.height = 16;
    const context = canvas.getContext('2d')!;
    context.fillStyle = '#dca251'; context.fillRect(0, 0, 16, 16);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const obj = 'mtllib surface.mtl\no Triangle\nv -1 0 -1\nv 1 0 -1\nv 0 1 1\nvt 0 0\nvt 1 0\nvt 0.5 1\nusemtl Surface\nf 1/1 3/3 2/2';
  const before = await pixels(page);
  await page.locator('#file-input').setInputFiles([
    { name: 'triangle.obj', mimeType: 'text/plain', buffer: Buffer.from(obj) },
    { name: 'surface.mtl', mimeType: 'text/plain', buffer: Buffer.from('newmtl Surface\nKd 1 1 1\nmap_Kd gold.png') },
    { name: 'gold.png', mimeType: 'image/png', buffer: Buffer.from(texture, 'base64') },
  ]);
  await expect(page.locator('#layers [role=listitem]')).toHaveCount(3);
  await expect(page.locator('#layer-material')).toHaveValue('original');
  await expect(page.locator('#upload')).toBeEnabled();
  await setSlider(page, 'layer-scale', '2');
  expect(difference(before, await pixels(page))).toBeGreaterThan(0.4);
  const stl = `solid tetra
facet normal 0 1 0
outer loop
vertex -1 0 -1
vertex 0 0 1
vertex 1 0 -1
endloop
endfacet
facet normal 0 0 -1
outer loop
vertex -1 0 -1
vertex 1 0 -1
vertex 0 1 0
endloop
endfacet
facet normal 1 1 1
outer loop
vertex 1 0 -1
vertex 0 0 1
vertex 0 1 0
endloop
endfacet
facet normal -1 1 1
outer loop
vertex 0 0 1
vertex -1 0 -1
vertex 0 1 0
endloop
endfacet
endsolid tetra`;
  await page.locator('#file-input').setInputFiles({ name: 'tetra.stl', mimeType: 'model/stl', buffer: Buffer.from(stl) });
  await expect(page.locator('#layers [role=listitem]')).toHaveCount(4);
  await expect(page.locator('#layer-material')).toHaveValue('moss');
  await expect(page.locator('#upload')).toBeEnabled();
  await setSlider(page, 'layer-x', '1');
  await page.screenshot({ path: '.local/imported-models.png' });
  expect(errors).toEqual([]);
});

test('mobile panels remain usable without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await ready(page);
  await expect(page.locator('#stage')).toBeVisible();
  await page.locator('.mobile-tabs').getByRole('button', { name: 'Sources' }).click();
  await expect(page.locator('#upload')).toBeVisible();
  await page.locator('.mobile-tabs').getByRole('button', { name: 'Material' }).click();
  await expect(page.locator('#ior')).toBeVisible();
  await page.locator('.mobile-tabs').getByRole('button', { name: 'Canvas' }).click();
  await expect(page.locator('#stage')).toBeVisible();
  expect(await page.evaluate(() => document.body.scrollWidth)).toBeLessThanOrEqual(390);
  await page.screenshot({ path: '.local/mobile.png' });
});
