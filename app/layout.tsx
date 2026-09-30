import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {title:'Planly — Personal SMM Planner',description:'Личный планировщик контента: создавайте посты, выбирайте соцсети и планируйте публикации.',icons:{icon:'/favicon.svg'}};
export default function RootLayout({children}:Readonly<{children:React.ReactNode}>){return <html lang="ru"><body>{children}</body></html>}
