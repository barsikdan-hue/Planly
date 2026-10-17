import {connectionTicket} from '../../../../lib/server/social-connections/http.ts';
export const POST=(request:Request)=>connectionTicket(request,'confirm');
