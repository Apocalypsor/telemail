import { InlineKeyboard } from 'grammy';

/** 星标 inline keyboard */
export const STAR_KEYBOARD = new InlineKeyboard().text('⭐ 星标', 'star');
export const STARRED_KEYBOARD = new InlineKeyboard().text('✅ 已星标', 'unstar');
