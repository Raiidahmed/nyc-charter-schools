// Rules shared by the data scripts and the site, so the notes can quote them.

/** Each school lists up to this many stations within this distance. */
export const STATION_RADIUS_MILES = 0.75;
export const MAX_STATIONS = 4;

/** Federal ratios outside this range are reporting errors, so they count as unreported. */
export const RATIO_RANGE: [number, number] = [4, 35];

/** Schools on the state's list without a federal record are "new" from this year. */
export const NEW_SCHOOL_FROM = 2025;
