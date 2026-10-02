import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Dashboard } from '../components/planner/dashboard';
import { Composer } from '../components/planner/composer';
import { Calendar } from '../components/planner/calendar';
import { Content, MediaLibrary } from '../components/planner/library';
import { SocialAccounts, Settings, Analytics } from '../components/planner/settings';
import { blankPost, type Post } from '../lib/planner';
import type { SocialAccountDto } from '../lib/contracts/planner';

const posts: Post[] = [{
    id: 'p1',
    text: '3 ошибки при покупке квартиры у моря',
    networks: ['telegram', 'max'],
    date: '2030-01-01',
    time: '12:00',
    status: 'scheduled',
    targets: [{ network: 'telegram', status: 'scheduled' }, { network: 'max', status: 'scheduled' }],
    mediaIds: [],
    overrides: {},
}];
const accounts = { telegram: false, max: false };
const socialAccounts: SocialAccountDto[] = [
    { id: 'tg', provider: 'telegram', providerAccountId: null, displayName: 'Telegram', enabled: false, connectionStatus: 'DISCONNECTED' },
    { id: 'max', provider: 'max', providerAccountId: null, displayName: 'MAX', enabled: false, connectionStatus: 'DISCONNECTED' },
];
const noop = () => { };
const composer = { draft: blankPost(), setDraft: noop, media: [], upload: async () => [], save: noop, publishNow: noop, accounts };
const screens = [
    ['Главная', <Dashboard key="dashboard" posts={posts} media={[]} accounts={accounts} navigate={noop} openPost={noop} composer={composer} name="Данил"/>, 'Хорошего дня, Данил!'],
    ['Редактор', <Composer key="composer" {...composer}/>, 'Предпросмотр'],
    ['Календарь', <Calendar key="calendar" posts={posts} openPost={noop} createPost={noop} reschedule={noop}/>, 'Календарь'],
    ['Контент', <Content key="content" posts={posts} media={[]} query="" setQuery={noop} openPost={noop} editPost={noop} deletePost={noop} duplicatePost={noop} create={noop}/>, '3 ошибки при покупке'],
    ['Медиа', <MediaLibrary key="media" media={[]} upload={async () => []} remove={noop} useMedia={noop}/>, 'Медиатека'],
    ['Соцсети', <SocialAccounts key="socials" accounts={socialAccounts} toggle={noop} connect={async()=>{}}/>, 'Не подключено'],
    ['Аналитика', <Analytics key="analytics" posts={posts}/>, 'Демонстрационные цифры'],
    ['Настройки', <Settings key="settings" name="Данил" saveName={noop}/>, 'Как к тебе обращаться'],
] as const;
for (const [name, screen, expected] of screens) {
    const markup = renderToStaticMarkup(screen);
    if (!markup.includes(expected)) throw new Error(`${name}: missing expected content`);
    if (markup.includes('Starter Project')) throw new Error('Starter leaked');
    console.log(`PASS ${name}: rendered ${markup.length} characters`);
}
