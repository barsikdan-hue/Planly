'use client';
import type { ReactNode } from 'react';
import { Send, Check, Clock, FileText, AlertCircle, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Post, Network, Status, Media } from '@/lib/planner';
import { networkNames, statusNames } from '@/lib/planner';
import { orderedPostMedia } from '@/lib/post-media';
// MAX white symbol from https://go.max.ru/brandbook; preserves the official silhouette.
export function SocialIcon({ network, small = false }: {
    network: Network;
    small?: boolean;
}) { return <span className={`social-icon ${network} ${small ? 'small' : ''}`} role="img" aria-label={networkNames[network]} style={network === 'max' ? { backgroundColor: '#471AFF' } : network === 'vk' ? { backgroundColor: '#0077FF' } : undefined}>{network === 'telegram' ? <Send size={small ? 13 : 18}/> : network === 'vk' ? <b aria-hidden="true">VK</b> : <svg viewBox="0 0 100 100" width={small ? 13 : 18} height={small ? 13 : 18} aria-hidden="true" focusable="false"><path d="M50.7571 0.261719C78.2929 0.261719 99.8857 22.5974 99.8857 50.1474C99.8857 77.6974 77.6071 99.4903 51.0214 99.4903C41.5857 99.4903 37.0143 98.1617 29.65 92.9474C29.1429 92.5903 28.45 92.6831 28.0214 93.1403C22.3571 99.1831 7.85 103.426 7.18571 95.176C7.18571 80.7903 0 71.4474 0 49.876C0 21.5546 23.2214 0.261719 50.7571 0.261719ZM51.5286 24.8117C38.4643 24.126 28.2643 33.1974 26.0143 47.3831C24.15 59.1332 27.45 73.4546 30.2786 74.176C31.4786 74.4832 34.3571 72.276 36.4571 70.2974C36.85 69.926 37.45 69.8617 37.9071 70.1474C41.1786 72.1474 44.8786 73.6474 48.9571 73.8617C62.3714 74.5617 74.2571 64.0617 74.9643 50.6474C75.6643 37.2331 64.9429 25.5046 51.5286 24.8046V24.8117Z" fill="currentColor"/></svg>}</span>; }
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
}) { const item = orderedPostMedia(post.mediaIds, media)[0]; return <div className={`post-poster theme-${post.theme ?? 2} ${compact ? 'compact' : ''}`}>{item ? (item.type.startsWith('video/') ? <video src={item.url} muted playsInline/> : <img src={item.url} alt={item.name}/>) : <><span className="poster-eyebrow">АГЕНТ БЕЗ ГАЛСТУКА</span><strong>{post.text.split('\n')[0]}</strong><span className="poster-caption">о недвижимости и жизни у моря</span></>}</div>; }
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
