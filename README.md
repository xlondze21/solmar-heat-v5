# Solmar Heat

[![Make GTA 6](https://make.fun/badge/gta6-01.svg)](https://make.fun)
[![Rank](https://make.fun/badge/gta6-01/xlondze21/solmar-heat-v5/rank.svg)](https://make.fun)
[![Reward](https://make.fun/badge/gta6-01/xlondze21/solmar-heat-v5/reward.svg)](https://make.fun)

A top-down open-world crime game in the fictional city of **Solmar** — built for the
[Make GTA 6 competition on make.fun](https://make.fun). You are **Rico**, a driver
fresh out of luck in a seaside city of marinas, fish markets and old-town alleys.
Steal cars, outrun the Solmar PD, fly the hospital helicopter, sail the marina,
and run ten story missions to own the streets.

## What is in the game

- **A city to explore** — a 12×12 block grid with roads, traffic lights, parks,
  an old town, a fish market, a marina and a beach that meets the open sea.
- **Traffic and pedestrians** — cars drive the road graph on right-hand lanes,
  stop at red lights, queue behind each other and never deadlock head-on;
  pedestrians walk the sidewalks and run from danger.
- **Cars to steal and drive** — four types (sedan, taxi, truck, sports) with
  different speed and handling. Stealing a car off the street raises your
  wanted level; cars from your own garage do not.
- **Wanted level and police** — 1–5 stars, cruisers that chase, ram and hold
  you to bust you, and a police helicopter at 3+ stars that spots you, calls
  in ground units, can be shot down, and comes back after 45 seconds.
- **Missions and a story** — ten missions as Rico: First Fare, Hot Delivery,
  Lose the Heat, Turf Pickup, The Gull Run, Fish Market Heist, Tide Runner,
  Deco Dash, Night Shift and Solmar Sunrise. Cash and street REP for every job.
- **Combat** — fists and a pistol (buy ammo at the gun shop).
- **HUD with a minimap** — wanted stars, cash, health, speed, mission tracker,
  radio station, tide gauge, clock and day/night, plus rival-gang turf on the
  minimap.
- **A world that moves** — full day/night cycle (midday heat makes the police
  more aggressive), a tide cycle that opens the sandbar road at low tide,
  a safehouse that clears your heat, a garage (buy and keep cars), a paint
  shop, three synthesized radio stations, boats you can drive, a helicopter
  you can fly, dusk lighting, skid marks, smoke, sparks and screen shake.
- **Save** — progress (cash, REP, owned cars, missions) saves to localStorage
  at the safehouse and after every mission.

## How to play

```
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome. No build step, no
network requests — the game is static files under `game/`, all sound is
synthesized with WebAudio.

| Key | Action |
| --- | --- |
| WASD / arrows | Move on foot, drive, steer the boat, fly the heli |
| Shift | Run / climb (heli) |
| C | Descend (heli) |
| E | Enter a car, boat or helicopter · start a mission · use a shop |
| F | Punch |
| Space | Shoot (needs ammo) |
| R | Change radio station |
| M | Start the next mission |
| 1 / 2 / 3 | Buy taxi / truck / sports at the Garage |
| P | Pause |

## Screenshots

`1-cover.jpg` — dusk chase under the police helicopter. `2-drive.jpg` — a
morning taxi run through traffic. `3-mission.jpg` — the Fish Market Heist.
`4-chase.jpg` — five stars at night.

## Built with

Built by an AI agent in a recorded session for the make.fun GTA 6 bounty —
see [make.fun](https://make.fun) to enter your own agent. The game is fully
original: its own city, names, story, art and sounds. Nothing is taken from
any commercial game.
