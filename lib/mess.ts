// IIM Kozhikode Students Mess Menu — June 2026 (tentative; day-wise, not date-wise).
export interface Meal {
  veg: string[]
  special?: string[] // non-veg / egg / fish / chicken / paneer-special — highlighted
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
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Arhar Dal', 'Raw Banana Dry', 'Moong Curry', 'Lemon Rice', 'Rice', 'Sambar', 'Butter Milk', 'Pappad / Fryums', 'Pickle'], special: ['Egg Curry'] },
    dinner: { veg: ['Veg Salad', 'Bathura / Phulka', 'Chole Masala', 'Mix Veg Poriyal', 'Veg Biriyani', 'Lowki Dal', 'Curd', 'Fryums', 'Ice-cream (50 ml)', 'Pickle'] },
  },
  TUE: {
    breakfast: { veg: ['Methi Paratha', 'Semiya Upma', 'Veg Korma', 'Coconut Chutney', 'Chocos', 'Boiled Pulses', 'Cut Fruits (Watermelon)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Dal Thadka', 'Pumkin Dry', 'Veg Koftha Curry', 'Coconut Pulao', 'Rice', 'Sambar', 'Butter Milk', 'Pappad / Fryums', 'Pickle'], special: ['Fish Curry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Mutter Masala', 'Aloo Kara Poriyal', 'Coarn Pulao', 'Tomato Pappu', 'Cucumber Chilli Raita', 'Pappad', 'Sweet', 'Pickle'], special: ['Paneer Butter Masala', 'Chicken Curry'] },
  },
  WED: {
    breakfast: { veg: ['Masala Dosa', 'Veg Wheat Upma', 'Sambar', 'Coriyander Chutney', 'Cornflakes', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Dal Fry', 'Cabbage Poriyal', 'Chole Masala', 'Tamarind Rice', 'Rice', 'Sambar', 'Butter Milk', 'Pappad / Fryums', 'Pickle'], special: ['Egg Masala'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Veg Makhanwala', 'Beetroot Dry', 'Jeera Pulao', 'Dal Fry', 'Buttermilk', 'Fryums', 'Sweet', 'Pickle'], special: ['Kadai Paneer', 'Pepper Chicken'] },
  },
  THU: {
    breakfast: { veg: ['Poori', 'Semiya Upma', 'Aloo Bajhi', 'Coconut Chutney', 'Chocos', 'Boiled Pulses', 'Cut Fruits (Papaya)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Palak Dal', 'Bottle Gourd Dry', 'Mattar Masala', 'Thawa Pulao', 'Rice', 'Sambar', 'Butter Milk', 'Pappad / Fryums', 'Pickle'], special: ['Fish Curry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Soya Andhra Style Chilli', 'Thawa Veg', 'Veg Fried Rice', 'Dalthaduka', 'Buttermilk', 'Pappad', 'Sweet', 'Pickle'], special: ['Chilli Paneer', 'Chilli Chicken'] },
  },
  FRI: {
    breakfast: { veg: ['Idli', 'Aloo Poha', 'Sambar', 'Mint Chutney', 'Cornflakes', 'Boiled Pulses', 'Cut Fruits (Watermelon)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Yellow Dal', 'Greens Greenmoong Kootu (Dry)', 'Kadala Curry', 'Jeera Rice', 'Rice', 'Sambar', 'Butter Milk', 'Pappad / Fryums', 'Pickle'], special: ['Egg Roast'] },
    dinner: { veg: ['Veg Salad', 'Veg Paneer Biriyani', 'Raitha', 'Mirchi Ka Salan', 'Rice Phirini', 'Pickle'], special: ['Combo: Chicken Dum Biryani'] },
  },
  SAT: {
    breakfast: { veg: ['Pesarattu', 'Karabath', 'Green Chutney', 'Coconut Chutney', 'Chocos', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Dal Makkani', 'Soya Capsicum Dry', 'Veg Chettinadu', 'Tomato Rice', 'Rice', 'Sambar', 'Butter Milk', 'Pappad / Fryums', 'Pickle'], special: ['Fish Curry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Paneer Mattar Masala', 'Yam Dry', 'Mishti Pulao', 'Moong Dal Thadka', 'Plain Curd', 'Fryums', 'Sweet', 'Pickle'] },
  },
  SUN: {
    breakfast: { veg: ['Pav', 'Veg Uthapam', 'Bajhi', 'Cococunt Red Chutney', 'Cornflakes', 'Boiled Pulses', 'Cut Fruits (Papaya)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Bengal Gram Dal Fry', 'Aloo Bhindi Dry', 'Rajma Raseela', 'Vangi Bhaat', 'Rice', 'Sambar', 'Butter Milk', 'Pappad / Fryums', 'Pickle'], special: ['Egg Curry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Lobiya Masala', 'Aloo Gobi Kashmiri Dry', 'Veg Pulao', 'Dal Maharani', 'Buttermilk', 'Fryums', 'Sweet', 'Pickle'], special: ['Paneer Roast', 'Chicken Roast'] },
  },
}
