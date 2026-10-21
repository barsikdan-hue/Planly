"""Synthetic VFS layout only; no daemon, image extraction or saved data."""
import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import sys
import tempfile
import time
import types
import unittest


def load():
    path = Path(__file__).with_name('vfs_source.py')
    if not path.exists():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('vfs_source', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Inputs(unittest.TestCase):
    def test_native_config_identity_is_required_before_accessing_a_store(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'source_root', None)), 'Held VFS source binding is missing')
        def forbidden():
            self.fail('Malformed source input reached ownership boundary')
        for config in ('latest', 'sha256:../escape', 'sha256:' + 'a' * 63, None):
            with self.subTest(config=config), self.assertRaises(m.Incomplete):
                with m.source_root(3, (1, 2), config, forbidden):
                    self.fail('Unpinned source config accepted')


@unittest.skipUnless(sys.platform == 'linux', 'Linux held-directory/no-follow metadata tested in dedicated CI')
class LinuxSource(unittest.TestCase):
    def setUp(self):
        self.m = load()
        self.assertTrue(callable(getattr(self.m, 'source_root', None)), 'Held VFS source binding is missing')

    @contextlib.contextmanager
    def fixture(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            diffs = ['sha256:' + '1' * 64, 'sha256:' + '2' * 64]
            raw = json.dumps({'rootfs': {'type': 'layers', 'diff_ids': diffs}}).encode()
            config_id = 'sha256:' + hashlib.sha256(raw).hexdigest()
            db = root / 'image/vfs/imagedb/content/sha256'
            db.mkdir(parents=True)
            (db / config_id[7:]).write_bytes(raw)
            parent = None
            for index, diff in enumerate(diffs):
                chain = diff if parent is None else 'sha256:' + hashlib.sha256((parent + ' ' + diff).encode()).hexdigest()
                layer = root / 'image/vfs/layerdb/sha256' / chain[7:]
                layer.mkdir(parents=True)
                (layer / 'diff').write_text(diff)
                if parent is not None:
                    (layer / 'parent').write_text(parent)
                (layer / 'cache-id').write_text('fixture-' + str(index))
                leaf = root / 'vfs/dir' / ('fixture-' + str(index))
                leaf.mkdir(parents=True)
                parent = chain
            (leaf / 'payload').write_bytes(b'twelve-bytes')
            (leaf / 'payload').chmod(0)  # metadata succeeds; unprivileged data reads would fail
            (leaf / 'link').symlink_to('/does-not-exist/never-follow')
            fd = os.open(root, os.O_RDONLY | os.O_DIRECTORY)
            identity = (os.fstat(fd).st_dev, os.fstat(fd).st_ino)
            try:
                yield root, fd, identity, config_id, leaf, layer
            finally:
                os.close(fd)

    def test_exact_layer_chain_is_held_and_workload_uses_metadata_without_following_links(self):
        with self.fixture() as (root, fd, identity, config, leaf, layer):
            with self.m.source_root(fd, identity, config, lambda: None) as source:
                held = source.leaf_fd
                self.assertEqual(os.fstat(held).st_ino, leaf.stat().st_ino)
                source.recheck()
                counts = source.workload(time.monotonic() + 2, 10)
                self.assertEqual(counts['regularFiles'], 1)
                self.assertEqual(counts['logicalRegularBytes'], 12)
                self.assertEqual(counts['symlinks'], 1)
                self.assertEqual(counts['directories'], 1)
                self.assertEqual(counts['entries'], 2)
            with self.assertRaises(OSError):
                os.fstat(held)

    def test_replaced_terminal_directory_is_not_silently_adopted(self):
        with self.fixture() as (root, fd, identity, config, leaf, layer):
            with self.m.source_root(fd, identity, config, lambda: None) as source:
                leaf.rename(leaf.with_name('old-leaf'))
                leaf.mkdir()
                with self.assertRaises(self.m.Incomplete):
                    source.recheck()

    def test_corrupt_config_parent_or_escaping_cache_identity_is_refused(self):
        for problem in ('config', 'parent', 'cache'):
            with self.subTest(problem=problem), self.fixture() as (root, fd, identity, config, leaf, layer):
                if problem == 'config':
                    (root / 'image/vfs/imagedb/content/sha256' / config[7:]).write_bytes(b'{}')
                elif problem == 'parent':
                    (layer / 'parent').write_text('sha256:' + '9' * 64)
                else:
                    (layer / 'cache-id').write_text('../../outside')
                with self.assertRaises((self.m.Incomplete, OSError)):
                    with self.m.source_root(fd, identity, config, lambda: None):
                        self.fail('Corrupt or escaping metadata was accepted')

    def test_incomplete_workload_and_symlinked_metadata_are_refused(self):
        with self.fixture() as (root, fd, identity, config, leaf, layer):
            with self.m.source_root(fd, identity, config, lambda: None) as source:
                with self.assertRaises(self.m.Incomplete):
                    source.workload(time.monotonic() - 1, 10)
                with self.assertRaises(self.m.Incomplete):
                    source.workload(time.monotonic() + 2, 1)
            db = root / 'image/vfs/imagedb/content/sha256' / config[7:]
            raw = db.read_bytes()
            db.unlink()
            (root / 'external-config').write_bytes(raw)
            db.symlink_to(root / 'external-config')
            with self.assertRaises((self.m.Incomplete, OSError)):
                with self.m.source_root(fd, identity, config, lambda: None):
                    self.fail('Symlinked config was followed')


if __name__ == '__main__':
    unittest.main()
