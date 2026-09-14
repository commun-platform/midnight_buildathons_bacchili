#!/usr/bin/env python3
"""Build a synchronized pitch and demo; final mode requires reviewed new recordings."""
import argparse
import concurrent.futures
import datetime
import importlib.util
import json
import math
import os
from pathlib import Path
import re
import subprocess
import sys
import time

ROOT = Path(__file__).resolve().parents[2]
STORY_PATH = ROOT / 'tools/submission-media/gui-finalization-story.json'
STORY = json.loads(STORY_PATH.read_text())
EXAMPLE = ROOT / 'tools/submission-media/gui-recordings.example.json'
helper_spec = importlib.util.spec_from_file_location('operations_media', Path(__file__).with_name('build-cloudflare-operations-video.py'))
media = importlib.util.module_from_spec(helper_spec)
helper_spec.loader.exec_module(media)


def run(command, **kwargs):
    subprocess.run([str(value) for value in command], check=True, **kwargs)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def numeric(value):
    return isinstance(value, (int, float)) and not isinstance(value, bool) and math.isfinite(value)


def parse_date(value, field):
    require(nonempty(value), f'Missing {field}')
    try:
        parsed = datetime.datetime.fromisoformat(value.replace('Z', '+00:00'))
    except ValueError as error:
        raise ValueError(f'Invalid {field}: use an ISO date and time with timezone') from error
    require(parsed.tzinfo is not None, f'{field} requires a timezone')
    return parsed


def validate_manifest(manifest, base, mode, probe=media.probe):
    require(manifest.get('schemaVersion') == 1, 'Unsupported recording manifest schema')
    require(manifest.get('network') == STORY['network'], 'Recording network must be Midnight Preprod')
    require(manifest.get('measurementSource') == 'browser-synthetic', 'This narration requires a controlled browser-synthetic demonstration')
    evidence = manifest.get('evidence', {})
    if mode == 'final':
        for field in ['deviceId', 'periodDate', 'policyId', 'contractAddress', 'proofJobId', 'transactionHash', 'reviewer']:
            require(nonempty(evidence.get(field)), f'Final output requires evidence.{field}')
        require(bool(re.fullmatch(r'\d{4}-\d{2}-\d{2}', evidence['periodDate'])), 'periodDate must be YYYY-MM-DD')
        datetime.date.fromisoformat(evidence['periodDate'])
        require(bool(re.fullmatch(r'[0-9a-fA-F]{64}', evidence['transactionHash'])), 'Use the full transaction hash without 0x')
        require(bool(re.fullmatch(r'[0-9a-fA-F]{64}', evidence['contractAddress'])), 'Use the full contract address without 0x')
        require(evidence.get('transactionStatus') == 'confirmed', 'Final output requires confirmed transaction evidence')
        verification = evidence.get('publicVerification', {})
        require(verification.get('verified') is True, 'Final output requires a reviewed public verification result')
        parse_date(verification.get('checkedAt'), 'publicVerification.checkedAt')
        require(nonempty(verification.get('reference')), 'Store a public-verification report and reference its file')
        require((base / verification['reference']).resolve().is_file(), 'Public-verification report file is missing')
    fields = {
        'G01': ['deviceId', 'policyId'],
        'G02': ['deviceId', 'periodDate'],
        'G03': ['deviceId', 'periodDate', 'proofJobId'],
        'G04': ['deviceId', 'periodDate', 'proofJobId', 'transactionHash', 'transactionStatus'],
        'G05': ['periodDate', 'policyId', 'contractAddress', 'transactionHash', 'transactionStatus'],
    }
    resolved = {}
    for scene in STORY['scenes']:
        if not scene.get('shot'):
            continue
        shot_id = scene['shot']
        shot = manifest.get('shots', {}).get(shot_id, {})
        if not shot.get('file'):
            require(mode == 'preview', f'Missing recording: {shot_id}')
            continue
        require(shot.get('reviewed') is True and shot.get('containsNoSecrets') is True,
                f'{shot_id}: review the footage and exclude secrets before rendering')
        require(shot.get('guiLanguage') in ['en', 'ja'], f'{shot_id}: specify GUI language en or ja')
        parse_date(shot.get('recordedAt'), f'{shot_id}.recordedAt')
        for field in fields[shot_id]:
            require(nonempty(shot.get(field)) and shot[field] == evidence.get(field), f'{shot_id}: {field} does not match the common evidence')
        if shot_id == 'G05':
            require(shot.get('publicVerificationVisible') is True, 'G05 must visibly show successful public record comparison')
        file = (base / shot['file']).resolve()
        require(file.is_file(), f'Missing recording file for {shot_id}: {file}')
        require(all(numeric(shot.get(field)) for field in ['in', 'out', 'stillAt']), f'{shot_id}: specify numeric in/out/stillAt seconds')
        metadata = probe(file)
        streams = [stream for stream in metadata['streams'] if stream.get('codec_type') == 'video']
        require(bool(streams), f'{shot_id}: file has no video stream')
        require(streams[0]['width'] >= 1280 and streams[0]['height'] >= 720, f'{shot_id}: use at least 1280 by 720 for readable evidence')
        length = float(metadata['format']['duration'])
        require(0 <= shot['in'] < shot['out'] <= length + 0.05, f'{shot_id}: cut lies outside the recording')
        require(shot['in'] <= shot['stillAt'] < shot['out'], f'{shot_id}: deck still must come from the selected video cut')
        resolved[scene['id']] = {**shot, 'path': file, 'sourceDuration': length}
    if mode == 'final':
        require(len(resolved) == 5, 'Final output requires all five GUI recordings')
        requested = parse_date(resolved['request']['recordedAt'], 'G03.recordedAt')
        confirmed = parse_date(resolved['confirmed']['recordedAt'], 'G04.recordedAt')
        require(confirmed >= requested, 'Confirmation recording predates the request recording')
    return resolved


def generate_audio(scene, locale, output, python, reuse):
    spec = scene[locale]
    voice = STORY['locales'][locale]['voice']
    rate = '+0%'
    stem = output / scene['id']
    audio, captions, text_file, cache = [stem.with_suffix(suffix) for suffix in ['.mp3', '.srt', '.txt', '.json']]
    expected = {'text': spec['narration'], 'voice': voice, 'rate': rate}
    cached = cache.is_file() and json.loads(cache.read_text()) == expected and all(file.is_file() for file in [audio, captions, text_file]) and text_file.read_text().strip() == spec['narration']
    require(not reuse or cached, f'No matching reusable narration for {locale}/{scene["id"]}')
    if not cached:
        text_file.write_text(spec['narration'] + '\n')
        for attempt in range(3):
            try:
                run([python, '-m', 'edge_tts', '--file', text_file, '--voice', voice, f'--rate={rate}', '--write-media', audio, '--write-subtitles', captions], stdout=subprocess.DEVNULL)
                break
            except subprocess.CalledProcessError:
                if attempt == 2:
                    raise
                time.sleep(1 + attempt)
        cache.write_text(json.dumps(expected, ensure_ascii=False, indent=2) + '\n')
    length = math.ceil((media.duration(audio) + 0.8) * 30) / 30
    cues = media.read_captions(captions)
    normalized = lambda text: re.sub(r'\s+', '', text)
    require(normalized(''.join(cue[2] for cue in cues)) == normalized(spec['narration']), f'Caption text differs from narration: {scene["id"]}')
    adjusted = []
    for index, (start, end, text) in enumerate(cues):
        end = min(end, cues[index + 1][0]) if index + 1 < len(cues) else end
        require(0 <= start < end <= length, f'Invalid subtitle timing: {scene["id"]}')
        lines = media.caption_lines(text, locale).splitlines()
        groups = ['\n'.join(lines[offset:offset + 2]) for offset in range(0, len(lines), 2)]
        total_chars = sum(len(group) for group in groups)
        position = start
        for group_index, group in enumerate(groups):
            next_position = end if group_index == len(groups) - 1 else position + (end - start) * len(group) / total_chars
            adjusted.append((position, next_position, group))
            position = next_position
    print(json.dumps({'audio': f'{locale}/{scene["id"]}', 'seconds': length, 'cached': cached}), flush=True)
    return {'audio': audio, 'duration': length, 'cues': adjusted, 'voice': voice}


def build(args):
    manifest_file = args.manifest.resolve()
    manifest = json.loads(manifest_file.read_text())
    shots = validate_manifest(manifest, manifest_file.parent, args.mode)
    if args.validate_only:
        print(json.dumps({'valid': True, 'mode': args.mode, 'recordedShots': len(shots)}))
        return
    output = args.output_dir.resolve() / args.locale
    output.mkdir(parents=True, exist_ok=True)
    narration = output / 'narration'
    narration.mkdir(exist_ok=True)
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        futures = {scene['id']: pool.submit(generate_audio, scene, args.locale, narration, args.tts_python, args.reuse_audio) for scene in STORY['scenes']}
        audio = {key: future.result() for key, future in futures.items()}
    if args.audio_only:
        print(json.dumps({'locale': args.locale, 'narrationSeconds': sum(item['duration'] for item in audio.values())}))
        return
    stills = output / 'stills'
    stills.mkdir(exist_ok=True)
    frame_map = {}
    for scene_id, shot in shots.items():
        still = stills / f'{scene_id}.png'
        run(['ffmpeg', '-y', '-v', 'error', '-ss', shot['stillAt'], '-i', shot['path'], '-frames:v', '1', '-update', '1', still])
        frame_map[scene_id] = str(still)
    (output / 'frames.json').write_text(json.dumps(frame_map, indent=2) + '\n')
    slides = output / 'slides'
    run(['node', ROOT / 'tools/submission-media/render-gui-finalization-deck.cjs', args.locale, '--mode', args.mode, '--output-dir', slides, '--frames', output / 'frames.json'])
    rendered = json.loads((slides / 'slides.json').read_text())
    work = output / 'segments'
    work.mkdir(exist_ok=True)
    records, joined_cues, offset = [], [], 0.0
    encode = ['-r', '30', '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-threads', '2', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k', '-ar', '48000', '-ac', '1', '-movflags', '+faststart']
    for scene, slide in zip(STORY['scenes'], rendered):
        scene_id = scene['id']
        item = audio[scene_id]
        shot = shots.get(scene_id)
        # Play the entire selected cut at its original speed, then hold the final
        # frame if the narration is longer. Holding a still adds no state change.
        cut_length = shot['out'] - shot['in'] if shot else 0
        length = math.ceil(max(item['duration'], cut_length) * 30) / 30
        ass = work / f'{scene_id}.ass'
        media.write_ass(ass, item['cues'], 'Noto Sans CJK JP' if args.locale == 'ja' else 'DejaVu Sans')
        ass.write_text(ass.read_text().replace(',96,96,20,1', ',96,96,65,1'))
        command = ['ffmpeg', '-y', '-v', 'error', '-loop', '1', '-framerate', '30', '-i', slides / slide['videoImage']]
        filters = '[0:v]setsar=1[base];'
        voice_index = 1
        if shot:
            command += ['-ss', shot['in'], '-t', cut_length, '-i', shot['path']]
            box = slide['videoGuiBox']
            filters += (f'[1:v]setpts=PTS-STARTPTS,fps=30,scale={box["w"]}:{box["h"]}:force_original_aspect_ratio=decrease:flags=lanczos,'
                        f'pad={box["w"]}:{box["h"]}:(ow-iw)/2:(oh-ih)/2:color=0x06111f,setsar=1,'
                        f'tpad=stop_mode=clone:stop_duration={length}[clip];'
                        f'[base][clip]overlay={box["x"]}:{box["y"]}:shortest=1[visual];')
            voice_index = 2
        else:
            filters += '[base]null[visual];'
        command += ['-i', item['audio']]
        filters += (f'[visual]ass={ass.name},fade=t=in:st=0:d=0.2,fade=t=out:st={length - 0.2}:d=0.2[v];'
                    f'[{voice_index}:a]loudnorm=I=-17:TP=-1.5:LRA=8,aresample=48000,apad,atrim=duration={length},asetpts=PTS-STARTPTS[a]')
        destination = work / f'{scene_id}.mp4'
        if not args.skip_video:
            run([*command, '-filter_complex', filters, '-map', '[v]', '-map', '[a]', '-t', length, *encode, destination], cwd=work)
        joined_cues.extend((start + offset, end + offset, text) for start, end, text in item['cues'])
        record = {'id': scene_id, 'shot': scene.get('shot'), 'start': offset, 'duration': length, 'narration': scene[args.locale]['narration'], 'voice': item['voice'], 'audioSha256': media.sha256(item['audio']), 'placeholder': bool(scene.get('shot') and not shot)}
        if shot:
            record['source'] = {'file': os.path.relpath(shot['path'], ROOT), 'sha256': media.sha256(shot['path']), 'in': shot['in'], 'out': shot['out'], 'stillAt': shot['stillAt'], 'recordedAt': shot['recordedAt'], 'guiLanguage': shot['guiLanguage'], 'heldFrameSeconds': max(0, length - cut_length)}
        records.append(record)
        offset += length
        print(json.dumps({'rendered': f'{args.locale}/{scene_id}', 'seconds': length, 'placeholder': record['placeholder']}), flush=True)
    stem = f'bacchiri-new-gui-{args.locale}-{args.mode}'
    media.write_captions(output / f'{stem}.srt', joined_cues)
    (output / 'narration.md').write_text('# Narration and edit timing\n\n' + '\n\n'.join(f'## {index + 1:02} {record["id"]} — {record["start"]:.3f}s / {record["duration"]:.3f}s\n\n{record["narration"]}' for index, record in enumerate(records)) + '\n')
    video = output / f'{stem}.mp4'
    if not args.skip_video:
        command = ['ffmpeg', '-y', '-v', 'error']
        for record in records:
            command += ['-i', work / f'{record["id"]}.mp4']
        inputs = ''.join(f'[{index}:v][{index}:a]' for index in range(len(records)))
        run([*command, '-filter_complex', f'{inputs}concat=n={len(records)}:v=1:a=1[v][a]', '-map', '[v]', '-map', '[a]', *encode, video])
        metadata = media.probe(video)
        require([stream['codec_name'] for stream in metadata['streams']] == ['h264', 'aac'], 'Unexpected final video codecs')
        require(abs(float(metadata['format']['duration']) - offset) < 0.2, 'Export timing drift exceeds 200ms')
        run(['ffmpeg', '-v', 'error', '-i', video, '-f', 'null', '-'])
    artifacts = [slides / f'{stem}.pptx', slides / f'{stem}.pdf', output / f'{stem}.srt']
    if not args.skip_video:
        artifacts.append(video)
    report = {
        'edition': STORY['edition'], 'locale': args.locale, 'mode': args.mode,
        'finalFootageValidated': args.mode == 'final', 'duration': offset, 'sceneCount': len(records),
        'missingShots': [record['shot'] for record in records if record['placeholder']],
        'storySha256': media.sha256(STORY_PATH), 'recordingsManifestSha256': media.sha256(manifest_file),
        'evidence': manifest['evidence'] if args.mode == 'final' else None,
        'verificationScope': 'Recording metadata and referenced human review; this builder does not independently query Midnight.',
        'scenes': records,
        'artifacts': [{'file': os.path.relpath(file, ROOT), 'sha256': media.sha256(file)} for file in artifacts],
    }
    (output / 'edit-manifest.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n')
    (output / 'SHA256SUMS').write_text(''.join(f'{media.sha256(file)}  {os.path.relpath(file, output)}\n' for file in artifacts))
    print(json.dumps({'complete': True, 'locale': args.locale, 'mode': args.mode, 'seconds': offset, 'output': os.path.relpath(output, ROOT)}), flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('locale', choices=['en', 'ja'])
    parser.add_argument('--mode', choices=['preview', 'final'], default='preview')
    parser.add_argument('--manifest', type=Path, default=EXAMPLE)
    parser.add_argument('--output-dir', type=Path, default=ROOT / '.demo-output/gui-finalization-20260910')
    parser.add_argument('--tts-python', type=Path, default=ROOT / '.demo-output/submission-en-20260831/.venv/bin/python')
    parser.add_argument('--reuse-audio', action='store_true')
    parser.add_argument('--validate-only', action='store_true')
    parser.add_argument('--audio-only', action='store_true')
    parser.add_argument('--skip-video', action='store_true')
    args = parser.parse_args()
    try:
        build(args)
    except (ValueError, FileNotFoundError, subprocess.CalledProcessError) as error:
        print(f'Build refused: {error}', file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
