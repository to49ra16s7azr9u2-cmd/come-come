// 端末内の料理判別AIが見分ける料理の一覧と、1皿あたりの標準的な材料(g)。
// 判別した料理名から、この材料表と foods.js の成分表でカロリー・栄養素を計算する。
// prompt は判別AI(CLIP)に渡す英語の説明。CLIP は英語で学習されているため英語で書く。
//
// 行の形: key: [[es, ja, en], prompt, [[食品キー, g], ...]]
const DISH_RAW = {
  tacos_pastor: [["Tacos al pastor", "タコス・アル・パストール", "Tacos al pastor"], "tacos al pastor with pork, pineapple, onion and cilantro on small corn tortillas",
    [["corn_tortilla", 60], ["al_pastor", 90], ["onion", 15], ["salsa", 20], ["pineapple", 15]]],
  tacos_asada: [["Tacos de carne asada", "カルネ・アサーダのタコス", "Carne asada tacos"], "carne asada tacos with grilled beef on corn tortillas",
    [["corn_tortilla", 60], ["carne_asada", 100], ["onion", 15], ["salsa", 20]]],
  tacos_carnitas: [["Tacos de carnitas", "カルニータスのタコス", "Carnitas tacos"], "carnitas tacos with shredded pork on corn tortillas",
    [["corn_tortilla", 60], ["carnitas", 100], ["onion", 15], ["salsa", 20]]],
  quesadilla: [["Quesadillas", "ケサディーヤ", "Quesadillas"], "quesadillas, folded tortillas filled with melted cheese",
    [["corn_tortilla", 60], ["queso_oaxaca", 60]]],
  enchiladas: [["Enchiladas", "エンチラーダ", "Enchiladas"], "enchiladas, rolled tortillas covered in red or green sauce with cream and cheese",
    [["corn_tortilla", 90], ["chicken_breast", 90], ["salsa", 120], ["crema", 20], ["queso_fresco", 20], ["onion", 10]]],
  chilaquiles: [["Chilaquiles", "チラキレス", "Chilaquiles"], "chilaquiles, fried tortilla chips in salsa topped with cream, cheese and egg",
    [["tostada", 60], ["salsa", 120], ["crema", 20], ["queso_fresco", 20], ["egg", 50]]],
  pozole: [["Pozole", "ポソレ", "Pozole"], "pozole, a hominy soup with pork, garnished with lettuce and radish",
    [["pozole", 400]]],
  tamales: [["Tamales", "タマレス", "Tamales"], "tamales, corn dough wrapped in corn husks",
    [["tamal", 150]]],
  burrito: [["Burrito", "ブリトー", "Burrito"], "a burrito, a large flour tortilla wrapped around rice, beans and meat",
    [["flour_tortilla", 70], ["refried_beans", 80], ["carne_asada", 80], ["mexican_rice", 60], ["queso_oaxaca", 20], ["salsa", 30]]],
  torta: [["Torta", "トルタ(メキシコ風サンド)", "Torta sandwich"], "a Mexican torta sandwich on a bolillo roll",
    [["bolillo", 90], ["ham", 40], ["queso_oaxaca", 30], ["avocado", 30], ["refried_beans", 30], ["tomato", 20], ["jalapeno", 10]]],
  tostadas: [["Tostadas", "トスターダ", "Tostadas"], "tostadas, flat crispy tortillas topped with beans, chicken, lettuce and cream",
    [["tostada", 26], ["refried_beans", 60], ["chicken_breast", 60], ["lettuce", 20], ["crema", 15], ["queso_fresco", 15], ["salsa", 20]]],
  huevos_rancheros: [["Huevos rancheros", "ウエボス・ランチェロス", "Huevos rancheros"], "huevos rancheros, fried eggs on tortillas with salsa",
    [["corn_tortilla", 60], ["egg", 100], ["salsa", 100], ["refried_beans", 60]]],
  huevos_mexicana: [["Huevos a la mexicana", "メキシコ風スクランブルエッグ", "Mexican-style scrambled eggs"], "scrambled eggs with tomato, onion and chili",
    [["egg", 100], ["tomato", 40], ["onion", 20], ["jalapeno", 10], ["oil", 5], ["corn_tortilla", 60]]],
  molletes: [["Molletes", "モジェテス", "Molletes"], "molletes, open-faced bolillo rolls with refried beans and melted cheese",
    [["bolillo", 70], ["refried_beans", 60], ["queso_oaxaca", 40], ["salsa", 30]]],
  mole: [["Mole con pollo", "鶏肉のモレ", "Chicken mole"], "chicken covered in dark brown mole sauce with sesame seeds",
    [["chicken_breast", 120], ["mole", 120], ["mexican_rice", 100]]],
  sopa_fideo: [["Sopa de fideo", "フィデオスープ", "Noodle soup"], "sopa de fideo, a tomato broth soup with thin noodles",
    [["sopa_fideo", 300]]],
  guacamole: [["Guacamole con totopos", "ワカモレとトルティーヤチップス", "Guacamole with chips"], "guacamole with tortilla chips",
    [["guacamole", 100], ["tostada", 30]]],
  elote: [["Elote", "エローテ(焼きとうもろこし)", "Mexican street corn"], "elote, grilled corn on the cob with mayonnaise, cheese and chili powder",
    [["corn_cob", 150], ["crema", 15], ["queso_fresco", 10], ["oil", 5]]],
  nachos: [["Nachos", "ナチョス", "Nachos"], "nachos, tortilla chips covered with melted cheese and jalapeños",
    [["tostada", 60], ["queso_oaxaca", 40], ["refried_beans", 50], ["jalapeno", 15], ["crema", 15]]],
  flautas: [["Flautas", "フラウタス", "Flautas"], "flautas, fried rolled tacos topped with lettuce, cream and cheese",
    [["corn_tortilla", 60], ["chicken_breast", 60], ["oil", 15], ["lettuce", 20], ["crema", 20], ["queso_fresco", 15], ["salsa", 30]]],
  sopes: [["Sopes", "ソペス", "Sopes"], "sopes, thick corn cakes topped with beans, cheese, lettuce and salsa",
    [["corn_tortilla", 90], ["refried_beans", 40], ["queso_fresco", 20], ["lettuce", 15], ["salsa", 20]]],
  tlayuda: [["Tlayuda", "トラユーダ", "Tlayuda"], "tlayuda, a large crispy tortilla with beans, Oaxaca cheese and meat",
    [["corn_tortilla", 90], ["refried_beans", 80], ["queso_oaxaca", 50], ["carne_asada", 60], ["lettuce", 20], ["avocado", 30], ["oil", 5]]],
  ceviche: [["Ceviche", "セビーチェ", "Ceviche"], "ceviche, raw fish cured in lime juice with tomato, onion and cilantro",
    [["tilapia", 120], ["tomato", 40], ["onion", 20], ["avocado", 30], ["jalapeno", 5], ["tostada", 26]]],
  coctel_camaron: [["Cóctel de camarón", "エビのカクテル", "Shrimp cocktail"], "Mexican shrimp cocktail in a glass with tomato sauce and avocado",
    [["shrimp", 120], ["salsa", 80], ["avocado", 30], ["onion", 15]]],
  frijoles: [["Frijoles de olla", "フリホーレス(煮豆)", "Pot beans"], "a bowl of frijoles de olla, whole beans in broth",
    [["beans_boiled", 250]]],
  arroz_rojo: [["Arroz rojo", "メキシカンライス", "Mexican red rice"], "Mexican red rice with peas and carrots",
    [["mexican_rice", 150]]],
  concha: [["Pan dulce (concha)", "コンチャ(菓子パン)", "Concha sweet bread"], "a concha, Mexican sweet bread with a crackled sugar topping",
    [["concha", 70]]],
  fruta: [["Fruta picada", "カットフルーツ", "Fruit cup"], "a cup of chopped fruit with mango, papaya, watermelon and pineapple",
    [["mango", 70], ["papaya", 60], ["watermelon", 60], ["pineapple", 60]]],
  horchata: [["Agua de horchata", "オルチャータ", "Horchata"], "a glass of horchata, a milky white rice drink with cinnamon",
    [["horchata", 350]]],
  refresco: [["Refresco", "炭酸飲料", "Soft drink"], "a can or bottle of cola soft drink",
    [["cola", 355]]],
  cerveza: [["Cerveza", "ビール", "Beer"], "a bottle or glass of beer",
    [["beer", 355]]],
  ensalada: [["Ensalada", "サラダ", "Salad"], "a green salad with lettuce and tomato",
    [["lettuce", 60], ["tomato", 60], ["carrot", 20], ["oil", 5]]],
  pasta: [["Pasta", "パスタ", "Pasta"], "a plate of spaghetti pasta with tomato sauce",
    [["pasta", 250], ["salsa", 80]]],
  ramen: [["Ramen", "ラーメン", "Ramen"], "a bowl of Japanese ramen noodle soup",
    [["ramen_noodle", 230], ["pork_loin", 40], ["egg", 25]]],
  arroz_blanco: [["Arroz blanco", "ごはん", "White rice"], "a bowl of plain white rice",
    [["white_rice", 150]]],
};

// 料理ではないもの(判別AIが「料理が映っていない」と判断するための比較対象)
export const NON_FOOD_PROMPTS = [
  "an empty plate",
  "an empty table",
  "a person's face",
  "a room with no food",
  "a smartphone screen",
];

export const DISHES = Object.fromEntries(
  Object.entries(DISH_RAW).map(([key, [[es, ja, en], prompt, recipe]]) => [
    key,
    { names: { es, ja, en }, prompt, recipe: recipe.map(([db_key, grams]) => ({ db_key, grams })) },
  ]),
);

export const DISH_KEYS = Object.keys(DISHES);

/** CLIP 用の説明文(複数の言い回しを平均すると精度が上がる) */
export function dishPrompts(key) {
  const d = DISHES[key];
  return [
    `a photo of ${d.prompt}.`,
    `a photo of ${d.names.en}, a type of Mexican food.`,
    `a close-up photo of a plate of ${d.names.en}.`,
    `${d.names.es}, comida mexicana.`,
  ];
}

/** 1皿を何口(飲み物は何口)で食べきるかの目安。端末内モードで、ひと口ごとに減らす量の計算に使う */
const BITES_PER_SERVING = {
  tacos_pastor: 12, tacos_asada: 12, tacos_carnitas: 12, quesadilla: 10, tostadas: 8, elote: 12,
  pozole: 25, sopa_fideo: 20, frijoles: 20, ramen: 25, concha: 8, fruta: 15,
  horchata: 12, refresco: 12, cerveza: 12,
};
export function bitesPerServing(key) {
  return BITES_PER_SERVING[key] ?? 15;
}
