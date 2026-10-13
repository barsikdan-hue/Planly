import { z } from 'zod';
import { requireApiOwner } from './auth/owner.ts';
import { apiError,json } from './http.ts';
import { readSwipeFeedback } from './swipe-feedback.ts';
export async function handleSwipeFeedback(request:Request):Promise<Response>{
 let response:Response;
 try{
  const owner=await requireApiOwner(request);
  z.object({}).strict().parse(Object.fromEntries(new URL(request.url).searchParams));
  response=json(await readSwipeFeedback(owner.id));
 }catch(error){response=apiError(error);}
 response.headers.set('Cache-Control','private, no-store');
 return response;
}
