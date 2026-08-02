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
export const MESS: Record<string, DayMenu> = {
  MON: {
    breakfast: { veg: ['Idli', 'Medu Vada', 'Coconut Chutney', 'Sambhar', 'Cornflakes', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Dal Fry', 'Carrot Peas Poriyal', 'Punjabi Chole', 'Lemon Rice', 'Plain Rice', 'Rasam', 'Curd', 'Pappad'], special: ['Egg Curry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Fried Rice (Basmathi)', 'Masala Dal', 'Fryums', 'Gulab Jamun', 'Pickle'], special: ['Bengali Fish Curry'] },
  },
  TUE: {
    breakfast: { veg: ['Masai Paratha (Trail)', 'Pongal', 'Spiced Curd', 'Cornflakes', 'Boiled Pulses', 'Cut Fruits (Papaya)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Palak Dal', 'Rajma Masala', 'Kadi Pokada', 'Ghee Rice (Pulao)', 'Plain Rice', 'Sambar', 'Jeera Buttermilk', 'Pappad'], special: ['Egg Pepper Roast'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Veg Manchurian', 'Chenna Dal Dry', 'Ice-cream (50 ml) 1 Piece', 'Fryums', 'Pickle'], special: ['Paneer Masala'] },
  },
  WED: {
    breakfast: { veg: ['Masala Dosa', 'Masala Upma', 'Sambar', 'Coriander Chutney', 'Cornflakes', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Maax Ki Dal', 'Pumpkin Lobiya Masala', 'Soya Capsicum', 'Corn Veg Pulao', 'Plain Rice', 'Rasam', 'Buttermilk', 'Pappad', 'Moong Dal Halwa'], special: ['Jileerre Chepala Pulusu'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Kadala Curry', 'Lovki Tomatar', 'Corn Veg Pulao', 'Chana Dal', 'Curd', 'Fryums', 'Pickle'], special: ['Paneer Masala', 'Chicken Kolhapuri'] },
  },
  THU: {
    breakfast: { veg: ['Vada Pav', 'Semiya Upma', 'Mint Chutney', 'Cornflakes', 'Boiled Pulses', 'Cut Fruits (Watermelon)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Omelette'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Bengal Gram Dal Fry', 'Aloo Amritsari', 'Rajma Raseela', 'Tomato Rice', 'Plain Rice', 'Sambhar', 'Buttermilk', 'Pappad'], special: ['Egg Tikka Masala'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Mutter Masala', 'Mix Veg Poriyal', 'Veg Biryani', 'Tomato Pappu', 'Jeera Buttermilk', 'Fryums', 'Semiya Kheer', 'Pickle'], special: ['Shahi Paneer', 'Chicken Biryani'] },
  },
  FRI: {
    breakfast: { veg: ['Aloo Paratha', 'Semiya Upma', 'Mint Chutney', 'Cornflakes', 'Boiled Pulses', 'Cut Fruits (Papaya)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Dal Makkani', 'Greens Greenmoong Kootu (Dry)', 'Aloo Amritsari', 'Tawa Pulao', 'Plain Rice', 'Rasam', 'Buttermilk', 'Pappad'], special: ['Egg Curry'] },
    dinner: { veg: ['Onion Salad', 'Mirchi Ka Salan', 'Onion Cucumber Raitha', 'Plain Curd', 'Fruit Custard', 'Pickle'], special: ['Hyd Paneer Dum Biryani', 'Hyd Chicken Dum Biryani'] },
  },
  SAT: {
    breakfast: { veg: ['Uttapam', 'Veg Upma', 'Veg Chutney', 'Coconut Chutney', 'Chocos', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Yellow Dal', 'Kadai Veg', 'Plain Biryani (Kushka)', 'Plain Rice', 'Sambhar', 'Sweet Lassi', 'Pappad'], special: ['Paneer Makkan Masala'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Aloo Capsicum', 'Soya Chunk Curry', 'Masala Peanut (Dry)', 'Fryums', 'Badushah', 'Pickle'], special: ['Egg Kolhapuri'] },
  },
  SUN: {
    breakfast: { veg: ['Pav', 'Ragi Dosa', 'Bhaaji', 'Coconut Chutney', 'Cornflakes', 'Boiled Pulses', 'Cut Fruits (Watermelon)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Wheat Chapati', 'Arhar Dal', 'Honey Chilli Potato', 'Soya Capsicum', 'Tawa Pulao', 'Plain Rice', 'Rasam', 'Jeera Buttermilk', 'Pappad'], special: ['Kerala Fish Curry'] },
    dinner: { veg: ['Veg Salad', 'Wheat Chapati', 'White Peas Kuruma', 'Chole Masala', 'Veg Pulao', 'Dal Panchratan', 'Plain Curd', 'Buttermilk', 'Fryums', 'Pickle'], special: ['Paneer Butter Masala', 'Butter Chicken'] },
  },
}
