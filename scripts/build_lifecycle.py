#!/usr/bin/env python3
"""Project-local build ownership, crash recovery and publication (macOS/Linux)."""
import argparse
import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import selectors
import shutil
import signal
import subprocess
import sys
import time
import uuid

OWNER = 'civilization-build-v1'
LIMIT = 1024 * 1024
ID = re.compile(r'^[0-9a-f]{32}$')


def write_json(path, data):
    temp = path.with_name(path.name + '.new')
    with open(temp, 'w') as stream:
        json.dump(data, stream, indent=2)
        stream.flush()
        os.fsync(stream.fileno())
    os.replace(temp, path)


def read_json(path):
    with open(path) as stream:
        return json.load(stream)


def lock_file(path):
    return os.fdopen(os.open(path, os.O_RDWR | os.O_CREAT | os.O_NOFOLLOW, 0o600), 'r+')


def group_alive(pgid):
    if not isinstance(pgid, int) or pgid <= 1:
        return False
    try:
        os.killpg(pgid, 0)
        return True
    except ProcessLookupError:
        return False
    except PermissionError:
        return True


def tree_hash(path):
    digest = hashlib.sha256()
    for p in sorted(path.rglob('*')):
        if p.is_file():
            digest.update(str(p.relative_to(path)).encode())
            digest.update(p.read_bytes())
    return digest.hexdigest()


class Lifecycle:
    def __init__(self, root):
        self.root = Path(root).resolve()
        self.home = self.root / '.build'
        self.warnings = []
        self.cancelled = None
        self.pgid = None
        self.reader_leases = []
        if self.home.is_symlink():
            raise RuntimeError('Refusing symlink: ' + str(self.home))
        self.home.mkdir(mode=0o700, exist_ok=True)
        with self.control():
            marker = self.home / 'owner.json'
            if not marker.exists():
                if set(p.name for p in self.home.iterdir()) - {'control.lock'}:
                    raise RuntimeError('Unowned build directory: ' + str(self.home))
                write_json(marker, self.identity())
            if read_json(marker) != self.identity():
                raise RuntimeError('Build ownership mismatch: ' + str(self.home))
            for name in ('jobs', 'packages', 'logs', 'preserved', 'releases', 'symbols'):
                p = self.home / name
                if p.is_symlink():
                    raise RuntimeError('Refusing symlink: ' + str(p))
                p.mkdir(exist_ok=True)

    def identity(self):
        return {'owner': OWNER, 'root': str(self.root)}

    @contextlib.contextmanager
    def control(self):
        with lock_file(self.home / 'control.lock') as lock:
            fcntl.flock(lock, fcntl.LOCK_EX)
            yield

    def warn(self, path, error):
        message = f'WARNING: cleanup/recovery left {path}: {error}'
        self.warnings.append(message)
        print(message, file=sys.stderr, flush=True)

    def owned(self, path):
        if (path.parent not in [self.home / n for n in ('jobs', 'packages', 'logs', 'releases')]
                or not ID.fullmatch(path.name) or path.is_symlink()):
            return False
        try:
            return read_json(path / 'owner.json') == self.identity()
        except (OSError, ValueError):
            return False

    def remove(self, path):
        if not self.owned(path):
            self.warn(path, 'unrecognized ownership; preserved')
            return
        try:
            # Only an immediate UUID child of a fixed, owned directory is eligible.
            # shutil.rmtree does not follow nested symlinks.
            shutil.rmtree(path)
        except OSError as error:
            self.warn(path, error)

    def new_owned(self, parent, name=None):
        p = self.home / parent / (name or uuid.uuid4().hex)
        p.mkdir(mode=0o700)
        write_json(p / 'owner.json', self.identity())
        return p

    def recover_publication(self):
        journal = self.home / 'publication.json'
        if not journal.exists():
            return
        data = read_json(journal)
        if data.get('owner') != OWNER or data['kind'] not in ('web', 'engine'):
            raise RuntimeError('Unknown publication journal: ' + str(journal))
        dest = self.root / ('dist' if data['kind'] == 'web' else 'public/wasm')
        backup = self.home / 'preserved' / data['backup']
        if not ID.fullmatch(data['backup']) or backup.is_symlink():
            raise RuntimeError('Unsafe publication journal: ' + str(journal))
        # A crash between the two renames restores the previously working output.
        if not os.path.lexists(dest) and backup.exists():
            os.rename(backup, dest)
            print('Recovered previous output: ' + str(dest), flush=True)
        journal.unlink()

    def prune(self):
        for parent, keep in (('packages', 2), ('logs', 10)):
            entries = []
            for p in (self.home / parent).iterdir():
                if not self.owned(p):
                    self.warn(p, 'unrecognized ownership; preserved')
                    continue
                try:
                    meta = read_json(p / 'result.json')
                    entries.append((meta['completed'], meta['kind'], p))
                except (OSError, ValueError, KeyError) as error:
                    self.warn(p, error)
            # Packages: two per tool. Logs: ten across all tools, including failures.
            groups = {'all'} if parent == 'logs' else {e[1] for e in entries}
            for kind in groups:
                ranked = sorted((e for e in entries if kind == 'all' or e[1] == kind), reverse=True)
                for _, _, p in ranked[keep:]:
                    if (self.root / 'dist').is_symlink() and (self.root / 'dist').resolve() == p / 'output':
                        continue
                    with lock_file(p / 'lease.lock') as lease:
                        try:
                            fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
                        except BlockingIOError:
                            self.warn(p, 'active reader; retention deferred')
                            continue
                        self.remove(p)

    def sweep(self):
        with self.control():
            self.recover_publication()
            for p in (self.home / 'jobs').iterdir():
                if not self.owned(p):
                    self.warn(p, 'unrecognized ownership; preserved')
                    continue
                with lock_file(p / 'lease.lock') as lease:
                    try:
                        fcntl.flock(lease, fcntl.LOCK_EX | fcntl.LOCK_NB)
                    except BlockingIOError:
                        continue
                    try:
                        status = read_json(p / 'process.json') if (p / 'process.json').exists() else {}
                        if group_alive(status.get('pgid')):
                            self.warn(p, 'process group still alive; recovery deferred')
                            continue
                        self.remove(p)
                        log_meta = self.home / 'logs' / p.name / 'result.json'
                        if not p.exists() and log_meta.exists():
                            result = read_json(log_meta)
                            if result.get('status') == 'running':
                                result.update(status='abandoned; recovered next execution', completed=time.time())
                                write_json(log_meta, result)
                    except (OSError, ValueError) as error:
                        self.warn(p, error)
            self.prune()

    def snapshot(self, job):
        with self.control():
            return self._snapshot(job)

    def _snapshot(self, job):
        work = job / 'source'
        work.mkdir()
        names = subprocess.check_output(['git', 'ls-files', '--cached', '--others',
                                         '--exclude-standard', '--deduplicate', '-z'], cwd=self.root)
        files = {os.fsdecode(p) for p in names.split(b'\0') if p}
        # Local build inputs are copied privately, never included in the package.
        files.update(p.name for p in self.root.glob('.env*') if p.is_file())
        for name in sorted(files):
            rel = Path(name)
            if rel.is_absolute() or '..' in rel.parts:
                raise RuntimeError('Unsafe source path: ' + name)
            if rel.parts[0] in ('.git', '.build', 'node_modules', 'dist', 'outputs', 'work'):
                continue
            src, dst = self.root / rel, work / rel
            if not src.exists():
                continue
            if src.is_symlink() or self.root not in src.resolve().parents:
                raise RuntimeError('Source symlink requires explicit build input policy: ' + name)
            if src.is_file():
                dst.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(src, dst)
        # Vite's config loader writes node_modules/.vite-temp even with cacheDir
        # overridden. Own the directory; link only installed dependency entries.
        modules = work / 'node_modules'
        modules.mkdir()
        for dependency in (self.root / 'node_modules').iterdir():
            if dependency.name.startswith(('.vite', '.cache')):
                continue
            (modules / dependency.name).symlink_to(dependency, target_is_directory=dependency.is_dir())
        # Reuse immutable downloaded fonts; do not clear shared/download caches per build.
        fonts = self.root / '.vinext/fonts'
        if fonts.is_dir():
            shutil.copytree(fonts, work / '.vinext/fonts')
            for css in (work / '.vinext/fonts').glob('*/style.css'):
                css.write_text(css.read_text().replace(str(fonts), str(work / '.vinext/fonts')))
        return work

    def command(self, args, cwd, job, lease, log):
        if self.cancelled:
            raise RuntimeError('Build interrupted: ' + self.cancelled)
        env = os.environ.copy()
        temp = job / 'tmp'
        temp.mkdir(exist_ok=True)
        env.update(TMPDIR=str(temp), TMP=str(temp), TEMP=str(temp),
                   BUILD_TEMP_DIR=str(temp), WRANGLER_WRITE_LOGS='false',
                   WRANGLER_LOG_PATH=str(temp / 'wrangler.log'),
                   MINIFLARE_REGISTRY_PATH=str(temp / 'registry'),
                   CARGO_TARGET_DIR=str(job / 'cargo-target'),
                   PATH=str(self.root / 'node_modules/.bin') + os.pathsep + env.get('PATH', ''))

        def child_marker():
            write_json(job / 'process.json', {'pgid': os.getpid()})

        child = subprocess.Popen(args, cwd=cwd, env=env, stdout=subprocess.PIPE,
                                 stderr=subprocess.STDOUT, start_new_session=True,
                                 pass_fds=(lease.fileno(), *(p.fileno() for p in self.reader_leases)),
                                 preexec_fn=child_marker)
        self.pgid = child.pid
        deadline = None
        try:
            with selectors.DefaultSelector() as poll:
                poll.register(child.stdout, selectors.EVENT_READ)
                while poll.get_map():
                    if self.cancelled and deadline is None:
                        self.stop_group(signal.SIGTERM)
                        deadline = time.monotonic() + 5
                    if deadline is not None and time.monotonic() > deadline:
                        self.stop_group(signal.SIGKILL)
                    for key, _ in poll.select(timeout=0.1):
                        chunk = os.read(key.fileobj.fileno(), 65536)
                        if not chunk:
                            poll.unregister(key.fileobj)
                            continue
                        try:
                            sys.stdout.buffer.write(chunk)
                            sys.stdout.buffer.flush()
                        except BrokenPipeError:
                            self.cancelled = 'output pipe closed'
                        remaining = LIMIT - log.tell()
                        if remaining > 0:
                            log.write(chunk[:remaining])
                            log.flush()
                code = child.wait()
            if code or self.cancelled:
                raise RuntimeError(f'Command failed ({code}): {args[0]}')
        finally:
            self.stop_group(signal.SIGKILL)
            child.wait()
            child.stdout.close()
            self.pgid = None

    def stop_group(self, sig):
        if self.pgid:
            try:
                os.killpg(self.pgid, sig)
            except ProcessLookupError:
                pass

    def publish(self, kind, output, release, job):
        with self.control():
            self.recover_publication()
            package = self.new_owned('releases' if release else 'packages')
            os.rename(output, package / 'output')
            write_json(package / 'result.json', {'kind': kind, 'completed': time.time(),
                                                'release': release})
            # Debug/crash analysis files do not inherit the development package limit.
            symbols = [p for p in (package / 'output').rglob('*')
                       if p.is_file() and (p.suffix in ('.map', '.pdb', '.debug', '.sym')
                                           or '.dSYM' in str(p))]
            if symbols:
                for src in symbols:
                    dst = self.home / 'symbols' / package.name / src.relative_to(package / 'output')
                    dst.parent.mkdir(parents=True, exist_ok=True)
                    shutil.copy2(src, dst)
            dest = self.root / ('dist' if kind == 'web' else 'public/wasm')
            incoming = job / 'incoming'
            if kind == 'web':
                incoming.symlink_to(os.path.relpath(package / 'output', dest.parent), target_is_directory=True)
            else:
                shutil.copytree(package / 'output', incoming)
            if dest.is_symlink() and kind == 'web':
                os.replace(incoming, dest)
            else:
                backup_id = uuid.uuid4().hex
                backup = self.home / 'preserved' / backup_id
                installed = self.home / 'engine-installed.json'
                known_engine = (kind == 'engine' and dest.is_dir() and installed.exists()
                                and tree_hash(dest) == read_json(installed).get('sha256'))
                write_json(self.home / 'publication.json', {'owner': OWNER, 'kind': kind, 'backup': backup_id})
                try:
                    if os.path.lexists(dest):
                        os.rename(dest, backup)
                    os.replace(incoming, dest)
                finally:
                    self.recover_publication()
                if kind == 'engine':
                    write_json(installed, {'sha256': tree_hash(dest), 'package': package.name})
                    if known_engine and backup.exists():
                        # The installed copy was produced by this tool; the retained
                        # package/symbol policy owns its history. Keep the first,
                        # previously unclassified source output indefinitely.
                        os.rename(backup, job / 'previous-engine')
            print(f'Published {kind}: {dest}\nPackage: {package}', flush=True)
            self.prune()

    def execute(self, kind, prepare, steps, validate, release=False):
        self.sweep()
        with self.control():
            job = self.new_owned('jobs')
            lease = lock_file(job / 'lease.lock')
            fcntl.flock(lease, fcntl.LOCK_EX)
            logs = self.new_owned('logs', job.name)
            write_json(logs / 'result.json', {'kind': kind, 'completed': time.time(), 'status': 'running'})
            log_lease = lock_file(logs / 'lease.lock')
            fcntl.flock(log_lease, fcntl.LOCK_SH)
        previous = {}

        def interrupted(sig, _frame):
            self.cancelled = signal.Signals(sig).name
            self.stop_group(signal.SIGTERM)

        for sig in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
            previous[sig] = signal.signal(sig, interrupted)
        status = 'failed'
        try:
            with open(logs / 'output.log', 'wb') as log:
                work = prepare(job)
                for args in steps(work, job):
                    self.command(args, work, job, lease, log)
                output = validate(work, job)
                if self.cancelled:
                    raise RuntimeError('Build interrupted: ' + self.cancelled)
                if output is not None:
                    self.publish(kind, output, release, job)
                status = 'success'
        finally:
            self.stop_group(signal.SIGKILL)
            for sig, handler in previous.items():
                signal.signal(sig, handler)
            with self.control():
                write_json(logs / 'result.json', {'kind': kind, 'completed': time.time(),
                                                'status': self.cancelled or status,
                                                'log_limit_bytes': LIMIT})
                if (logs / 'output.log').exists() and (logs / 'output.log').stat().st_size >= LIMIT:
                    print(f'WARNING: log capped at 1 MiB: {logs / "output.log"}', file=sys.stderr)
                self.remove(job)
                lease.close()
                log_lease.close()
                self.prune()


def build(root, kind, release=False):
    lifecycle = Lifecycle(root)

    def steps(work, job):
        if kind == 'web':
            return [['node', str(root / 'node_modules/vinext/dist/cli.js'), 'build'],
                    ['node', '--test', 'tests/rendered-html.test.mjs']]
        return [['cargo', 'build', '--locked', '--manifest-path', 'engine/Cargo.toml',
                 '--target', 'wasm32-unknown-unknown', '--release'],
                ['wasm-bindgen', str(job / 'cargo-target/wasm32-unknown-unknown/release/civilization_simulator_engine.wasm'),
                 '--out-dir', 'public/wasm', '--target', 'web'],
                ['node', '--test', '--test-name-pattern=ships the full|compiled Rust', 'tests/rendered-html.test.mjs']]

    def validate(work, _job):
        output = work / ('dist' if kind == 'web' else 'public/wasm')
        required = ['server/index.js', 'server/wrangler.json', '.openai/hosting.json',
                    'client/wasm/civilization_simulator_engine_bg.wasm'] if kind == 'web' else [
                        'civilization_simulator_engine.js', 'civilization_simulator_engine_bg.wasm', 'engine-loader.js']
        for name in required:
            if not (output / name).is_file() or not (output / name).stat().st_size:
                raise RuntimeError('Missing build output: ' + str(output / name))
        return output

    lifecycle.execute(kind, lifecycle.snapshot, steps, validate, release)


def serve(root):
    lifecycle = Lifecycle(root)
    package_lease = None
    with lifecycle.control():
        lifecycle.recover_publication()
        output = (root / 'dist').resolve(strict=True)
        package = output.parent
        if lifecycle.owned(package):
            package_lease = lock_file(package / 'lease.lock')
            fcntl.flock(package_lease, fcntl.LOCK_SH)
            lifecycle.reader_leases.append(package_lease)

    def prepare(job):
        work = lifecycle.snapshot(job)
        (work / 'dist').symlink_to(output, target_is_directory=True)
        return work

    try:
        lifecycle.execute('start', prepare,
                          lambda _work, _job: [['node', str(root / 'node_modules/vinext/dist/cli.js'), 'start']],
                          lambda _work, _job: None)
    finally:
        if package_lease:
            package_lease.close()
        lifecycle.sweep()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('mode', choices=['web', 'engine', 'clean', 'start'])
    parser.add_argument('--release', action='store_true')
    args = parser.parse_args()
    root = Path(__file__).resolve().parent.parent
    if args.mode == 'start':
        serve(root)
        return 0
    if args.mode == 'clean':
        lifecycle = Lifecycle(root)
        lifecycle.sweep()
        return 1 if lifecycle.warnings else 0
    build(root, args.mode, args.release)
    return 0


if __name__ == '__main__':
    try:
        sys.exit(main())
    except (OSError, RuntimeError, ValueError) as error:
        print(f'ERROR: {error}', file=sys.stderr)
        sys.exit(1)
