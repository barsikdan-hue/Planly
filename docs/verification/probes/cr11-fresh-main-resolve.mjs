// Disposable exact PR19 0497094 + frozen PR18 f7dd2bb merge only.
// Preserve merged PR14/16/17 and derive CR09 batches from CR11 canonical lifetime.
import fs from 'node:fs';
import assert from 'node:assert/strict';

const pattern = /^<<<<<<< HEAD\n([\s\S]*?)^=======\n([\s\S]*?)^>>>>>>> f7dd2bb29d9c2a23d3919cda3e83a57fcf099027\n/gm;
const canonicalBatches = `    const composerBatches = useRef(new Map<string, ComposerUploadBatch>());
    const removedMediaIds = useRef(new Set<string>());
    const [composerUploads, setComposerUploads] = useState<{
        ownerId: string | null; generation: object | null; batches: ComposerUploadBatch[];
    }>({ ownerId: null, generation: null, batches: [] });
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
    const isCurrentComposerEditor = (context: ComposerUploadContext) =>
        isCurrentComposerOwner(context) && editorToken.current === context.token;
    const hasPendingComposerUpload = () => Array.from(composerBatches.current.values())
        .some(batch => isCurrentComposerEditor(batch.context));
`;
let app = fs.readFileSync('components/planner/app.tsx', 'utf8').replaceAll('\r\n', '\n');
const conflicts = [...app.matchAll(pattern)];
assert.equal(conflicts.length, 11);
const resolved = conflicts.map((match, index) => {
    const ours = match[1], theirs = match[2];
    switch (index) {
        case 0:
            assert.ok(ours.includes('const libraryEditorRef')); assert.ok(theirs.includes('const composerLifetime'));
            return ours + '\n' + canonicalBatches;
        case 1:
            assert.equal(ours.trim(), 'transitionOwner(snapshot);'); return ours;
        case 2:
            assert.equal(ours.trim(), '}, [transitionOwner]);'); return ours;
        case 3: case 6:
            assert.ok(ours.includes('isOwnerCurrent')); assert.ok(theirs.includes('hasPendingComposerUpload'));
            return '        if (!isOwnerCurrent(ownerContext)) return;\n' + theirs;
        case 4:
            assert.ok(ours.includes('const permitted')); assert.ok(theirs.includes('removedMediaIds.current.delete'));
            return ours.replace('canApply?: () => boolean):', 'canApply?: () => boolean, canNotify?: () => boolean):') +
                '                removedMediaIds.current.delete(item.id);\n';
        case 5:
            assert.ok(ours.includes('const libraryEditorControl')); assert.ok(theirs.includes('const uploadComposerEditor'));
            return ours.replace('permitted() && added.length && !canApply', 'permitted() && added.length && (canNotify ? canNotify() : !canApply)').replaceAll('permitted() && !canApply', 'permitted() && (canNotify ? canNotify() : !canApply)') +
                '    };\n\n' + theirs.slice(theirs.indexOf('    const uploadComposerEditor'));
        case 7:
            assert.ok(ours.includes('isOwnerCurrent')); return ours + theirs;
        case 8: {
            assert.ok(ours.includes('const changePublishModeForOwner')); assert.ok(theirs.includes('uploadControl:'));
            const guards = ours.slice(0, ours.indexOf('    const composer ='));
            const context = theirs.slice(0, theirs.indexOf('    const composer ='));
            const descriptor = theirs.slice(theirs.indexOf('    const composer ='))
                .replace('draft, setDraft, media:', 'draft, setDraft: setDraftForOwner, publishMode: editorUi.publishMode, onPublishModeChange: changePublishModeForOwner, media:');
            return guards + context + descriptor;
        }
        case 9:
            assert.ok(ours.includes('mediaRevision')); assert.ok(theirs.includes('removedMediaIds')); return ours + theirs;
        case 10:
            assert.ok(ours.includes('editorControl={libraryEditorControl}')); assert.ok(theirs.includes('disabled={saveBusy || composer.uploadControl.busy}'));
            return ours.replace('disabled={saveBusy}>Повторить сохранение', 'disabled={saveBusy || composer.uploadControl.busy}>Повторить сохранение');
        default: throw Error('Unknown conflict');
    }
});
for (let i = conflicts.length - 1; i >= 0; i--) {
    const match = conflicts[i]; app = app.slice(0, match.index) + resolved[i] + app.slice(match.index + match[0].length);
}
app = app.replace('type ComposerUploadContext = { ownerId: string; token: string; generation: number };',
    'type ComposerUploadContext = { ownerId: string; token: string; generation: object | null };');
assert.equal((app.match(/ownerLifetime.current = null;\n        const next = blankPost\(\);/g) ?? []).length, 1);
app = app.replace('ownerLifetime.current = null;\n        const next = blankPost();',
    'ownerLifetime.current = null;\n        composerBatches.current.clear(); removedMediaIds.current.clear();\n        const next = blankPost();');
app = app.replace('ownerLifetime.current = context; setOwnerContext(context);',
    'ownerLifetime.current = context; setOwnerContext(context);\n        publishComposerUploads();');
app = app.replace('[hydrateComposerOwner, bindLibraryOwner, updateEditorToken, assignEditorUi]);',
    '[hydrateComposerOwner, bindLibraryOwner, updateEditorToken, assignEditorUi, publishComposerUploads]);');
assert.ok(!/<<<<<<<|=======|>>>>>>>|recoveryOwner|composerLifetime|bindComposerUploadOwner/.test(app));
fs.writeFileSync('components/planner/app.tsx', app);

let composer = fs.readFileSync('components/planner/composer.tsx', 'utf8').replaceAll('\r\n', '\n');
const composerConflicts = [...composer.matchAll(pattern)]; assert.equal(composerConflicts.length, 3);
const composerResolutions = composerConflicts.map((match, index) => {
    const ours = match[1], theirs = match[2];
    if (index === 0) return ours + theirs;
    if (index === 1) {
        assert.ok(ours.includes('const [pendingUploads')); assert.ok(ours.includes('controlledMode'));
        return ours.replace('media, upload, save,', 'media, upload, uploadControl, save,')
            .replace('const busy = pendingUploads > 0;', 'const busy = uploadControl ? uploadControl.busy : pendingUploads > 0;');
    }
    assert.ok(ours.includes('setPendingUploads'));
    return '    const addFiles = async (files: FileList | File[]) => {\n' +
        '        if (uploadControl) { await uploadControl.addFiles(files); return; }\n' +
        '        setPendingUploads(current => current + 1); try {\n';
});
for (let i = composerConflicts.length - 1; i >= 0; i--) {
    const match = composerConflicts[i]; composer = composer.slice(0, match.index) + composerResolutions[i] + composer.slice(match.index + match[0].length);
}
assert.ok(!/<<<<<<<|=======|>>>>>>>|setBusy|localBusy/.test(composer));
fs.writeFileSync('components/planner/composer.tsx', composer);
