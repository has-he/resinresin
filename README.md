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

The included workflow requires no deployment token. It uses GitHub's built-in Pages permissions. It has been prepared locally; an actual GitHub deployment has not been run from this cloud environment.

Vite uses relative asset URLs so the built app also works below a project path such as `/resinresin/`. A separate ready-to-host ZIP contains only the built site. You can extract it into any static web host without Node.js on the hosting server. If you upload the **built site** directly to GitHub instead of source, choose Pages **Deploy from a branch → main → /(root)**. That option hosts the generated site and does not preserve editable TypeScript source in that repository.

To run the source locally after downloading, open a terminal in the extracted folder and run `npm ci`, then `npm run dev`. Opening the source `index.html` directly from the filesystem will not run the TypeScript app.

## Use

- Start with the procedural forest, mineral or amber specimen, or import your own sources.
- Add PNG, JPEG, WebP or AVIF images and GLB, glTF, OBJ or STL models. Drag and drop works too. Images and models can coexist in the same scene.
- GLB is the simplest model format because it can contain geometry, materials and textures in one file. For glTF/OBJ, select the model and all companion `.bin`, `.mtl` and image files together. Remote model dependencies are not fetched. Distinct companion files must have distinct basenames. Meshopt is supported; Draco and KTX2 compression are not yet supported. OBJ material files are applied to the OBJ models in the same import batch.
- The demo specimen hides after the first successful import. Use its eye button to bring it back. Each source can be independently hidden, selected, transformed or removed.
- Select an imported layer to adjust its size, vertical position, horizontal position and rotation. Models also have tilt and a choice of original, moss, mineral or bark materials. The procedural-detail setting applies to all procedural materials in the scene.
- The resin controls adjust surface relief, fold frequency, roughness, refractive index, dispersion, tint, exposure and lighting. Presets and the seed button keep your imported sources.
- Drag to orbit, right-drag to pan, and scroll/pinch to zoom. Orbit enables automatic camera movement. Hold the compare button or Space to reveal the contents without resin.
- Export downloads the canvas alone as a PNG at 2× its CSS dimensions, capped at 4096 pixels on the longest side. The project name becomes the filename. If you zoom very far into an image, its finite resolution will still become visible.

Everything, including uploaded assets, remains in the current browser session. **There is no project persistence yet**: export your work before refreshing or closing the tab. Large models can be expensive; imports are limited to 120 MB per file. A desktop browser with hardware-accelerated WebGL 2 is recommended.

## Rendering and limits

The resin is a closed, procedurally deformed high-resolution mesh rendered using Three.js `MeshPhysicalMaterial` transmission, thickness, attenuation and dispersion. Lighting comes from a locally generated studio environment. The built-in specimen contains instanced moss, irregular stone meshes, curved twigs and shader-generated grain and colour, rather than stock photographs.

This is an **interactive artistic approximation**, not a full volumetric or path-traced optical simulation. Transmission samples a rendered view of the underlying scene. It cannot recover off-screen/occluded information, faithfully simulate complex nested transparent objects, or produce physically accurate caustics. Procedural materials avoid magnifying source-image texels, but the screen-space transmission buffer itself still has finite resolution. Sources are not automatically clipped to the resin: moving or enlarging a layer can expose it outside the shell. Uploaded model animations are not played.

The renderer draws on demand when static and continuously during orbit or interaction. PNG export renders a separate larger frame and restores the editor size afterwards.

## Source map

- `src/engine.ts` — renderer, resin geometry, specimen generation, imports, transforms, export and resource cleanup.
- `src/materials.ts` — world-space procedural colour and grain shaders.
- `src/main.ts` — editor UI, source layers, controls, file handling and accessibility.
- `src/style.css` — responsive editor layout and visual design.
- `tests/editor.spec.ts` — actual WebGL rendering, refraction changes, image + GLB imports, model materials, missing-file errors, PNG export and mobile panels.

The GitHub Pages deployment workflow is included. No external publication has been performed by this task.
