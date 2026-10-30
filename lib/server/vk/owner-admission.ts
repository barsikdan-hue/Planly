// Classification changes only the denial report; it never grants access.
export function makeOwnerAdmissionHandler(authorize:(request:Request)=>Promise<void>){
  return async(request:Request):Promise<Response>=>{
    try{
      await authorize(request);
      return Response.json({status:'OWNER_SESSION_RECOGNIZED'},{headers:{'Cache-Control':'no-store'}});
    }catch(error){
      const name=error instanceof Error?error.name:'';
      const [status,label]=name==='UnauthorizedError'
        ?[401,'OWNER_SESSION_REQUIRED']
        :name==='ForbiddenError'||name==='SessionAccessError'
          ?[403,'OWNER_ACCESS_DENIED']
          :[503,'ADMISSION_UNAVAILABLE'];
      return Response.json({status:label},{status:Number(status),headers:{'Cache-Control':'no-store'}});
    }
  };
}
