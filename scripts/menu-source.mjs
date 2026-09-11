/**
 * The Lord Erroll menu, transcribed from the printed menus.
 *
 * Sources, all supplied by the restaurant:
 *   - "Ala Carte Erroll Menu_060225"   — food
 *   - "LORD ERROLL (DRINKS MENU)"      — wine, beer, spirits, soft drinks
 *   - "The Cocktail Menu"              — cocktails and mocktails
 *   - "STANDARD BUFFET MENU AND PRICES" — set menus and buffets
 *
 * Prices are Kenyan shillings, exactly as printed. Where the printed menu gives
 * no price, `price` is null and the item stays flagged for a manager, because a
 * guessed price on a real bill is worse than a visible gap.
 *
 * `allergens` are PROPOSED from the printed descriptions. They are a starting
 * point for the chef, never a substitute: every item stays unsigned until a chef
 * signs it off in Admin → Menu.
 */

// Bottle and tot, as the drinks menu prints them.
const spirit = (name, bottle, tot) => ({
  name,
  variants: tot == null ? [{ label: 'Bottle', price: bottle }] : [
    { label: 'Bottle', price: bottle },
    { label: 'Tot', price: tot },
  ],
});

export const MENU = [
  // ------------------------------------------------------------------ food
  {
    category: 'OYSTERS',
    items: [
      {
        name: 'Fresh Indian Ocean Oysters',
        description: 'Served fresh on ice with herb mignonette, tabasco and charred lemon.',
        variants: [{ label: '6 pieces', price: 1250 }, { label: '12 pieces', price: 2200 }],
        allergens: ['shellfish'],
      },
      {
        name: 'Oysters Rockefeller',
        description: 'Oven baked, topped with a rich sauce of butter, parsley, spinach and bread crumbs.',
        variants: [{ label: '6 pieces', price: 1250 }, { label: '12 pieces', price: 2200 }],
        allergens: ['shellfish', 'dairy', 'gluten'],
      },
    ],
  },
  {
    category: 'STARTERS',
    items: [
      { name: 'Tuna Tartare', price: 1950, allergens: ['fish', 'shellfish', 'soy', 'sesame'],
        description: 'Fresh tuna cubes tartare, avocado puree, soya glaze, cucumber, radish, pickled onions, toasted sesame seeds, shrimp cracker.' },
      { name: 'Beetroot & Goat Cheese', price: 2200, allergens: ['dairy', 'nuts'], dietary: ['vegetarian'],
        description: 'Caramelized beets, baked goat cheese on rocket, cashew nut salsa and orange vinaigrette.' },
      { name: 'Beef Carpaccio', price: 2400, allergens: ['dairy', 'egg'],
        description: 'Thinly sliced beef tenderloin topped with garlic aioli, sundried tomatoes, parmesan, rocket leaves, garlic chips, balsamic reduction and olive oil.' },
      { name: 'Tempura Prawns', price: 2800, allergens: ['shellfish', 'gluten', 'egg'],
        description: 'Delicate layer of batter, panko style deep fried with pickled ginger and tempura sauce.' },
      { name: 'Octopus Carpaccio', price: 1800, allergens: ['shellfish'],
        description: 'Thin slices of octopus seasoned in a bright citrus vinaigrette.' },
    ],
  },
  {
    category: 'SOUPS',
    items: [
      { name: 'Seafood Bisque', price: 1950, allergens: ['shellfish', 'fish', 'dairy'],
        description: 'Highly seasoned soup of French origin, rich and aromatic with chunks of seafood.' },
      { name: 'Clear Chicken Broth', price: 1450, allergens: [],
        description: 'A delicious blend of tender chicken, fresh vegetables and savoury broth.' },
      { name: 'Roasted Butternut', price: 1400, allergens: ['dairy'], dietary: ['vegetarian'],
        description: 'Creamy and delicious with depth of flavour.' },
      { name: 'Tomato & Bell Pepper', price: 1400, allergens: [], dietary: ['vegetarian'],
        description: 'Slowly roasted tomatoes and bell peppers infused with garlic, basil and oregano.' },
    ],
  },
  {
    category: 'SALADS',
    items: [
      { name: 'Classic Caesar', price: 2250, allergens: ['dairy', 'gluten', 'egg', 'fish'],
        description: 'Crispy hearts of romaine tossed in robust Caesar dressing, topped with herbed croutons, parmesan shavings and grilled chicken breast.' },
      { name: 'Fig, Burrata & Arugula', price: 2250, allergens: ['dairy', 'nuts', 'gluten'], dietary: ['vegetarian'],
        description: 'Artisan burrata on a bed of arugula with figs, walnuts, caramelized onions with toast.' },
      { name: 'Salad Niçoise', price: 1800, allergens: ['fish', 'egg', 'mustard'],
        description: 'Seared tuna, green beans, boiled eggs, olives, anchovies, mixed lettuce, baby potato, roasted bell peppers in Dijon mustard dressing.' },
      { name: 'Hummus with Pita', price: 1450, allergens: ['sesame', 'gluten'], dietary: ['vegetarian', 'vegan'],
        description: 'Mashed chick peas blended with tahini, olive oil, salt, garlic and lemon juice, with oven fresh pita bread.' },
    ],
  },
  {
    category: 'GRILL',
    items: [
      { name: 'Dry Aged Porterhouse 500g', price: 5500, allergens: [],
        description: 'Uniqueness lies in its impressive tantalizing combination of tender fillet and flavourful strip steak.' },
      { name: 'Dry Aged Ribeye 300g', price: 4950, allergens: ['dairy'],
        description: 'Well marbled prime cut, seasoned with pepper and salt with compound butter.' },
      { name: 'Ostrich Steak', price: 4500, allergens: ['sulphites'],
        description: 'Ostrich steak 300g. Low in fat, lean, rich in flavour, pan seared and served with a flavourful red wine sauce and fresh parsley.' },
      { name: 'Tea-smoked BBQ Lamb Chops', price: 3200, allergens: [],
        description: 'Carefully selected cutlets of lamb, accompanied with minty chimichurri sauce.' },
      { name: 'Chicken Marbella', price: 2950, allergens: [],
        description: 'Tender chicken marinated in a sweet, savoury mixture of capers, olives, prunes, herbs and fennel quinoa orange salad.' },
      { name: 'Five Spice Duck Breast', price: 3650, allergens: ['soy'],
        description: 'Five spice crispy duck breast, glossy celeriac purée, braised red cabbage and glazed baby root vegetables with five spice sticky-sweet sauce.' },
      { name: 'Beef Short Ribs', price: 2800, allergens: ['sulphites'],
        description: 'Slowly braised short ribs in red wine with sweet and sour onions, sautéed mushrooms.' },
      { name: 'Ossobuco Milanese', price: 2800, allergens: ['dairy'],
        description: 'A classic, slow braised beef ossobuco, rich in flavour, accompanied with traditional Milanese risotto.' },
    ],
  },
  {
    category: 'OCEAN',
    items: [
      { name: 'Grilled Lobster', price: 6500, allergens: ['shellfish', 'dairy'],
        description: 'Lobster char grilled to perfection, coated with a tamarind butter sauce.' },
      { name: 'Lobster Thermidor', price: 7500, allergens: ['shellfish', 'dairy', 'mustard'],
        description: 'Mushroom mustard creamy sauce, baked in shell topped with gruyère cheese.' },
      { name: 'King Prawns', price: 4350, allergens: ['shellfish'],
        description: 'Large prawns marinated in chilli garlic pink sauce accompanied with rice pilaf.' },
      { name: 'Crispy Skin Salmon Fillet', price: 4850, allergens: ['fish', 'dairy'],
        description: 'Pan seared fillet of salmon, sugar snaps and broccoli florets, in saffron beurre blanc.' },
      { name: 'Fillet de Poisson', price: 2850, allergens: ['fish', 'dairy'],
        description: 'Griddled seasoned fish fillet with salsa creole and creamy lemon dill sauce.' },
      { name: 'Tuna Steak', price: 3250, allergens: ['fish', 'soy'],
        description: 'Shichimi togarashi seared tuna steak with sweet miso ginger sauce.' },
      { name: 'Grilled Octopus', price: 2950, allergens: ['shellfish'],
        description: 'Where tender charred tentacles meet a zesty marinade for a burst of Mediterranean flavours.' },
    ],
  },
  {
    // Every side is 900 on the printed menu.
    category: 'SIDES',
    items: [
      { name: 'Champ Mashed Potato', price: 900, allergens: ['dairy'], dietary: ['vegetarian'] },
      { name: 'Matchstick Fries', price: 900, allergens: [], dietary: ['vegetarian', 'vegan'] },
      { name: 'Sweet Mashed Potato', price: 900, allergens: ['dairy'], dietary: ['vegetarian'] },
      { name: 'Mediterranean Rice', price: 900, allergens: [], dietary: ['vegetarian'] },
      { name: 'Creamy Spinach', price: 900, allergens: ['dairy'], dietary: ['vegetarian'] },
      { name: 'Organic Leaf Salad', price: 900, allergens: [], dietary: ['vegetarian', 'vegan'] },
      { name: 'Chilly Garlic Broccoli', price: 900, allergens: [], dietary: ['vegetarian', 'vegan'] },
      { name: 'Onion Rings', price: 900, allergens: ['gluten'], dietary: ['vegetarian'] },
    ],
  },
  {
    category: 'GREENFIRE',
    items: [
      { name: 'Gnocchi', price: 1950, allergens: ['gluten', 'dairy'], dietary: ['vegetarian'],
        description: 'Potato dumplings in a rich sundried tomato pesto sauce.' },
      { name: 'Four Cheese Ravioli', price: 1950, allergens: ['gluten', 'dairy', 'egg'], dietary: ['vegetarian'],
        description: 'Stuffed pasta pillows with a rich three cheese blend in butter and sage sauce.' },
      { name: 'Beetroot & Feta Risotto', price: 2500, allergens: ['dairy', 'nuts'], dietary: ['vegetarian'],
        description: 'Impressive bold combination, accompanied by sage and toasted nuts. Vegan option available.' },
      { name: 'Mushroom & Parmigiano Risotto', price: 2500, allergens: ['dairy'], dietary: ['vegetarian'],
        description: 'Rich and creamy risotto infused with parmigiano, wild mushroom and parsnip ragout with cheesy polenta.' },
      { name: 'Spaghetti Aglio Olio', price: 1800, allergens: ['gluten'], dietary: ['vegetarian', 'vegan'],
        description: 'Traditional pasta dish, made with simple and fresh flavours, seasoned with the best olive oil and topped with chilli flakes.' },
      { name: 'Wild Mushroom Ragout', price: 2200, allergens: ['dairy'], dietary: ['vegetarian'],
        description: 'Hearty mushroom ragout served over creamy polenta.' },
    ],
  },
  {
    category: 'DESSERTS',
    items: [
      { name: 'Lords Cheesecake', price: 1300, allergens: ['dairy', 'gluten', 'egg'], dietary: ['vegetarian'],
        description: 'Creamy and smooth, choose your favourite topping.' },
      { name: 'Molten Lava Cake', price: 1300, allergens: ['dairy', 'gluten', 'egg'], dietary: ['vegetarian'],
        description: '70% Callebaut chocolate mi-cuit, and home made vanilla ice cream.' },
      { name: 'Lemon Meringue Pie', price: 1000, allergens: ['dairy', 'gluten', 'egg'], dietary: ['vegetarian'],
        description: 'Lemon curd tart topped with Italian meringue.' },
      { name: 'Affogato', price: 900, allergens: ['dairy'], dietary: ['vegetarian'],
        description: 'Traditional Italian coffee dessert, espresso poured over vanilla ice cream, for a perfect after dinner treat.' },
      { name: 'Sticky Toffee Pudding', price: 1350, allergens: ['dairy', 'gluten', 'egg'], dietary: ['vegetarian'],
        description: 'Moist sponge cake, made with finely chopped dates and covered in a warm butterscotch sauce and vanilla ice cream.' },
      { name: 'Sweet Banana Flambé', price: 1100, allergens: ['dairy'], dietary: ['vegetarian'],
        description: 'Caramelized sweet bananas in a boozy butterscotch sauce.' },
      { name: 'Crème Brûlée', price: 1400, allergens: ['dairy', 'egg'], dietary: ['vegetarian'] },
      { name: 'Tropical Fruit Selection', price: 900, allergens: [], dietary: ['vegetarian', 'vegan'] },
      { name: 'Home-made Sorbet & Ice Cream', price: 900, allergens: ['dairy'], dietary: ['vegetarian'],
        description: 'Two scoops of home-made real fruit sorbet or ice cream.' },
    ],
  },
  {
    category: 'SETMENUS',
    items: [
      { name: 'Sorbet Starter Set Menu', price: 6500, allergens: ['fish', 'dairy', 'egg'],
        description: 'USD 50.00 per person. Sorbet, grilled tuna or asparagus with deep egg, carrot velouté, then grilled sous vide beef fillet, pan seared snapper or eggplant lasagna.' },
      { name: 'Starters, Mains & Desserts Set Menu', price: 6500, allergens: ['dairy', 'fish'],
        description: 'USD 50.00 per person. Roasted bell pepper or beetroot and goat cheese, pan seared red snapper fillet or green peas risotto, tropical fruit cuts with sorbet or date pudding with vanilla ice cream.' },
      // The printed three-course menu carries no price. Left unpriced on purpose:
      // a manager enters it, rather than the system inventing a number for a bill.
      { name: 'Three Course Set Menu', price: null, allergens: ['dairy', 'fish', 'gluten'],
        description: 'Roasted butter soup or pear salad with blue cheese dressing, beef medallions, pan seared fish fillet or grilled chicken breast, black forest slice or tropical fruit.' },
      { name: 'Regular Buffet', price: 6500, allergens: ['fish', 'dairy', 'gluten'],
        description: 'KSH 6,500 per person. Butternut soup, salads, grilled fish in coconut sauce, roast chicken, seasonal vegetables, steamed jasmin rice, roast potatoes, pasta primavera, pineapple pie and chocolate gateaux.' },
      { name: 'Gold Buffet', price: 6850, allergens: ['shellfish', 'dairy', 'gluten'],
        description: 'KES 6,850 per person. Roast bell pepper soup, salads, calamari in sweet and sour sauce, chicken breast in creamy mushroom sauce, braised beef short ribs, pasta primavera, sides and desserts.' },
      { name: 'Buffet Menu', price: 6850, allergens: ['fish', 'dairy', 'gluten'],
        description: 'KES 6,850 per person. Roast bell pepper soup, potato salad, tilapia in coconut sauce, oven fried chicken, minute steak medallion, gnocchi in tomato sauce, sides and desserts.' },
    ],
  },

  // ----------------------------------------------------------------- wine
  {
    category: 'CHAMPAGNE',
    items: [
      { name: 'Veuve Clicquot', variants: [{ label: 'Bottle', price: 30000 }],
        description: 'Pinot Noir, Reims, France. A fine and elegant nose of citrus peel, almonds and vanilla with a savoury, nutty finish on the palate.' },
      { name: 'Dom Pérignon', variants: [{ label: 'Bottle', price: 98000 }],
        description: 'Chardonnay and Pinot Noir, Hautvillers, France. Full bodied and crisp with notes of tangerine, buttered toast, honey, pear and almonds with a touch of minerality on the palate.' },
      { name: 'Genevieve Blanc de Blancs', variants: [{ label: 'Bottle', price: 18000 }],
        description: 'A richer vintage showing a light gold reflection, candied citrus and young yellow peach on the nose with a layer of appetising complexity of honey melon and almonds.' },
      { name: 'Genevieve Rosé', variants: [{ label: 'Bottle', price: 15000 }],
        description: 'Salmon sunset colour with a delectable fine mousse. Cherry and pomegranate aromas on the nose accentuate fresh white strawberries and white peach flavours with a silky finish.' },
      { name: 'Valdo Etichetta Nera', variants: [{ label: 'Bottle', price: 6900 }],
        description: 'Extra dry. Brilliant straw coloured with fruity and floral notes with a slight mineral aftertaste.' },
    ],
  },
  {
    category: 'WHITE_HOUSE',
    items: [
      { name: 'Arabella Viognier', price: 1000,
        description: 'House pour, by the glass. An expression filled with citrus, ripe apricot and a subtle spiciness. Full bodied elegance on the palate.' },
      { name: 'House Sweet White', price: 1000, description: 'House pour, by the glass.' },
    ],
  },
  {
    // The printed white wine list between the house pour and the connoisseurs
    // selection, which had no category of its own in the system.
    category: 'WHITE',
    items: [
      { name: 'Chai D\'Oeuvre Chardonnay', variants: [{ label: 'Bottle', price: 7500 }],
        description: 'South of France. Aromatic intensity with aromas of white exotic fruits and coconut. Full bodied wine, elegant hints of oak barrel combined with coconut and vanilla notes.' },
      { name: 'Romeo & Juliet Pinot Grigio', variants: [{ label: 'Bottle', price: 6500 }],
        description: 'Delle Venezie, Italy. Fragrant and fruity, the nose offers acacia blossom and pear. It is easy drinking with a fresh and intense palate, well balanced.' },
      { name: 'Cantina Lavis Gewürztraminer', variants: [{ label: 'Bottle', price: 9000 }],
        description: 'Trentino, Italy. A wine with a complex and full nose, with aromas of tropical fruit, cloves and nutmeg.' },
      { name: 'Chateau Ste. Michelle Riesling', variants: [{ label: 'Bottle', price: 9500 }],
        description: 'Sweet Riesling. Harvest rich flavours of ripe peaches balanced with crisp Washington Riesling acidity.' },
      { name: 'Snow Mountain Chenin Blanc', variants: [{ label: 'Bottle', price: 7000 }],
        description: 'South Africa. This French oak barrel fermented Chenin Blanc is aromatic and richly textured with hints of almond and honey.' },
      { name: 'Benguela Cove Lighthouse Collection', variants: [{ label: 'Bottle', price: 6000 }],
        description: 'Sauvignon Blanc, Walker Bay, South Africa. Explosive gooseberry and grapefruit with hints of ripe guava, lemon zest and top notes of rose blossoms.' },
      { name: 'Southern Ocean Sauvignon Blanc', variants: [{ label: 'Bottle', price: 9000 }],
        description: 'New Zealand. Lime, lemon and asparagus noted interplay with the allure of juicy tropical fruits, creating a fragrant bouquet that tantalizes your senses.' },
      { name: 'Diemersdal Gruner Veltliner Sauvignon Blanc', variants: [{ label: 'Bottle', price: 8000 }],
        description: 'An intense Sauvignon Blanc with concentrated aromas on the nose that follows through on the palate. A strong core of minerality with a flinty elegance, a rounded mouth-feel with nectarine and kiwi, and balanced acidity on the finish.' },
    ],
  },
  {
    category: 'WHITE_CONNOISSEUR',
    items: [
      { name: 'MeerLust Chardonnay', variants: [{ label: 'Bottle', price: 15000 }],
        description: 'Stellenbosch. Bright pale yellow colour with green, vivacious hue. Complex appealing nose of apricot, pear, peach and lemon zest, floral notes with toasted almonds. A long, very pleasant lingering finish.' },
      { name: 'Asara Amphora Chenin Blanc 2018', variants: [{ label: 'Bottle', price: 18000 }],
        description: 'Pure, elegant and vibrant fresh in style, with layers of clean Chenin Blanc fruit balanced with a lengthy lively white tannin finish. Extraordinary layers of fresh pure Chenin Blanc aromas like quince, white peach and fresh lime.' },
    ],
  },
  {
    category: 'ROSE',
    items: [
      { name: 'Tokara Rosé', variants: [{ label: 'Bottle', price: 6900 }],
        description: 'Blush pink colour, with a vibrant core, medley of sweet ripe red berries including strawberries and cranberries with alluring rosewater undertones.' },
      { name: 'Laurensford The Dome', variants: [{ label: 'Bottle', price: 9000 }],
        description: 'Rosé. Strawberry, rose petal and watermelon on the nose that leads to flavours of grapefruit and pineapple with a touch of lemon zest that lingers on a flinty and textured finish.' },
    ],
  },
  {
    category: 'RED_HOUSE',
    items: [
      { name: 'Arabella Merlot', price: 1000,
        description: 'House pour, by the glass. South Africa. Succulent flavours of ripe plum and blackcurrant, enhanced with hints of coffee and chocolate.' },
      { name: 'House Natural Sweet Red', price: 1000,
        description: 'House pour, by the glass. Aromatic sweet wine with rich palate redolent of tropical fruits.' },
    ],
  },
  {
    // As with the whites, the printed red list between house pour and connoisseur.
    category: 'RED',
    items: [
      { name: 'Grange Des Dentelles Côtes Du Rhône', variants: [{ label: 'Bottle', price: 7000 }],
        description: 'Grenache, Syrah, France. Rich and silky on the palate with intense purple colour combined with sweet spices and black fruits.' },
      { name: 'Silk and Spice', variants: [{ label: 'Bottle', price: 8500 }],
        description: 'Portugal. The blackberries and ripe plum blend perfectly with spicy notes of vanilla, black pepper and pink peppercorn.' },
      { name: 'Diemersfontein Shiraz', variants: [{ label: 'Bottle', price: 10000 }],
        description: 'South Africa. A fusion of sour cherries, vanilla, spice and violets entice the senses, resulting in a full-bodied and lingering finish.' },
      { name: 'Bodega Navarro Correas Reserva', variants: [{ label: 'Bottle', price: 9000 }],
        description: 'Malbec, Mendoza, Argentina. Medium to full bodied with notes of plums, cherries and black pepper.' },
      { name: 'Les Coq IGP OC Malbec', variants: [{ label: 'Bottle', price: 10000 }],
        description: 'France. The robe of dark garnet, intensive aromas dominated by red and black fruits at late maturity, notes of cranberry and spices, full bodied, silky on the palate.' },
      { name: 'Asara Cape Fusion', variants: [{ label: 'Bottle', price: 8500 }],
        description: 'South Africa. Fresh, elegant, packing middle palate weight. Harmonious blend with complex layers of spice, mocha and dark berry aromas, full with luscious blackberry, dark chocolate and sweet violet flavours with a dry yet fruity finish.' },
      { name: 'Chai D\'Oeuvre Pinot Noir', variants: [{ label: 'Bottle', price: 7500 }],
        description: 'France. Dark deep and intense colour, a complex nose of black fruit and cherry with notes of spices and exceptional aromatic taste.' },
      { name: 'Chai D\'Oeuvre Cabernet Sauvignon', variants: [{ label: 'Bottle', price: 7500 }],
        description: 'France. Deep intense purple robe. The nose gives black fruits with spices, raspberry and black currant notes. Generous and ripe on the palate with tannins nicely smoothed out.' },
      { name: 'Desire Lush & Zin Primitivo', variants: [{ label: 'Bottle', price: 8500 }],
        description: 'Italy. A deep red colour, a warm nose that reveals intense aromas of plums, red fruits, vanilla, coffee and cocoa. Warm and round on the palate, full bodied, with soft and velvety tannins.' },
      { name: 'Castelet Saint Pierre AOP Corbières', variants: [{ label: 'Bottle', price: 9500 }],
        description: 'France. A dark colour with purple hues, offering beautiful aromatic complexity dominated by red fruits. The tannins are powerful and long-lasting, balanced by a pleasant freshness.' },
    ],
  },
  {
    category: 'RED_CONNOISSEUR',
    items: [
      { name: 'Khorhoek', variants: [{ label: 'Bottle', price: 19000 }],
        description: 'Cabernet Sauvignon, South Africa. Opens with red berries, cranberries and cassis aromas, followed by layers of sour cherry, flint and leather. Juicy dark fruits and ripe plums wrapped in soft velvety tannins.' },
      { name: 'Asara Passione Pinotage', variants: [{ label: 'Bottle', price: 28000 }],
        description: 'South Africa. Unique pinotage with well-integrated layering of spicy richness and balanced tannins in the palate. Full bodied with dark cherry cassis flavour.' },
      { name: 'Amarone', variants: [{ label: 'Bottle', price: 25000 }],
        description: 'Black Label, Amarone della Valpolicella, Italy. Intensive red colour, the nose is fruity with notes of blackberries and dark chocolate. Elegant and refined with silky tannins.' },
      { name: "Tokara Director's Reserve", variants: [{ label: 'Bottle', price: 22000 }],
        description: 'South Africa. Deep red, the nose showcases complex aromas of dried tobacco leaf, subtle violet flower, dried currants, baking spice and graphite. Mid-palate leads to fine yet dense tannins and a lengthy finish.' },
      { name: 'Rupert & Rothschild', variants: [{ label: 'Bottle', price: 19000 }],
        description: 'Classique, South Africa. Alluring plush black fruits, earthy notes and pencil chippings, followed by a layered complexity. Smooth tannins that contain spice and dark chocolate on the palate.' },
    ],
  },

  // ------------------------------------------------------- beer and spirits
  {
    category: 'BEERS',
    items: [
      { name: 'Tusker Lager', price: 600, allergens: ['gluten'] },
      { name: 'Tusker Lite', price: 600, allergens: ['gluten'] },
      { name: 'Tusker Malt', price: 600, allergens: ['gluten'] },
      { name: 'Tusker Cider', price: 600, allergens: ['sulphites'] },
      { name: 'White Cap Lager', price: 600, allergens: ['gluten'] },
      { name: 'Smirnoff Black Ice', price: 600, allergens: [] },
      { name: 'Guinness', price: 600, allergens: ['gluten'] },
      { name: 'Heineken', price: 700, allergens: ['gluten'] },
      { name: 'Corona', price: 700, allergens: ['gluten'] },
      { name: 'Savannah Cider', price: 700, allergens: ['sulphites'] },
      { name: 'Bila Shaka', price: 500, allergens: ['gluten'] },
    ],
  },
  {
    category: 'APERITIFS',
    items: [
      { name: 'Martini Bianco', price: 600, allergens: ['sulphites'] },
      { name: 'Martini Rosso', price: 600, allergens: ['sulphites'] },
      { name: 'Martini Extra Dry', price: 600, allergens: ['sulphites'] },
      { name: 'Aperol', price: 600 },
      { name: 'Pimms', price: 600 },
      { name: 'Campari Ricard', price: 600 },
      { name: 'Angostura Bitters', price: 600 },
      { name: 'Fernet Branca', price: 600 },
    ],
  },
  {
    category: 'TEQUILA',
    items: [
      spirit('Jose Cuervo Gold', 7500, 800),
      spirit('Jose Cuervo Silver', 7000, 700),
      spirit('Don Julio Anejo', 15000, 800),
      spirit('Don Julio Bianco', 15000, 900),
      spirit('Don Julio Repasado', 15000, 1000),
      spirit('Clase Azul Reposada', 95000, 5500),
    ],
  },
  {
    category: 'RUM',
    items: [
      spirit('Bacardi Clear', 6500, 500),
      spirit('Bacardi Casa Oro', 8500, 500),
      spirit('Captain Morgan Dark', 6500, 500),
      spirit('Captain Morgan Spiced', 6500, 500),
      spirit('Bumbu Original', 15000, 600),
      spirit('Malibu', 6500, 500),
    ],
  },
  {
    category: 'VODKA',
    items: [
      spirit('Ciroc', 16000, 800),
      spirit('Beluga', 15000, 800),
      spirit('Grey Goose', 15000, 800),
      spirit('Ketel One', 7500, 600),
      spirit('Absolut Vodka', 7000, 500),
      spirit('Smirnoff Vodka Red', 7000, 500),
    ],
  },
  {
    category: 'GIN',
    items: [
      spirit('Bombay', 8000, 600),
      spirit('Gordons Original', 7500, 500),
      spirit("Gordon's Pink", 7500, 600),
      spirit('Hendricks', 12000, 800),
      spirit('Tanqueray Original', 8000, 600),
      spirit('Tanqueray No 10', 10000, 700),
      spirit('Botanist', 12000, 800),
      spirit('Beefeater Pink', 6500, 500),
      spirit('Four Pillars Bloody', 15000, 1000),
      spirit('Blue Bottle Artisan Dry', 14000, 900),
      spirit('Four Pillars Spiced Negroni', 15000, 1000),
      spirit('Mombasa Club', 10000, 900),
    ],
  },
  {
    category: 'BOURBON',
    items: [
      spirit('Bulleit', 11000, 700),
      spirit('Monkey Shoulder 47', 13000, 900),
    ],
  },
  {
    category: 'SINGLE_MALT',
    items: [
      spirit('Lagavulin', 25000, 1500),
      spirit('Talisker', 18000, 1200),
      spirit('Singleton of Dufftown 12yrs', 14000, 800),
      spirit('Singleton of Dufftown 15yrs', 18000, 1200),
      spirit('Singleton of Dufftown 18yrs', 25000, 1500),
      spirit('Glenfiddich 12yrs', 18000, 1200),
      spirit('Glenfiddich 15yrs', 20000, 1500),
      spirit('Glenfiddich 18yrs', 30000, 1800),
      spirit('Glenlivet 12yrs', 15000, 1000),
      spirit('Glenlivet 15yrs', 22000, 1600),
      spirit('Glenmorangie Original 10yrs', 12000, 800),
      spirit('Glenmorangie Original 12yrs', 18000, 1000),
      spirit('Macallan 12yrs', 20000, 1500),
      // The printed menu gives a bottle price only for the 15 year old.
      spirit('Macallan 15yrs', 55000, null),
      spirit('Glenkinchie 12yrs', 15000, 1000),
      spirit('Caol Ila 12yrs', 18000, 1200),
      spirit('Bushmills 10yrs', 14000, 1000),
    ],
  },
  {
    category: 'BLENDED_WHISKY',
    items: [
      spirit('Johnnie Walker Black', 12000, 800),
      spirit('Johnnie Walker Double Black', 18000, 1200),
      spirit('Johnnie Walker Gold', 18000, 1200),
      spirit('Johnnie Walker Platinum 18yrs', 30000, 1800),
      // Bottle service only on the printed menu.
      spirit('Johnnie Walker King George V', 120000, null),
      spirit('Jameson Irish Original', 8000, 500),
      spirit('Jameson Irish Black Barrel', 13000, 800),
      spirit('Jack Daniels Honey', 12000, 800),
      spirit('Jack Daniels No 7', 9000, 700),
      spirit('Chivas Regal 12yrs', 12000, 800),
      spirit('Chivas Regal 18yrs', 20000, 1200),
    ],
  },
  {
    category: 'LIQUEURS',
    items: [
      spirit('Blue Curacao', 5500, 300),
      spirit('Triple Sec', 6000, 300),
      { ...spirit('Kahlua', 8000, 400), allergens: ['dairy'] },
      { ...spirit('Amarula', 7500, 500), allergens: ['dairy'] },
      { ...spirit('Baileys', 7500, 500), allergens: ['dairy'] },
      spirit('Cointreau', 9000, 500),
      spirit('Drambuie', 9000, 500),
      spirit('Grand Marnier', 9500, 600),
      spirit('Jägermeister', 10000, 600),
    ],
  },
  {
    category: 'COGNAC',
    items: [
      spirit('Hennessy VS', 16000, 1000),
      spirit('Hennessy VSOP', 22000, 1500),
      spirit('Hennessy XO', 60000, null),
      spirit('Martell VS', 14000, 1000),
      spirit('Martell VSOP', 19000, 1200),
      spirit('Martell XO', 55000, null),
      spirit('Martell Blue Swift', 20000, 1200),
      spirit('Remy Martin VSOP', 22000, 1500),
    ],
  },

  // -------------------------------------------------- soft drinks and water
  {
    category: 'SOFT',
    items: [
      { name: 'Coke 300ml', price: 350 },
      { name: 'Coke Zero 300ml', price: 350 },
      { name: 'Fanta Orange 300ml', price: 350 },
      { name: 'Sprite 300ml', price: 350 },
      { name: 'Stoney 300ml', price: 350 },
      { name: 'Bitter Lemon 300ml', price: 350 },
      { name: 'Soda Water 300ml', price: 350 },
      { name: 'Tonic Water 300ml', price: 350 },
      { name: "Mayer's Still Water 750ml", price: 600, renameFrom: 'Still Water' },
      { name: "Mayer's Sparkling Water 750ml", price: 700, renameFrom: 'Sparkling Water' },
      { name: 'Red Bull 300ml', price: 500, renameFrom: 'Energy Drink' },
    ],
  },

  // ------------------------------------------------------------- cocktails
  {
    category: 'SIGNATURES',
    items: [
      { name: 'Highlander', price: 1250, description: 'Rum, Midori, aquafaba, simple syrup.' },
      { name: 'Daddy Issues', price: 1200, description: 'Bacardi, spiced rum, pineapple shrub, triple sec, lime juice, bitters, ginger beer.' },
      { name: 'Farm of Berries', price: 1200, description: 'Triple berries, vodka, sweet and sour, soda water.' },
      { name: 'Passion Caiproska', price: 1200, description: 'Passion, sugar, vodka, lemon.' },
      { name: 'Hawaiian Martini', price: 1200, description: 'Vodka, rum, triple sec, pineapple, grenadine, lime.' },
      { name: 'Empress Elderflower', price: 1250, description: 'Gin, blueberry, elderflower, rosemary, soda water.' },
      { name: 'Blood Orange Sour', price: 1200, description: 'Orange juice, gin, aquafaba.' },
      { name: 'In the Beginning', price: 1200, description: 'Gin, berry cordial, tonic.' },
    ],
  },
  {
    category: 'CLASSICS',
    items: [
      { name: 'Long Island', price: 1500, description: 'Vodka, rum, gin, tequila, triple sec, lemon juice, cola.' },
      { name: 'Bullfrog', price: 1500, description: 'Vodka, tequila, gin, sweet and sour, topped up with Red Bull.' },
      { name: 'Whiskey Sour', price: 1200, description: 'Whiskey bitters with aquafaba, simple syrup.' },
      { name: 'Old Fashioned', price: 1100, description: 'Whisky, sugar, bitters, soda water.' },
      { name: 'Negroni', price: 1200, description: 'Gin, Campari, rosso.' },
      { name: 'Margarita', price: 1200, description: 'Tequila, triple sec, lime juice.' },
      { name: 'Martini', price: 1200, description: 'Gin, dry vermouth, ice, lemon twist or olive.' },
      { name: 'Cosmopolitan', price: 1200, description: 'Vodka, triple sec, cranberry, lime.' },
      { name: 'Moscow Mule', price: 1200, description: 'Vodka, sweet and sour, mint leaves, ginger beer.' },
      { name: 'Espresso Martini', price: 1200, description: 'Vodka, Kahlua, espresso.' },
      { name: 'Pornstar Martini', price: 1200, description: 'Vodka, vanilla, passion, sweet and sour, prosecco.' },
      { name: 'Caipirinha', price: 1200, description: 'White rum, lime, sugar, sweet and sour.' },
    ],
  },
  {
    category: 'BUBBLES',
    items: [
      { name: 'Mimosa', price: 1200, description: 'Prosecco and orange juice.' },
      { name: 'French 75', price: 1200, description: 'Gin and prosecco.' },
    ],
  },
  {
    // Every mocktail is 800 on the printed menu.
    category: 'MOCKTAILS',
    items: [
      { name: 'Claremont', price: 800, description: 'Kiwi, espresso, lime and simple syrup.' },
      { name: 'Passionately Fizzy', price: 800, description: 'Passion, pineapple, lemon, simple syrup and soda.' },
      { name: 'Batman', price: 800, description: 'Orange, sprite, grenadine, sweet and sour.' },
      { name: 'Berry Coals', price: 800, description: 'Mixed berries, sweet and sour, soda, lime.' },
      { name: 'Virgin Mojito', price: 800, description: 'Lemons, mint, sweet and sour, sprite.' },
    ],
  },
];
