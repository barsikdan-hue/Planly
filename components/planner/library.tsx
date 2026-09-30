'use client';
import { useState, useRef } from 'react';
import { Plus, Search, SlidersHorizontal, ImageIcon, Video, Trash2, Upload, MoreHorizontal, Pencil, Copy } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { Card, Poster, Socials, StatusBadge, Empty, dateLabel } from './common';
import { networkNames, type Post, type Media, type Network } from '@/lib/planner';
export function Content({ posts, media, query, setQuery, openPost, editPost, deletePost, duplicatePost, create }: {
    posts: Post[];
    media: Media[];
    query: string;
    setQuery: (q: string) => void;
    openPost: (p: Post) => void;
    editPost: (p: Post) => void;
    deletePost: (p: Post) => void;
    duplicatePost: (p: Post) => void;
    create: () => void;
}) {
    const [status, setStatus] = useState('all');
    const [network, setNetwork] = useState('all');
    const filtered = posts.filter(p => (status === 'all' || p.status === status) && (network === 'all' || p.networks.includes(network as Network)) && [p.text, ...Object.values(p.overrides), ...p.networks.map(n => networkNames[n]), ...media.filter(m => p.mediaIds.includes(m.id)).map(m => m.name)].join(' ').toLowerCase().includes(query.toLowerCase()));
    return <><div className="page-heading"><div><div className="eyebrow">ВСЁ НА СВОИХ МЕСТАХ</div><h1>Контент</h1><p>От первой идеи до опубликованного поста.</p></div><Button className="action" onClick={create}><Plus size={17}/>Новый пост</Button></div><div className="content-toolbar"><Tabs value={status} onValueChange={setStatus}><TabsList className="filter-tabs">{[['all', 'Все'], ['draft', 'Черновики'], ['scheduled', 'В планах'], ['published', 'Опубликовано'], ['failed', 'Ошибки']].map(([value, label]) => <TabsTrigger key={value} value={value}>{label}<span>{posts.filter(p => value === 'all' || p.status === value).length}</span></TabsTrigger>)}</TabsList></Tabs><div className="content-filters"><div className="search-field"><Search size={16}/><input aria-label="Поиск контента" placeholder="Найти публикацию…" value={query} onChange={e => setQuery(e.target.value)}/></div><Select value={network} onValueChange={setNetwork}><SelectTrigger className="network-filter"><SlidersHorizontal size={15}/><SelectValue /></SelectTrigger><SelectContent><SelectItem value="all">Все соцсети</SelectItem>{Object.entries(networkNames).map(([n, label]) => <SelectItem key={n} value={n}>{label}</SelectItem>)}</SelectContent></Select></div></div>{filtered.length ? <div className="content-grid">{filtered.map(p => <article className="content-card" key={p.id}><button className="poster-button" onClick={() => openPost(p)}><Poster post={p} media={media}/></button><div className="content-card-body"><div className="row-between"><StatusBadge status={p.status}/><DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Действия: ${p.text.split('\n')[0]}`}><MoreHorizontal size={19}/></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onClick={() => editPost(p)}><Pencil size={15}/>Редактировать</DropdownMenuItem><DropdownMenuItem onClick={() => duplicatePost(p)}><Copy size={15}/>Дублировать в черновик</DropdownMenuItem><DropdownMenuItem onClick={() => deletePost(p)} className="text-red-600"><Trash2 size={15}/>Удалить</DropdownMenuItem></DropdownMenuContent></DropdownMenu></div><button className="content-title" onClick={() => openPost(p)}>{p.text.split('\n')[0]}</button><p>{p.text.split('\n').slice(1).join(' ').trim() || 'Открой публикацию, чтобы посмотреть детали.'}</p><div className="content-card-foot"><span>{dateLabel(p.date)} · {p.time}</span><Socials networks={p.networks}/></div></div></article>)}</div> : <Card><Empty title="Публикации не найдены" description={query || status !== 'all' || network !== 'all' ? 'Попробуй другой запрос или сбрось фильтры.' : 'Создай свою первую публикацию.'} action={<Button variant="outline" onClick={() => { setStatus('all'); setNetwork('all'); setQuery(''); }}>Сбросить фильтры</Button>}/></Card>}<p className="list-count">Показано {filtered.length} из {posts.length} публикаций</p></>;
}
export function MediaLibrary({ media, upload, remove, useMedia }: {
    media: Media[];
    upload: (files: FileList | File[]) => Promise<Media[]>;
    remove: (item: Media) => void;
    useMedia: (item: Media) => void;
}) {
    const [filter, setFilter] = useState('all');
    const [query, setQuery] = useState('');
    const [busy, setBusy] = useState(false);
    const input = useRef<HTMLInputElement>(null);
    const load = async (files: FileList | File[]) => { setBusy(true); try {
        await upload(files);
    }
    finally {
        setBusy(false);
    } };
    const filtered = media.filter(m => (filter === 'all' || m.type.startsWith(filter)) && m.name.toLowerCase().includes(query.toLowerCase()));
    return <><div className="page-heading"><div><div className="eyebrow">ГОТОВО К ПУБЛИКАЦИИ</div><h1>Медиатека</h1><p>Фото и видео, которые всегда под рукой.</p></div><Button className="action" onClick={() => input.current?.click()} disabled={busy}><Upload size={17}/>{busy ? 'Загрузка…' : 'Загрузить медиа'}</Button></div><input hidden ref={input} type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" onChange={e => { if (e.target.files)
        void load(e.target.files); e.target.value = ''; }}/><Card className="media-upload-area"><div className="media-drop" onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); void load(e.dataTransfer.files); }}><span className="upload-icon"><ImageIcon size={28}/></span><h3>Добавь немного визуального</h3><p>Перетащи фото и видео или <button className="inline-link" onClick={() => input.current?.click()}>выбери файлы</button></p><small>JPG, PNG, WebP, MP4, WebM · до 20 МБ на файл · хранятся в этом браузере</small></div></Card><div className="content-toolbar"><Tabs value={filter} onValueChange={setFilter}><TabsList><TabsTrigger value="all">Все файлы</TabsTrigger><TabsTrigger value="image/">Фото</TabsTrigger><TabsTrigger value="video/">Видео</TabsTrigger></TabsList></Tabs><div className="search-field"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Поиск по названию…" aria-label="Поиск медиа"/></div></div>{filtered.length ? <div className="media-grid">{filtered.map(m => <Card className="media-card" key={m.id}><div className="media-thumbnail">{m.type.startsWith('video/') ? <video src={m.url} controls/> : <img src={m.url} alt={m.name}/>}</div><div className="media-card-meta"><strong title={m.name}>{m.name}</strong><small>{m.type.startsWith('video/') ? <Video size={13}/> : <ImageIcon size={13}/>} {(m.size / 1024 / 1024).toFixed(1)} МБ</small><div><Button variant="outline" onClick={() => useMedia(m)}><Plus size={14}/>В пост</Button><Button variant="ghost" size="icon" aria-label={`Удалить ${m.name}`} onClick={() => remove(m)}><Trash2 size={17}/></Button></div></div></Card>)}</div> : <Empty title={query ? 'Файлы не найдены' : 'Здесь будут твои фото и видео'} description={query ? 'Измени запрос.' : 'Загрузи медиа, чтобы использовать их в публикациях.'}/>}</>;
}
