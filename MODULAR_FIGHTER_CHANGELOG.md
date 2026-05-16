# Modular Fighter Refactor

## Changed files

- `packages/client/src/game/Fighter.ts`
- `packages/client/src/scenes/FightScene.ts`
- `packages/client/src/game/CardPicker.ts`

## What changed

### Fighter.ts
Replaced redraw-per-animation fighter with a modular Pixi container rig:

- root container
- aura layer
- torso
- head
- hair
- left/right arms
- left/right legs
- weapon
- weapon trail
- hit flash
- Bankai flash

The fighter now animates via transforms:

- position
- rotation
- scale
- alpha

This gives a simple fake-bone system without needing Spine or sprite sheets.

### Added animation poses

- idle breathing / bob
- normal attack
- high attack
- low attack
- block
- hit recoil
- KO fall
- Bankai charge

### FightScene.ts
Adjusted animation reset timing:

- normal attacks: 320ms
- block: 360ms
- Bankai: 650ms

This prevents Bankai from snapping back too quickly.

### CardPicker.ts
Fixed TypeScript typing issue by casting Pixi containers to `any` for pointer events.

## Verification

Ran:

```bash
node packages/client/node_modules/typescript/lib/tsc.js -p packages/client/tsconfig.json --noEmit --pretty false
```

Result: passed.

Vite build could not be fully verified in this container because the uploaded package's `node_modules` is missing `esbuild`.
