// メキシコのチェーン店のメニューと、公式に公開されている栄養成分。
// 値は各社が公開している表から写したもの(出典と日付を source に記録)。
// 公式の表にない栄養素(ビタミン・ミネラルなど)は「不明」として扱い、0 とはみなさない。
//
// items の行: [メニュー名, 分類, 1食のg(公開されていなければ null), kcal, 脂質g, ナトリウムmg, 炭水化物g, 食物繊維g, たんぱく質g, 追加情報?]
// 追加情報: { serving: "1 dona" など g の代わりの量の表記, 公開されているビタミン・ミネラル(calcium_mg など) }
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
  dunkin: {
    name: "Dunkin'",
    source: "https://dunkin.mx/nutricional.aspx (tabla nutricional, PDF vigente al 2026-09)",
    official: true,
    items: [
      ["Glazed Donut", "Dona", null, 240, 11, 270, 33, 1, 4, { serving: "1 dona", vitamin_d_ug: 0, calcium_mg: 12, iron_mg: 2 }],
      ["Double Chocolate", "Dona", null, 380, 23, 430, 41, 1, 4, { serving: "1 dona", vitamin_d_ug: 0, calcium_mg: 26, iron_mg: 1 }],
      ["Peanut", "Dona", null, 470, 27, 320, 50, 2, 8, { serving: "1 dona", vitamin_d_ug: 0, calcium_mg: 33, iron_mg: 2 }],
      ["Maple Frosted", "Dona", null, 260, 11, 280, 35, 1, 4, { serving: "1 dona", vitamin_d_ug: 0, calcium_mg: 12, iron_mg: 2 }],
      ["Old Fashioned", "Dona", null, 310, 19, 320, 30, 1, 4, { serving: "1 dona", vitamin_d_ug: 0, calcium_mg: 24, iron_mg: 2 }],
      ["French Cruller", "Dona", null, 230, 14, 135, 21, 0, 3, { serving: "1 dona", vitamin_d_ug: 0, calcium_mg: 12, iron_mg: 0 }],
      ["Vanilla Frosted", "Dona", null, 260, 11, 280, 34, 1, 4, { serving: "1 dona", vitamin_d_ug: 0, calcium_mg: 12, iron_mg: 2 }],
      ["Boston Kreme", "Dona", null, 270, 11, 320, 39, 1, 5, { serving: "1 dona", vitamin_d_ug: 1, calcium_mg: 33, iron_mg: 2 }],
      ["Chocolate Crème", "Dona", null, 290, 14, 300, 36, 1, 5, { serving: "1 dona", vitamin_d_ug: 1, calcium_mg: 14, iron_mg: 2 }],
      ["Americano Original Blend chico", "Bebida caliente", null, 5, 0, 15, 1, 0, 0, { serving: "small", vitamin_d_ug: 0, calcium_mg: 7, iron_mg: 0 }],
      ["Americano Original Blend mediano", "Bebida caliente", null, 10, 0, 25, 2, 0, 0, { serving: "medium", vitamin_d_ug: 0, calcium_mg: 12, iron_mg: 0 }],
      ["Americano Original Blend grande", "Bebida caliente", null, 10, 0, 30, 2, 0, 0, { serving: "large", vitamin_d_ug: 0, calcium_mg: 15, iron_mg: 0 }],
      ["Latte chico", "Bebida caliente", null, 120, 6, 85, 9, 0, 6, { serving: "small", vitamin_d_ug: 2, calcium_mg: 208, iron_mg: 0 }],
      ["Latte mediano", "Bebida caliente", null, 170, 9, 125, 14, 0, 9, { serving: "medium", vitamin_d_ug: 4, calcium_mg: 311, iron_mg: 0 }],
      ["Latte grande", "Bebida caliente", null, 230, 12, 170, 19, 0, 12, { serving: "large", vitamin_d_ug: 5, calcium_mg: 415, iron_mg: 0 }],
      ["Chai Latte chico", "Bebida caliente", null, 150, 0, 100, 29, 1, 7, { serving: "small", vitamin_d_ug: 2, calcium_mg: 225, iron_mg: 0 }],
      ["Chai Latte mediano", "Bebida caliente", null, 220, 0, 150, 44, 2, 10, { serving: "medium", vitamin_d_ug: 3, calcium_mg: 338, iron_mg: 0 }],
      ["Chai Latte grande", "Bebida caliente", null, 290, 0.5, 200, 58, 2, 13, { serving: "large", vitamin_d_ug: 4, calcium_mg: 450, iron_mg: 1 }],
      ["Cappuccino chico", "Bebida caliente", null, 45, 0, 55, 7, 0, 4, { serving: "small", vitamin_d_ug: 1, calcium_mg: 150, iron_mg: 0 }],
      ["Cappuccino mediano", "Bebida caliente", null, 70, 0, 85, 10, 0, 6, { serving: "medium", vitamin_d_ug: 2, calcium_mg: 225, iron_mg: 0 }],
      ["Cappuccino grande", "Bebida caliente", null, 90, 0, 115, 13, 0, 8, { serving: "large", vitamin_d_ug: 3, calcium_mg: 300, iron_mg: 0 }],
      ["Mocha chico", "Bebida caliente", null, 110, 0, 20, 25, 1, 1, { serving: "small", vitamin_d_ug: 0, calcium_mg: 11, iron_mg: 1 }],
      ["Mocha mediano", "Bebida caliente", null, 160, 0.5, 30, 38, 2, 2, { serving: "medium", vitamin_d_ug: 0, calcium_mg: 16, iron_mg: 1 }],
      ["Mocha grande", "Bebida caliente", null, 210, 1, 40, 50, 2, 2, { serving: "large", vitamin_d_ug: 0, calcium_mg: 20, iron_mg: 2 }],
      ["Mocha extra grande", "Bebida caliente", null, 260, 1, 45, 63, 3, 3, { serving: "xlarge", vitamin_d_ug: 0, calcium_mg: 25, iron_mg: 2 }],
      ["Macchiato chico", "Bebida caliente", null, 50, 0, 65, 7, 0, 4, { serving: "small", vitamin_d_ug: 1, calcium_mg: 151, iron_mg: 0 }],
      ["Macchiato mediano", "Bebida caliente", null, 70, 0, 90, 11, 0, 6, { serving: "medium", vitamin_d_ug: 2, calcium_mg: 226, iron_mg: 0 }],
      ["Macchiato grande", "Bebida caliente", null, 230, 0, 120, 49, 0, 8, { serving: "large", vitamin_d_ug: 3, calcium_mg: 301, iron_mg: 0 }],
      ["Chocolate Caliente chico", "Bebida caliente", null, 220, 7, 210, 40, 2, 2, { serving: "small", vitamin_d_ug: 0, calcium_mg: 34, iron_mg: 0 }],
      ["Chocolate Caliente mediano", "Bebida caliente", null, 330, 10, 320, 59, 2, 3, { serving: "medium", vitamin_d_ug: 0, calcium_mg: 50, iron_mg: 0 }],
      ["Chocolate Caliente grande", "Bebida caliente", null, 460, 14, 440, 82, 3, 4, { serving: "large", vitamin_d_ug: 0, calcium_mg: 70, iron_mg: 1 }],
      ["Chocolate Caliente extra grande", "Bebida caliente", null, 500, 15, 480, 89, 3, 4, { serving: "xlarge", vitamin_d_ug: 0, calcium_mg: 76, iron_mg: 1 }],
      ["Box O'Joe (1 vaso chico)", "Bebida caliente", null, 5, 0, 5, 0, 0, 0, { serving: "1 small cup", vitamin_d_ug: 0, calcium_mg: 6, iron_mg: 0 }],
      ["Iced Cappuccino chico", "Bebida fría", null, 45, 0, 65, 7, 0, 4, { serving: "small", vitamin_d_ug: 1, calcium_mg: 158, iron_mg: 0 }],
      ["Iced Cappuccino mediano", "Bebida fría", null, 70, 0, 95, 10, 0, 6, { serving: "medium", vitamin_d_ug: 2, calcium_mg: 236, iron_mg: 0 }],
      ["Iced Cappuccino grande", "Bebida fría", null, 230, 0, 130, 48, 0, 8, { serving: "large", vitamin_d_ug: 3, calcium_mg: 316, iron_mg: 0 }],
      ["Frozen Coffee chico", "Bebida fría", null, 250, 1, 95, 59, 0, 1, { serving: "small", vitamin_d_ug: 1, calcium_mg: 187, iron_mg: 0 }],
      ["Frozen Coffee mediano", "Bebida fría", null, 370, 1.5, 140, 88, 0, 2, { serving: "medium", vitamin_d_ug: 1, calcium_mg: 280, iron_mg: 0 }],
      ["Frozen Coffee grande", "Bebida fría", null, 500, 2, 190, 118, 0, 2, { serving: "large", vitamin_d_ug: 2, calcium_mg: 374, iron_mg: 1 }],
      ["Iced Latte chico", "Bebida fría", null, 70, 2, 130, 11, 0, 1, { serving: "small", vitamin_d_ug: 2, calcium_mg: 358, iron_mg: 1 }],
      ["Iced Latte mediano", "Bebida fría", null, 100, 3, 190, 17, 1, 1, { serving: "medium", vitamin_d_ug: 3, calcium_mg: 536, iron_mg: 1 }],
      ["Iced Latte grande", "Bebida fría", null, 130, 3.5, 260, 23, 1, 2, { serving: "large", vitamin_d_ug: 4, calcium_mg: 715, iron_mg: 1 }],
      ["Cold Brew chico", "Bebida fría", null, 60, 6, 30, 1, 0, 1, { serving: "small", vitamin_d_ug: 0, calcium_mg: 37, iron_mg: 0 }],
      ["Cold Brew mediano", "Bebida fría", null, 90, 9, 45, 1, 0, 2, { serving: "medium", vitamin_d_ug: 0, calcium_mg: 55, iron_mg: 0 }],
      ["Cold Brew grande", "Bebida fría", null, 120, 12, 65, 2, 0, 2, { serving: "large", vitamin_d_ug: 1, calcium_mg: 75, iron_mg: 0 }],
      ["Nitro Cold Brew chico", "Bebida fría", null, 5, 0, 5, 0, 0, 0, { serving: "small", vitamin_d_ug: 0, calcium_mg: 6, iron_mg: 0 }],
      ["Iced Green Tea chico", "Bebida fría", null, 70, 0, 10, 16, 0, 1, { serving: "small", vitamin_d_ug: 0, calcium_mg: 5, iron_mg: 0 }],
      ["Iced Green Tea mediano", "Bebida fría", null, 100, 0, 10, 25, 0, 1, { serving: "medium", vitamin_d_ug: 0, calcium_mg: 6, iron_mg: 0 }],
      ["Iced Green Tea grande", "Bebida fría", null, 140, 0, 15, 33, 0, 1, { serving: "large", vitamin_d_ug: 0, calcium_mg: 10, iron_mg: 0 }],
      ["Lemonade chico", "Bebida fría", null, 120, 0, 15, 30, 0, 0, { serving: "small", vitamin_d_ug: 0, calcium_mg: 13, iron_mg: 0 }],
      ["Lemonade mediano", "Bebida fría", null, 180, 0, 20, 45, 0, 0, { serving: "medium", vitamin_d_ug: 0, calcium_mg: 19, iron_mg: 0 }],
      ["Lemonade grande", "Bebida fría", null, 240, 0, 25, 60, 0, 0, { serving: "large", vitamin_d_ug: 0, calcium_mg: 27, iron_mg: 0 }],
      ["Original Iced Americano chico", "Bebida fría", null, 5, 0, 25, 1, 0, 0, { serving: "small", vitamin_d_ug: 0, calcium_mg: 13, iron_mg: 0 }],
      ["Original Iced Americano mediano", "Bebida fría", null, 10, 0, 30, 2, 0, 0, { serving: "medium", vitamin_d_ug: 0, calcium_mg: 18, iron_mg: 0 }],
      ["Original Iced Americano grande", "Bebida fría", null, 10, 0, 40, 2, 0, 0, { serving: "large", vitamin_d_ug: 0, calcium_mg: 25, iron_mg: 0 }],
      ["Iced Macchiato chico", "Bebida fría", null, 50, 0, 70, 7, 0, 4, { serving: "small", vitamin_d_ug: 1, calcium_mg: 159, iron_mg: 0 }],
      ["Iced Macchiato mediano", "Bebida fría", null, 70, 0, 100, 11, 0, 6, { serving: "medium", vitamin_d_ug: 2, calcium_mg: 237, iron_mg: 0 }],
      ["Iced Macchiato grande", "Bebida fría", null, 90, 0, 135, 14, 0, 8, { serving: "large", vitamin_d_ug: 3, calcium_mg: 317, iron_mg: 0 }],
      ["Iced Chai Latte chico", "Bebida fría", null, 150, 0, 105, 29, 1, 7, { serving: "small", vitamin_d_ug: 2, calcium_mg: 233, iron_mg: 0 }],
      ["Iced Chai Latte mediano", "Bebida fría", null, 220, 0, 160, 44, 2, 10, { serving: "medium", vitamin_d_ug: 3, calcium_mg: 349, iron_mg: 0 }],
      ["Iced Chai Latte grande", "Bebida fría", null, 290, 0.5, 210, 58, 2, 13, { serving: "large", vitamin_d_ug: 4, calcium_mg: 466, iron_mg: 1 }],
      ["Iced Matcha Latte chico", "Bebida fría", null, 120, 2, 120, 24, 1, 2, { serving: "small", vitamin_d_ug: 4, calcium_mg: 351, iron_mg: 1 }],
      ["Iced Matcha Latte mediano", "Bebida fría", null, 180, 2.5, 180, 36, 2, 3, { serving: "medium", vitamin_d_ug: 6, calcium_mg: 526, iron_mg: 1 }],
      ["Iced Matcha Latte grande", "Bebida fría", null, 230, 3.5, 240, 48, 3, 3, { serving: "large", vitamin_d_ug: 8, calcium_mg: 702, iron_mg: 1 }],
      ["Frozen Chocolate chico", "Bebida fría", null, 490, 11, 170, 94, 2, 5, { serving: "small", vitamin_d_ug: 1, calcium_mg: 149, iron_mg: 1 }],
      ["Frozen Chocolate mediano", "Bebida fría", null, 690, 15, 250, 134, 3, 7, { serving: "medium", vitamin_d_ug: 2, calcium_mg: 214, iron_mg: 2 }],
      ["Frozen Chocolate grande", "Bebida fría", null, 890, 18, 330, 175, 4, 10, { serving: "large", vitamin_d_ug: 3, calcium_mg: 281, iron_mg: 2 }],
      ["Frozen Matcha chico", "Bebida fría", null, 240, 0, 50, 55, 1, 4, { serving: "small", vitamin_d_ug: 3, calcium_mg: 121, iron_mg: 0 }],
      ["Frozen Matcha mediano", "Bebida fría", null, 360, 0, 70, 83, 1, 6, { serving: "medium", vitamin_d_ug: 5, calcium_mg: 182, iron_mg: 0 }],
      ["Frozen Matcha grande", "Bebida fría", null, 480, 0, 95, 111, 2, 8, { serving: "large", vitamin_d_ug: 6, calcium_mg: 242, iron_mg: 0 }],
      ["Frozen Chai chico", "Bebida fría", null, 350, 6, 110, 66, 1, 6, { serving: "small", vitamin_d_ug: 2, calcium_mg: 217, iron_mg: 0 }],
      ["Frozen Chai mediano", "Bebida fría", null, 520, 9, 160, 99, 2, 9, { serving: "medium", vitamin_d_ug: 4, calcium_mg: 325, iron_mg: 0 }],
      ["Frozen Chai grande", "Bebida fría", null, 690, 12, 220, 132, 2, 12, { serving: "large", vitamin_d_ug: 5, calcium_mg: 434, iron_mg: 1 }],
      ["Strawberry Dragonfruit Refresher chico", "Bebida fría", null, 80, 0, 10, 19, 0, 0, { serving: "small", vitamin_d_ug: 0, calcium_mg: 8, iron_mg: 0 }],
      ["Strawberry Dragonfruit Refresher mediano", "Bebida fría", null, 130, 0, 15, 29, 0, 1, { serving: "medium", vitamin_d_ug: 0, calcium_mg: 10, iron_mg: 0 }],
      ["Strawberry Dragonfruit Refresher grande", "Bebida fría", null, 170, 0, 20, 39, 0, 1, { serving: "large", vitamin_d_ug: 0, calcium_mg: 16, iron_mg: 0 }],
      ["Mango Pineapple Refresher chico", "Bebida fría", null, 90, 0, 10, 21, 0, 0, { serving: "small", vitamin_d_ug: 0, calcium_mg: 9, iron_mg: 0 }],
      ["Mango Pineapple Refresher mediano", "Bebida fría", null, 130, 0, 15, 32, 0, 1, { serving: "medium", vitamin_d_ug: 0, calcium_mg: 12, iron_mg: 0 }],
      ["Mango Pineapple Refresher grande", "Bebida fría", null, 170, 0, 25, 42, 0, 1, { serving: "large", vitamin_d_ug: 0, calcium_mg: 17, iron_mg: 0 }],
      ["English Muffin Huevo y Tocino", "Salado", null, 400, 19, 840, 39, 1, 18, { serving: "1 s\u00e1ndwich", vitamin_d_ug: 2, calcium_mg: 126, iron_mg: 3 }],
      ["Grilled Cheese Jamón y Queso", "Salado", null, 480, 20, 1120, 54, 3, 21, { serving: "1 s\u00e1ndwich", vitamin_d_ug: 0, calcium_mg: 407, iron_mg: 4 }],
      ["Bagel Queso Crema", "Salado", null, 300, 1, 620, 64, 4, 11, { serving: "1 bagel", vitamin_d_ug: 0, calcium_mg: 20, iron_mg: 4 }],
      ["Glazed Munchkins (1 pieza)", "Munchkins", null, 60, 3, 60, 7, 0, 1, { serving: "1 pieza", vitamin_d_ug: 0, calcium_mg: 2, iron_mg: 0 }],
      ["Chocolate Cake Munchkins (1 pieza)", "Munchkins", null, 60, 3.5, 80, 8, 0, 1, { serving: "1 pieza", vitamin_d_ug: 0, calcium_mg: 6, iron_mg: 0 }],
      ["Blueberry Munchkins (1 pieza)", "Munchkins", null, 60, 2.5, 75, 9, 0, 1, { serving: "1 pieza", vitamin_d_ug: 0, calcium_mg: 5, iron_mg: 0 }],
      ["Mixto Munchkins (1 pieza)", "Munchkins", null, 60, 3.5, 65, 7, 0, 1, { serving: "1 pieza", vitamin_d_ug: 0, calcium_mg: 3, iron_mg: 0 }],
    ],
  },
  carls: {
    name: "Carl's Jr.",
    source: "https://carlsjr.com.mx/menu-y-nutricion (páginas de cada producto, consultadas 2026-09-28)",
    official: true,
    items: [
      ["Bacon & Egg Burrito", "Desayuno", 207, 570, 35, 1000, 32, 1, 29],
      ["Breakfast Sandwich", "Desayuno", 202, 500, 26, 1610, 43, 2, 34],
      ["Hash Brown", "Desayuno", 108, 350, 23, 440, 32, 3, 3],
      ["Loaded Breakfast Burrito", "Desayuno", 301, 760, 48, 1330, 46, 3, 33],
      ["The Breakfast Burger™", "Desayuno", 256, 730, 43, 1290, 47, 3, 37],
      ["Double Western Bacon Cheeseburger®", "Hamburguesa y s\u00e1ndwich", 322, 1010, 55, 1980, 76, 4, 55],
      ["Famous Star® with Cheese", "Hamburguesa y s\u00e1ndwich", 284, 670, 37, 1210, 57, 3, 28],
      ["Guacamole Bacon Big Angus Burger®", "Hamburguesa y s\u00e1ndwich", 369, 950, 67, 1810, 50, 3, 39],
      ["Low Carb Big Angus Burger®", "Hamburguesa y s\u00e1ndwich", 252, 420, 33, 1600, 9, 2, 25],
      ["Super Star® with Cheese", "Hamburguesa y s\u00e1ndwich", 390, 920, 56, 1540, 59, 4, 48],
      ["The Big Carl™", "Hamburguesa y s\u00e1ndwich", 321, 920, 58, 1380, 56, 3, 47],
      ["The Original Big Angus Burger®", "Hamburguesa y s\u00e1ndwich", 338, 780, 48, 1380, 56, 3, 47],
      ["Western Bacon Big Angus Burger®", "Hamburguesa y s\u00e1ndwich", 289, 870, 48, 1840, 74, 3, 33],
      ["Bacon Swiss Hand-Breaded Chicken Sandwich", "Hamburguesa y s\u00e1ndwich", 322, 770, 41, 1980, 58, 3, 42],
      ["Hand-Breaded Chicken Sandwich", "Hamburguesa y s\u00e1ndwich", 288, 650, 33, 1330, 55, 3, 33],
      ["Chargrilled BBQ Chicken™", "Hamburguesa y s\u00e1ndwich", 239, 390, 7, 990, 50, 3, 30],
      ["Chargrilled Chicken Club™", "Hamburguesa y s\u00e1ndwich", 264, 580, 28, 1290, 46, 2, 36],
      ["Chargrilled Santa Fe Chicken™", "Hamburguesa y s\u00e1ndwich", 256, 560, 27, 1290, 46, 3, 33],
      ["Chicken Stars", "Papas y guarniciones", 91, 260, 16, 540, 18, 2, 12],
      ["CrissCut® Fries", "Papas y guarniciones", 139, 450, 39, 900, 42, 4, 5],
      ["Natural-Cut French Fries", "Papas y guarniciones", 104, 300, 15, 600, 39, 4, 3],
      ["Onion Rings", "Papas y guarniciones", 128, 530, 28, 590, 61, 3, 8],
      ["Original Grilled Chicken Salad", "Papas y guarniciones", 293, 280, 9, 950, 19, 2, 32],
      ["Side Salad", "Papas y guarniciones", 193, 140, 7, 240, 15, 2, 6],
      ["Chocolate Hand-Scooped® Ice Cream Shake", "Bebida y postre", 397, 690, 36, 300, 84, 1, 12],
      ["OREO® Cookie Hand-Scooped® Ice Cream Shake", "Bebida y postre", 397, 710, 39, 340, 79, 1, 13],
      ["Strawberry Hand-Scooped® Ice Cream Shake", "Bebida y postre", 397, 690, 35, 250, 83, 0, 12],
      ["Vanilla Hand-Scooped® Ice Cream Shake", "Bebida y postre", 397, 700, 35, 240, 86, 0, 12],
      ["Chocolate Chip Cookie", "Bebida y postre", 71, 370, 19, 350, 48, 2, 3],
    ],
  },
  kfc: {
    name: "KFC",
    source: "https://kfc.com.mx/es/tabla-nutricional (Nutrimentales 2026 V5, imágenes transcritas 2026-09)",
    official: true,
    // 公式の表のうち、つじつまの合わない値を validateChainRow で自動的に除外・不明扱いにする(下の説明を参照)
    needsValidation: true,
    items: [
      ["Pieza Crujipollo", "Pollo", null, 190.6, 25.4, 4282.4, 49.1, null, 16.7, {"serving": "1 pieza", "kcal_per_100g": 153.96}],
      ["Pieza Receta Secreta", "Pollo", null, 153.81, 16, 3525.6, 35.1, null, 13.4, {"serving": "1 pieza", "kcal_per_100g": 151.46}],
      ["Pieza Hot Cruji", "Pollo", null, 190.6, 25.4, 4282.6, 49.8, null, 16.9, {"serving": "1 pieza", "kcal_per_100g": 151.63}],
      ["Pieza Spicy BBQ", "Pollo", null, 220.67, 25.6, 4803.4, 55.4, null, 17.9, {"serving": "1 pieza", "kcal_per_100g": 158.53}],
      ["Pieza Jalapeño", "Pollo", null, 195.69, 25.4, 4508.7, 49.5, null, 17.4, {"serving": "1 pieza", "kcal_per_100g": 149.96}],
      ["Pieza Mango furioso", "Pollo", null, 268.34, 25.4, 4612.4, 69, null, 16.7, {"serving": "1 pieza", "kcal_per_100g": 158.78}],
      ["Ke-Tira Cruji", "Pollo", null, 165.02, 9.6, 3866.4, 7.2, null, 12.9, {"serving": "1 tira", "kcal_per_100g": 256.5}],
      ["Ke-Tira Jalapeño", "Pollo", null, 168.29, 9.6, 4011.6, 7.4, null, 13.4, {"serving": "1 tira", "kcal_per_100g": 245.2}],
      ["Ke-Tira Hot Cruji", "Pollo", null, 165.02, 9.6, 3866.6, 7.7, null, 13.1, {"serving": "1 tira", "kcal_per_100g": 251.04}],
      ["Ke-Tira Spicy BBQ", "Pollo", null, 180.64, 9.7, 4137.1, 10.4, null, 13.5, {"serving": "1 tira", "kcal_per_100g": 249.73}],
      ["Ke-Tira Buffalo Hot", "Pollo", null, 207.07, 9.6, 4202.1, 7.8, null, 12.9, {"serving": "1 tira", "kcal_per_100g": 265.37}],
      ["Ke-Tira Mango furioso", "Pollo", null, 211.8, 9.6, 4065, 19.1, null, 12.9, {"serving": "1 tira", "kcal_per_100g": 231.39}],
      ["Big Krunch", "Burger", null, 797.74, 39.4, 9782.6, 79.5, null, 35.2, {"serving": "1 burger", "kcal_per_100g": 276.02}],
      ["Kruncher", "Burger", null, 660.99, 30.1, 11689.9, 63.9, null, 34.9, {"serving": "1 burger", "kcal_per_100g": 230.36}],
      ["Ke-Tiras Burger", "Burger", null, 498.26, 24.9, 9791.6, 51.4, null, 32.1, {"serving": "1 burger", "kcal_per_100g": 232.4}],
      ["Ke-Tiras Burger BBQ", "Burger", null, 490.65, 21.6, 9831.8, 44, null, 33.4, {"serving": "1 burger", "kcal_per_100g": 239.07}],
      ["Ke-Tiras Burger Jalapeño", "Burger", null, 465.94, 21.4, 9581, 38.1, null, 33.1, {"serving": "1 burger", "kcal_per_100g": 235.52}],
      ["Ke-Tiras Burger Buffalo", "Burger", null, 543.52, 19, 9961.8, 38.9, null, 32.2, {"serving": "1 burger", "kcal_per_100g": 250.89}],
      ["Ke-Tiras Burger Hot Cruji", "Burger", null, 505.07, 25.3, 9925.8, 53.1, null, 32.8, {"serving": "1 burger", "kcal_per_100g": 232.4}],
      ["Ke-Tiras Burger Mango furioso", "Burger", null, 569.35, 24, 10667.6, 55.8, null, 36.2, {"serving": "1 burger", "kcal_per_100g": 233.82}],
      ["La Secreta Burger", "Burger", null, 642.23, 24.6, 21292.1, 81.8, null, 45.9, {"serving": "1 burger", "kcal_per_100g": 253.41}],
      ["Puré con Gravy mediano", "Complemento", null, 64.16, 5.5, 4995.1, 17.8, null, 2, {"serving": "mediano", "kcal_per_100g": 43.23}],
      ["Puré con Gravy grande", "Complemento", null, 137.93, 11.5, 10516.8, 38, null, 4.2, {"serving": "grande", "kcal_per_100g": 44.13}],
      ["Puré con Gravy familiar", "Complemento", null, 271.2, 24.5, 22270.6, 76.2, null, 8.6, {"serving": "familiar", "kcal_per_100g": 41.01}],
      ["Puré solo mediano", "Complemento", null, 58.31, 4, 3805.4, 15.5, null, 1.7, {"serving": "mediano", "kcal_per_100g": 51.47}],
      ["Puré solo grande", "Complemento", null, 126.98, 8.8, 8286, 33.7, null, 3.6, {"serving": "grande", "kcal_per_100g": 51.47}],
      ["Puré solo familiar", "Complemento", null, 238.16, 16.5, 15541, 63.2, null, 6.8, {"serving": "familiar", "kcal_per_100g": 51.47}],
      ["Ensalada mediana", "Complemento", null, 28.45, 5.7, 1745.7, 6.5, null, 1.2, {"serving": "mediana", "kcal_per_100g": 29.82}],
      ["Ensalada grande", "Complemento", null, 56.96, 11.4, 3495.1, 13, null, 2.4, {"serving": "grande", "kcal_per_100g": 29.82}],
      ["Ensalada familiar", "Complemento", null, 107.77, 21.6, 6613.3, 24.6, null, 4.6, {"serving": "familiar", "kcal_per_100g": 29.82}],
      ["Mac & cheese mediano", "Complemento", null, 417.72, 7.4, 4738.7, 92.2, null, 16.3, {"serving": "mediano", "kcal_per_100g": 316.84}],
      ["Mac & cheese grande", "Complemento", null, 894, 15.9, 10141.6, 197.3, null, 35, {"serving": "grande", "kcal_per_100g": 316.84}],
      ["Mac & cheese familiar", "Complemento", null, 1705.49, 30.4, 19347.2, 376.5, null, 66.7, {"serving": "familiar", "kcal_per_100g": 316.84}],
      ["Bisquet tradicional", "Complemento", null, 145.76, 2.4, 1517.7, 27.8, null, 5.9, {"serving": "1 pieza", "kcal_per_100g": 297.07}],
      ["Papas chicas", "Complemento", null, 289.96, 13.9, 523.3, 35.1, null, 7.5, {"serving": "chicas", "kcal_per_100g": 284.27}],
      ["Papas medianas", "Complemento", null, 352.49, 17, 636.2, 42.7, null, 9.1, {"serving": "medianas", "kcal_per_100g": 284.27}],
      ["Papas grandes", "Complemento", null, 619.71, 29.8, 1118.5, 75.1, null, 16, {"serving": "grandes", "kcal_per_100g": 284.27}],
      ["Papas familiares", "Complemento", null, 525.9, 25.3, 949.2, 63.7, null, 13.5, {"serving": "familiares", "kcal_per_100g": 284.27}],
      ["Popcorn medianas", "Complemento", null, 150.37, 9.5, 3216.2, 23.3, null, 18.7, {"serving": "medianas", "kcal_per_100g": 176.91}],
      ["Popcorn grandes", "Complemento", null, 297.52, 18.8, 6363.5, 46.2, null, 37, {"serving": "grandes", "kcal_per_100g": 176.91}],
      ["Pay de manzana", "Postre", null, 188.52, 3.5, 2600.2, 35.3, null, 4.3, {"serving": "1 pieza", "kcal_per_100g": 270.35}],
      ["Cono vainilla sencillo", "Postre", null, 173.58, 5.5, 277.1, 26.8, null, 4.2, {"serving": "sencillo", "kcal_per_100g": 197.25}],
      ["Cono vainilla doble", "Postre", null, 205.36, 6.9, 343.2, 30.9, null, 5.1, {"serving": "doble", "kcal_per_100g": 190.15}],
      ["Cono Hershey's sencillo", "Postre", null, 170.78, 5.3, 258.9, 26.1, null, 4.4, {"serving": "sencillo", "kcal_per_100g": 194.07}],
      ["Cono Hershey's doble", "Postre", null, 202.56, 6.6, 325, 30.2, null, 5.2, {"serving": "doble", "kcal_per_100g": 187.55}],
      ["Sundae", "Postre", null, 193.69, 8.2, 403.4, 24.9, null, 5.3, {"serving": "1 sundae", "kcal_per_100g": 158.89}],
      ["Sundae con fresa", "Postre", null, 243.79, 8.2, 424.4, 37.4, null, 5.3, {"serving": "1 sundae", "kcal_per_100g": 160.49}],
      ["Sundae con caramelo", "Postre", null, 294.84, 9.8, 444.5, 46.3, null, 5.7, {"serving": "1 sundae", "kcal_per_100g": 189.12}],
      ["Sundae con chocolate", "Postre", null, 317.67, 8.7, 421.6, 54, null, 6.1, {"serving": "1 sundae", "kcal_per_100g": 199.67}],
      ["Big Kream chico", "Postre", null, 140.94, 6, 293.5, 18.1, null, 3.9, {"serving": "chico", "kcal_per_100g": 158.89}],
      ["Big Kream mediano", "Postre", null, 473.65, 20.1, 986.4, 60.8, null, 13, {"serving": "mediano", "kcal_per_100g": 158.89}],
      ["Big Kream familiar", "Postre", null, 836.56, 35.4, 1742.1, 107.4, null, 23, {"serving": "familiar", "kcal_per_100g": 158.89}],
      ["Big Kream Oreo chico", "Postre", null, 208.41, 8.2, 379.8, 28.9, null, 5, {"serving": "chico", "kcal_per_100g": 199.81}],
      ["Big Kream Oreo mediano", "Postre", null, 608.59, 24.5, 1158.9, 82.4, null, 15.2, {"serving": "mediano", "kcal_per_100g": 184.81}],
      ["Big Kream Oreo familiar", "Postre", null, 1038.53, 42, 2000.4, 139.8, null, 26.3, {"serving": "familiar", "kcal_per_100g": 181.18}],
      ["Big Kream Canelitas 8 oz", "Postre", null, 179.39, 6.6, 343, 37.3, null, 4.8, {"serving": "8 oz", "kcal_per_100g": 154.38}],
      ["Big Kream Canelitas 16 oz", "Postre", null, 533.42, 21, 1077.8, 95.4, null, 14.9, {"serving": "16 oz", "kcal_per_100g": 153.68}],
      ["Big Kream Canelitas 34 oz", "Postre", null, 903.31, 36.5, 1870.4, 154.6, null, 25.8, {"serving": "34 oz", "kcal_per_100g": 152.46}],
      ["Big Kream Froot Loops 8 oz", "Postre", null, 185.89, 6.1, 318.9, 28.8, null, 4.1, {"serving": "8 oz", "kcal_per_100g": 171.01}],
      ["Big Kream Froot Loops 16 oz", "Postre", null, 563.55, 20.3, 1037.3, 82.2, null, 13.5, {"serving": "16 oz", "kcal_per_100g": 166.68}],
      ["Big Kream Froot Loops 34 oz", "Postre", null, 971.41, 35.9, 1818.5, 139.4, null, 23.7, {"serving": "34 oz", "kcal_per_100g": 165.63}],
      ["Refresco Fanta / Fuze Tea 473 ml", "Bebida", null, 68.42, 0, 71.4, 17.1, null, 0, {"serving": "473 ml"}],
      ["Refresco Fanta / Fuze Tea 621 ml", "Bebida", null, 117.41, 0, 122.5, 29.4, null, 0, {"serving": "621 ml"}],
      ["Refresco Fanta / Fuze Tea 887 ml", "Bebida", null, 121.55, 0, 126.9, 30.4, null, 0, {"serving": "887 ml"}],
      ["Coca-Cola regular 473 ml", "Bebida", null, 485.1, 0, 38, 28.5, null, 0, {"serving": "473 ml"}],
      ["Coca-Cola regular 621 ml", "Bebida", null, 671.96, 0, 52.7, 39.5, null, 0, {"serving": "621 ml"}],
      ["Coca-Cola regular 887 ml", "Bebida", null, 748.16, 0, 58.7, 44, null, 0, {"serving": "887 ml"}],
      ["Coca-Cola light / sin azúcar / Sidral / Sprite 473 ml", "Bebida", null, 97.35, 0, 89.4, 5.7, null, 0, {"serving": "473 ml"}],
      ["Coca-Cola light / sin azúcar / Sidral / Sprite 621 ml", "Bebida", null, 109.06, 0, 100.2, 6.4, null, 0, {"serving": "621 ml"}],
      ["Coca-Cola light / sin azúcar / Sidral / Sprite 887 ml", "Bebida", null, 119.18, 0, 109.4, 7, null, 0, {"serving": "887 ml"}],
      ["Salsa Spicy BBQ (shot 3 oz)", "Salsa", null, 166.4, 1, 2882.1, 34.6, null, 6.4, {"serving": "shot 3 oz", "kcal_per_100g": 195.3}],
      ["Salsa Jalapeño (shot 3 oz)", "Salsa", null, 64.8, 0.1, 2877.2, 5.1, null, 8.7, {"serving": "shot 3 oz", "kcal_per_100g": 76.06}],
      ["Salsa Buffalo (shot 3 oz)", "Salsa", null, 307.61, 0, 2454.9, 5, null, 0, {"serving": "shot 3 oz", "kcal_per_100g": 307.0}],
      ["Salsa Original (shot 3 oz)", "Salsa", null, 420, 34.7, 934.5, 25.2, null, 1.1, {"serving": "shot 3 oz", "kcal_per_100g": 400.0}],
      ["Salsa Mango furioso (shot 3 oz)", "Salsa", null, 188, 0, 797.9, 48.1, null, 0, {"serving": "shot 3 oz", "kcal_per_100g": 172.0}],
      ["Salsa Tamarindo bravo (shot 3 oz)", "Salsa", null, 141.24, 0, 632.4, 35.3, null, 0, {"serving": "shot 3 oz", "kcal_per_100g": 132.0}],
      ["Salsa Ranch (shot 3 oz)", "Salsa", null, 226.72, 22.9, 580.3, 4.2, null, 1, {"serving": "shot 3 oz", "kcal_per_100g": 218.0}],
      ["Catsup (sobre)", "Salsa", null, 10.08, 0, 66.7, 2.4, null, 0.1, {"serving": "1 sobre", "kcal_per_100g": 112.0}],
      ["Salsa Jalapeño (sobre)", "Salsa", null, 9.22, 0, 243.1, 0.5, null, 0, {"serving": "1 sobre", "kcal_per_100g": 102.4}],
      ["Mermelada (sobre)", "Salsa", null, 64.53, 0, 0.4, 3.8, null, 0, {"serving": "1 sobre", "kcal_per_100g": 717.0}],
    ],
  },
};

/**
 * 公式の値でも、明らかにつじつまが合わないものはそのまま使わない(公開されている表の誤記への対策)。
 * - エネルギーが、脂質・炭水化物・たんぱく質から計算した値(9・4・4 kcal/g)と ±20% 以上ずれる
 *   (小さい品目は ±25 kcal まで許す) → 品目ごと除外
 * - ナトリウムが 1品で 3,000 mg を超える、または 100 g あたり 1,500 mg(ソース類は 4,000 mg)を超える
 *   → ナトリウムだけ「不明」にして、ほかの値は使う
 * g が公開されていなくても、1品と100gあたりのエネルギーが両方あれば g を計算する(飲み物は ml 表記を使う)。
 * 返り値: { row: 使える行 | null, issues: [理由] }
 */
export function validateChainRow(row) {
  const [name, category, grams, kcal, fat, sodiumMg, carbs, fiber, protein, extra = {}] = row;
  const issues = [];
  const atwater = fat * 9 + carbs * 4 + protein * 4;
  if (Math.abs(kcal - atwater) > Math.max(25, 0.2 * Math.max(kcal, atwater))) {
    return { row: null, issues: [`kcal ${kcal} ≠ grasa/carbohidratos/proteína ${Math.round(atwater)} kcal`] };
  }
  let g = grams;
  if (!g && extra.kcal_per_100g && category !== "Bebida") g = Math.round((kcal / extra.kcal_per_100g) * 100);
  let sodium = sodiumMg;
  const limit100 = category === "Salsa" ? 4000 : 1500;
  if (sodium !== null && (sodium > 3000 || (g && (sodium / g) * 100 > limit100))) {
    issues.push(`sodio ${sodium} mg${g ? ` (${Math.round((sodium / g) * 100)} mg/100 g)` : ""} → desconocido`);
    sodium = null;
  }
  return { row: [name, category, g ?? null, kcal, fat, sodium, carbs, fiber, protein, extra], issues };
}

/** 検査で除外・修正した品目(どの値をなぜ使わなかったかの記録) */
export const CHAIN_ISSUES = [];
for (const [key, chain] of Object.entries(CHAINS)) {
  chain.items = chain.items
    .map((row) => {
      const { row: ok, issues } = validateChainRow(row);
      if (issues.length) CHAIN_ISSUES.push({ chain: key, item: row[0], excluded: !ok, issues });
      return ok;
    })
    .filter(Boolean);
}

/** チェーン店のメニュー1品の栄養素(1食分)。公式の表にない栄養素は null(不明) */
export function chainItemNutrients(row) {
  const [, , , kcal, fat, sodiumMg, carbs, fiber, protein, extra = {}] = row;
  const known = (k) => (typeof extra[k] === "number" ? extra[k] : null);
  return {
    energy_kcal: kcal,
    protein_g: protein,
    fat_g: fat,
    carbs_g: carbs,
    fiber_g: fiber,
    salt_g: sodiumMg === null ? null : Math.round(((sodiumMg * 2.54) / 1000) * 100) / 100, // ナトリウム(mg) × 2.54 ÷ 1000 = 食塩相当量(g)
    calcium_mg: known("calcium_mg"),
    iron_mg: known("iron_mg"),
    vitamin_a_ug: known("vitamin_a_ug"),
    vitamin_b1_mg: known("vitamin_b1_mg"),
    vitamin_b2_mg: known("vitamin_b2_mg"),
    vitamin_c_mg: known("vitamin_c_mg"),
    vitamin_d_ug: known("vitamin_d_ug"),
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
      if (words.every((w) => hay.includes(w))) out.push({ key: `${chainKey}:${i}`, chain: chain.name, name: row[0], grams: row[2], serving: row[9]?.serving ?? null, official: chain.official, nutrients: chainItemNutrients(row) });
    }
  }
  // 検索語に近い(名前が短い)ものを先に出す
  return out.sort((a, b) => a.name.length - b.name.length).slice(0, limit);
}

