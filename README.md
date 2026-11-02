# Resin

A browser-based material playground for images, 3D objects, and organic resin. Built with TypeScript, Three.js and Vite. No backend, account, asset service or runtime CDN is required.

## Develop

Use Node.js 22.12+ (this environment uses Node 24) and npm.

```sh
cd /workspace/resinresin
npm ci
npm run dev -- --port 5173
```

The server binds to `0.0.0.0`. Each cloud task already has an isolated checkout; use the existing checkout without creating a Git worktree.

```sh
npm run build     # Type-check and build to dist/
npm run preview   # Serve the production build
npm test          # Chromium end-to-end tests
```

Tests use `/usr/bin/chromium` with software WebGL in the cloud environment. Set `CHROMIUM_PATH` to a different installed Chromium executable if necessary. Tests start or reuse the development server on port 5173. No browser download is required here.

## Upload to GitHub and host with Pages

The source can be committed and pushed to GitHub normally, or uploaded through the GitHub website. Cloud-environment publication is separate from GitHub publication.

1. Extract the source ZIP and open your `has-he/resinresin` repository on GitHub. Choose **Add file → Upload files** (or **uploading an existing file** in an empty repository).
2. Upload the extracted folder's **contents** to the repository root, not the ZIP or the enclosing folder. Include the hidden `.github` folder, `.gitignore`, `src`, `public`, `tests`, the package files and configuration files. On macOS, press Command–Shift–period in Finder to reveal hidden files. Do not upload `node_modules`, `.git`, `.local`, caches, or test results. Commit to `main`.
3. In **Settings → Pages → Build and deployment → Source**, select **GitHub Actions**.
4. In **Actions**, open **Deploy Resin to GitHub Pages** and choose **Run workflow** on `main`. Future pushes to `main` run it automatically. The workflow builds and publishes `dist`; the Pages settings show the resulting site URL.

The included workflow requires no deployment token. It uses GitHub's built-in Pages permissions. Enable Pages for this repository before running the workflow.

Vite uses relative asset URLs so the built app also works below a project path such as `/resinresin/`. A separate ready-to-host ZIP contains only the built site. You can extract it into any static web host without Node.js on the hosting server. If you upload the **built site** directly to GitHub instead of source, choose Pages **Deploy from a branch → main → /(root)**. That option hosts the generated site and does not preserve editable TypeScript source in that repository.

To run the source locally after downloading, open a terminal in the extracted folder and run `npm ci`, then `npm run dev`. Opening the source `index.html` directly from the filesystem will not run the TypeScript app.

## Use

- Start with the procedural forest, mineral or amber specimen, or import your own sources.
- Add PNG, JPEG, WebP or AVIF images and GLB, glTF, OBJ or STL models. Drag and drop works too. Images and models can coexist in the same scene.
- GLB is the simplest model format because it can contain geometry, materials and textures in one file. For glTF/OBJ, select the model and all companion `.bin`, `.mtl` and image files together. Remote model dependencies are not fetched. Distinct companion files must have distinct basenames. Meshopt is supported; Draco and KTX2 compression are not yet supported. OBJ material files are applied to the OBJ models in the same import batch.
- The demo specimen hides after the first successful import. Use its eye button to bring it back. Each source can be independently hidden, selected, transformed or removed.
- Select an imported layer to adjust its size, vertical position, horizontal position and rotation. Models also have tilt and a choice of original, moss, mineral or bark materials. The procedural-detail setting applies to all procedural materials in the scene.
- The resin controls adjust pool relief, fold frequency, roughness, clouding/inclusions, refractive index, tint, exposure, key-light intensity and light direction. Under **Optics**, **Surface reflections** optionally enables resin glare, with a separate strength slider. Reflections start off and their setting is preserved across presets. The control works in both Preview and Quality; scene illumination and refraction remain active. This is an artistic surface-glare control; the underlying objects can still have highlights, and ray-traced internal reflection can still occur. The reference lighting uses a locally generated HDR overhead strip, a cool window and a warm bounce. Dispersion currently applies only to Preview. Presets and the seed button keep your imported sources.
- The default camera is a close macro view. **Overview** frames the whole specimen; Reset restores the macro view. Drag to orbit, right-drag to pan, and scroll/pinch to zoom. Orbit enables automatic camera movement. Hold the compare button or Space to reveal the contents without resin.
- **Preview export** downloads the canvas alone as a PNG at 2× its CSS dimensions, capped at 4096 pixels on the longest side. **Quality export** saves the accumulated path-traced image at its actual rendering resolution. The project name becomes the filename. Uploaded images always have finite resolution.

Everything, including uploaded assets, remains in the current browser session. **There is no project persistence yet**: export your work before refreshing or closing the tab. Large models can be expensive; imports are limited to 120 MB per file. A desktop browser with hardware-accelerated WebGL 2 is recommended.

## Preview and quality rendering

**Preview** keeps editing interactive. The resin is a closed, procedurally deformed mesh with broad pools, individual lens bulges and narrow channels. Three.js physical transmission, absorption and dispersion render it over the scene. This mode uses a finite screen-space buffer and cannot recover off-screen or occluded information. Shadows and reflections are deliberately lit for a close material study.

**Quality render** lazily loads `three-gpu-pathtracer` and follows rays through the real scene, including the resin's entry/exit surfaces, reflections, absorption, direct illumination and diffuse interreflection. It builds a geometry acceleration structure when you enter the mode. Instanced foliage is expanded into geometry so the same contents remain present. It uses 7 scattering bounces plus up to 12 extra transmissive traversals.

The procedural colour/grain functions are shared between the two renderers. In Quality they are evaluated at the world-space ray hit, rather than baked into an image. Roughness clouding is also evaluated at the hit. Preview's derivative-based micro-normal perturbation is not duplicated in the tracer; the larger relief and foliage are real geometry in both modes. Original uploaded materials and image maps remain texture-based.

- Choose **Quality render** above the canvas. The preview remains visible while geometry/shaders prepare. Accumulation starts noisy and improves as samples arrive.
- The Material panel offers 50%/100% resolution and targets of 128, 256 (default) or 512 samples. 50% is useful on slower devices; export uses this actual lower rendering resolution, not an enlarged raster substitute.
- Pause/resume using the button on the progress panel. Export becomes available after one complete sample; wait for more samples for a cleaner result. The sample target stops accumulation automatically.
- Return to Preview at any time. Changing the scene, dragging the camera, resizing the canvas or switching mobile panels returns to Preview and releases tracing resources; enter Quality again to render the edited composition.
- Quality uses the same WebGL canvas and requires floating-point render targets. Preparation and GPU compilation can take time. Unsupported devices show a message and retain Preview. Hardware acceleration is strongly recommended.

This remains an artistic material study, not an exact reproduction of photographed resin. The current tracer is RGB rather than spectral: colour dispersion is Preview-only. Sharp caustics can remain noisy or underrepresented, and deeply nested dielectric interfaces have limits. Neither mode invents missing detail in source images. Some material texture maps are resampled to a 2048-pixel atlas in Quality. Small suspended inclusions are geometric specks, not a full simulation of air bubbles or volumetric scattering.

The built-in specimen contains branching twigs, moss fronds, flattened lichen lobes, coloured irregular stone meshes and suspended specks. Surface clouding adds local roughness, not physically simulated milky volume scattering. Sources are not automatically clipped to the resin: moving or enlarging a layer can expose it outside the shell. Uploaded model animations are not played.

Static Preview draws on demand; Orbit and Quality sampling draw continuously. Exports preserve the current camera and restore the editor afterwards. Project persistence across refreshes is not yet implemented.

## Source map

- `src/engine.ts` — renderer, resin geometry, specimen generation, imports, transforms, export and resource cleanup.
- `src/materials.ts` — shared world-space colour/grain functions and resin surface clouding.
- `src/surface.ts` — irregular closed resin surface generation.
- `src/specimen.ts` — fronds, lichen, stones, twigs and suspended inclusions.
- `src/environment.ts` — local floating-point HDR lighting maps.
- `src/quality.ts` — progressive path tracer, instance expansion and procedural-material integration.
- `src/main.ts` — editor UI, source layers, controls, file handling and accessibility.
- `src/style.css` — responsive editor layout and visual design.
- `tests/editor.spec.ts` — actual WebGL rendering, refraction changes, image + GLB imports, model materials, missing-file errors, PNG export, mobile panels and progressive-render lifecycle/export.

The GitHub Pages deployment workflow is included. When Pages is enabled, pushes to `main` build and deploy the website.
