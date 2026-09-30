'use client';
import type { ReactNode } from 'react';
import { Send, Camera as Instagram, Check, Clock, FileText, AlertCircle, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Post, Network, Status, Media } from '@/lib/planner';
import { networkNames, statusNames } from '@/lib/planner';
export function SocialIcon({ network, small = false }: {
    network: Network;
    small?: boolean;
}) { return <span className={`social-icon ${network} ${small ? 'small' : ''}`} aria-label={networkNames[network]}>{network === 'telegram' ? <Send size={small ? 13 : 18}/> : network === 'instagram' ? <Instagram size={small ? 14 : 19}/> : <b>vk</b>}</span>; }
export function Socials({ networks }: {
    networks: Network[];
}) { return <span className="social-stack">{networks.map(n => <SocialIcon key={n} network={n} small/>)}</span>; }
export function StatusBadge({ status }: {
    status: Status;
}) { const Icon = { draft: FileText, scheduled: Clock, published: Check, failed: AlertCircle }[status]; return <span className={`status-badge ${status}`}><Icon size={12}/>{statusNames[status]}</span>; }
export function Card({ title, action, children, className = '' }: {
    title?: ReactNode;
    action?: ReactNode;
    children: ReactNode;
    className?: string;
}) { return <section className={`planner-card ${className}`}>{title && <div className="card-heading"><h2>{title}</h2>{action}</div>}{children}</section>; }
export function Poster({ post, media, compact = false }: {
    post: Post;
    media: Media[];
    compact?: boolean;
}) { const item = media.find(m => post.mediaIds.includes(m.id)); return <div className={`post-poster theme-${post.theme ?? 2} ${compact ? 'compact' : ''}`}>{item ? (item.type.startsWith('video/') ? <video src={item.url} muted playsInline/> : <img src={item.url} alt={item.name}/>) : <><span className="poster-eyebrow">АГЕНТ БЕЗ ГАЛСТУКА</span><strong>{post.text.split('\n')[0]}</strong><span className="poster-caption">о недвижимости и жизни у моря</span></>}</div>; }
export function Empty({ title, description, action }: {
    title: string;
    description?: string;
    action?: ReactNode;
}) { return <div className="empty-state"><span><ImageIcon size={26}/></span><h3>{title}</h3>{description && <p>{description}</p>}{action}</div>; }
export function Action({ children, onClick, secondary = false, disabled = false, className = '' }: {
    children: ReactNode;
    onClick?: () => void;
    secondary?: boolean;
    disabled?: boolean;
    className?: string;
}) { return <Button onClick={onClick} disabled={disabled} variant={secondary ? 'outline' : 'default'} className={`action ${secondary ? 'secondary' : ''} ${className}`}>{children}</Button>; }
export function dateLabel(date: string) { return new Date(`${date}T12:00:00Z`).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); }
