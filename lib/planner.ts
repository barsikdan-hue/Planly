export type Network = 'telegram' | 'vk' | 'instagram';
export type Status = 'draft' | 'scheduled' | 'published' | 'failed';
export type Media = {
    id: string;
    name: string;
    url: string;
    type: string;
    size: number;
};
export type Post = {
    id: string;
    text: string;
    networks: Network[];
    date: string;
    time: string;
    status: Status;
    targets: {
        network: Network;
        status: Status;
    }[];
    mediaIds: string[];
    overrides: Partial<Record<Network, string>>;
    theme?: number;
};
export const networkNames: Record<Network, string> = { telegram: 'Telegram', vk: 'VK', instagram: 'Instagram' };
export const statusNames: Record<Status, string> = { draft: 'Черновик', scheduled: 'Запланировано', published: 'Опубликовано', failed: 'Ошибка' };
export function moscowDate(date: string, time: string) { return new Date(`${date}T${time}:00+03:00`); }
export function validatePost(p: {
    text: string;
    networks: unknown[];
    date: string;
    time: string;
}, status: string, now = Date.now()): string | null {
    if (!p.text.trim())
        return 'Добавь текст публикации.';
    if (status === 'draft')
        return null;
    if (!p.networks.length)
        return 'Выбери хотя бы одну соцсеть.';
    if (status === 'scheduled') {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(p.date) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(p.time))
            return 'Укажи корректные дату и время.';
        const d = moscowDate(p.date, p.time);
        if (!Number.isFinite(d.getTime()) || d.getTime() <= now)
            return 'Выбери время в будущем (МСК).';
        if (d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }) !== p.date)
            return 'Укажи существующую дату.';
    }
    return null;
}
export function movePost<T extends {
    date: string;
    time: string;
}>(post: T, date: string, time: string): T { return { ...post, date, time }; }
export function day(offset = 0) { const d = new Date(); d.setDate(d.getDate() + offset); return d.toLocaleDateString('sv-SE', { timeZone: 'Europe/Moscow' }); }
export function addDays(date: string, offset: number) { const d = new Date(`${date}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + offset); return d.toISOString().slice(0, 10); }
export function blankPost(): Post { return { id: '', text: '', networks: ['telegram'], date: day(1), time: '10:00', status: 'draft', targets: [], mediaIds: [], overrides: {} }; }
export function seedPosts(): Post[] {
    return [
        { text: '3 ошибки при покупке квартиры у моря\n\nКрасивый вид — ещё не всё. Проверь документы, инфраструктуру и реальные расходы на содержание. Сохрани этот чек-лист перед просмотром.', networks: ['telegram', 'vk'], date: day(), time: '18:30', status: 'scheduled', theme: 0 },
        { text: 'Сочи без фильтров\n\nПоказываю, как выглядит обычный день в городе: утренний кофе, прогулка у моря и любимые места. А что для тебя делает город своим?', networks: ['instagram'], date: day(1), time: '12:00', status: 'scheduled', theme: 1 },
        { text: 'Квартира для жизни или инвестиция?\n\nНачни с цели. Когда понимаешь, зачем покупаешь, выбирать становится проще. Расскажи, какой вариант сейчас рассматриваешь?', networks: ['vk', 'telegram'], date: day(2), time: '10:00', status: 'scheduled', theme: 2 },
        { text: 'Утро начинается с моря\n\nПять минут тишины, свежий воздух и никаких уведомлений. Иногда лучший план — немного замедлиться.', networks: ['instagram', 'telegram'], date: day(), time: '09:00', status: 'published', theme: 3 },
        { text: 'Что спросить у застройщика\n\nСобираю вопросы, которые помогут принять взвешенное решение при покупке квартиры.', networks: ['telegram'], date: day(3), time: '15:00', status: 'draft', theme: 2 },
        { text: 'Новый обзор района\n\nМоре, инфраструктура и цены — всё, что нужно знать перед переездом.', networks: ['instagram', 'vk'], date: day(-1), time: '14:00', status: 'failed', theme: 1 },
    ].map((p, i) => ({ ...p, id: `demo-${i}`, networks: p.networks as Network[], status: p.status as Status, targets: p.networks.map(n => ({ network: n as Network, status: (i === 5 && n === 'vk' ? 'published' : p.status) as Status })), mediaIds: [], overrides: {} }));
}
