export interface StateMetadata {
  fips: string;
  abbreviation: string;
  name: string;
}

export const STATES: StateMetadata[] = [
  ["01", "AL", "Alabama"], ["02", "AK", "Alaska"], ["04", "AZ", "Arizona"],
  ["05", "AR", "Arkansas"], ["06", "CA", "California"], ["08", "CO", "Colorado"],
  ["09", "CT", "Connecticut"], ["10", "DE", "Delaware"], ["11", "DC", "District of Columbia"],
  ["12", "FL", "Florida"], ["13", "GA", "Georgia"], ["15", "HI", "Hawaii"],
  ["16", "ID", "Idaho"], ["17", "IL", "Illinois"], ["18", "IN", "Indiana"],
  ["19", "IA", "Iowa"], ["20", "KS", "Kansas"], ["21", "KY", "Kentucky"],
  ["22", "LA", "Louisiana"], ["23", "ME", "Maine"], ["24", "MD", "Maryland"],
  ["25", "MA", "Massachusetts"], ["26", "MI", "Michigan"], ["27", "MN", "Minnesota"],
  ["28", "MS", "Mississippi"], ["29", "MO", "Missouri"], ["30", "MT", "Montana"],
  ["31", "NE", "Nebraska"], ["32", "NV", "Nevada"], ["33", "NH", "New Hampshire"],
  ["34", "NJ", "New Jersey"], ["35", "NM", "New Mexico"], ["36", "NY", "New York"],
  ["37", "NC", "North Carolina"], ["38", "ND", "North Dakota"], ["39", "OH", "Ohio"],
  ["40", "OK", "Oklahoma"], ["41", "OR", "Oregon"], ["42", "PA", "Pennsylvania"],
  ["44", "RI", "Rhode Island"], ["45", "SC", "South Carolina"], ["46", "SD", "South Dakota"],
  ["47", "TN", "Tennessee"], ["48", "TX", "Texas"], ["49", "UT", "Utah"],
  ["50", "VT", "Vermont"], ["51", "VA", "Virginia"], ["53", "WA", "Washington"],
  ["54", "WV", "West Virginia"], ["55", "WI", "Wisconsin"], ["56", "WY", "Wyoming"],
].map(([fips, abbreviation, name]) => ({ fips, abbreviation, name }));

export const STATE_BY_FIPS = new Map(STATES.map((state) => [state.fips, state]));
export const STATE_BY_ABBREVIATION = new Map(STATES.map((state) => [state.abbreviation, state]));

export function normalizeState(value: string): string {
  const cleaned = value.trim();
  if (!cleaned) return "";
  const upper = cleaned.toUpperCase();
  const byAbbreviation = STATE_BY_ABBREVIATION.get(upper);
  if (byAbbreviation) return byAbbreviation.abbreviation;
  return STATES.find((state) => state.name.toUpperCase() === upper)?.abbreviation ?? upper;
}
