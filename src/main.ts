import './style.css';
import { ResinEngine, defaults, type Layer, type LayerMaterial, type Preset, type Settings, type RenderState } from './engine';
import { icon } from './icons';

const app = document.querySelector<HTMLDivElement>('#app')!;
app.innerHTML = `
  <header class="header">
    <a class="wordmark" href="./" aria-label="Resin home">resin<span>®</span></a>
    <span class="brand-note">A material<br>playground</span>
    <div class="header-divider"></div>
    <div class="project"><span class="project-dot"></span><input id="project-name" aria-label="Project name" value="Untitled specimen" maxlength="60"><span class="project-tag">STUDY 001</span></div>
    <div class="header-actions"><button id="about" class="text-button">${icon('info', 16)}<span>How it works</span></button><button id="export" class="primary-button">Export image ${icon('arrow', 16)}</button></div>
  </header>
  <nav class="mobile-tabs" aria-label="Editor panels"><button data-panel="content">${icon('layers', 15)} Sources</button><button data-panel="canvas" class="active">${icon('orbit', 15)} Canvas</button><button data-panel="material">${icon('sun', 15)} Material</button></nav>
  <main class="editor" data-panel="canvas">
    <aside class="sidebar content-panel" aria-label="Source layers">
      <div class="panel-intro"><span class="eyebrow">01 / COMPOSITION</span><h1>What’s inside.</h1><p>Small worlds, suspended.</p></div>
      <input id="depth-input" type="file" accept=".png,.jpg,.jpeg,.webp,.avif" hidden><input id="file-input" type="file" multiple accept=".png,.jpg,.jpeg,.webp,.avif,.glb,.gltf,.obj,.stl,.bin,.mtl" hidden>
      <button class="upload-zone" id="upload"><span class="upload-icon">${icon('plus', 23)}</span><strong>Add your material</strong><span>Drop images or 3D objects here</span><small>PNG, JPG, WEBP · GLB, GLTF, OBJ, STL</small></button>
      <div class="section-label"><span>SCENE LAYERS</span><span id="layer-count">01</span></div>
      <div id="layers" class="layer-list" role="list" aria-label="Scene layers"></div>
      <div id="layer-editor" class="layer-editor"></div>
      <div class="presets-section"><div class="section-label"><span>START SOMEWHERE</span><span>↙</span></div><div class="preset-grid">
        <button class="preset active" data-preset="forest" aria-pressed="true"><span class="preset-art forest-art"><i></i></span><span>Forest floor</span><small>01</small></button>
        <button class="preset" data-preset="mineral" aria-pressed="false"><span class="preset-art mineral-art"><i></i></span><span>Mineral bloom</span><small>02</small></button>
        <button class="preset" data-preset="amber" aria-pressed="false"><span class="preset-art amber-art"><i></i></span><span>Amber tide</span><small>03</small></button>
      </div></div>
      <div class="local-note">${icon('cube', 15)}<p>Your files stay in your browser.<br>No uploads. No account. Just play.</p></div>
    </aside>
    <section class="workspace" aria-label="Live canvas">
      <div class="workspace-heading"><div class="canvas-title"><span class="live-dot"></span>LIVE CANVAS</div><div class="render-mode" aria-label="Render mode"><button id="preview-mode" aria-pressed="true">Preview</button><button id="quality-mode" aria-pressed="false">Quality render ${icon('sun', 12)}</button></div></div>
      <div id="stage" class="stage">
        <div class="stage-top"><div><span class="stage-kicker">ORGANIC EXPLORATIONS</span><span class="stage-name" id="specimen-name">Forest floor</span></div><span class="stage-badge">REALTIME / WEBGL</span></div>
        <div class="loading" id="loading"><span class="loading-ring"></span><p>Pouring a little world…</p></div>
        <div class="stage-bottom"><span class="coordinate">SEED 0042 · FOREST STUDY</span><button id="fullscreen" class="canvas-icon" title="Toggle fullscreen" aria-label="Toggle fullscreen">${icon('expand', 17)}</button></div>
        <div id="quality-progress" class="quality-progress" hidden><span class="quality-indicator"></span><div><strong id="quality-state">Preparing light paths</strong><small id="quality-hint">Drag or edit to return to Preview.</small><progress id="quality-meter" max="256" value="0" aria-label="Quality render samples"></progress></div><button id="quality-pause" aria-label="Pause quality render" title="Pause quality render">${icon('pause', 14)}</button><button id="quality-cancel" aria-label="Return to preview" title="Return to preview">${icon('close', 15)}</button></div><div id="drop-overlay" class="drop-overlay" hidden>${icon('upload', 36)}<strong>Something new, suspended.</strong><span>Drop images, models, or both.</span></div>
      </div>
      <div class="canvas-toolbar"><div class="interaction-hint">${icon('orbit', 15)}<span>Drag to orbit <b>·</b> Scroll to explore</span></div><div class="canvas-actions"><button id="reset-view" class="tool-button" title="Reset camera" aria-label="Reset camera">${icon('reset', 16)}</button><button id="overview" class="tool-button" title="Frame the whole specimen" aria-label="Frame the whole specimen">${icon('expand', 14)}<span>Overview</span></button><button id="motion" class="tool-button" aria-pressed="false">${icon('play', 14)}<span>Orbit</span></button><span class="tool-divider"></span><button id="compare" class="tool-button compare-button" title="Hold to see the contents without resin. Shortcut: Space">${icon('compare', 16)}<span>Hold to compare</span></button></div></div>
      <div class="workspace-caption"><span>Nature, through a different lens.</span><span>MAKE SOMETHING UNEXPECTED ↗</span></div>
    </section>
    <aside class="sidebar material-panel" aria-label="Resin settings">
      <div class="panel-intro"><span class="eyebrow">02 / MATERIAL</span><h2>Shape the light.</h2><p>A little imperfection goes a long way.</p></div>
      <div class="material-card"><span class="glass-swatch"></span><div><strong>Organic resin</strong><span>Transmissive · procedural surface</span></div><span class="material-dot"></span></div>
      <details class="control-section" open><summary>Surface <span>01</span></summary><div class="control-content" id="surface-controls"></div></details>
      <details class="control-section" open><summary>Optics <span>02</span></summary><div class="control-content" id="optics-controls"></div><div class="reflection-settings"><label class="switch-row" for="reflections"><span>Surface reflections</span><input id="reflections" type="checkbox" role="switch" aria-describedby="reflection-hint"></label><p id="reflection-hint">Optional white highlights on the resin.</p><div id="reflection-control"></div></div></details>
      <details class="control-section" open><summary>Atmosphere <span>03</span></summary><div class="control-content"><label class="field-label" for="light">Lighting environment</label><div class="select-wrap"><select id="light"><option value="studio">Reference · overhead strip</option><option value="sunset">Warm afternoon</option></select>${icon('down', 13)}</div><div id="exposure-control"></div><div id="lighting-controls"></div><div class="color-control"><label for="tint">Resin tint</label><div><span id="tint-value">E3E9CD</span><input id="tint" type="color" value="#e3e9cd" aria-label="Resin tint"></div></div></div></details>
      <div class="quality-options"><label class="field-label" for="quality-scale">Quality render resolution</label><div class="select-wrap"><select id="quality-scale"><option value="1">100% · native resolution</option><option value="0.5">50% · faster accumulation</option></select>${icon('down', 13)}</div><label class="field-label" for="quality-samples">Sample target</label><div class="select-wrap"><select id="quality-samples"><option value="128">128 · quick study</option><option value="256" selected>256 · fine</option><option value="512">512 · cleaner export</option></select>${icon('down', 13)}</div><p>Quality traces through the 3D scene. Let samples accumulate, then export. Drag or edit to return to Preview.</p></div>
      <div class="seed-row"><div><span class="eyebrow">A HAPPY ACCIDENT</span><span>Seed <b id="seed-value">0042</b></span></div><button id="shuffle" class="shuffle-button" title="Generate another specimen" aria-label="Generate another specimen">${icon('shuffle', 19)}</button></div>
      <button id="reset-settings" class="text-button reset-settings">${icon('reset', 14)} Reset material</button>
    </aside>
  </main>
  <footer class="statusbar"><span><i class="status-dot"></i><span id="render-status">Initializing renderer</span></span><span class="footer-center">A study in light, matter & happy accidents.</span><span id="resolution">RESIN LAB / 0.3</span></footer>
  <div id="toast" class="toast" role="status" aria-live="polite" hidden></div>
  <dialog id="help"><button class="dialog-close" aria-label="Close help">${icon('close', 22)}</button><span class="eyebrow">WELCOME TO RESIN</span><h2>A small world.<br>A different lens.</h2><p>Encapsulate images and 3D objects in an uneven, light-bending resin surface. Everything is rendered on your device.</p><div class="help-steps"><p><b>01 &nbsp; Bring something in.</b>Drop images or models into the canvas. They can coexist as separate layers. Use self-contained GLB files for the easiest import. For glTF and OBJ, select the model and its .bin, .mtl and image files together. Draco-compressed GLBs aren’t supported yet.</p><p><b>02 &nbsp; Make it yours.</b>Select a layer to change its scale, depth, rotation or procedural material. For images, Upload depth creates relief geometry; Quick emboss is a brightness-based artistic shortcut, not AI depth estimation. Surface smoothing softens the resin curves. Follow image relief and Coating thickness adjust its cover. Re-enable the built-in specimen with its eye button. Adjust the resin on the right. Drag to orbit, scroll to zoom, and hold Space to compare.</p><p><b>03 &nbsp; Keep a little light.</b>Preview export saves a PNG at twice the canvas size, up to 4096 pixels. Quality export saves the current accumulated render at its actual rendering resolution. The editor and uploaded files last for this browser session; export before leaving.</p></div><p class="help-footnote">Preview uses fast screen-space transmission. Quality render follows multiple light bounces through the 3D scene and evaluates procedural colour at ray hits. It starts noisy and improves with samples; sharp caustics remain difficult. Surface reflections are optional and off by default; adjust their strength under Optics. Turning them off suppresses surface glare while retaining refraction and lighting on the contents. Colour dispersion is currently a Preview effect. Neither mode adds missing detail to uploaded images.</p><button id="start-creating" class="primary-button">Back to the experiment ${icon('arrow', 16)}</button></dialog>
`;

const $ = <T extends HTMLElement = HTMLElement>(selector: string) => document.querySelector<T>(selector)!;
let engine: ResinEngine;
let exporting = false;
let depthTargetId: string | null = null;
let selectedId = 'specimen';
let toastTimer: ReturnType<typeof setTimeout>;
function toast(message: string, error = false) {
  clearTimeout(toastTimer);
  const element = $('#toast');
  element.textContent = message;
  element.classList.toggle('error', error);
  element.hidden = false;
  toastTimer = setTimeout(() => element.hidden = true, error ? 12000 : 4500);
}

interface SliderOptions {
  id: string; label: string; min: number; max: number; step: number; value: number;
  format?: (value: number) => string; hint?: string; change: (value: number) => void;
}
function slider(parent: HTMLElement, options: SliderOptions) {
  const wrap = document.createElement('div'); wrap.className = 'slider-control';
  const label = document.createElement('label'); label.htmlFor = options.id;
  const labelText = document.createElement('span'); labelText.textContent = options.label;
  if (options.hint) { labelText.title = options.hint; labelText.className = 'has-hint'; }
  const output = document.createElement('output'); output.htmlFor = options.id;
  const input = document.createElement('input');
  input.type = 'range'; input.id = options.id;
  input.min = String(options.min); input.max = String(options.max); input.step = String(options.step); input.value = String(options.value);
  const update = () => {
    const value = Number(input.value);
    output.value = options.format?.(value) ?? value.toFixed(2);
    input.style.setProperty('--fill', `${(value - options.min) / (options.max - options.min) * 100}%`);
  };
  input.addEventListener('input', () => { update(); options.change(Number(input.value)); });
  update(); label.append(labelText, output); wrap.append(label, input); parent.append(wrap);
}

function renderControls() {
  for (const id of ['#surface-controls', '#optics-controls', '#exposure-control', '#lighting-controls', '#reflection-control']) $(id).replaceChildren();
  const definitions: [keyof Settings, string, string, number, number, number, string?][] = [
    ['distortion', 'Surface relief', '#surface-controls', 0, 1.5, 0.01, 'Changes the depth of the folds and the optical thickness.'],
    ['smoothing', 'Surface smoothing', '#surface-controls', 0, 1, 0.01, 'Softens narrow lips and channels without blurring the contents.'],
    ['frequency', 'Fold frequency', '#surface-controls', 0.4, 2.5, 0.01],
    ['roughness', 'Roughness', '#surface-controls', 0, 0.35, 0.005],
    ['imperfections', 'Clouding & inclusions', '#surface-controls', 0, 1, 0.01, 'Adds patches of surface roughness and small suspended inclusions.'],
    ['ior', 'Refractive index', '#optics-controls', 1, 2.2, 0.01, '1.00 is air. Around 1.46–1.56 is typical for clear resin.'],
    ['dispersion', 'Dispersion · preview', '#optics-controls', 0, 0.8, 0.01, 'Separates wavelengths subtly at the edges.'],
    ['wrap', 'Follow image relief', '#surface-controls', 0, 1, 0.01, 'Conforms the resin to enabled image-relief layers.'],
    ['coatThickness', 'Coating thickness', '#surface-controls', 0.12, 0.7, 0.01],
    ['reflectionStrength', 'Reflection strength', '#reflection-control', 0, 1, 0.01],
    ['exposure', 'Exposure', '#exposure-control', 0.4, 2, 0.01],
    ['lightRotation', 'Light direction', '#lighting-controls', 0, 360, 1],
    ['keyLight', 'Key light intensity', '#lighting-controls', 0, 6, 0.05],
  ];
  for (const [key, label, parent, min, max, step, hint] of definitions) {
    slider($(parent), { id: key, label, min, max, step, value: Number(engine.settings[key]), hint,
      change: value => engine.set(key, value as never) });
  }
  syncReflectionControls();
  $('#tint-value').textContent = engine.settings.tint.slice(1).toUpperCase();
  $<HTMLInputElement>('#tint').value = engine.settings.tint;
  $<HTMLSelectElement>('#light').value = engine.settings.light;
  $('#seed-value').textContent = String(engine.settings.seed).padStart(4, '0');
  $('.coordinate').textContent = `SEED ${String(engine.settings.seed).padStart(4, '0')} · ${engine.settings.preset.toUpperCase()} STUDY`;
  document.querySelectorAll<HTMLButtonElement>('.preset').forEach(button => {
    const active = button.dataset.preset === engine.settings.preset;
    button.classList.toggle('active', active); button.setAttribute('aria-pressed', String(active));
  });
}

function syncReflectionControls() {
  $<HTMLInputElement>('#reflections').checked = engine.settings.reflections;
  $<HTMLInputElement>('#reflectionStrength').disabled = !engine.settings.reflections;
  $('#reflection-control').classList.toggle('is-disabled', !engine.settings.reflections);
}

function updateRenderState(state: RenderState) {
  const quality = state.mode === 'quality';
  $('#quality-progress').hidden = !quality;
  $('#quality-mode').setAttribute('aria-pressed', String(quality));
  $('#preview-mode').setAttribute('aria-pressed', String(!quality));
  $('.stage-badge').textContent = quality ? 'PROGRESSIVE / PATH TRACED' : 'REALTIME / WEBGL';
  const text = state.phase === 'preparing' ? 'Preparing geometry & light paths…'
    : state.phase === 'complete' ? `Render complete · ${Math.floor(state.samples)} samples`
    : `${state.phase === 'paused' ? 'Paused' : state.samples < 1 ? 'Compiling & tracing' : 'Refining light'} · ${Math.floor(state.samples)} / ${state.target}`;
  $('#quality-state').textContent = text;
  $<HTMLProgressElement>('#quality-meter').max = state.target;
  $<HTMLProgressElement>('#quality-meter').value = state.samples;
  $('#quality-progress').classList.toggle('is-paused', state.phase === 'paused' || state.phase === 'complete');
  const pause = $<HTMLButtonElement>('#quality-pause');
  pause.disabled = state.phase === 'preparing' || state.phase === 'complete';
  pause.innerHTML = icon(state.phase === 'paused' ? 'play' : 'pause', 14);
  pause.setAttribute('aria-label', state.phase === 'paused' ? 'Resume quality render' : 'Pause quality render');
  $('#render-status').textContent = quality ? text : 'WebGL active · local rendering';
  const exportButton = $<HTMLButtonElement>('#export');
  exportButton.disabled = exporting || quality && state.samples < 1;
  if (!exporting) exportButton.innerHTML = `${quality ? 'Export render' : 'Export image'} ${icon('arrow', 16)}`;
  if (quality) {
    $('#motion').setAttribute('aria-pressed', 'false');
    $('#motion').innerHTML = `${icon('play', 14)}<span>Orbit</span>`;
  }
}

function renderLayers() {
  $('#layer-count').textContent = String(engine.layers.length).padStart(2, '0');
  const list = $('#layers'); list.replaceChildren();
  for (const layer of engine.layers) {
    const row = document.createElement('div'); row.className = 'layer';
    row.classList.toggle('selected', selectedId === layer.id);
    row.classList.toggle('is-hidden', !layer.visible);
    row.setAttribute('role', 'listitem');
    const select = document.createElement('button'); select.className = 'layer-select';
    select.innerHTML = `<span class="layer-icon ${layer.kind}">${icon(layer.kind === 'specimen' ? 'leaf' : layer.kind === 'image' ? 'image' : 'cube', 17)}</span><span class="layer-info"><strong></strong><small></small></span>`;
    select.querySelector('strong')!.textContent = layer.name;
    select.querySelector('small')!.textContent = layer.kind === 'specimen' ? 'Procedural specimen' : layer.kind === 'image' ? 'Image plane' : '3D object';
    select.title = layer.name; select.setAttribute('aria-pressed', String(selectedId === layer.id));
    select.addEventListener('click', () => { selectedId = layer.id; renderLayers(); });
    const toggle = document.createElement('button'); toggle.className = 'layer-action';
    toggle.innerHTML = icon(layer.visible ? 'eye' : 'hidden', 16);
    toggle.title = `${layer.visible ? 'Hide' : 'Show'} ${layer.name}`;
    toggle.setAttribute('aria-label', toggle.title);
    toggle.addEventListener('click', () => { layer.visible = !layer.visible; engine.updateLayer(layer); renderLayers(); });
    row.append(select, toggle); list.append(row);
  }
  renderLayerEditor();
}

function renderLayerEditor() {
  const editor = $('#layer-editor'); editor.replaceChildren();
  const layer = engine.layers.find(l => l.id === selectedId);
  if (!layer) return;
  if (layer.kind === 'specimen') {
    slider(editor, { id: 'detail', label: 'Procedural detail', min: 0.5, max: 3, step: 0.05, value: engine.settings.detail,
      change: value => engine.set('detail', value) });
    const note = document.createElement('p'); note.className = 'micro-note';
    note.innerHTML = `${icon('leaf', 12)} Geometry + procedural colour & grain.`; editor.append(note);
    return;
  }
  if (layer.relief) {
    const relief=layer.relief;
    const panel=document.createElement('div'); panel.className='relief-editor';
    panel.innerHTML=`<div class="selected-label">IMAGE → PHYSICAL RELIEF</div><div class="relief-actions"><button id="upload-depth">${icon('layers',13)} Upload depth</button><button id="emboss-image">${icon('sun',13)} Quick emboss</button></div><p class="depth-source"></p><label class="switch-row" for="relief-enabled"><span>Physical relief</span><input id="relief-enabled" type="checkbox" role="switch"></label><p class="micro-note depth-explanation"></p><div id="relief-controls"></div>`;
    panel.querySelector('.depth-source')!.textContent=relief.sourceName;
    panel.querySelector('.depth-explanation')!.textContent=relief.sourceKind==='emboss'?'Emboss uses image brightness, not inferred 3D depth.':relief.hasMap?'White raises the surface. Use an aligned greyscale depth image.':'Upload a depth map, or try an artistic brightness emboss.';
    const toggle=panel.querySelector<HTMLInputElement>('#relief-enabled')!; toggle.checked=relief.settings.enabled; toggle.disabled=!relief.hasMap;
    toggle.addEventListener('change',()=>{engine.setRelief(layer,'enabled',toggle.checked);renderLayerEditor();});
    panel.querySelector('#upload-depth')!.addEventListener('click',()=>{depthTargetId=layer.id;$<HTMLInputElement>('#depth-input').click();});
    panel.querySelector('#emboss-image')!.addEventListener('click',()=>{engine.embossImage(layer);renderLayerEditor();toast('Brightness emboss generated. Upload depth for more accurate geometry.');});
    editor.append(panel);
    if (relief.hasMap) {
      const controls=panel.querySelector<HTMLElement>('#relief-controls')!;
      slider(controls,{id:'relief-amount',label:'Relief depth',min:0,max:1.6,step:0.01,value:relief.settings.amount,change:value=>engine.setRelief(layer,'amount',value)});
      slider(controls,{id:'relief-smoothing',label:'Depth smoothing',min:0,max:1,step:0.01,value:relief.settings.smoothing,change:value=>engine.setRelief(layer,'smoothing',value)});
      const invert=document.createElement('label');invert.className='relief-invert';invert.innerHTML='<input type="checkbox" id="relief-invert"> Invert depth';
      invert.querySelector('input')!.checked=relief.settings.invert;
      invert.querySelector('input')!.addEventListener('change',event=>engine.setRelief(layer,'invert',(event.target as HTMLInputElement).checked));controls.append(invert);
    }
  }
  const title = document.createElement('div'); title.className = 'selected-label'; title.innerHTML = 'LAYER PROPERTIES';
  editor.append(title);
  slider(editor, { id: 'layer-scale', label: 'Scale', min: 0.1, max: 3, step: 0.01, value: layer.scale, format: v => `${v.toFixed(2)}×`,
    change: value => { layer.scale = value; engine.updateLayer(layer); } });
  slider(editor, { id: 'layer-depth', label: 'Vertical position', min: -1.35, max: 0.3, step: 0.01, value: layer.depth,
    change: value => { layer.depth = value; engine.updateLayer(layer); } });
  slider(editor, { id: 'layer-x', label: 'Left / right', min: -3, max: 3, step: 0.01, value: layer.x,
    change: value => { layer.x = value; engine.updateLayer(layer); } });
  slider(editor, { id: 'layer-z', label: 'Front / back', min: -3, max: 3, step: 0.01, value: layer.z,
    change: value => { layer.z = value; engine.updateLayer(layer); } });
  slider(editor, { id: 'layer-rotation', label: 'Rotation', min: -180, max: 180, step: 1, value: layer.rotation, format: v => `${v}°`,
    change: value => { layer.rotation = value; engine.updateLayer(layer); } });
  if (layer.kind === 'model') {
    slider(editor, { id: 'layer-tilt', label: 'Tilt', min: -180, max: 180, step: 1, value: layer.tilt, format: v => `${v}°`,
      change: value => { layer.tilt = value; engine.updateLayer(layer); } });
    const label = document.createElement('label'); label.className = 'field-label'; label.htmlFor = 'layer-material'; label.textContent = 'Surface material';
    const wrap = document.createElement('div'); wrap.className = 'select-wrap';
    wrap.innerHTML = `<select id="layer-material"><option value="original">Original materials</option><option value="moss">Procedural moss</option><option value="mineral">Procedural mineral</option><option value="bark">Procedural bark</option></select>${icon('down', 13)}`;
    const select = wrap.querySelector('select')!; select.value = layer.material;
    select.addEventListener('change', () => engine.setLayerMaterial(layer, select.value as LayerMaterial));
    editor.append(label, wrap);
    slider(editor, { id: 'detail', label: 'Procedural detail', min: 0.5, max: 3, step: 0.05, value: engine.settings.detail,
      change: value => engine.set('detail', value) });
  }
  const remove = document.createElement('button'); remove.className = 'remove-layer text-button'; remove.innerHTML = `${icon('trash', 13)} Remove layer`;
  remove.addEventListener('click', () => { engine.removeLayer(layer.id); selectedId = engine.layers.at(-1)!.id; renderLayers(); });
  editor.append(remove);
}

let importing = false;
async function importFiles(files: File[]) {
  if (!files.length || importing || !engine) return;
  importing = true;
  $('#upload').setAttribute('disabled', '');
  $('#render-status').textContent = 'Adding material…';
  let count = 0;
  const errors: string[] = [];
  try {
    await engine.importFiles(files, layer => {
      count++; selectedId = layer.id; renderLayers();
    }, error => errors.push(error));
    if (count) {
      renderLayers();
      if (window.innerWidth < 1050) changePanel('content');
    }
    if (errors.length) toast(errors.join('\n'), true);
    else if (count) toast(`${count === 1 ? 'Material' : `${count} materials`} added. Select a layer to shape it.`);
    else toast('No importable assets found. Include a model or image with its supporting files.', true);
  } catch (error) { toast(error instanceof Error ? error.message : 'Import failed.', true); }
  finally { importing = false; $('#upload').removeAttribute('disabled'); $('#render-status').textContent = 'WebGL active · local rendering'; }
}

function changePanel(panel: string) {
  $('.editor').dataset.panel = panel;
  document.querySelectorAll<HTMLElement>('[data-panel].mobile-tabs button, .mobile-tabs [data-panel]').forEach(button => {
    button.classList.toggle('active', button.dataset.panel === panel);
  });
}
document.querySelectorAll<HTMLElement>('.mobile-tabs [data-panel]').forEach(button => button.addEventListener('click', () => changePanel(button.dataset.panel!)));

const help = $<HTMLDialogElement>('#help');
$('#about').addEventListener('click', () => help.showModal());
$('.dialog-close').addEventListener('click', () => help.close());
$('#start-creating').addEventListener('click', () => help.close());
help.addEventListener('click', event => { if (event.target === help) { const r = help.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) help.close(); } });

// Let the shell paint before initializing the renderer.
requestAnimationFrame(() => {
  try {
    engine = new ResinEngine($('#stage'));
    $('#loading').hidden = true;
    $('#render-status').textContent = 'WebGL active · local rendering';
    engine.onFrame = () => {
      const canvas = engine.renderer.domElement;
      $('#resolution').textContent = `${canvas.width} × ${canvas.height} / INTERACTIVE`;
    };
    engine.onContextLost = () => {
      toast('The graphics context was lost. Reload to restart; uploaded files will need to be added again.', true);
      $('#render-status').textContent = 'Graphics context lost';
      $('#export').setAttribute('disabled', ''); $('#upload').setAttribute('disabled', '');
    };
    engine.onRenderState = updateRenderState;
    engine.onRenderError = message => toast(message, true);
    updateRenderState(engine.renderState);
    $('#quality-mode').addEventListener('click', () => void engine.startQuality());
    $('#preview-mode').addEventListener('click', () => engine.returnToPreview());
    $('#quality-cancel').addEventListener('click', () => engine.returnToPreview());
    $('#quality-pause').addEventListener('click', () => engine.pauseQuality());
    $('#quality-samples').addEventListener('change', event => engine.setQualitySamples(Number((event.target as HTMLSelectElement).value)));
    $('#quality-scale').addEventListener('change', event => engine.setQualityScale(Number((event.target as HTMLSelectElement).value)));
    $('#overview').addEventListener('click', () => engine.overview());
    renderControls(); renderLayers();
    $('#upload').addEventListener('click', () => $<HTMLInputElement>('#file-input').click());
    $('#depth-input').addEventListener('change', async event => {
      const input=event.target as HTMLInputElement, file=input.files?.[0]; input.value='';
      const layer=engine.layers.find(layer=>layer.id===depthTargetId);
      if(!file)return;
      if(!layer){toast('The selected image layer is no longer available.',true);return;}
      try {await engine.attachDepth(layer,file);selectedId=layer.id;renderLayers();toast('Depth map applied as geometry. Adjust relief and surface smoothing.');}
      catch(error){toast(error instanceof Error?error.message:'Could not load the depth map.',true);}
    });
    $('#file-input').addEventListener('change', event => {
      const input = event.target as HTMLInputElement; void importFiles(Array.from(input.files ?? [])); input.value = '';
    });
    document.querySelectorAll<HTMLElement>('[data-preset]').forEach(button => button.addEventListener('click', () => {
      engine.applyPreset(button.dataset.preset as Preset);
      $('#specimen-name').textContent = engine.layers[0].name;
      renderControls(); renderLayers();
    }));
    $('#reflections').addEventListener('change', event => {
      engine.set('reflections', (event.target as HTMLInputElement).checked); syncReflectionControls();
    });
    $('#light').addEventListener('change', e => engine.set('light', (e.target as HTMLSelectElement).value as Settings['light']));
    $('#tint').addEventListener('input', e => {
      const value = (e.target as HTMLInputElement).value;
      engine.set('tint', value); $('#tint-value').textContent = value.slice(1).toUpperCase();
    });
    $('#shuffle').addEventListener('click', () => {
      const seed = crypto.getRandomValues(new Uint32Array(1))[0] % 10000;
      engine.set('seed', seed); $('#seed-value').textContent = String(seed).padStart(4, '0');
      $('.coordinate').textContent = `SEED ${String(seed).padStart(4, '0')} · ${engine.settings.preset.toUpperCase()} STUDY`;
      toast('A new arrangement. Same little world.');
    });
    $('#reset-settings').addEventListener('click', () => {
      for (const [key, value] of Object.entries(defaults)) engine.set(key as keyof Settings, value as never);
      engine.applyPreset('forest'); $('#specimen-name').textContent = 'Forest floor'; renderControls(); renderLayers(); toast('Material reset. Your layers are kept.');
    });
    $('#reset-view').addEventListener('click', () => { engine.resetCamera(); toast('Back to the first view.'); });
    $('#motion').addEventListener('click', () => {
      engine.returnToPreview();
      engine.motion = !engine.motion;
      $('#motion').innerHTML = `${icon(engine.motion ? 'pause' : 'play', 14)}<span>Orbit</span>`;
      $('#motion').setAttribute('aria-pressed', String(engine.motion));
    });
    const compare = (value: boolean) => {
      engine.compare = value; $('#compare').classList.toggle('pressed', value);
      $('#stage').classList.toggle('comparing', value);
    };
    $('#compare').addEventListener('pointerdown', event => { (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId); compare(true); });
    for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) $('#compare').addEventListener(event, () => compare(false));
    document.addEventListener('keydown', event => {
      const target = event.target as HTMLElement;
      if (event.code === 'Space' && !help.open && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName)) { event.preventDefault(); compare(true); }
      else if (event.code === 'Space' && target === $('#compare')) { event.preventDefault(); compare(true); }
    });
    document.addEventListener('keyup', event => { if (event.code === 'Space') compare(false); });
    window.addEventListener('blur', () => compare(false));
    $('#fullscreen').addEventListener('click', async () => {
      try { if (document.fullscreenElement) await document.exitFullscreen(); else await $('#stage').requestFullscreen(); }
      catch { toast('Fullscreen is unavailable in this browser.', true); }
    });
    $('#export').addEventListener('click', async () => {
      if (exporting) return; exporting = true;
      const button = $<HTMLButtonElement>('#export'); button.disabled = true; button.textContent = 'Rendering…';
      try {
        const { blob, width, height, quality, samples } = await engine.exportImage();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url;
        const name = $<HTMLInputElement>('#project-name').value.trim().replace(/[^a-z0-9_-]/gi, '-').replace(/-+/g, '-').slice(0, 60) || 'resin-study';
        link.download = `${name.toLowerCase()}-${engine.settings.seed}.png`;
        link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
        toast(quality ? `Quality render exported. ${width} × ${height} · ${samples} samples.` : `Exported a little world. ${width} × ${height} PNG.`);
      } catch (error) { toast(error instanceof Error ? error.message : 'Image export failed.', true); }
      finally { exporting = false; updateRenderState(engine.renderState); }
    });
    let dragCount = 0;
    window.addEventListener('dragenter', event => {
      if (!event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault(); dragCount++; $('#drop-overlay').hidden = false;
    });
    window.addEventListener('dragover', event => { event.preventDefault(); });
    window.addEventListener('dragleave', event => { event.preventDefault(); if (--dragCount <= 0) { $('#drop-overlay').hidden = true; dragCount = 0; } });
    window.addEventListener('drop', event => {
      event.preventDefault(); dragCount = 0; $('#drop-overlay').hidden = true;
      void importFiles(Array.from(event.dataTransfer?.files ?? []));
    });
    // Useful for diagnostics without exposing uploaded file contents.
    Object.defineProperty(window, '__resin', { value: {
      get layerCount() { return engine.layers.length; },
      get settings() { return { ...engine.settings }; },
      get ready() { return engine.renderer.info.render.calls > 0; },
      get renderedFrames() { return engine.renderedFrames; },
      get renderState() { return engine.renderState; },
      get reliefLayers() { return engine.layers.filter(l=>l.relief).map(l=>({name:l.name,enabled:l.relief!.settings.enabled,source:l.relief!.sourceKind,vertices:l.relief!.top.geometry.attributes.position.count,heightRange:l.relief!.settings.enabled?[l.relief!.top.geometry.boundingBox?.min.y??0,l.relief!.top.geometry.boundingBox?.max.y??0]:[0,0]})); },
    }, configurable: true });
  } catch (error) {
    console.error(error);
    $('#loading').innerHTML = `${icon('info', 30)}<h2>A little more graphics power.</h2><p>This experiment needs WebGL 2. Enable hardware acceleration or try a current desktop browser.</p>`;
    $('#render-status').textContent = 'WebGL unavailable';
    $('#export').setAttribute('disabled', ''); $('#upload').setAttribute('disabled', '');
  }
});
