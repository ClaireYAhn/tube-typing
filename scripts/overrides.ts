/**
 * Hand-curated fixes for TfL Unified API station names.
 *
 * The API returns operational names, not the names passengers see on the platform.
 * Mechanical suffix-stripping (see `cleanStationName` in fetch-network.ts) handles
 * "... Underground Station" / "... DLR Station" / "... Rail Station", but a handful of
 * names carry line-based or National-Rail disambiguators that have to be resolved by hand.
 */

/**
 * Applied to the raw API name BEFORE mechanical suffix-stripping.
 * Keys must match the API's `name` field exactly.
 */
export const RAW_NAME_OVERRIDES: Record<string, string> = {
  // API artefact: a stray hyphen where the suffix was concatenated.
  'Paddington (H&C Line)-Underground': 'Paddington',
  'Paddington-Underground': 'Paddington',

  // Line-based disambiguators. These are physically separate ticket halls that share a
  // passenger-facing name, so the game treats them as one station to type.
  'Hammersmith (Dist&Picc Line) Underground Station': 'Hammersmith',
  'Hammersmith (H&C Line) Underground Station': 'Hammersmith',
  'Edgware Road (Circle Line) Underground Station': 'Edgware Road',
  'Edgware Road (Bakerloo) Underground Station': 'Edgware Road',
  "Shepherd's Bush (Central) Underground Station": "Shepherd's Bush",

  // "for X" strap-lines are part of the legal name but not what anyone calls the station.
  'Custom House (for ExCel) DLR Station': 'Custom House',
  'Cutty Sark (for Maritime Greenwich) DLR Station': 'Cutty Sark',

  // National Rail county/city disambiguators.
  'Stratford (London) Rail Station': 'Stratford',
  'Burnham (Berks) Rail Station': 'Burnham',
  'Langley (Berks) Rail Station': 'Langley',

  // TfL writes "St." with a full stop; the roundels and the tube map do not.
  'King’s Cross St. Pancras Underground Station': "King's Cross St Pancras",
  "King's Cross St. Pancras Underground Station": "King's Cross St Pancras",
}

/**
 * Applied to the cleaned name AFTER suffix-stripping, as a safety net for anything that
 * slips past the raw map (the API has been known to change its suffix spelling).
 */
export const CLEAN_NAME_OVERRIDES: Record<string, string> = {
  // The Elizabeth line publishes National Rail names for the two big termini it shares
  // with the tube. Without these, "Paddington" and "London Paddington" become two
  // separate stations. (Note "London Bridge" and "London City Airport" are genuinely
  // named that way — this map is exact-match, so they are unaffected.)
  'London Paddington': 'Paddington',
  'London Liverpool Street': 'Liverpool Street',

  "King's Cross St. Pancras": "King's Cross St Pancras",
  'St. James’s Park': "St James's Park",
  "St. James's Park": "St James's Park",
  "St. John's Wood": "St John's Wood",
  "St. Paul's": "St Paul's",
  'Custom House (for ExCel)': 'Custom House',
  'Cutty Sark (for Maritime Greenwich)': 'Cutty Sark',
  'Edgware Road (Circle Line)': 'Edgware Road',
  'Hammersmith (H&C Line)': 'Hammersmith',
  'Hammersmith (Dist&Picc Line)': 'Hammersmith',
  "Shepherd's Bush (Central)": "Shepherd's Bush",
  'Stratford (London)': 'Stratford',
  'Burnham (Berks)': 'Burnham',
  'Langley (Berks)': 'Langley',
}

/**
 * Names that legitimately contain parentheses and must NOT have them stripped.
 */
export const KEEP_PARENTHESES = new Set(['Kensington (Olympia)'])

// Line colours are NOT here. `network.json` carries network structure only; presentation
// lives in src/data/lineColors.ts, so recolouring never means refetching data.
