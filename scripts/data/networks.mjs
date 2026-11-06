// Networks are inferred from school names with this hand-written list.
// Anything that doesn't match counts as independent. Only groups with more
// than one school in the city are listed.
export const NETWORKS = [
  ['Success Academy', /^Success Academy\b/],
  ['Achievement First', /^Achievement First\b/],
  ['KIPP', /^KIPP\b/],
  ['Uncommon Schools', /^Uncommon\b/],
  ['Ascend', /\bAscend Charter School\b/],
  ['Democracy Prep', /^Democracy Prep/],
  ['Icahn Charter Schools', /^Icahn Charter School\b/],
  ['Zeta', /^Zeta Charter School\b/],
  ['South Bronx Classical', /^South Bronx Classical\b/],
  ['Explore Schools', /^Explore (Charter|Empower|Enrich|Exceed|Excel)\b/],
  ['Brilla', /^Brilla\b/],
  ['Harlem Village Academies', /^Harlem Village Academy\b/],
  ['Bronx Excellence', /^Bronx Charter School for Excellence\b/],
  ['United Charter High Schools', /^United Charter High School\b/],
  ['Family Life Academy', /^Family Life Academy\b/],
  ['Brooklyn Prospect', /^Brooklyn Prospect\b/],
  ['Brooklyn LAB', /Brooklyn Laboratory Charter School\b/],
  ['DREAM', /^Dream Charter School\b/],
  ['Amber Charter Schools', /^Amber Charter School\b/],
  ['Hebrew Public', /^(Hebrew Language Academy|Staten Island Hebrew Public)\b/],
  ['Hellenic Classical', /^Hellenic Classical\b/],
  ['Public Prep', /^(Girls|Boys) Preparatory Charter School\b/],
  ['Capital Prep', /^Capital Preparatory\b/],
  ['Our World Neighborhood', /^Our World Neighborhood\b/],
  ['Growing Up Green', /^Growing Up Green\b/],
  ['Central Queens Academy', /^Central Queens Academy\b/],
  ["Harlem Children's Zone", /^Harlem Children's Zone\b/],
  ['Storefront Academy', /^Storefront Academy\b/],
  ['Neighborhood Charter Schools', /^Neighborhood Charter School\b/],
  ['East Harlem Scholars', /^East Harlem Scholars\b/],
  ['Manhattan Charter Schools', /^Manhattan Charter School\b/],
  ['NYC Autism Charter Schools', /^NYC Autism Charter School\b/],
  ['New Dawn', /^New Dawn Charter High School\b/],
  ['Urban Dove Team', /^Urban Dove Team\b/],
  ['New Beginnings', /^Bedford Stuyvesant New Beginnings\b/],
  ['Bronx Better Learning', /^Bronx Charter School for Better Learning\b/],
  ['MESA', /^Math, Engineering,? and Science Academy\b/],
  ['Renaissance', /^(The )?Renaissance Charter School\b/],
  ['Lamad Academy', /^Lamad\b/],
  ['American Dream', /^American Dream Charter School\b/],
  ['University Prep', /^University Prep Charter\b/],
];

export function networkFor(name) {
  for (const [network, pattern] of NETWORKS) if (pattern.test(name)) return network;
  return null;
}
