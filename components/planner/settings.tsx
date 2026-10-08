'use client';
import { useState } from 'react';
import { CheckCircle2, ShieldCheck, Clock, User, Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Card, SocialIcon, Action } from './common';
import { networkNames, type Network } from '@/lib/planner';
import type { SocialAccountDto } from '@/lib/contracts/planner';
import { toast } from 'sonner';
export function SocialAccounts({ accounts, toggle, connect, disconnect, embedded = false }: {
    embedded?: boolean;
    accounts: SocialAccountDto[];
    toggle: (id: string, value: boolean) => void;
    connect: (id: string, destinationId: string) => Promise<void>;
    disconnect?: (id: string) => Promise<void>;
}) {
    const [destination, setDestination] = useState<Record<string, string>>({});
    const [connecting, setConnecting] = useState<Record<string, boolean>>({});
    const connected = accounts.filter(account => account.connectionStatus === 'CONNECTED').length;
    const Heading = embedded ? 'h2' : 'h1';
    const AccountHeading = embedded ? 'h3' : 'h2';
    const run = async (id: string, operation: () => Promise<void>) => {
        setConnecting(values => ({ ...values, [id]: true }));
        try { await operation(); } finally { setConnecting(values => ({ ...values, [id]: false })); }
    };
    return <><div className="page-heading"><div><div className="eyebrow">ТВОИ ПЛОЩАДКИ</div><Heading>Социальные сети</Heading><p>Подключи Telegram, MAX или сообщество VK для публикаций.</p></div><span className="pill neutral">{connected} из {accounts.length} подключены</span></div>
        <div className="notice"><Info size={19}/><p>Для Telegram и MAX добавь бота администратором. Для VK войди через VK ID с правами администратора или редактора сообщества.</p></div>
        <div className="accounts-grid">{accounts.map(account => {
            const n = account.provider as Network;
            const isConnected = account.connectionStatus === 'CONNECTED';
            const busy = !!connecting[account.id];
            const value = destination[account.id] ?? (n === 'vk' ? account.providerAccountId?.replace(/^-/, '') ?? '' : '');
            return <Card key={account.id} className="account-card">
                <div className="row-between"><SocialIcon network={n}/><span className={`pill ${isConnected ? 'success' : 'neutral'}`}>{isConnected ? 'Подключено' : 'Не подключено'}</span></div>
                <AccountHeading>{networkNames[n]}</AccountHeading>
                <div className="account-profile"><span className="account-avatar">А</span><div><strong>{account.displayName}</strong><small>{account.providerAccountId ?? 'Аккаунт ещё не подтверждён'}</small></div></div>
                <div className="account-features"><span><CheckCircle2 size={15}/>{n === 'vk' ? 'Текст и фото' : 'Текст и медиа'}</span><span><Clock size={15}/>Планирование</span></div>
                <div><label className="field-label" htmlFor={`destination-${account.id}`}>{n === 'vk' ? 'Числовой ID сообщества VK' : `Канал или группа ${networkNames[n]}`}</label>
                    <input id={`destination-${account.id}`} className="form-input" placeholder={n === 'vk' ? 'Например, 123456' : n === 'telegram' ? '@your_chat или отрицательный ID' : 'Числовой chat_id MAX'} value={value} onChange={event => setDestination(values => ({ ...values, [account.id]: event.target.value }))} disabled={busy}/>
                    <Action secondary disabled={busy || !value.trim()} onClick={() => { void run(account.id, () => connect(account.id, value.trim())); }}>{busy ? 'Подключаем…' : n === 'vk' ? (isConnected ? 'Переподключить через VK ID' : 'Подключить через VK ID') : 'Проверить и подключить'}</Action>
                    {n === 'vk' && account.connectionStatus !== 'DISCONNECTED' && disconnect && <Action secondary disabled={busy} onClick={() => { void run(account.id, () => disconnect(account.id)); }}>Отключить VK</Action>}
                    {n === 'vk' && <p className="mini-note">Нужны разрешения на публикацию и фото. Видео VK пока не поддерживается.</p>}
                </div>
                <div className="account-switch"><label htmlFor={`account-${account.id}`}>Использовать для публикаций</label><Switch id={`account-${account.id}`} checked={account.enabled} disabled={!isConnected || busy} onCheckedChange={value => toggle(account.id, value)}/></div>
            </Card>;
        })}</div>
        <Card title={<><ShieldCheck size={19}/> Безопасное подключение</>} className="connection-info"><p>Planly не запрашивает пароль VK. Разрешения подтверждаются на странице VK ID. Отключение VK удаляет его подключение из Planly.</p></Card></>;
}
export function Settings({ name, saveName, accounts, toggle, connect, disconnect }: {
    name: string;
    saveName: (name: string) => void;
    accounts: SocialAccountDto[];
    toggle: (id: string, value: boolean) => void;
    connect: (id: string, destinationId: string) => Promise<void>;
    disconnect?: (id: string) => Promise<void>;
}) { const [value, setValue] = useState(name); return <><div className="page-heading"><div><div className="eyebrow">ПОД ТВОЙ РИТМ</div><h1>Настройки</h1><p>Только самое необходимое.</p></div></div><div className="settings-layout"><Card title={<><User size={18}/> Личный профиль</>}><label className="field-label" htmlFor="profile-name">Как к тебе обращаться</label><input className="form-input" id="profile-name" value={value} onChange={e => setValue(e.target.value)} maxLength={40} placeholder="Твоё имя"/><p className="mini-note">Это имя хранится в PostgreSQL и отображается на главной странице.</p><Action onClick={() => { if (!value.trim()) {
    toast.error('Укажи имя.');
    return;
} saveName(value.trim()); }}>Сохранить</Action></Card><Card title={<><Clock size={18}/> Публикации</>}><div className="setting-row"><span>Часовой пояс</span><b>Москва · UTC+3</b></div><div className="setting-row"><span>Язык интерфейса</span><b>Русский</b></div><div className="setting-row"><span>Формат времени</span><b>24 часа</b></div></Card><Card title={<><Info size={18}/> О Planly</>} className="settings-about"><p>Personal SMM Planner · Content Core</p><p>Посты, расписание, профиль, медиа и публикации в Telegram, MAX и VK работают через серверную очередь.</p><div className="roadmap-inline"><span>01 · Интерфейс</span><span>02 · Контент</span><span>03 · Планировщик</span><span className="current">04 · Telegram и MAX</span></div></Card></div><section className="settings-socials" aria-label="Социальные сети"><SocialAccounts embedded accounts={accounts} toggle={toggle} connect={connect} disconnect={disconnect}/></section></>; }
