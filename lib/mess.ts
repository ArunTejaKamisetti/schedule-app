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
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Masala Dal', 'Veg Fried Rice (Basmathi)', 'Veg Hariyali', 'Tamarind Rice', 'Rice', 'Sambar', 'Butter Milk', 'Pappad', 'Pickle', 'Gulab Jamun'], special: ['Chilli Paneer', 'Chilli Chicken'], extras: ['Fish Fry'] },
    dinner: { veg: ['Onion Cucumber Salad', 'Chapati', 'Punjabi Chole', 'Yam Thawa Fry', 'Plain Rice', 'Lowki Dal', 'Curd', 'Fryums', 'Pickle'], special: ['Bengali Fish Curry'], extras: ['Chicken Biriyani'] },
  },
  TUE: {
    breakfast: { veg: ['Poori', 'Veg Upma', 'Aloo Bhaji', 'Coconut Chutney', 'Chocos', 'Boiled Pulses', 'Cut Fruits (Papaya)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Dal Thadka', 'Pumkin Lobiya Dry', 'Veg Hariyali', 'Thawa Pulao', 'Rice', 'Sambar', 'Butter Milk', 'Pappad', 'Pickle'], special: ['Kadai Paneer', 'Egg Curry'], extras: ['Chicken Megestic', 'Fish Fry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Mix Pulses Masala', 'Snake Gourd Chenna Dal Dry', 'Veg Biryani', 'Tomato Pappu', 'Boondi Raitha', 'Fryums', 'Ice-cream (50 ml)', 'Pickle'], extras: ['Porota Chicken Curry'] },
  },
  WED: {
    breakfast: { veg: ['Masala Dosa', 'Veg Wheat Upma', 'Sambar', 'Coriander Chutney', 'Cornflakes', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Palak Dal', 'Lowki Tomato Dry', 'Mattar Masala', 'Rice', 'Sambar', 'Butter Milk', 'Pappad', 'Pickle'], special: ['Kadai Chicken'], extras: ['Fish Fry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Black Chenna Aloo Masala', 'Beetroot Thoran', 'Plain Rice', 'Dal Fry', 'Curd', 'Fryums', 'Rava Laddu', 'Pickle'], special: ['Fish Curry (Nellore Chepala Pulusu)'], extras: ['Chicken Biriyani'] },
  },
  THU: {
    breakfast: { veg: ['Idli', 'Veg Poha', 'Sambar', 'Coconut Chutney', 'Cornflakes', 'Boiled Pulses', 'Cut Fruits (Watermelon)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Omelette', 'Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Plain Biriyani (Basmathi)', 'Salan', 'Boondi Raitha', 'Pappad', 'Pickle', 'Semiya Kheer'], special: ['Veg Hundi', 'Egg Masala'], extras: ['Chicken Roast', 'Fish Fry'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Veg Butter Masala', 'Cluster Beans Thoran', 'Veg Fried Rice', 'Dal Maharani', 'Buttermilk', 'Fryums', 'Pickle'], special: ['Paneer Lababdar', 'Pahadi Chicken'] },
  },
  FRI: {
    breakfast: { veg: ['Aloo Paratha', 'Semiya Upma', 'Curd', 'Coconut Chutney', 'Chocos', 'Boiled Pulses', 'Cut Fruits (Papaya)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Dal Makkani', 'Aloo Karela Peanut Fry', 'White Peas Kuruma', 'Curry Leaves Rice', 'Rice', 'Sambar', 'Butter Milk', 'Pappad', 'Pickle'], special: ['Kerala Fish Curry'], extras: ['Porota Chicken Curry', 'Fish Fry'] },
    dinner: { veg: ['Onion Salad', 'Hyd Veg Paneer Dum Biriyani', 'Onion Cucumber Raitha', 'Mirchi Ka Salan', 'Buttermilk', 'Fryums', 'Fruit Custard', 'Pickle'], special: ['Chicken Dum Biryani'] },
  },
  SAT: {
    breakfast: { veg: ['Uttapam', 'Vada Pav', 'Mint Chutney', 'Onion Tomato Chutney', 'Chocos', 'Boiled Pulses', 'Banana', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Yellow Dal', 'Cabbage Foogath', 'Chole Masala', 'Basundi Pulao', 'Rice', 'Rasam', 'Plain Curd', 'Pappad', 'Pickle', 'Sweet Boondi'], special: ['Egg Kolhapuri'], extras: ['Chicken Biriyani'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Paneer Makkan Masala', 'Kadai Veg', 'Kushka', 'Moong Dal Thadka', 'Buttermilk', 'Fryums', 'Pickle'], extras: ['Chicken Masala'] },
  },
  SUN: {
    breakfast: { veg: ['Pav', 'Kal Dosa', 'Bhaji', 'Coconut Red Chutney', 'Cornflakes', 'Boiled Pulses', 'Cut Fruits (Watermelon)', 'Bread / Butter / Jam', 'Tea / Coffee / Milk'], special: ['Boiled Egg'] },
    lunch: { veg: ['Veg Salad', 'Chapati / Phulka', 'Bengal Gram Dal Fry', 'Aloo Amritsari', 'Rajma Raseela', 'Ghee Rice (Pulao)', 'Rice', 'Rasam', 'Jeera Buttermilk', 'Pappad', 'Pickle'], special: ['Paneer Butter Masala', 'Butter Chicken'] },
    dinner: { veg: ['Veg Salad', 'Chapati / Phulka', 'Veg Kolhapuri', 'Tendly Peanut Fry', 'Veg Dal Kichadi', 'Buttermilk', 'Fryums', 'Badushai', 'Pickle'], special: ['Egg Curry'], extras: ['Chicken Biriyani'] },
  },
}
