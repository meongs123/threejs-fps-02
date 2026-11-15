// The look plan, in one place. Kestrel Yard is a dockyard at dusk: cold blue-grey
// concrete and steel, warm amber work lights, rust-orange containers and one teal
// accent. The same names are the CSS custom properties in index.html.
export const PALETTE = {
  sky: '#232c38',
  ground: '#343a41',
  concrete: '#4b545e',
  steel: '#5d6873',
  rust: '#a8542c',
  rustDark: '#7e3d20',
  teal: '#2e6f6a',
  container: '#8a6d3b',
  containerB: '#5d7a68',
  amber: '#f0a830',
  ink: '#ece7db',
  muted: '#9aa3ab',
  vanguard: '#f0a830',
  jackal: '#d64545',
};

export function hex(name) {
  return PALETTE[name];
}
