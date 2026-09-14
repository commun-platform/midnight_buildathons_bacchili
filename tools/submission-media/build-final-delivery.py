#!/usr/bin/env python3
"""Package explicitly selected review media; never traverse private working directories."""
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import subprocess
import tempfile
import zipfile

ROOT = Path(__file__).resolve().parents[2]
OUTPUT = ROOT / '.demo-output/final-delivery-20260911'
ARCHIVE = 'bacchiri-review-package-20260911.zip'


def artifacts():
    members = []

    def add(source, edition):
        members.append((source, f'{edition}/{Path(source).name}', edition))

    for locale in ['en', 'ja']:
        docs = 'docs/submission' if locale == 'en' else 'docs/ja/submission'
        base = f'{docs}/deck/bacchiri-verifiable-measurement-layer-wave1-{locale}'
        for suffix in ['.pptx', '.pdf']:
            add(base + suffix, f'01-historical/{locale}')
            add(base + '-cloudflare-operations' + suffix, f'02-cloudflare-operations/{locale}')
            add(f'{docs}/deck/bacchiri-new-gui-{locale}-preview{suffix}', f'03-new-gui-PREVIEW/{locale}')
        operations = '.demo-output/cloudflare-operations-20260910'
        for name in [f'bacchiri-demo-pitch-{locale}-cloudflare-operations.mp4',
                     f'cloudflare-operations-{locale}.mp4', f'cloudflare-operations-{locale}.srt']:
            add(f'{operations}/{name}', f'02-cloudflare-operations/{locale}')
        assets = 'docs/assets/review' if locale == 'en' else 'docs/ja/assets/review'
        for name in ['cloudflare-operations-architecture', 'cloudflare-wallet-lifecycle']:
            add(f'{assets}/{name}-{locale}.png', f'02-cloudflare-operations/{locale}')
        preview = f'.demo-output/gui-finalization-20260910/{locale}'
        for name in [f'bacchiri-new-gui-{locale}-preview.mp4', f'bacchiri-new-gui-{locale}-preview.srt',
                     'narration.md', 'edit-manifest.json']:
            add(f'{preview}/{name}', f'03-new-gui-PREVIEW/{locale}')
    add('.demo-output/submission-en-20260831/bacchiri-demo-pitch-en.mp4', '01-historical/en')
    add('.demo-output/submission-en-20260831/subtitles.srt', '01-historical/en')
    add('docs/submission/captures/submission-thumbnail-en.png', '01-historical/en')
    return members


def safe_source(root, relative):
    path = PurePosixPath(relative)
    if path.is_absolute() or '..' in path.parts:
        raise ValueError(f'Unsafe source path: {relative}')
    current = root
    for part in path.parts:
        current = current / part
        if current.is_symlink():
            raise ValueError(f'Symlink is not a reviewed artifact: {relative}')
    if not current.is_file():
        raise ValueError(f'Missing required artifact: {relative}')
    return current


def sha256(stream):
    digest = hashlib.sha256()
    for chunk in iter(lambda: stream.read(1024 * 1024), b''):
        digest.update(chunk)
    return digest.hexdigest()


def build_package(root, members, output, revision, dirty):
    files = []
    names = set()
    for source, name, edition in members:
        path = PurePosixPath(name)
        if path.is_absolute() or '..' in path.parts or name in names:
            raise ValueError(f'Unsafe or duplicate archive name: {name}')
        names.add(name)
        file = safe_source(root, source)
        with file.open('rb') as stream:
            checksum = sha256(stream)
        files.append({'path': name, 'source': source, 'edition': edition,
                      'bytes': file.stat().st_size, 'sha256': checksum})
    manifest = {'schemaVersion': 1, 'edition': 'review-20260911', 'sourceRevision': revision,
                'workingTreeDirty': dirty, 'sourceCodeIncluded': False,
                'newGuiStatus': 'preview; five owner recordings pending', 'files': files}
    readme = '''# BACCHIRI review package / レビュー用成果物

This local handoff contains selected media, not a frozen source release or a completed public submission.
版別のメディアをまとめたローカルレビュー用一式です。最終ソースリリース・公開提出の完了を意味しません。

- `01-historical/en`: completed 9-slide pitch and 2:18 recorded English GUI video.
- `01-historical/ja`: 12-slide Japanese technical reference, with a different structure.
- `02-cloudflare-operations`: completed extended editions; EN 11 slides / 3:20 video, JA 14 slides / 4:16 video.
- `03-new-gui-PREVIEW`: bilingual 11-slide previews, narration and captions. **G01–G05 still require recordings.**

新GUI版は日英とも11枚のプレビューです。G01〜G05は録画待ちで、操作・確定の実写証拠ではありません。
Cloudflare運用説明追加版は完成済みですが、過去のGUI録画と実機構成の説明図を組み合わせた版です。

Raw Device measurements and keys remain local; authorized summaries and private proof inputs reach the trusted Backend.
生の実測列とDevice鍵は実機内に保持します。認可済み集計と証明入力はtrusted Backendへ渡り、第三者には公開しません。
02:00 JST is processing start, not a guaranteed confirmation time. Sensor truth and measurement completeness are outside the proof claim.
午前2時は処理開始です。確定時刻、センサーの真正性、計測の完全性を保証しません。

September 11 validation: 525 source tests, 13 media tests, type checks, and Worker-only dry-runs passed.
The full Container build gate remains incomplete because Docker could not be launched in this WSL environment.
9月11日の検証ではソース525テスト・メディア13テスト・型検査・Worker部分のdry-runが成功しました。
Dockerを起動できず、Containerを含む完全な配備パッケージ検証は未完了です。

Source documents: `docs/submission/final_delivery.md` and `docs/ja/submission/final_delivery.md` in the accompanying repository worktree.
現行実装、GUI結合テスト、ファームウェア、残作業の詳細は、元リポジトリの上記文書を参照してください。
Firmware is a separate operational archive. Source code, wallet state, raw recordings and Device data are not included here.
ファームウェアは別配布です。このZIPにはソースコード、Wallet状態、未編集録画、実機データを含めていません。

The manifest records the source revision and whether it had local changes; it does not claim those changes are committed.
`manifest.json`は基点Commitと差分の有無を記録します。未コミット変更をCommit済みとは扱いません。
`SHA256SUMS` covers every listed media file plus this README and the manifest. It does not authenticate authorship.

## Files / ファイル

| Edition / 版 | File / ファイル |
| --- | --- |
'''
    readme += ''.join(f'| {item["edition"]} | [{Path(item["path"]).name}]({item["path"]}) |\n' for item in files)
    generated = {'README.md': readme.encode(),
                 'manifest.json': (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode()}
    checksums = {item['path']: item['sha256'] for item in files}
    checksums.update({name: hashlib.sha256(data).hexdigest() for name, data in generated.items()})
    generated['SHA256SUMS'] = ''.join(f'{value}  {name}\n' for name, value in sorted(checksums.items())).encode()
    output.mkdir(parents=True, exist_ok=True)
    descriptor, temporary = tempfile.mkstemp(prefix='.review-', suffix='.zip', dir=output)
    os.close(descriptor)
    try:
        with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_STORED) as archive:
            for item in files:
                archive.write(safe_source(root, item['source']), item['path'])
            for name, data in generated.items():
                archive.writestr(name, data)
        with zipfile.ZipFile(temporary) as archive:
            if set(archive.namelist()) != names | set(generated):
                raise ValueError('Unexpected archive member')
            for name, expected in checksums.items():
                with archive.open(name) as stream:
                    if sha256(stream) != expected:
                        raise ValueError(f'Artifact changed during packaging: {name}')
        os.replace(temporary, output / ARCHIVE)
    finally:
        Path(temporary).unlink(missing_ok=True)
    with (output / ARCHIVE).open('rb') as stream:
        archive_hash = sha256(stream)
    (output / 'SHA256SUMS').write_text(f'{archive_hash}  {ARCHIVE}\n')
    (output / 'manifest.json').write_bytes(generated['manifest.json'])
    return manifest


if __name__ == '__main__':
    def git(*args):
        return subprocess.check_output(['git', '-C', str(ROOT), *args], text=True).strip()

    result = build_package(ROOT, artifacts(), OUTPUT, git('rev-parse', 'HEAD'),
                           bool(git('status', '--porcelain')))
    print(json.dumps({'archive': str((OUTPUT / ARCHIVE).relative_to(ROOT)),
                      'reviewedMediaFiles': len(result['files']), 'workingTreeDirty': result['workingTreeDirty']}))
