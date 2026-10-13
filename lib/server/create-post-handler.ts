import { createPostSourceSchema, savePostInputSchema } from '../contracts/planner.ts';
import { requireApiOwner } from './auth/owner.ts';
import { apiError, json, readJson } from './http.ts';
import { createPost, listPlannerPosts } from './posts.ts';
import { creationKeySchema } from './post-idempotency.ts';
import { runDuePublications, shouldProcessImmediately } from './scheduler/tick.ts';
import { ZodError } from 'zod';
import { SwipeApprovalValidationError } from './planner-slots.ts';
type Dependencies = {
  requireOwner: (request: Request) => Promise<{id:string}>;
  create: typeof createPost;
  list: typeof listPlannerPosts;
  tick: (options: Parameters<typeof runDuePublications>[0]) => Promise<unknown>;
};
const defaults: Dependencies = {requireOwner:requireApiOwner,create:createPost,list:listPlannerPosts,tick:runDuePublications};
// The route and handler tests execute this same branch; Next route exports stay HTTP-only.
export async function handleCreatePost(request: Request, dependencies: Dependencies = defaults): Promise<Response> {
  try {
    const owner = await dependencies.requireOwner(request);
    const raw = await readJson(request);
    const parsed = (() => {
      try {
        const header = request.headers.get('idempotency-key');
        return {input:savePostInputSchema.parse(raw),source:createPostSourceSchema.parse(raw),creationKey:header===null?undefined:creationKeySchema.parse(header)};
      } catch(error) {
        if(error instanceof ZodError && raw && typeof raw==='object' && 'swipeReview' in raw) throw new SwipeApprovalValidationError(error.issues);
        throw error;
      }
    })();
    const {input,source,creationKey}=parsed;
    const saved = await dependencies.create(owner.id,input,{creationKey,...source});
    if(source.swipeReview || !shouldProcessImmediately(input)) return json(saved,201);
    await dependencies.tick({userId:owner.id,postId:saved.id,limit:Math.max(1,saved.targets.length)});
    const refreshed = (await dependencies.list(owner.id)).find(post=>post.id===saved.id)??saved;
    return json(refreshed,201);
  } catch(error) { return apiError(error); }
}
