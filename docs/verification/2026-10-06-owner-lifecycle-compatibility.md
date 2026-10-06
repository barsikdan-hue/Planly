# CR11 frozen PR18 compatibility — supporting integration

STATUS: SUPPORTING_GREEN, not production or fresh-main CI acceptance.

Primary CR11 runtime checkpoint: `915f4fe14b46c599ba6ce9905d2b9618d449b574`, reviewed against frozen PR17 `89111873a6cda4ecceba545102911706eafc386c`. Frozen PR18: `f7dd2bb29d9c2a23d3919cda3e83a57fcf099027`. No frozen branch/source changes.

Probe worktree: `C:/Users/EliteSochi/Documents/ChatGPT/SMM Planer/work/Planly-owner-lifecycle-integration`, detached `5475414f01e03d4be6294e0a77901c773c6cfb20`, staged/uncommitted/unpushed, no MERGE_HEAD. Prior CR09 RED integration was preserved separately. Manual worktree fallback used because the app's managed worktree tool is rooted at the stale/unborn SMM root; path absence verified before creation.

## Inputs and resolutions

Copied the preserved frozen PR14 d056543 / PR16 ac4f663 / PR17 8911187 / PR18 final deletion correction patch: SHA256 `153CCEB1856BF443E4A46E06CEFCB7DAF0B88BFD4891B8CF9D6FF579DA053B95`. Its App blob `21129ee2b77624a3322bb4c21b20dfe086059bf0` matches the prior RED worktree exactly. Applied CR11 App diff `8911187..915f4fe` with3-way merge, resolved11 App overlaps in this probe only.

Preserved PR16 UI persistence/durability and its exact bootstrap recovery/pending UI precedence inside the new shared hydration; blank destination context resets UI to its own initial intent. Preserved PR14 fallback overlap/mounted behavior and PR18 token-scoped batch/submit/retry/deletion semantics. Shared upload retains canApply + canNotify; canonical owner acceptance is required in addition to Library/token predicates. Composer batch owner/generation is derived from canonical OwnerLifetime, removing its second independent App authority in the combined tree. New owner clears old batches/deletion tombstones, invalidates first-life A callbacks, and exposes B batch snapshot. Existing Library binding/revision safeguards remain.

This is explicit syntactic/representation compatibility with already approved policies, not a new feature or a copied edit into PR18. The exact resolver is included below for inspectability; source/runtime remains outside primary CR11 diff. Final staged integration patch SHA256: `3B19EA827882B44C3E71E25E9FDD9CB023B4E1AF93CA68FBCCE862C49374323E`; resolved App blob `3e2d879f55f5ef0d071e7c48d09c8f60019b1dc0`. Patch and logs preserved under primary ignored `.superpowers/customer-ready/`.

## Fresh results

- The unchanged three independent PR18 owner-poll probes now pass **3/3**, alongside expanded CR11 **36/36**: combined **39/39 PASS /0FAIL/0SKIP**, exit0.
- Wider23-file frozen compatibility selection: **298/298 PASS /0FAIL/0SKIP**, exit0.
- No-incremental integration typecheck exit0. Both working/staged diff checks exit0. No unresolved index entries/MERGE_HEAD or generated tsconfig change.

Each original owner-poll probe proves actual media POST acknowledged, deferred media GET begun, actual scheduled bootstrap/profile A→B applied B media, then successful late A GET finished. Independent assertions cover no A global asset in B, original A recovery unchanged/no old attachment in B, and no old completion/error message. Probe source is unchanged from committed [PR18 owner-poll report](https://github.com/barsikdan-hue/Planly/blob/f7dd2bb29d9c2a23d3919cda3e83a57fcf099027/docs/verification/2026-10-06-composer-library-owner-poll-probe.md). Its former exact frozen tree result was0/3; no assertion waiver.

These are actual App/client callback pipelines using modeled hooks/timers/storage/HTTP. They are not React reconciliation/browser/Render/provider or native PostgreSQL/Redis proof. PR19 stays DRAFT awaiting Owner-approved PR17 merge, fresh-main rebase and actual native CI/Docker; PR18 stays frozen DRAFT until its own fresh integration. No merge/deploy/production/provider/infra operation.

Selected files (Node512, --test --test-reporter=tap --test-concurrency=1 --experimental-strip-types):

- `tests/swipe-planner-ui.test.mjs`
- `tests/swipe-planner-recovery.test.ts`
- `tests/swipe-planner-app.test.mjs`
- `tests/post-edit-ui.test.mjs`
- `tests/post-edit-ui-callbacks.test.mjs`
- `tests/post-edit-app-lifecycle.test.mjs`
- `tests/pending-editor-ui.test.ts`
- `tests/pending-creation.test.ts`
- `tests/library-editor-recovery.test.mjs`
- `tests/library-editor-recovery-storage.test.ts`
- `tests/library-editor-continuations.test.mjs`
- `tests/editor-ui-recovery.test.ts`
- `tests/editor-recovery.test.mjs`
- `tests/editor-recovery-lifecycle.test.mjs`
- `tests/editor-mode-ssr.test.mjs`
- `tests/editor-mode-save-lifecycle.test.mjs`
- `tests/editor-mode-recovery.test.mjs`
- `tests/content-library-ui.test.mjs`
- `tests/composer-upload-race.test.mjs`
- `tests/composer-upload-continuation.test.mjs`
- `tests/composer-customer-ready-ui.test.mjs`
- `tests/owner-lifecycle-app.test.mjs`
- `.superpowers/customer-ready/cr11-pr18-owner-poll.test.mjs`

## Exact probe conflict-resolution script

Run only after the specified frozen patch and CR11 three-way diff have produced their11 known App conflicts in a disposable integration checkout. It refuses a different conflict count and does not touch primary/frozen source.

```python
from pathlib import Path
import re
p=Path('components/planner/app.tsx')
s=p.read_text(encoding='utf-8')
conflicts=list(re.finditer(r'<<<<<<< ours\n(.*?)=======\n(.*?)>>>>>>> theirs\n',s,re.S))
assert len(conflicts)==11,len(conflicts)
bootstrap=conflicts[2].group(1)
hydration=bootstrap[bootstrap.index('            const storage = sessionRecoveryStorage();'):]
hydration='\n'.join(line[4:] if line.startswith('    ') else line for line in hydration.splitlines())
res=[]
for i,c in enumerate(conflicts):
    ours,theirs=c.group(1),c.group(2)
    if i in (0,1): out=ours
    elif i in (2,3): out=theirs
    elif i in (4,8): out='        if (!isOwnerCurrent(ownerContext)) return;\n'+ours
    elif i==5: out=ours.rstrip()+'\n        const context = ownerContext;\n        const permitted = () => isOwnerCurrent(context) && (!canApply || canApply());\n'
    elif i==6: out='                if (!permitted()) break;\n                removedMediaIds.current.delete(item.id);\n'
    elif i==7: out=ours.replace('(!canApply || canApply())','permitted()')
    elif i==9: out='        if (!isOwnerCurrent(ownerContext)) return;\n'+ours
    elif i==10:
        guard='    const setDraftForOwner: Dispatch<SetStateAction<Post>> = update => {\n        if (isOwnerCurrent(ownerContext)) setDraft(update);\n    };\n'
        out=guard+ours.replace('{ draft, setDraft, publishMode:', '{ draft, setDraft: setDraftForOwner, publishMode:').replace('onPublishModeChange: changePublishMode,','onPublishModeChange: (mode: EditorUiIntent[\'publishMode\']) => { if (isOwnerCurrent(ownerContext)) changePublishMode(mode); },')
    res.append((c.start(),c.end(),out))
for a,b,out in reversed(res): s=s[:a]+out+s[b:]
a=s.index('    const hydrateComposerOwner ='); b=s.index('    const transitionOwner =',a)
s=s[:a]+'''    const hydrateComposerOwner = useCallback((snapshot: Awaited<ReturnType<typeof loadPlanner>>) => {
        const posts = snapshot.posts.map(fromServerPost);
        const media = snapshot.media.map(toUiMedia);
'''+hydration+'''
    }, [updateEditorToken, warnRecoveryUnavailable, assignEditorUi, persistEditor]);

'''+s[b:]
s=s.replace('recoveryOwner.current','ownerLifetime.current?.id')
s=s.replace('type ComposerUploadContext = { ownerId: string; token: string; generation: number };','type ComposerUploadContext = { ownerId: string; token: string; generation: object | null };')
s=s.replace('    const composerLifetime = useRef({ mounted: false, ownerId: null as string | null, generation: 0 });\n','')
s=s.replace('ownerId: string | null; generation: number; batches: ComposerUploadBatch[];','ownerId: string | null; generation: object | null; batches: ComposerUploadBatch[];')
s=s.replace('}>({ ownerId: null, generation: 0, batches: [] });','}>({ ownerId: null, generation: null, batches: [] });')
a=s.index('    const publishComposerUploads ='); b=s.index('    const isCurrentComposerEditor =',a)
s=s[:a]+'''    // Batch bookkeeping derives its owner identity from the canonical App lifetime.
    const publishComposerUploads = useCallback(() => {
        if (!ownerMounted.current) return;
        const lifetime = ownerLifetime.current;
        setComposerUploads({ ownerId: lifetime?.id ?? null, generation: lifetime?.generation ?? null,
            batches: Array.from(composerBatches.current.values()) });
    }, []);
    useEffect(() => {
        const batches = composerBatches.current;
        return () => { batches.clear(); };
    }, []);
    const isCurrentComposerOwner = (context: ComposerUploadContext) => !!context.generation &&
        isOwnerCurrent({ id: context.ownerId, generation: context.generation });
'''+s[b:]
s=s.replace('        ownerLifetime.current = null;\n        const next = blankPost();','        ownerLifetime.current = null;\n        composerBatches.current.clear(); removedMediaIds.current.clear();\n        const next = blankPost();\n        assignEditorUi(initialEditorUi(next));',1)
s=s.replace('        setDraftState(next); persistedEditor.current = null;','        setDraftState(next); persistedEditor.current = null; persistedEditorUi.current = null;',1)
s=s.replace('        ownerLifetime.current = context; setOwnerContext(context);','        ownerLifetime.current = context; setOwnerContext(context);\n        publishComposerUploads();',1)
s=s.replace('    }, [hydrateComposerOwner, bindLibraryOwner, updateEditorToken]);','    }, [hydrateComposerOwner, bindLibraryOwner, updateEditorToken, assignEditorUi, publishComposerUploads]);',1)
assert not re.search(r'<<<<<<<|=======|>>>>>>>|recoveryOwner|composerLifetime|bindComposerUploadOwner',s)
p.write_text(s,encoding='utf-8')
```
