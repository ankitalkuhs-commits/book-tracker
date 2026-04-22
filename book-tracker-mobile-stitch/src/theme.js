// Stitch design system — React Native color tokens
// Mirrors book-tracker-frontend-stitch/tailwind.config.js

export const colors = {
  primary:               '#00464a',
  primaryContainer:      '#006064',
  onPrimary:             '#ffffff',
  onPrimaryContainer:    '#8fd8dc',

  secondary:             '#735c00',
  secondaryContainer:    '#fed65b',
  onSecondary:           '#ffffff',
  onSecondaryContainer:  '#241a00',

  tertiary:              '#62330f',
  tertiaryContainer:     '#7e4924',
  onTertiary:            '#ffffff',

  surface:               '#fbf9f4',
  surfaceDim:            '#dbdad5',
  surfaceContainerLowest:'#ffffff',
  surfaceContainerLow:   '#f5f3ee',
  surfaceContainer:      '#f0eee9',
  surfaceContainerHigh:  '#eae8e3',
  surfaceContainerHighest:'#e4e2dd',
  surfaceVariant:        '#e4e2dd',

  onSurface:             '#1b1c19',
  onSurfaceVariant:      '#3f4949',
  outline:               '#6f7979',
  outlineVariant:        '#bec8c9',

  error:                 '#ba1a1a',
  onError:               '#ffffff',
  errorContainer:        '#ffdad6',
}

export const radius = {
  sm:  8,
  md:  12,
  lg:  16,
  xl:  20,
  full: 999,
}

export const shadow = {
  card: {
    shadowColor: '#1b1c19',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 3,
  },
  float: {
    shadowColor: '#1b1c19',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },
}
