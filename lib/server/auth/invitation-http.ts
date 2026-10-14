import { ZodError } from 'zod';
import { ForbiddenError } from './access.ts';
import { UnauthorizedError } from './owner.ts';
import { InvitationError } from './invitations.ts';

export function invitationJson(data:unknown,status=200,headers:Record<string,string>={}) {
  return Response.json(data,{status,headers:{'cache-control':'private, no-store','referrer-policy':'no-referrer',...headers}});
}
export function invitationError(error:unknown) {
  if(error instanceof ForbiddenError)return invitationJson({error:'Forbidden'},403);
  if(error instanceof UnauthorizedError)return invitationJson({error:'Unauthorized'},401);
  if(error instanceof InvitationError)return invitationJson({error:error.message},error.status);
  if(error instanceof ZodError)return invitationJson({error:'Проверь данные приглашения и пароль (12–128 символов).'},422);
  if(error instanceof SyntaxError)return invitationJson({error:'Некорректный запрос.'},400);
  // Do not echo database errors: a failed insert can contain credential hashes.
  return invitationJson({error:'Не удалось обработать приглашение.'},500);
}
