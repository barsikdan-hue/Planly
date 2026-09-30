export type Network = 'Telegram' | 'VK' | 'Instagram';
export type Status = 'draft' | 'scheduled' | 'published' | 'publishing' | 'error';
export type Media = { id: string; name: string; src: string; type: string };
export type Post = { id: string; title: string; text: string; networks: Network[]; date: string; status: Status; media?: Media; publicUrl?:string; revision?:number };
export type Delivery = {id:string;post_id:string;network:Network;status:'pending'|'sending'|'sent'|'failed'|'unknown';due:string;remote_id?:string;error?:string};
export type State = { posts: Post[]; media: Media[]; accounts: Network[]; name: string; email: string; accountDetails?:{network:Network;label:string;target:string}[];deliveries?:Delivery[];scheduler?:string };
export const networks: Network[] = ['Telegram', 'VK', 'Instagram'];
export const maxUploadBytes = 200 * 1024 * 1024;
export const contentIdeas = ['Обзор новостройки у моря','5 вопросов перед покупкой апартаментов','Сравнение районов Черноморского побережья','Инфраструктура рядом с комплексом','История клиента без персональных данных','Чек-лист для первого просмотра'];
export const statusLabels: Record<Status, string> = {draft:'Черновик',scheduled:'Запланирован',published:'Опубликован',publishing:'Отправляется',error:'Нужна проверка'};
export function dateInput(d: Date) { const p=(v:number)=>String(v).padStart(2,'0'); return `${d.getFullYear()}-${p(d.getMonth()+1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`; }
export function seed(): State {
 const date=(offset:number,hour=12)=>{const d=new Date();d.setDate(d.getDate()+offset);d.setHours(hour,0,0,0);return dateInput(d)};
 return {name:'Данил',email:'danil@example.com',accounts:[...networks],media:[],posts:[
 {id:'1',title:'Утро у моря. Место, которое вдохновляет',text:'Иногда лучший план на утро — замедлиться. Пройтись вдоль моря, выпить кофе и заметить, как много красоты рядом.\n\nА где начинается ваше идеальное утро? 🌊',networks:['Telegram','Instagram'],date:date(1,10),status:'scheduled'},
 {id:'2',title:'5 вопросов перед покупкой квартиры',text:'Сохраните этот список перед просмотром:\n\n1. Как устроена инфраструктура?\n2. Что видно из окон?\n3. Где парковаться?\n4. Сколько стоят коммунальные услуги?\n5. Какие документы готовит продавец?\n\nДетали делают выбор осознанным.',networks:['Telegram','VK'],date:date(2,14),status:'scheduled'},
 {id:'3',title:'За кадром: один день в Сочи',text:'Один день, три встречи и десятки маленьких открытий. Показываю город таким, каким вижу его каждый день.',networks:['Instagram'],date:date(3,18),status:'scheduled'},
 {id:'4',title:'Идея: гид по любимым районам',text:'Собрать любимые места в одном посте: прогулки, кафе и тихие дворы.',networks:['Telegram'],date:date(4),status:'draft'},
 {id:'5',title:'Почему я выбираю жизнь у моря',text:'Больше воздуха. Больше прогулок. Больше времени на то, что действительно важно.\n\nДелюсь личной историей переезда.',networks:['Telegram','VK','Instagram'],date:date(-2),status:'published'},
 {id:'6',title:'Новая неделя — новые истории',text:'На этой неделе покажу несколько интересных мест и отвечу на ваши вопросы. Оставайтесь на связи!',networks:['Telegram','VK'],date:date(-4),status:'published'}]};
}
export function validatePost(post: Pick<Post,'text'|'networks'|'date'|'status'>,now=Date.now()): string {
 if(!post.text.trim())return 'Добавьте текст поста.';
 if(post.status==='draft')return '';
 if(!post.networks.length)return 'Выберите хотя бы одну соцсеть.';
 if(post.status==='scheduled'&&(!post.date||!Number.isFinite(new Date(post.date).getTime())||new Date(post.date).getTime()<=now))return 'Выберите дату и время в будущем.';
 return '';
}
