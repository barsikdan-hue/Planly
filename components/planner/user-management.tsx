'use client';

import {useEffect, useRef, useState} from 'react';
import Link from 'next/link.js';

type Colleague = {id:string; email:string; displayName:string; accessState:'ACTIVE'|'BLOCKED'; createdAt:string};
type Selection = {user:Colleague; action:'block'|'restore'};

export function UsersEntry() {
  const [allowed,setAllowed]=useState(false);
  useEffect(()=>{
    const controller=new AbortController();
    void fetch('/api/admin/users',{cache:'no-store',signal:controller.signal})
      .then(response=>{if(!controller.signal.aborted)setAllowed(response.ok);}).catch(()=>{});
    return ()=>controller.abort();
  },[]);
    return allowed?<p><Link href="/admin/users">Пользователи</Link></p>:null;
}

export function UserManagement() {
  const [colleagues,setColleagues]=useState<Colleague[]>([]);
  const [loading,setLoading]=useState(true);
  const [selection,setSelection]=useState<Selection|null>(null);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const lifetime=useRef<AbortController|null>(null);
  const mutation=useRef(false);
  const dialog=useRef<HTMLDialogElement|null>(null);

  function denied(status:number) {
    if(status!==401&&status!==403)return false;
    setColleagues([]);setSelection(null);setNotice('');
    window.location.assign(status===401?'/login':'/');return true;
  }
  useEffect(()=>{
    const controller=new AbortController();lifetime.current=controller;
    void fetch('/api/admin/users',{cache:'no-store',signal:controller.signal})
      .then(async response=>{
        if(controller.signal.aborted)return;
        if(denied(response.status))return;
        if(!response.ok)throw new Error('Не удалось загрузить пользователей.');
        const body=await response.json();if(!controller.signal.aborted)setColleagues(body.users);
      }).catch(()=>{if(!controller.signal.aborted)setError('Не удалось загрузить пользователей. Обнови страницу.');})
      .finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return ()=>controller.abort();
  },[]);
  useEffect(()=>{
    if(!selection)return;
    const element=dialog.current;element?.showModal();
    return ()=>{if(element?.open)element.close();};
  },[selection]);

  function choose(user:Colleague) {
    if(mutation.current)return;
    setSelection({user,action:user.accessState==='ACTIVE'?'block':'restore'});setError('');setNotice('');
  }
  async function confirm() {
    const controller=lifetime.current;
    if(!selection||mutation.current||!controller||controller.signal.aborted)return;
    mutation.current=true;setBusy(true);setError('');setNotice('');
    const chosen=selection;
    try {
      const response=await fetch(`/api/admin/users/${encodeURIComponent(chosen.user.id)}`,{method:'POST',cache:'no-store',signal:controller.signal,headers:{'Content-Type':'application/json'},body:JSON.stringify({action:chosen.action})});
      if(controller.signal.aborted)return;
      if(denied(response.status))return;
      if(!response.ok)throw new Error('Не удалось подтвердить изменение доступа. Обнови список перед повтором.');
      const body=await response.json();if(controller.signal.aborted)return;
      setColleagues(current=>current.map(user=>user.id===body.user.id?body.user:user));
      setSelection(null);setNotice(chosen.action==='block'?'Пользователь заблокирован. Все его сессии отозваны.':'Доступ восстановлен. Пользователю нужно войти заново.');
    } catch {if(!controller.signal.aborted){setSelection(null);setError('Не удалось подтвердить изменение доступа. Обнови страницу перед повтором.');}}
    finally {mutation.current=false;if(!controller.signal.aborted)setBusy(false);}
  }
  return <main className="users-shell"><section className="users-card">
    <Link href="/admin">← Администрирование</Link><h1>Пользователи</h1>
    <p>Управляй доступом коллег. Их личные посты, медиа и подключения доступны только им.</p>
    {loading?<p>Загрузка пользователей…</p>:!colleagues.length&&!error?<p>Зарегистрированных коллег пока нет. <Link href="/admin/invitations">Пригласить коллегу</Link></p>:null}
    {error&&<p role="alert">{error}</p>}{notice&&<p role="status">{notice}</p>}
    {colleagues.length>0&&<table role="table" className="users-list"><caption className="users-visually-hidden">Доступ зарегистрированных коллег</caption><thead><tr><th scope="col">Коллега</th><th scope="col">Статус</th><th scope="col">Дата регистрации</th><th scope="col">Действие</th></tr></thead><tbody>{colleagues.map(user=><tr role="row" key={user.id}>
      <td><strong>{user.email}</strong><span><Link href={`/admin/users/${encodeURIComponent(user.id)}`}>{user.displayName}</Link></span></td>
      <td><span className={user.accessState==='ACTIVE'?'user-active':'user-blocked'}>{user.accessState==='ACTIVE'?'Активен':'Заблокирован'}</span></td>
      <td><time dateTime={user.createdAt}>{new Date(user.createdAt).toLocaleDateString('ru-RU',{timeZone:'Europe/Moscow'})}</time></td>
      <td><button type="button" disabled={busy} onClick={()=>choose(user)}>{user.accessState==='ACTIVE'?'Заблокировать':'Восстановить доступ'}</button></td>
    </tr>)}</tbody></table>}
    {selection&&<dialog ref={dialog} role="alertdialog" aria-labelledby="user-action-title" aria-describedby="user-action-description" onCancel={event=>{event.preventDefault();if(!mutation.current)setSelection(null);}}>
      <h2 id="user-action-title">{selection.action==='block'?'Заблокировать пользователя?':'Восстановить доступ?'}</h2>
      <p><strong>{selection.user.email}</strong></p><p id="user-action-description">{selection.action==='block'?'Пользователь потеряет доступ, все его сессии будут отозваны.':'Пользователь сможет войти заново. Старые сессии останутся недействительными.'}</p>
      <div className="user-confirm-actions"><button type="button" className="user-cancel" autoFocus disabled={busy} onClick={()=>setSelection(null)}>Отмена</button><button type="button" disabled={busy} onClick={()=>{void confirm();}}>Подтвердить</button></div>
    </dialog>}
  </section></main>;
}
