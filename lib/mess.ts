// IIM Kozhikode Students Mess Menu — September 2026 (tentative; day-wise, not date-wise).
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
// `special` carries the sheet's highlighted rows: the green SPL VEG / VEG dish and the red
// FISH-EGG / NON VEG dish. Saturday lunch prints no SPL VEG or FISH/EGG row — its only
// highlight is the green Paneer Makkan Masala in the Gravy row. Monday and Friday dinner are
// the sheet's "Combo Menu" days; Tuesday dinner has no separate veg/non-veg line, so it
// carries no specials.
export const MESS: Record<string, DayMenu> = {
  MON: {
    breakfast: { veg: ['Idli', 'Medu Vada', 'Coconut Chutney', 'Sambhar', 'Chocos', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Dal Fry', 'Yam Thawa Fry', 'Punjabi Chole', 'Lemon Rice', 'Plain Rice', 'Rasam', 'Curd', 'Pappad'], special: ['Golden Corn Gobhi Dry', 'Egg Pepper Roast'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Fried Rice (Basmati)', 'Masala Dal', 'Fryums', 'Gulab Jamun', 'Pickle'], special: ['Chilli Paneer', 'Chilli Chicken'] },
  },
  TUE: {
    breakfast: { veg: ['Methi Paratha', 'Pongal', 'Aloo Matar Sabji', 'Coconut Chutney', 'Cornflakes', 'Boiled Pulses', 'Papaya', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Palak Dal', 'Aloo Gobhi Dry', 'Kadhi Pakoda', 'Curry Leaves Rice', 'Plain Rice', 'Sambar', 'Jeera Buttermilk', 'Pappad'], special: ['Rajma Masala', 'Bengali Fish Curry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Veg Manchurian', 'Snake Gourd Chenna Dal Dry', 'Basundi Pulao', 'Moong Dal Thadka', 'Boondi Raitha', 'Fryums', 'Ice-cream 1 Piece', 'Pickle'] },
  },
  WED: {
    breakfast: { veg: ['Masala Dosa', 'Veg Poha', 'Sambar', 'Coriander Chutney', 'Chocos', 'Boiled Pulses', 'Watermelon', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Dal Tadka', 'Pumpkin Lobia Dry', 'Veg Kofta Curry', 'Tomato Rice', 'Plain Rice', 'Rasam', 'Buttermilk', 'Pappad', 'Carrot Halwa'], special: ['Soya Curry', 'Egg Tikka Masala'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Kadala Curry', 'Lowki Tomatar', 'Veg Biryani', 'Chana Dal', 'Curd', 'Fryums', 'Pickle'], special: ['Kadai Paneer', 'Kadai Chicken'] },
  },
  THU: {
    breakfast: { veg: ['Vada Pav', 'Pongal', 'Coriander Mint Chutney', 'Tangy Imli Chutney', 'Corn Flakes', 'Boiled Pulses', 'Guava', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Omelette'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Bengal Gram Dal Fry', 'Aloo Amritsari', 'Rajma Raseela', 'Ghee Rice (Pulao)', 'Plain Rice', 'Sambhar', 'Buttermilk', 'Pappad'], special: ['Besan Gatte', 'Fish Curry (Nellore Chepala Pulusu)'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Mutter Masala', 'Mix Veg Poriyal', 'Corn Pulao', 'Tomato Pappu', 'Jeera Buttermilk', 'Fryums', 'Semiya Kheer', 'Pickle'], special: ['Shahi Paneer', 'Chicken Kolhapuri'] },
  },
  FRI: {
    breakfast: { veg: ['Aloo Paratha', 'Veg Wheat Upma', 'Curd', 'Coriander Mint Chutney', 'Chocos', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Dal Makkani', 'Greens Greenmoong Kootu (Dry)', 'Kashmiri Dum Aloo', 'Jeera Rice', 'Plain Rice', 'Rasam', 'Buttermilk', 'Pappad'], special: ['Bhindi Kurkure', 'Egg Curry'] },
    dinner: { veg: ['Onion Salad', 'Mirchi Ka Salan', 'Onion Cucumber Raitha', 'Fruit Custard', 'Pickle'], special: ['Hyd Paneer Dum Biriyani', 'Hyd Chicken Dum Biriyani'] },
  },
  SAT: {
    breakfast: { veg: ['Uttapam', 'Semiya', 'Coriander Mint Chutney', 'Coconut Chutney', 'Cornflakes', 'Boiled Pulses', 'Watermelon', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Yellow Dal', 'Kadai Veg Dry', 'Tamarind Rice', 'Plain Rice', 'Sambhar', 'Masala Buttermilk', 'Pappad', 'Sweet Boondi'], special: ['Paneer Makkan Masala'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Aloo Capsicum', 'Chole Masala', 'Bhagara Rice', 'Dal Tadka', 'Plain Curd', 'Fryums', 'Pickle'], special: ['Peanut Masala', 'Egg Kolhapuri'] },
  },
  SUN: {
    breakfast: { veg: ['Pav', 'Ragi Dosa', 'Bhaaji', 'Coconut Red Chutney', 'Chocos', 'Boiled Pulses', 'Papaya', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Arhar Dal', 'Honey Chilli Potato', 'Soya Capsicum', 'Tawa Pulao', 'Plain Rice', 'Rasam', 'Jeera Buttermilk', 'Pappad'], special: ['Lobia Masala', 'Kerala Fish Curry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'White Peas Kuruma', 'Aloo Bhindi', 'Veg Pulao', 'Dal Maharani', 'Buttermilk', 'Fryums', 'Balushahi', 'Pickle'], special: ['Paneer Butter Masala', 'Butter Chicken'] },
  },
}
