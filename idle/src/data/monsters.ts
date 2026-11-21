// Monster roster. `sprite` is the file stem inside
// "Aekashics Librarium Static Battlers/Sideview Batch Battlers" (renamed in-game, which the license allows).
// Allies (gacha characters + guardian spirits) and enemies never share a sprite.

export type Element = 'fire' | 'water' | 'wind' | 'earth' | 'light' | 'dark';
export type Role = 'blade' | 'archer' | 'mage' | 'guard';
export type Rarity = 1 | 2 | 3 | 4 | 5;

export interface AllyDef {
  id: string;
  sprite: string;
  name: string;
  title: string;
  el: Element;
  role: Role;
  rarity: Rarity;
}

export interface EnemyDef {
  sprite: string;
  name: string;
  el: Element;
}

export interface AreaDef {
  name: string;
  sub: string;
  mobs: EnemyDef[];
  elites: EnemyDef[];
  boss: EnemyDef;
}

const a = (
  sprite: string,
  name: string,
  title: string,
  el: Element,
  role: Role,
  rarity: Rarity,
): AllyDef => ({ id: slug(sprite), sprite, name, title, el, role, rarity });

export function slug(stem: string): string {
  return stem
    .toLowerCase()
    .replace(/'/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

export const ALLIES: AllyDef[] = [
  // ★5
  a('Boss Goddess Innova', 'イノーヴァ', '星詠みの女神', 'light', 'mage', 5),
  a('Boss Sun Goddess', 'ソルナ', '陽炎の剣姫', 'fire', 'blade', 5),
  a('Summon Shiva', 'セツナ', '氷華の姫神', 'water', 'mage', 5),
  a('Titan Wind Ventoss', 'ヴェントス', '翠嵐の巨神', 'wind', 'archer', 5),
  a('Titan Earth Terran', 'テラン', '大地の巨神', 'earth', 'guard', 5),
  a('Summon Odin', 'ヴァルムント', '黒騎神', 'dark', 'blade', 5),
  a('Boss Feral Kitsune', 'クズノハ', '白焔の九尾', 'fire', 'mage', 5),
  a('Summon Alicorn', 'セレスティア', '天翔ける聖馬', 'light', 'archer', 5),
  // ★4
  a('Summon Ifrit', 'イグニード', '炎魔', 'fire', 'guard', 4),
  a('Celestial Beatrix', 'ベアトリクス', '天空騎士', 'light', 'blade', 4),
  a('Halloween Witch', 'リリス', '宵闇の魔女', 'dark', 'mage', 4),
  a('Sea Mermaid Warrior Arliette', 'アルエット', '潮騒の槍姫', 'water', 'blade', 4),
  a('Sea Mermaid', 'ミルル', '人魚の歌姫', 'water', 'mage', 4),
  a('Legendary Knights Nobleman Ansellus', 'アンセル', '焔の貴公子', 'fire', 'blade', 4),
  a('Legendary Knights Scholar Jeanne', 'ジャンヌ', '聖典の賢者', 'light', 'mage', 4),
  a('Elves Nature Linker', 'リンカ', '森の巫女', 'wind', 'mage', 4),
  a('Megapack II Forest Six-Wing Fairy', 'フェリシア', '六翼の妖精', 'wind', 'archer', 4),
  a('Titan Aquos', 'アクオス', '水の巨神', 'water', 'guard', 4),
  a('Witch Hunters Leader', 'グレイ', '狩人の長', 'earth', 'guard', 4),
  a('Elemental Goddess Wind Airi', 'エアリ', 'そよ風の女神', 'wind', 'mage', 4),
  a('Elemental Goddess Forest Flora', 'フローラ', '花園の女神', 'earth', 'mage', 4),
  a('Elemental Spirit Fire Blazia', 'ブレイザ', '火の精霊', 'fire', 'archer', 4),
  a('Pre-Legendary Knights Onna-bugeisha Croix', 'クロワ', '紅の女武者', 'dark', 'blade', 4),
  a('Witch Hunters Healer', 'セシル', '祈りの癒し手', 'light', 'guard', 4),
  // ★3
  a('Elf_Archer', 'ルゥ', 'エルフの弓手', 'wind', 'archer', 3),
  a('Elf_Assasin', 'シオン', '影の刃', 'dark', 'blade', 3),
  a('Elf_Knight_Mage', 'エリオ', 'エルフ魔導騎士', 'light', 'mage', 3),
  a('Elf_Knight_Sword', 'ガラン', 'エルフ剣騎士', 'light', 'blade', 3),
  a('Elf_Knight_Crossbow', 'ドラン', 'エルフ弩騎士', 'earth', 'archer', 3),
  a('Mage Garrintan', 'ガリンタン', '放浪の魔導士', 'dark', 'mage', 3),
  a('Egypt Mage', 'ネフェル', '砂の巫女', 'earth', 'mage', 3),
  a('Egypt Archer', 'アメン', '砂漠の射手', 'earth', 'archer', 3),
  a('Egypt Knight', 'ラムス', '王宮の衛士', 'earth', 'guard', 3),
  a('Tribal Elves Dagger', 'ティカ', '森の双刃', 'wind', 'blade', 3),
  a('Tribal Elves Rapier', 'ミナ', '森の細剣士', 'wind', 'blade', 3),
  a('Gunblin Gibson', 'ギブソン', '凄腕の銃士', 'water', 'archer', 3),
  a('Dwarf Axe Warrior', 'ボルグ', '斧のドワーフ', 'earth', 'guard', 3),
  a('Dwarf Dragon Slayer', 'ガンツ', '竜殺し', 'fire', 'blade', 3),
  a('Knight Sword Elite', 'レオン', '白銀の剣士', 'light', 'blade', 3),
  a('Forest Fairy Filia', 'フィリア', '花の妖精', 'wind', 'mage', 3),
  a('Light Scholar Angel', 'ピピ', '見習い天使', 'light', 'mage', 3),
  a('Witch Hunters Noble', 'ノーブル', '魔女狩りの紳士', 'dark', 'archer', 3),
  a('Elves Rogue Elf', 'キリエ', '盗賊エルフ', 'dark', 'blade', 3),
  a('Slime RPG King', 'プルキング', 'スライムの王様', 'water', 'guard', 3),
  // ★2
  a('Forest Kawabun', 'カワブン', 'もふもふ', 'water', 'guard', 2),
  a('Forest Mobun', 'モブン', 'ひよこ玉', 'light', 'mage', 2),
  a('Forest Noxluff', 'ノクルフ', '草だま', 'wind', 'archer', 2),
  a('Forest Darkluff', 'ダクルフ', '闇だま', 'dark', 'mage', 2),
  a('Mountain Bunny', 'ピョン', '山うさぎ', 'wind', 'blade', 2),
  a('Rabbit Warriors Knight', 'ラビット卿', 'うさぎ騎士', 'earth', 'guard', 2),
  a('Rabbit Warriors Archer', 'ミミ', 'うさぎ弓兵', 'wind', 'archer', 2),
  a('Light Wolf', 'ルクス', '光の狼', 'light', 'blade', 2),
  a('Xmas Penguin', 'ペンタ', 'マフラーペンギン', 'water', 'archer', 2),
  a('Xmas Bear', 'ユキミ', '雪見グマ', 'water', 'guard', 2),
  a('Forest Panda', 'パン太', '剣豪パンダ', 'earth', 'blade', 2),
  a('Summon Carbuncle', 'ルビィ', '宝石獣', 'light', 'mage', 2),
  a('Wind Bunny', 'フワリ', '風うさぎ', 'wind', 'blade', 2),
  // ★1
  a('Slime RPG Basic', 'プルン', 'ぷるスライム', 'water', 'blade', 1),
  a('Slime RPG Attacker', 'ケンプル', '剣スライム', 'fire', 'blade', 1),
  a('Slime RPG Buffer', 'エルプル', '応援スライム', 'light', 'mage', 1),
  a('Slime RPG Caster', 'マジプル', '術スライム', 'fire', 'mage', 1),
  a('Slime RPG Debuffer', 'ノロプル', '呪いスライム', 'dark', 'mage', 1),
  a('Slime RPG Defender', 'タテプル', '盾スライム', 'earth', 'guard', 1),
  a('Slime RPG Healer', 'イヤプル', '癒しスライム', 'wind', 'mage', 1),
  a('Ice Snowball', 'ユキダマ', 'ころころ雪玉', 'water', 'archer', 1),
  a('Xmas Cookie', 'クッキー', 'クッキー兵', 'fire', 'blade', 1),
  a('Light Slime', 'エンジェプル', '天使スライム', 'light', 'archer', 1),
];

export const ALLY_BY_ID: Record<string, AllyDef> = Object.fromEntries(ALLIES.map((x) => [x.id, x]));
export const STARTER_ID = slug('Slime RPG Attacker');

const e = (sprite: string, name: string, el: Element): EnemyDef => ({ sprite, name, el });

export const AREAS: AreaDef[] = [
  {
    name: '若葉の森',
    sub: 'Verdant Woods',
    mobs: [
      e('Forest Blue Flower', 'あおはな', 'water'),
      e('Forest Pink Flower', 'ももはな', 'light'),
      e('Forest Red Flower', 'あかはな', 'fire'),
      e('Forest White Flower', 'しろはな', 'light'),
      e('Forest Shroom', 'キノコロ', 'earth'),
      e('Forest Shroomy', 'ベニタケ', 'earth'),
      e('Forest Sprout', 'めぶき', 'earth'),
      e('Forest Grasshopper', 'バッタ兵', 'wind'),
      e('Forest Catermoth', 'イモガ', 'wind'),
      e('Forest Spora', 'ホウシ', 'dark'),
    ],
    elites: [e('Forest Tree', '古木の精', 'earth'), e('Forest Ogre Orkgre', 'オルグレ', 'earth'), e('Forest Golem', '苔むすゴーレム', 'earth')],
    boss: e('Boss Jubokko', '血吸いの大樹', 'dark'),
  },
  {
    name: '獣の山道',
    sub: 'Beast Trail',
    mobs: [
      e('Mountain Bat', 'ヤマコウモリ', 'dark'),
      e('Mountain Black Wolf', 'くろおおかみ', 'dark'),
      e('Mountain Dodo', 'ドードー', 'earth'),
      e('Mountain Goat', 'ヤマヤギ', 'earth'),
      e('Mountain Owl', 'ミミズク', 'wind'),
      e('Mountain Snail', 'でんでん', 'water'),
      e('Mountain Warthog', 'イノシシ', 'earth'),
      e('Mountain Wolf', 'はいおおかみ', 'wind'),
      e('Mountain Nanjo', 'ニンジン小僧', 'earth'),
      e('Mountain Rock Mimic', 'イワミミック', 'earth'),
    ],
    elites: [e('MountainScarbear', '傷だらけの熊', 'earth'), e('Mountain Werebear Martz', '熊人マーツ', 'fire'), e('Mountain Greathorn Goat', '大角ヤギ', 'wind')],
    boss: e('Moutain Behemoth', '山の主ベヒモス', 'earth'),
  },
  {
    name: '清流の渓谷',
    sub: 'Clearwater Gorge',
    mobs: [
      e('Sea Crab', 'こガニ', 'water'),
      e('Sea Fish A', 'ハネウオ', 'water'),
      e('Sea Fish B', 'トゲウオ', 'water'),
      e('Sea Fish C', 'オニウオ', 'water'),
      e('Sea Horse', 'タツノコ', 'water'),
      e('Sea Jellyfish', 'ユラクラゲ', 'water'),
      e('Sea Octi', 'タコリン', 'water'),
      e('Sea Beach Urchin', 'ウニボウ', 'dark'),
      e('Sea Beach Stars', 'ヒトデ三兄弟', 'light'),
      e('Sea Beach Hermit Crab', 'ヤドカリ', 'earth'),
      e('Sea Beach Seagull', 'カモメ', 'wind'),
      e('Sea Lickitoad', 'ベロガエル', 'water'),
    ],
    elites: [e('Sea Shark', '大ザメ', 'water'), e('Sea Beach War Lobster A', '戦エビ', 'fire'), e('Sea Octopus', '大ダコ', 'water')],
    boss: e('Boss Crab King Karkinos', '蟹王カルキノス', 'water'),
  },
  {
    name: '焦土の荒野',
    sub: 'Scorched Waste',
    mobs: [
      e('FIre Toad', 'ヒキガエン', 'fire'),
      e('Fire Pumice Rock', 'カルイシ', 'fire'),
      e('Fire Pumice Sheep', 'ヨウガンヒツジ', 'fire'),
      e('Fire Minivolcano', 'ミニ火山', 'fire'),
      e('Fire Salamander', 'サラマンダー', 'fire'),
      e('Fire Snake', 'ひへび', 'fire'),
      e('Fire Turtle', 'ほのおガメ', 'earth'),
      e('Fire Vulture', 'ヒクイドリ', 'wind'),
      e('Fire Wisp', 'おにび', 'fire'),
      e('Slime Firei', 'ほむらスライム', 'fire'),
      e('Fire Lion', 'ほのおじし', 'fire'),
    ],
    elites: [e('Fire Volcanic Golem', '溶岩ゴーレム', 'earth'), e('Fire Sabretooth', '炎牙の虎', 'fire'), e('Fire Ogre', '炎鬼', 'fire')],
    boss: e('Boss Darkness Titan Ilnoct', '焦熱の魔神イルノクト', 'fire'),
  },
  {
    name: '古の回廊',
    sub: 'Ancient Colonnade',
    mobs: [
      e('Desert Cactus Triple', 'サボテン三兄弟', 'earth'),
      e('Desert Feral Cactus', 'あらぶるサボテン', 'earth'),
      e('Desert Parasand', 'スナガサ', 'earth'),
      e('Desert Rock Bunny', 'いわうさぎ', 'earth'),
      e('Desert Rock Lizard', 'いわトカゲ', 'earth'),
      e('Desert Sand Snake', 'すなへび', 'earth'),
      e('Desert Sand Tentacle', 'すなのて', 'dark'),
      e('Egypt Cobra', 'おうじゃ', 'dark'),
      e('Egypt Mummy A', 'ミイラ', 'dark'),
      e('Egypt Mummy B', 'あおミイラ', 'water'),
      e('Egypt Mummy C', 'あかミイラ', 'fire'),
    ],
    elites: [e('Egypt Sphinx Big', '大スフィンクス', 'light'), e('Egypt Crocodile', 'ワニの番兵', 'water'), e('Egypt Hieracosphinx', 'ハヤブサの獣', 'wind')],
    boss: e('Boss Ancient Priestess', '古代の巫女王', 'light'),
  },
  {
    name: '凍える森',
    sub: 'Frozen Wood',
    mobs: [
      e('Ice Avian', 'こおりどり', 'water'),
      e('Ice Cave Bat', 'つららコウモリ', 'water'),
      e('Ice Snake', 'ゆきへび', 'water'),
      e('Ice Snobros', 'ゆきんこ兄弟', 'water'),
      e('Ice Snowman', 'ゆきだるま', 'water'),
      e('Ice Spike', 'ひょうちゅう', 'water'),
      e('Ice Turtle', 'こおりガメ', 'earth'),
      e('Ice Whisp', 'ひょうれい', 'wind'),
      e('Ice Yeti Whisp', 'ゆきれい', 'wind'),
      e('Ice Yeti', 'イエティ', 'water'),
      e('Slime Icei', 'こおりスライム', 'water'),
      e('Ice Bull', 'ひょうぎゅう', 'earth'),
    ],
    elites: [e('Ice Golem', '氷塊ゴーレム', 'water'), e('Ice Lion', '氷のたてがみ', 'water'), e('Ice Ogre', '氷鬼', 'water')],
    boss: e('Boss Ice Titan Demeres', '永久凍土の巨神', 'water'),
  },
  {
    name: '蟲の深森',
    sub: 'Hive Thicket',
    mobs: [
      e('Insects Bee', 'ハチ兵', 'wind'),
      e('Insects Caterpillar A', 'イモムシ', 'earth'),
      e('Insects Caterpillar B', 'アオムシ', 'earth'),
      e('Insects Dragonfly', 'トンボ', 'wind'),
      e('Insects Fire Ant', 'ヒアリ', 'fire'),
      e('Insects Roach', 'ツヤムシ', 'dark'),
      e('Insects Scarab', 'スカラベ', 'earth'),
      e('Insects Tick', 'ダニボール', 'dark'),
      e('Insects Waterstrider', 'アメンボ', 'water'),
      e('Insects Black Ant Archer', 'クロアリ弓兵', 'dark'),
      e('Insects Black Ant Berserker', 'クロアリ狂戦士', 'dark'),
      e('Insects Lunar Butterfly', 'つきあかり蝶', 'light'),
    ],
    elites: [e('Insects Hell Mantis', '地獄カマキリ', 'fire'), e('Insects Giant Bug Hercules', '大角カブト', 'earth'), e('Insects Giant Bug Death Worm A', 'デスワーム', 'earth')],
    boss: e('Boss Insect Queen', '蟲の女王', 'dark'),
  },
  {
    name: '天空の遺構',
    sub: 'Sky Ruins',
    mobs: [
      e('Clockwork Mini A', 'ハグルマA', 'light'),
      e('Clockwork Mini B', 'ハグルマB', 'light'),
      e('Clockwork Mini C', 'ハグルマC', 'light'),
      e('Clockwork Slime', 'ぜんまいスライム', 'earth'),
      e('Clockwork Spider Mini', 'からくり小グモ', 'dark'),
      e('Clockwork Aerial', 'からくり鳥', 'wind'),
      e('Clockwork Knight B', 'からくり騎士', 'light'),
      e('Clockwork Knight C', 'からくり槍兵', 'light'),
      e('Clockwork Knight D', 'からくり隊長', 'light'),
      e('Clockwork Skull', 'からくり髑髏', 'dark'),
      e('Clockwork Iron Maiden', 'てつのおとめ', 'dark'),
    ],
    elites: [e('Clockwork Juggernaut', 'からくり巨兵', 'earth'), e('Clockwork Gigas', 'ギガス', 'light'), e('Clockwork Dragon', 'からくり竜', 'fire')],
    boss: e('Boss Khronos', '時の機神クロノス', 'light'),
  },
  {
    name: '瘴気の墓所',
    sub: 'Miasma Graves',
    mobs: [
      e('Toxic Cactus A', 'どくサボテン', 'earth'),
      e('Toxic Cactus B', 'どくトゲ', 'earth'),
      e('Toxic Carnivorous Plant A', 'しょくちゅう花', 'dark'),
      e('Toxic Carnivorous Plant B', 'ふたごの花', 'dark'),
      e('Toxic Frog A', 'どくガエル', 'water'),
      e('Toxic Frog B', 'しろガエル', 'light'),
      e('Toxic Frog C', 'みどりガエル', 'wind'),
      e('Toxic Maneater Plan A', 'ひとくい草', 'dark'),
      e('Toxic Maneater Plant B', 'ひとくい蕾', 'dark'),
      e('Toxic Shroom A', 'どくキノコ', 'dark'),
      e('Toxic Shroom B', 'トゲキノコ', 'dark'),
      e('Toxic Root A', 'どくの根', 'earth'),
    ],
    elites: [e('Toxic Root B', '大毒根', 'dark'), e('Toxic Carnivorous Plant C', 'しょくちゅう花群', 'dark'), e('Toxic Shroom C', 'おおどくキノコ', 'dark')],
    boss: e('Boss Eldritch Slime Overmind', '瘴気の母体', 'dark'),
  },
  {
    name: '竜の城門',
    sub: 'Dragon Gate',
    mobs: [
      e('Dragon Egg A', 'りゅうのたまご', 'earth'),
      e('Dragon Egg C', 'くろいたまご', 'dark'),
      e('Dragon Egg E', 'あかいたまご', 'fire'),
      e('Dragon Red', 'こりゅう', 'fire'),
      e('Dragon Green', 'みどりりゅう', 'wind'),
      e('Dragon Wyvern Blue', 'あおワイバーン', 'water'),
      e('Dragon Wyvern Brown', 'つちワイバーン', 'earth'),
      e('Dragon Wyvern Green', 'かぜワイバーン', 'wind'),
      e('Dragon Wyvern Red', 'ひワイバーン', 'fire'),
      e('Dragon Wyrm', 'ワーム', 'fire'),
    ],
    elites: [e('Dragon King Blue', '蒼竜王', 'water'), e('Dragon King Red', '紅竜王', 'fire'), e('Dragons Hydra', 'ヒュドラ', 'wind')],
    boss: e('Boss Dragon Emperor', '竜帝', 'light'),
  },
  {
    name: '宵闇の回廊',
    sub: 'Dusk Terrace',
    mobs: [
      e('Halloween Bat', 'かぼちゃコウモリ', 'dark'),
      e('Halloween Black Cat', 'くろねこ', 'dark'),
      e('Darkness Devilimp', 'デビリンプ', 'dark'),
      e('Darkness Imp', 'インプ', 'dark'),
      e('Darkness Slime', 'やみスライム', 'dark'),
      e('Darkness Wisp', 'やみのともしび', 'dark'),
      e('Darkness Banshee', 'バンシー', 'dark'),
      e('Skeleton Archer', 'がいこつ弓兵', 'dark'),
      e('Skeleton Mage', 'がいこつ術師', 'dark'),
      e('Halloween Skeleton', 'がいこつ', 'dark'),
      e('Halloween Pumpkin', 'おばけかぼちゃ', 'fire'),
      e('Ghost Ghostus', 'ゴースト', 'dark'),
    ],
    elites: [e('Darkness Dullahan', 'デュラハン', 'dark'), e('Darkness Ogre', '闇オーガ', 'dark'), e('Halloween Vampire', '吸血鬼', 'dark')],
    boss: e('Boss Hades', '冥王ハデス', 'dark'),
  },
  {
    name: '深淵の玉座',
    sub: 'Abyssal Throne',
    mobs: [
      e('Eldritch Slime A', 'しんえんスライム', 'dark'),
      e('Eldritch Slime B', 'めだまスライム', 'dark'),
      e('Eldritch Slime Spawn A', 'おとしごA', 'dark'),
      e('Eldritch Slime Spawn B', 'おとしごB', 'dark'),
      e('Eldritch Slime Spawn C', 'おとしごC', 'fire'),
      e('Eldritch Slime Spawn D', 'おとしごD', 'water'),
      e('Eldritch Fire Slimei', 'ほむらのおとしご', 'fire'),
      e('Eldritch Ice Slimei', 'こおりのおとしご', 'water'),
      e('Eldritch Abominations Scout', '深淵の斥候', 'dark'),
      e('Eldritch Abomination Hound', '深淵の猟犬', 'dark'),
      e('Eldritch Abomination Gazer', '深淵の凝視者', 'dark'),
    ],
    elites: [e('Eldritch Abomination Tyrant', '深淵の暴君', 'dark'), e('Eldritch Gazer Merem', 'メレム', 'light'), e('Eldritch Gazer Velz', 'ヴェルズ', 'fire')],
    boss: e('Boss Eldritch God Shaccad\'Yoggoth', '深淵の神', 'dark'),
  },
];

export const ELEMENT_INFO: Record<Element, { name: string; color: string; icon: string }> = {
  fire: { name: '火', color: '#f0643c', icon: 'fire' },
  water: { name: '水', color: '#3d9be0', icon: 'water' },
  wind: { name: '風', color: '#4dbb73', icon: 'wind' },
  earth: { name: '土', color: '#b98a45', icon: 'earth' },
  light: { name: '光', color: '#f2c23b', icon: 'light' },
  dark: { name: '闇', color: '#8b5cc7', icon: 'dark' },
};

export const ROLE_INFO: Record<Role, { name: string; desc: string }> = {
  blade: { name: '剣士', desc: '接近して斬る。周囲の敵にも余波。' },
  archer: { name: '射手', desc: '距離を取って素早く射る。' },
  mage: { name: '術師', desc: '遅いが強力な範囲魔法。' },
  guard: { name: '守護', desc: '体力が高く、自己回復と吹き飛ばし。' },
};

// fire > wind > earth > water > fire ; light <-> dark
export function elementFactor(att: Element, def: Element): number {
  const beats: Partial<Record<Element, Element>> = { fire: 'wind', wind: 'earth', earth: 'water', water: 'fire' };
  if (beats[att] === def) return 1.5;
  if (beats[def] === att) return 0.75;
  if ((att === 'light' && def === 'dark') || (att === 'dark' && def === 'light')) return 1.5;
  return 1;
}

export function allSpriteStems(): string[] {
  const s = new Set<string>();
  for (const x of ALLIES) s.add(x.sprite);
  for (const ar of AREAS) {
    for (const m of [...ar.mobs, ...ar.elites, ar.boss]) s.add(m.sprite);
  }
  return [...s];
}
