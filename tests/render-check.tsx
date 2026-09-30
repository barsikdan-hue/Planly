import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { Dashboard } from '../components/planner/dashboard';
import { Composer } from '../components/planner/composer';
import { Calendar } from '../components/planner/calendar';
import { Content, MediaLibrary } from '../components/planner/library';
import { SocialAccounts, Settings, Analytics } from '../components/planner/settings';
import { seedPosts, blankPost } from '../lib/planner';
const posts = seedPosts();
const accounts = { telegram: true, vk: true, instagram: true };
const noop = () => { };
const composer = { draft: blankPost(), setDraft: noop, media: [], upload: async () => [], save: noop, accounts };
const screens = [
    ['Главная', <Dashboard posts={posts} media={[]} accounts={accounts} navigate={noop} openPost={noop} composer={composer} name="Данил"/>, 'Хорошего дня, Данил!'],
    ['Редактор', <Composer {...composer}/>, 'Предпросмотр'],
    ['Календарь', <Calendar posts={posts} openPost={noop} createPost={noop} reschedule={noop}/>, 'Календарь'],
    ['Контент', <Content posts={posts} media={[]} query="" setQuery={noop} openPost={noop} editPost={noop} deletePost={noop} duplicatePost={noop} create={noop}/>, '3 ошибки при покупке'],
    ['Медиа', <MediaLibrary media={[]} upload={async () => []} remove={noop} useMedia={noop}/>, 'Медиатека'],
    ['Соцсети', <SocialAccounts accounts={accounts} toggle={noop}/>, 'Сейчас это демоаккаунты'],
    ['Аналитика', <Analytics posts={posts}/>, 'Демонстрационные цифры'],
    ['Настройки', <Settings name="Данил" saveName={noop}/>, 'Как к тебе обращаться'],
] as const;
for (const [name, screen, expected] of screens) {
    const markup = renderToStaticMarkup(screen);
    if (!markup.includes(expected))
        throw new Error(`${name}: missing expected content`);
    if (markup.includes('Starter Project'))
        throw new Error('Starter leaked');
    console.log(`PASS ${name}: rendered ${markup.length} characters`);
}
