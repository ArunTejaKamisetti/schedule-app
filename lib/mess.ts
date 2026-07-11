// IIM Kozhikode Students Mess Menu — July 2026 (tentative; day-wise, not date-wise).
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
    lunch: { veg: ['Veg Salad', 'Chapati', 'Dal Fry', 'Yam Thawa Fry', 'Punjabi Chole', 'Lemon Rice', 'Plain Rice', 'Rasam', 'Curd', 'Pappad'], special: ['Egg Curry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Fried Rice (Basmathi)', 'Masala Dal', 'Fryums', 'Gulab Jamun', 'Pickle'], special: ['Chilli Paneer', 'Chilli Chicken'] },
  },
  TUE: {
    breakfast: { veg: ['Poori', 'Pongal', 'Aloo Bajhi', 'Coconut Chutney', 'Chocos', 'Boiled Pulses', 'Cut Fruits (Papaya)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Palak Dal', 'Greens Greenmoong Kootu (Dry)', 'Kadhi Pakoda', 'Curry Leaves Rice', 'Plain Rice', 'Sambar', 'Jeera Buttermilk', 'Pappad'], special: ['Bengali Fish Curry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Veg Manchurian', 'Snake Gourd Chenna Dal Dry', 'Basundi Pulao', 'Moong Dal Thadka', 'Boondi Raitha', 'Fryums', 'Ice-cream (50 ml) 1 Piece', 'Pickle'] },
  },
  WED: {
    breakfast: { veg: ['Masala Dosa', 'Veg Wheat Upma', 'Sambar', 'Coriander Chutney', 'Cornflakes', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Dal Tadka', 'Pumkin Dry', 'Veg Kofta Curry', 'Tomato Rice', 'Plain Rice', 'Rasam', 'Buttermilk', 'Pappad', 'Moong Dal Halwa'], special: ['Egg Masala'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Kadala Curry', 'Lovki Tomatar', 'Corn Pulao', 'Chana Dal', 'Curd', 'Fryums', 'Pickle'], special: ['Kadai Paneer', 'Kadai Chicken'] },
  },
  THU: {
    breakfast: { veg: ['Idli (with Idli Rawa)', 'Veg Poha', 'Sambar', 'Coconut Chutney', 'Chocos', 'Boiled Pulses', 'Cut Fruits (Watermelon)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Omelette'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Bengal Gram Dal Fry', 'Aloo Amritsari', 'Rajma Raseela', 'Ghee Rice (Pulao)', 'Plain Rice', 'Sambhar', 'Buttermilk', 'Pappad'], special: ['Fish Curry (Nellore Chepala Pulusu)'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Mutter Masala', 'Mix Veg Poriyal', 'Veg Biryani', 'Tomato Pappu', 'Jeera Buttermilk', 'Fryums', 'Semiya Kheer', 'Pickle'], special: ['Shahi Paneer', 'Chicken Curry'] },
  },
  FRI: {
    breakfast: { veg: ['Aloo Paratha', 'Semiya Upma', 'Coriander Mint Chutney', 'Cornflakes', 'Boiled Pulses', 'Cut Fruits (Papaya)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Dal Makkani', 'Greens Greenmoong Kootu (Dry)', 'Kashmiri Dum Aloo', 'Jeera Rice', 'Plain Rice', 'Rasam', 'Buttermilk', 'Pappad'], special: ['Egg Curry'] },
    dinner: { veg: ['Onion Salad', 'Mirchi Ka Salan', 'Onion Cucumber Raitha', 'Plain Curd', 'Fruit Custard', 'Pickle'], special: ['Hyd Paneer Dum Biriyani', 'Hyd Chicken Dum Biriyani'] },
  },
  SAT: {
    breakfast: { veg: ['Uttapam', 'Vada Pav', 'Coriander Mint Chutney', 'Coconut Chutney', 'Chocos', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Yellow Dal', 'Kadai Veg', 'Plain Biryani (Kushka)', 'Plain Rice', 'Sambhar', 'Masala Buttermilk', 'Pappad', 'Sweet Boondi'], special: ['Paneer Makkan Masala'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Aloo Capsicum', 'Veg Dal Khichadi', 'Plain Curd', 'Fryums', 'Pickle'], special: ['Egg Kolhapuri'] },
  },
  SUN: {
    breakfast: { veg: ['Pav', 'Kal Dosa', 'Bhaaji', 'Coconut Red Chutney', 'Cornflakes', 'Boiled Pulses', 'Cut Fruits (Watermelon)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Arhar Dal', 'Honey Chilli Patato', 'Soya Capsicum', 'Tawa Pulao', 'Plain Rice', 'Rasam', 'Jeera Buttermilk', 'Pappad'], special: ['Kerala Fish Curry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'White Peas Kuruma', 'Cabbage Foogath', 'Veg Pulao', 'Dal Maharani', 'Buttermilk', 'Fryums', 'Balushahi', 'Pickle'], special: ['Paneer Butter Masala', 'Butter Chicken'] },
  },
}
