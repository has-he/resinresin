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

async function imagePNG(page: Page, depth=false, transparent=false) {
  const base64=await page.evaluate(({depth,transparent})=>{
    const c=document.createElement('canvas');c.width=192;c.height=144;
    const ctx=c.getContext('2d')!;
    if(depth) {
      const gradient=ctx.createRadialGradient(96,72,0,96,72,90);gradient.addColorStop(0,'white');gradient.addColorStop(1,'black');ctx.fillStyle=gradient;ctx.fillRect(0,0,192,144);
    } else {
      const gradient=ctx.createLinearGradient(0,0,192,144);gradient.addColorStop(0,'#47759c');gradient.addColorStop(1,'#dcad6c');ctx.fillStyle=gradient;ctx.fillRect(0,0,192,144);
      ctx.strokeStyle='#202c32';ctx.lineWidth=3;
      for(let i=0;i<12;i++){ctx.beginPath();ctx.arc(96,72,10+i*9,0,Math.PI*2);ctx.stroke();}
    }
    if(transparent){ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.arc(96,72,29,0,Math.PI*2);ctx.fill();}
    return c.toDataURL('image/png').split(',')[1];
  },{depth,transparent});
  return Buffer.from(base64,'base64');
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

test('quality mode accumulates real samples, pauses, exports its native render, and supports an imported procedural GLB', async ({ page }) => {
  test.setTimeout(240_000);
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await page.setViewportSize({ width: 460, height: 720 });
  await ready(page);
  const state = () => page.evaluate(() => (window as unknown as { __resin: {renderState: {mode: string; phase: string; samples: number}} }).__resin.renderState);
  await page.locator('.mobile-tabs [data-panel=material]').click();
  await page.locator('#quality-scale').selectOption('0.5');
  await page.locator('#quality-samples').selectOption('128');
  await page.locator('.mobile-tabs [data-panel=canvas]').click();
  const preview = await pixels(page);
  const canvasSize = await page.locator('#stage canvas').evaluate((c: HTMLCanvasElement) => ({ width: c.width, height: c.height }));
  await page.locator('#quality-mode').click();
  await page.waitForFunction(() => (window as unknown as { __resin: { renderState: {samples: number} } }).__resin.renderState.samples >= 2, undefined, { timeout: 100_000 });
  await page.getByRole('button', { name: 'Pause quality render', exact: true }).click();
  expect((await state()).phase).toBe('paused');
  const paused = (await state()).samples;
  const traced = await pixels(page);
  expect(new Set(traced).size).toBeGreaterThan(70);
  expect(difference(preview, traced)).toBeGreaterThan(2);
  await page.waitForTimeout(300);
  expect((await state()).samples).toBe(paused);
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export render', exact: true }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  const png = Buffer.concat(chunks);
  expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
  expect(png.readUInt32BE(16)).toBe(Math.floor(canvasSize.width * 0.5));
  expect(png.readUInt32BE(20)).toBe(Math.floor(canvasSize.height * 0.5));
  await expect(page.getByRole('button', {name:'Export render',exact:true})).toBeEnabled();
  await page.getByRole('button', {name:'Resume quality render',exact:true}).click();
  await page.waitForFunction(previous => (window as unknown as { __resin: {renderState: {samples: number}} }).__resin.renderState.samples > previous, paused);
  await page.getByRole('button', {name:'Return to preview',exact:true}).click();
  expect((await state()).mode).toBe('preview');
  // Trace both reflection settings: the specimen above was rendered with glare off.
  await page.locator('.mobile-tabs [data-panel=material]').click();
  await page.getByRole('switch', {name:'Surface reflections'}).check();
  await setSlider(page, 'reflectionStrength', '1');
  await page.locator('.mobile-tabs [data-panel=canvas]').click();
  const photo=await imagePNG(page);
  await page.locator('#file-input').setInputFiles([{name:'relief-scene.png',mimeType:'image/png',buffer:photo},{name:'quality-sculpture.glb',mimeType:'model/gltf-binary',buffer:tetrahedronGLB()}]);
  await expect(page.locator('#layers [role=listitem]')).toHaveCount(3);
  await page.locator('.layer-select').filter({hasText:'relief-scene.png'}).click();
  await renderedAfter(page,()=>page.locator('#emboss-image').click());
  await page.locator('.layer-select').filter({hasText:'quality-sculpture.glb'}).click();
  await page.locator('#layer-material').selectOption('bark');
  await page.locator('.mobile-tabs [data-panel=material]').click();
  await page.locator('#resin-shape').selectOption('ball');
  await setSlider(page,'resinRotationX','17');
  await page.locator('.mobile-tabs [data-panel=canvas]').click();
  await page.locator('#quality-mode').click();
  await page.waitForFunction(() => (window as unknown as { __resin: {renderState: {samples: number}} }).__resin.renderState.samples >= 1, undefined, { timeout: 90_000 });
  expect((await state()).mode).toBe('quality');
  expect(new Set(await pixels(page)).size).toBeGreaterThan(40);
  // Composition exploration also cancels the old accumulated render.
  const oldSeed=await page.evaluate(()=>(window as unknown as {__resin:{settings:{seed:number}}}).__resin.settings.seed);
  await page.locator('#next-composition-canvas').click();
  await expect(page.locator('#next-composition-canvas')).toBeEnabled();
  expect(await page.evaluate(()=>(window as unknown as {__resin:{settings:{seed:number}}}).__resin.settings.seed)).not.toBe(oldSeed);
  // A camera gesture must continue to leave editing in Preview.
  await page.locator('#reset-view').click();
  await expect(page.locator('#preview-mode')).toHaveAttribute('aria-pressed','true');
  expect((await state()).mode).toBe('preview');
  expect(errors).toEqual([]);
});


test('surface reflections are optional, strength zero suppresses glare, and refraction remains active', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', e => errors.push(e.message));
  page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
  await ready(page);
  const toggle = page.getByRole('switch', {name:'Surface reflections'});
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('#reflectionStrength')).toBeDisabled();
  const without = await pixels(page);
  const brightness = () => page.locator('#stage canvas').evaluate((source: HTMLCanvasElement) => {
    const copy = document.createElement('canvas'); copy.width = source.width; copy.height = source.height;
    const context = copy.getContext('2d')!; context.drawImage(source, 0, 0);
    const {data} = context.getImageData(0, 0, copy.width, copy.height);
    let bright = 0, total = 0;
    for (let i = 0; i < data.length; i += 16) {
      if (data[i] > 225 && data[i+1] > 225 && data[i+2] > 210) bright++;
      total++;
    }
    return bright / total;
  });
  const originalBright = await brightness();
  await renderedAfter(page, () => toggle.check());
  await expect(page.locator('#reflectionStrength')).toBeEnabled();
  await setSlider(page, 'reflectionStrength', '1');
  expect(difference(without, await pixels(page))).toBeGreaterThan(2);
  expect(await brightness()).toBeGreaterThan(originalBright + 0.0005);
  await setSlider(page, 'reflectionStrength', '0');
  expect(difference(without, await pixels(page))).toBeLessThan(0.5);
  // The glare switch must preserve the bending of light through the resin.
  await renderedAfter(page, async () => { await page.locator('#compare').hover(); await page.mouse.down(); });
  expect(difference(without, await pixels(page))).toBeGreaterThan(6);
  await renderedAfter(page, () => page.mouse.up());
  await renderedAfter(page, () => toggle.uncheck());
  await page.getByRole('button', {name:/Mineral bloom/}).click();
  await expect(toggle).not.toBeChecked();
  await expect(page.locator('#reflectionStrength')).toBeDisabled();
  expect(errors).toEqual([]);
});


test('image depth maps create real relief, smoothing/inversion work, and the resin follows the geometry',async({page})=>{
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await ready(page);
  await page.locator('#file-input').setInputFiles({name:'relief-photo.png',mimeType:'image/png',buffer:await imagePNG(page,false,true)});
  await expect(page.locator('#layers [role=listitem]')).toHaveCount(2);
  await expect(page.getByRole('switch',{name:'Physical relief'})).toBeDisabled();
  await expect(page.locator('#upload')).toBeEnabled();
  const flat=await pixels(page);
  await renderedAfter(page,()=>page.getByRole('button',{name:'Quick emboss',exact:true}).click());
  await expect(page.getByRole('switch',{name:'Physical relief'})).toBeChecked();
  await expect(page.locator('.depth-explanation')).toContainText('not inferred 3D depth');
  const geometry=()=>page.evaluate(()=>(window as unknown as {__resin:{reliefLayers:{vertices:number;source:string;heightRange:number[]}[]}}).__resin.reliefLayers[0]);
  expect((await geometry()).vertices).toBeGreaterThan(10000);
  expect(difference(flat,await pixels(page))).toBeGreaterThan(2);
  const chooserPromise=page.waitForEvent('filechooser');await page.getByRole('button',{name:'Upload depth',exact:true}).click();
  await (await chooserPromise).setFiles({name:'aligned-depth.png',mimeType:'image/png',buffer:await imagePNG(page,true)});
  await expect(page.locator('.depth-source')).toHaveText('aligned-depth.png');
  expect((await geometry()).source).toBe('depth');
  const height=(await geometry()).heightRange;
  expect(height[1]-height[0]).toBeGreaterThan(0.4);
  await setSlider(page,'relief-amount','1.2');await setSlider(page,'relief-smoothing','0.9');
  const raised=await pixels(page);
  await renderedAfter(page,()=>page.locator('#relief-invert').check());
  expect(difference(raised,await pixels(page))).toBeGreaterThan(1);
  await setSlider(page,'wrap','0');const independent=await pixels(page);
  await setSlider(page,'wrap','1');expect(difference(independent,await pixels(page))).toBeGreaterThan(1);
  await renderedAfter(page,async()=>{await page.locator('#compare').hover();await page.mouse.down();});
  const center=await page.locator('#stage canvas').evaluate((source:HTMLCanvasElement)=>{const c=document.createElement('canvas');c.width=source.width;c.height=source.height;const ctx=c.getContext('2d')!;ctx.drawImage(source,0,0);return Array.from(ctx.getImageData(Math.floor(c.width/2),Math.floor(c.height/2),1,1).data);});
  // Both the front and backing must retain the PNG's transparent cutout.
  expect(center[0]+center[1]+center[2]).toBeLessThan(60);
  await renderedAfter(page,()=>page.mouse.up());
  await renderedAfter(page,()=>page.getByRole('switch',{name:'Physical relief'}).uncheck());
  expect(difference(flat,await pixels(page))).toBeLessThan(1);
  await page.screenshot({path:'.local/relief-flat.png'});
  await renderedAfter(page,()=>page.getByRole('switch',{name:'Physical relief'}).check());
  await page.screenshot({path:'.local/relief-raised.png'});
  expect(errors).toEqual([]);
});


test('composition explorer changes arrangements, restores previous layouts, and keeps lighting and the camera fixed',async({page})=>{
  test.setTimeout(150_000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await ready(page);
  await page.locator('#light').selectOption('sunset');await setSlider(page,'exposure','1.2');await setSlider(page,'lightRotation','82');
  const settings=()=>page.evaluate(()=>(window as unknown as {__resin:{settings:Record<string,number|string|boolean>}}).__resin.settings);
  const composition=()=>page.evaluate(()=>(window as unknown as {__resin:{composition:{canPrevious:boolean;camera:{position:number[];target:number[]};poses:{name:string;x:number;z:number;scale:number;depth:number;rotation:number;tilt:number}[]}}}).__resin.composition);
  const beforeSettings=await settings(),beforeCamera=(await composition()).camera,beforePixels=await pixels(page);
  await expect(page.locator('#previous-composition-canvas')).toBeDisabled();
  await renderedAfter(page,()=>page.locator('#next-composition-canvas').click());
  await expect(page.locator('#next-composition-canvas')).toBeEnabled();
  const next=await settings(),{seed:oldSeed,...calibration}=beforeSettings,{seed:newSeed,...afterCalibration}=next;
  expect(newSeed).not.toBe(oldSeed);expect(afterCalibration).toEqual(calibration);
  const afterCamera=(await composition()).camera;
  beforeCamera.position.forEach((v,i)=>expect(afterCamera.position[i]).toBeCloseTo(v,8));beforeCamera.target.forEach((v,i)=>expect(afterCamera.target[i]).toBeCloseTo(v,8));
  expect(difference(beforePixels,await pixels(page))).toBeGreaterThan(2);
  await renderedAfter(page,()=>page.locator('#previous-composition-canvas').click());
  await expect(page.locator('#previous-composition-canvas')).toBeDisabled();
  expect((await settings()).seed).toBe(oldSeed);expect(difference(beforePixels,await pixels(page))).toBeLessThan(0.5);
  await page.locator('#file-input').setInputFiles([{name:'composition-photo.png',mimeType:'image/png',buffer:await imagePNG(page)},{name:'composition-model.glb',mimeType:'model/gltf-binary',buffer:tetrahedronGLB()}]);
  await expect(page.locator('#layers [role=listitem]')).toHaveCount(3);await expect(page.locator('#next-composition-canvas')).toBeEnabled();
  const originalPoses=(await composition()).poses;
  const enterSeed=async(seed:number)=>{await page.locator('#composition-seed').fill(String(seed));await page.locator('#composition-seed').press('Enter');await page.waitForFunction(value=>(window as unknown as {__resin:{settings:{seed:number}}}).__resin.settings.seed===value,seed);await expect(page.locator('#next-composition-canvas')).toBeEnabled();};
  await enterSeed(1234);const first=(await composition()).poses;expect(first).not.toEqual(originalPoses);
  first.forEach((pose,i)=>{expect(pose.depth).toBe(originalPoses[i].depth);expect(pose.tilt).toBe(originalPoses[i].tilt);});
  await enterSeed(4321);expect((await composition()).poses).not.toEqual(first);
  await enterSeed(1234);expect((await composition()).poses).toEqual(first);
  await page.locator('#keep-uploaded').check();await enterSeed(9001);expect((await composition()).poses).toEqual(first);
  const {seed:finalSeed,...finalCalibration}=await settings();expect(finalCalibration).toEqual(calibration);
  await page.locator('#project-name').focus();await page.keyboard.press('r');expect((await settings()).seed).toBe(finalSeed);
  await page.locator('#stage canvas').click({position:{x:25,y:25}});await page.keyboard.press('r');await expect(page.locator('#next-composition-canvas')).toBeEnabled();
  await page.waitForFunction(value=>(window as unknown as {__resin:{settings:{seed:number}}}).__resin.settings.seed!==value,finalSeed);
  expect((await composition()).poses).toEqual(first);
  await page.screenshot({path:'.local/composition-explorer.png'});
  expect(errors).toEqual([]);
});

test('a deformed resin ball rotates around stationary sources and closes a full-turn loop',async({page})=>{
  test.setTimeout(180_000);
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  await page.setViewportSize({width:1200,height:850});await ready(page);
  await page.locator('#file-input').setInputFiles([{name:'inside-ball.png',mimeType:'image/png',buffer:await imagePNG(page)},{name:'inside-ball.glb',mimeType:'model/gltf-binary',buffer:tetrahedronGLB()}]);
  await expect(page.locator('#layers [role=listitem]')).toHaveCount(3);
  await page.locator('#resin-shape').selectOption('ball');
  await setSlider(page,'ballScale','1.1');
  const pixelsBefore=await pixels(page);
  await setSlider(page,'ballDeformation','2');await setSlider(page,'ballTwist','2');
  expect(difference(pixelsBefore,await pixels(page))).toBeGreaterThan(1);
  await setSlider(page,'resinRotationX','17');await setSlider(page,'resinRotationZ','-23');
  const motion=()=>page.evaluate(()=>(window as unknown as {__resin:{resinMotion:{phase:number;playing:boolean;geometry:number[];matrix:number[]}}}).__resin.resinMotion);
  const composition=()=>page.evaluate(()=>(window as unknown as {__resin:{composition:{camera:{position:number[];target:number[]};poses:unknown;canPrevious:boolean;keepUploaded:boolean}}}).__resin.composition);
  const calibration=()=>page.evaluate(()=>(window as unknown as {__resin:{settings:unknown}}).__resin.settings);
  const fixed=await composition(),settings=await calibration(),shape=(await motion()).geometry;
  const expectFixed=async()=>{const current=await composition();expect(current.poses).toEqual(fixed.poses);expect(current.canPrevious).toBe(fixed.canPrevious);expect(current.keepUploaded).toBe(fixed.keepUploaded);for(const key of ['position','target'] as const)fixed.camera[key].forEach((value,i)=>expect(current.camera[key][i]).toBeCloseTo(value,10));};
  await setSlider(page,'resin-loop-phase','0');const start=await pixels(page),matrix=(await motion()).matrix;
  await setSlider(page,'resin-loop-phase','90');expect(difference(start,await pixels(page))).toBeGreaterThan(1);
  await expectFixed();expect(await calibration()).toEqual(settings);expect((await motion()).geometry).toEqual(shape);
  await setSlider(page,'resin-loop-phase','360');expect((await motion()).matrix).toEqual(matrix);expect(difference(start,await pixels(page))).toBeLessThan(0.5);
  await page.locator('#resin-loop-axis').selectOption('z');await setSlider(page,'resin-loop-phase','120');expect(difference(start,await pixels(page))).toBeGreaterThan(1);
  await setSlider(page,'resin-loop-phase','360');expect(difference(start,await pixels(page))).toBeLessThan(0.5);
  await page.locator('#resin-loop-duration').selectOption('2');
  await page.locator('#resin-loop-canvas').click();
  await page.waitForFunction(()=>(window as unknown as {__resin:{resinMotion:{playing:boolean;phase:number}}}).__resin.resinMotion.playing&&(window as unknown as {__resin:{resinMotion:{phase:number}}}).__resin.resinMotion.phase>0.02);
  await page.locator('#resin-loop-canvas').click();expect((await motion()).playing).toBe(false);
  await expectFixed();expect(await calibration()).toEqual(settings);expect((await motion()).geometry).toEqual(shape);
  await page.screenshot({path:'.local/resin-ball.png'});
  await page.locator('#resin-loop-canvas').click();await page.locator('#preview-mode').click();expect((await motion()).playing).toBe(false);
  await page.locator('#resin-shape').selectOption('pool');await expect(page.locator('#resin-loop-canvas')).toBeHidden();await expect(page.locator('#wrap')).toBeVisible();
  await expectFixed();
  await page.setViewportSize({width:390,height:844});await page.locator('.mobile-tabs [data-panel=material]').click();
  await page.locator('#resin-shape').selectOption('ball');await page.locator('.mobile-tabs [data-panel=canvas]').click();
  await expect(page.locator('#resin-loop-canvas')).toBeVisible();expect(await page.evaluate(()=>document.body.scrollWidth)).toBeLessThanOrEqual(390);
  expect(errors).toEqual([]);
});
