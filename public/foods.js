// 食品データベース(可食部100gあたり)。メキシコの食事を基本に、日本食なども収録。
// 値は USDA FoodData Central や日本食品標準成分表(八訂)などの公開データを参考にした概算値。
// AIには「何が何グラムあるか」だけを推定させ、栄養素はこの表から計算する。
//
// 行の形: key: [[es, ja, en], 1食の目安g, kcal, たんぱく質g, 脂質g, 炭水化物g, 食物繊維g, 食塩相当量g,
//               Ca mg, 鉄mg, ビタミンA µgRAE, B1 mg, B2 mg, C mg, D µg]
const RAW = {
  // --- México: básicos ---
  corn_tortilla: [["Tortilla de maíz", "コーントルティーヤ", "Corn tortilla"], 30, 218, 5.7, 2.9, 44.6, 6.3, 0.1, 81, 1.2, 0, 0.09, 0.07, 0, 0],
  flour_tortilla: [["Tortilla de harina", "小麦粉トルティーヤ", "Flour tortilla"], 45, 306, 8.2, 8.0, 50.0, 3.5, 1.4, 128, 3.3, 0, 0.44, 0.22, 0, 0],
  tostada: [["Tostada", "トスターダ", "Tostada shell"], 13, 470, 6.5, 22.0, 62.0, 6.0, 0.9, 160, 1.5, 0, 0.1, 0.05, 0, 0],
  beans_boiled: [["Frijoles de olla", "煮豆(フリホーレス)", "Boiled pinto beans"], 150, 143, 9.0, 0.7, 26.2, 9.0, 0.3, 46, 2.1, 0, 0.19, 0.06, 0.8, 0],
  refried_beans: [["Frijoles refritos", "フリホーレス・レフリトス", "Refried beans"], 100, 91, 5.5, 1.2, 15.0, 5.2, 1.0, 35, 1.6, 0, 0.03, 0.02, 0, 0],
  mexican_rice: [["Arroz rojo", "メキシカンライス", "Mexican red rice"], 150, 150, 2.9, 3.5, 26.0, 1.0, 0.6, 12, 0.9, 20, 0.12, 0.03, 2, 0],
  white_rice: [["Arroz blanco", "白米(炊飯・長粒)", "White rice, cooked"], 150, 130, 2.7, 0.3, 28.2, 0.4, 0, 10, 1.2, 0, 0.16, 0.01, 0, 0],
  carne_asada: [["Carne asada", "カルネ・アサーダ(牛焼肉)", "Grilled beef (carne asada)"], 120, 210, 28.0, 10.5, 0, 0, 0.5, 20, 2.3, 0, 0.07, 0.17, 0, 0.1],
  al_pastor: [["Carne al pastor", "アル・パストール(豚)", "Al pastor pork"], 100, 230, 20.0, 15.0, 4.0, 0.5, 1.2, 15, 1.2, 30, 0.6, 0.2, 2, 0.5],
  carnitas: [["Carnitas", "カルニータス(豚)", "Carnitas"], 100, 290, 25.0, 20.0, 0, 0, 0.8, 15, 1.2, 3, 0.7, 0.3, 0, 0.8],
  chicken_breast: [["Pechuga de pollo cocida", "鶏むね肉(加熱)", "Chicken breast, cooked"], 120, 165, 31.0, 3.6, 0, 0, 0.2, 15, 1.0, 6, 0.07, 0.11, 0, 0.1],
  chorizo: [["Chorizo", "チョリソ", "Chorizo"], 50, 455, 24.0, 38.0, 1.9, 0, 3.1, 8, 1.6, 0, 0.6, 0.3, 0, 0.5],
  ham: [["Jamón", "ハム", "Ham"], 30, 145, 21.0, 6.0, 1.5, 0, 2.3, 8, 0.9, 0, 0.6, 0.2, 0, 0.8],
  sausage: [["Salchicha", "ソーセージ", "Hot dog sausage"], 45, 290, 11.0, 26.0, 3.0, 0, 2.5, 11, 1.1, 0, 0.2, 0.1, 0, 1.1],
  egg: [["Huevo", "鶏卵", "Egg"], 50, 143, 12.6, 9.5, 0.7, 0, 0.4, 56, 1.8, 160, 0.04, 0.46, 0, 2.0],
  queso_fresco: [["Queso fresco", "ケソ・フレスコ", "Queso fresco"], 30, 299, 18.0, 24.0, 3.0, 0, 1.9, 566, 0.2, 200, 0.03, 0.3, 0, 0.5],
  queso_oaxaca: [["Queso Oaxaca", "オアハカチーズ", "Oaxaca cheese"], 30, 300, 22.0, 22.0, 2.2, 0, 1.6, 505, 0.4, 180, 0.03, 0.28, 0, 0.4],
  crema: [["Crema", "クレマ(サワークリーム)", "Mexican crema"], 15, 200, 2.4, 19.4, 4.6, 0, 0.1, 100, 0.1, 120, 0.03, 0.14, 0.9, 0.2],
  avocado: [["Aguacate", "アボカド", "Avocado"], 50, 160, 2.0, 14.7, 8.5, 6.7, 0, 12, 0.6, 7, 0.07, 0.13, 10, 0],
  guacamole: [["Guacamole", "ワカモレ", "Guacamole"], 50, 150, 1.9, 13.5, 8.5, 6.0, 0.9, 15, 0.6, 10, 0.06, 0.12, 10, 0],
  salsa: [["Salsa (roja o verde)", "サルサ", "Salsa"], 30, 36, 1.5, 0.2, 7.0, 1.9, 1.5, 30, 0.4, 20, 0.04, 0.03, 10, 0],
  mole: [["Mole", "モレ", "Mole sauce"], 100, 200, 4.0, 13.0, 18.0, 4.0, 1.1, 60, 2.5, 60, 0.07, 0.08, 1, 0],
  tamal: [["Tamal", "タマル", "Tamale"], 150, 220, 7.0, 11.0, 23.0, 2.5, 0.9, 40, 1.0, 20, 0.1, 0.07, 1, 0.1],
  pozole: [["Pozole", "ポソレ", "Pozole"], 350, 70, 5.0, 2.5, 7.0, 1.3, 0.6, 10, 0.7, 15, 0.1, 0.05, 1, 0.1],
  sopa_fideo: [["Sopa de fideo", "フィデオスープ", "Noodle soup (sopa de fideo)"], 250, 60, 1.8, 1.5, 9.5, 0.6, 0.6, 10, 0.4, 20, 0.05, 0.03, 2, 0],
  chicharron: [["Chicharrón", "チチャロン(豚皮揚げ)", "Pork rinds"], 20, 544, 61.0, 31.0, 0, 0, 4.6, 30, 0.9, 40, 0.1, 0.3, 0, 0.3],
  nopales: [["Nopales", "ノパル(ウチワサボテン)", "Cactus pads (nopales)"], 100, 15, 1.4, 0.1, 3.3, 2.0, 0, 141, 0.5, 22, 0.01, 0.04, 5.3, 0],
  corn_cob: [["Elote", "とうもろこし", "Sweet corn"], 150, 96, 3.4, 1.5, 21.0, 2.4, 0, 3, 0.5, 9, 0.09, 0.06, 5.5, 0],
  jalapeno: [["Chile jalapeño", "ハラペーニョ", "Jalapeño pepper"], 15, 29, 0.9, 0.4, 6.5, 2.8, 0, 12, 0.3, 54, 0.04, 0.07, 119, 0],
  onion: [["Cebolla", "玉ねぎ", "Onion"], 30, 40, 1.1, 0.1, 9.3, 1.7, 0, 23, 0.2, 0, 0.05, 0.03, 7.4, 0],
  tomato: [["Jitomate", "トマト", "Tomato"], 100, 18, 0.9, 0.2, 3.9, 1.2, 0, 10, 0.3, 42, 0.04, 0.02, 14, 0],
  lettuce: [["Lechuga", "レタス", "Lettuce"], 30, 14, 0.9, 0.1, 3.0, 1.2, 0, 18, 0.4, 25, 0.04, 0.03, 2.8, 0],
  zucchini: [["Calabacita", "ズッキーニ", "Zucchini, cooked"], 100, 16, 1.2, 0.3, 3.1, 1.0, 0, 16, 0.4, 10, 0.04, 0.09, 13, 0],
  potato: [["Papa cocida", "じゃがいも(ゆで)", "Potato, boiled"], 150, 87, 1.9, 0.1, 20.0, 1.8, 0, 5, 0.3, 0, 0.1, 0.02, 13, 0],
  carrot: [["Zanahoria", "にんじん", "Carrot"], 60, 41, 0.9, 0.2, 9.6, 2.8, 0.2, 33, 0.3, 835, 0.07, 0.06, 5.9, 0],
  broccoli: [["Brócoli cocido", "ブロッコリー(ゆで)", "Broccoli, cooked"], 90, 35, 2.4, 0.4, 7.2, 3.3, 0, 40, 0.7, 77, 0.06, 0.12, 64.9, 0],
  spinach: [["Espinaca cocida", "ほうれん草(ゆで)", "Spinach, cooked"], 90, 23, 3.0, 0.3, 3.8, 2.4, 0.1, 136, 3.6, 524, 0.1, 0.24, 9.8, 0],
  cabbage: [["Col", "キャベツ", "Cabbage"], 50, 25, 1.3, 0.1, 5.8, 2.5, 0, 40, 0.5, 5, 0.06, 0.04, 36.6, 0],
  // --- Frutas ---
  banana: [["Plátano", "バナナ", "Banana"], 120, 89, 1.1, 0.3, 22.8, 2.6, 0, 5, 0.3, 3, 0.03, 0.07, 8.7, 0],
  mango: [["Mango", "マンゴー", "Mango"], 150, 60, 0.8, 0.4, 15.0, 1.6, 0, 11, 0.2, 54, 0.03, 0.04, 36, 0],
  papaya: [["Papaya", "パパイヤ", "Papaya"], 150, 43, 0.5, 0.3, 10.8, 1.7, 0, 20, 0.3, 47, 0.02, 0.03, 61, 0],
  orange: [["Naranja", "オレンジ", "Orange"], 130, 47, 0.9, 0.1, 11.8, 2.4, 0, 40, 0.1, 11, 0.09, 0.04, 53, 0],
  watermelon: [["Sandía", "すいか", "Watermelon"], 200, 30, 0.6, 0.2, 7.6, 0.4, 0, 7, 0.2, 28, 0.03, 0.02, 8.1, 0],
  pineapple: [["Piña", "パイナップル", "Pineapple"], 150, 50, 0.5, 0.1, 13.1, 1.4, 0, 13, 0.3, 3, 0.08, 0.03, 48, 0],
  apple: [["Manzana", "りんご", "Apple"], 180, 52, 0.3, 0.2, 13.8, 2.4, 0, 6, 0.1, 3, 0.02, 0.03, 4.6, 0],
  // --- Pan, cereales ---
  bolillo: [["Bolillo", "ボリージョ(パン)", "Bolillo roll"], 70, 280, 9.0, 3.0, 53.0, 2.5, 1.2, 100, 3.0, 0, 0.4, 0.25, 0, 0],
  concha: [["Concha (pan dulce)", "コンチャ(菓子パン)", "Concha sweet bread"], 70, 380, 7.0, 12.0, 60.0, 2.0, 0.8, 50, 2.5, 20, 0.4, 0.3, 0, 0.1],
  sliced_bread: [["Pan de caja", "食パン", "Sliced bread"], 30, 266, 8.9, 3.3, 49.0, 2.7, 1.2, 150, 3.6, 0, 0.47, 0.3, 0, 0],
  oatmeal: [["Avena cocida", "オートミール(調理後)", "Oatmeal, cooked"], 240, 71, 2.5, 1.5, 12.0, 1.7, 0, 9, 0.9, 0, 0.08, 0.02, 0, 0],
  pasta: [["Pasta cocida", "パスタ(ゆで)", "Pasta, cooked"], 150, 150, 5.8, 0.9, 32.2, 3.0, 1.2, 8, 0.7, 0, 0.06, 0.03, 0, 0],
  chips: [["Papas fritas de bolsa", "ポテトチップス", "Potato chips"], 45, 536, 7.0, 35.0, 53.0, 4.4, 1.3, 24, 1.6, 0, 0.1, 0.2, 19, 0],
  // --- Pescados y mariscos ---
  tuna_canned: [["Atún en agua", "ツナ缶(水煮)", "Canned tuna in water"], 80, 116, 25.5, 0.8, 0, 0, 0.9, 11, 1.5, 17, 0.03, 0.07, 0, 1.7],
  shrimp: [["Camarón cocido", "えび(加熱)", "Shrimp, cooked"], 100, 99, 24.0, 0.3, 0.2, 0, 0.3, 70, 0.5, 0, 0.03, 0.03, 0, 0.1],
  tilapia: [["Pescado (tilapia)", "白身魚(ティラピア)", "Tilapia, cooked"], 120, 128, 26.0, 2.7, 0, 0, 0.1, 14, 0.7, 0, 0.04, 0.07, 0, 3.7],
  // --- Lácteos y bebidas (por 100 ml) ---
  milk: [["Leche entera", "牛乳", "Whole milk"], 240, 61, 3.2, 3.3, 4.8, 0, 0.1, 113, 0.03, 46, 0.05, 0.17, 0, 1.1],
  yogurt: [["Yogur natural", "ヨーグルト(無糖)", "Plain yogurt"], 150, 61, 3.5, 3.3, 4.7, 0, 0.1, 121, 0.05, 27, 0.03, 0.14, 0.5, 0.1],
  cola: [["Refresco de cola", "コーラ", "Cola soft drink"], 355, 42, 0, 0, 10.6, 0, 0, 2, 0.1, 0, 0, 0, 0, 0],
  horchata: [["Agua de horchata", "オルチャータ", "Horchata"], 250, 60, 0.5, 1.0, 12.0, 0.2, 0.05, 20, 0.1, 5, 0.01, 0.03, 0, 0],
  orange_juice: [["Jugo de naranja", "オレンジジュース", "Orange juice"], 250, 45, 0.7, 0.2, 10.4, 0.2, 0, 11, 0.2, 10, 0.09, 0.03, 50, 0],
  beer: [["Cerveza", "ビール", "Beer"], 355, 43, 0.5, 0, 3.6, 0, 0, 4, 0, 0, 0.01, 0.03, 0, 0],
  sugar: [["Azúcar", "砂糖", "Sugar"], 5, 387, 0, 0, 100, 0, 0, 1, 0, 0, 0, 0.02, 0, 0],
  oil: [["Aceite vegetal", "植物油", "Vegetable oil"], 10, 884, 0, 100, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  // --- Internacional / Japón ---
  japanese_rice: [["Arroz japonés (gohan)", "ごはん(精白米)", "Japanese rice, cooked"], 150, 156, 2.5, 0.3, 37.1, 1.5, 0, 3, 0.1, 0, 0.02, 0.01, 0, 0],
  miso_soup: [["Sopa de miso", "味噌汁(豆腐・わかめ)", "Miso soup"], 150, 25, 1.9, 0.9, 2.0, 0.5, 0.9, 20, 0.3, 2, 0.02, 0.02, 0, 0],
  tofu: [["Tofu firme", "木綿豆腐", "Firm tofu"], 100, 73, 7.0, 4.9, 1.5, 1.1, 0, 93, 1.5, 0, 0.09, 0.04, 0, 0],
  natto: [["Natto", "納豆", "Natto"], 45, 190, 16.5, 10.0, 12.1, 6.7, 0, 90, 3.3, 0, 0.07, 0.56, 0, 0],
  salmon_grilled: [["Salmón asado", "焼き鮭", "Grilled salmon"], 80, 160, 29.1, 5.1, 0.1, 0, 0.2, 19, 0.6, 14, 0.19, 0.29, 1, 39.4],
  udon: [["Udon", "うどん(ゆで)", "Udon noodles, boiled"], 250, 95, 2.6, 0.4, 21.6, 1.3, 0.3, 6, 0.2, 0, 0.02, 0.01, 0, 0],
  ramen_noodle: [["Fideos de ramen", "中華麺(ゆで)", "Ramen noodles, boiled"], 230, 133, 4.9, 0.6, 27.9, 2.8, 0.2, 20, 0.3, 0, 0.01, 0.01, 0, 0],
  karaage: [["Pollo frito japonés (karaage)", "鶏のから揚げ", "Japanese fried chicken"], 100, 290, 20.0, 18.0, 12.0, 0.4, 1.4, 10, 0.9, 30, 0.1, 0.18, 2, 0.3],
  pork_loin: [["Lomo de cerdo", "豚ロース", "Pork loin"], 100, 248, 19.3, 19.2, 0.2, 0, 0.1, 4, 0.3, 6, 0.69, 0.15, 1, 0.1],
  // --- 追加: よく食べられる料理の材料(概算値) ---
  pizza: [["Pizza de queso", "チーズピザ", "Cheese pizza"], 110, 266, 11.4, 9.7, 33.0, 2.3, 1.5, 188, 2.5, 60, 0.4, 0.3, 1, 0.1],
  burger: [["Hamburguesa", "ハンバーガー", "Hamburger"], 220, 250, 13.0, 11.0, 24.0, 1.5, 1.2, 60, 2.4, 10, 0.25, 0.2, 1, 0.1],
  hot_dog: [["Hot dog", "ホットドッグ", "Hot dog in a bun"], 100, 247, 9.0, 13.0, 23.0, 1.0, 1.7, 60, 2.0, 5, 0.25, 0.2, 0, 0.3],
  french_fries: [["Papas a la francesa", "フライドポテト", "French fries"], 120, 312, 3.4, 15.0, 41.0, 3.8, 0.5, 18, 0.8, 0, 0.1, 0.03, 5, 0],
  fried_chicken: [["Pollo frito", "フライドチキン", "Fried chicken"], 150, 260, 22.0, 15.0, 9.0, 0.4, 1.2, 20, 1.2, 30, 0.1, 0.2, 0, 0.3],
  sushi: [["Sushi", "寿司", "Sushi"], 200, 150, 6.0, 1.5, 28.0, 0.5, 1.0, 10, 0.5, 20, 0.05, 0.05, 1, 1.0],
  fried_egg: [["Huevo estrellado", "目玉焼き", "Fried egg"], 50, 196, 13.6, 14.8, 0.8, 0, 0.5, 62, 1.9, 170, 0.04, 0.5, 0, 2.2],
  sandwich: [["Sándwich de jamón y queso", "ハムチーズサンド", "Ham and cheese sandwich"], 150, 250, 13.0, 10.0, 27.0, 2.0, 1.8, 180, 2.2, 60, 0.4, 0.25, 0, 0.3],
  corn_flakes: [["Cereal de maíz", "コーンフレーク", "Corn flakes cereal"], 30, 357, 7.5, 0.4, 84.0, 3.3, 1.8, 5, 28.9, 0, 1.3, 1.5, 21, 3.6],
  coffee: [["Café", "コーヒー", "Coffee"], 240, 2, 0.1, 0, 0.3, 0, 0, 2, 0, 0, 0, 0.08, 0, 0],
  water: [["Agua", "水", "Water"], 250, 0, 0, 0, 0, 0, 0, 3, 0, 0, 0, 0, 0, 0],
  cake: [["Pastel", "ケーキ", "Cake"], 90, 370, 4.5, 16.0, 53.0, 0.8, 0.8, 55, 1.4, 60, 0.12, 0.15, 0, 0.3],
  ice_cream: [["Helado", "アイスクリーム", "Ice cream"], 100, 207, 3.5, 11.0, 23.6, 0.7, 0.2, 128, 0.1, 118, 0.04, 0.24, 0.6, 0.2],
  cookies: [["Galletas", "クッキー", "Cookies"], 30, 480, 5.5, 21.0, 67.0, 2.0, 0.8, 30, 2.5, 0, 0.25, 0.2, 0, 0],
  pancakes: [["Hotcakes", "ホットケーキ", "Pancakes"], 150, 227, 6.4, 9.7, 28.3, 0.9, 1.1, 219, 1.8, 45, 0.2, 0.26, 0.2, 0.3],
  syrup: [["Miel de maple", "メープルシロップ", "Pancake syrup"], 30, 260, 0, 0.1, 67.0, 0, 0, 100, 0.1, 0, 0.07, 1.3, 0, 0],
  chile_relleno: [["Chile relleno", "チレ・レジェーノ", "Chile relleno"], 200, 190, 8.0, 13.0, 11.0, 1.8, 0.9, 150, 1.0, 50, 0.08, 0.2, 60, 0.3],
  chicken_soup: [["Caldo de pollo", "チキンスープ(カルド)", "Chicken soup"], 400, 40, 3.5, 1.2, 3.5, 0.6, 0.6, 10, 0.3, 60, 0.03, 0.04, 3, 0],
  birria: [["Birria", "ビリア(煮込み肉)", "Birria stew"], 300, 150, 14.0, 9.0, 3.0, 0.7, 0.8, 20, 1.8, 30, 0.06, 0.15, 3, 0.1],
  esquites: [["Esquites", "エスキーテス(カップのとうもろこし)", "Esquites corn cup"], 200, 150, 3.5, 8.0, 18.0, 2.0, 0.6, 40, 0.5, 20, 0.08, 0.07, 5, 0.1],
  churros: [["Churros", "チュロス", "Churros"], 60, 450, 5.0, 24.0, 54.0, 1.5, 0.4, 20, 1.5, 0, 0.15, 0.1, 0, 0],
};

const FIELDS = ["energy_kcal", "protein_g", "fat_g", "carbs_g", "fiber_g", "salt_g", "calcium_mg", "iron_mg", "vitamin_a_ug", "vitamin_b1_mg", "vitamin_b2_mg", "vitamin_c_mg", "vitamin_d_ug"];
const FOOD_LANGS = ["es", "ja", "en"];

export const FOOD_DB = Object.fromEntries(
  Object.entries(RAW).map(([key, [names, portion_g, ...vals]]) => [
    key,
    {
      names: Object.fromEntries(FOOD_LANGS.map((l, i) => [l, names[i]])),
      portion_g,
      per100g: Object.fromEntries(FIELDS.map((f, i) => [f, vals[i]])),
    },
  ]),
);

export function foodName(key, lang = "es") {
  const f = FOOD_DB[key];
  return f ? f.names[lang] ?? f.names.en : key;
}

/** プロンプトに埋め込む「使える食材キー」の一覧(モデル向けに英名) */
export function foodKeyList() {
  return Object.entries(FOOD_DB)
    .map(([k, v]) => `${k}: ${v.names.en} / ${v.names.es}`)
    .join("\n");
}

const fold = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** どの言語の名前でも引ける部分一致検索(アクセント記号は無視) */
export function searchFoods(query, lang = "es", limit = 20) {
  const q = fold(query.trim());
  const entries = Object.entries(FOOD_DB);
  const hits = q ? entries.filter(([k, f]) => [k, ...Object.values(f.names)].some((n) => fold(n).includes(q))) : entries;
  return hits.slice(0, limit).map(([key, f]) => ({ key, name: f.names[lang] ?? f.names.en, portion_g: f.portion_g, per100g: f.per100g }));
}
