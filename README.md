# Dusk Trails

An isometric voxel offroading game that runs in the browser. Drive a 4x4, a dirt bike, a buggy, a truck or a trials bike across four small worlds at dusk, with suspension, differentials, mud, water and a winch all simulated.

Built with [Three.js](https://threejs.org) for the picture and [Rapier](https://rapier.rs) for the physics, in plain JavaScript.

## What is in it

- **Five vehicles** with their own handling, paint and set-up (tyres, suspension, extras)
- **Four maps:** a valley, a snowy pass, a red canyon and a volcanic island
- **Things to do:** trail runs, rally stages with pace notes, deliveries, winch rescues, hidden lanterns, a daily challenge, or just roam
- **Offroad physics:** per-wheel suspension, 2WD/4WD, low range, locking diffs, tyre pressure, mud ruts, water, damage and fuel
- **Weather and time of day**, photo mode, generated music and sound
- Keyboard, gamepad and touch controls; keys can be changed in Settings

## Run it on your computer

You need [Node.js](https://nodejs.org) 20 or newer.

```bash
npm install
```

```bash
npm run dev
```

Then open http://localhost:5180 in a browser.

Other commands:

| Command | What it does |
|---|---|
| `npm test` | Runs the physics tests |
| `npm run build` | Builds the finished game into `dist/` |
| `npm run preview` | Serves the built game to check it |

## Controls

| Key | Action |
|---|---|
| W A S D | Drive and steer |
| Shift (hold) | Gentle throttle |
| Space | Handbrake |
| F | 2WD / 4WD |
| L | Low range |
| 1 / 2 | Front / rear diff lock |
| X / Z | Gear up / down (manual gears) |
| T | Tyre pressure |
| G | Winch |
| J | Trailer hitch |
| K / I | Bike: lean back / forward |
| V | Switch vehicle |
| R | Recover to firm ground |
| Q / E / C | Rotate camera / camera mode |
| M | Big map |
| H | Headlights |
| B / N | Time of day / rain |
| P | Photo mode |
| / | Show or hide the controls |

## How the code is laid out

```
index.html        the page and the on-screen panels
src/
  main.js         starts everything and runs the game loop
  input.js        keyboard
  physics/        wheels, suspension, drivetrain, vehicles (no graphics code)
  world/          terrain, surfaces, scenery, and one file per map in maps/
  game/           runs, deliveries, rescues, saving, winch, damage, set-up
  render/         camera, lighting, effects, vehicle models, weather
  ui/             menus, dashboard, minimap, garage, styles
  audio/          sound effects and music
  controls/       gamepad and touch
tests/            physics tests
```

Progress is saved in the browser on your own device.

## Putting it online

The file `.github/workflows/deploy.yml` builds the game and publishes it with GitHub Pages on every push to `main`. To switch it on, open the repository on GitHub and choose Settings > Pages > Source > GitHub Actions.

## Licence

MIT. See [LICENSE](LICENSE).
