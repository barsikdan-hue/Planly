"""Request graph on only synthetic owned VFS roots; never a Docker operation."""
import importlib.util
import os
from pathlib import Path
import sys
import types
import unittest

import test_vfs_source

MOUNT = 'a' * 64


def load():
    path = Path(__file__).with_name('layer_binding.py')
    if not path.exists():
        return types.SimpleNamespace()
    spec = importlib.util.spec_from_file_location('layer_binding', path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


class Roles(unittest.TestCase):
    def test_optional_init_and_rw_are_distinct_phases(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'classify_roots', None)), 'Request layer graph is missing')
        baseline = {'native', 'other'}
        self.assertEqual(m.classify_roots('native', baseline, baseline)['phase'], 'NO_DESTINATION')
        self.assertEqual(m.classify_roots('native', baseline, baseline | {MOUNT + '-init'}),
                         {'phase':'NATIVE_TO_INIT', 'source':'native', 'destination':MOUNT + '-init'})
        self.assertEqual(m.classify_roots('native', baseline, baseline | {MOUNT}),
                         {'phase':'NATIVE_TO_RW', 'source':'native', 'destination':MOUNT})
        self.assertEqual(m.classify_roots('native', baseline, baseline | {MOUNT, MOUNT + '-init'}),
                         {'phase':'INIT_TO_RW', 'source':MOUNT + '-init', 'destination':MOUNT})

    def test_unrelated_extra_missing_or_unrecognized_roots_are_never_guessed(self):
        m = load()
        self.assertTrue(callable(getattr(m, 'classify_roots', None)), 'Request layer graph is missing')
        baseline = {'native', 'other'}
        for current in ({'native'}, baseline | {MOUNT, 'b' * 64}, baseline | {'../escape'},
                        baseline | {MOUNT, MOUNT + '-init', 'b' * 64}, baseline | {'unrecognized-root'}):
            with self.subTest(current=current), self.assertRaises(m.Incomplete):
                m.classify_roots('native', baseline, current)


@unittest.skipUnless(sys.platform == 'linux', 'Held owned VFS root graph is exercised in Linux CI')
class LinuxGraph(unittest.TestCase):
    def setUp(self):
        self.m = load()
        self.assertTrue(callable(getattr(self.m, 'request_layers', None)), 'Held request layer graph is missing')
        self.fixture = test_vfs_source.LinuxSource('test_exact_layer_chain_is_held_and_workload_uses_metadata_without_following_links')
        self.fixture.setUp()

    def test_native_init_and_rw_pairs_bind_only_matching_relative_regular_files(self):
        with self.fixture.fixture() as (root, fd, identity, config, leaf, layer):
            with self.fixture.m.source_root(fd, identity, config, lambda: None) as source:
                with self.m.request_layers(source, lambda: None) as graph:
                    init = root / 'vfs/dir' / (MOUNT + '-init')
                    init.mkdir()
                    (init / 'payload').write_bytes(b'twelve-bytes')
                    self.assertEqual(graph.capture()['phase'], 'NATIVE_TO_INIT')
                    first = graph.files(str(leaf / 'payload'), str(init / 'payload'))
                    self.assertEqual(first['source']['inode'], (leaf / 'payload').stat().st_ino)
                    self.assertEqual(first['destination']['inode'], (init / 'payload').stat().st_ino)
                    self.assertNotIn('path', first)
                    target = root / 'vfs/dir' / MOUNT
                    target.mkdir()
                    (target / 'payload').write_bytes(b'twelve-bytes')
                    self.assertEqual(graph.capture()['phase'], 'INIT_TO_RW')
                    graph.files(str(init / 'payload'), str(target / 'payload'))
                    with self.assertRaises(self.m.Incomplete):
                        graph.files(str(leaf / 'payload'), str(target / 'payload'))

    def test_replaced_new_root_and_released_graph_are_refused(self):
        with self.fixture.fixture() as (root, fd, identity, config, leaf, layer):
            with self.fixture.m.source_root(fd, identity, config, lambda: None) as source:
                with self.m.request_layers(source, lambda: None) as graph:
                    target = root / 'vfs/dir' / MOUNT
                    target.mkdir()
                    graph.capture()
                    target.rename(root / 'old-request-root')
                    target.mkdir()
                    with self.assertRaises(self.m.Incomplete):
                        graph.capture()
                with self.assertRaises(self.m.Incomplete):
                    graph.capture()

    def test_path_escape_unrelated_root_and_symlink_file_are_refused(self):
        with self.fixture.fixture() as (root, fd, identity, config, leaf, layer):
            with self.fixture.m.source_root(fd, identity, config, lambda: None) as source:
                with self.m.request_layers(source, lambda: None) as graph:
                    target = root / 'vfs/dir' / MOUNT
                    target.mkdir()
                    (target / 'payload').write_bytes(b'twelve-bytes')
                    (target / 'link').symlink_to('/never-follow')
                    for src, dst in [(str(leaf / '../fixture-1/payload'), str(target / 'payload')),
                                     (str(root / 'vfs/dir/fixture-0/payload'), str(target / 'payload')),
                                     (str(leaf / 'link'), str(target / 'link'))]:
                        with self.subTest(src=src), self.assertRaises((self.m.Incomplete, OSError)):
                            graph.files(src, dst)


if __name__ == '__main__':
    unittest.main()
