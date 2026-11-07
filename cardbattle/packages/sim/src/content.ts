import cardsJson from '../data/cards.json';
import rulesJson from '../data/rules.json';
import botsJson from '../data/bots.json';
import {
  CardRegistry,
  compileBot,
  compileCard,
  compileRules,
  type BotProfile,
  type BotProfileData,
  type CardData,
  type Rules,
  type RulesData,
} from './data';

/** data/*.json を読み込んで整数化したもの。数値はすべて JSON 側にあり、コードには書かない。 */
export interface GameContent {
  rules: Rules;
  cards: CardRegistry;
  starterDeck: string[];
  bots: BotProfile[];
  botNames: string[];
}

export function loadContent(): GameContent {
  const cards = new CardRegistry((cardsJson.cards as CardData[]).map(compileCard));
  return {
    rules: compileRules(rulesJson as RulesData),
    cards,
    starterDeck: cardsJson.starterDeck,
    bots: (botsJson.bots as BotProfileData[]).map(compileBot),
    botNames: botsJson.names,
  };
}
