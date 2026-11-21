export const accessories = [
  { id: 'star-pin', name: '작은 별핀', price: 50 },
  { id: 'moon-hat', name: '초승달 모자', price: 100 },
  { id: 'star-crown', name: '별빛 왕관', price: 200 },
] as const;
export type AccessoryId = typeof accessories[number]['id'];
export type ShopState = { balance: number; owned: AccessoryId[]; equipped: AccessoryId | null };
export const accessoryById = (id: unknown) => accessories.find(item => item.id === id);
export type ShopAction = 'buy' | 'equip' | 'remove';
