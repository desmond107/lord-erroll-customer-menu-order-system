/**
 * Menu source data for The Lord Erroll.
 *
 * IMPORTANT — pricing policy:
 *   Only prices that are unambiguous in the restaurant's supplied menus are set here.
 *   Every other item ships with `price: null`, which the loader records as
 *   `price_review = 1`. Those items are listed in Admin → Menu → "Needs review" and
 *   are hidden from the guest menu until a manager enters the real price.
 *   Nothing here is a guessed price.
 *
 * Descriptions and allergen lists are likewise left empty where the printed menu
 * has not been transcribed. `allergen_review` stays 1 until the chef signs an item off.
 */

const F = 'kitchen';
const B = 'bar';

/** Cooking temperature — required on every cut of red meat. */
const TEMPERATURE = {
  name: 'Cooking temperature',
  min: 1,
  max: 1,
  options: ['Rare', 'Medium rare', 'Medium', 'Medium well', 'Well done'].map((name) => ({ name })),
};

/**
 * Sauce options for the dry aged ribeye. The printed menu says "with sauce choice"
 * without listing them, so these are placeholders the manager confirms in the CMS
 * (Admin → Menu → item → Modifiers). They carry no price effect.
 */
const RIBEYE_SAUCE = {
  name: 'Choice of sauce',
  min: 1,
  max: 1,
  review: true,
  options: ['Peppercorn', 'Red wine jus', 'Béarnaise', 'Garlic herb butter', 'Wild mushroom'].map((name) => ({ name })),
};

export const categories = [
  // ============================================================ FOOD
  {
    code: 'OYSTERS',
    name: 'Fresh Indian Ocean Oysters',
    kind: 'food',
    station: F,
    course: 1,
    items: [
      {
        name: 'Fresh Indian Ocean Oysters',
        allergens: ['shellfish'],
        variants: [{ label: '6 pieces' }, { label: '12 pieces' }],
      },
      {
        name: 'Oysters Rockefeller',
        allergens: ['shellfish', 'dairy'],
        variants: [{ label: '6 pieces' }, { label: '12 pieces' }],
      },
    ],
  },
  {
    code: 'STARTERS',
    name: 'Starters',
    kind: 'food',
    station: F,
    course: 1,
    items: [
      { name: 'Tuna Tartare', allergens: ['fish'] },
      { name: 'Beetroot & Goat Cheese', dietary: ['vegetarian'], allergens: ['dairy'] },
      { name: 'Beef Carpaccio', allergens: ['dairy'] },
      { name: 'Tempura Prawns', allergens: ['shellfish', 'gluten'] },
      { name: 'Octopus Carpaccio', allergens: ['shellfish'] },
    ],
  },
  {
    code: 'SOUPS',
    name: 'Soups',
    kind: 'food',
    station: F,
    course: 1,
    items: [
      { name: 'Seafood Bisque', allergens: ['shellfish', 'dairy'] },
      { name: 'Clear Chicken Broth' },
      { name: 'Roasted Butternut', dietary: ['vegetarian'] },
      { name: 'Tomato & Bell Pepper', dietary: ['vegetarian'] },
    ],
  },
  {
    code: 'SALADS',
    name: 'Salads',
    kind: 'food',
    station: F,
    course: 1,
    items: [
      { name: 'Classic Caesar', allergens: ['dairy', 'gluten', 'egg', 'fish'] },
      { name: 'Fig, Burrata & Arugula', dietary: ['vegetarian'], allergens: ['dairy'] },
      { name: 'Salad Niçoise', allergens: ['fish', 'egg'] },
      { name: 'Hummus with Pita', dietary: ['vegetarian'], allergens: ['gluten', 'sesame'] },
    ],
  },
  {
    code: 'GRILL',
    name: 'Main Course — Meat & Grill',
    kind: 'food',
    station: F,
    course: 2,
    items: [
      { name: 'Dry Aged Porterhouse 500g', modifiers: [TEMPERATURE] },
      { name: 'Dry Aged Ribeye 300g', modifiers: [TEMPERATURE, RIBEYE_SAUCE] },
      { name: 'Ostrich Steak', modifiers: [TEMPERATURE] },
      { name: 'Tea-smoked BBQ Lamb Chops' },
      { name: 'Chicken Marbella' },
      { name: 'Five Spice Duck Breast' },
      { name: 'Beef Short Ribs' },
      { name: 'Ossobuco Milanese' },
    ],
  },
  {
    code: 'OCEAN',
    name: 'From the Ocean',
    kind: 'food',
    station: F,
    course: 2,
    items: [
      { name: 'Grilled Lobster', allergens: ['shellfish'] },
      { name: 'Lobster Thermidor', allergens: ['shellfish', 'dairy'] },
      { name: 'King Prawns', allergens: ['shellfish'] },
      { name: 'Crispy Skin Salmon Fillet', allergens: ['fish'] },
      { name: 'Fillet de Poisson', allergens: ['fish'] },
      { name: 'Tuna Steak', allergens: ['fish'], modifiers: [TEMPERATURE] },
      { name: 'Grilled Octopus', allergens: ['shellfish'] },
    ],
  },
  {
    code: 'SIDES',
    name: 'Sides',
    kind: 'food',
    station: F,
    course: 2,
    items: [
      { name: 'Champ Mashed Potato', dietary: ['vegetarian'], allergens: ['dairy'] },
      { name: 'Matchstick Fries', dietary: ['vegetarian'] },
      { name: 'Sweet Mashed Potato', dietary: ['vegetarian'], allergens: ['dairy'] },
      { name: 'Mediterranean Rice', dietary: ['vegetarian'] },
      { name: 'Creamy Spinach', dietary: ['vegetarian'], allergens: ['dairy'] },
      { name: 'Organic Leaf Salad', dietary: ['vegetarian', 'vegan'] },
      { name: 'Chilly Garlic Broccoli', dietary: ['vegetarian', 'vegan'] },
      { name: 'Onion Rings', dietary: ['vegetarian'], allergens: ['gluten'] },
    ],
  },
  {
    code: 'GREENFIRE',
    name: 'Green Fire',
    kind: 'food',
    station: F,
    course: 2,
    note: 'Vegetarian dishes and pasta.',
    items: [
      { name: 'Gnocchi', dietary: ['vegetarian'], allergens: ['gluten', 'dairy'] },
      { name: 'Four Cheese Ravioli', dietary: ['vegetarian'], allergens: ['gluten', 'dairy', 'egg'] },
      {
        name: 'Beetroot & Feta Risotto',
        dietary: ['vegetarian'],
        allergens: ['dairy'],
        modifiers: [
          {
            name: 'Preparation',
            min: 1,
            max: 1,
            options: [{ name: 'Classic, with feta' }, { name: 'Vegan, without feta' }],
          },
        ],
      },
      { name: 'Mushroom & Parmigiano Risotto', dietary: ['vegetarian'], allergens: ['dairy'] },
      { name: 'Spaghetti Aglio Olio', dietary: ['vegetarian', 'vegan'], allergens: ['gluten'] },
      { name: 'Wild Mushroom Ragout', dietary: ['vegetarian'] },
    ],
  },
  {
    code: 'DESSERTS',
    name: 'Desserts',
    kind: 'food',
    station: F,
    course: 3,
    items: [
      { name: 'Lords Cheesecake', dietary: ['vegetarian'], allergens: ['dairy', 'gluten', 'egg'] },
      { name: 'Molten Lava Cake', dietary: ['vegetarian'], allergens: ['dairy', 'gluten', 'egg'] },
      { name: 'Lemon Meringue Pie', dietary: ['vegetarian'], allergens: ['dairy', 'gluten', 'egg'] },
      { name: 'Affogato', dietary: ['vegetarian'], allergens: ['dairy'] },
      { name: 'Sticky Toffee Pudding', dietary: ['vegetarian'], allergens: ['dairy', 'gluten', 'egg'] },
      { name: 'Sweet Banana Flambé', dietary: ['vegetarian'], allergens: ['dairy'] },
      { name: 'Crème Brûlée', dietary: ['vegetarian'], allergens: ['dairy', 'egg'] },
      { name: 'Tropical Fruit Selection', dietary: ['vegetarian', 'vegan'] },
      { name: 'Home-made Sorbet & Ice Cream', dietary: ['vegetarian'] },
    ],
  },

  // ======================================================== SET MENUS
  {
    code: 'SETMENUS',
    name: 'Set & Degustation Menus',
    kind: 'set',
    station: F,
    course: 1,
    note: 'Priced per guest. Each cover chooses their own courses.',
    items: [
      {
        name: 'Sorbet Starter Set Menu',
        price: 6500,
        usd: 50,
        isSet: true,
        modifiers: [
          { name: 'Starter', min: 1, max: 1, course: 1, review: true, options: [] },
          { name: 'Soup', min: 1, max: 1, course: 1, review: true, options: [] },
          { name: 'Main course', min: 1, max: 1, course: 2, review: true, options: [] },
        ],
      },
      {
        name: 'Starters, Mains & Desserts Set Menu',
        price: 6500,
        isSet: true,
        modifiers: [
          { name: 'Starter', min: 1, max: 1, course: 1, review: true, options: [] },
          { name: 'Main course', min: 1, max: 1, course: 2, review: true, options: [] },
          { name: 'Dessert', min: 1, max: 1, course: 3, review: true, options: [] },
        ],
      },
      {
        name: 'Three Course Set Menu',
        isSet: true,
        modifiers: [
          {
            name: 'Starter',
            min: 1,
            max: 1,
            course: 1,
            options: [{ name: 'Roasted Butter Soup' }, { name: 'Pear Salad' }],
          },
          {
            name: 'Main course',
            min: 1,
            max: 1,
            course: 2,
            options: [{ name: 'Beef Medallions' }, { name: 'Fish Fillet' }, { name: 'Chicken Breast' }],
          },
          {
            name: 'Dessert',
            min: 1,
            max: 1,
            course: 3,
            options: [{ name: 'Black Forest Slice' }, { name: 'Tropical Fruit' }],
          },
        ],
      },
      { name: 'Regular Buffet', price: 6500, isSet: true, description: 'Per person.' },
      { name: 'Gold Buffet', price: 6850, isSet: true, description: 'Per person.' },
      { name: 'Buffet Menu', price: 6850, isSet: true, description: 'Per person.' },
    ],
  },

  // ============================================================ WINE
  {
    code: 'CHAMPAGNE',
    name: 'Champagne & Sparkling',
    kind: 'drink',
    station: B,
    course: 0,
    items: [
      { name: 'Veuve Clicquot', variants: [{ label: 'Bottle' }] },
      { name: 'Dom Pérignon', variants: [{ label: 'Bottle' }] },
      { name: 'Genevieve Blanc de Blancs', variants: [{ label: 'Bottle' }, { label: 'Glass' }] },
      { name: 'Genevieve Rosé', variants: [{ label: 'Bottle' }, { label: 'Glass' }] },
      { name: 'Valdo Etichetta Nera', variants: [{ label: 'Bottle' }, { label: 'Glass' }] },
    ],
  },
  {
    code: 'WHITE_HOUSE',
    name: 'White Wine — House Pour',
    kind: 'drink',
    station: B,
    course: 0,
    note: 'House pour list to be transcribed from the printed wine list before go-live.',
    items: [],
  },
  {
    code: 'WHITE_CONNOISSEUR',
    name: 'White Wine — Connoisseurs Selection',
    kind: 'drink',
    station: B,
    course: 0,
    note: 'Two rows below were cut off in the supplied scan — confirm bottle and glass prices.',
    items: [
      { name: 'Chateau Ste. Michelle Riesling', variants: [{ label: 'Bottle' }, { label: 'Glass' }] },
      { name: 'Snow Mountain Chenin Blanc', variants: [{ label: 'Bottle' }, { label: 'Glass' }] },
    ],
  },
  {
    code: 'ROSE',
    name: 'Rosé Wine',
    kind: 'drink',
    station: B,
    course: 0,
    items: [
      { name: 'Tokara Rosé', variants: [{ label: 'Bottle' }, { label: 'Glass' }] },
      { name: 'Laurensford The Dome', variants: [{ label: 'Bottle' }, { label: 'Glass' }] },
    ],
  },
  {
    code: 'RED_HOUSE',
    name: 'Red Wine — House Pour',
    kind: 'drink',
    station: B,
    course: 0,
    note: 'House pour list to be transcribed from the printed wine list before go-live.',
    items: [],
  },
  {
    code: 'RED_CONNOISSEUR',
    name: 'Red Wine — Connoisseur Selection',
    kind: 'drink',
    station: B,
    course: 0,
    items: [
      { name: 'Khorhoek', variants: [{ label: 'Bottle' }, { label: 'Glass' }] },
      { name: 'Asara Passione Pinotage', variants: [{ label: 'Bottle' }, { label: 'Glass' }] },
      { name: 'Amarone', variants: [{ label: 'Bottle' }] },
      { name: "Tokara Director's Reserve", variants: [{ label: 'Bottle' }] },
      { name: 'Rupert & Rothschild', variants: [{ label: 'Bottle' }] },
    ],
  },

  // ================================================= SPIRITS & BEERS
  // The printed spirits list was not supplied in machine-readable form. Each
  // category is created empty so the manager can bulk-load it with the CSV
  // importer (Admin → Menu → Import) — bottle and tot arrive as two SKUs.
  ...[
    ['BEERS', 'Beers'],
    ['APERITIFS', 'Aperitifs'],
    ['TEQUILA', 'Tequila'],
    ['RUM', 'Rum'],
    ['VODKA', 'Vodka'],
    ['GIN', 'Gin'],
    ['BOURBON', 'Bourbon'],
    ['SINGLE_MALT', 'Single Malt Whisky'],
    ['BLENDED_WHISKY', 'Blended Scotch, American & Irish Whisky'],
    ['LIQUEURS', 'Liqueurs'],
    ['COGNAC', 'Cognac & Brandy'],
  ].map(([code, name]) => ({
    code,
    name,
    kind: 'drink',
    station: B,
    course: 0,
    note: 'Bottle and tot prices to be imported from the printed spirits list.',
    items: [],
  })),
  {
    code: 'SOFT',
    name: 'Soft Drinks & Water',
    kind: 'drink',
    station: B,
    course: 0,
    items: [
      { name: 'Sodas' },
      { name: 'Still Water', variants: [{ label: '500ml' }, { label: '1 litre' }] },
      { name: 'Sparkling Water', variants: [{ label: '500ml' }, { label: '1 litre' }] },
      { name: 'Energy Drink' },
    ],
  },

  // ======================================================== COCKTAILS
  {
    code: 'SIGNATURES',
    name: 'Signature Cocktails',
    kind: 'drink',
    station: B,
    course: 0,
    items: [
      'Highlander',
      'Daddy Issues',
      'Farm of Berries',
      'Passion Caiproska',
      'Hawaiian Martini',
      'Empress Elderflower',
      'Blood Orange Sour',
      'In the Beginning',
    ].map((name) => ({ name })),
  },
  {
    code: 'CLASSICS',
    name: 'Classic Cocktails',
    kind: 'drink',
    station: B,
    course: 0,
    items: [
      'Long Island',
      'Bullfrog',
      'Whiskey Sour',
      'Old Fashioned',
      'Negroni',
      'Margarita',
      'Martini',
      'Cosmopolitan',
      'Moscow Mule',
      'Espresso Martini',
      'Pornstar Martini',
      'Caipirinha',
    ].map((name) => ({ name })),
  },
  {
    code: 'BUBBLES',
    name: 'Bubbles',
    kind: 'drink',
    station: B,
    course: 0,
    items: [{ name: 'Mimosa' }, { name: 'French 75' }],
  },
  {
    code: 'MOCKTAILS',
    name: 'Mocktails',
    kind: 'drink',
    station: B,
    course: 0,
    note: 'All mocktails KES 800.',
    items: ['Claremont', 'Passionately Fizzy', 'Batman', 'Berry Coals', 'Virgin Mojito'].map((name) => ({
      name,
      price: 800,
      dietary: ['non-alcoholic'],
    })),
  },
];

/** Four service zones. Codes form the first half of every table ID. */
export const sections = [
  { code: 'BAR', name: 'Bar Side', description: 'Bar seating and lounge tables.', tables: 12 },
  { code: 'WW', name: 'West Wing', description: 'Dining room, west side.', tables: 16 },
  { code: 'EW', name: 'East Wing', description: 'Dining room, east side.', tables: 16 },
  {
    code: 'CLM',
    name: 'Clairmont Side',
    description: 'Additional dining and lounge area. Confirm the exact spelling with the client.',
    tables: 10,
  },
];
