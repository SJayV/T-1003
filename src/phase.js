const PERIOD        = 10.0;
const METABALL_END  = PERIOD * 0.15;
const CLUSTER_END   = METABALL_END + PERIOD * 0.83;

let t = 0;

export function tick() {
  t += 0.004;
}

export function getTime() {
  return t;
}

export function getPhase() {
  const c = t % PERIOD;
  if (c < METABALL_END) return 0.0;
  if (c < CLUSTER_END)  return (c - METABALL_END) / (CLUSTER_END - METABALL_END);
  return 1.0 + (c - CLUSTER_END) / (PERIOD - CLUSTER_END);
}
