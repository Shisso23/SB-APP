const displayLabels: Readonly<Partial<Record<string, string>>> = {
  total_0_3: 'Under 3.5 goals',
  home_or_draw: 'Home or Draw (1X)',
  away_or_draw: 'Away or Draw (X2)',
  home_over_1_5: 'Home Team Over 1.5 Goals',
  away_over_1_5: 'Away Team Over 1.5 Goals',
};

export const marketDisplayLabel = (id: string, label?: string): string =>
  Object.prototype.hasOwnProperty.call(displayLabels, id) ? displayLabels[id] ?? id : label || id;

// Older selection responses lack a market ID for the alternative label.
export const selectionAlternativeLabel = (label: string) =>
  label === '0–3 total goals' ? marketDisplayLabel('total_0_3') : label;
