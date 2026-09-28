// メキシコのチェーン店のメニューと、公式に公開されている栄養成分。
// 値は各社が公開している表から写したもの(出典と日付を source に記録)。
// 公式の表にない栄養素(ビタミン・ミネラルなど)は「不明」として扱い、0 とはみなさない。
//
// items の行: [メニュー名, 分類, 1食のg, kcal, 脂質g, ナトリウムmg, 炭水化物g, 食物繊維g, たんぱく質g]
export const CHAINS = {
  subway: {
    name: "Subway",
    source: "https://www.subway.com/es-mx/menunutrition/nutrition (Información nutrimental, agosto de 2026)",
    official: true,
    items: [
      ["Costillas Holy Moly Guacamoli 15 cm", "Sándwich", 279, 660, 38, 1470, 58, 5, 23],
      ["Crunchy Steak Bacon 15 cm", "Sándwich", 235, 550, 23, 1500, 51, 3, 30],
      ["American Teriyaki 15 cm", "Sándwich", 272, 470, 13, 1060, 64, 5, 24],
      ["Oh My Boneless! 15 cm", "Sándwich", 233, 550, 24, 1870, 57, 4, 27],
      ["Jamtochino 15 cm", "Sándwich", 241, 410, 15, 1630, 47, 3, 21],
      ["Italonni 15 cm", "Sándwich", 186, 490, 27, 1330, 41, 3, 21],
      ["Costillas BBQ 15 cm", "Sándwich", 264, 470, 22, 990, 48, 6, 21],
      ["Jamón 15 cm", "Sándwich", 219, 270, 6, 790, 40, 6, 16],
      ["Boneless Hot 15 cm", "Sándwich", 203, 540, 26, 1900, 54, 4, 23],
      ["Pollo Estilo Teriyaki 15 cm", "Sándwich", 247, 330, 4, 630, 52, 5, 22],
      ["Pollo 15 cm", "Sándwich", 226, 290, 4, 440, 39, 5, 25],
      ["Chicken Bacon Ranch 15 cm", "Sándwich", 252, 390, 13, 710, 40, 5, 29],
      ["Milanesa de Pollo 15 cm", "Sándwich", 237, 390, 14, 470, 51, 9, 19],
      ["Milanesa de Pollo Napolitana 15 cm", "Sándwich", 308, 530, 23, 1570, 58, 8, 27],
      ["Milanesa de Pollo Mexicana 15 cm", "Sándwich", 257, 470, 22, 760, 55, 8, 19],
      ["Milanesa de Pollo 3 Quesos 15 cm", "Sándwich", 231, 480, 22, 1080, 53, 6, 22],
      ["Italiano B.M.T. 15 cm", "Sándwich", 224, 390, 17, 1050, 40, 6, 19],
      ["Albóndigas 15 cm", "Sándwich", 258, 540, 22, 1410, 57, 5, 28],
      ["Pollo Parmesano 15 cm", "Sándwich", 270, 430, 16, 660, 55, 9, 21],
      ["Pizza Sub 15 cm", "Sándwich", 238, 430, 20, 1140, 44, 6, 19],
      ["Carne y Queso 15 cm", "Sándwich", 168, 370, 11, 1050, 39, 2, 25],
      ["Atún 15 cm", "Sándwich", 236, 320, 10, 580, 40, 5, 19],
      ["Pechuga de pavo 15 cm", "Sándwich", 205, 270, 4, 690, 44, 5, 15],
      ["Deleite Vegetariano 15 cm", "Sándwich", 174, 250, 6, 440, 39, 5, 12],
      ["Golazo Costillitas BBQ", "Sándwich", 183, 360, 16, 1110, 40, 2, 13],
      ["Golazo Jamón y Queso con Guacamole", "Sándwich", 161, 330, 15, 1010, 37, 3, 10],
      ["Golazo Milanesa de Pollo", "Sándwich", 245, 490, 20, 1000, 35, 3, 21],
      ["Ultra Golazo Steak", "Sándwich", 250, 420, 15, 1480, 41, 2, 23],
      ["Golazo Kids sub", "Sándwich", 136, 290, 12, 980, 34, 1, 11],
      ["Gran Pastor", "Sándwich", 257, 470, 20, 1510, 43, 5, 31],
      ["Gringo Pastor", "Sándwich", 215, 420, 15, 1360, 40, 2, 31],
      ["Campechano", "Sándwich", 206, 430, 17, 1030, 45, 3, 25],
      ["Golazo Pastor", "Sándwich", 132, 290, 8, 750, 40, 2, 14],
      ["Ensalada Costillas BBQ", "Ensalada", 375, 310, 20, 810, 19, 5, 14],
      ["Ensalada Jamón", "Ensalada", 330, 110, 4, 600, 11, 4, 9],
      ["Ensalada Boneless Hot", "Ensalada", 420, 450, 30, 1860, 28, 6, 18],
      ["Ensalada Milanesa de Pollo", "Ensalada", 348, 230, 13, 280, 22, 7, 12],
      ["Ensalada Pollo", "Ensalada", 337, 120, 2, 250, 10, 4, 17],
      ["Ensalada Pollo Estilo Teriyaki", "Ensalada", 358, 160, 2, 440, 23, 4, 14],
      ["Ensalada Chicken Bacon Ranch", "Ensalada", 363, 220, 12, 520, 11, 4, 21],
      ["Ensalada Italian BMT", "Ensalada", 335, 220, 15, 860, 11, 4, 12],
      ["Ensalada Pollo Parmesano", "Ensalada", 381, 270, 15, 480, 25, 8, 13],
      ["Ensalada Pizza Sub", "Ensalada", 349, 270, 19, 950, 14, 4, 12],
      ["Ensalada Carne y Queso", "Ensalada", 356, 230, 10, 890, 11, 4, 21],
      ["Ensalada Atún", "Ensalada", 347, 160, 9, 390, 10, 4, 11],
      ["Ensalada Pechuga de pavo", "Ensalada", 316, 100, 2, 500, 14, 4, 8],
      ["Ensalada Deleite Vegetariano con queso", "Ensalada", 285, 90, 4, 250, 9, 4, 5],
      ["Galleta de Chispas de Chocolate", "Postre", 45, 220, 11, 90, 27, 1, 2],
      ["Galleta de Doble Chocolate", "Postre", 45, 220, 12, 65, 27, 1, 2],
      ["Galleta de Nuez", "Postre", 45, 210, 10, 90, 29, 1, 2],
      ["Galleta de Arándano", "Postre", 45, 210, 10, 90, 29, 1, 2],
      ["Papas Horneadas Crosschips", "Guarnición", 102, 180, 7, 910, 27, 2, 3],
      ["Boneless Bites (salsa búfalo)", "Guarnición", 190, 350, 19, 2730, 21, 4, 25],
      ["Boneless Bites (salsa BBQ)", "Guarnición", 190, 360, 18, 2100, 24, 4, 25],
    ],
  },
};

/** チェーン店のメニュー1品の栄養素(1食分)。公式の表にない栄養素は null(不明) */
export function chainItemNutrients(row) {
  const [, , , kcal, fat, sodiumMg, carbs, fiber, protein] = row;
  return {
    energy_kcal: kcal,
    protein_g: protein,
    fat_g: fat,
    carbs_g: carbs,
    fiber_g: fiber,
    salt_g: Math.round(((sodiumMg * 2.54) / 1000) * 100) / 100, // ナトリウム(mg) × 2.54 ÷ 1000 = 食塩相当量(g)
    calcium_mg: null,
    iron_mg: null,
    vitamin_a_ug: null,
    vitamin_b1_mg: null,
    vitamin_b2_mg: null,
    vitamin_c_mg: null,
    vitamin_d_ug: null,
  };
}

const foldChain = (s) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** チェーン名・メニュー名での検索(「subway pollo」のように両方を含めてもよい) */
export function searchChainItems(query, limit = 20) {
  const words = foldChain(query.trim()).split(/\s+/).filter(Boolean);
  if (!words.length) return [];
  const out = [];
  for (const [chainKey, chain] of Object.entries(CHAINS)) {
    for (const [i, row] of chain.items.entries()) {
      const hay = foldChain(`${chain.name} ${row[0]} ${row[1]}`);
      if (words.every((w) => hay.includes(w))) out.push({ key: `${chainKey}:${i}`, chain: chain.name, name: row[0], grams: row[2], official: chain.official, nutrients: chainItemNutrients(row) });
    }
  }
  // 検索語に近い(名前が短い)ものを先に出す
  return out.sort((a, b) => a.name.length - b.name.length).slice(0, limit);
}
