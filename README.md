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
- **Next composition** (or **R** while not typing) explores a new resin shape, built-in specimen arrangement and the placement of visible uploaded layers. Lighting, camera, optical settings, materials and source visibility stay fixed. Uploaded images receive small translations, rotations and scale variations; models can rotate further. Vertical placement and tilt are preserved. Variations start from a stable arrangement, so clicking repeatedly does not gradually move everything away.
- **Previous** restores earlier arrangements, up to 47 steps back. **Keep uploaded layers in place** locks their transforms while the resin and built-in specimen vary. Enter a **Seed** from 0 to 9999 to replay an arrangement with the same sources, baseline transforms and lock setting. Manually transforming, adding, hiding or removing a source starts a new exploration history. Seeds and history last for the current session; they do not save the project or its assets.
- The resin controls adjust pool relief, fold frequency, rounded crease lips, roughness, clouding/inclusions, refractive index, tint, exposure, key-light intensity and light direction. Under **Optics**, **Surface reflections** optionally enables resin glare, with a separate strength slider. Reflections start off and their setting is preserved across presets and randomization. The control works in both Preview and Quality; scene illumination and refraction remain active. This is an artistic surface-glare control; the underlying objects can still have highlights, and ray-traced internal reflection can still occur. The reference lighting uses a locally generated HDR overhead strip, a cool window and a warm bounce. Dispersion currently applies only to Preview. Presets keep your imported sources.
- The default camera is a close macro view. **Overview** frames the whole specimen or ball; Reset restores the macro view. Drag to orbit, right-drag to pan, and scroll/pinch to zoom. In pooled mode, Orbit enables automatic camera movement. In ball mode, **Loop resin** turns the shell independently. Hold the compare button or Space to reveal the contents without resin.
- **Preview export** downloads the canvas alone as a PNG at 2× its CSS dimensions, capped at 4096 pixels on the longest side. **Quality export** saves the accumulated path-traced image at its actual rendering resolution. The project name becomes the filename. Uploaded images always have finite resolution.

Everything, including uploaded assets, remains in the current browser session. **There is no project persistence yet**: export your work before refreshing or closing the tab. Large models can be expensive; imports are limited to 120 MB per file. A desktop browser with hardware-accelerated WebGL 2 is recommended.

## Image relief and depth maps

Select an image layer and use **Upload depth** to attach an aligned greyscale depth/height image. White raises the surface and black leaves it low. The colour photo remains its original texture; depth displaces a subdivided mesh and generates surface normals, a back and side walls. This is 2.5D relief, not reconstruction of hidden sides.

- **Physical relief** switches between the original flat image and its relief while retaining the loaded map.
- **Relief depth**, **Depth smoothing** and **Invert depth** adjust the geometry. Depth processing uses floating-point filtering to reduce terraces in 8-bit depth images.
- **Quick emboss** generates an artistic height field from image brightness. It is explicitly not AI depth estimation: highlights and shadows in a photograph are not reliable depth cues. For accurate placement, use a depth map from a depth-estimation or painting tool.
- Under Surface, **Follow image relief** blends the resin toward enabled, visible image-relief layers; **Coating thickness** adjusts their cover. This follow operation uses a top height field with feathered boundaries. It is not a fluid simulation or a general-purpose offset of arbitrary 3D models. Imported 3D models continue to use their authored geometry.
- Depth maps are stretched to the colour image's UV coordinates, so they must depict the same aligned image. Disabling/removing/hiding a relief updates the resin. Source-image resolution remains finite, and baked photo lighting stays in the colour texture.

## Preview and quality rendering

**Preview** keeps editing interactive. Pooled resin is a closed, procedurally deformed mesh with broad pools, individual lens bulges and narrow channels. A floating-point height field, cubic filtering and continuous surface normals are shared by Preview and Quality; a denser shell keeps ray intersections close to that field. **Surface smoothing** softens the broad pools and widens channels without applying blur to the final image. **Fold lips** adds slender curved ridges beside shallow recesses; **Lip rounding** sets their tip radius independently of the broad smoothing. Lower rounding tightens the lip while keeping continuous normals. These features are real geometry in both modes and remain present when following image relief. They approximate a rounded crease; the pooled height-field surface cannot form an overhanging or folded-back sheet. Preview captures refraction at 1.5× resolution. Three.js physical transmission, absorption and dispersion render it over the scene. This mode uses a finite screen-space buffer and cannot recover off-screen or occluded information. Shadows and reflections are deliberately lit for a close material study.

**Quality render** lazily loads `three-gpu-pathtracer` and follows rays through the real scene, including the resin's entry/exit surfaces, reflections, absorption, direct illumination and diffuse interreflection. It builds a geometry acceleration structure when you enter the mode. Instanced foliage is expanded into geometry so the same contents remain present. It uses 7 scattering bounces plus up to 12 extra transmissive traversals.

The procedural colour/grain functions are shared between the two renderers. In Quality they are evaluated at the world-space ray hit, rather than baked into an image. Roughness clouding is also evaluated at the hit. Preview's derivative-based micro-normal perturbation is not duplicated in the tracer; the larger relief and foliage are real geometry in both modes. Original uploaded materials and image maps remain texture-based.

- Choose **Quality render** above the canvas. The preview remains visible while geometry/shaders prepare. Accumulation starts noisy and improves as samples arrive.
- The Material panel offers 50%/100% resolution and targets of 128, 256 (default) or 512 samples. 50% is useful on slower devices; export uses this actual lower rendering resolution, not an enlarged raster substitute.
- Pause/resume using the button on the progress panel. Export becomes available after one complete sample; wait for more samples for a cleaner result. The sample target stops accumulation automatically.
- Return to Preview at any time. Changing the scene, dragging the camera, resizing the canvas or switching mobile panels returns to Preview and releases tracing resources; enter Quality again to render the edited composition.
- Quality uses the same WebGL canvas and requires floating-point render targets. Preparation and GPU compilation can take time. Unsupported devices show a message and retain Preview. Hardware acceleration is strongly recommended.

This remains an artistic material study, not an exact reproduction of photographed resin. The current tracer is RGB rather than spectral: colour dispersion is Preview-only. Sharp caustics can remain noisy or underrepresented, and deeply nested dielectric interfaces have limits. Neither mode invents missing detail in source images. Some material texture maps are resampled to a 2048-pixel atlas in Quality. Relief does not recover hidden surfaces or unseen image detail, and transparent cutouts are not reconstructed as watertight side contours. Small suspended inclusions are geometric specks, not a full simulation of air bubbles or volumetric scattering.

The built-in specimen contains branching twigs, moss fronds, flattened lichen lobes, coloured irregular stone meshes and suspended specks. Surface clouding adds local roughness, not physically simulated milky volume scattering. Sources are not automatically clipped to the resin: moving or enlarging a layer can expose it outside the shell. Uploaded model animations are not played.

Static Preview draws on demand; Orbit, resin-loop playback and Quality sampling draw continuously. Exports preserve the current camera and restore the editor afterwards. Project persistence across refreshes is not yet implemented.

## Deformable ball and rotation loops

Choose **Resin form → Deformable ball** for a closed lens around your sources. **Deformation** pushes bulges and dents, **Warp scale** changes their spacing, **Twist** twists the shape, **Squash / stretch** changes its proportions, and **Ball size** changes the shell size. The ball uses a smooth positive-radius surface on a dense sphere; normals are evaluated from the same shape in Preview and Quality. Twist compensates the warp frequency to keep extreme combinations smooth. This is a procedural shape tool, without freehand sculpting, internal cavities or imported resin-shell support.

- Use **Tilt X**, **Rotate Y** and **Tilt Z** to turn only the shell. Uploaded images, image-relief meshes, 3D models, the built-in specimen, lights and camera stay in place.
- Scrub **Loop phase** from 0° to 360° to explore angles. The endpoint is exactly the start pose. Shell orientation sets the base pose; the loop turns around its chosen local X, Y or Z axis.
- **Play 360° loop**, or **Loop resin** below the canvas, repeats one turn every 2–30 seconds. Its shape stays fixed throughout. Playback resumes from the held angle; **Start angle** returns to the base pose. Dragging the camera, editing the scene or starting Quality stops playback.
- Playback runs in Preview. **Quality render** traces the current frozen angle; **Export image** pauses the loop and saves that still. Video and frame-sequence export are not included yet.
- Depth-mapped images and models keep their real geometry inside the ball. The pooled **Follow image relief** and **Coating thickness** controls are hidden in ball mode. Adjust Ball size or source transforms to keep contents inside; the shell does not clip protruding sources. **Overview** frames the current ball when you want to inspect its silhouette.
- **Next composition** generates another ball shape from its seed, using the same composition-history and upload-lock controls. Switching back to **Pooled resin** restores that surface workflow and retains your sources and material settings.

## Source map

- `src/engine.ts` — renderer, resin geometry, specimen generation, imports, transforms, export and resource cleanup.
- `src/materials.ts` — shared world-space colour/grain functions and resin surface clouding.
- `src/surface.ts` — smooth floating-point height field, cubic sampling, continuous normals and closed resin geometry.
- `src/ball.ts` — closed ball deformation, shared shape-field normals and absolute full-turn rotations.
- `src/relief.ts` — image height-map loading, float smoothing, relief geometry and coating-height samples.
- `src/random.ts` — deterministic seeded arrangement generation.
- `src/composition.ts` — stable seeded transforms and composition-history types.
- `src/specimen.ts` — fronds, lichen, stones, twigs and suspended inclusions.
- `src/environment.ts` — local floating-point HDR lighting maps.
- `src/quality.ts` — progressive path tracer, instance expansion and procedural-material integration.
- `src/main.ts` — editor UI, source layers, controls, file handling and accessibility.
- `src/style.css` — responsive editor layout and visual design.
- `tests/editor.spec.ts` — actual WebGL rendering, refraction changes, image + GLB imports, model materials, missing-file errors, PNG export, mobile panels, composition history/locking and progressive-render lifecycle/export.
- `tests/composition.spec.ts`, `tests/surface.spec.ts` and `tests/ball.spec.ts` — repeatable bounded arrangements, continuous surface normals, extreme ball warps and full-turn closure.

The GitHub Pages deployment workflow is included. When Pages is enabled, pushes to `main` build and deploy the website.
