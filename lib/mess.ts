// IIM Kozhikode Students Mess Menu — October 2026 (tentative; day-wise, not date-wise).
export interface Meal {
  veg: string[]
  special?: string[] // non-veg / egg / fish / chicken / paneer-special — highlighted
  extras?: string[]  // paid add-ons (chargeable), listed in the menu's "Extras" row
}
export interface DayMenu {
  breakfast: Meal
  lunch: Meal
  dinner: Meal
}

export const MESS_NOTE = 'Menu is tentative — changes may occur based on market availability.'

// Keyed by weekday code (MON…SUN).
// `special` carries the sheet's SPL VEG / FISH-EGG rows at lunch and its VEG / NON VEG rows at
// dinner, veg dish first. Saturday lunch prints neither row this month, so it has no special —
// its Paneer Lababdar is the ordinary Gravy item. Tuesday dinner prints no veg/non-veg pair.
// Friday dinner has no VEG/NON VEG row either, but its Hyd Paneer / Hyd Chicken Dum Biriyani
// sit in the Rice and Dal rows as that day's pair, so they are carried as the specials.
export const MESS: Record<string, DayMenu> = {
  MON: {
    breakfast: { veg: ['Idli', 'Medu Vada', 'Coconut Chutney', 'Sambhar', 'Chocos', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Green Salad', 'Wheat Chapati', 'Ash Gourd Dal', 'Broad Beans Aloo', 'Punjabi Chole', 'Lemon Rice', 'Plain Rice', 'Rasam', 'Buttermilk', 'Pappad'], special: ['Golden Corn Gobhi Dry', 'Egg Pepper Roast'] },
    // The sheet prints these two the wrong way round (VEG: Kadai Chicken, NON VEG: Kadai Paneer).
    // Swapped here so the veg line is actually vegetarian — see the note in tests/data.test.ts.
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Basanti Pulao', 'Masala Dal', 'Fryums', 'Gulab Jamun', 'Pickle'], special: ['Kadai Paneer', 'Kadai Chicken'] },
  },
  TUE: {
    breakfast: { veg: ['Methi Paratha', 'Pongal', 'Aloo Matar Sabji', 'Coconut Chutney', 'Cornflakes', 'Boiled Pulses', 'Papaya', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Palak Dal', 'Aloo Gobhi Dry', 'Kadhi Pakoda', 'Curry Leaves Rice', 'Plain Rice', 'Sambar', 'Jeera Buttermilk', 'Pappad'], special: ['Rajma Masala', 'Fish Curry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Veg Manchurian', 'Snake Gourd Chenna Dal Dry', 'Schezwan Fried Rice', 'Moong Dal Thadka', 'Boondi Raitha', 'Fryums', 'Ice-cream 1 Piece', 'Pickle'] },
  },
  WED: {
    breakfast: { veg: ['Masala Dosa', 'Veg Poha', 'Sambar', 'Coriander Chutney', 'Chocos', 'Boiled Pulses', 'Watermelon', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Dal Tadka', 'Guthi Vangai', 'Veg Kofta Curry', 'Tomato Rice', 'Plain Rice', 'Rasam', 'Buttermilk', 'Pappad', 'Moong Dal Halwa / Carrot Halwa'], special: ['Soya Curry', 'Egg Tikka Masala'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Kadala Curry', 'Lowki Tomatar', 'Veg Biryani', 'Chana Dal', 'Curd', 'Fryums', 'Pickle'], special: ['Palak Paneer', 'Pahadi Chicken'] },
  },
  THU: {
    breakfast: { veg: ['Kallappam / Dal Pakwan', 'Upma', 'Coriander Mint Chutney', 'Vegetable Stew', 'Corn Flakes', 'Boiled Pulses', 'Mixed Fruits', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Bengal Gram Dal Fry', 'Dum Aloo Banaras', 'Rajma Raseela', 'Ghee Rice (Pulao)', 'Plain Rice', 'Sambhar', 'Buttermilk', 'Pappad'], special: ['Besan Gatte', 'Fish Curry (Nellore Chepala Pulusu)'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Mutter Masala', 'Mix Veg Poriyal', 'Jeera Rice', 'Tomato Pappu', 'Jeera Buttermilk', 'Fryums', 'Semiya Kheer', 'Pickle'], special: ['Shahi Paneer', 'Chicken Kolhapuri'] },
  },
  FRI: {
    breakfast: { veg: ['Aloo Paratha', 'Veg Wheat Upma', 'Curd', 'Coriander Mint Chutney', 'Chocos', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Dal Makkani', 'Corn Palak', 'Dondakai Dum Fry', 'Corn Pulao', 'Plain Rice', 'Rasam', 'Buttermilk', 'Pappad'], special: ['Bhindi Kurkure', 'Egg Curry'] },
    dinner: { veg: ['Onion Salad', 'Mirchi Ka Salan', 'Onion Cucumber Raitha', 'Fruit Custard', 'Pickle'], special: ['Hyd Paneer Dum Biriyani', 'Hyd Chicken Dum Biriyani'] },
  },
  SAT: {
    breakfast: { veg: ['Uttapam', 'Semiya', 'Coriander Mint Chutney', 'Coconut Chutney', 'Cornflakes', 'Boiled Pulses', 'Watermelon', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Yellow Dal', 'Kadai Veg Dry', 'Paneer Lababdar', 'Tamarind Rice', 'Plain Rice', 'Sambhar', 'Masala Buttermilk', 'Pappad', 'Sweet Boondi'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Aloo Methi Dry', 'Chole Masala', 'Bhagara Rice', 'Dal Tadka', 'Plain Curd', 'Fryums', 'Pickle'], special: ['Peanut Masala', 'Egg Kolhapuri'] },
  },
  SUN: {
    breakfast: { veg: ['Pav', 'Ragi Dosa', 'Bhaaji', 'Coconut Red Chutney', 'Chocos', 'Boiled Pulses', 'Papaya', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Omelette'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Arhar Dal', 'Honey Chilli Potato', 'Soya Capsicum', 'Tawa Pulao', 'Plain Rice', 'Rasam', 'Jeera Buttermilk', 'Pappad'], special: ['Lobia Masala', 'Kerala Fish Curry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'White Peas Kuruma', 'Aloo Bhindi', 'Veg Pulao', 'Dal Maharani', 'Buttermilk', 'Fryums', 'Balushahi', 'Pickle'], special: ['Paneer Tikka Masala', 'Chicken Tikka Masala'] },
  },
}
