# Anime Headband Fighter — Asset Design Spec

Use this document to brief AI image generators (Midjourney, DALL-E, Stable Diffusion, etc.)
or a human pixel artist. All measurements are in **pixels at 1× scale**.

---

## 1. Visual Style

| Property | Value |
|---|---|
| Genre | Anime chibi / super-deformed (SD 2–2.5 head ratio) |
| Art style | Flat colour + bold 2 px black outline, no gradients on characters |
| Colour depth | 8–16 colours per character sprite |
| Perspective | Fight scene: side-view. Hub: slight 3/4 top-down |
| Palette mood | Saturated brights on dark backgrounds (`#080818` arena floor) |

**Prompt prefix for any AI generator:**
```
anime chibi fighter, super-deformed 2:1 head-body ratio, flat colour, bold black outline,
transparent background, pixel art OR clean vector, [COLOR] outfit, [AURA_COLOR] energy glow,
white headband across forehead, facing right, idle pose, full body
```

---

## 2. Character Sprite Sheets

### 2a. Fight-scene fighter (large)

| Property | Value |
|---|---|
| Canvas | **96 × 128 px** transparent PNG |
| Anchor point | Bottom-centre `(48, 128)` |
| Head | ~24 px diameter, centred at `(48, 28)` |
| Body | ~28 px wide, 36 px tall, centred at `(48, 68)` |
| Legs | ~20 px wide, 24 px tall, centred at `(48, 104)` |
| Headband | 8 px tall band across forehead; colour = aura tint |
| Facing | **Right** by default (flip horizontally for left-facing player 2) |

**Pose frames needed per character (strip layout, left→right):**

| Frame | Name | Description |
|---|---|---|
| 0 | `idle` | Neutral stance, slight forward lean |
| 1 | `attack` | Front-punch, arm fully extended right |
| 2 | `high_attack` | Overhead strike, arm raised |
| 3 | `low_attack` | Low sweep, torso dipped |
| 4 | `block` | Both arms raised in cross-guard |
| 5 | `hit` | Recoil, head snapping back |
| 6 | `ko` | Lying flat (rotated 90°) |
| 7 | `bankai` | Power-up pose, aura rays radiating out |

**Strip format:** `fighter_[id]_strip8.png` — 8 frames × 96 px = **768 × 128 px**

### 2b. Hub avatar (small)

| Property | Value |
|---|---|
| Canvas | **40 × 56 px** transparent PNG |
| Anchor point | Bottom-centre `(20, 56)` |
| Use | Hub spectator slots, crowd avatars, leaderboard icons |
| Frames | Idle only (1 frame) |

---

## 3. Headband Tier Overlays

Headband is a separate overlay layer drawn on top of the head sprite.

| Tier | Colour | Hex | Effect |
|---|---|---|---|
| None | — | — | No overlay |
| Bronze | Copper | `#cd7f32` | Solid band |
| Silver | Silver | `#c0c0c0` | Solid band + subtle shine line |
| Gold | Gold | `#ffd700` | Solid band + glow halo behind head |

**Canvas:** same as character canvas, transparent everywhere except the band.
**Naming:** `headband_gold.png`, `headband_silver.png`, `headband_bronze.png`

---

## 4. Aura / Bankai Effect Layers

These are drawn **behind** the character sprite.

| Asset | Canvas | Description |
|---|---|---|
| `aura_idle.png` | **96 × 96 px** | Soft radial glow, centred; used during idle |
| `aura_bankai.png` | **192 × 192 px** | Large burst with ray lines; centred |
| `impact_spark.png` | **64 × 64 px** | Hit-impact starburst, centred |
| `screen_flash.png` | **1 × 1 px** (tiled) | Solid colour used for full-screen flash; generate programmatically |

Aura colour is per-character — provide as a **tint mask** (white = full tint, black = no tint)
so a single asset can be recoloured at runtime.

**Naming:** `aura_idle_mask.png`, `aura_bankai_mask.png`, `impact_mask.png`

---

## 5. Ring / Arena Assets

### Hub boxing ring (isometric top-down)

| Asset | Canvas | Notes |
|---|---|---|
| `ring_canvas.png` | **320 × 180 px** | Top face of ring platform, slight perspective |
| `ring_front_face.png` | **320 × 28 px** | Front drop face (darker shade of canvas) |
| `ring_ropes.png` | **320 × 180 px** | 3 rope rows, transparent bg; overlaid on canvas |
| `ring_post.png` | **16 × 72 px** | One corner post; instantiated ×4 |
| `ring_crowd_row.png` | **640 × 40 px** | Silhouette crowd strip, tileable horizontally |

**Ring canvas colour:** `#0c1c0c` (dark green felt)
**Rope colour:** `#ff2222` (red) — 3 rows at Y offsets −12, −25, −40

### Background / arena

| Asset | Canvas | Notes |
|---|---|---|
| `bg_arena.png` | **390 × 844 px** (mobile 1×) or `1920 × 1080` | Dark arena bg with subtle crowd silhouettes |
| `banner_center.png` | **14 × 220 px** | Vertical pennant (red `#ff3300`) |
| `banner_side.png` | **14 × 180 px** | Vertical pennant (navy `#1a1a44`) |
| `spotlight_cone.png` | **160 × 400 px** | Soft white cone, very low opacity (~3%) |

---

## 6. NPC Visual Profiles

Each NPC needs a `fighter_[id]_strip8.png` and `aura_[id]_mask.png`.

| ID | Name | Outfit hex | Aura hex | Tier |
|---|---|---|---|---|
| `npc_ryo` | Ryo | `#5566aa` | `#8899ff` | Bronze |
| `npc_hana` | Hana | `#cc5577` | `#ff99bb` | Bronze |
| `npc_tomo` | Tomo | `#44aa66` | `#66ffaa` | Bronze |
| `npc_kira` | Kira | `#7755cc` | `#aa77ff` | Silver |
| `npc_zenji` | Zenji | `#336688` | `#55aacc` | Silver |
| `npc_mako` | Mako | `#bb6622` | `#ff9944` | Silver |
| `npc_rei` | Rei | `#222244` | `#4466ff` | Gold |
| `npc_akuma` | Akuma | `#881111` | `#ff2200` | Gold |
| `npc_shiro` | Shiro | `#dddddd` | `#ffffff` | Gold |
| `npc_kai` | Kai | `#111122` | `#ffd700` | Gold |

---

## 7. UI Elements

| Asset | Canvas | Notes |
|---|---|---|
| `btn_fight.png` | **200 × 52 px** | CTA button bg (gradient red→orange) |
| `btn_secondary.png` | **160 × 44 px** | Secondary button (dark navy + gold border) |
| `rank_board.png` | **88 × 110 px** | Top-3 scoreboard panel bg |
| `hp_bar_bg.png` | **240 × 18 px** | HP bar background |
| `hp_bar_fill.png` | **240 × 18 px** | HP bar fill (left = P1 blue, right = P2 red) |
| `energy_bar_fill.png` | **160 × 10 px** | Energy bar fill (yellow→gold) |

---

## 8. File Naming Convention

```
assets/
  characters/
    fighter_[id]_strip8.png      # 768 × 128  fight-scene sprite sheet
    avatar_[id].png              # 40 × 56    hub avatar
    headband_gold.png
    headband_silver.png
    headband_bronze.png
  effects/
    aura_idle_mask.png
    aura_bankai_mask.png
    impact_mask.png
  ring/
    ring_canvas.png
    ring_ropes.png
    ring_post.png
    ring_crowd_row.png
  ui/
    btn_fight.png
    btn_secondary.png
    rank_board.png
    hp_bar_bg.png
    hp_bar_fill.png
    energy_bar_fill.png
  bg/
    bg_arena.png
    banner_center.png
    banner_side.png
    spotlight_cone.png
```

All assets go in `packages/client/public/assets/`.
At runtime, load via `PIXI.Assets.load('/assets/...')`.

---

## 9. Colour Palette Reference

```
Arena floor bg:  #080818
Ring canvas:     #0c1c0c
Ring front face: #061006
Rope red:        #ff2222
Post silver:     #bbbbcc
Post cap gold:   #ffd700
P1 outfit:       #4a90d9  (blue)
P1 aura:         #7b2fff  (purple)
P2 outfit:       #e05050  (red)
P2 aura:         #ff8c00  (orange)
UI accent:       #ff6b35  (orange-red)
Gold headband:   #ffd700
Silver headband: #c0c0c0
Bronze headband: #cd7f32
Text light:      #ffffff
Text dim:        #667788
```
