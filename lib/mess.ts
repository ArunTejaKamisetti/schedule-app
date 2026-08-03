// IIM Kozhikode Students Mess Menu — August 2026 (tentative; day-wise, not date-wise).
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
// `special` carries both highlighted rows of the sheet: the green SPL VEG / VEG dish and the
// red FISH-EGG / NON VEG dish. Tuesday and Friday dinner are the sheet's "Combo Menu" days —
// Tuesday's combo has no separate veg/non-veg line, so it carries no specials.
export const MESS: Record<string, DayMenu> = {
  MON: {
    breakfast: { veg: ['Idli', 'Medu Vada', 'Coconut Chutney', 'Sambhar', 'Chocos', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Dal Fry', 'Carrot Peas Poriyal', 'Punjabi Chole', 'Lemon Rice', 'Plain Rice', 'Rasam', 'Curd', 'Pappad', 'Gulab Jamun'], special: ['Golden Gobi Corn Dry', 'Bengali Fish Curry'] },
    dinner: { veg: ['Kimchi Salad', 'Wheat Chapati / Phulka', 'Fried Rice (Basmathi)', 'Masala Dal', 'Butter Milk', 'Fryums', 'Pickle'], special: ['Paneer Manchurian / Paneer Jalfrezi', 'Chicken Manchurian / Chicken Jalfrezi'] },
  },
  TUE: {
    breakfast: { veg: ['Missi Paratha (Trial)', 'Pongal', 'Spiced Curd', 'Coconut Chutney', 'Cornflakes', 'Boiled Pulses', 'Cut Fruits (Papaya)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Palak Dal', 'Kootu Curry (Yam)', 'Kadi Pokada', 'Baghara Rice', 'Plain Rice', 'Sambar', 'Jeera Buttermilk', 'Pappad'], special: ['Rajma Masala', 'Egg Pepper Roast'] },
    dinner: { veg: ['Veg Salad', 'Wheat Chapati / Phulka', 'Veg Manchurian', 'Snake Gourd Chenna Dal Dry', 'Basundi Pulao', 'Moong Dal Thadka', 'Jeera Butter Milk', 'Fryums', 'Ice-cream (50 ml) 1 Piece', 'Pickle'] },
  },
  WED: {
    breakfast: { veg: ['Masala Dosa', 'Veg Poha', 'Sambar', 'Coriander Chutney', 'Chocos', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Maa Ki Dal', 'Pumkin Lobiya Dry', 'Veg Kolapuri', 'Ghee Rice (Pulao)', 'Plain Rice', 'Rasam', 'Buttermilk', 'Pappad', 'Palada / Carrot Halwa'], special: ['Gatte Ki Sabji', 'Fish Curry (Nellore Chepala Pulusu)'] },
    dinner: { veg: ['Veg Toss Salad', 'Kerala Paratha / Phulka', 'Lobiya Masala', 'Lowki Tomatar', 'Soya Biryani', 'Chana Dal Fry', 'Curd', 'Fryums', 'Pickle'], special: ['Paneer Masala', 'Chicken Masala'] },
  },
  THU: {
    breakfast: { veg: ['Vada Pav', 'Semiya Upma', 'Mint Chutney', 'Coconut Chutney', 'Cornflakes', 'Boiled Pulses', 'Cut Fruits (Watermelon)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Omelette'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Bengal Gram Dal Fry', 'Soya Capsicum', 'Rajma Raseela', 'Tomato Rice', 'Plain Rice', 'Sambhar', 'Buttermilk', 'Pappad'], special: ['Peanut-Green Gram Curry', 'Egg Tikka Masala'] },
    dinner: { veg: ['Veg Salad', 'Wheat Chapati / Phulka', 'Mutter Masala', 'Mix Veg Poriyal', 'Corn Veg Pulao', 'Tomato Pappu', 'Buttermilk', 'Fryums', 'Moong Dal Halwa', 'Pickle'], special: ['Shahi Paneer', 'Chicken Kolapuri'] },
  },
  FRI: {
    breakfast: { veg: ['Aloo Paratha', 'Wheat Upma', 'Curd', 'Coconut Chutney', 'Chocos', 'Boiled Pulses', 'Cut Fruits (Papaya)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Dal Makkani', 'Greens Greenmoong Kootu (Dry)', 'Aloo Amritsari', 'Tawa Pulao', 'Plain Rice', 'Rasam', 'Buttermilk', 'Pappad'], special: ['Soya Chunk Curry', 'Kerala Fish Curry'] },
    dinner: { veg: ['Veg Onion Salad', 'Mirchi Ka Salan', 'Onion Cucumber Raitha', 'Semiya Kheer', 'Pickle'], special: ['Hyd Paneer Dum Biriyani', 'Hyd Chicken Dum Biriyani'] },
  },
  SAT: {
    breakfast: { veg: ['Uttapam', 'Veg Upma', 'Veg Stew', 'Coconut Chutney', 'Cornflakes', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Yellow Dal', 'Kadai Veg Dry', 'Plain Biryani (Kushka)', 'Plain Rice', 'Sambhar', 'Sweet Lasi', 'Pappad'], special: ['Paneer Makkan Masala'] },
    dinner: { veg: ['Veg Salad', 'Wheat Chapati / Phulka', 'Chole Masala', 'Aloo Karam Dry', 'Mishti Palao', 'Dal Makkhani', 'Plain Curd', 'Fryums', 'Fruit Custard', 'Pickle'], special: ['Soya', 'Egg Kolhapuri'] },
  },
  SUN: {
    breakfast: { veg: ['Pav / Misal Pav (alternate week)', 'Ragi Dosa', 'Bhaaji', 'Coconut Chutney', 'Chocos', 'Boiled Pulses', 'Cut Fruits (Watermelon)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Arhar Dal', 'Honey Chilli Potato', 'Kadala Curry', 'Coconut Pulao', 'Plain Rice', 'Rasam', 'Jeera Buttermilk', 'Pappad'], special: ['Masala Peanut (fry)', 'Egg Burji'] },
    dinner: { veg: ['Veg Kosambari Salad', 'Wheat Chapati', 'White Peas Kuruma', 'Long Beans Thoran', 'Veg Pulao', 'Dal Panchemel', 'Buttermilk', 'Fryums', 'Badushahi', 'Pickle'], special: ['Paneer Butter Masala', 'Butter Chicken'] },
  },
}
