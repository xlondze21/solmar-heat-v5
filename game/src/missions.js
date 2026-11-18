// Solmar Heat — Rico's ten story missions, written fresh for this build.
// Each mission is a list of steps; the engine in game.js walks them in order.
// Step kinds: goto (reach a point), pickup (stand on a crate), deliver (carry
// to a point), survive (stay alive N seconds, usually while wanted), boat
// (reach a point while in the boat), fly (reach a point while in the heli),
// buy (stand in a shop with enough cash — the purchase happens there).

export function buildMissions(places) {
  const P = places;
  return [
    {
      id: 1, name: 'First Fare', reward: 150,
      brief: 'A tourist at the taxi stand needs the marina. Pick them up, then drop them off.',
      steps: [
        { kind: 'goto', label: 'Pick up the fare at the Taxi Stand', x: P.taxiStand.x, y: P.taxiStand.y, r: 54 },
        { kind: 'deliver', label: 'Drop the fare at the Marina', x: P.marina.x, y: P.marina.y - 130, r: 60 },
      ],
    },
    {
      id: 2, name: 'Hot Delivery', reward: 220, timeLimit: 90,
      brief: 'Fresh catch for the fish market — and the clock is ticking. Deliver it in 90 seconds.',
      steps: [
        { kind: 'pickup', label: 'Grab the catch at the Fish Market', x: P.fishMarket.x, y: P.fishMarket.y, r: 60, count: 1 },
        { kind: 'deliver', label: 'Deliver the catch to Old Town', x: P.oldTown.x, y: P.oldTown.y, r: 64 },
      ],
    },
    {
      id: 3, name: 'Lose the Heat', reward: 260,
      brief: 'The cops saw too much. Survive 20 seconds with heat on you, then slip into the safehouse.',
      steps: [
        { kind: 'survive', label: 'Survive the heat for 20s (wanted 2+)', seconds: 20, needWanted: 2 },
        { kind: 'goto', label: 'Slip into the Safehouse', x: P.safehouse.x, y: P.safehouse.y, r: 70 },
      ],
    },
    {
      id: 4, name: 'Turf Pickup', reward: 300,
      brief: 'Three crates stashed in rival turf, north-east blocks. Grab them all — the locals will not wave.',
      steps: [
        { kind: 'pickup', label: 'Collect crates in rival turf (0/3)', x: 2320, y: 220, r: 58, count: 3, spread: 150 },
      ],
    },
    {
      id: 5, name: 'The Gull Run', reward: 320,
      brief: 'Take the boat from the marina dock and run it out to the buoy in open water.',
      steps: [
        { kind: 'goto', label: 'Board the boat at the Marina dock', x: P.boatDock.x, y: P.boatDock.y, r: 56 },
        { kind: 'boat', label: 'Run the boat out to the Buoy', x: P.seaBuoy.x, y: P.seaBuoy.y, r: 70 },
      ],
    },
    {
      id: 6, name: 'Fish Market Heist', reward: 420,
      brief: 'Four crates at the fish market, then vanish to the garage. Lifting them trips the alarm — expect heat.',
      steps: [
        { kind: 'pickup', label: 'Lift crates at the Fish Market (0/4)', x: P.fishMarket.x, y: P.fishMarket.y, r: 64, count: 4, spread: 120, alarm: 2 },
        { kind: 'deliver', label: 'Escape to the Garage', x: P.garage.x, y: P.garage.y, r: 70 },
      ],
    },
    {
      id: 7, name: 'Tide Runner', reward: 350,
      brief: 'The sandbar road only exists at low tide. Watch the tide gauge — cross to the beach shack while it is dry.',
      steps: [
        { kind: 'goto', label: 'Cross the sandbar at low tide to the Beach Shack', x: P.beachShack.x, y: P.beachShack.y, r: 56, needLowTide: true },
      ],
    },
    {
      id: 8, name: 'Deco Dash', reward: 380, timeLimit: 75,
      brief: 'A buyer in Old Town wants the sports car seen around the city. 75 seconds, no excuses.',
      steps: [
        { kind: 'goto', label: 'Show the car in Old Town', x: P.oldTown.x, y: P.oldTown.y, r: 64, needVehicle: true },
      ],
    },
    {
      id: 9, name: 'Night Shift', reward: 300,
      brief: 'Stock up at the gun shop, then put three rounds into the practice target by the hospital.',
      steps: [
        { kind: 'buy', label: 'Buy ammo at the Gun Shop ($30)', x: P.gunshop.x, y: P.gunshop.y, r: 58, cost: 30, ammo: 12 },
        { kind: 'goto', label: 'Reach the practice target by the Hospital', x: P.hospital.x + 90, y: P.hospital.y, r: 52 },
      ],
    },
    {
      id: 10, name: 'Solmar Sunrise', reward: 600,
      brief: 'The last job: take the helicopter from the hospital helipad and set it down on the rooftop pad.',
      steps: [
        { kind: 'goto', label: 'Board the helicopter at the Hospital helipad', x: P.helipad.x, y: P.helipad.y, r: 56 },
        { kind: 'fly', label: 'Fly the helicopter to the Rooftop pad', x: P.rooftop.x, y: P.rooftop.y, r: 64 },
      ],
    },
  ];
}

export function missionById(missions, id) {
  return missions.find((m) => m.id === id) || null;
}
