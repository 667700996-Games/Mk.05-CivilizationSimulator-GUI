"""Small subprocess fixtures exercise destructive lifecycle paths without compiling."""
import fcntl
import importlib.util
import json
import os
from pathlib import Path
import signal
import subprocess
import sys
import tempfile
import time
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[1] / 'scripts/build_lifecycle.py'
spec = importlib.util.spec_from_file_location('build_lifecycle', SCRIPT)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

FIXTURE = r'''
import sys,time
from pathlib import Path
sys.path.insert(0, sys.argv[1])
from build_lifecycle import Lifecycle
root=Path(sys.argv[2]); mode=sys.argv[3]
life=Lifecycle(root)
def prepare(job):
    work=job/'source'; work.mkdir(); return work
def steps(work,job):
    code="from pathlib import Path; import time,sys; Path('output').mkdir(); Path('output/value').write_text('new'); Path('output/code.map').write_text('debug'); "
    if mode=='ignore': code+="import signal; signal.signal(signal.SIGTERM,signal.SIG_IGN); "
    if mode in ('wait','ignore'): code+="Path('ready').write_text('ready'); time.sleep(60); "
    if mode=='loud': code+="sys.stdout.write('x'*1500000); "
    if mode=='fail': code+="sys.exit(2); "
    return [[sys.executable,'-c',code]]
life.execute('web',prepare,steps,lambda work,job: work/'output',release=mode=='release')
'''


class LifecycleTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix='civilization-cleanup-test-')
        self.root = Path(self.temp.name)
        (self.root / 'dist').mkdir()
        (self.root / 'dist/value').write_text('original')
        self.life = module.Lifecycle(self.root)
        self.children = []

    def tearDown(self):
        for child in self.children:
            if child.poll() is None:
                child.kill()
            child.wait()
        for p in (self.life.home / 'jobs').glob('*/process.json'):
            pgid = json.loads(p.read_text())['pgid']
            try:
                os.killpg(pgid, signal.SIGKILL)
            except ProcessLookupError:
                pass
        self.temp.cleanup()

    def launch(self, mode):
        child = subprocess.Popen([sys.executable, '-B', '-c', FIXTURE,
                                  str(SCRIPT.parent), str(self.root), mode],
                                 stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
        self.children.append(child)
        return child

    def run_fixture(self, mode='success'):
        return self.launch(mode).wait(timeout=10)

    def ready(self, count=1):
        end = time.monotonic() + 5
        while time.monotonic() < end:
            ready = list((self.life.home / 'jobs').glob('*/source/ready'))
            if len(ready) == count:
                return [p.parent.parent for p in ready]
            time.sleep(0.02)
        self.fail('fixture did not become ready')

    def test_success_and_failure_preserve_previous_output(self):
        self.assertNotEqual(self.run_fixture('fail'), 0)
        self.assertEqual((self.root / 'dist/value').read_text(), 'original')
        self.assertFalse(list((self.life.home / 'jobs').iterdir()))
        self.assertEqual(self.run_fixture(), 0)
        published = (self.root / 'dist').resolve()
        self.assertEqual((published / 'value').read_text(), 'new')
        self.assertEqual(len(list((self.life.home / 'preserved').iterdir())), 1)
        self.assertNotEqual(self.run_fixture('fail'), 0)
        self.assertEqual((self.root / 'dist').resolve(), published)

    def test_signal_cleanup(self):
        for sig in (signal.SIGTERM, signal.SIGINT, signal.SIGHUP):
            with self.subTest(signal=sig):
                child = self.launch('wait')
                self.ready()
                child.send_signal(sig)
                self.assertNotEqual(child.wait(timeout=10), 0)
                self.assertFalse(list((self.life.home / 'jobs').iterdir()))
                self.assertEqual((self.root / 'dist/value').read_text(), 'original')

    def test_force_kill_recovers_only_after_child_exits(self):
        child = self.launch('wait')
        job = self.ready()[0]
        pgid = module.read_json(job / 'process.json')['pgid']
        child.kill()
        child.wait(timeout=5)
        self.life.sweep()
        self.assertTrue(job.exists(), 'orphaned build still holds lease')
        os.killpg(pgid, signal.SIGKILL)
        end = time.monotonic() + 5
        while module.group_alive(pgid) and time.monotonic() < end:
            time.sleep(0.02)
        self.life.sweep()
        self.assertFalse(job.exists())
        self.assertEqual((self.root / 'dist/value').read_text(), 'original')

    def test_uncooperative_child_is_killed_after_grace_period(self):
        child = self.launch('ignore')
        self.ready()
        child.terminate()
        self.assertNotEqual(child.wait(timeout=10), 0)
        self.assertFalse(list((self.life.home / 'jobs').iterdir()))

    def test_concurrent_workspaces_are_protected(self):
        first, second = self.launch('wait'), self.launch('wait')
        jobs = self.ready(2)
        self.life.sweep()
        self.assertTrue(all(p.exists() for p in jobs))
        first.terminate()
        first.wait(timeout=10)
        self.assertEqual(len(list((self.life.home / 'jobs').iterdir())), 1)
        second.terminate()
        second.wait(timeout=10)
        self.assertFalse(list((self.life.home / 'jobs').iterdir()))

    def test_retention_logs_releases_and_symbols(self):
        self.assertEqual(self.run_fixture('release'), 0)
        release = list((self.life.home / 'releases').iterdir())[0]
        for _ in range(12):
            self.assertEqual(self.run_fixture('loud'), 0)
        self.assertEqual(len(list((self.life.home / 'packages').iterdir())), 2)
        logs = list((self.life.home / 'logs').glob('*/output.log'))
        self.assertEqual(len(logs), 10)
        self.assertTrue(all(p.stat().st_size == module.LIMIT for p in logs))
        self.assertTrue(release.exists())
        self.assertEqual(len(list((self.life.home / 'symbols').iterdir())), 13)
        self.assertFalse(list((self.life.home / 'jobs').iterdir()))

    def test_active_package_reader_defers_retention(self):
        self.assertEqual(self.run_fixture(), 0)
        old = (self.root / 'dist').resolve().parent
        with module.lock_file(old / 'lease.lock') as lease:
            fcntl.flock(lease, fcntl.LOCK_SH)
            self.assertEqual(self.run_fixture(), 0)
            self.assertEqual(self.run_fixture(), 0)
            self.assertTrue(old.exists())
        self.life.sweep()
        self.assertFalse(old.exists())

    def test_crash_between_publication_renames_restores_output(self):
        backup_id = 'a' * 32
        os.rename(self.root / 'dist', self.life.home / 'preserved' / backup_id)
        module.write_json(self.life.home / 'publication.json',
                          {'owner': module.OWNER, 'kind': 'web', 'backup': backup_id})
        self.life.sweep()
        self.assertEqual((self.root / 'dist/value').read_text(), 'original')

    def test_publication_io_failure_restores_previous_output(self):
        job = self.life.new_owned('jobs')
        output = job / 'output'
        output.mkdir()
        (output / 'value').write_text('new')
        replace = os.replace

        def fail_incoming(src, dst):
            if Path(src).name == 'incoming':
                raise OSError('simulated publication failure')
            return replace(src, dst)

        with patch.object(module.os, 'replace', side_effect=fail_incoming):
            with self.assertRaises(OSError):
                self.life.publish('web', output, False, job)
        self.assertEqual((self.root / 'dist/value').read_text(), 'original')

    def test_engine_external_edits_are_preserved(self):
        destination = self.root / 'public/wasm'
        destination.mkdir(parents=True)
        (destination / 'engine.wasm').write_bytes(b'authored')
        module.write_json(self.life.home / 'engine-installed.json', {'sha256': 'different'})
        job = self.life.new_owned('jobs')
        output = job / 'output'
        output.mkdir()
        (output / 'engine.wasm').write_bytes(b'new')
        self.life.publish('engine', output, False, job)
        backup = next((self.life.home / 'preserved').iterdir())
        self.assertEqual((backup / 'engine.wasm').read_bytes(), b'authored')

    def test_unowned_and_symlink_paths_preserved(self):
        unowned = self.life.home / 'jobs' / ('b' * 32)
        unowned.mkdir()
        external = self.root / 'valuable'
        external.mkdir()
        (external / 'save').write_text('save')
        link = self.life.home / 'jobs' / ('c' * 32)
        link.symlink_to(external, target_is_directory=True)
        owned = self.life.new_owned('jobs')
        (owned / 'nested-link').symlink_to(external, target_is_directory=True)
        self.life.sweep()
        self.assertTrue(unowned.exists())
        self.assertTrue(link.is_symlink())
        self.assertFalse(owned.exists())
        self.assertEqual((external / 'save').read_text(), 'save')
        self.assertTrue(self.life.warnings)

    def test_cleanup_failure_warns_with_remaining_path(self):
        job = self.life.new_owned('jobs')
        (job / 'source').mkdir()
        with patch.object(module.shutil, 'rmtree', side_effect=PermissionError('denied')):
            self.life.sweep()
        self.assertTrue(job.exists())
        self.assertTrue(self.life.owned(job), 'failed deletion must keep ownership for recovery')
        self.assertIn(str(job), self.life.warnings[-1])

    def test_engine_install_does_not_accumulate_known_backups(self):
        destination = self.root / 'public/wasm'
        destination.mkdir(parents=True)
        (destination / 'engine.wasm').write_bytes(b'original')
        for i in range(4):
            job = self.life.new_owned('jobs')
            output = job / 'output'
            output.mkdir()
            (output / 'engine.wasm').write_bytes(str(i).encode())
            self.life.publish('engine', output, False, job)
            self.life.remove(job)
        self.assertEqual((destination / 'engine.wasm').read_bytes(), b'3')
        self.assertEqual(len(list((self.life.home / 'preserved').iterdir())), 1)
        self.assertEqual(len(list((self.life.home / 'packages').iterdir())), 2)


if __name__ == '__main__':
    unittest.main()
